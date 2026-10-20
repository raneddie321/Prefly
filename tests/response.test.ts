import { describe, expect, it } from "vitest";
import { applyChanges, applyEdits, normalizePath, parseCoderResponse, streamingCode, streamingFile, streamingMessage } from "@/lib/ai/response";

describe("parseCoderResponse", () => {
  it("parses a full-file reply", () => {
    const r = parseCoderResponse("<message>\nHello!\n</message>\n<file>\n<!DOCTYPE html>\n<html></html>\n</file>");
    expect(r.message).toBe("Hello!");
    expect(r.file).toBe("<!DOCTYPE html>\n<html></html>");
    expect(r.edits).toEqual([]);
  });

  it("strips markdown fences inside <file>", () => {
    const r = parseCoderResponse("<message>x</message><file>\n```html\n<html></html>\n```\n</file>");
    expect(r.file).toBe("<html></html>");
  });

  it("parses edits and asset requests", () => {
    const text = `<message>Added a dragon</message>
<asset-request id="red dragon" width="96" height="2000">A red dragon</asset-request>
<edit>
<search>
  let speed = 1;
</search>
<replace>
  let speed = 2;
</replace>
</edit>
<edit><search>a</search><replace>b</replace></edit>`;
    const r = parseCoderResponse(text);
    expect(r.file).toBeNull();
    expect(r.edits).toEqual([
      { file: "index.html", search: "  let speed = 1;", replace: "  let speed = 2;" },
      { file: "index.html", search: "a", replace: "b" },
    ]);
    expect(r.assetRequests).toEqual([{ id: "red_dragon", width: 96, height: 1024, description: "A red dragon" }]);
  });

  it("accepts a bare HTML document without <file> tags", () => {
    const r = parseCoderResponse("<message>m</message>\n<!DOCTYPE html><html><body></body></html>");
    expect(r.file).toBe("<!DOCTYPE html><html><body></body></html>");
  });
});

describe("applyEdits", () => {
  const source = "function a() {\n    return 1;\n}\nfunction b() {\n    return 2;\n}";

  it("applies exact edits in order", () => {
    const { result, failed } = applyEdits(source, [
      { search: "return 1;", replace: "return 10;" },
      { search: "return 2;", replace: "return 20;" },
    ]);
    expect(failed).toEqual([]);
    expect(result).toContain("return 10;");
    expect(result).toContain("return 20;");
  });

  it("falls back to whitespace-insensitive line matching", () => {
    const { result, failed } = applyEdits(source, [{ search: "function b() {\n  return 2;\n}", replace: "function b() {\n    return 3;\n}" }]);
    expect(failed).toEqual([]);
    expect(result).toBe("function a() {\n    return 1;\n}\nfunction b() {\n    return 3;\n}");
  });

  it("reports edits that cannot be found", () => {
    const { result, failed } = applyEdits(source, [{ search: "nope()", replace: "x" }]);
    expect(result).toBe(source);
    expect(failed).toHaveLength(1);
  });
});

describe("streaming helpers", () => {
  it("extracts a partial message and the code after it", () => {
    expect(streamingMessage("<message>Building a ga")).toBe("Building a ga");
    expect(streamingMessage("<message>Done</mess")).toBe("Done");
    const text = "<message>Hi</message>\n<file>\n<!DOCTYPE html>\n<html>";
    expect(streamingCode(text)).toBe("// ===== index.html =====\n<!DOCTYPE html>\n<html>");
    expect(streamingFile('<message>x</message><file path="a.js">1</file><file path="js/b.js">2')).toBe("js/b.js");
  });
});

describe("multi-file replies", () => {
  it("parses files, per-file edits and deletes", () => {
    const r = parseCoderResponse(`<message>ok</message>
<file path="index.html">
<html></html>
</file>
<file path="./js/main.js">
import './player.js';
</file>
<file path="../evil.js">x</file>
<edit file="js/player.js"><search>a</search><replace>b</replace></edit>
<delete path="js/old.js"/>`);
    expect(Object.keys(r.files)).toEqual(["index.html", "js/main.js"]);
    expect(r.files["js/main.js"]).toBe("import './player.js';\n");
    expect(r.edits[0].file).toBe("js/player.js");
    expect(r.deletes).toEqual(["js/old.js"]);
  });

  it("applies changes across files and reports misses", () => {
    const current = { "index.html": "<html></html>", "js/player.js": "let a = 1;", "js/old.js": "x" };
    const out = applyChanges(current, {
      files: { "js/new.js": "new" },
      edits: [
        { file: "js/player.js", search: "let a = 1;", replace: "let a = 2;" },
        { file: "js/missing.js", search: "q", replace: "w" },
      ],
      deletes: ["js/old.js"],
    });
    expect(out.files).toEqual({ "index.html": "<html></html>", "js/player.js": "let a = 2;", "js/new.js": "new" });
    expect(out.failed).toHaveLength(1);
  });

  it("normalizes paths safely", () => {
    expect(normalizePath("./js//main.js")).toBe("js/main.js");
    expect(normalizePath("../x.js")).toBeNull();
    expect(normalizePath("js/a b.js")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { describeProblems, staticCheck } from "@/lib/ai/qa";

const wrap = (body: string, head = "") => `<!DOCTYPE html>\n<html>\n<head>${head}</head>\n<body>\n${body}\n</body>\n</html>`;

describe("staticCheck", () => {
  it("accepts a valid game", () => {
    const html = wrap(`<canvas id="c"></canvas>\n<script>\nconst c = document.getElementById('c');\nlet x = 0;\nfunction loop(){ x++; requestAnimationFrame(loop); }\nloop();\n</script>`);
    expect(staticCheck(html)).toEqual([]);
  });

  it("reports syntax errors with document line numbers", () => {
    const html = wrap(`<script>\nlet a = 1;\nlet b = ;\n</script>`);
    const issues = staticCheck(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/SyntaxError/);
    expect(issues[0].line).toBe(html.split("\n").findIndex((l) => l.includes("let b = ;")) + 1);
  });

  it("validates module imports against the import map", () => {
    const importMap = `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>`;
    const ok = wrap(`<script type="module">\nimport * as THREE from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\nawait Promise.resolve();\n</script>`, importMap);
    expect(staticCheck(ok)).toEqual([]);
    const bad = wrap(`<script type="module">\nimport { Howl } from 'howler';\n</script>`, importMap);
    expect(staticCheck(bad)[0].message).toMatch(/howler/);
  });

  it("flags truncated files, blocked dialogs and disallowed hosts", () => {
    expect(staticCheck("<!DOCTYPE html><html><body><script>let a = 1;").length).toBeGreaterThan(0);
    expect(staticCheck(wrap(`<script>alert('hi')</script>`))[0].message).toMatch(/alert/);
    expect(staticCheck(wrap(`<script>game.prompt('x'); function confirm(){}</script>`))).toEqual([]);
    expect(staticCheck(wrap(`<script src="https://evil.example.com/x.js"></script>`))[0].message).toMatch(/disallowed/);
  });
});

describe("describeProblems", () => {
  it("includes a code excerpt around the failing line", () => {
    const html = "a\nb\nc\nd\ne\nf\ng";
    const text = describeProblems(html, [{ kind: "error", message: "x is not defined", line: 4 }]);
    expect(text).toContain("[error] x is not defined (line 4)");
    expect(text).toContain(">     4 | d");
  });
});

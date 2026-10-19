import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { composeGame } from "@/lib/runtime/compose";
import { RUNTIME_SOURCE } from "@/lib/runtime/runtime-source";
import { normalizePlan, sanitizeSvg } from "@/lib/ai/agents";
import type { GamePlan } from "@/lib/types";

describe("composeGame", () => {
  const html = "<!DOCTYPE html>\n<html>\n<head>\n<title>x</title>\n</head>\n<body>\n<script>\nboom();\n</script>\n</body>\n</html>";

  it("injects the runtime without changing line numbers", () => {
    const out = composeGame(html, { gameId: "g1", assets: { hero: { id: "hero", width: 32, height: 32, description: "d", svg: "<svg></svg></script>" } } });
    expect(out.split("\n")).toHaveLength(html.split("\n").length);
    expect(out.split("\n").findIndex((l) => l.includes("boom()"))).toBe(html.split("\n").findIndex((l) => l.includes("boom()")));
    expect(out).toContain("window.__PREFLY_CONFIG__=");
    // No way to break out of the inline script from the assets JSON.
    expect(out.match(/<\/script>/g)?.length).toBe(2);
  });

  it("handles documents without a <head>", () => {
    expect(composeGame("<html><body></body></html>", { gameId: "g" })).toMatch(/^<html><head><script>/);
    expect(composeGame("<canvas></canvas>", { gameId: "g" })).toMatch(/^<script>/);
  });

  it("produces runtime code that parses as a single line", () => {
    const out = composeGame("<html><head></head></html>", { gameId: "g" });
    const script = /<script>([\s\S]*?)<\/script>/.exec(out)![1];
    expect(script).not.toContain("\n");
    expect(() => new vm.Script(script)).not.toThrow();
    expect(() => new vm.Script(RUNTIME_SOURCE)).not.toThrow();
  });
});

describe("sanitizeSvg", () => {
  it("removes scripts, handlers and external refs and sets the size", () => {
    expect(sanitizeSvg('<svg><script>alert(1)</script></svg>', 10, 10)).toBeNull();
    const out = sanitizeSvg('text before <svg width="5" viewBox="0 0 5 5" onload="x()"><rect onclick="y()" fill="url(#g)"/><a href="https://e.com">l</a></svg> after', 64, 48)!;
    expect(out.startsWith("<svg")).toBe(true);
    expect(out.endsWith("</svg>")).toBe(true);
    expect(out).not.toMatch(/onload|onclick|https:\/\/e\.com/);
    expect(out).toContain('width="64" height="48"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe("normalizePlan", () => {
  const plan = {
    title: "Fox Run",
    emoji: "🦊",
    palette: ["#ff8800", "not-a-color"],
    dimension: "3d",
    multiplayer: false,
    sprites: [
      { id: "Fox Hero", description: "fox", width: 4000, height: 64 },
      { id: "Fox_Hero", description: "dup", width: 64, height: 64 },
    ],
  } as unknown as GamePlan;

  it("respects the requested mode and cleans sprites and palette", () => {
    const p = normalizePlan(plan, "2d", true);
    expect(p.dimension).toBe("2d");
    expect(p.multiplayer).toBe(true);
    expect(p.palette).toEqual(["#6d5dfc", "#a78bfa"]);
    expect(p.sprites).toEqual([{ id: "Fox_Hero", description: "fox", width: 1024, height: 64 }]);
  });
});

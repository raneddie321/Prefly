import { describe, expect, it } from "vitest";
import { bundleProject, MODULE_PREFIX, resolvePath } from "@/lib/runtime/bundle";
import { checkProject } from "@/lib/ai/qa";

const files = {
  "index.html": '<!DOCTYPE html>\n<html>\n<head>\n<link rel="stylesheet" href="css/style.css">\n<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>\n</head>\n<body>\n<script type="module" src="js/main.js"></script>\n</body>\n</html>',
  "css/style.css": "body {\n  margin: 0;\n}\n",
  "js/main.js": "import * as THREE from 'three';\nimport { Player } from './entities/player.js';\nnew Player(THREE);\n",
  "js/entities/player.js": "import { clamp } from '../utils.js';\nexport class Player { constructor() { this.x = clamp(1); } }\n",
  "js/utils.js": "export const clamp = (v) => Math.max(0, v);\n",
};

describe("bundleProject", () => {
  it("resolves paths", () => {
    expect(resolvePath("js/entities/player.js", "../utils.js")).toBe("js/utils.js");
    expect(resolvePath("index.html", "./js/main.js")).toBe("js/main.js");
    expect(resolvePath("index.html", "../x.js")).toBeNull();
  });

  it("inlines CSS, maps modules through one merged import map and keeps line count", () => {
    const { html, issues } = bundleProject(files);
    expect(issues).toEqual([]);
    expect(html.split("\n")).toHaveLength(files["index.html"].split("\n").length);
    expect(html).toContain("<style>body { margin: 0; }");
    const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(html)![1]);
    expect(map.imports.three).toContain("three.module.js");
    expect(Object.keys(map.imports)).toContain(`${MODULE_PREFIX}js/utils.js`);
    const player = Buffer.from(map.imports[`${MODULE_PREFIX}js/entities/player.js`].split(",")[1], "base64").toString();
    expect(player).toContain(`from '${MODULE_PREFIX}js/utils.js'`);
    expect(player).toContain(`//# sourceURL=${MODULE_PREFIX}js/entities/player.js`);
    expect(html).toMatch(/<script type="module" src="data:text\/javascript;base64,/);
  });

  it("leaves single-file games untouched and reports broken references", () => {
    expect(bundleProject({ "index.html": "<html>x</html>" }).html).toBe("<html>x</html>");
    const broken = bundleProject({ ...files, "js/main.js": "import './nope.js';" });
    expect(broken.issues[0].message).toMatch(/nope\.js/);
  });

  it("static QA checks every file", () => {
    expect(checkProject(files)).toEqual([]);
    const issues = checkProject({ ...files, "js/utils.js": "export const = 1;" });
    expect(issues[0]).toMatchObject({ file: "js/utils.js", line: 1 });
  });
});

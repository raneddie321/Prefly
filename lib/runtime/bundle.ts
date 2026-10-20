/**
 * Turns a multi-file game project into one playable HTML document.
 *
 * - JS files become data: URLs. Relative imports between them are rewritten to
 *   "prefly:///<path>" specifiers, which an import map resolves to those data
 *   URLs. Every module ends with `//# sourceURL=prefly:///<path>`, so runtime
 *   errors can be traced back to the original file and line.
 * - Stylesheets linked from index.html are inlined (collapsed to one line, so
 *   index.html keeps its line numbers).
 * - Bare imports such as "three" keep working through the project's own import
 *   map, which is merged with the generated one.
 */

export type FileMap = Record<string, string>;

export interface BundleIssue {
  file?: string;
  line?: number;
  message: string;
}

export const MODULE_PREFIX = "prefly:///";

function base64(text: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

/** Resolves a relative or root-relative reference against the referring file. */
export function resolvePath(from: string, ref: string): string | null {
  const clean = ref.split(/[?#]/)[0];
  const joined = clean.startsWith("/") ? clean.slice(1) : dirname(from) + clean;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

const isLocalRef = (ref: string) => !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) && !ref.startsWith("#");
const isRelativeSpecifier = (s: string) => s.startsWith("./") || s.startsWith("../") || s.startsWith("/");

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Rewrites relative module specifiers in `code` (belonging to `file`) to prefly:/// specifiers. */
function rewriteImports(code: string, file: string, files: FileMap, issues: BundleIssue[]): string {
  const re = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2/g;
  return code.replace(re, (match, lead: string, quote: string, spec: string, offset: number) => {
    if (!isRelativeSpecifier(spec)) return match;
    const target = resolvePath(file, spec);
    if (!target || !(target in files)) {
      issues.push({ file, line: lineOf(code, offset), message: `Import "${spec}" points to a file that doesn't exist in the project.` });
      return match;
    }
    return `${lead}${quote}${MODULE_PREFIX}${target}${quote}`;
  });
}

export function isJsPath(path: string): boolean {
  return /\.(m?js)$/i.test(path);
}

export function bundleProject(files: FileMap): { html: string; issues: BundleIssue[] } {
  const issues: BundleIssue[] = [];
  let html = files["index.html"];
  if (html === undefined) return { html: "", issues: [{ message: "The project has no index.html." }] };
  const paths = Object.keys(files);
  if (paths.length === 1) return { html, issues };

  const moduleUrls: Record<string, string> = {};
  for (const path of paths.filter(isJsPath)) {
    const code = rewriteImports(files[path], path, files, issues);
    moduleUrls[path] = `data:text/javascript;base64,${base64(`${code}\n//# sourceURL=${MODULE_PREFIX}${path}\n`)}`;
  }

  // Stylesheets -> inline <style>, kept on one line.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !isLocalRef(href)) return tag;
    const path = resolvePath("index.html", href);
    if (!path || !(path in files)) {
      issues.push({ file: "index.html", message: `Stylesheet "${href}" doesn't exist in the project.` });
      return "";
    }
    return `<style>${files[path].replace(/<\/style/gi, "<\\/style").replace(/\s*\n\s*/g, " ")}</style>`;
  });

  // <script src="local.js"> -> data URL; inline module scripts get their imports rewritten.
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs: string, body: string) => {
    if (/\btype\s*=\s*["']?importmap/i.test(attrs)) return whole;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (src && isLocalRef(src)) {
      const path = resolvePath("index.html", src);
      if (!path || !(path in files)) {
        issues.push({ file: "index.html", message: `Script "${src}" doesn't exist in the project.` });
        return "";
      }
      const url = moduleUrls[path] ?? `data:text/javascript;base64,${base64(files[path])}`;
      return `<script${attrs.replace(/\bsrc\s*=\s*["'][^"']+["']/i, `src="${url}"`)}></script>`;
    }
    if (/\btype\s*=\s*["']?module/i.test(attrs) && body.trim()) {
      return `<script${attrs}>${rewriteImports(body, "index.html", files, issues)}</script>`;
    }
    return whole;
  });

  // Merge our module map into the project's import map (only one map is reliably supported).
  const imports: Record<string, string> = {};
  for (const [path, url] of Object.entries(moduleUrls)) imports[MODULE_PREFIX + path] = url;
  const mapRe = /<script\b[^>]*type\s*=\s*["']?importmap["']?[^>]*>([\s\S]*?)<\/script\s*>/i;
  const existing = mapRe.exec(html);
  if (existing) {
    let parsed: { imports?: Record<string, string>; scopes?: unknown } = {};
    try {
      parsed = JSON.parse(existing[1]);
    } catch {
      issues.push({ file: "index.html", message: "The import map is not valid JSON." });
    }
    const merged = JSON.stringify({ ...parsed, imports: { ...(parsed.imports ?? {}), ...imports } });
    html = html.replace(mapRe, () => `<script type="importmap">${merged}</script>`);
  } else if (Object.keys(imports).length) {
    const tag = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
    const firstModule = /<script\b[^>]*type\s*=\s*["']?module/i.exec(html);
    const headEnd = /<\/head>/i.exec(html);
    const at = firstModule && (!headEnd || firstModule.index < headEnd.index) ? firstModule.index : headEnd ? headEnd.index : firstModule?.index ?? 0;
    html = html.slice(0, at) + tag + html.slice(at);
  }

  for (const path of paths) {
    if (path === "index.html" || isJsPath(path) || /\.css$/i.test(path)) continue;
    if (!/\.(json|md|txt)$/i.test(path)) issues.push({ file: path, message: `Unsupported file type "${path}" — only .html, .js and .css files are bundled.` });
  }
  return { html, issues };
}

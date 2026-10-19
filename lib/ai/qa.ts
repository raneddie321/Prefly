import { parse, type Node } from "acorn";
import type { RuntimeError } from "@/lib/types";

/**
 * Static QA for generated games: parses every inline script, validates the
 * import map and module imports, and checks for common structural problems.
 * Runtime QA happens in the browser (see components/studio/game-tester).
 */

export interface QaIssue {
  message: string;
  line?: number;
}

const ALLOWED_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"];

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function hostAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export function staticCheck(html: string): QaIssue[] {
  const issues: QaIssue[] = [];
  if (!html.trim()) return [{ message: "The game file is empty." }];
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    issues.push({ message: "The file is not a complete HTML document (missing <html> or </html>); it may be truncated." });
  }

  const opens = (html.match(/<script\b/gi) ?? []).length;
  const closes = (html.match(/<\/script\s*>/gi) ?? []).length;
  if (opens !== closes) {
    issues.push({ message: `Unbalanced <script> tags (${opens} opening, ${closes} closing); the file may be truncated.` });
  }

  let importMap: Record<string, string> = {};
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const scripts: { attrs: string; code: string; line: number }[] = [];
  for (const m of html.matchAll(scriptRe)) {
    const codeStart = (m.index ?? 0) + m[0].indexOf(">") + 1;
    scripts.push({ attrs: m[1], code: m[2], line: lineAt(html, codeStart) });
  }

  for (const s of scripts) {
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(s.attrs)?.[1]?.toLowerCase();
    if (type === "importmap") {
      try {
        const parsed = JSON.parse(s.code) as { imports?: Record<string, string> };
        importMap = parsed.imports ?? {};
        for (const [key, url] of Object.entries(importMap)) {
          if (!hostAllowed(url)) issues.push({ message: `Import map entry "${key}" points to a disallowed URL: ${url}`, line: s.line });
        }
      } catch {
        issues.push({ message: "The import map is not valid JSON.", line: s.line });
      }
    }
  }

  for (const s of scripts) {
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(s.attrs)?.[1]?.toLowerCase();
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(s.attrs)?.[1];
    if (src) {
      if (!hostAllowed(src)) issues.push({ message: `External script from a disallowed location: ${src}`, line: s.line });
      continue;
    }
    const isModule = type === "module";
    if (type && !isModule && !["text/javascript", "application/javascript", "javascript"].includes(type)) continue;
    if (!s.code.trim()) continue;

    let ast: Node;
    try {
      ast = parse(s.code, {
        ecmaVersion: "latest",
        sourceType: isModule ? "module" : "script",
        locations: true,
      });
    } catch (err) {
      const e = err as SyntaxError & { loc?: { line: number; column: number } };
      const line = e.loc ? s.line + e.loc.line - 1 : s.line;
      issues.push({ message: `SyntaxError: ${e.message.replace(/\s*\(\d+:\d+\)$/, "")}`, line });
      continue;
    }

    if (isModule) {
      for (const node of (ast as unknown as { body: Array<Node & { source?: { value: unknown }; loc?: { start: { line: number } } }> }).body) {
        if (node.type !== "ImportDeclaration" && node.type !== "ExportNamedDeclaration" && node.type !== "ExportAllDeclaration") continue;
        const spec = node.source?.value;
        if (typeof spec !== "string") continue;
        const line = node.loc ? s.line + node.loc.start.line - 1 : s.line;
        if (/^https?:\/\//.test(spec)) {
          if (!hostAllowed(spec)) issues.push({ message: `Import from a disallowed URL: ${spec}`, line });
          continue;
        }
        if (spec.startsWith(".") || spec.startsWith("/")) {
          issues.push({ message: `Relative import "${spec}" cannot work in a single-file game.`, line });
          continue;
        }
        const mapped = spec in importMap || Object.keys(importMap).some((k) => k.endsWith("/") && spec.startsWith(k));
        if (!mapped) issues.push({ message: `Bare module specifier "${spec}" is not defined in the import map.`, line });
      }
    }
  }

  if (/(?<![.\w$]|function\s)(alert|confirm|prompt)\s*\(|window\.(alert|confirm|prompt)\s*\(/.test(stripStringsAndComments(html))) {
    issues.push({ message: "Uses alert/confirm/prompt, which are blocked in the game sandbox. Replace with in-game UI." });
  }
  return issues;
}

/** Very rough removal of quoted strings and comments for heuristics. */
function stripStringsAndComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, '""');
}

/** Formats issues or runtime errors with surrounding code for the fixer agent. */
export function describeProblems(html: string, problems: (QaIssue | RuntimeError)[]): string {
  const lines = html.split("\n");
  return problems
    .slice(0, 12)
    .map((p, i) => {
      const head = `${i + 1}. ${"kind" in p ? `[${p.kind}] ` : ""}${p.message}${p.line ? ` (line ${p.line})` : ""}`;
      const stack = "stack" in p && p.stack ? `\n   stack: ${p.stack.split("\n").slice(0, 4).join(" | ")}` : "";
      if (!p.line || p.line > lines.length) return head + stack;
      const from = Math.max(1, p.line - 3);
      const to = Math.min(lines.length, p.line + 3);
      const excerpt = lines
        .slice(from - 1, to)
        .map((l, k) => `${from + k === p.line ? ">" : " "} ${String(from + k).padStart(5)} | ${l}`)
        .join("\n");
      return `${head}${stack}\n${excerpt}`;
    })
    .join("\n\n");
}

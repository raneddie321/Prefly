/**
 * Parsing of the coder agent's tagged output:
 *
 *   <message>…</message>
 *   <file path="js/game.js">…</file>          whole files (create or replace)
 *   <edit file="js/game.js"><search>…</search><replace>…</replace></edit>
 *   <delete path="js/old.js"/>
 *   <asset-request id="…" width="…" height="…">description</asset-request>
 *
 * A <file> or <edit> without a path refers to index.html.
 */

export type FileMap = Record<string, string>;

export interface Edit {
  file?: string;
  search: string;
  replace: string;
}

export interface AssetRequest {
  id: string;
  width: number;
  height: number;
  description: string;
}

export interface CoderResponse {
  message: string;
  /** Whole files written in this reply. */
  files: FileMap;
  /** Legacy single-file view: the index.html written in this reply, if any. */
  file: string | null;
  edits: Edit[];
  deletes: string[];
  assetRequests: AssetRequest[];
}

/** Normalizes a project path: relative, forward slashes, no "..". */
export function normalizePath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.trim().replace(/\\/g, "/").replace(/^\.?\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  const out = parts.join("/");
  return /^[\w.\-/]+$/.test(out) && out.length <= 120 ? out : null;
}

/** Drops exactly one leading and one trailing newline that wraps tag content. */
function unwrap(text: string): string {
  return text.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return fenced ? fenced[1] : text;
}

export function parseCoderResponse(text: string): CoderResponse {
  const message = /<message>([\s\S]*?)<\/message>/.exec(text)?.[1].trim() ?? "";

  const files: FileMap = {};
  for (const m of text.matchAll(/<file(?:\s+path="([^"]*)")?\s*>([\s\S]*?)<\/file>/g)) {
    const path = normalizePath(m[1] ?? "index.html");
    if (path) files[path] = stripFences(unwrap(m[2])).replace(/^\s*\n/, "").replace(/\s+$/, "") + "\n";
  }
  if (!Object.keys(files).length && !/<edit[\s>]/.test(text)) {
    // Tolerate a missing <file> wrapper when the reply is a bare HTML document.
    const doc = /<!DOCTYPE html[\s\S]*<\/html>/i.exec(text);
    if (doc) files["index.html"] = doc[0];
  }

  const edits: Edit[] = [];
  const editRe = /<edit(?:\s+file="([^"]*)")?\s*>\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>\s*<\/edit>/g;
  for (const m of text.matchAll(editRe)) {
    edits.push({ file: normalizePath(m[1] ?? "index.html") ?? "index.html", search: unwrap(m[2]), replace: unwrap(m[3]) });
  }

  const deletes: string[] = [];
  for (const m of text.matchAll(/<delete\s+path="([^"]*)"\s*\/?>/g)) {
    const path = normalizePath(m[1]);
    if (path && path !== "index.html") deletes.push(path);
  }

  const assetRequests: AssetRequest[] = [];
  const reqRe = /<asset-request\s+([^>]*)>([\s\S]*?)<\/asset-request>/g;
  for (const m of text.matchAll(reqRe)) {
    const attrs = parseAttributes(m[1]);
    const id = sanitizeAssetId(attrs.id ?? "");
    if (!id) continue;
    assetRequests.push({
      id,
      width: clampSize(Number(attrs.width) || 64),
      height: clampSize(Number(attrs.height) || 64),
      description: m[2].trim(),
    });
  }

  const file = files["index.html"]?.replace(/\n$/, "") ?? null;
  return { message, files, file, edits, deletes, assetRequests };
}

export function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of source.matchAll(/([a-zA-Z_:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

export function sanitizeAssetId(id: string): string {
  return id.trim().replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
}

export function clampSize(n: number): number {
  return Math.max(8, Math.min(1024, Math.round(n)));
}

export interface ApplyResult {
  result: string;
  failed: Edit[];
}

/**
 * Applies search/replace edits in order. Falls back to a whitespace-tolerant
 * line match when the exact text is not found (models sometimes re-indent).
 */
export function applyEdits(source: string, edits: Edit[]): ApplyResult {
  let result = source;
  const failed: Edit[] = [];
  for (const edit of edits) {
    if (edit.search === "") {
      failed.push(edit);
      continue;
    }
    const index = result.indexOf(edit.search);
    if (index !== -1) {
      result = result.slice(0, index) + edit.replace + result.slice(index + edit.search.length);
      continue;
    }
    const fuzzy = fuzzyReplace(result, edit);
    if (fuzzy !== null) result = fuzzy;
    else failed.push(edit);
  }
  return { result, failed };
}

function fuzzyReplace(source: string, edit: Edit): string | null {
  const lines = source.split("\n");
  const needle = edit.search.split("\n").map((l) => l.trim());
  while (needle.length && needle[0] === "") needle.shift();
  while (needle.length && needle[needle.length - 1] === "") needle.pop();
  if (!needle.length) return null;

  const trimmed = lines.map((l) => l.trim());
  outer: for (let i = 0; i + needle.length <= lines.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (trimmed[i + j] !== needle[j]) continue outer;
    }
    return [...lines.slice(0, i), edit.replace, ...lines.slice(i + needle.length)].join("\n");
  }
  return null;
}

/** Applies a parsed reply to a project's files. Edits that don't match are reported. */
export function applyChanges(current: FileMap, reply: Pick<CoderResponse, "files" | "edits" | "deletes">): { files: FileMap; failed: Edit[] } {
  const files: FileMap = { ...current, ...reply.files };
  for (const path of reply.deletes) delete files[path];
  const failed: Edit[] = [];
  const byFile = new Map<string, Edit[]>();
  for (const e of reply.edits) {
    const path = e.file ?? "index.html";
    byFile.set(path, [...(byFile.get(path) ?? []), e]);
  }
  for (const [path, edits] of byFile) {
    if (!(path in files)) {
      failed.push(...edits);
      continue;
    }
    const applied = applyEdits(files[path], edits);
    files[path] = applied.result;
    failed.push(...applied.failed);
  }
  return { files, failed };
}

/** Extracts the user-facing message while the response is still streaming. */
export function streamingMessage(text: string): string {
  const start = text.indexOf("<message>");
  if (start === -1) return "";
  const rest = text.slice(start + "<message>".length);
  const end = rest.indexOf("</message>");
  return (end === -1 ? rest : rest.slice(0, end)).replace(/<\/?m?e?s?s?a?g?e?$/, "").trim();
}

/** The code part of a streaming response (everything after </message>). */
export function streamingCode(text: string): string {
  const end = text.indexOf("</message>");
  if (end === -1) return "";
  return text
    .slice(end + "</message>".length)
    .replace(/<file(\s+path="([^"]*)")?\s*>/g, (_m, _a, path) => `// ===== ${path ?? "index.html"} =====`)
    .replace(/<edit(\s+file="([^"]*)")?\s*>/g, (_m, _a, path) => `// ===== edit ${path ?? "index.html"} =====`)
    .replace(/<\/?(file|edit|search|replace)>/g, "")
    .replace(/^\s+/, "");
}

/** The file currently being written in a streaming response. */
export function streamingFile(text: string): string | null {
  const all = [...text.matchAll(/<(?:file|edit)(?:\s+(?:path|file)="([^"]*)")?\s*>/g)];
  const last = all.at(-1);
  return last ? (last[1] ?? "index.html") : null;
}

/**
 * Parsing of the coder agent's tagged output:
 *
 *   <message>…</message>
 *   <file>…</file>                       full file, or
 *   <edit><search>…</search><replace>…</replace></edit>   targeted edits
 *   <asset-request id="…" width="…" height="…">description</asset-request>
 */

export interface Edit {
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
  file: string | null;
  edits: Edit[];
  assetRequests: AssetRequest[];
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

  let file: string | null = null;
  const fileMatch = /<file>([\s\S]*?)<\/file>/.exec(text);
  if (fileMatch) {
    file = stripFences(unwrap(fileMatch[1])).trim();
  } else if (!/<edit>/.test(text)) {
    // Tolerate a missing <file> wrapper when the reply is a bare HTML document.
    const doc = /<!DOCTYPE html[\s\S]*<\/html>/i.exec(text);
    if (doc) file = doc[0];
  }

  const edits: Edit[] = [];
  const editRe = /<edit>\s*<search>([\s\S]*?)<\/search>\s*<replace>([\s\S]*?)<\/replace>\s*<\/edit>/g;
  for (const m of text.matchAll(editRe)) {
    edits.push({ search: unwrap(m[1]), replace: unwrap(m[2]) });
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

  return { message, file, edits, assetRequests };
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
    .replace(/<\/?(file|edit|search|replace)>/g, "")
    .replace(/^\s+/, "");
}

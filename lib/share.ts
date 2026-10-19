"use client";

/** Shares text with the native share sheet when available, otherwise copies it. */
export async function shareOrCopy(text: string, title?: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      await navigator.share({ text, title });
      return "shared";
    }
  } catch {
    // cancelled or unsupported; fall through to copy
  }
  return copyText(text);
}

export async function copyText(text: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok ? "copied" : "failed";
  }
}

export function playUrl(projectId: string): string {
  return `${window.location.origin}/play/${projectId}`;
}

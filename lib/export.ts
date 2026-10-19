"use client";

import JSZip from "jszip";
import { composeGame } from "@/lib/runtime/compose";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import type { AssetMap, Locale } from "@/lib/types";

export interface ExportableGame {
  id: string;
  title: string;
  emoji: string;
  palette: string[];
  description: string;
  html: string;
  assets: AssetMap;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug || "prefly-game";
}

function standalone(game: ExportableGame, locale: Locale): string {
  return composeGame(game.html, {
    gameId: game.id,
    assets: game.assets,
    locale,
    playUrl: `${window.location.origin}/play/${game.id}`,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_ANON_KEY,
  });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One self-contained HTML file: double-click to play on any computer or phone browser. */
export function downloadHtml(game: ExportableGame, locale: Locale) {
  saveBlob(new Blob([standalone(game, locale)], { type: "text/html;charset=utf-8" }), `${slugify(game.title)}.html`);
}

async function renderIcon(game: ExportableGame, size: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, game.palette[0] ?? "#6d5dfc");
  gradient.addColorStop(1, game.palette[1] ?? "#a78bfa");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${Math.round(size * 0.56)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(game.emoji || "🎮", size / 2, size * 0.54);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("icon"))), "image/png"));
}

const SERVICE_WORKER = `const CACHE = "prefly-game-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const cacheable = url.origin === location.origin || /(jsdelivr|unpkg|cdnjs)/.test(url.hostname);
  if (!cacheable || url.hostname.endsWith("supabase.co")) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok || res.type === "opaque") caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }),
    ),
  );
});
`;

/** A PWA package: installable on phones and desktops once hosted (itch.io, Netlify, GitHub Pages…). */
export async function downloadZip(game: ExportableGame, locale: Locale) {
  const zip = new JSZip();
  const head = [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="icon" href="icon-192.png">',
    '<link rel="apple-touch-icon" href="icon-192.png">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    `<meta name="theme-color" content="${game.palette[0] ?? "#6d5dfc"}">`,
    `<script>if("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js");</script>`,
  ].join("");
  let html = standalone(game, locale);
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${head}</head>`) : head + html;

  zip.file("index.html", html);
  zip.file(
    "manifest.webmanifest",
    JSON.stringify(
      {
        name: game.title,
        short_name: game.title.slice(0, 12),
        description: game.description,
        start_url: "./",
        scope: "./",
        display: "fullscreen",
        orientation: "any",
        background_color: "#000000",
        theme_color: game.palette[0] ?? "#6d5dfc",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      null,
      2,
    ),
  );
  zip.file("sw.js", SERVICE_WORKER);
  zip.file("icon-192.png", await renderIcon(game, 192));
  zip.file("icon-512.png", await renderIcon(game, 512));
  zip.file(
    "README.txt",
    [
      `${game.title} — made with Prefly`,
      "",
      "PC / Mac: double-click index.html to play in your browser.",
      "",
      "Phones & tablets (install as an app):",
      "1. Upload this folder (or the .zip) to any static host — itch.io (HTML game), Netlify Drop, GitHub Pages, Vercel…",
      "2. Open the link on your phone and choose “Add to Home Screen” / “Install app”.",
      "   The game then runs fullscreen and works offline after the first load.",
      "",
      "Online multiplayer (if the game has it) connects through Prefly's servers and needs an internet connection.",
    ].join("\n"),
  );
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  saveBlob(blob, `${slugify(game.title)}.zip`);
}

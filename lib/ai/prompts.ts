import type { AssetMap, GameMode, GamePlan, Locale } from "@/lib/types";

export function languageName(locale: Locale): string {
  return locale === "he" ? "Hebrew" : "English";
}

function languageRule(locale: Locale): string {
  return `${languageName(locale)} (the player's interface language). If the player clearly writes their request in another language, use that language instead.`;
}

// ---------------------------------------------------------------------------
// Game designer agent
// ---------------------------------------------------------------------------

export const DESIGNER_SYSTEM = `You are the lead game designer at Prefly, an AI game studio that turns a player's idea into a playable browser game in minutes.

Turn the player's idea into a tight, fun, buildable design document for a single-file HTML5 game. A strong engineer will implement it in roughly 600–1500 lines of JavaScript, and an illustrator will draw the 2D sprites you list as SVG.

Design principles:
- Find the fun: one clear core loop that feels good within 10 seconds, plus 2–4 mechanics that add depth. Prefer a polished small game over an ambitious broken one.
- It must be fully playable with keyboard on desktop AND touch on phones. Describe both control schemes concretely.
- Difficulty ramps up over time or across levels; there is always a score or goal, a fail/win state and instant restart.
- Respect the requested dimension. If the player asked for "auto", choose what fits the idea best (racing, flying, first-person and exploration ideas usually suit 3D; platformers, puzzles, shooters and arcade ideas usually suit 2D).
- Multiplayer: set multiplayer to true only when the player asks for multiplayer/online/friends/versus play. Multiplayer games are online, real-time rooms (2–8 players) joined by code or invite link, and must also offer a solo practice mode.
- Art direction: a cohesive, appealing look the engineer can render with code (Canvas 2D or three.js primitives) — name concrete shapes, colors, lighting, effects. The palette is 2–5 hex colors.
- Sprites: list the 2D images the illustrator should draw (0–8). Good sprites: the player character, enemies, collectibles, power-ups, key props. Don't list backgrounds, particles, UI or anything better drawn procedurally. For 3D games list 0–3 (e.g. HUD icons) — 3D models are built from geometry in code. Sprite ids are snake_case; sizes are the in-game draw size in CSS pixels (typically 32–128).
- Write all player-facing text fields (title, tagline, summary) in the language specified in the request.
- techNotes: brief implementation guidance for the engineer (state machine, collision approach, camera, spawning, performance tips, pitfalls to avoid).`;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "tagline", "emoji", "palette", "dimension", "multiplayer", "genre", "summary", "coreLoop",
    "controls", "mechanics", "progression", "artDirection", "audio", "sprites", "techNotes",
  ],
  properties: {
    title: { type: "string", description: "Short catchy game title (1–4 words)." },
    tagline: { type: "string", description: "One-line pitch shown on the game card." },
    emoji: { type: "string", description: "A single emoji that represents the game." },
    palette: { type: "array", items: { type: "string", description: "Hex color like #6d5dfc" } },
    dimension: { type: "string", enum: ["2d", "3d"] },
    multiplayer: { type: "boolean" },
    genre: { type: "string" },
    summary: { type: "string", description: "2–3 sentences describing the game for players." },
    coreLoop: { type: "string" },
    controls: {
      type: "object",
      additionalProperties: false,
      required: ["desktop", "touch"],
      properties: { desktop: { type: "string" }, touch: { type: "string" } },
    },
    mechanics: { type: "array", items: { type: "string" } },
    progression: { type: "string" },
    artDirection: { type: "string" },
    audio: { type: "string", description: "Which PREFLY.sfx effects to use for which events." },
    sprites: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "description", "width", "height"],
        properties: {
          id: { type: "string" },
          description: { type: "string", description: "Detailed visual description for the illustrator." },
          width: { type: "integer" },
          height: { type: "integer" },
        },
      },
    },
    techNotes: { type: "string" },
  },
} as const;

export function designerRequest(prompt: string, mode: GameMode, multiplayer: boolean, locale: Locale, hasImage: boolean): string {
  return [
    `Player's idea:\n"""\n${prompt}\n"""`,
    `Requested dimension: ${mode === "auto" ? "auto (you decide)" : mode.toUpperCase()}`,
    multiplayer ? "The player turned on online multiplayer." : "",
    hasImage ? "The player attached a reference image — use it as inspiration for the theme, characters and art style." : "",
    `Language for player-facing text: ${languageRule(locale)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Graphics agent
// ---------------------------------------------------------------------------

export const ARTIST_SYSTEM = `You are the illustrator at Prefly, an AI game studio. You draw game sprites as clean, self-contained SVG files that are rendered with drawImage() in a canvas game.

Rules for every SVG:
- Root element: <svg xmlns="http://www.w3.org/2000/svg" width="W" height="H" viewBox="0 0 W H"> using the requested size.
- No <script>, <foreignObject>, <image>, external hrefs, web fonts or CSS @import. No text unless the description asks for it.
- Transparent background (unless the asset is a tile or panel). Side-view characters face right. Keep ~6% padding so nothing is clipped.
- Style: polished modern game art — bold readable silhouettes, clean shapes, soft shading with gradients, subtle highlights and outlines, consistent lighting (from top-left) and a shared palette across all assets so they look like one game.
- Keep each SVG compact (under ~6 KB): reuse gradients via <defs>, round coordinates to 1 decimal.

Output one block per requested asset and nothing else:
<asset id="the_id">
<svg …>…</svg>
</asset>`;

export function artistRequest(plan: Pick<GamePlan, "title" | "artDirection" | "palette" | "dimension">, sprites: { id: string; description: string; width: number; height: number }[]): string {
  return [
    `Game: ${plan.title} (${plan.dimension.toUpperCase()})`,
    `Art direction: ${plan.artDirection}`,
    `Palette: ${plan.palette.join(", ")}`,
    "Draw these assets:",
    ...sprites.map((s) => `- id="${s.id}" size ${s.width}x${s.height}: ${s.description}`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Coder agent (also used for edits and QA fixes)
// ---------------------------------------------------------------------------

const ENGINEERING_STANDARD = `# Runtime environment
- The game runs in a sandboxed iframe (scripts allowed, unique origin) on desktop and mobile, in any aspect ratio, on high-DPI screens.
- Network: only these CDNs may be used — cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com. Never fetch other URLs. Never reference external images, fonts, audio or 3D model files: every visual is drawn with code (Canvas 2D, three.js geometry/materials, CSS, inline SVG) or comes from PREFLY.images; every sound comes from PREFLY.sfx or WebAudio.
- alert/confirm/prompt are blocked — build all UI in HTML or on the canvas.
- localStorage works and is persisted by Prefly (wrap access in try/catch anyway).

# The Prefly runtime (loaded before your code as the global PREFLY)
- PREFLY.ready — Promise that resolves when all image assets are decoded. Start the game after it: PREFLY.ready.then(init).
- PREFLY.images[id] — decoded HTMLImageElement for each art asset listed below. 2D: ctx.drawImage(PREFLY.images.player, x, y, w, h). three.js: const tex = new THREE.Texture(PREFLY.images.coin); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace. Only use ids from the asset list.
- PREFLY.sfx(name, volume = 1) — synthesized sound effects: 'jump', 'coin', 'hit', 'explosion', 'shoot', 'powerup', 'click', 'win', 'lose', 'step'. Safe to call any time; audio unlocks on the first user gesture. You may also add your own WebAudio music/sounds.
- PREFLY.share(text) — opens the host's share sheet (e.g. "I scored 1200 in <game>!").
- PREFLY.locale — 'en' or 'he'.

# Engineering standard
- Structure: <!DOCTYPE html>, <html lang dir>, <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">, <title>, one <style>, markup, scripts. CSS: html,body{margin:0;height:100%;overflow:hidden;background:…;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}.
- Canvas sizing: fill the viewport; backing store = CSS size × min(devicePixelRatio, 2); handle resize. Use a logical coordinate system / camera so the game is fully playable in both portrait phones and landscape monitors (UI and play area adapt; nothing important off-screen).
- Loop: requestAnimationFrame with delta time clamped to ≤ 1/30 s so speed is frame-rate independent. Auto-pause when document.hidden.
- Game states: title screen (name, one-line goal, controls for keyboard AND touch, big Play button) → playing → paused (P/Escape and an on-screen pause button) → game over / victory (score, best score saved in localStorage, Restart button; Enter/Space also restarts). Restart fully resets state without reloading.
- Input: keyboard (Arrow keys and WASD, Space, Enter) with preventDefault on game keys, plus touch. On touch devices ('ontouchstart' in window || navigator.maxTouchPoints > 0) show on-screen controls that suit the game (virtual joystick/d-pad, action buttons, tap or swipe) using pointer events with pointer capture; support multi-touch where needed (e.g. steer + accelerate). Mouse where it makes sense.
- 2D: Canvas 2D, no libraries needed. Make it look and feel great: gradients, parallax layers, particles, screen shake, squash & stretch, easing, hit flashes, floating score text.
- 3D: three.js r170 via exactly this import map, then a <script type="module"> with import * as THREE from 'three' (addons from 'three/addons/…'):
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  Only use APIs that exist in r170. Good lighting (hemisphere + directional with soft shadows on a few key objects), fog, a smooth follow camera, and lightweight geometry (aim < 150 draw calls; reuse geometries/materials; InstancedMesh for repeated props) so it runs on phones. Build characters/vehicles from grouped primitives with care — they should look intentional and charming.
- Feel: every important action gets feedback (particles + sound + motion). Readable HUD (score, lives/health, level/time). Difficulty ramps up.
- Correctness: no undefined variables, no temporal-dead-zone access, null-check DOM lookups, no infinite loops, no errors in the console. Every feature in the design must actually work. Before finishing, trace title → play → lose/win → restart in your head and fix anything that would break.`;

const MULTIPLAYER_GUIDE = `# Online multiplayer (PREFLY.multiplayer)
Real-time rooms over the internet; players on different devices join with a room code or an invite link.
- await PREFLY.multiplayer.createRoom({ name, maxPlayers }) → a new room with a random 5-letter code.
- await PREFLY.multiplayer.joinRoom(code, { name, maxPlayers }) → joins a room; rejects with an Error (e.g. "Room is full") — show the message in the UI.
- PREFLY.multiplayer.defaultRoom — room code from the invite link the player opened, or null. When set, skip the lobby menu and join it right away (ask only for a name).
- room.code, room.playerId (me), room.players ([{ id, name, joinedAt }] in join order), room.isHost (true for the earliest player; moves automatically when the host leaves), room.hostId, room.inviteUrl (may be empty)
- room.send(type, data) — broadcast a small JSON-serializable message to the other players (not echoed back to you). Send continuous state at most ~12 times per second and interpolate remote entities smoothly; send discrete events (hit, pickup, round start) immediately.
- room.on('message', ({ from, type, data }) => …), room.on('join', player => …), room.on('leave', player => …), room.on('players', list => …), room.leave()
Architecture: the host is authoritative for shared state (spawns, pickups, scores, timer, round start/end, winner) and broadcasts snapshots; each client simulates its own avatar locally and sends its position/inputs. Handle host migration (when isHost becomes true mid-game, take over). Remove avatars of players who leave.
Lobby: name field; "Create room" (then show the code large, an "Invite friends" button calling PREFLY.share(room.inviteUrl || room.code), the live player list, and a Start button for the host); "Join room" with a code field; and "Practice solo" (vs. bots or single-player) so the game is fun alone too.`;

export function coderSystem(locale: Locale, multiplayer: boolean): string {
  return [
    "You are the lead game engineer at Prefly, an AI game studio. You build complete, polished, bug-free browser games as a single self-contained HTML file, working from the design document and art assets your team prepared.",
    ENGINEERING_STANDARD,
    multiplayer ? MULTIPLAYER_GUIDE : "",
    `# Language\nAll in-game text in ${languageRule(locale)} For Hebrew, set dir="rtl" on HTML UI and ctx.direction = 'rtl' for canvas text, but don't mirror the game world.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function assetList(assets: { id: string; width: number; height: number; description: string }[]): string {
  if (!assets.length) return "No image assets — draw everything with code.";
  return assets.map((a) => `- PREFLY.images.${a.id} (${a.width}x${a.height}): ${a.description}`).join("\n");
}

export function createRequest(prompt: string, plan: GamePlan, locale: Locale): string {
  return `Build this game.

# Player's request
"""
${prompt}
"""

# Design document
${JSON.stringify({ ...plan, sprites: undefined }, null, 2)}

# Art assets (being drawn by the illustrator; available via PREFLY.images)
${assetList(plan.sprites)}

# Response format
Reply with exactly these two parts and nothing else (no markdown fences):
<message>
2–4 short, friendly sentences to the player in ${languageName(locale)}: what you built and how to play (mention desktop and touch controls). No code.
</message>
<file>
<!DOCTYPE html>
…the complete game…
</file>`;
}

export const EDIT_FORMAT = `# Response format
Start with:
<message>
1–3 short sentences to the player describing what you changed (in the player's language). No code.
</message>
Then EITHER targeted edits (preferred for small and medium changes):
<edit>
<search>
exact, contiguous lines copied from the current file — enough to be unique (usually 3–15 lines)
</search>
<replace>
the replacement lines
</replace>
</edit>
…one <edit> block per change, in file order, non-overlapping…
OR, when the change touches most of the file, the complete new file:
<file>
<!DOCTYPE html>
…
</file>

To get new 2D art from the illustrator, add (before your edits):
<asset-request id="snake_case_id" width="64" height="64">detailed visual description</asset-request>
It will be available as PREFLY.images.snake_case_id. Requesting an existing id redraws it.

Rules: search text must match the current file exactly, including indentation. Change only what is needed for the request and keep every other feature working. No markdown fences.`;

export interface EditContext {
  html: string;
  plan: GamePlan | null;
  assets: AssetMap;
  history: { role: "user" | "assistant"; content: string }[];
}

function editContextBlock(ctx: EditContext): string {
  const meta = Object.values(ctx.assets).map(({ id, width, height, description }) => ({ id, width, height, description }));
  const history = ctx.history.length
    ? ctx.history.map((m) => `${m.role === "user" ? "Player" : "Prefly"}: ${m.content}`).join("\n")
    : "(none)";
  return `# Design document
${ctx.plan ? JSON.stringify({ ...ctx.plan, sprites: undefined }, null, 2) : "(not available)"}

# Art assets (PREFLY.images)
${assetList(meta)}

# Conversation so far
${history}

# Current game file
<current-file>
${ctx.html}
</current-file>`;
}

export function editRequest(ctx: EditContext, instruction: string): string {
  return `${editContextBlock(ctx)}

# The player's new request
"""
${instruction}
"""

Update the game to fulfil the request. If it's a question rather than a change request, answer it in <message> and make no edits.

${EDIT_FORMAT}`;
}

export function fixRequest(ctx: EditContext, problems: string, source: "static" | "runtime"): string {
  const intro =
    source === "static"
      ? "You are the QA engineer at Prefly. Automated static checks found these problems in the game file:"
      : "You are the QA engineer at Prefly. An automated play-test of the game in a real browser (it pressed Play, then sent keyboard and pointer input for a few seconds) reported these errors:";
  return `${editContextBlock(ctx)}

# QA report
${intro}

${problems}

Find the root cause of each problem and fix it with minimal, safe edits. Also fix any closely related bug you notice on the way. Don't change gameplay or visuals otherwise. In <message>, briefly tell the player what you fixed (in the player's language).

${EDIT_FORMAT}`;
}

export function editFallbackRequest(failed: number): string {
  return `${failed} of your <search> blocks did not match the current file exactly, so no edits were applied. Reply again with the <message> and the COMPLETE updated file in <file>…</file> (no <edit> blocks).`;
}

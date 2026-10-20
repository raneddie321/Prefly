# Prefly — create games with AI

Prefly is a ChatGPT-style web app where anyone can make 2D, 3D and online multiplayer games by chatting with AI — no coding. Describe a game, watch a team of AI agents design, draw, code and play-test it, then play it instantly, keep improving it through chat, publish it, share a link, or download it for PC and mobile.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase · the Anthropic API (Claude)**.

## Features

- **Text → playable game.** A prompt (plus an optional reference image) becomes a complete single-file HTML5 game with title screen, scoring, game over and restart.
- **AI agent team**
  - *Game designer* — turns the idea into a structured design document (mechanics, controls for keyboard **and** touch, art direction, palette, sprite list).
  - *Illustrator* — draws the game's sprites as SVG, in parallel with the engineer.
  - *Game engineer* — writes the game (Canvas 2D, or three.js for 3D), streaming its code and reasoning live into the studio.
  - *QA tester* — static checks (parses every script, validates imports) **and** a real play-test in a hidden sandboxed browser frame that presses Play and sends keyboard/pointer input. Errors go back to the engineer for automatic fixes (up to 2 rounds), with a "Fix with AI" button for anything found later.
- **Edit through chat.** Ask for changes ("add a double jump", "make it night time"); the engineer applies targeted edits and can ask the illustrator for new art.
- **Live preview** with a Play button, restart, fullscreen, desktop/phone frame and a code view.
- **Online multiplayer** over Supabase Realtime: rooms with codes and invite links, presence, host election and host migration.
- **Save, publish, share, download.** Every change is a saved version you can restore. Publish to get a public `/play/<id>` link and appear in Community (with play counts and remixing). Download a single HTML file (PC/Mac/mobile browsers) or an installable PWA `.zip` (itch.io, Netlify, GitHub Pages…).
- **Accounts & history.** Guests get an anonymous account automatically; add an email later to keep everything. Email/password and Google sign-in. Recent projects in the sidebar, "My Games", per-project chat history.
- **English and Hebrew** with full RTL layout; games are written in the player's language.
- **Daily quota** per user (guest / registered) enforced in the database.

## Zero-config demo mode

Prefly runs with **no environment variables at all**:

- **Without Supabase**, games, chat history and versions are stored in the browser's localStorage (per device). Publishing and online multiplayer are unavailable; downloading works.
- **Without `ANTHROPIC_API_KEY`**, "create a game" picks a playable built-in game that fits the prompt (2D platformer, space shooter or 3D racer), and chat edits explain that AI needs a key. Community always lists the built-in demos.

Add the keys below whenever you're ready — no code changes needed. Note: with an Anthropic key but no Supabase, the generation endpoint has no login or quota, so anyone who finds the site can spend your API credits.

## Getting started

### 1. Install

```bash

npm install
cp .env.example .env.local
```

### 2. Supabase

**Hosted project** (recommended for production):

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `npx supabase@latest link` + `npx supabase@latest db push`).
3. *Authentication → Sign In / Providers*: enable **Anonymous sign-ins** (guest mode) and Email. Optionally enable Google.
4. *Authentication → URL Configuration*: set the Site URL to your domain and add `https://your-domain/**` (and `http://localhost:3000/**` for local dev) to the redirect URLs.
5. Put the project URL and anon key in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

**Local stack** (needs Docker): `npx supabase@latest start` applies the migration and prints the local URL and anon key. `supabase/config.toml` already enables anonymous sign-ins.

### 3. Anthropic

Set `ANTHROPIC_API_KEY` in `.env.local`. It is only used on the server.

Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used by all agents |
| `PREFLY_CODE_EFFORT` | `medium` | Engineer effort: `low` · `medium` · `high` · `xhigh` · `max` (higher = better games, slower) |
| `PREFLY_DESIGN_EFFORT` / `PREFLY_GRAPHICS_EFFORT` | `low` | Designer / illustrator effort |

Requests opt into server-side refusal fallback (`fallbacks: "default"`), so a policy decline is retried on Anthropic's recommended fallback model instead of failing.

### 4. Run

```bash
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run typecheck
npm run build && npm start
```

## Deploying

Deploy this repository to any Node host. On Vercel, add the environment variables. A full generation (design → art → code → QA) can take several minutes, so `/api/generate` sets `maxDuration = 300` (the Vercel Hobby maximum). On Vercel Pro raise it to 800 in `app/api/generate/route.ts`; on Hobby consider `PREFLY_CODE_EFFORT=low` so AI generations finish in time. If the browser disconnects, the server keeps going and still saves the game.

Daily generation limits live in the `consume_generation` SQL function (20/day for guests, 200/day for registered users) — edit and re-run it to change them.

## How it works

```
app/
  (app)/page.tsx            Home — prompt box, 2D/3D + multiplayer options, image upload
  (app)/project/[id]        Studio — chat, agent progress, live preview, code, versions, share, download
  (app)/games, community, settings
  play/[id]                 Full-screen public player (invite links: ?room=CODE)
  api/generate/route.ts     Streams the agent pipeline as NDJSON and saves results
lib/ai/
  agents.ts                 Designer (structured JSON output), illustrator (SVG), engineer (streaming)
  pipeline.ts               create / edit / fix orchestration, edit application, static QA loop
  prompts.ts                Agent prompts, engineering standard, multiplayer API docs
  qa.ts                     Static checks (acorn parse, import map validation…)
  response.ts               Tagged output parsing and search/replace edits
lib/runtime/
  runtime-source.ts         In-game runtime: PREFLY.images/sfx/share/multiplayer, error capture, storage, test mode
  compose.ts                Injects the runtime into a game without shifting line numbers
lib/generation-store.ts     Client store for streaming generations (survives navigation)
supabase/migrations/        Schema, row-level security, quota and play-count functions
```

Games run in a sandboxed `<iframe srcdoc>` without same-origin access, so generated code can never read Prefly's cookies or storage. The runtime talks to the page through `postMessage`: it reports errors to the QA agent, persists the game's `localStorage` (high scores), and asks the page to show the share sheet.

# Prefly — create games with AI

Prefly is a ChatGPT-style web app where anyone can make 2D, 3D and online multiplayer games by chatting with AI — no coding. Describe a game, watch a team of AI agents design, draw, code and play-test it, then play it instantly, keep improving it through chat, publish it, share a link, or download it for PC and mobile.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase · the Anthropic API (Claude)**.

## Features

- **Text → playable game.** A prompt (plus an optional reference image) becomes a complete game: title screen, scoring, game over and restart, keyboard **and** touch controls.
- **Real multi-file projects.** The engineer writes an organized codebase — `index.html`, `css/style.css` and 5–12 ES modules (`js/main.js`, `js/player.js`, `js/input.js`, …). The studio has a file tree and code viewer; Pro users can download the source.
- **AI agent team**
  - *Game designer* — structured design document (mechanics, controls, art direction, palette, sprite list).
  - *Illustrator* — draws the sprites as SVG, in parallel with the engineer.
  - *Game engineer* — writes the project (Canvas 2D, or three.js for 3D), streaming its code and reasoning live.
  - *QA tester* — parses every file and checks how they link together, then play-tests the game in a hidden browser frame (presses Play, sends keyboard/pointer input). Errors are traced back to the exact file and line and fixed automatically.
- **Choose the AI model:** Claude Haiku 5.5, Sonnet 5.5 (free), Opus 5.5 and Fable 5.1 (Pro).
- **Free and Pro plans** with daily limits enforced in the database, Stripe Checkout and the Stripe customer portal.
- **Edit through chat**, live preview with Play/restart/fullscreen/phone frame, version history with restore.
- **Online multiplayer** over Supabase Realtime (rooms, invite links, presence, host migration).
- **Publish & share** (`/play/<id>`, Community, remixing, play counts, WhatsApp/Telegram/X/Facebook), **download** as one HTML file, an installable PWA, or source.
- **Accounts** (guest → email, Google), **English and Hebrew** with RTL.

### Plans

| | Guest | Free | Pro |
|---|---|---|---|
| AI generations / day | 5 | 25 | 300 |
| Models | Haiku 5.5 | Haiku 5.5, Sonnet 5.5 | + Opus 5.5, Fable 5.1 |
| Downloads | HTML | HTML, app | HTML, app, source |
| Version history | 10 | 30 | 200 |

Limits live in `lib/plans.ts` and `supabase/migrations/0002_plans_and_files.sql`. To make someone Pro by hand:
`insert into public.user_plans (user_id, plan) values ('<user uuid>', 'pro') on conflict (user_id) do update set plan = 'pro';`

### How a generation runs

Each step is a separate request to `/api/generate`, driven by the browser, so no request has to fit a whole game into a serverless time limit (300 s on Vercel Hobby):

`design` → `graphics` ∥ `code` → `repair` (0–2 static QA rounds) → browser play-test → `code` with the runtime errors (0–2 auto-fix rounds).

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
2. Run `supabase/migrations/0001_init.sql` and then `0002_plans_and_files.sql` in the SQL editor (or `npx supabase@latest link` + `npx supabase@latest db push`).
3. *Authentication → Sign In / Providers*: enable **Anonymous sign-ins** (guest mode) and Email. Optionally enable Google.
4. *Authentication → URL Configuration*: set the Site URL to your domain and add `https://your-domain/**` (and `http://localhost:3000/**` for local dev) to the redirect URLs.
5. Put the project URL and anon key in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

**Local stack** (needs Docker): `npx supabase@latest start` applies the migrations and prints the local URL and anon key. `supabase/config.toml` already enables anonymous sign-ins.

### 3. Anthropic

Set `ANTHROPIC_API_KEY` in `.env.local`. It is only used on the server.

Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PREFLY_CODE_EFFORT` | `medium` | Engineer effort: `low` · `medium` · `high` · `xhigh` · `max` (higher = better games, slower) |
| `PREFLY_DESIGN_EFFORT` / `PREFLY_GRAPHICS_EFFORT` | `low` | Designer / illustrator effort |

Requests on Sonnet, Opus and Fable opt into server-side refusal fallback (`fallbacks: "default"`), so a policy decline is retried on Anthropic's recommended fallback model instead of failing.

### 4. Stripe (optional, for Pro)

Create a recurring price in Stripe, add a webhook endpoint `https://<your-site>/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.*`, then set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). Without them the pricing page shows "coming soon".

### 5. Run

```bash
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run typecheck
npm run build && npm start
```

## Deploying

Deploy this repository to any Node host. On Vercel, add the environment variables and redeploy (the `NEXT_PUBLIC_*` values are baked in at build time). Each generation step is its own request with `maxDuration = 300`, which fits the Vercel Hobby plan; a very large game on the slowest model can still approach that limit for the code step — `PREFLY_CODE_EFFORT=low` makes it faster.

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

# Nilgiris — Level Builder

A turn-based crossing-builder, built and playable entirely in the browser —
paint a level's terrain grid, then playtest it by spending cards to bridge
a chasm before forest-spawned disasters tear it back down. Next.js (App
Router) + TypeScript + Tailwind + Canvas. Access is gated by shared invite
codes for a small trusted playtest group.

## Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local: set ACCESS_CODES and SESSION_SECRET
npm run dev
```

Generate a secret: `openssl rand -hex 32`

Open http://localhost:3000 — you'll be bounced to `/login`, enter one of your
`ACCESS_CODES` values, and land in `/builder`.

## How access control works

This is intentionally lightweight — built for a small trusted playtest
group, not public signup:

- `ACCESS_CODES` in the environment is a comma-separated list of
  `CODE:DisplayName` pairs (e.g. `TESTER-ALPHA:Alice,TESTER-BRAVO:Bob`).
  Give each tester their own code so you can tell them apart in logs later.
- `POST /api/auth/login` checks the submitted code against that list and, on
  success, signs a JWT (HS256, via `jose`) containing the tester's display
  name and sets it as an `httpOnly`, `secure`, `sameSite=lax` cookie.
- `middleware.ts` runs on every request under `/builder/*`, verifies that
  cookie at the edge, and redirects to `/login` if it's missing or invalid.
- Sessions last 7 days (`SESSION_TTL_SECONDS` in `lib/auth.ts`).

**Rotate codes** by editing the env var and redeploying — no database
needed. If you outgrow this (need to revoke one tester without touching
others, or track who's actively testing), swap `verifyAccessCode` for a
lookup against Vercel KV / Upstash Redis / a Postgres table — the rest of
the auth flow doesn't change.

This is *not* hardened for public internet exposure at scale — no rate
limiting on login attempts yet. For a closed group of playtesters behind a
not-widely-shared URL, it's an appropriate amount of friction. If you want
more, add rate limiting via Upstash's `@upstash/ratelimit` in the login
route, or put the whole deployment behind Vercel's password protection /
an allowlist as a second layer.

## The game engine (in-browser, no external runtime)

Nilgiris runs entirely inside this app now — no Unreal Engine, no bridge,
no streaming. It's a turn-based crossing-builder: paint a level's terrain,
then playtest it by spending cards to bridge a chasm before disasters
spawned from the forest edges tear the bridge back down.

```
lib/game/
  types.ts        Tile, Card, LevelDefinition, GameState — the whole data model
  cards.ts        card definitions + the starter deck (add new cards here)
  disasters.ts    targeting logic for flash-flood / windstorm / rockslide
  engine.ts       pure functions: createInitialState, playCard, endTurn, hasCrossing
  levels.ts       sample levels + blankLevel() for the editor
components/game/
  LevelEditor.tsx grid-paint tool: choose a terrain brush, click/drag to paint
  GameBoard.tsx   canvas renderer + turn loop: hand of cards, End Turn, disaster flash
```

**Why the engine is separate from the rendering:** `lib/game/engine.ts` has
no React, no canvas, no DOM — every function takes a `GameState` and
returns a new one. That's what makes `hasCrossing` (the win-condition BFS)
and the disaster math independently testable, and it means you can swap
`GameBoard`'s canvas rendering for something fancier later (WebGL,
sprites, isometric) without touching game logic at all.

**Terrain types:** `ground` (passable), `chasm` (needs a bridge card),
`forestEdge` (impassable, and disasters spawn from here), `start`/`end`
(the two banks you're connecting). The Level Editor's palette maps
directly to these.

**Cards** (`lib/game/cards.ts`): Wooden Plank, Rope Bridge, Stone Slab,
Reinforced Beam (has armor), and Watchtower (ground-only, grants an armor
aura to neighbors). Extend this table to add more — nothing else needs to
change for a new card to show up in hands and be playable.

**Disasters** (`lib/game/disasters.ts`): each end-of-turn, one of
Flash Flood (hits structures near a random forest-edge tile), Windstorm
(light damage to 1–3 random structures anywhere), or Rockslide (heavy
damage along a line from a forest edge) fires. Armor from cards/auras
reduces incoming damage before health is spent.

**Win/loss:** win the instant a passable path connects `start` to `end`
(checked via `hasCrossing` after every disaster). Lose if 10 turns pass
without a connection (`MAX_TURNS` in `engine.ts`).

This is a genuinely small MVP on purpose — one grid, five cards, three
disaster types, no economy beyond per-turn Focus. It's built to be
extended (bigger deck, more disaster types, per-level Focus/turn budgets,
saving/loading levels to a database) once the core loop feels right.

## Deployment (Vercel)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project**, import the repo. Framework preset
   `Next.js` is auto-detected — no config changes needed.
3. Under **Environment Variables**, add `ACCESS_CODES` and `SESSION_SECRET`
   (same as your `.env.local`, but use a *different* `SESSION_SECRET` than
   local dev).
4. Deploy. Vercel gives you an HTTPS URL immediately
   (`your-project.vercel.app`) — that's already reachable from any device,
   which covers "anyone should be able to connect on any device."
5. Optional: attach a custom domain under **Settings → Domains**.

Notes specific to this app:
- `middleware.ts` runs on the Edge runtime by default, which is compatible
  with `jose` (used instead of `jsonwebtoken` specifically for this — the
  latter needs Node APIs middleware doesn't have).
- Everything — editor, engine, canvas rendering — runs client-side in the
  browser. There's no separate backend service to host, so Vercel's plain
  serverless/edge deployment is all you need; you won't hit the
  "long-running process" limitations that something like a game-streaming
  bridge would require.
- Vercel's free tier is fine for this — it's a low-traffic internal tool,
  not a public product.

## Project structure

```
app/
  login/              login page
  builder/            protected area (level list, Edit/Playtest tabs)
  api/auth/           login/logout route handlers
lib/
  auth.ts             session signing/verification, access code parsing
  game/                the engine — see "The game engine" above
components/
  game/
    LevelEditor.tsx   grid-paint terrain editor
    GameBoard.tsx     canvas playtest board (hand, turns, disasters)
  TopoBackground.tsx  decorative contour motif
  ui/                 Button, Input primitives
middleware.ts          protects /builder/* at the edge
```

## Next steps worth prioritizing

1. Persist levels: right now `updateSelectedLevel` in `app/builder/page.tsx`
   only lives in React state, so edits vanish on refresh. Simplest fix —
   serialize `LevelDefinition` to JSON and save/load via `localStorage` or
   a couple of API routes backed by Vercel KV; no schema migration needed
   since it's already plain JSON.
2. Let the editor place starting decks/resources per level, not just
   terrain — some levels might want a smaller deck or lower Focus for
   difficulty tuning.
3. Add more disaster types and cards once the core loop (bridge → disaster
   → bridge again) feels right in practice — the tables in `cards.ts` and
   `disasters.ts` are built for exactly that kind of extension.

# Nilgiris Webtest

A lightweight browser prototype for the Nilgiris core loop. This repo is for
testing card flow, Man-Hours, Preparation, column Budget Allocation, Overrun,
Forest Intents, room rewards, and the Crafting Space before systems move into
the Unreal project.

The prototype is intentionally simple: Next.js App Router, TypeScript,
Tailwind, in-memory state, and JSON content. There is no database.

## Local setup

```bash
npm install
cp .env.example .env.local
# edit .env.local: set ACCESS_CODES and SESSION_SECRET
npm run dev
```

Generate a secret: `openssl rand -hex 32`

Open http://localhost:3000. `/builder` is protected by the access-code login.

## Content

Game content lives in JSON:

```text
data/
  cards.json
  columns.json
  forest_events.json
  game_config.json
  personalities.json
  rooms.json
  terrains.json
```

The TypeScript loader/engine lives in `lib/game/`. The main playtest UI is
`components/game/GameBoard.tsx`.

## Forest FSM

The Forest uses one universal loop:

```text
Telegraph -> Player Turn -> Resolve -> Advance -> Telegraph
```

In the browser this is collapsed into a fast turn flow: the current Intent is
already telegraphed while the player acts, and pressing End Turn resolves the
Intent, clears temporary Reinforce, advances the turn, and telegraphs the next
Intent.

The Forest keeps persistent run-wide `Wet` and `Windy` values from 0 to 3.
They do not reset between rooms. Each JSON attack declares minimum primary
level, weather requirements, target rule, power, status gains, cooldown, and
selection weight.

The available attacks are Drizzle, Strong Gusts, Steady Rain, Gale, Downpour,
Thunderstorm, and Hurricane. Early attacks have extra weight while their
matching weather state is low, so the Forest tends to build toward stronger
weather combinations. Higher-requirement attacks gain weight once eligible,
but they are not guaranteed. Cooldowns and repeat limits stop strong attacks
from looping every turn.

Multi-target rules support the newest Frontier Column, weakest Frontier Column,
one exposed structure, up to two exposed structures, every open worksite, and
every exposed structure. In this prototype, exposed/open structures are the
Active Structure plus the two current Frontier Columns.

## Current Loop

1. Pick a personality starter deck.
2. Start with `Simple Column Structure` as the only unlocked column type.
3. Choose a column type for the active bridge slot from the always-visible
   column panel.
4. Spend MH to play cards from hand.
5. Prepare, Reinforce, Repair, draw, Explore, and use utility effects.
6. Complete the active slot when Preparation reaches the requirement.
7. End turn manually, then resolve the visible Forest Intent.
8. Keep the active slot and two newest frontier columns from being destroyed.
9. If a structure is destroyed, construction regresses to that site and the
   player must rebuild it through normal Preparation and completion.
10. Complete the room, pick one unseen card reward, then pick one new column
   design from up to three unseen options.

Debug tools are included in the playtest screen for balance iteration:
Budget/MH/card draw, forced Forest Intent, Wet/Windy changes, Preparation and
Overrun changes, slot completion, room restart, run restart, and pile
inspection.

The playtest screen keeps the important decision data visible: prominent Budget
and Man-Hours, turn,
deadline, room/slot, terrain, Preparation, planned column Allocation, active
exposure percentage, Overrun/Reinforce for the Active Structure and Frontier
Columns, Safe column labels, draw/discard counts, current Forest Intent, target,
power, Wet/Windy levels, cooldowns, and status gains. Weighted AI does not
reveal a second Intent by default, so the next Intent row reads `Not revealed`.

## Access Control

This is intentionally lightweight for a small trusted playtest group.

- `ACCESS_CODES` is a comma-separated list of `CODE:DisplayName` pairs.
- `POST /api/auth/login` checks a submitted code and sets a signed JWT cookie.
- `middleware.ts` protects `/builder/*` and redirects unauthenticated visitors
  to `/login`.
- Sessions last 7 days.

This is not hardened for broad public signup. Add rate limiting or a stronger
auth provider before wider exposure.

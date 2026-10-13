# Architecture

Greener on the Other Side is a 2-player realtime browser game for a few friends. Read `DESIGN.md` for what the game must do and `PLAN.md` for the build milestones. This file covers how the code is organised and the rules every change follows.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind CSS 4, Vitest 5. Matter.js 0.20 stays installed for the shared foundation, but the game uses its own slide-and-arc step (see `PLAN.md`).
- Realtime: Pusher Channels. The browser uses `pusher-js`. The server uses the `pusher` package only to sign room joins.
- Fonts: `@fontsource/patrick-hand` (body, `font-hand`) and `@fontsource/permanent-marker` (titles, `font-marker`), imported in the root layout.
- Two-player browser tests: `playwright-core` driving the system Chromium at `/usr/bin/chromium` (launch with `args: ['--no-sandbox']`).
- Formatting: Prettier, no semicolons, single quotes, no trailing commas, `arrowParens: avoid`, Tailwind class sorting.
- Next.js 16 differs from older versions. Read the matching guide in `node_modules/next/dist/docs/` before using a Next.js API you haven't checked.

## Layout

```text
src/
  app/                 Next.js routes: pages, the root layout, and /api/pusher/auth
  server/              server-only code (the Pusher signer); never imported by client code
  shared/              the scrappy game foundation copied from the earlier games; see shared/README.md
  net/                 transports, room protocol, clock sync, message codecs
  game/                pure game logic and tuning, no React and no DOM where possible, unit tested
  scenes/              canvas renderers and per-scene input
  ui/                  React overlay components for this game
e2e/                   playwright-core scripts that drive two players at once
```

- `src/shared` came from the single-player games. Change it only with additive or backward-compatible edits, and keep `shared/README.md` accurate.
- Its dev checks use `process.env.NODE_ENV !== 'production'` instead of Vite's `import.meta.env.DEV`.
- The game canvas and everything that touches `window` runs only in the browser. Mark those modules `'use client'` and load the game with `next/dynamic` and `ssr: false`, so server rendering never touches browser globals.

## Commands

Run inside this folder:

- `bun run dev`: dev server on http://localhost:5176. Phones on the same Wi-Fi can open the Network address Next.js prints.
- `bun run dev:https`: the same server over HTTPS, with a self-signed certificate in `.certs/` for the LAN addresses, so phones get Web Locks, the wake lock and sharing. Stop `bun run dev` first.
- `bun run typecheck`, `bun run test`, `bun run build`: these must all pass before you finish any piece of work.
- `npx prettier --write <paths>`: format the files you touched.
- `node e2e/<script>.mjs`: run a two-player browser script against the dev server.

## Environment

`.env.local` holds the Pusher settings, and git ignores it. `.env.example` documents them:

- `NEXT_PUBLIC_PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_CLUSTER` (`ap2`) are public and ship to the browser.
- `PUSHER_APP_ID` and `PUSHER_SECRET` stay on the server. Never import `src/server` from client code, and never log or print the secret.
- Client events are on for this Pusher app. A presence join plus a client-event round trip was measured at 77 ms from this machine on 2026-10-12.

## Network Rules

These are Pusher's verified limits. Design every message around them:

- Client events work only on private and presence channels. Rooms use one presence channel each, named `presence-lawn-<code>` with a 6-character lowercase code. The auth route refuses any other name.
- At most 10 client events per second per connection, or Pusher rejects them with error 4301. Send through a coalescing outbox capped at 6 events per second.
- Keep every message under 4 KB. Pusher documents a 10 KB limit for server events but does not confirm one for client events.
- Pusher never sends your own client events back to you. Apply your own actions locally at once.
- Delivery order is not guaranteed. Every message carries a sequence number, and receivers drop stale ones.
- A presence channel holds at most 100 members. A room admits two players, and a third joiner sees Room Full.
- The free plan allows 100 connections and 200,000 messages a day for the whole account, and the count resets at midnight UTC. Each client event costs 2 messages in a 2-player room: one sent and one delivered.
- No browser referees the other. Each player is authoritative over their own garden, and the design keeps the two browsers from ever simulating the same object.

## Transports

All game code talks to a small transport interface, so the same game runs over:

- **Pusher:** the real game between two browsers anywhere.
- **Local:** a `BroadcastChannel` between two tabs of the same browser, enabled in dev builds with `?local`. Use it for most automated two-player testing, because it costs no Pusher quota.

Testing budget: real Pusher tests use the shared daily quota. Keep each real-Pusher check under 2 minutes, and run them only to confirm Pusher-specific behaviour (auth, presence, ordering, rate limits, reconnects).

## Hard Rules

- No database and no game server. The only server code is the Pusher auth route.
- No game progress is saved. Only your display name and player id may persist in `localStorage`, so you don't retype your name.
- Real-time waits use wall-clock finish times on a clock synced between both players, so they stay correct when a tab sits in the background.
- Dev-only helpers stay behind `process.env.NODE_ENV !== 'production'`, so production builds never include them.
- Every action works on desktop (mouse and keyboard) and on phones (touch, with tilt only as an extra). Keep 60 fps on mid-range phones: cache static art, skip resting items in the simulation step, and never re-render React every frame.
- Canvas draws the game world and Brenda's reveal, so the peel and the score count-up never re-render React. React draws menus, the lobby, the HUD and modals over the canvas. It mirrors the reveal's verdict as text for screen readers.
- No external images or art libraries. Draw everything with the wobbly felt-tip helpers in `src/shared`.

## Dev And Test Hooks

Only in dev builds:

- `?local` uses the BroadcastChannel transport instead of Pusher.
- `?fast` shrinks rounds and waits through the shared wait helper.
- `?debug` draws hit areas, network stats (events per second, message sizes, latency) and other overlays.
- The backquote key toggles a dev panel with cheats.
- `window.__game` exposes a scripting API so automation can inspect state, step the simulation and drive both players.

## Testing

- Unit tests sit next to the code they test (`*.test.ts`) and cover game logic, scoring, message codecs, clock sync, the outbox rate cap and the room state machine. Don't write smoke tests that only check a component renders.
- Two-player flows get `e2e/` scripts: create a room, join by link, play a round, reveal, rematch, leave and rejoin.
- Before calling a feature done, play it in a real browser at desktop size (1280x800) and at phone size (390x844 and 375x667).

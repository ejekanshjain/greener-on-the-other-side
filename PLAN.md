# Greener on the Other Side: Technical Plan

This plan turns `DESIGN.md` into build steps. Builders work through the milestones in order, tick them off, and keep the Code Map current. Read `ARCHITECTURE.md` and `src/shared/README.md` first.

Every number here is a starting value. Once `src/game/tuning.ts` exists, it is the source of truth. The balance pass (M27) writes the tuned numbers back into this plan and `DESIGN.md`.

## 1. Critique Decisions

Critics reviewed the first `DESIGN.md` through three lenses: fun (F), netcode (N) and UX (U). Each issue is listed with what happened to it and why. Accepted issues are folded into `DESIGN.md`.

### Fun

- **F1, Tidy floors and the finale is cosmetic: accepted.** Yanked weeds wilt 20s after the yank into a mess mark and never root again. Snails now leave at the far hedge, which adds a second sink. Tidy loses 0.5 per item, and a new Junk line has no floor (gnome -1, bin -4, mower -4, trampoline -6). Reason: the last 40s must swing rounds, and clutter must stay countable.
- **F2, watering eats half the round: accepted.** Patches dry every 100s, then 75s from 1:20 left (M27 tuned these to 140s and 105s). Pouring adds 1 health every 0.4s. The tap is a toggle that fills the can in 3s while you play, and floods 2 patches after 8s running. Reason: upkeep drops to about 20% of a round, and the tap gains its own fail.
- **F3, carrying light items to the front row: accepted.** A held light item stays within 100 units of its grab point or root. Reason: it keeps the fence clip, the back-row test and Biscuit's back-row drops alive.
- **F4, you never see your hits: accepted.** Landings ride in `lawn` (2 bytes each, up to 8). Clips go out as clip records. Heavy junk always shows on the horizon. Reason: the feud needs a payoff during the round.
- **F5, no laugh in the first 30s: accepted.** Every round starts with 3 seeded gnomes in the middle third, and round 1's second weed sprouts on the back row at 2:50 left. Reason: the first throw and the first likely clip happen inside 15s.
- **F6, Pemberton can't hit his target and has no personality: accepted.** His upkeep is a share of the drying rate (60%, 100%, 130%) on his driest patches, and he reacts. Headless rounds check the target. Reason: a measurable target beats a guess.
- **F7, stripes undefined and short-lived: accepted.** Patches start at length 2, short means 0 or 1, and a cut restarts the 75s growth timer. Reason: stripes appear in the first 20s and become worth protecting.
- **F8, the reveal blames the other player: accepted.** Six own-fault counts ride in `final`. Brenda names the biggest when it's worth half the margin. Reason: it keeps the "every fail is yours" promise.
- **F9, heavy junk is a losing trade: accepted.** Heavy junk sinks where it lands and can't be lifted again. Reason: the Junk line turns each heavy into a one-shot bet.
- **F10, 4-minute rounds drag: accepted.** Rounds are 3 minutes with a 40s finale. Reveals are 20s, and 30s after the last round. Reason: an 11-minute match fits friends' attention and the Pusher quota.
- **F11, Biscuit's fetch is a coin flip: accepted, with a change.** He fetches any light item untouched for 3s, barks at 1.5s, and fetches at most once every 20s. He drops it on your back row, not the patio. Reason: a dropped item that counts and sits at the hardest throw spot is a readable, fair punishment.
- **F12, mower limits punish small phones: accepted, with a change.** Mower speeds use screen pixels (shake 1,000 px/s, scalp 1,300 px/s). Grab reach uses screen pixels too (22 px touch, 10 px mouse) instead of 60 units. The fast-press rule grabs within 44 px. Reason: one unit system for hands everywhere.
- **F13, lucky gusts: accepted.** Six fixed gust slots per round with alternating over-fence directions and a coin flip for the first. Each player gets 2 tailwinds, 1 of them in the finale. Reason: equal tailwind seconds, with the weathervane still deciding who uses them.
- **F14, the tint joke is spent after round 1: accepted.** Rounds 2 and 3 show 3 and 4 levels greener with a rainbow and a sprinkler. Your lawn peels first and theirs last. The round 3 caption reads "Even greener. Somehow." instead of the suggested question. Reason: the writing rules ban rhetorical questions in UI copy.

### Netcode

- **N1, screens disagree on the winner: accepted.** The host decides every round from decoded finals, its own included, and sends `result`. The guest repeats `final` until it arrives. Results apply once per match and round. `lawn` and `final` carry per-type counts. Reason: one referee is the only way two screens agree.
- **N2, roles from join time swap mid-match: accepted.** No join stamp. The first two players to meet in the lobby take the seats, and the lower player id hosts. Seats and host stay fixed for the match. Reason: the stamp never existed, and ids never change.
- **N3, walkovers to the wrong player: accepted.** Silence counts only while your tab is visible and connected. `hello` goes out on page show and on reconnect, and every `hello` gets a `sync`. `lawn` goes out every 1s even when unchanged. Reason: you can't judge silence you can't hear.
- **N4, a backgrounded tab never catches up: accepted.** The garden is a pure model on fixed 1/60s ticks, with every scheduled event drawn from the seed by index. Catch-up runs the same ticks to the earlier of now and the round end. `final` waits for it. Reason: one code path for live and catch-up, testable byte for byte.
- **N5, one lost message freezes the match: accepted.** One `start` per match, with every round derived from it. `sync` repeats every 2s outside rounds. A mid-match `hello` with no `sync` in 5s returns to the lobby. Reason: repeated state survives loss, one-off events don't.
- **N6, old messages leak into new sessions: accepted.** Every bundle carries a session id, match id, round and sequence. A pure filter drops older sessions, other matches and finished rounds. Reason: rematches make stale finals likely.
- **N7, throw rules contradict each other: accepted.** One 6s window judged by send time, with the crossing time carried for the fast-forward. Throws to an Away neighbour vanish. Throw ids join the session id and a counter. Reason: matches what iPhones actually do.
- **N8, clock sync is fragile: accepted.** Pings skip the outbox and are stamped at send. Five samples, shortest round trip, reject over 400 ms, resample only within 1.5 times the best. `?skew=` tests the sign. Reason: a wrong clock breaks every shared time.
- **N9, StrictMode double setup: accepted.** The room session (connection, lock, local channel) is a module-level singleton per room code. React only subscribes. Reason: dev builds run every effect twice.
- **N10, the local transport is too kind: accepted.** Fake member list with heartbeats, sender ids, own-message drop, a 10 per second rejection, and `lag`, `jitter`, `drop`, `reorder` and `pid` options. Reason: most tests run locally, so it must fail like Pusher.
- **N11, overlapping junk destabilises Matter.js: accepted, going further.** The game drops Matter.js. Loose items use a slide-and-friction step that hits only walls. Reason: deterministic, cheap for 160 items, unit-testable, and it makes catch-up and headless bot matches possible.
- **N12, Room Full visitors cost quota and senders can be faked: accepted.** Room Full and another-tab cases disconnect at once. The connection opens only on a room page. Senders come from Pusher's `user_id`. Newcomers wait 3s for the roster. Reason: quota and trust.
- **N13, Next.js 16 browser-only loading: accepted.** A thin server page awaits `params` and renders a client wrapper that loads the game with `next/dynamic` and `ssr: false`. Dev flags are read only inside browser-only modules. Reason: matches the Next.js 16 lazy-loading guide in `node_modules/next/dist/docs`.
- **N14, wind has no frame: accepted.** Gusts are defined from the host's side, and the guest reverses both directions. Reason: otherwise both screens get the tailwind.
- **N15, risky logic only in prose: accepted.** The room flow is a pure reducer `(state, input, now) => { state, out }` with race tests. The outbox splits at 3.5 KB. Pemberton runs as a peer behind a memory transport. Reason: tests can only check code, not prose.

### UX

- **U1, the phone layout can't fit: accepted.** A 680 by 1,060 design with fixed bands: top bar 96, peek strip 100, fence 40, lawn 640 (16 rows of 40), patio 184. Meters move into the scene, Shake Fist moves to the top bar. Throw speeds were retuned for the shorter lawn. Reason: checked at 375 by 548, the top bar is 50 px and covers nothing.
- **U2, press rules cause fails you didn't choose: accepted.** Water can switch to mow, never the reverse, and the can tips during the 150 ms wait. Grab reach is in pixels by input type, and the nearest target wins. Reason: misreads must cost little.
- **U3, desktop throws fall short: accepted.** Throw speed is the peak in the last 100 ms before release, for touch and mouse alike. Reason: parity. A trackpad check is an owner follow-up.
- **U4, accidental Back: accepted.** A history entry during a match turns Back into the leave dialog. Phones keep 20 px side edges free of anything grabbable. Reason: the back swipe would cost a walkover.
- **U5, a network failure tells both players they won: accepted.** Walkovers need the member list to show the neighbour left. Silent but listed for 60s is a no contest. Reason: only Pusher's member list tells you who left.
- **U6, letting go is undefined: accepted.** One release rule: 400 px/s and within 60° throws, anything else puts down, a cancel puts down. A lift allows only a throw. Reason: a single rule players can learn.
- **U7, a resting thumb starts jobs: accepted.** One finger at a time, with the shared tracker's hand-off turned off by a new `handoff: false` option. Reason: equal rules for phone and mouse.
- **U8, lockouts from Room Full and second tabs: accepted.** Seats lock by id in the lobby. A seat frees after 10s away or a Leave. Room Full gets Try Again and honest copy. Already Open gets Play Here. Reason: the friend must never be stuck.
- **U9, sharing on a phone empties the room: accepted.** Wake lock in the lobby, rejoin on page show, and copy that depends on how you arrived. Reason: sharing is the normal path.
- **U10, waiting and error screens undefined: accepted.** `DESIGN.md` now has a room screen table. Reason: every state needs copy and buttons.
- **U11, names refuse real names and accept blanks: accepted.** NFC, combining marks allowed, at least 1 letter or digit, 16 graphemes, a random funny default, and the same rule in the auth route. Reason: Ekansh's own name failed the old rule.
- **U12, codes and links on phones: accepted.** Alphabet check, paste-a-link, no autocorrect, join on the 6th character, grouped capitals in a clear font, Share only where supported, lowercase redirects, a bad-link screen and an HTTPS dev server. Reason: friends read codes aloud and paste links.
- **U13, landscape phones: accepted.** A "Turn your phone upright." cover on touch devices in landscape. Reason: 18 px patches are unplayable.
- **U14, colour-only health: accepted.** Health shows in lightness, blade density, cracks and puddles. A `?cvd` dev filter checks it. Reason: about 1 in 12 men can't see red-green.
- **U15, the top bar can't fit: accepted.** Name, rosettes, clock, rosettes, name, with names cut to 10 characters and Gone replacing rosettes. Reason: it fits 375 px with both buttons.
- **U16, Biscuit blocks his own race: accepted.** He wins presses only while circling. Pressing the item in his mouth takes it back. Reason: the race must be winnable.
- **U17, mower units: decided for screen pixels.** Reason: throws already use pixels, and one hand-speed rule is easier to learn. Real-phone tuning is an owner follow-up.
- **U18, motion prompt and shake: accepted.** Phone shaking is dropped, so the game never asks for motion access. Reason: the prompt collides with the countdown, and the button and F already work.
- **U19, accessibility: accepted.** Letter-by-letter codes, a live region, a pressed state on Ready (later the waiting line as its description), Enter to submit, focus on headings, and zoom allowed outside the canvas. Reason: cheap and right.
- **U20, tips need memory: decided for round 1 of every match.** Tips show in round 1 of every match and in Practice until you press Hide Tips. Reason: it keeps the hard rule that only name and id persist. (Replaced on 2026-10-13: the browser now remembers whether you've finished a match, and only a new player gets tips. See Made While Planning Onboarding.)
- **U21, reload penalty: accepted, with a change.** A reload rebuilds your garden from your neighbour's last copy and catches up, with no extra health penalty. Junk outside the peek rows rebuilds from the counts, since `lawn` carries per-type counts and a heavy marker for every heavy item. Reason: phones reload pages on their own, and the rebuild already includes everything missed.

Rejected: none outright. Two suggestions were swapped for stronger fixes (N11 drops the physics library entirely, U21 drops the penalty), and one copy line changed (F14).

## 2. Technical Design

### 2.1 Module Layout

```text
src/app/
  page.tsx                  home: server shell rendering <HomeClient />
  r/[code]/page.tsx         awaits params, renders <RoomClient code /> (lowercase redirect, bad code screen)
  practice/page.tsx         renders <PracticeClient />
  api/pusher/auth/route.ts  signs joins (exists)
src/server/pusherAuth.ts    the signer; imports the name rule from src/net/names.ts
src/net/                    transports, protocol and the room flow
src/game/                   pure game logic and tuning; no React, no DOM
src/scenes/                 canvas renderers, layout maths and input
src/ui/                     React screens and HUD
e2e/                        playwright-core two-player scripts
scripts/balance.ts          headless bot-against-bot balance runs (bun scripts/balance.ts)
```

`src/net`:

- `types.ts`: `Transport`, `MemberInfo`, `ConnStatus`, `SendResult`.
- `pusherTransport.ts`: the pusher-js presence transport.
- `localTransport.ts`: `BroadcastChannel` transport with fake presence and fault injection (dev only).
- `memoryTransport.ts`: an in-process pair for Practice and tests.
- `limiter.ts`: sliding-window send limiter, 9 events in any 1,000 ms.
- `outbox.ts`: coalescing outbox, keep-newest kinds, 3.5 KB split, 6 flushes per second.
- `envelope.ts`: bundle encode and decode, session ids, `StaleFilter`.
- `protocol.ts`: message types with hand-written validators.
- `lawnCodec.ts`: binary lawn and final packs, base64.
- `throwCodec.ts`: throw items and clip records.
- `clockSync.ts`: ping sampling and the shared clock.
- `room.ts`: the pure room reducer.
- `session.ts`: `RoomSession`, the singleton that wires transport, limiter, outbox, clock, reducer, Web Lock and page visibility.
- `roomCode.ts`: alphabet, generation, validation, link parsing.
- `names.ts`: name normalising and validation, shared with the server.
- `identity.ts`: player id and name storage.
- `devNet.ts`: parses `?local`, `lag`, `jitter`, `drop`, `reorder`, `skew`, `pid` (dev only).

`src/game`:

- `tuning.ts`: every number, each with a one-line comment.
- `types.ts`: item kinds, top-state codes, mess kinds, commands and events.
- `seed.ts`: round seeds and every schedule by index: weeds, snails, gnome spots, crate spots, digs, gusts.
- `match.ts`: `matchPhaseAt`, round windows, stretches and `?fast` scaling.
- `grid.ts`: patch arrays, dry and grow timers, stripes.
- `items.ts`: loose items, the slide step, walls, rest damage, wilting.
- `flight.ts`: throw distance, clip, short and wide tests, arcs, crossing records, wind, bounces.
- `weeds.ts`, `snails.ts`, `biscuit.ts`, `wind.ts`, `water.ts`, `mow.ts`, `heavy.ts`, `bag.ts`.
- `press.ts`: the job classifier and the release rule, in pure form.
- `garden.ts`: `Garden`, which owns all of the above; `advanceTo(t)`; commands; events; outgoing throws; landings.
- `blame.ts`: own-fault counts and weights.
- `score.ts`: scoring a decoded lawn, ties, match results, Brenda's lines.
- `counts.ts`: what Brenda counted on a lawn for the verdict (`countLawn`, with junk points from next door, and its wire form), what the reveal shows beside each score line (`countParts`), and the coach tip (`coachLine`, with `COACH_LINES` for the width check).
- `stripeWatch.ts`: `StripeWatch`, a page's settled stripes step by step: the columns that gained or lost a stripe in live play, starting fresh with each garden.
- `rebuild.ts`: a garden from a neighbour's copy.
- `brain.ts`: the bot brain shared by Pemberton, autopilot and headless runs.
- `profiles.ts`: Pemberton modes and scripted player profiles.
- `headless.ts`: `simulateMatch`, two gardens joined by an in-process fence.
- (`BotNeighbour` lives in `src/net/pemberton.ts`, because it wraps a `RoomSession`; see M21's decisions.)

`src/scenes`:

- `layout.ts`: bands, lawn and patio rects, unit and pixel conversion, the edge guard.
- `input.ts`: `PressController`, which feeds pointer samples to `press.ts` and sends commands to the garden.
- `sampler.ts`: `ReleaseSampler`, peak speed and direction in the last 100 ms.
- `lawnLayer.ts`, `sprites.ts`, `peekStrip.ts`, `patio.ts`, `fx.ts`, `characters.ts`.
- `gardenScene.ts`: composes the renderers for a round.
- `revealScene.ts`: the side-by-side lawns and the peel.
- `debugOverlay.ts`: `?debug` drawing.

`src/ui`:

- `HomeClient.tsx`, `NameField.tsx`, `CodeField.tsx`.
- `RoomClient.tsx` (the `next/dynamic` wrapper), `RoomScreen.tsx`, `Lobby.tsx`, `Gate.tsx`, `ShareBox.tsx`, `RoomNotice.tsx`.
- `TopBar.tsx`, `Menu.tsx`, `Tips.tsx`, `LeaveDialog.tsx`, `TurnUpright.tsx`.
- `Reveal.tsx`, `MatchEnd.tsx`, `PracticeClient.tsx`.
- `copy.ts`: every room state's copy and buttons from `DESIGN.md`'s table.
- `useRoom.ts`: subscribes React to the session's stores.
- `dev.ts`: `window.__game.greener` (dev builds only, loaded with a dynamic import).

Shared changes, all additive:

- `PointerTracker` gains `handoff?: boolean` (default `true`). With `false`, a finger already down never becomes primary, and only a fresh press does.
- `ViewportOptions` gains `alignY?: 'center' | 'end'` (default `'center'`). With `'end'`, spare height goes above the design.
- `sfx` gains `unlocked` (M23), and `ReplayPlayer` gains `badge?: boolean` (default `true`, M24).
- Update `src/shared/README.md` with each.

### 2.2 Transport Interface

Every transport moves opaque JSON payloads between the two browsers and reports membership. The room session never knows which one it has.

```ts
export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed'
export interface MemberInfo { id: string; name: string }
export type MemberEvent =
  | { type: 'snapshot'; members: MemberInfo[] }
  | { type: 'added'; member: MemberInfo }
  | { type: 'removed'; id: string }
export type SendResult = 'sent' | 'offline' | 'limited'

/** A room's message pipe. `kind: 'b'` carries bundles, `kind: 'p'` carries pings. */
export interface Transport {
  readonly selfId: string
  open(): void
  close(): void
  status(): ConnStatus
  send(kind: 'b' | 'p', payload: object): SendResult
  onMessage(fn: (from: string, kind: 'b' | 'p', payload: unknown) => void): () => void
  onMembers(fn: (event: MemberEvent) => void): () => void
  onStatus(fn: (status: ConnStatus, reason?: string) => void): () => void
}
```

`from` is always the transport's own sender identity, never a field inside the payload. `send` never echoes to the sender.

**Pusher (`pusherTransport.ts`):**

- `new Pusher(key, { cluster, forceTLS: true, channelAuthorization: { endpoint: '/api/pusher/auth', transport: 'ajax', params: { player_id, name } } })`.
- Subscribes `presence-lawn-<code>`. Maps `pusher:subscription_succeeded` to `snapshot`, `pusher:member_added` and `pusher:member_removed` to their events.
- Binds `client-b` and `client-p`. The sender is `metadata.user_id`; events without it are dropped.
- Status: `connected` only once the room channel has subscribed on the current socket, since client events sent before that are lost. Before the first subscription everything else is `connecting`. After it, every gap is `reconnecting`, because pusher-js reports `connecting` while it retries a dropped socket. `failed` maps to `failed`. A subscription error with status 403 or 400 fails with reason `refused`. Error 4004 fails with reason `quota`. Error 4301 counts as `limited` in the stats.
- `close()` only disconnects; closing the socket ends the presence membership. pusher-js sends on the next tick, so an unsubscribe or a final message right before closing hits a closed socket. The session flushes the outbox, then closes the transport 120 ms later.

**Local (`localTransport.ts`, dev only, `?local`):**

- `BroadcastChannel('greener-local-<code>')`. Frames: `join`, `beat`, `leave`, `event`.
- Joins on open, beats every 1s, and expires a member after 5s without a beat. Sends `leave` on `pagehide`. Answers a `join` with a `beat`, so the newcomer learns about you. Emits `snapshot` 300 ms after opening, listing you too, like Pusher.
- Every frame carries the sender id. Frames from your own id are dropped, which also covers a second listener in the same tab.
- More than 10 events in any 1,000 ms are rejected with `limited`, like Pusher's 4301.
- Faults from the query string or `fault()`: `lag` (ms), `jitter` (ms), `drop` (0 to 1), `reorder` (0 to 1, the share that gets an extra 2 to 4 times `lag`), `offline` (no sends, receives or beats, status `reconnecting`).
- Player id: `?pid=` when given, else a per-tab id kept in `sessionStorage`, so a reload keeps it.

**Memory (`memoryTransport.ts`):**

- `createMemoryPair(a, b, { lagMs = 0 })` returns two linked transports. Delivery uses `setTimeout(lagMs)`, or a microtask at 0. Presence works like Pusher's: an end that opens lists itself and the other end if that one is open, and the other end hears it added, then removed when it closes. Used by Practice and unit tests.

### 2.3 Room Session

`getRoomSession(code, { practice? })` returns the one `RoomSession` for that code, creating it on first call outside any React effect. It owns:

- the transport (Pusher, local or memory);
- the Web Lock `greener-room-<code>` taken with `ifAvailable: true` (under `?local` the player id is appended, since test tabs share one browser); **Play Here** retakes it with `steal: true`, and the old tab's lock rejection sets the moved-away state and closes its transport;
- the limiter, the outbox, the clock and the room reducer;
- `visibilitychange`, `pagehide` (persisted or not) and `pageshow` listeners;
- the `Garden` while a round runs.

It closes only on **Leave**, on `pagehide` that isn't persisted, on Room Full and on lock loss. React components call `useRoom(code)` and never create or close anything.

### 2.4 Room State Machine

`room.ts` exports a pure reducer. It takes the current state, one input and the shared time, and returns the new state plus messages and effects. The session applies them.

```ts
export type RoomInput =
  | { type: 'members'; event: MemberEvent }
  | { type: 'status'; status: ConnStatus; reason?: string }
  | { type: 'visible'; visible: boolean }
  | { type: 'msg'; from: string; bundle: Bundle }
  | { type: 'ui'; action: 'ready' | 'unready' | 'rematch' | 'leave' | 'tryAgain' | 'playHere' }
  | { type: 'final'; round: number; pack: string }
  | { type: 'tick' }
export interface RoomStep { state: RoomState; out: OutMsg[]; effects: RoomEffect[] }
export function roomStep(state: RoomState, input: RoomInput, now: number): RoomStep
```

`OutMsg` names a message and its outbox class (keep-newest or append). `RoomEffect` covers `disconnect`, `startRound`, `endRound`, `showResult`, `rebuildFrom` and `announce` (live region text).

State fields:

- `me`: id, name, session id, `isHost` (derived).
- `conn`: `ConnStatus`. `visible`: boolean. `hearing`: `conn === 'connected' && visible`.
- `admission`: `checking`, `seated`, `full`, `elsewhere`, `moved` or `unreachable`.
- `seats`: 0 to 2 player ids, sorted. The host is `seats[0]` once 2 are seated.
- `peer`: `{ id, name, listed, unlistedSince, ready, rematch, silentMs, away }` or `null`. `silentMs` grows only while you hear (`visible` and connected), by at most 1s a tick, and any bundle from them (input `heard`) resets it.
- `phase`: `lobby`, `match` or `over`. Round, play and reveal are derived from `match` and the time.
- `match`: `{ id, seed, startAt, roundMs, revealMs, lastRevealMs, countdownMs }` or `null`.
- `results`: applied round results, at most 3, keyed by match id and round.
- `over`: `{ reason: 'score' | 'walkover' | 'noContest' | 'stormedOff', winner, peerId, peerName, matchId, summary }` or `null`. "They left" after the match is the match end's own line, not a reason. `summary` holds a neighbour's tally for a page that missed the verdicts.
- `peerTally` (the neighbour's verdict count, tally and totals for this match), `visible`, `lastTickAt` and `matchSeen` (this page has been in a match).
- `myReady`, `myRematch`, `arrival` (`started`, `link` or `typed`), `pendingFinal` (guest only).

Transitions, in plain terms:

| From | Input | To and output |
|---|---|---|
| start | the room's Web Lock is taken by another tab | `elsewhere`; the transport never opens |
| elsewhere | `playHere` | steal the lock, open the transport, `connecting` |
| any | the lock is stolen | `moved`, effect `disconnect` |
| connecting | 8s without `connected` | `unreachable` |
| any | status `failed` | `unreachable`, with the reason for the copy |
| connecting | member `snapshot` with 2 or more other ids | `full`, effect `disconnect`; nothing sent |
| connecting | member `snapshot` with 1 other id | `checking`; send `hello` |
| connecting | `snapshot` with no other id | `seated` alone; seats `[me]` |
| checking | `sync` whose seats include me, or have a free seat | `seated`; seats lock with both ids |
| checking | `sync` whose seats hold 2 ids without me | `full`, effect `disconnect` |
| checking | 3s with no `sync` | `seated` if at most 1 other id is listed, else `full` and `disconnect` |
| seated | `hello` from a seated id | send `sync` at once, with its copy of their lawn during a round |
| seated, a seat free | `hello` from a new id | seat it, lock both seats, send `sync` |
| seated, seats full | `hello` from an unseated id | send `sync`; its seats tell the newcomer the room is full |
| lobby | both `ready` flags true, I'm host | create `match` (start in 3.5s), send `start` and `sync` |
| lobby | `start` from the host, unseen match id | `phase: match` |
| lobby, or a match end that isn't their walkover | peer unlisted for 10s, or `leave` | seat freed |
| match | round play ends (derived) | effect `endRound`; the garden catches up, then `final` input |
| match, guest | `final` input | send `final` now, then every 1s while the host is listed, until the `result` for that round |
| match, host | own `final` and guest `final`, or 6s pass, or guest Gone (an Away guest still listed gets the 6s) | score, with a missing guest final rebuilt from its last `lawn` and caught up to the round's end (`env.peerFinal`); send `result`, with that rebuild as `gf`; apply it |
| match | `result` for an unapplied round | apply once; if decided, `phase: over` after the reveal |
| match, host | a repeated guest `final` for a decided round | send the same `result` again |
| match, host | guest `sync` names a round it waits on (`wait`), or its `final` for one, that this page never finished | effect `missedFinal`: the session rebuilds that round's garden from the guest's `waitCopy` (else fresh), catches it up to the round's end and hands back its `final`; then judge as usual |
| match, host | own `sync` while the guest's tally knows verdicts this page lacks | the `sync` carries `need`; the guest answers with its `result` for each, plus its own final as `gf`, and the host applies each once |
| match | peer unlisted for 60s | `over`, `walkover`, winner me |
| match | peer listed, silent 60s of hearing time | `over`, `noContest` |
| match | `leave` from peer | `over`, `stormedOff`, winner me; then the lobby |
| match, host | guest `sync` still in the lobby while the match runs | send `sync` with the match |
| match | `hello` from peer | clear their Ready and Rematch; send `sync` with the match, `over` when set, and your copy of their lawn |
| any | `visible` true, or status back to `connected` from any other status | reset `peer.lastHeardAt`, send `hello` |
| reloaded page | no `sync` within 3s of `hello` (the admission check) | seated alone in the `lobby` |
| reloaded host page that never saw a match | guest `sync` with a running match | takes the match, its tally and the copy |
| any page in the match, or one that never saw a match | `sync` with `over` for that match | `over` as the neighbour reports it |
| over | both `rematch` flags true, I'm host | new `match`, send `start` |
| over | peer unlisted | `over` stays; copy "neighbour_name left." |

`tick` runs at 4 Hz. It advances silence only while `hearing`, raises Away at 3s in a round or 6s outside, and sends `sync` every 2s while both are present outside a round.

### 2.5 Clock Sync

- The host's `Date.now()` is the shared clock. The host's offset is 0.
- The guest sends `ping { id, t0 }` straight to the transport, skipping the outbox, stamped at the moment of sending. The host answers `pong { id, t0, th }` at once, also direct.
- On receipt at `t1`, `rtt = t1 - t0` and `offset = th + rtt / 2 - t1`. Shared time is `Date.now() + offset`.
- At join: 5 pings 150 ms apart. Keep the sample with the shortest round trip. Reject samples over 400 ms. With no sample left, try 5 more after 2s and keep the best anyway, flagged in `?debug`.
- At the start of each reveal: 1 ping. Accept it only when its round trip is at most 1.5 times the best so far.
- A host reload needs nothing. A guest reload pings again.
- `?skew=3000` adds 3,000 ms to one tab's `Date.now()` reads in the clock module, so the offset sign shows in local tests.

### 2.6 Message Protocol

Every Pusher event is one bundle. Bundles go out through the outbox, except pings and pongs.

```json
{ "v": 1, "s": "mgn3x7q2-k4z1", "m": "h7k2q9", "r": 1, "q": 57, "t": 1760250000000, "x": [{ "k": "lawn", "g": "..." }] }
```

- `s`: session id, the page-load time in base36 plus 4 random characters. It grows over time.
- `m`: match id, 6 random characters, or `""` outside a match. `r`: round index 0 to 2, or -1.
- `q`: sequence number per session. `t`: shared time when the bundle left the outbox.
- `x`: the messages, each with a kind `k`.

| Kind | Fields | Size | Rate per player |
|---|---|---|---|
| `hello` | `name` | under 150 B | page load, page shown, reconnect |
| `sync` | `seats`, `ready`, `rematch`, `phase`; outside the lobby either seat adds `match`, `tally`, `totals`, `done` (verdicts known); at the match end `over` (`r` reason, `w` winner id, `m` match id); during a match `copy` (the sender's copy of your lawn) and `copyAt` (when it arrived); a guest waiting on a verdict adds `wait` (the round) with `waitCopy` and `waitCopyAt` (its copy of the host's lawn from that round); a host missing verdicts after a reload adds `need` (rounds as bits) | under 400 B, under 1 KB with `copy`, under 1.5 KB with `waitCopy` too | every 2s outside rounds with both present; reply to `hello`; with each `hello` from a seated page |
| `start` | `id`, `seed`, `at`, `roundMs`, `revealMs`, `lastRevealMs`, `countdownMs` | under 200 B | once per match |
| `lawn` | `g`: base64 lawn pack | under 600 B | 1 per second in a round |
| `throw` | `items`: up to 8 throw items; `clips`: clip records | about 70 B per item | 0 to 2.5 per second |
| `final` | `g`: base64 final pack | under 1 KB | at 0:00; guest repeats every 1s |
| `result` | `round`, `sc` (2 breakdowns), `w` (`h`, `g` or `d`), `tally`, `totals`, `blame`, `over`, `hf` (host final pack); `gf` (the guest's final pack) when the host rebuilt it because the guest's own never came, and when the guest hands a verdict back to a host that asked with `need` | under 1.5 KB, under 1.8 KB with `gf` | 1 per round, again per repeated `final`; rare from the guest |
| `fist` | `x` | under 60 B | at most 0.33 per second |
| `leave` | none | under 60 B | once |
| `ping`, `pong` | `id`, `t0`, `th` | under 100 B | 5 at join, 1 per reveal |

**Lawn pack (binary, then base64):**

| Bytes | Content |
|---|---|
| 1 | version |
| 1 | round |
| 192 | one byte per patch: health (3 bits), length (2 bits), top state (3 bits) |
| 8 | counts: weeds, snails, gnomes, litter, heap patches, bins, mowers, trampolines |
| 2 | patio: heavies thrown (3 bits), mower thrown (1 bit), crate gnomes left (0 to 15) |
| 2 | tally: host wins, guest wins (host only, else 0) |
| 6 | own-fault counts, as in the final pack, capped at 255 |
| 4 | chores: bag cuts; can level in 100 ms steps; the tap (top bit on, the rest its run time toward the next flood in 100 ms steps); the arm meter, 0 to 255 |
| 1 + 2n | markers: patch and item type, up to 24 in rows 0 to 3 plus every heavy (30 at most) |
| 1 + 2n | landings since the last pack, up to 8: patch and item type (heavy follows from the type) |

Top states, in priority order: 7 heavy junk, 6 hole, 5 heap, 4 item, 3 rooted weed, 2 puddle, 1 mess, 0 clean. A patch is clean for stripes only at 0. The worst case is 294 bytes, 392 characters of base64. The pack is version 2 since the own faults and chores joined it.

**Final pack:** version, round, the 192 patch bytes, the 8 counts, 6 own-fault counts (1 byte each, capped at 255), the exact health sum (2 bytes, for the tie-break), then a marker for every item (up to 160). The worst case is 531 bytes, 708 characters.

**Throw item fields:** `id` (session id plus counter), `ty` (item code), `x` (crossing point in lawn units from the thrower's left), `c` (crossing time, shared clock), `d` (depth still to fly past the fence), `dx` (sideways still to fly, thrower frame), `tau` (crossing fraction of the flight, times 1,000), `T` (flight ms), `H` (peak height), `sp` (spin), `f` (flags: heavy, bounced, originally the receiver's, seed clock), `w` (ms until a weed wilts). A clip record is `{ id, ty, x, c }`, where `c` is when the teeter started on the shared clock.

**Receiving rules:**

- `StaleFilter` keeps the newest session per sender. It drops bundles from older sessions, bundles for another match id (lobby kinds excepted), and round kinds (`lawn`, `throw`) for any round but the current one. `final` is accepted only for the round just ended.
- Messages in a bundle apply in order, and each is judged against the room as the ones before it left it. A `sync` that puts a reloaded page back in its match lets the same bundle's `final` and `result` through.
- `lawn` and `sync` keep only the newest by sequence. `throw` items and clip records drop on a seen id, or when their own `c` is over 6,000 ms old, so outbox waits and travel share one window.
- Messages from anyone outside the seats are ignored.

**Outbox:**

- Keep-newest kinds (`lawn`, `sync`, `final`) replace a pending one of the same kind. Append kinds (`throw`, `fist`, `start`, `result`, `leave`, `hello`) queue.
- It flushes when something is pending, at most every 167 ms, through the limiter. Throws older than 6s at flush time vanish.
- A bundle over 3,500 bytes splits into several, each with its own sequence number.
- While the transport isn't connected it holds everything, with throws subject to the 6s rule.

### 2.7 Ownership Rules

- Each player owns its garden: grid, weeds, snails, loose items, Biscuit, patio, arm, can, tap and bag. Only that browser changes them.
- A thrown item belongs to the thrower until it crosses the fence above fence height, then to the receiver. Exactly one browser holds it at any moment.
- A clipped item never changes hands. The clip record only draws a teeter on the receiver.
- Landings in `lawn` are reports, drawn on the thrower's peek strip. They never change the thrower's garden.
- The host owns `start`, round results, the tally, totals, `over` from scoring and rematch starts.
- Each player owns its own name, Ready and Rematch flags, and its `final`.
- The player who stays owns walkover and no-contest calls, and reports them in `sync`.
- Shared derived state needs no messages: round times from `start`, and weeds, snails, gnome spots, digs and gusts from the round seed.

### 2.8 Garden Simulation Model

Coordinates are lawn units: `lx` from 0 (your left hedge) to 600, `ly` from 0 at the fence to 640 at the patio edge. The patio runs from `ly` 640 to 824. Patch `(col, row)` covers `lx` 50 col to 50 col + 50 and `ly` 40 row to 40 row + 40. Index is `row * 12 + col`. Mirroring for the neighbour is `lx' = 600 - lx`.

**Time.** A garden runs fixed ticks of 1000/60 ms counted from the round's play start. `advanceTo(t)` runs every tick up to `t`. Timers fire at exact times inside ticks. Commands from input or bots queue and apply at the next tick. So 1 big jump and 1,000 small steps give the same bytes when nobody acts. Play stops at the round end. Items in the air then freeze, and any landing after that is ignored.

**Schedules by index.** `seed.ts` builds every schedule at round start from `hash01(roundSeed ^ salt, k)`. Each stretch has its interval, and each event gets ±20% jitter. The garden keeps the next index for each schedule, never a shared random stream. Round seed is `hash(matchSeed, round)`.

**Tuning (starting values):**

| Area | Number |
|---|---|
| Round | 180,000 ms play; reveal 20,000 ms, last 30,000 ms; countdown 3,000 ms; start lead 3,500 ms |
| Stretches (time left) | 180 to 140 s, 140 to 80 s, 80 to 40 s, 40 to 0 s |
| `?fast` | play 45,000 ms; stretches scale with play length; reveal timeline at 0.5 |
| Patch | health start 5, max 7; length start 2, max 3; short at 1 or less |
| Drying | 1 health per 140,000 ms, 105,000 ms from 80 s left; heatwave divides by 2.5; staggered start (M27; was 100,000, 75,000 and 1.5) |
| Growth | 1 length per 75,000 ms; a cut restarts it |
| Stripe | 14 of 16 short and clean; 2.5 points |
| Water | 150 ms still to start; 120-unit circle; +1 per 400 ms; drown after 1,500 ms at 7; mud health 2 |
| Can and tap | 10,000 ms of pour; fill 3,000 ms (heatwave 6,000); flood 2 patches after 8,000 ms running |
| Mow | starts after 12 px within 150 ms; mower 30 units above the finger; 250 ms per-patch cooldown |
| Mow speed | over 100 ms in CSS px: shake 1,000 px/s, scalp 1,300 px/s; water to mow at 200 px/s for 100 ms |
| Bag | 96 cuts; heap patch adds 6 cuts; lifts with 24 cuts or more; compost hold 1,500 ms |
| Grab | 22 px touch, 10 px mouse, or drawn size; fast press over 1,000 px/s in 100 ms grabs within 44 px |
| Hold | 100-unit clamp; yank pull 60 units; lift 600 ms with 12 px wobble |
| Release | peak over the last 100 ms; throw at 400 px/s or more within 60° |
| Throw | 0.4 units per px/s, capped at 2,500 px/s; heavy 0.6 times; margin 15% |
| Arc | peak `H = max(300, 0.6 D)`; flight `T = 800 + 0.4 D` ms; height draws 1 unit up per unit |
| Arm | +0.18 light, +0.45 heavy; drains 0.15 per second; distance times 1 - 0.4 arm; full locks 1,500 ms |
| Hand | 400 ms between throws |
| Clip | teeter 600 ms; drop to `ly` 20 to 80 at the same `lx` |
| Lag | fast-forward cap 300 ms; throw window 6,000 ms |
| Landing | light crush 1 plus scuff; gnome 2; heavy 2 per footprint patch; skid 15% of ground speed |
| Slide | speed times `exp(-6 dt)`; stop under 5 units/s; walls at hedges, fence and back wall |
| Bounce | trampoline sends it back at 0.9 times; back wall drops it on row 15 |
| Loose | 1 health per 10,000 ms at rest; cap 160 (oldest loose weed wilts) |
| Weeds | every 5 / 3.5 / 2.5 / 4 s (M27; the last was 2.5 s); drain every 15,000 ms; spread every 30,000 ms; cap 40; wilt 20,000 ms after a yank |
| Dandelions | 1 in 4 in rounds 2 and 3; clock after 40,000 ms; 3 seeds root after 10,000 ms |
| Snails | every 15 / 10 / 7 / 7 s; 10 units/s; eat every 8,000 ms; cap 12 crawling; shell 3,000 ms |
| Gnomes | 3 per round in rows 5 to 10; crate of 12 (M27; was 15) spills over rows 8 to 13 at 40 s left |
| Biscuit | from 140 s left; dig every 40 to 60 s; circle 2,000 ms; sit 10,000 ms; fetch after 3,000 ms untouched; bark at 1,500 ms; cooldown 20,000 ms; trample up to 4; trot 260 units/s |
| Wind | 6 gusts at 130, 105, 80, 55, 32 and 14 s left, ±3 s; 4,000 ms each; vane 2,000 ms early; ±30%; 150 units sideways; light items slide 30 units/s |
| Gust order | over A, along L, over B, along R, over A, over B (A from a coin flip, L or R from a coin flip, host frame) |
| Heavy | bin 2 by 2, mower 2 by 2 (runs 4 patches, scalping), trampoline 3 by 3 |
| Last 10s | tick each second |

**Per-patch arrays** (`grid.ts`, typed arrays of 192): `health`, `length`, `mess` (none, slime, trample, scuff, clippings, wilt, scalp, puddle, heap), `hole`, `dryAt`, `growAt`, `fullMs` (pour time at 7), `lastCutAt`, plus a dirty-row bitmask for the renderer.

**Items** (`items.ts`): `{ id, kind, lx, ly, h, vx, vy, flight?, state, restSince, nextDamageAt, wiltAt?, by, flags }`. States: `rest`, `slide`, `air`, `held`, `teeter`, `carried` (Biscuit) and `sunk` (heavy). Kinds: weed, dandelion, seedClock, snailShell, gnome, litter (4 looks), bag, bin, mower, trampoline. Flights are analytic: position from the launch point, direction, distance, sideways drift and `tau`; height `4 H tau (1 - tau)`.

**Throw resolution** (`flight.ts`): distance `D = 0.4 * min(speed, 2500) * (1 - 0.4 * arm) * wind * (heavy ? 0.6 : 1)`. With launch depth `ly0` and direction `u` (within 60° of straight at the fence), the path meets the fence after `s = ly0 / -u.y`.

- `s > D`: short. It lands on your lawn.
- `0.85 D < s <= D`: clip. It teeters, then drops to your front rows. A clip record goes out, and `blame.clips` counts it.
- Path leaves `lx` 0 to 600 before the fence: wide. It drops back by the hedge.
- Otherwise it crosses at `tau = s / D`, and a throw item goes out with what's left of the flight.
- On the receiver, a landing beyond `ly` 640 hits the back wall and drops on row 15. A landing inside a trampoline footprint bounces back along the reversed direction at 0.9 times the distance left.

**Catch-up.** On `visibilitychange` to visible, and after a reload rebuild, the session calls `garden.advanceTo(min(sharedNow, roundEnd))`. While no frame has run for 1s, the session's timer runs the same step, about once a second in a background tab, and sends the lawn. Rest damage uses `nextDamageAt`, so it's correct after any jump. A 3-minute gap is 10,800 ticks of mostly timer checks; M26 holds it under 50 ms.

**Reload rebuild** (`rebuild.ts`): from the neighbour's last decoded copy of your lawn (sent back in their `sync` on your `hello`, as `copy`), set health, length and top states. Rooted weeds, holes, heaps and puddles come from top states. Items come from markers where they exist, and from the counts for the rest, placed on the `item` patches. Heavies come from heavy markers. The patio comes from the patio bytes. Then catch up from `copyAt` to now.

### 2.9 The Bot Neighbour

`brain.ts` drives any `Garden` through the same commands as the input layer. It has one virtual hand, and each action costs time, so it can't do two jobs at once:

| Action | Hand time |
|---|---|
| Yank a weed and throw it | 1,100 ms |
| Grab a loose item and throw it | 800 ms |
| Mow a column | 1,200 ms |
| Water a 5-patch spot | 1,000 ms |
| Tap on or off | 300 ms |
| Empty the bag at the compost | 2,200 ms |
| Tap Biscuit | 400 ms |
| Drag, lift and throw a heavy | 2,900 ms |

Throws pick a speed from the profile and go through the real throw maths, so clips, shorts and wind effects emerge.

**Priorities (M27).** The hand takes the first job that applies: tap Biscuit while he circles, the tap, a catch, the finale, a weed, a snail, watering and mowing, then with the time left over throw-backs, the compost and its own loose things. Mr Pemberton throws back right after Biscuit, the tap and catches, before any chore. A player's arm counts as tired while throws are locked; then it waters if its debt is due, and otherwise yanks the weed and drops it. Watering keeps a debt of its share of each drying event, and a pour that gives back more than the debt leaves the rest as credit. In the finale a player throws heavy junk first, resting light throws until the arm will be at 10% or less at the throw and no headwind blows, and drags it only as deep as its slowest swipe clears. Then it throws its gnomes over, and theirs once each is due back.

**The closing stretch (M37).** A plan with a closing stretch keeps Biscuit and the tap in its last seconds, then skips catches and chores. It mows the unstriped column one pass would stripe, back to back, before any throw: a column qualifies when at most 2 of its patches hold something a pass can't clear (a hole, a weed, a snail, an item or sunk junk). It picks the column with the fewest such patches, so a later landing is least likely to break it, and empties the bag first when that column's cuts would overfill it. With no such column it throws gnomes, then throws back, then waters. The stretch scales with the round's length, like the shed. A kept mower goes over at a set time before 0:00.

**Mr Pemberton** (`pemberton.ts`) is a `BotNeighbour`: a guest peer on a memory transport. It readies at once, follows `start`, sends `lawn` every 1s, sends `final`, and accepts `result`. His id sorts last, so you are always the host in Practice.

| | Polite (round 1) | Normal (round 2) | Petty (round 3) |
|---|---|---|---|
| Throws back | 4 to 8 s later | 2 to 6 s later | within 1.5 s |
| Own sends | none | every 5 to 9 s | every 4 to 7 s |
| Clip chance (light throws only) | 0 | 1 in 5 | 1 in 13 |
| Upkeep, share of drying | 60% | 100% | 130% |
| Mows a column | every 12 s | every 6 s | every 6 s |
| Reacts to a weed | 10 s | 6 s | 4 s |
| Taps Biscuit | half the time | 3 in 4 | 9 in 10 |
| Crate gnomes | carries them to his patio | throws them, 1 per 2.5 s | throws the bin and trampoline, then the gnomes; re-mows from 0:15 left and throws his mower 6 s before 0:00 |

He waters his driest patches first. Reactions travel as normal messages and Practice-only bubbles: "My begonias!" on landings of gnomes in his rows 0 to 3, `fist` after 3 hits within 10s, a laugh bubble on your clip records, and "Blast." on his own clips.

**Scripted players** (`profiles.ts`) for autopilot and balance:

| | Learner | Regular | Expert |
|---|---|---|---|
| Reacts to a weed | 6 s | 3 s | 1.5 s |
| Throw speed (mean ± spread) | 950 ± 350 px/s | 1,250 ± 300 px/s | 1,550 ± 250 px/s |
| Upkeep, share of drying | 70% | 100% | 110% |
| Mows a column | every 20 s | every 14 s | every 10 s |
| Overwaters, per pour | 15% | 5% | 2% |
| Taps Biscuit | half the time | 3 in 4 | 9 in 10 |
| Catches | never | 1 in 10 | 3 in 10 |
| Finale plan | throws gnomes | throws gnomes, mows once they're gone, closes from 0:08 left | `closer` (gnomes, then closes from 0:18 left); balance also plays `thrower` (heavy junk, then gnomes) and `mower` (gnomes, mows once they're gone, closes from 0:15 left) |

`headless.ts` runs `simulateMatch({ seed, a, b })` with two gardens and an in-process fence that hands throws across with no network. It returns per-round breakdowns, own-fault counts, action time shares and clip counts.

### 2.10 Scoring Agreement

- At the round end, each garden catches up to exactly the end time, then encodes its `final`.
- The host decodes both packs, its own included, and scores each with `scoreLawn(decoded)`. Live state is never scored.
- `scoreLawn`: Green `round(50 * healthSum / (192 * 7))`; Stripes `round(2.5 * stripedColumns)`; Tidy `max(0, round(20 - 0.5 * clutter))` with clutter = weeds + snails + litter + heap patches + holes; Junk `-(gnomes + 4 bins + 4 mowers + 6 trampolines)`. Rounding is half up. Total is the sum.
- Winner: higher total; then the higher exact health sum; then a draw.
- Match: first to 2 wins; after round 3, more wins, then higher total points, then a drawn match.
- Blame: own-fault counts times weights (drowned 0.7, scalped 0.5, clip 1.0, flattened 0.1, bounce 1.5, dig 1.0). When the loser's weighted sum is at least half the margin, and the margin is at least 1, the line names the category with the largest weighted share.
- The guest never scores. It shows the host's `result` only, applies it once, and draws the host's true lawn from `hf`.
- Fallback: the host waits up to 6s for the guest's `final` while the guest is present. If the guest is Away or Gone, it uses the guest's last `lawn` at once. With no lawn at all, it scores a fresh lawn.

### 2.11 Simulation State Versus React Snapshot

The canvas reads simulation state every frame. React reads small stores that change on events.

| Lives in | Owner | Read by | Changes |
|---|---|---|---|
| `Garden` (typed arrays, item lists) | `RoomSession` | renderers, input, encoder | every tick |
| `NeighbourView` (last decoded lawn, landings queue, clip queue, head pops) | `RoomSession` | peek strip | each `lawn` or `throw` |
| `RoomState` | `room.ts` through the session | session | each input |
| `roomStore` | session | lobby, notices, top bar names, rosettes, presence | on change only |
| `hudStore` | session | tips, toasts, menu, leave dialog, banner | on events |
| `revealStore` | session | `Reveal`, `MatchEnd` | once per round |
| Clock text, can level, bag fill, arm ring | renderers and `LiveText` | canvas or text node | per frame, no React |

React must never re-render per frame. `?debug` shows a commit counter to prove it.

## 3. Layouts

### 3.1 Design Space

The design is 680 by 1,060 units, fitted with `contain` and `alignY: 'end'`. Spare height goes above, as sky and the neighbour's house. Spare width goes to the sides, as hedge and the shed.

| Band | y (units) | x (units) |
|---|---|---|
| Top bar | 0 to 96 | 0 to 680 |
| Peek strip | 96 to 196 (rows 3 to 0 at heights 19, 23, 27, 31) | 40 to 640 |
| Fence | 196 to 236 | 0 to 680 |
| Lawn | 236 to 876 | 40 to 640 |
| Patio | 876 to 1,060 | 0 to 680 |
| Hedges | 196 to 876 | 0 to 40 and 640 to 680 |

The React top bar sits over the design's top band, with its height the larger of 48 px and the band's height on screen.

| Screen | Scale | Patch | Top bar | Side margin to the lawn |
|---|---|---|---|---|
| iPhone SE Safari, 375 by 548 | 0.517 | 26 by 21 px | 50 px | 32 px |
| 375 by 667 | 0.551 | 28 by 22 px | 53 px | 22 px |
| 390 by 844 | 0.574 | 29 by 23 px | 55 px | 23 px |
| Desktop 1,280 by 800 | 0.755 | 38 by 30 px | 72 px | 413 px |

### 3.2 Phone Portrait

```text
+--------------------------------+  spare height: sky, their house roof
| [=] You **  2:31  ** Pemb.. [F]|  top bar (96)
|   ~ ~ their lawn, greener ~ ~  |  peek strip (100), "Somehow greener."
|##########  vane  ##############|  fence (40)
|h|                            |h|
|e|   your lawn, 12 x 16       |e|  lawn (640)
|d|   rows of 40, patches 50   |d|
|g|                            |g|
|e|                            |e|
|  tap  can  mower+bag  compost  |  patio (184)
|  bed (Biscuit)          shed   |
+--------------------------------+
```

- Patio objects, left to right: tap and can (x 40 to 170), mower with its bag (190 to 330), compost bin (350 to 450), Biscuit's bed (470 to 570), shed door (580 to 680). Each is at least 90 units wide, so at least 46 px on an SE.
- Heavy junk rolls out of the shed onto the patio's middle at 0:40.
- The Reconnecting banner and toasts sit over the patio, never over the peek strip or the fence.
- Landscape on a touch device shows `TurnUpright` over everything.

### 3.3 Desktop Landscape

```text
+--------------------------------------------------------------------------+
|                 [=] You **   2:31   ** Pemberton [F]                     |
|  their house    ~ ~ ~ their lawn ~ ~ ~                                    |
|  and hedge     ######## fence ########          the shed, big          |
|                |                      |         rakes and pots          |
|  key card:     |      your lawn       |                                 |
|  "F shakes     |                      |                                 |
|  your fist.    |                      |                                 |
|  Escape opens  |----------------------|                                 |
|  the menu."    | tap can mower compost|                                 |
+--------------------------------------------------------------------------+
```

- The design area is 513 by 800 px in the middle. The side areas are background art drawn into `viewport.view`, cached, with no interactive parts.
- The top bar spans the design width.
- The lobby, reveal and match end are React panels centred over the canvas, at most 560 px wide.

## 4. Controls

**Pointer pipeline.** `PointerTracker` with `handoff: false` feeds `PressController`. On press, `garden.hitTest(lx, ly, reachUnits)` returns the nearest target in priority order:

1. Biscuit while circling, the tap, the bag.
2. Loose items, items in the air over your lawn and descending, the item in Biscuit's mouth.
3. Rooted weeds and crawling snails.
4. After 0:40: the bin, mower and trampoline. Before 0:40, a press on the mower shows the mowing tip.
5. Grass, which starts the 150 ms job wait.

Reach is 22 px for touch and 10 px for mouse, converted with `viewport.scale`, or the item's drawn radius if larger. Touch presses that start within 20 px of the screen's left or right edge are ignored.

**Release.** `ReleaseSampler` keeps the press's last 100 ms of samples (client px, event time). Speed is the peak of sample-pair speeds over pairs at least 8 ms apart. Direction is the displacement across that pair. `press.ts` applies the release rule. A `pointercancel` always puts down.

**Jobs.** The grass wait shows the can tipping. After 150 ms, movement over 12 px means mow, otherwise water. While watering, 100 ms above 200 px/s switches to mowing. A fast press (over 1,000 px/s within 100 ms) snaps to the nearest item within 44 px, or does nothing.

**Keyboard.** F shakes your fist. Escape opens the menu. Enter submits the name and code boxes. Tab order runs through every React control.

**Back.** At match start, push a history entry. `popstate` during the match opens the leave dialog and pushes the entry again. Match end or Leave removes it.

**First-time tips** (round 1 of every match, and Practice). This table records the tips as M8 to M20 built them. From M28, `DESIGN.md`'s Onboarding section owns every tip's copy, trigger and round:

| Trigger | Tip |
|---|---|
| Round start | "Throw the gnome over the fence." |
| First weed sprouts | "Pull the weed out, then flick it at the fence." |
| First slow release | "Let go while you're still moving." |
| First clip | "Too soft. It clipped the fence." |
| First patch at 3 health | "Hold still on brown grass to water it." |
| First sparkle | "Sparkling means full. Stop pouring." |
| Can empty | "The can's empty. Turn on the tap." |
| Tap running 4s after the can is full | "Turn the tap off before it floods." |
| First column at length 3 | "Rub the grass to mow a stripe." |
| Bag at 80 cuts | "Drag the bag to the compost, or over the fence." |
| First snail | "Grab the snail before it slimes your stripes." |
| First item arrives | "Throw it back." |
| Biscuit circles | "Tap Biscuit before he digs." |
| Biscuit barks | "Biscuit's eyeing that. Throw it first." |
| Weathervane swings | "Wind's coming. Throw with it." |
| Shed opens | "The shed's open. Hold heavy junk to lift it." |
| Press on heavy junk on the patio | "Drag it forward first. It won't clear from the patio." |

## 5. Art Direction

Everything uses the shared sketch helpers: `sketchRect`, `sketchBlob`, `blobPoints`, `sketchCircle`, `sketchPath`, `sketchText` and `boilSeed`. Static art goes into `CachedLayer`s.

**Lawn.** The lawn is one `CachedLayer` repainted a row at a time. Each patch draws:

- A base colour from an 8-step ramp. Lightness rises about 8 L* per level, from dark brown mud to bright green, so levels separate by lightness alone.
- Blades as short `sketchLine` strokes, 2 plus 2 per health level, seeded per patch.
- Cracks at health 2 or less, and a `sketchBlob` puddle on mud.
- Length as blade height. Stripes as a column overlay of fine parallel lines, light on even columns and dark on odd, so they read without colour.
- Mess marks as small scribbles: slime trail, paw prints, scuff, hatched clippings, a curled brown wilt, a scalp stripe. Holes are dark ellipses with a dirt rim.
- A sparkle star (`sketchPolygon`) on every patch at 7, drawn live, never tinted.

**Tint.** Your lawn maps each health to the level below, under a grey wash. The peek strip maps to 2, 3 or 4 levels above, with sun rays, a bird, a rainbow or a sprinkler by round. The caption is `sketchText` in the marker font.

**Items** are `CachedLayer` stamps centred on (0, 0): weed, dandelion, seed clock, snail, shell, gnome (red hat, white beard), crisp packet, pizza box, banana skin, sock, grass bag, wheelie bin, mower, trampoline, clippings heap. Items in the air get a shadow ellipse on the lawn below. Peek strip items draw at 70% of their row's scale.

**Characters.**

- The neighbour's head: a circle, a hair scribble and colour seeded from their id, and angry eyebrows on hits.
- Mr Pemberton: bald, with a moustache.
- Biscuit: a blob dog with floppy ears and a wagging tail on `boilSeed`.
- Brenda: a hat, glasses and a clipboard.
- Your fist: a mitten-like blob.

**Effects.** Dust puffs from `blobPoints`, a depth-scaled puff on the horizon, mower sparks as short orange lines, water drops, wind streaks, teeter wobble, and screen shake only without Reduced Motion.

**Colour check.** `?cvd=deutan` and `?cvd=protan` apply an SVG colour-matrix filter to the canvas in dev builds. M7 and M25 screenshot every health level through both.

**Sound map** (all from `sfx`):

| Event | Sound |
|---|---|
| Throw | `whoosh`, pitch by speed |
| Landing on your lawn | `thud`; `squish` on mud |
| Your landing over there | `thud`, quieter and lower with depth |
| Your clip | `creak`, then their `laugh` |
| Catch, yank, head pop | `pop` |
| Snail grab | `squish` |
| Mowing | `rumble` loop at pitch 1.6, volume by speed; `rattle` on a scalp |
| Pouring | `pour` loop; `drip` on an empty can |
| Tap running | `rain` loop, quiet; `splash` on a flood |
| Sparkle | `ding` at pitch 1.8, quiet |
| Biscuit | `bark`; a low `bark` at pitch 0.6 while circling; `stomp` on a dig |
| Gust | `creak` on the vane, `wind` loop during the gust |
| Shed opens | `slam` |
| Heavy landing | `slam` and `rattle`; `boing` for the trampoline and every bounce |
| Shake Fist | `hammer` |
| Last 10s | `tick` each second |
| Time's up | `doorbell` |
| Peel | `scrub` |
| Count-up | `tick` |
| Round won or lost | `ding` or `fail` |
| Countdown | `tick`, then `bell` on "Mow!" |

## 6. Dev Hooks

All dev hooks sit behind `process.env.NODE_ENV !== 'production'` and load through a dynamic import, so production builds drop them.

**URL flags:**

| Flag | Effect |
|---|---|
| `?local` | the `BroadcastChannel` transport; no Pusher |
| `?fast` | the host picks 45s rounds and half-length reveals; the guest follows the host's `start` |
| `?debug` | net stats (events per second, bundle bytes, largest bundle, RTT, offset, drops), fps, item counts, hit radii, patch numbers, React commits |
| `?seed=1234` | the host's match seed |
| `?skew=3000` | shifts this tab's clock reads |
| `?lag=`, `?jitter=`, `?drop=`, `?reorder=` | local transport faults |
| `?pid=abc12345` | forces the local player id, to test another-tab cases |
| `?bot=learner` (or `regular`, `expert`, `polite`, `normal`, `petty`) | autopilot drives this tab's garden |
| `?cvd=deutan` or `?cvd=protan` | colour-vision filter on the canvas |
| `?calm` | no gusts and no Biscuit, for older checks of throws and mowing that run past 2:20 left |
| `?name=Gnome Hoarder` | this `?local` tab's display name |
| `?first=1` or `?first=0` | this tab counts as a new or a returning player, whatever `localStorage` says (M29) |

**`window.__game.greener`:**

- `state()`: room phase, role, seats, round, time left, presence, tally, `over`.
- `garden()`: health, length, top states and mess as arrays, items, weeds, snails, Biscuit, can, tap, bag, arm, blame counts.
- `neighbour()`: the last decoded lawn, landings and the copy of your lawn they hold.
- `net()`: transport kind, status, offset, best RTT, events per second, bundle sizes, sent, received, dropped by reason.
- `events(n)`: the last `n` garden and room events.
- `toClient(lx, ly)`: client pixels for a lawn point, for `page.mouse` and touch scripts.
- `pointer.press(lx, ly)`, `pointer.move(lx, ly, ms)`, `pointer.release()`: dispatch real `PointerEvent`s on the canvas, through the real input pipeline.
- `act.yank(id)`, `act.throw(id, { speedPx, angleDeg })`, `act.mowColumn(col)`, `act.water(patch, ms)`, `act.tap()`, `act.biscuit()`, `act.emptyBag()`, `act.lift(id)`, `act.drag(id, patch)`: garden commands, for setup only.
- `spawn(kind, patch)`, `spawnAt(kind, lx, ly)`, `setPatch(index, fields)`, `clear()`.
- `perf()`: the lawn layer, each frame's work and the replay's copies (mean, p95, worst), React commits and stamps cached; `resetPerf()`.
- `ready(on)`, `rematch()`, `leave()`.
- `jump(msLeft, round)`: host only; moves the match clock in place so the round has `msLeft` left, on this page, in Mr Pemberton's session, and in the guest's tab through a dev `BroadcastChannel`. The room flow knows nothing of it, so it works between tabs of one browser only.
- `fault({ lag, jitter, drop, reorder, offline })`: local transport faults at runtime.
- `hide(ms)`: acts out a hidden desktop tab for `ms`: the page says it's hidden and frames stop, while the session's timer keeps running.
- `packs(round)`: both lawns as this page draws Brenda's verdict, and this page's own final, each with its score, counts and own faults.
- `autopilot(profile | null)`: start or stop the brain on this tab.
- `bot`: in Practice, Pemberton's `garden()`, `act`, `mode(name)` and `events(n)`. So one page can inspect and drive both players.
- `replay()`, `share()`: open the replay and the share card.
- `loop`: the shared `startLoop` API.

**Driving both players.** With `?local`, an e2e script opens 2 pages in one context and calls each page's API. In Practice, one page drives both through `bot`. With `?bot=` on both pages, two autopilots play a full match.

**Dev panel actions:** Spawn Weed, Spawn Snail, Spawn Gnome, Open Shed, Jump to Finale, Jump to Reveal, Dry Lawn, Fill Bag, Empty Can, Trigger Gust, Trigger Dig, Autopilot On or Off, Drop Connection.

## 7. Unit Test Plan

Tests sit next to their modules. Each is focused on a rule, with no render smoke tests.

| Module | What the tests prove |
|---|---|
| `net/envelope` | round-trip; `StaleFilter` on shuffled lists drops older sessions, other matches, finished rounds and repeats, and keeps the newest `lawn` and `sync` |
| `net/outbox` | never more than 6 flushes per second under a burst; keep-newest replaces; throws never coalesce away; split at 3.5 KB; throws older than 6s drop while offline |
| `net/limiter` | 9 per 1,000 ms; pings and bundles share the window |
| `net/protocol`, `lawnCodec`, `throwCodec` | validators refuse bad shapes; worst-case sizes stay under the table's limits; packs round-trip |
| `net/clockSync` | shortest round trip wins; over 400 ms rejected; 1.5 times rule; correct sign with a host 3,000 ms ahead or behind |
| `net/room` | seats lock in the lobby; third visitor gets Room Full; seat frees after 10s only outside a match, and never on a walkover's match end; host stays the lower id across reloads; one `start` per match; walkover only after unlisted for 60s; no contest after 60s of silence while listed; silence freezes while hidden or offline; `hello` always gets `sync` with `over`; 5s rejoin timeout; stormed off; rematch; results apply once; tally heals from `sync` |
| `net/roomCode` | alphabet, generation, validation, link extraction, case handling |
| `net/names` | NFC, Hindi and Tamil names pass, blanks and dots fail, 16 graphemes, space collapsing; the auth route uses the same rule |
| `game/match` | phase at any time; stretch boundaries; `?fast` scaling; last reveal 30s |
| `game/seed` | same seed gives the same schedules; gnome spots in rows 5 to 10; round 1's second weed on row 15 at 10s |
| `game/garden` | 16.7 ms steps, 250 ms steps and one jump give identical packs; play stops at the round end |
| `game/grid` | staggered drying and growth; late drying; heatwave; cut restarts growth; stripes need 14 short and clean |
| `game/water` | pour rate; sparkle; drown at 1.5s; can 10s; tap fill 3s and 6s; flood at 8s; pouring takes the can |
| `game/mow` | cut on entry, to short in one pass; cooldown; shake and scalp in px; bag 96; full bag clippings; heap clearing adds 6 |
| `game/flight` | required speeds (about 1,530 from the back row, about 650 from the middle, 400 for the front 5 rows); clip, short and wide; wind ±30%; drift; arm; mirroring; fast-forward cap; back wall; trampoline bounce |
| `game/weeds`, `snails`, `items` | drain, spread, cap 40, wilt to mess, no re-root; dandelions; snails cross and leave; shell timer; rest damage after jumps; cap 160 |
| `game/biscuit` | dig window and hole; fetch at 3s with bark at 1.5s; 20s cooldown; trample cap 4; take back |
| `game/wind` | 2 tailwinds each and 1 each in the last 40s, for 1,000 seeds; guest frame reverses both directions |
| `game/heavy` | lift wobble; drag flattens each patch once per drag; sinking; litter; mower run; no re-lift |
| `game/press` | 12 px in 150 ms; water to mow switch; never mow to water; fast press snap; release rule at 400 px/s and 60°; cancel puts down |
| `scenes/sampler` | peak speed in the last 100 ms; a mouse pause over 100 ms gives 0; touch lift mid-motion keeps speed |
| `scenes/layout` | bands sum to 1,060; top bar at least 48 px and clear of the peek strip at 375 by 548; edge guard |
| `game/score` | fresh lawn 53; half-up rounding; Tidy floor; Junk below 0; ties; match end; blame threshold and pick |
| `game/rebuild` | a garden rebuilt from its own lawn pack re-encodes to the same pack |
| `game/brain`, `headless` | profiles deterministic per seed; Pemberton's upkeep holds his Green within 3 points of target over a round; learner beats polite in 60% of 40 seeded round 1s; a pour's surplus waters ahead as credit; a tired arm waters, then drops a yanked weed; Mr Pemberton throws back before watering and a player waters first; heavy junk waits for a fresh arm and drags only as deep as needed; his fumbles stay light |
| `shared/input/pointer` | `handoff: false` never promotes a resting finger |

## 8. E2E Two-Player Script Plan

Scripts live in `e2e/` and run with `node e2e/<script>.mjs` against the dev server on port 5176. Start it first if `curl` doesn't return 200.

`e2e/lib.mjs` provides:

- `launch()`: `chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })`.
- `localPair(query, viewport)`: one context, two pages, both on `/r/room_code?local` plus `query`, so `BroadcastChannel` connects them.
- `pusherPair(query)`: two contexts, for real Pusher.
- `phoneContext(device)`: `isMobile` and `hasTouch` at 390 by 844 or 375 by 667.
- `watchErrors(page)`: collects `console.error` and `pageerror`; every script fails on any.
- `shot(page, name)`: writes `/tmp/greener-shots/<name>.png`.
- `dragLawn(page, from, to, ms)`: a real `page.mouse` drag between lawn points, using `toClient`.
- `swipeTouch(page, path)`: touch swipes through dispatched `PointerEvent`s with `pointerType: 'touch'`, since `page.touchscreen` only taps.
- `waitFor(page, predicate)`: polls `window.__game.greener.state()`.

| Script | Milestones | Checks |
|---|---|---|
| `fence.mjs` | M1, M11 | two local pages; a mouse throw lands on the other lawn; slow release puts down; soft swipe clips on both; catch and throw back |
| `lobby.mjs` | M2, M5, M6 | start, link and typed-code joins; alone copy per arrival; Ready and Not Ready; third tab Room Full; `?pid` second tab and Play Here; skew agreement |
| `home.mjs` | M5 | name rule in the box and the auth route; code rule; pasted links; lowercase redirect; bad link; started and typed joins |
| `pusher.mjs` | M3 | two contexts on real Pusher; seats, clock RTT, one throw; third context Room Full and leaves; under 2 minutes and 300 events |
| `match.mjs` | M4, M20 | `?local&fast` match clock and reveal agreement; rematch; Back opens the dialog; stormed off |
| `finale.mjs` | M17 | the shed on both pages; a real drag and lift of the bin that sinks next door with 4 litter; a trampoline bounce coming home; a thrown mower ending mowing |
| `results.mjs` | M18 | identical verdicts and tallies on both pages over 20 rounds with `drop=0.3`; a frozen guest waking to the verdict; the verdict and rosettes on screen |
| `reveal.mjs` | M19 | reveal steps within 100 ms on both pages; the gnome line and the drowned blame line; the walk home; screenshots of every step |
| `rejoin.mjs` | M22 | reload mid-round rebuilds the lawn; `hide(20000)` catch-up equals a twin and never shows Away; offline shows Reconnecting and never a walkover; closed tab gives Gone then a walkover; silent but listed gives no contest |
| `away.mjs` | second audit | a 70s desktop hide never shows Away and still takes throws; a guest hidden over 0:00 is judged on its own final; a guest frozen over 0:00 is judged on its rebuilt lawn, on both screens; a reload keeps the bag, can, tap, arm and own faults; a walkover keeps the loser's seat |
| `practice.mjs` | M21 | full `?fast` Practice; every Pemberton reaction seen; no Pusher requests |
| `bots.mjs` | M21, M27 | two `?local&fast&bot=` pages finish a match with identical results and a clean console |
| `phone.mjs` | M25 | touch throw, mow and water at both phone sizes; top bar clear of the peek strip; landscape cover; screenshots |
| `perf.mjs` | M26 | CDP CPU throttle at 4x with a loaded lawn; p95 frame time and React commits per second |
| `tour.mjs` | each UI milestone | screenshots of every screen at 1280 by 800, 390 by 844 and 375 by 667 |

The T3 preview tab works for spot checks: open it with `preview_open({ url, reuseExistingTab: false, open: false })` and pass its `tabId` to every call. Fall back to playwright screenshots when its snapshots fail.

Real Pusher scripts stay under 2 minutes each and run only in M3, M22 and the final check.

## 9. Design Coverage

Every line of `DESIGN.md`, by section, with the mechanic that delivers it and its milestone.

| DESIGN.md line | Mechanic | Milestone |
|---|---|---|
| Intro: about 11 minutes | match timeline | M4, M27 |
| Decisions: 2 players, Practice bot | room session; `BotNeighbour` | M2, M21 |
| Decisions: web game for desktop and phones | Next.js app; layouts | M1, M25 |
| Decisions: rooms by link or code | room codes and links | M5, M6 |
| Decisions: Pusher plus one auth route | Pusher transport; existing route | M3 |
| Decisions: best of 3, 3 minutes, 20s and 30s reveals | `matchPhaseAt` | M4, M19 |
| Decisions: free, no accounts, no shop | nothing to build | none |
| Decisions: saves only name, id and whether you've finished a match | `identity.ts` | M5, M29 |
| Decisions: scrappy art | sketch helpers | M7 to M19, M23 |
| Decisions: custom slide-and-arc step | `items.ts`, `flight.ts` | M1, M11 |
| Decisions: about 55 matches a day | rate budget | M2, M26 |
| Pitch and story | home copy | M5 |
| Goal: 2 of 3, Brenda scores true state | `score.ts`, host results | M18 |
| Goal: can't touch their lawn | ownership rules | M1 |
| Core loop 1: throw the 3 gnomes | starting gnomes | M10 |
| Core loop 2 and 3: yank, grab, flick | yank, grab, throw | M1, M10, M11 |
| Core loop 4: throw back | incoming items, catch | M1, M11 |
| Core loop 5: mow and water | mowing, watering | M8, M9 |
| Core loop 6: tap and bag | tap toggle, bag | M8, M13 |
| Core loop 7: crate and heavy junk | finale | M17 |
| Core loop 8: the peel | reveal | M19 |
| Garden: design size and bands | `layout.ts` | M1, M25 |
| Garden: top bar contents | `TopBar` | M4, M18, M22, M23 |
| Garden: peek strip | `peekStrip.ts` | M12 |
| Garden: fence and weathervane | fence art; vane | M1, M15 |
| Garden: 12 by 16 lawn, 50 by 40 patches | `grid.ts` | M1, M7 |
| Garden: patio objects | `patio.ts` | M8, M9, M13, M14, M17 |
| Garden: hedges and 20 px edges | layout; edge guard | M1, M25 |
| Garden: neighbour sees the mirror | mirroring | M1 |
| Garden: health, length, mess, hole | patch arrays | M7, M9, M14 |
| Garden: drying and growth timers | `grid.ts` timers | M7, M9 |
| Garden: health by lightness and texture | `lawnLayer.ts` | M7, M25 |
| One finger: one finger at a time | `handoff: false` | M1 |
| One finger: press order | `hitTest` priority | M1, M9, M14 |
| One finger: grab reach in px | `press.ts` | M1, M9 |
| One finger: can tips during the wait | job wait art | M9 |
| One finger: water to mow switch | `press.ts` | M9 |
| One finger: fast press never mows | `press.ts` | M9 |
| Letting go: peak speed in 100 ms | `ReleaseSampler` | M1 |
| Letting go: 400 px/s and 60° | release rule | M1 |
| Letting go: slow or off-angle puts down | release rule | M1 |
| Letting go: cancel puts down | `pointercancel` | M1 |
| On screen: top bar order and name cut | `TopBar` | M4, M25 |
| On screen: Away and Gone 0:42 | presence | M22 |
| On screen: menu and Shake Fist placement | `TopBar` | M20, M23 |
| On screen: can, bag and arm in the scene | renderers | M8, M9, M11 |
| On screen: menu contents and copy | `Menu` | M20 |
| On screen: tips, Show Tips and Hide Tips | `Tips` | M20, plus each mechanic's tips; M30 |
| On screen: phone sideways | `TurnUpright` | M25 |
| Mowing: mower above the finger | mow command | M9 |
| Mowing: cut on entry, growth restart | `mow.ts` | M9 |
| Mowing: one pass 75s, two 150s | growth timers | M9 |
| Mowing: stripe rule and clean | `grid.ts` | M9 |
| Mowing: stripe shading | lawn layer | M9 |
| Mowing: shake and scalp in px | `mow.ts` | M9 |
| Mowing: bag and full bag | `bag.ts` | M9 |
| Mowing: clears mess and heaps | `mow.ts` | M9, M13 |
| Watering: hold still, slide slowly | water job | M8 |
| Watering: circle and rate | `water.ts` | M8 |
| Watering: sparkle and drown | `water.ts`; blame | M8 |
| Watering: can holds 10s | `water.ts` | M8 |
| Watering: tap toggle and fill | `water.ts` | M8 |
| Watering: flood after 8s | `water.ts` | M8 |
| Watering: pouring takes the can | `water.ts` | M8 |
| Watering: empty can toast | toast | M8 |
| Throwing: grab, 60-unit pull | yank | M1 |
| Throwing: 100-unit clamp | hold clamp | M1 |
| Throwing: speed and direction | `flight.ts` | M1 |
| Throwing: 0.4 units per px/s | `flight.ts` | M1 |
| Throwing: 15% margin and the three speeds | `flight.ts` | M1 |
| Throwing: clip teeter on both screens | clip records | M11 |
| Throwing: short and wide | `flight.ts` | M1, M11 |
| Throwing: landing crush and scuff | landing | M1, M11 |
| Throwing: back wall | `flight.ts` | M11 |
| Throwing: hand 0.4s | arm state | M11 |
| Throwing: tired arm | arm meter, ring | M11 |
| Throwing: catch | catch | M11 |
| Seeing hits: landings in `lawn` | lawn pack | M12 |
| Seeing hits: puff and depth thud | peek strip fx | M12 |
| Seeing hits: head pop on hits | characters | M12 |
| Seeing hits: their clips teeter | clip records | M11 |
| Seeing hits: heavy on the horizon | heavy markers | M12, M17 |
| Chores: tap on and off | `water.ts` | M8 |
| Chores: bag to compost or the fence | `bag.ts` | M13 |
| Chores: watch the dog | `biscuit.ts` | M14 |
| Chores: re-mow | mow | M9 |
| Wrong: weeds | `weeds.ts` | M10 |
| Wrong: yanked weeds wilt | `items.ts` | M10 |
| Wrong: dandelions | `weeds.ts` | M16 |
| Wrong: snails cross and leave | `snails.ts` | M10 |
| Wrong: snail shell rules | `snails.ts` | M10 |
| Wrong: loose things drain | rest damage | M10 |
| Wrong: Biscuit digs | `biscuit.ts` | M14 |
| Wrong: Biscuit fetches, bark, cooldown, take back | `biscuit.ts` | M14 |
| Wrong: wind, vane, fair turns | `wind.ts` | M15 |
| Wrong: tailwind and headwind | `flight.ts` | M15 |
| Wrong: along-fence push | `flight.ts` | M15 |
| Wrong: gusts slide light things and carry seeds | `wind.ts` | M15, M16 |
| Last 40s: shed, crate, patio junk | finale | M17 |
| Last 40s: junk table with Junk scores | `heavy.ts`, `score.ts` | M17, M18 |
| Last 40s: crate gnomes count against you | crate spots | M17 |
| Last 40s: gnomes throw like weeds | throw rules | M17 |
| Last 40s: lift and wobble | `heavy.ts` | M17 |
| Last 40s: after a lift only a throw | `heavy.ts` | M17 |
| Last 40s: 40% shorter | `flight.ts` | M17 |
| Last 40s: drag and flatten | `heavy.ts`; blame | M17 |
| Last 40s: heavy junk sinks | `heavy.ts` | M17 |
| Last 40s: heavy left on your lawn counts | `score.ts` | M18 |
| Last 40s: thrown mower ends mowing | `heavy.ts` | M17 |
| Last 40s: trampoline cuts both ways | bounce | M17 |
| Last 40s: in the air at 0:00 freezes | round end | M17 |
| Tint: your lawn browner, grey sky | lawn layer | M7 |
| Tint: escalating greener per round | peek strip | M12 |
| Tint: junk 30% smaller | peek strip | M12 |
| Tint: sparkle never lies | sparkle art | M8 |
| Tint: no score in the round | HUD | M4 |
| Reveal: 20s timeline and steps | `Reveal`, `revealScene.ts` | M19 |
| Reveal: peel your lawn first | `revealScene.ts` | M19 |
| Reveal: 30s last reveal | `Reveal` | M19 |
| Reveal: Brenda's lines table | `score.ts` lines | M19 |
| Reveal: own fault line | `blame.ts`, `score.ts` | M18, M19 |
| Scoring: four lines | `score.ts` | M18 |
| Scoring: only lawn counts, rounding, negatives, fresh 53 | `score.ts` | M18 |
| Scoring: ties and match result | `score.ts` | M18 |
| Rounds: stretch table | `match.ts`, `seed.ts` | M7, M10, M14, M15, M17 |
| Rounds: 3 gnomes every round | `seed.ts` | M10 |
| Rounds: round 1 back-row weed | `seed.ts` | M10 |
| Rounds: round 2 dandelions | `weeds.ts` | M16 |
| Rounds: round 3 heatwave | `grid.ts`, `water.ts` | M16 |
| Rounds: same seeds both gardens | `seed.ts` | M10 |
| Angry: every listed fail | the mechanics above; tips | M8 to M17, M27 check |
| Comedy: head pop on their throw | characters | M11 |
| Comedy: head pop on your hits | characters | M12 |
| Comedy: smug laugh | sound | M11, M23 |
| Comedy: Biscuit trots their gnome | `biscuit.ts` | M14 |
| Comedy: Shake Fist | `fist` | M23 |
| Comedy: thrown mower mows | `heavy.ts` | M17 |
| Comedy: bin lid rubbish | `heavy.ts` | M17 |
| Room flow 1 and 2: home and names | `HomeClient`, `names.ts` | M5 |
| Room flow 3: start a room | `roomCode.ts` | M5 |
| Room flow 4: share | `ShareBox` | M6 |
| Room flow 5: join, code box, paste, bad link | `CodeField`, `roomCode.ts` | M5 |
| Room flow 6: lobby gates, Ready toggle, wake lock | `Lobby` | M6 |
| Room flow 7: countdown | `matchPhaseAt` | M4 |
| Room flow 8: rounds flow | `matchPhaseAt` | M4 |
| Room flow 9: match end | `MatchEnd` | M20, M24 |
| Room flow 10: rematch | room reducer | M20 |
| Room flow 11: leave and stormed off | room reducer | M20 |
| Room flow 12: Back | history guard | M20 |
| Room flow: Practice needs no name | `PracticeClient` | M21 |
| Room screens table: lobby rows | `copy.ts`, `RoomNotice` | M6 |
| Room screens table: connection rows | `RoomNotice` | M3, M22 |
| Room screens table: match end rows | `MatchEnd` | M20, M22 |
| Room screens table: Room Full, another tab, moved, bad link | `RoomNotice` | M3, M5, M6 |
| Accessibility bullets | `Lobby`, `CodeField`, layout viewport | M6, M25 |
| Drops: Away timing, throws vanish | presence | M11, M22 |
| Drops: silence only while hearing | reducer | M22 |
| Drops: Gone countdown | presence | M22 |
| Drops: back within 60s | reducer | M22 |
| Drops: walkover | reducer | M22 |
| Drops: line goes dead | reducer | M22 |
| Drops: round ends while away | fallback scoring | M18 |
| Drops: reload rebuild | `rebuild.ts` | M22 |
| Drops: reload in lobby or reveal | reducer | M22 |
| Drops: both reload | reducer timeout | M22 |
| Drops: backgrounding catch-up | `advanceTo` | M7, M22 |
| Drops: own connection drops | banner, outbox | M11, M22 |
| Drops: third person, seats | reducer; Pusher | M2, M3 |
| Drops: second tab, Play Here | Web Lock | M3 |
| Practice: no connection, same code path | memory transport | M21 |
| Practice: same rules and seeds | pure garden | M21 |
| Practice: polite, normal, petty | `profiles.ts` | M21 |
| Practice: driest patches first | `brain.ts` | M21 |
| Practice: reactions | `pemberton.ts` | M21 |
| Practice: tuning target, headless check | `headless.ts` | M21, M27 |
| Practice: reveal, replay, card | shared code paths | M21 |
| Onboarding: who counts as new, the saved fact, `?first` | `identity.ts`, session | M29 |
| Onboarding: First Match on the friend's gate, You in the top bar | `sync`, `RoomPanel`, `TopBar` | M29 |
| Onboarding: your first match by link | everything below | M28 to M39 |
| Onboarding: staged tips | `tips.ts`, `tipTriggers.ts`, session | M31, M35 |
| Onboarding: failure tips | `tips.ts`, `tipTriggers.ts`, garden events | M31, M34, M36 |
| Onboarding: the tip line and its pointers | `Notice`, `tipPointer.ts`, `gardenScene.ts` | M30, M32 |
| Onboarding: the tip queue | `tipQueue.ts` | M30 |
| Onboarding: Show Tips and Hide Tips | `Menu`, session | M30 |
| Onboarding: ghost finger and shed banner | `ghostFinger.ts`, `Notice` | M33 |
| Onboarding: failure cues for everyone | garden events, `gardenScene.ts`, `fx.ts` | M34, M36 |
| Onboarding: lobby score card and How to Play | `RoomPanel`, `Menu`, `copy.ts` | M28 |
| Onboarding: reveal counts | `judge.ts`, `revealScene.ts`, `Verdict` | M35 |
| Onboarding: coach tip | `score.ts`, `tips.ts` | M35 |
| Onboarding: repairable stripes and their cues | `grid.ts`, `lawnLayer.ts` | M36 |
| Onboarding: bots that repair stripes | `brain.ts`, `profiles.ts`, `scripts/balance.ts` | M37 |
| Onboarding: what a returning player sees | the same gating | M29, M30 |
| Onboarding: beginner playtest gate | the lead's playtest after M40 | none |
| Length bullets | timeline | M4, M27 |
| Ending: plastic lawn | `Reveal` | M19 |
| Shareable: tint peel | `revealScene.ts` | M19 |
| Shareable: share card | `share.ts` card | M24 |
| Shareable: worst-moment replay | `ReplayRecorder` | M24 |
| Shareable: trampoline bounce | bounce | M17 |
| Controls table | input pipeline; keys | M1, M8, M9, M11, M13, M14, M17, M20, M23 |
| Build: who simulates what | ownership | M1, M10, M15 |
| Build: room channel bullets | session, reducer, clock | M2, M3, M4, M18 |
| Build: messages table and packs | `protocol.ts`, codecs | M1, M2, M12, M18 |
| Build: hiding lag in the arc | `flight.ts`, receiver | M11 |
| Build: rate budget | outbox, limiter | M2, M26 |
| Build: phone performance | renderers, caps | M7, M26 |
| Build: trust and security | auth route, name rule | M3, M5 |
| Build: settings and no motion | `Menu` | M20 |
| Build: build order and cut order | milestone order | all |
| Shared foundation bullets | shared modules | M1, M6, M20, M23, M24 |

## 10. Milestones

Every milestone ends with `npx prettier --write` on touched files, then `bun run typecheck`, `bun run test` and `bun run build`. Each adds its dev hooks, its tips, its unit tests and its e2e steps, keeps the console free of errors, and updates the Code Map. UI milestones take screenshots at 1280 by 800, 390 by 844 and 375 by 667. Every number goes into `tuning.ts`.

- [x] M1: Two-Tab Fence Slice - `/r/[code]` as a thin server page awaiting `params` plus a browser-only client loaded with `next/dynamic` and `ssr: false`; the 680 by 1,060 design and its bands, with `alignY: 'end'` added to the shared `Viewport`; the `RoomSession` singleton per code, created outside React effects and closed on `pagehide`; the `Transport` interface and a basic local transport (sender ids, own frames dropped, per-tab id); a validated `throw` message; the pure `Garden` with a static grid at health 5, 4 seeded rooted weeds and 3 gnomes, the 60-unit yank, the 100-unit clamp, `ReleaseSampler` and the release rule, throw distance at 0.4 units per px/s with the 15% margin, short throws, clips that drop back, crossings, mirrored arrivals and landing crush; `handoff: false` on the shared `PointerTracker`; placeholder sketch art for lawn, fence, peek band, weeds and gnomes; dev hooks `state()`, `garden()`, `toClient()`, `act.throw()`, `spawn()`. Acceptance: `e2e/fence.mjs` opens two `?local` pages in one context, each draws its own garden, and a real mouse drag yanks a mid-lawn weed and releases it at about 1,200 px/s toward the fence; within 2s the other page's `garden()` shows a loose weed at the mirrored column and the thrower's weed is gone; a 300 px/s release puts the weed down; flight, clamp, release and codec tests pass; the console stays clean.
- [x] M2: Room Protocol Core - envelope with session, match, round and sequence; `StaleFilter`; the outbox (6 per second, keep-newest kinds, 3.5 KB split) over the 9 per second limiter; the pure room reducer for admission, seats, host by lower id, `hello`, `sync` every 2s and Ready flags; clock sync with 5 pings, the shortest round trip, the 400 ms cut and the 1.5 times resample rule; the full local transport (fake members with joins, 1s beats, 5s expiry and `pagehide` leave, the 10 per second rejection, `lag`, `jitter`, `drop`, `reorder`, `skew` and `pid`); the `?debug` net overlay. Acceptance: two `?local` tabs seat each other and agree on the host; a third tab reaches Room Full and closes its channel; reloading either tab keeps the seats and host; with `?skew=3000` on one tab the shared clocks agree within 30 ms; with `lag=150&jitter=80&reorder=0.3&drop=0.1` the fence throw still works and no stale bundle applies; reducer, filter, outbox, limiter and clock tests pass.
- [x] M3: Real Pusher Rooms - the pusher-js transport (presence channel, `player_id` and `name` auth params, sender from `metadata.user_id`, status mapping, refused, quota and 4301 handling); connection only on the room page, closed on Leave, Room Full and another-tab cases; the Web Lock with Play Here and the moved-away state; Can't Connect after 8s with Try Again and Practice Alone (a placeholder Practice page until M21). Acceptance: `e2e/pusher.mjs` puts two contexts in one real room, seats both, logs the clock round trip and throws a weed across; a third context sees Room Full and leaves the member list; two tabs in one context show "This room is open in another tab." and Play Here moves the game; the run takes under 2 minutes and under 300 events; no log prints the secret.
- [x] M4: Match Clock and Countdown - host-only `start` with match id, seed, start time and the round, reveal and last-reveal lengths after `?fast`; `matchPhaseAt` for countdown, play and reveal across 3 rounds; Ready on both tabs starts "3, 2, 1, Mow!"; the round clock in a minimal top bar through `LiveText`; a placeholder 20s reveal, then the next countdown with no Ready; garden time on the shared clock with stretches scaled for `?fast`; dev `jump(msLeft)`. Acceptance: two `?local&fast` tabs press Ready and show the same countdown, clock and reveal within 50 ms of each other through `state()`, also with `?skew=3000`; a guest that loads after `start` joins at the right phase; phase and stretch tests pass.
- [x] M5: Home Screen, Names and Codes - the home page with title, pitch, name box with a random funny default, Start a Room, Join With Code and Practice Alone; the shared name rule in the box and the auth route; code alphabet, generation, validation, link pasting, lowercase redirect and the bad-link screen; the code box with autocorrect, spellcheck and autocapitalise off, capitals shown, join on the 6th valid character and Enter to submit; arrival kind recorded for the lobby copy; identity in `localStorage`. Acceptance: "एकांश" and "அருண்" pass in the box and the auth route; "   " and "..." fail with the helper line; "k7dm2o" shows the code rule; a pasted room link joins; `/r/K7DM2Q` lands on `/r/k7dm2q`; `/r/k7dm2` shows "That link isn't a room."; screenshots show no overlap; name and code tests pass.
- [x] M6: Lobby and Room Screens - two gates with names and the Ready toggle (`aria-pressed` at first; on 2026-10-13 the waiting line became its description instead); the code in capitals grouped as K7D M2Q and read letter by letter; Copy Link with its toast, Share Link only where sharing works, a selectable link when copying fails, and "Come back here after you send it."; every lobby, Room Full, another-tab, can't-connect and bad-link row of the room table from `copy.ts`; the polite live region; focus on each screen's heading; the lobby wake lock; rejoin when the page shows again. Acceptance: `e2e/lobby.mjs` walks the started, link and typed paths and checks each alone line, Ready and Not Ready on both sides, the pulsing Ready, Room Full with Try Again, and Play Here; the live region text changes on join, ready and leave; screenshots at all three sizes.
- [x] M7: Lawn Grid, Drying and the Lawn Layer - the pure grid with health, length, mess and hole; staggered dry and grow timers with late drying; `Garden.advanceTo(t)` on fixed ticks with exact timers; the lawn `CachedLayer` with dirty-row repaint; health by colour, lightness, blades, cracks and puddles; your lawn 1 level browner under grey; stripe overlay by column parity; `?cvd`; dev `setPatch` and Dry Lawn. Acceptance: 16.7 ms steps, 250 ms steps and one 60s jump give identical packs; an idle round ends with the expected dry count per patch; `?cvd=deutan` and `?cvd=protan` screenshots show 8 distinguishable health levels; repainting every row once a second keeps lawn drawing under 4 ms a frame.
- [x] M8: Watering and the Tap - the pour after 150 ms still, the 120-unit circle, +1 per 0.4s, sparkle at 7, mud after 1.5s more, the 10s can with its level on the can; the tap toggle with a 3s fill while you play, the 8s flood of 2 patches, pouring that takes the can back; the empty-can glug and toast; drowned patches in blame; watering and tap tips. Acceptance: a held pour on a 5-health patch sparkles at about 0.8s and drowns at about 2.3s in the browser at 1280 by 800 and 390 by 844; a tap left on floods exactly 2 patches at 8s; water tests pass.
- [x] M9: Mowing, Stripes and Job Picking - the full press classifier (Biscuit placeholder, tap and bag; items, weeds and snails; grass with 12 px in 150 ms; water to mow above 200 px/s for 100 ms; no mow to water; the fast-press snap within 44 px); reach of 22 px touch and 10 px mouse with nearest wins; the mower 30 units above the finger, cuts on entry with a 250 ms cooldown and growth restart; stripes at 14 of 16; shake from 1,000 px/s and scalp from 1,300 px/s; the bag with 96 cuts drawn on it, a full bag that stops and spits clippings; mowing clears mess. Acceptance: a mouse rub down column 3 at about 600 px/s stripes it and the stripe lasts 75s; a 1,500 px/s rub scalps and counts in blame; a fast flick from grass never mows; classifier and mow tests pass.
- [x] M10: Weeds, Snails and the Starting Gnomes - schedules by index for weeds and snails per stretch; weed drain, spread and cap; wilting 20s after a yank into a mess mark with no re-root; snails crossing hedge to hedge, sliming, eating, capped at 12, shelled when grabbed and out 3s after landing; rest damage; 3 gnomes per round on the same patches in both gardens; round 1's back-row weed at 2:50 left; the 160 loose cap; tips. Acceptance: two `?local` tabs with one seed show identical spawns for 40s through `garden()`; an idle lawn reaches 40 weeds; a thrown weed wilts on the other lawn 20s after its yank; schedule, weed and snail tests pass.
- [x] M11: Full Throwing Rules - the arm meter drawn as a ring around the held item, the 1.5s lock and the 0.4s hand; hedges and wide throws; the 0.6s clip teeter on both screens through clip records; the back wall; catching; landing scuffs; throw ids from session and counter; staleness by send time in one 6s window; the crossing-time fast-forward capped at 300 ms; throws to an Away or Gone neighbour vanish; queued throws drop after 6s; the 300 ms rise out of view; the neighbour's head pop where their throw left the hand; own clips in blame; the smug laugh. Acceptance: in `e2e/fence.mjs` a soft mid-lawn swipe clips, teeters on both pages and lands on the thrower's front rows; a catch on the other page sends the item straight back; with `?lag=250` arrivals never appear mid-lawn; arm, clip, wide, catch, id and staleness tests pass.
- [x] M12: Lawn Updates and the Peek Strip - `lawn` every 1s even when unchanged, with patch bytes, counts, patio bytes, tally, markers, heavy markers and up to 8 landings; the peek strip with 4 squashed rows, their junk 30% smaller and heavy junk on the horizon; a puff and a depth-scaled thud per landing; a head pop on gnome and heavy hits; the escalating tint with sun and bird, rainbow and sprinkler, and the 3 captions. Acceptance: a gnome thrown into the other page's row 2 appears in the thrower's peek strip within 1.2s with a puff and a head pop; a landing on row 10 shows a horizon puff and no marker; the worst-case `lawn` encodes under 600 bytes; codec tests pass.
- [x] M13: Grass Bag, Compost and Heaps - the bag as a press target after the tap in the press order (M9 left it out); drag the bag onto the compost and hold 1.5s to empty; swipe it at the fence for a 2 by 2 heap over there, with a clip bursting it across your front rows; heaps smother like loose items, show in the peek strip, and clear a patch at a time by mowing at 6 cuts each; a fast drag to the compost puts the bag down instead of throwing; tips. Acceptance: the compost empties the bag; a 1,900 px/s swipe from the patio heaps the other lawn; a 1,700 px/s swipe clips and heaps your own front rows; heap tests pass.
- [x] M14: Biscuit - Biscuit first in the press order while he circles (M9 left it out); seeded digs from 2:20 left every 40s to 60s, 3 circles in 2s, a tap that sits him for 10s, a hole on a miss (counted in blame); the fetch of any light item untouched for 3s, the bark and wag at 1.5s, the trot to your back row trampling up to 4 patches, the 20s cooldown; pressing the carried item takes it back; Biscuit wins presses only while circling; his bed; tips. Acceptance: a gnome left on the lawn gets a bark at 1.5s and lies on the back row by about 5s; a tap during the circle prevents the hole; dig and fetch tests pass.
- [x] M15: Wind and the Weathervane - 6 gusts at fixed slots with ±3s jitter; alternating over-fence gusts (2 tailwinds each, 1 each in the last 40s) with a coin flip first; along-fence gusts alternating left and right; the host frame with the guest reversed; the vane 2s early; ±30% and up to 150 units sideways; light items sliding at 30 units/s; wind lines and the `wind` loop. Seeds riding over-fence gusts moved to M16, which brings the seeds. Acceptance: on two `?local` tabs, a tailwind on one is a headwind on the other at the same moment; the fairness test passes for 1,000 seeds; the frame test passes.
- [x] M16: Dandelions and the Heatwave - round 2 and 3 dandelions (1 in 4), seed clocks after 40s, 3 seeds that root after 10s, a thrown clock bursting where it lands, seeds blowing over the fence when a clock bursts in your tailwind; round banners that announce dandelions and the heatwave. The heatwave's 1.5 times drying and 6s fill already run in round 3 (wired in M7 and M8 through the garden's `heatwave` option). Acceptance: `jump` into round 2 shows dandelions turning to clocks on both tabs at the same moments; a thrown clock roots 3 weeds on the other lawn 10s after landing; tests pass.
- [x] M16b: Fast Lobby Seating - Do this before M17 (lead, 18:50). Over real Pusher the second player sees both names in the lobby within 2s of their subscription succeeding, using under 15 client events to get there, measured with `e2e/pusher.mjs` and recorded here. Seat from presence membership at once; run clock sync in the background during the lobby with about 5 pings, keeping the fastest round trip, and block only the Ready countdown on sync. M3 measured 9 to 10s and 39 to 47 events. See the Seat Time entry in Lead Decisions. Measured on 2026-10-12 with `e2e/pusher.mjs`: both names showed 293 ms after the second player's subscription succeeded, using 3 bundles plus 3 clock events already under way; the whole script ran 10s on 56 client events.
- [x] M17: The Heavy-Junk Finale - at 0:40 the shed bangs open, 15 crate gnomes spill over rows 8 to 13, and the bin, mower and trampoline roll onto the patio; the 0.6s lift with 12 px wobble, the slow-move set-down, the drag that flattens each crossed patch once (in blame), the throw at 0.6 times distance; sinking on any landing; bin litter in 4 looks; the mower's crooked scalping run; trampoline bounces at 0.9 (own bounces in blame); no mowing after throwing the mower; the last 10s tick; the 0:00 freeze. Acceptance: on two `?local&fast` tabs a dragged and lifted bin lands in the other garden, spills 4 litter and can't be grabbed; a gnome thrown onto that garden's trampoline comes back over the fence; lift, drag, sink, litter, run and bounce tests pass.
- [x] M18: Scoring, Finals and Results - `final` after catch-up with patch bytes, counts, blame and every item marker; host scoring from decoded finals, ties, `result` with breakdowns, winner, tally, totals, blame line and the host's final; the guest repeating `final` every 1s; duplicate finals answered; results applied once; the tally in host `sync` and `lawn`; the 6s fallback, at once when the guest is away; match results; rosettes in the top bar. Acceptance: across 20 `?local&fast` rounds with `drop=0.3`, both pages show identical scores and tallies every time; a guest hidden at 0:00 gets the right result when it returns; score tests cover the fresh 53, rounding, the Tidy floor, Junk below 0, ties, match end and blame.
- [x] M19: Brenda's Reveal, the Tint Peel and the Ending - the 20s reveal (time's up, your peel then theirs, count-up of the four lines with Brenda's lines, rosette, countdown) and the 30s last reveal with Brenda's squeaking plastic lawn and "It was never greener."; the peel draws both true lawns from the finals with every item; a fade under Reduced Motion; the blame line under the loser's score. Acceptance: both pages show each step within 100 ms of each other; a lawn with 12 gnomes gets the gnome line; a loss to drowning shows the drowned line; screenshots of each step at all three sizes.
- [x] M20: Match End, Rematch, Menu and Leave - the match end screen with both true lawns, Rematch and Leave; rematch flags, a new match id and seed; the menu with Settings (sound, volume, Reduced Motion), How to Play and Leave, and "The round keeps going while this is open."; the Leave dialog, `leave` and the stayer's stormed-off screen; Back through the history entry; the desktop leave warning; tips in round 1 of every match with Hide Tips; F and Escape. Acceptance: `e2e/match.mjs` plays a `?local&fast` match, both press Rematch, and a second match starts with a new seed; Back on the guest opens the dialog, and confirming sends the host to the stormed-off screen; rematch and leave reducer tests pass.
- [x] M21: Practice With Mr Pemberton - the memory transport pair; `BotNeighbour` as the guest with its own garden; the shared `brain.ts`; polite, normal and petty modes with every number from section 2.9; his reactions; scripted player profiles; `simulateMatch`; `?bot=` and `autopilot()`; Practice with no name and no Pusher connection. Acceptance: a `?fast` Practice match plays to the end with tips, and every Pemberton reaction shows at least once; `e2e/bots.mjs` runs two autopiloted `?local&fast` tabs through a match with identical results; a headless check over 40 seeds shows a learner beating polite Pemberton in at least 60% of round 1s.
- [x] M22: Disconnects, Rejoins and Background Catch-Up - presence in the reducer (Away at 3s in a round and 6s outside, counted only while hearing; Gone from the member list with the 60s countdown; walkover; no contest; `hello` on show and reconnect; `sync` with the phase; the 5s rejoin timeout); throws to an Away neighbour vanish like throws to a Gone one already do (M11); the Reconnecting banner; Away and Gone 0:42 in the top bar; catch-up on show with `final` only once caught up; the reload rebuild from the neighbour's copy; Ready reset on lobby and reveal reloads. Acceptance: `e2e/rejoin.mjs` reloads the guest mid-round and its lawn matches the host's copy plus the missed spawns; `hide(20000)` gives the same lawn as a twin garden that never hid; `fault({ offline: true })` shows Reconnecting on one tab and Away, never a walkover, on the other; closing a tab gives Gone, then a walkover; a short real-Pusher check confirms Gone on a closed context; reducer race tests pass. Measured on 2026-10-12: the reload rebuilt the guest from the host's copy with the idle host's exact weeds at all three sizes; `hide(20000)` matched its twin's lawn pack and final; 12s offline showed Reconnecting and Away with no walkover; a closed tab showed Gone, then a walkover 60s later; real Pusher showed Gone 119 ms after a context closed.
- [x] M23: Sound, Juice and Shake Fist - unlock audio on the first tap (the clip laugh and the landing thud already call `sfx` and stay silent until then); the sound map; screen shake and particles behind Reduced Motion; the Shake Fist button and F with the 3s cooldown and `fist`; angry head pops; the doorbell; win and loss stings; vibration where supported. Acceptance: every sound in the map plays at least once in a `?local&fast` round, logged through `events()`; a fist pops on the other page within 300 ms; nothing plays before the first tap. Measured on 2026-10-12 with `e2e/sound.mjs`: all 23 sounds in the map played on one page, the countdown stayed silent before the first click, and a clicked fist popped up next door 78 ms later.
- [x] M24: Replays and the Share Card - the replay recorder on the design area; the worst moment as the 3s window with the most own health lost, with labels such as "Clipped the fence. Again." and "Bounced off your own trampoline."; the slow-motion replay at match end; the share card with both true lawns, both names, "It was never greener." and the 4 stats. Acceptance: after a match with a clip, the replay shows the clip with its label; the card renders at 1080 by 1350 and downloads or shares; screenshots of both. Measured on 2026-10-12 with `e2e/replay.mjs` at all three sizes: a clip costing 2 health became the worst moment (60 frames), the match end replayed it captioned "Clipped the fence. Again.", and the card downloaded at 1080 by 1350.
- [x] M25: Phone Layout and Touch Polish - band checks at 375 by 548, 375 by 667, 390 by 844 and 1280 by 800; the top bar at 48 px or more in the design's top band, names cut to 10 characters, Gone in place of rosettes; the 20 px edge guard; touch swipes through dispatched pointer events; the landscape cover; zoom allowed outside the canvas (the root `viewport` export stops blocking it); `bun run dev:https` with a self-signed openssl certificate in `.certs/` (gitignored) for phones on the LAN; `?cvd` checks. Acceptance: `e2e/phone.mjs` throws, mows and waters by touch at both phone sizes; the top bar never covers the peek strip; nothing pressable sits above the fence catch zone; landscape shows "Turn your phone upright."; every screen's screenshot is reviewed. Measured on 2026-10-12 with `e2e/phone.mjs`: at 375 by 548, 375 by 667, 390 by 844 and 1280 by 800 the bar was 49.6 to 72 px and ended on the peek strip's top through play, Away, both rosettes and Gone, with "Gnome Hoa…" and "Compost M…" unclipped; every point over the peek strip, fence and lawn reached the canvas; touch threw a weed next door in about 1.5s, striped a column and watered a patch at all three phone sizes, and the edge guard ignored a press 19 px from either edge that a press at 21 px turned into a grab; the sideways cover showed in the lobby and in play while the garden ran on; a pinch zoomed the lobby card to 2x and left the canvas at 1x.
- [x] M26: Performance - 4x CPU-throttled profiling with 30 gnomes, a trampoline, bin litter, 40 weeds and 12 snails; cached stamps and dirty rows verified; no allocation in the per-frame path; the React commit counter flat during play; the outbox at or under 6 events per second and bundles under 3.5 KB in a petty bot match; a 3-minute catch-up under 50 ms. Acceptance: `e2e/perf.mjs` reports a throttled p95 frame time under 16.7 ms and under 1 React commit per second in a round; the measured numbers go into this plan. Measured on 2026-10-12 with `e2e/perf.mjs` on this machine's GPU at 390 by 844 and 4x throttle, with 30 gnomes, 2 trampolines, 2 bins, 4 litter, 41 weeds and 12 snails while petty autopilot threw from next door: frame work mean 1.60 ms, p95 2.60 ms, worst 3.80 ms; frame gaps p95 16.8 ms; the lawn layer p95 0.7 ms; replay copies p95 1.3 ms; 0.1 React commits a second; 12 stamps, none new; 127 lawn rows repainted in 10s; a fresh round's 179.5s catch-up in 38.7 ms and the crowded lawn's 152.7s in 51.7 ms; a guest reload 172s into round 3 rebuilt in 51.8 ms; Practice p95 1.5 ms. A petty bot match peaked at 3 bundles a second, largest 709 B.
- [x] M27: Balance Pass, Bot Against Bot - `scripts/balance.ts` runs 200 seeded matches per pairing, and `tuning.ts` changes until: a learner beats polite Pemberton in 60% or more of round 1s; an expert beats petty Pemberton in 40% to 60% of round 3s; regular against regular sits at 45% to 55%; a finale thrower and a finale mower each win 35% to 65% against each other; median Tidy at 0:00 sits between 6 and 16; the median Junk gap is at least 4 points; upkeep takes 20% to 30% of a regular's time, and 37% to 50% in the heatwave. Then two full `?local` matches by hand at desktop and phone sizes. Acceptance: every target holds; the tuned numbers are written back into this plan and `DESIGN.md`; typecheck, tests, build and every e2e script pass. Measured on 2026-10-13 with `bun run balance` at 200 seeds: learner 100%, expert against petty 54.0%, host regular 50.0%, thrower 44.0%, median Tidy 9, median Junk gap 4, upkeep 23.2% and 40.0% in the heatwave, every target passing on seed families 0 to 3 too. The tuning is in Lead Decisions (Made While Building M27). `e2e/play.mjs` played two full-length `?local` matches by hand on both pages at once: at 1280 by 800 with the mouse the guest won 2 rounds to 0 (18 to 13, 14 to 13), and at 390 by 844 with touch the host won 2 to 1 (7 to 15, 16 to 10, 11 to 5), both pages agreeing on every verdict with clean consoles.

The onboarding milestones build `DESIGN.md`'s Onboarding section. Its copy is exact: use its words, and keep "Mow!", "Somehow greener.", the tint peel, the worst-moment captions and the own-fault blame line as they are. Rules stay identical for both players. A new player gets more information, never easier rules. The Onboarding Critique Decisions in Lead Decisions explain how these milestones changed after the critique.

- [x] M28: Lobby Score Card, How to Play and Copy Fixes - What Brenda Counts on the online and Practice lobby cards, between the gates and Ready, replacing `COPY.howTo`; How to Play beside Leave on every lobby card (alone rows too), swapping the card for the 11 How to Play lines with Back, focus on its heading, focus back on the button after Back, and one status line kept in that view (the waiting line, or "neighbour_name is ready."); the menu's How to Play gets the same 11 lines, then What Brenda Counts; Ready, How to Play, Leave and the waiting line pinned at the card's bottom when it scrolls; when the countdown starts, focus moves to the top bar's menu button; today's tips and toasts take their `DESIGN.md` wording on their current triggers (start, weed, snail, back, mow, sparkle, the tap tip, hand, tired, Biscuit, bark, bag, the mower-poke, can-empty and thrown-mower toasts; the shed tip becomes "Gnomes first. Then big junk, if you dare."; the patio tip becomes "Slide it halfway up the lawn, then let go." and a first press of heavy junk on the grass earns "Now hold it still until it lifts, then swipe up."); the garden's comment that says the crate holds 15 gnomes says 12. Acceptance: `lobby.mjs` sees the card's four lines and its last line on the started, link and typed paths, and `practice.mjs` sees it in Practice; How to Play opens and closes by click and by keyboard, with focus on its heading and back on its button; at 375 by 667 Ready shows without scrolling; at 375 by 548 Ready, How to Play, Leave and the waiting line stay in view while the card scrolls; How to Play keeps the status line visible; a countdown that starts while How to Play is open moves focus to the menu button; screenshots of the lobby and How to Play at 375 by 667, 390 by 844 and 1280 by 800 show no overlap; `lobby.mjs`, `practice.mjs`, `chores.mjs`, `match.mjs end`, `bag.mjs`, `biscuit.mjs`, `finale.mjs` and `pests.mjs` pass with their expected strings updated. Measured on 2026-10-13: `lobby.mjs` saw the card on the started, link and typed paths at three sizes, opened and closed How to Play by click and by Enter with focus on its heading and back on its button, and kept the status line; at 375 by 548 and 375 by 667 the card scrolled while Not Ready, How to Play, Leave and the waiting line stayed fully in view at both scroll ends, and a countdown started from How to Play focused the menu button; `finale.mjs` saw both heavy-junk tips; all eight scripts passed.
- [x] M29: New-Player Fact - the "finished a match" fact in `localStorage` (one key, `greener-finished`), saved when the last reveal of a match Brenda decided ends on this page, online or in Practice, or when the page rejoins a decided match end, and never after a walkover, a storm-off, a no contest or a leave before the last reveal ends; dev `?first=1` and `?first=0`, which win over storage while the save still happens; whether this page gets a new player's teaching, read once at each match's start; an optional `first: true` in `sync` outside rounds, read live (the override, else the stored fact) for each message, so Back to Lobby after a first match sends no flag; the First Match tag on a new neighbour's lobby gate, in the Away tag's style and part of the gate's text; a new player's own top-bar name tag reads You during the match; a new player's Ready pulse starts only once the lobby card has shown for 6s; `state()` reports `first` for both players; contexts from the e2e helpers' `launch()` start with the fact stored, so every existing script keeps a returning player unless it passes `?first=1` or opens a fresh context. Acceptance: unit tests save the fact on a decided match end and not after a walkover, a storm-off, a no contest or a mid-reveal leave; the override wins both ways; the `sync` validator accepts messages with and without `first`; with A on `?first=0` and B on `?first=1`, A's lobby shows First Match on B's gate and B's shows nothing on A's, and B's top bar reads You in a `?fast` match while A's shows A's name; a fresh context with no override counts as new, holds the fact after a decided `?fast` match, and counts as returning after a reload; after that match, Back to Lobby leaves A's view of B's gate with no First Match; B's Ready pulses only after 6s on a new page and at once on a returning one; `lobby.mjs`, `match.mjs` and `phone.mjs layout` pass with clean consoles. Measured on 2026-10-13 with `e2e/newplayer.mjs` at 375 by 667, 390 by 844 and 1280 by 800: First Match showed only on A's screen, B's Ready began to pulse 6.0s after its card showed while A's pulsed at once, and B's bar read You; with empty storage B was new, saved the fact at the decided match end, stayed returning after a reload, and A saw no First Match after Back to Lobby.
- [x] M30: The Tip Queue and the Tip Line - a pure tip queue with no DOM and an injected clock, following `DESIGN.md`'s Tip Queue (3s to 6s, a 0.4s gap, urgent tips first and cutting in, waiting tips leaving when their moment passes and returning on their next trigger, staged tips leaving after 10s of waiting, failure tips waiting at most 2s with one held at a time, seen after 3s, failure tips once per round, time standing still while Reconnecting shows or the page is hidden, the line clearing at 0:00); tips only for a page that's new this match, or after Show Tips; one menu button reading Show Tips or Hide Tips; no tips from a frame that jumps more than 500 ms, from any step while the page is hidden, or from a rebuild; the start tip during round 1's countdown, and countdown tips only when the page's first live frame of that round falls in its countdown or first 2s of play; the tip line with its bottom on the lawn's top edge, at 18 px on phones and 20 px from 640 px wide, presses passing through; toasts and the Reconnecting banner stay in the patio strip for everyone; each tip carries a spot, fence line or patio strip, fixed when it shows, and a patio tip waits for a toast there unless it's urgent. Acceptance: unit tests with a fake clock show 4 tips raised within 1s appear in order for at least 3s each, and a 5th leaves unseen after 10s of waiting and shows on its next trigger; an urgent tip cuts a tip shown for 1s, which shows next; a dig tip still waiting when its circle ends never shows, then shows at the next circle; 3 failure tips and 2 staged tips raised within 2s show each staged tip within 7s of its trigger, with at most one failure tip waiting; time stands still while reconnecting or hidden; a 60s catch-up raises no tip; a failure tip shows once per round; in the browser a `first=1` desktop tab hidden for 20s through a sprout, an arrival and a dig shows no tip and marks none seen, and a reload at 1:30 in round 1 shows no start tip; a dev check renders every tip, toast and banner line at 18 px and finds each on one line, at most 295 px wide; a `?local&first=1` page shows round 1 tips on the fence line with none under 3s in its `events()` log, toasts still in the patio strip, and the status line's text changing with each tip; a `first=0` page shows none until Show Tips; screenshots at 375 by 548, 375 by 667, 390 by 844 and 1280 by 800 show a tip on the fence line with a gnome clipped into row 1 in full view below it; `match.mjs end` checks Hide Tips against a round 1 dig tip; `chores.mjs`, `bag.mjs`, `biscuit.mjs`, `practice.mjs` and `phone.mjs layout` (its tip-line position check) pass, with `first=1` added where they read tips. Measured on 2026-10-13 with `e2e/tips.mjs`: all 38 tip, toast and banner lines fit at 18 px, the widest 292 px; at 375 by 548, 375 by 667, 390 by 844 and 1280 by 800 the tip's bottom sat on the lawn's top edge with a row 1 gnome in view below it; in a `?fast` round 1 B saw 6 to 7 tips on the fence line, none under 3s, with the status line following and the toast in the patio strip, while A saw none until Show Tips; a desktop tab hidden for 20s through a sprout, an arrival and a dig showed and marked no tip, then showed the dig tip at the next circle; a reload at 1:30 showed no start tip; `match.mjs end`, `chores.mjs`, `bag.mjs`, `biscuit.mjs`, `practice.mjs` and `phone.mjs layout` passed.
- [x] M31: Staged Tip Triggers - `DESIGN.md`'s staged table by round, and the failure tips whose events exist today (slow, clip once the item drops back, hand, tired, drown, flood, full bag, scalp, hole, a heavy slide ending in a fast release), each naming its object (item, weed, snail, patch, column, tap, bag, vane or none) for M32; urgent marks as the table gives them; new triggers: water 25s in at health 4 or less; the sparkle tip's moment ending when the pour stops or the patch drowns; the tap turned on; your first stripe; heavy junk pressed on the patio or on the grass, each ending on release; "Mow columns now. Stripes count at 0:00." once the lawn holds no gnome after 0:40 by Brenda's count, and at 0:15 left from round 2; bark and fetch from round 2; wind by the gust's direction in this garden's frame; the first seed clock; the round 3 can tip; catches from round 3, in the patio strip; "Trust the sparkle, not the colour." after the coach tip in round 2; time triggers scaled by the round's length like the lawn schedules. The coach tip arrives in M35; the rooted, missed-flick and put-down-reason tips arrive with their events in M34, and the blocked-stripe tip in M36. Acceptance: unit tests map garden events to tips per round (bark and wind give nothing in round 1, the dig tip shows in round 1, a catch only from round 3, a round 1 tip never earned shows in round 2, a `?fast` round's water tip comes at the same share of the round as a full one); the wind tip's line matches its gust in both the host's and the guest's frame; in a seeded full-length `?local` round 1 at 375 by 667, a `first=1` page sees the start, weed, snail, back, water, dig and mow tips in that order with none under 3s, and only the dig tip between 2:20 and 2:05; a `jump` into round 2 shows the wind tip before its gust; `biscuit.mjs` and `bag.mjs` move their bark and bag tip checks into a round 2 jump, `wind.mjs` checks its round 2 tip, `finale.mjs` waits long enough for the heavy-junk tips, and all four pass. Measured on 2026-10-13: a full-length round 1 on seed 18 at 375 by 667 showed B the start tip in the countdown, then the weed tip at 5.0s, snail 13.5s, throw-back 18.5s, water 25.1s, dig 49.7s and mow 64.4s, none under 3s, with only the dig tip from 2:20 to 2:05; after a jump into round 2 each page's wind tip showed before its gust at three sizes, with opposite lines on host and guest; the bark, fetch and bag tips showed only in round 2; `finale.mjs`, `biscuit.mjs`, `bag.mjs` and `wind.mjs` passed.
- [x] M32: Tip Pointers and Placement - the small marker-yellow arrow bobbing above a tip's object, still under Reduced Motion; for a column, the arrow over row 2 and a thin outline from row 2 to the patio; no arrow where the object shows its own ring (Biscuit's dig circle, his eyeing ring, the lift ring, the compost ring); a tip whose object sits behind the tip line when it shows moves to the patio strip, and the catch tip always shows there. Acceptance: screenshots at three sizes of the arrow on a snail, on the tap and on a shaggy column with its outline, and of Biscuit's dig circle with no arrow; a 375 by 548 screenshot of a gnome clipped into row 1 while a tip shows, with the gnome in full view; with Reduced Motion on, two screenshots 300 ms apart show the arrow in the same place; a catch tip shows in the patio strip. Measured on 2026-10-13: arrows on a snail, the tap and a shaggy column with its outline, and none on Biscuit's dig circle, at 375 by 667, 390 by 844 and 1280 by 800; at 375 by 548 a gnome clipped back to 55 to 78 units stayed in full view under the clip tip; under Reduced Motion the arrow's pixels matched 300 ms apart; round 3's catch tip showed in the patio strip.
- [x] M33: Ghost Finger and the Shed Banner - the see-through finger on the nearest gnome, once during a new player's round 1 countdown and once more at 0s, the second play stopped by the first press, a still arrow under Reduced Motion, and only under M30's first-live-frame rule; the shed banner over the peek strip for 3s at 0:40 in round 1 of a first match, one 18 px line with no title ("The shed's open. Every gnome costs a point."), while screen readers hear "The shed's open. Every gnome left on your grass at 0:00 costs a point." through the status line, followed by the "Gnomes first" tip. Acceptance: screenshots mid-swipe at three sizes show the gnome under the finger; a press during the second play stops it within one frame; with Reduced Motion on, the arrow shows and nothing moves; a reload at 1:30 in round 1 shows no finger; the banner covers only the peek strip at 375 by 548 and 1280 by 800; a returning page shows neither; `finale.mjs` passes. Measured on 2026-10-13: the finger played on B's nearest gnome in the countdown and again at 0s at 375 by 667, 390 by 844 and 1280 by 800, and a press stopped the second play at once; under Reduced Motion the still arrow's pixels matched 300 ms apart; a reload at 1:30 played no finger; the shed banner stayed inside the peek strip for 2.9s at 375 by 548 and 1280 by 800, then the shed tip showed; A, a returning player, saw neither; `finale.mjs` passed.
- [x] M34: Failure Cues for Everyone - `DESIGN.md`'s Failure Cues: a blocked throw's puff with "Too soon" or "Arm's tired" for 0.8s and the arm ring's red flash; a new garden event when a release leaves a grabbed weed rooted, which shakes the weed with a dirt puff and earns "It's rooted. Pull it out first."; a new garden event when a fast flick grabs nothing, which draws the swish mark for everyone and earns "Missed. Press on it first, then swipe." when it aims within 60° of the fence with an item within 88 px, and "Too fast to mow. Press, then drag slowly." otherwise; put-downs carry their reason (slow, off-angle, bag off the compost, cancelled), so an off-angle release earns "Swipe up toward the fence.", the bag earns "Hold the bag on the compost to empty it." and a cancel earns nothing; water spilling over a full can while the tap runs; the drown splash with `squish`; "Full" on a full bag; check whether pressing a bag under 24 cuts shows the mowing toast, and if it does, make that press do nothing. Acceptance: unit tests show the garden raises the rooted event once for a short flick and never for a full yank, raises the missed-flick event on bare grass and not when a grab lands, and gives each put-down reason and each missed-flick case its tip; each cue appears within 100 ms of its cause by real input at 390 by 844 and 1280 by 800, checked through `events()` and screenshots, including a scripted fast flick on bare grass with its swish; a returning page sees every cue and no failure tip; `fence.mjs`, `chores.mjs`, `bag.mjs`, `pests.mjs throws` and `sound.mjs` pass. Measured on 2026-10-13 with `e2e/cues.mjs`: by real touch at 390 by 844 and 375 by 667 and by mouse at 1280 by 800, every cue showed on a new and a returning page within 26 ms of its cause (the swish 0 to 11 ms after the flick's first move, a rooted weed 10 to 26 ms after letting go, "Too soon" and "Arm's tired" 1 to 19 ms), and the drowned patch's `squish` in the same step; the new page got the slow, sideways, bag, rooted, missed, too-fast, too-soon and tired tips, a cancelled press earned none, and the returning page saw no tip; a press on a bag with 10 cuts poked nothing. A press on a bag under 24 cuts did show the mowing toast before: the bag sits inside the mower's reach. `fence.mjs`, `bag.mjs`, `pests.mjs throws`, `sound.mjs` and `chores.mjs` passed (its water half at its two sizes, its mow half at all three); its first rub at 375 by 667 is flaky on the committed version too (see Made While Building M34 to M36 and M38).
- [x] M35: Reveal Counts and the Coach Tip - the host counts both lawns when it judges (gnomes, bins, mowers, trampolines, heavy junk that came from next door, weeds, snails, holes, litter, clippings patches and striped columns) and the verdict carries the counts, under 30 bytes a lawn; both boards, the screen-reader table and the coach tip read the counts from the verdict; the counts on both boards at 22 design units in soft ink, between label and score, with the fit fallback to the first kind; the coach tip's pick from losses you could have prevented, its Tidy line from the biggest Tidy kind, its 7 lines, shown in a new player's tip line during the countdowns of rounds 2 and 3. Acceptance: unit tests read 17 gnomes as "17 gnomes", 15 weeds with 7 snails and 1 hole as "15 weeds, 7 snails", 11 gnomes with a trampoline as "11 gnomes, 1 trampoline", 0 stripes as "no columns", and nothing for Tidy 20 or Junk 0; the coach pick for Green 30, Tidy 10 and Junk -11 from gnomes alone is "Gnomes cost you 11. Throw them all over."; Junk -8 from 2 bins that came from next door and Tidy 15 picks the Tidy line; a Tidy loss mostly from holes picks the holes line; a lawn losing under 3 on every line with no stripes gets the stripes line, and with a stripe gets none; `reveal.mjs` sees identical counts on both pages with every step still within 100 ms, also after the guest reloads mid-reveal; a page reloaded during round 2 doesn't show the coach tip again; screenshots at 375 by 667 show every count readable and clear of its label and score; `reveal.mjs` and `results.mjs` pass. Measured on 2026-10-13: both boards showed the same counts at 375 by 667, 390 by 844 and 1280 by 800, such as "40 weeds, 12 snails" and "17 gnomes", also after the guest reloaded mid-reveal, with every step within 1 ms between pages before the reload and the reloaded guest's later steps within 100 ms once its clock synced; the screen-reader verdict read each score with its count; in `tips.mjs coach` at 375 by 667, 390 by 844 and 1280 by 800, the new player's first tip in the round 2 countdown was "Gnomes cost you 35. Throw them all over." and in round 3 "Weeds and snails cost you 20. Throw them.", each matching the last verdict, with no coach tip again after a reload in round 2 and none for the returning player; all 51 tip, toast, banner and coach lines fit 295 px, the widest the two-digit Holes line at 295 px; `reveal.mjs`, `results.mjs`, `verdicts.mjs` and `practice.mjs` passed.
- [x] M36: Repairable Stripes and Stripe Cues - tests that pin `DESIGN.md`'s Repairable Stripes rule, which the lawn already follows; one shared rule for what covers a patch, used by the live stripes and by Brenda's count (an item held in your hand or in Biscuit's mouth covers its patch); a sweep and a soft `ding` under its own sound name, `stripe`, when a column gains a stripe, a flicker when it loses one, no cue for a stripe hidden for a moment by something carried across, and no sweep under Reduced Motion; the blocked-stripe flash for everyone when one press cuts 12 or more of a column's 16 patches and it doesn't stripe, with the new player's "Weeds or junk block this stripe. Clear them." pointing at that column; stripe cues reset on every garden change and skip catch-up. Acceptance: unit tests show each of the 8 marks clears in one pass and its column stripes again, a column whose only gnome is thrown off stripes again, 3 holes or a sunk trampoline keep a column unstriped after mowing, the live stripes and Brenda's count agree with held, carried, sliding and sunk items, and the garden raises the blocked-stripe event for a 12-patch cut over 3 weeds and not for a 10-patch cut; a real-mouse check at 390 by 844 breaks a stripe with a gnome, throws it off, mows again and sees the sweep, then mows a column holding 3 weeds and sees the flash; `chores.mjs mow`, `lawn.mjs` and `sound.mjs` pass. Measured on 2026-10-13 with `e2e/stripes.mjs`, by mouse at 390 by 844 and 1280 by 800 and by touch at 375 by 667, on a new and a returning page: a slow rub striped a clear column with its sweep and the `stripe` chime; 2 long patches and a gnome on its scuff broke it with a flicker; a real flick threw the gnome off, the column stayed broken, and a second rub brought the stripe back with its sweep 110 to 169 ms into the rub; a rub down a column with 3 weeds flashed the 3 weed patches, and the new page showed "Weeds or junk block this stripe. Clear them." on that column while the returning page showed no tip; under Reduced Motion the stripe came and went with its chime and no sweep or flicker. `chores.mjs mow`, `lawn.mjs` and `sound.mjs` (24 sounds now, the chime included) passed.
- [x] M37: Bot Finale and Balance Re-Run - `bun run balance` prints, for the finale mower's rounds, why each column failed at 0:00 (long, marked, covered or sunk) and the median Stripes for the regular, the mower and the closer; from 0:15 left, players with `mowAfter` stop throwing, compost if the bag is near full, and mow columns with at most 2 bad patches and no sunk junk; a new `closer` plan throws its crate gnomes, then from 0:18 left only mows columns back to back, composting when the bag fills and keeping its mower until the last seconds; petty Mr Pemberton keeps his mower, re-mows late and throws the mower in the last few seconds; new targets: the finale mower holds at least 1 striped column at 0:00 in at least half its rounds, and thrower against closer and mower against closer each land within 35% to 65%; the expert against petty target is measured with the expert playing the closer's finale. Retune bot play first. If the closer dominates, tune toward throwing, for example fewer points per stripe, and record the runs in Lead Decisions. The stripe rule stays at 14 of 16 patches. Acceptance: every M27 target (learner against polite, expert against petty, host regular, thrower against mower, median Tidy, median Junk gap, calm upkeep, heatwave upkeep) and the three new ones pass at 200 seeds on families 0 to 3, with the numbers written here and in `DESIGN.md`; `bots.mjs` and `play.mjs desktop` pass. Measured on 2026-10-13 at 200 seeds on families 0 to 3: learner 100%; expert (closer) against petty 46.0% to 49.0%; host regular 48.5% to 51.8%; thrower against mower 48.0% to 51.9%; thrower against closer 54.0% to 59.8%; mower against closer 54.5% to 61.1%; the finale mower striped at 0:00 in 97.6% to 98.1% of rounds; median Tidy 9 and Junk gap 4 in every family; upkeep 23.6% to 23.7% and 39.9% to 40.1% in the heatwave. Median Stripes at 0:00 is 8 for the regular, the mower and the closer. The closing stretch mows before it throws, and regulars close from 0:08 left (see Made While Building M37). `bots.mjs` passed, and `play.mjs desktop` played a full-length 3-round match by hand in 10.3 min with both pages agreeing on every verdict; a full-length Practice round with Mr Pemberton forced petty showed his first late stripe at 0:14 and his mower landing next door at 0:03.
- [x] M38: Found Bugs - the live region and the screen-reader verdict clear when a new match starts, so a rematch never reads "neighbour_name wins the match." again; the top bar's clock shows the coming round's full time through every countdown instead of 0:00. Acceptance: after a rematch's countdown, `match.mjs end` finds no line from the last match in the live region or the verdict text; screenshots of round 1 and round 2 countdowns show 3:00; `match.mjs` passes. Measured on 2026-10-13: in `match.mjs end` at 375 by 667, 390 by 844 and 1280 by 800, the round 2 countdown's clock read 0:45 in `?fast` rounds, and after a rematch neither page's live region nor verdict text held a line from the last match; `match.mjs countdowns` showed 3:00 through full-length round 1 and round 2 countdowns at 375 by 667; `match.mjs end` passed.
- [x] M39: First Match by Link, End to End - `e2e/firstmatch.mjs`: one `?local` context with cleared storage; A starts the room with `?first=0`; B opens the room link with no override, so empty storage makes B new; both press Ready, then `hand.mjs` plays a whole match on both pages (B by touch at a phone size, A by mouse at 1280 by 800), `?fast` by default and full-length with `full`. Both runs check: First Match on B's gate on A's screen only; You in B's top bar; no tip under 3s and none on A; wind and bark tips never in round 1; the coach tip first in rounds 2 and 3, matching the last verdict; the ghost finger and shed banner on B only; identical reveal counts on both pages; the saved fact after the last reveal; no tips in the rematch; after Back to Lobby, no First Match on B's gate. The full-length run also checks B's tips by stage. It screenshots B's lobby, the ghost finger, a pointer, the shed banner, a reveal with counts and the match end. `pusher` runs only the lobby over real Pusher in two contexts, with B's storage empty, and checks the First Match tag in under 30 client events. Acceptance: the script passes with B at 375 by 667 and at 390 by 844, `fast` and `full`, and the `pusher` lobby run passes once. Measured on 2026-10-13 with `e2e/firstmatch.mjs`: the copied link carried `?local` and `?fast` but not A's `?first=0`, and B opened it as a new player. At 375 by 667 and 390 by 844, `fast` and `full`, First Match showed only on A's screen, B's top bar read You, every one of B's tips showed 3s or more and only from its round, A saw none, and no wind or bark tip came in round 1. B's coach tips came first in each later countdown and matched the verdict, such as "Gnomes cost you 14. Throw them all over." and "Junk cost you 17. Throw it from halfway up." after B's own trampoline sank at home. The finger and the banner showed on B only, both boards showed the same counts every round, and B saved the fact as the last reveal ended. The rematch showed B no tip in its countdown and first 6s, and once B left and opened the link again, A's lobby showed no First Match. The full runs played 2 rounds in 7.9 min at 375 by 667 and 3 rounds in 11.2 min at 390 by 844; the water tip came 25s or more into its round and the stripes tip in the last 40s. The `pusher` lobby run showed the tag in 13 client events. `tips.mjs coach` passed after its helpers moved to `lib.mjs`.
- [x] M40: Final Pass - Acceptance: `npx prettier --write` on touched files, then typecheck, tests and the production build pass; at all three sizes `lobby.mjs`, `match.mjs`, `chores.mjs`, `bag.mjs`, `biscuit.mjs`, `fence.mjs`, `finale.mjs`, `reveal.mjs`, `results.mjs`, `phone.mjs`, `practice.mjs`, `practicetest.mjs`, `playtest.mjs`, `replay.mjs`, `endings.mjs`, `rooms.mjs`, `wind.mjs`, `pests.mjs`, `sound.mjs` and `firstmatch.mjs` pass with clean consoles; `prodcheck.mjs` on a production build shows a new player's Practice tips from empty storage, ignores `?first`, and saves the fact at the match end; `bun run balance` still passes every target; screenshots of every new screen and cue at 375 by 667, 390 by 844 and 1280 by 800 are reviewed; `DESIGN.md` and this plan match what shipped; the Code Map lists every new and changed file, including `endings.mjs`, and its `finale.mjs` line says 12 crate gnomes; Lead Decisions records every call made while building. Measured on 2026-10-13 and 14: Prettier, typecheck, 395 unit tests and the production build passed, and `bun run balance` passed every target. On the final code, one batch passed `lobby`, `match`, `chores`, `bag`, `biscuit`, `fence`, `finale`, `results`, `phone`, `practice`, `replay`, `wind`, `pests`, `sound`, `tips`, `stripes` and `newplayer`, each at its three sizes, plus `practicetest`, `playtest`, `endings` and `rooms` at desktop, phone and small, and `firstmatch` fast at 375 by 667, 390 by 844 and 1280 by 800, all with clean consoles; `reveal.mjs` and `cues.mjs` passed on reruns (see Made While Building M40). `prodcheck.mjs` on the production build showed a new player's start tip from empty storage despite `?first=0`, kept the fact unsaved until Mr Pemberton won the full-length Practice match 2 to 0, saved it then, and showed no tip with the fact stored and `?first=1`. Screenshots of the lobby with What Brenda Counts and How to Play, First Match, the ghost finger, a pointer, the shed banner, the coach tip, reveal counts, failure cues, stripe cues and the match end were reviewed at 375 by 667, 390 by 844 and 1280 by 800. The final pass found and fixed a guest stranded on the match end through a whole rematch round, a tip that could cover a front-row gnome's hat, a wind tip that usually missed its gust, and the vane's wobble under Reduced Motion.

After M40 the lead ran the beginner playtest in `DESIGN.md`'s Beginner Playtests (then called the Beginner Playtest Gate) on 2026-10-14. The link joiner never mowed a whole column in their first match, which fails a basic move, so the yard milestones below follow. Beginner Playtest Decisions in Lead Decisions turns each reported problem into a milestone or records why it was rejected.

- [x] M41: Copy, How to Play and Screen-Reader Fixes - the tip lines from `DESIGN.md`'s Onboarding, on their current triggers: "Drag the weed out first, then swipe it up." (258 px), "It's rooted. Drag it until it pops out." (230 px), "Hold still on brown grass until it sparkles." (270 px), "Too soon. Wait half a second." (186 px), "Seed clock. Drag it out and throw it over." (263 px), and the fetch tip naming what Biscuit carries, "Biscuit has your gnome. Press it.", for a weed, dandelion, seed clock, seed, gnome or litter (widest "Biscuit has your seed clock. Press it.", 236 px); cut "Trust the sparkle, not the colour." from round 2, leaving the coach tip; the 13 How to Play lines in the lobby and the menu (the yard gets them in M45), with the "More below" cue: a fade on the list's bottom edge and the line with a down arrow while any line sits out of view, both gone once the last line shows; round banners spoken as one sentence, the title then the whole line ("Round 2: Dandelions. 1 weed in 4 is a dandelion. Its seed clock bursts where it lands."), with the visible title and line hidden from screen readers, as the shed banner already does; your own top-bar tag reads You for every player in every match, replacing M29's new-player-only rule. Acceptance: unit tests show the fetch tip names each fetchable kind, no tip raises the cut line, and a new page's round 2 countdown queues only the coach tip; `tips.mjs lines` finds every tip, toast and banner line at 18 px within 295 px, every fetch variant included; `lobby.mjs` at 375 by 548, 390 by 664 (390 by 844 with browser bars, where the tester lost lines 10 and 11) and 1280 by 800 sees "More below" while line 13 is out of view in the lobby's and the menu's How to Play, sees it go once scrolled to the end, and finds Back and the status line still in view; Chromium's accessibility tree (CDP `Accessibility.getFullAXTree`) holds the round 2 banner as "Round 2: Dandelions. 1 weed in 4 is a dandelion. Its seed clock bursts where it lands." and the shed banner's region as its spoken sentence alone; `newplayer.mjs` sees You in A's and B's own top-bar slot while each sees the other's name; screenshots of both How to Play views at 375 by 667, 390 by 844 and 1280 by 800; `tips.mjs`, `biscuit.mjs`, `cues.mjs`, `firstmatch.mjs fast`, `newplayer.mjs`, `practice.mjs`, `phone.mjs`, `lobby.mjs` and `pests.mjs` pass with their expected strings updated.
- [x] M42: Pulling, Missed Flicks and New Weeds - for every player: while you hold a rooted weed, dandelion or seed clock, it leans toward your finger and a marker-yellow pull ring round it fills with your finger's distance from the press, full at the 60-unit pull, where it pops out with a dirt puff and the existing `pop` (no lean under Reduced Motion, the ring still fills); the missed flick's swish redrawn as three grey dashed strokes with a dust puff where the flick began, checked against what a throw draws in flight so the two can't be confused; a small dirt puff on every new weed's patch, whether it sprouts, spreads or roots from a seed, with no sound; a new put-down reason, `still`, for letting go of a light item held 0.4s or more that never moved 12 px from the press, which earns a new player "Swipe it up to throw it. Water bare grass." (264 px) instead of the slow tip, while a rooted weed held still keeps the rooted tip and a cancelled press still earns nothing. Acceptance: unit tests show the garden reports pull progress from 0 to 1 by distance in any direction and the yank at 60 units, the release rule names `still` for a 0.5s hold that moved 8 px and `slow` for one that moved 40 px, `still` maps to its tip, and sprouts, spreads and rooted seeds each raise the puff; by real touch at 390 by 844 and 375 by 667 and by mouse at 1280 by 800, a 30 px drag from a rooted weed shows its ring part full in a screenshot and a longer drag pops it, a fast flick on bare grass shows the new swish in a screenshot beside a real throw in flight, and a held-still gnome earns the still tip on a new page and no tip on a returning one, each cue within 100 ms of its cause measured as `cues.mjs` does; `cues.mjs`, `fence.mjs`, `pests.mjs throws`, `chores.mjs` and `sound.mjs` pass.
- [x] M43: Stripes You Can See - `DESIGN.md`'s stripe look and ticks: a cut patch shows short mow lines until it grows long again; both stripe shades draw lighter and greener than unstriped grass at the same health, under your lawn's grey wash, so neither reads as brown; a white chalk tick on the patio's edge under each column the settled stripes mark, which turns into a red cross for 1s when the column loses its stripe, beside M36's flicker (no fade under Reduced Motion); a new player's staged tip on their first stripe lost to something covering or marking it, from round 1, "Stripe broken. Clear it and mow again." (248 px) on that column, but not for a stripe that lapses as its grass grows back, one hidden by something carried across, or one lost in catch-up. Ticks and the cross reset with M36's stripe cues. Acceptance: unit tests show the broken-stripe trigger fires for a weed landing on a stripe and for a scuff, and not for growth, carrying or catch-up, and that the ticks follow `settledStripes()`; screenshots at 375 by 667, 390 by 844 and 1280 by 800 show a column halfway through a pass with its cut patches visible, an even and an odd striped column at health 3 and at 5 whose mean lightness beats their unstriped neighbours', the tick row with no tick hidden by a patio prop, and the red cross after a gnome lands on a stripe, plus `?cvd=deutan` and `?cvd=protan` shots of the stripes; `stripes.mjs` sees the broken-stripe tip on a new page and none on a returning page; `perf.mjs` keeps the throttled p95 frame time under 16.7 ms and the lawn layer's p95 at or under 1 ms; `stripes.mjs`, `lawn.mjs`, `chores.mjs mow` and `perf.mjs` pass.
- [x] M44: The Yard Lawn - a yard option on the garden that turns off every schedule (weeds, snails, drying, growth, Biscuit, wind, dandelions, the shed) and the end time, and keeps every throw local: a throw that crosses the fence vanishes with a puff in the peek strip at its column, and the yard never reaches the transport (no throws, lawn reports, finals, clips or head pops), the worst-moment recorder or blame, while sounds play as normal; the pure yard steps in `src/game/yard.ts` from `DESIGN.md`'s The Yard (a gnome in row 8, a weed rooted on row 15 in another column, then one clear column grown to length 3 with M32's outline), each done on its event, with an object that rests on the patio or against a hedge going back to its start after 1s; the step lines in the tip line with M32 pointers; failure cues as in a match, with each failure tip shown every time for 3s before the step line returns; the ghost finger per step (M33's gnome swipe; pressing the weed, dragging it out, then swiping up; a slow rub down the column and back), played as each step starts and again after 2 failed tries in a row, stopped by any press, and a still arrow under Reduced Motion; dev `yard()` (open, step, finished steps, skipped) and `act.yard()`. In this milestone the yard opens only by dev hook, over a hidden lobby card. Acceptance: unit tests show a yard garden ticked for 10 minutes raises no sprout, snail, circle, gust, dry or growth event, each step finishes on its crossing or stripe and not on a clip, a put-down or a hedge hit, a resting object returns to its start, and step 3 picks only a column with no mark, item or hole; in a `?local` pair with B at 375 by 548, 375 by 667 and 390 by 844 by touch and at 1280 by 800 by mouse, B finishes all 3 steps by real input while A's `garden()` pack and event log stay unchanged and B's dev net counters show no frame kind beyond hello, sync and clock pings; a soft back-row throw clips, teeters, drops back with the clip tip, and the step stays open; screenshots of each step's line, pointer and ghost finger at all four sizes, with the line and pointer clear of the step's object; consoles stay clean.
- [x] M45: The Yard in the Lobby - **Try the Yard** as the main button on a new player's online and Practice lobby cards, with Ready beside it, shown while the page counts as new by the live fact (the override, else storage) like the `sync` flag, so returning players and Back to Lobby after a first match show none; after the yard is finished or skipped it stays as a plain button that starts again from step 1; the yard bar in the top band (How to Play, "The Yard" with "Step 2 of 3", Skip) and the panel over the patio (the status line and Ready, which toggles to Not Ready); focus on "The Yard" when it opens; How to Play there with Back to the same step; Skip and "That's a stripe. Yard done." return the lobby card with focus on Ready; a new player's Ready pulses only once their friend is Ready, the card has shown 6s and the yard is finished or skipped, and never while it's open; an optional `yard` of 1 to 3 in lobby `sync`, read live like `first`, so the friend's pinned status line reads "neighbour_name is trying the yard (2 of 3)." while the new player is in the yard and not Ready, with Ready's "neighbour_name is ready." taking over once pressed; both Ready mid-yard starts the countdown, closes the yard at once, cancels a press in progress, swaps in the round's garden and moves focus to the menu button; Leave, Room Full, another tab and Can't Connect close the yard first; finishing step 2 marks round 1's weed tip seen and step 3 the mow tip, for the coming match; a reload forgets the yard. Acceptance: unit tests show the `sync` validator accepts `yard` 1, 2, 3 or absent and rejects 0, 4 and strings; the room state gives the yard line only while the neighbour isn't Ready; the pulse rule holds across friend Ready, 6s and yard state; finished steps mark their tips and skipping marks none; a new `e2e/yard.mjs`, with A on `?first=0` and B opening the copied link from empty storage at 375 by 548, 375 by 667 and 390 by 844 by touch and at 1280 by 800 by mouse, sees Try the Yard on B's card only, A's line reading "… is trying the yard (1 of 3)." within 2.5s of B opening it and following each step, B's Ready free of the pulse while the yard is open though A is Ready, How to Play and Back returning to the same step with focus on How to Play, and Skip at step 2 returning the card with focus on Ready, which then pulses; a second run finishes all 3 steps, and B's round 1 shows the start tip and the dig tip but no weed or mow tip; a third run has B press Ready inside the yard with A Ready, and the countdown starts, the yard closes, a pointer held down across the start does nothing in round 1, and B's garden at play start matches the seed's fresh garden; B's frames during the yard are hello, sync and clock pings only; a new player's Practice lobby shows Try the Yard, and Ready pulses once it's finished; screenshots of the card with Try the Yard, each step with bar and panel, How to Play from the yard and A's yard line at all four sizes, with box checks that the bar, panel and step line never cover the step's object at 375 by 548; one real-Pusher lobby run shows B's yard line on A within 3s in under 30 client events; `lobby.mjs`, `newplayer.mjs`, `practice.mjs`, `phone.mjs layout` and `firstmatch.mjs fast`, which gains a `yard` option, pass. Measured on 2026-10-14 with `e2e/yard.mjs`, B opening the room link from empty storage by touch at 375 by 548, 375 by 667 and 390 by 844 and by mouse at 1280 by 800: Try the Yard showed on B's card only, focus landed on "The Yard", and A's status line read "… is trying the yard (1 of 3)." 651 ms to 1,888 ms after B opened it, then followed steps 2 and 3, with A's live region speaking each step; B's Ready in the panel never pulsed with A Ready. The bar, panel and step line cleared the gnome, the back-row weed and the column at every size, and step 3's chalk tick showed above the panel. How to Play and Back kept step 2 with focus on How to Play; Skip at step 2 brought the card back with focus on a pulsing Ready. Try the Yard then started again from step 1, and all 3 steps passed by real input, a soft back-row throw at 1,425 to 1,457 px/s clipping with its tip while the step stayed open. In each following `?fast` match B's round 1 showed the start and dig tips and never the weed or mow tip, though weeds sprouted and a column went shaggy. B sent only hello and sync, and A's lawn and log stayed untouched. `ready` at all four sizes: Ready pressed by keyboard inside the yard with a finger held on the gnome started the countdown, closed the yard at once and focused the menu button; the held press did nothing in round 1, and B's garden matched the seed's fresh twin at play start and after the press. Practice at 375 by 667 and 1280 by 800 led with Try the Yard, read "Mr Pemberton is ready." in the panel, and pulsed Start once the yard was done. Over real Pusher, A read B's yard line 2.03s after B opened it, in 14 client events. Unit tests cover the `sync` validator, the yard line only while the neighbour isn't Ready, the pulse rule and the tips finished steps mark. `lobby.mjs`, `newplayer.mjs` (B's pulse now waits for the yard too), `practice.mjs`, `phone.mjs layout`, `firstmatch.mjs small fast yard` and `firstmatch.mjs phone fast` passed.
- [x] M46: Playtest Clock - dev builds only: `__game.pause()` and `__game.resume()` freeze and restart game time on every page of a `?local` room and in Practice, covering the round clock, both gardens, Mr Pemberton, the tip queue's time, the countdown and the reveal; in `?local` the call goes over a dev-only `BroadcastChannel`, so both tabs stop at the same shared-clock moment and restart together, and the room's timeline shifts by the paused span; presses during a pause do nothing; the clock in the top bar reads "Paused"; real Pusher rooms ignore it, and production builds hold neither function; `lib.mjs` gains `pauseAll()` and `resumeAll()`. Acceptance: unit tests show phase and round times with paused spans match an unpaused run shifted by the span; in a `?local&first=1` full-length round 1, pausing both pages at 2:30 for 60s keeps garden `t`, the clock text, the tip on show and Biscuit's state equal across five samples 10s apart, and the round ends 60s later on both pages with matching verdicts; a pause through a reveal and through a countdown resumes at the same step; a Practice pause also stops Mr Pemberton; `prodcheck.mjs` finds no pause in the production build; `match.mjs` and `practice.mjs` pass. Measured on 2026-10-14 with `e2e/pause.mjs` at 375 by 667: a `?local&first=1` full-length round 1 paused at 2:30 stood still on both pages at garden t 30,016.7 ms, the clock reading Paused, with the same tip, Biscuit and phase across five samples 10s apart; a real flick on a gnome during the pause changed nothing; the round ended 60.17s later than before the pause, and both pages agreed on the verdict. A pause through a reveal's count and through round 1's countdown held each for 5s and resumed at the same step on both pages. In Practice at 375 by 667, 390 by 844 and 1280 by 800, the pause stopped Mr Pemberton's garden and hands, and a gnome held as it began went down with reason `cancel` and no tip once time ran again. A real Pusher room returned null and never paused. Unit tests show game time standing still through a pause and every later phase matching an unpaused run 60s earlier, spans adding up across pauses, and a resume set before the pause doing nothing. `match.mjs` and `practice.mjs` passed, and `prodcheck.mjs` found no `window.__game` and no pause in the production build.
- [x] M47: Final Pass - Acceptance: `npx prettier --write` on touched files, then typecheck, tests and the production build pass; at 375 by 667, 390 by 844 and 1280 by 800, `lobby.mjs`, `match.mjs`, `chores.mjs`, `bag.mjs`, `biscuit.mjs`, `fence.mjs`, `finale.mjs`, `reveal.mjs`, `results.mjs`, `phone.mjs`, `practice.mjs`, `practicetest.mjs`, `playtest.mjs`, `tips.mjs`, `cues.mjs`, `stripes.mjs`, `newplayer.mjs`, `yard.mjs` (with its `ready`, `still` and `practice` parts), `pause.mjs` (`reveal`, `countdown` and `practice`; `round` once at one size), `wind.mjs`, `pests.mjs`, `sound.mjs` and `firstmatch.mjs` (fast, with and without the yard) pass with clean consoles; `cues.mjs` confirms by real input the two fixes the testers couldn't check: a new player's sideways release earns "Swipe up toward the fence.", and on a returning page a screenshot 250 ms after an empty flick shows the swish while sideways and downward releases leave the item where it was let go, with no tip; `prodcheck.mjs` on a production build shows Try the Yard from empty storage, no pause, and the fact saved at the match end; `bun run balance` still passes every target, as no rule changed; screenshots of every new screen and cue at all three sizes are reviewed; `DESIGN.md` and this plan match what shipped; the Code Map lists every new and changed file; Lead Decisions records every call made while building. Measured on 2026-10-14: Prettier, typecheck, 425 unit tests and the production build passed, and `bun run balance` passed all 11 targets at 200 seeds on family 0 (learner 100%, expert against petty 48.0%, host regular 48.5%, thrower against mower 51.9%, thrower against closer 59.2%, mower against closer 58.6%, the finale mower striped at 0:00 in 98.1% of rounds, median Tidy 9, Junk gap 4, upkeep 23.6% and 40.0% in the heatwave). `lobby`, `match`, `chores`, `bag`, `biscuit`, `fence`, `finale`, `reveal`, `results`, `phone`, `practice`, `tips`, `cues` (390 by 844, 1280 by 800 and `small`), `stripes`, `newplayer`, `yard` (all four sizes, `ready`, `still` and `practice`), `pause` (`reveal`, `countdown` and `practice` at 375 by 667, 390 by 844 and 1280 by 800, `round` at 375 by 667), `wind`, `pests` and `sound` passed with clean consoles, as did `practicetest` and `playtest` at desktop, phone and small, and `firstmatch` fast with and without the yard at 375 by 667, 390 by 844 and 1280 by 800. Eight scripts failed once and then passed: `chores`, `pests`, `cues` and `pause countdown` after test fixes, and `bag`, `yard`, `reveal` and `phone` unchanged (see Made While Building M47). `cues.mjs` saw a new player's sideways release earn "Swipe up toward the fence.", sideways and downward releases leave the gnome 100 units from where it was pressed, at rest where it was let go, with no tip on the returning page, and the swish still drawn in a screenshot 250 ms after an empty flick. `prodcheck.mjs` on the production build showed Try the Yard from empty storage, found no `window.__game` and no pause, and saved the fact only at the full-length match end. The yard's friend line now arrives 15 ms to 156 ms after B opens the yard in `?local`, and 47 ms over real Pusher in 11 client events. Screenshots of the yard's steps, bar, panel and patio strip, How to Play with "More below", the pull ring, the swish at 250 ms, stripe ticks and the broken-stripe tip, the coach tip, the paused clock in play and in a reveal, and Practice's yard were reviewed at 375 by 667, 390 by 844 and 1280 by 800.

After M47 the lead runs the beginner playtests again, as `DESIGN.md`'s Beginner Playtests describes: a fresh link joiner against a host who plays like a regular, and a fresh Practice tester, each pausing with the playtest clock while they decide.

## 11. Lead Decisions

Ekansh delegated every design, tuning and balance decision to the lead and is not available to answer questions. Make the call yourself, record it here with a one-line reason, and move on. Never leave work waiting on him.

- **Seat time on real Pusher (lead, 2026-10-12 16:35):** M3 measured 9 to 10s for two browsers to seat each other, using 39 to 47 client events. Target: the second player sees both names in the lobby within 2s of their Pusher subscription succeeding, using under 15 client events. Seat from presence membership at once, and run clock sync in the background during the lobby with fewer pings (for example 5, keeping the fastest round trip). The next builder fixes this before starting a new milestone and re-measures with `e2e/pusher.mjs`. Reason: a friend clicking your link must not wait 10s staring at a lobby; Pusher itself joined both players in 255 ms in the lead's test. **Resolved in M16b:** seating already ran on the hello and sync handshake at once after the subscription (293 ms, 3 bundles), and clock sync already ran in the background with 5 pings keeping the fastest; only the Ready hold was missing.

### Made While Writing DESIGN.md (2026-10-12)

Still in force:

- **Best of 3 ends at 2 wins.** Reason: the standard rule, and a 2-0 match stays near 8 minutes.
- **`lawn` uses 1 byte per patch.** Reason: Pusher counts messages, not bytes. The byte now holds 3 bits of health, 2 of length and 3 of top state.
- **Mowing has no direction.** Stripe shade comes from column parity, and a column counts at 14 of 16 short, clean patches. Reason: rubbing on a phone can't control which stroke comes last.
- **No tool switcher.** One finger does every job. Reason: phones.
- **Overwatering makes mud, and your own lawn is drawn 1 level browner.** Reason: the tint causes a fail that is your own fault, with an honest warning (the sparkle).
- **Clipped throws always drop back on the thrower's side.** Reason: the clip must read as your fault.
- **Heavy junk can't clear the fence from the patio.** Reason: dragging forward flattens your lawn, which is the petty cost.
- **The trampoline bounces landings back at 90% speed.** Reason: it delivers the runner-up clip and makes throwing it a gamble.
- **Throwing your mower ends your mowing for the round.** Reason: a sacrifice needs a cost.
- **Both gardens get the same weeds, snails and wind from the round seed.** Reason: fairness.
- **Throws in the air at 0:00 don't count.** Reason: the final grids must not disagree.
- **No coins, upgrades or Assist Mode.** Reason: equal rules head to head.
- **Shake Fist is the only emote, at most once every 3s.** Reason: one petty channel under 0.34 events per second.
- **Room codes skip 0, o, 1, l and i.** Reason: friends read codes aloud.
- **Names: Brenda from Number 7, Biscuit, Mr Pemberton.** Reason: named characters make lines funnier.
- **Ending: Brenda's own lawn is plastic.** Reason: it lands the idiom.
- **Cut order: the mower's landing run, dandelions, catching, Shake Fist, the heatwave.** Reason: scope is the biggest risk.

Replaced during planning:

- **Players and host from a server join stamp:** replaced by seats for the first two to meet and host by lower id (N2).
- **Throw distance 0.6 units per px/s:** replaced by 0.4 with the 100-unit clamp and the 640-deep lawn (F3, U1).
- **Reload rejoins with an overgrown lawn:** replaced by the rebuild from the neighbour's copy (U21).
- **Away 3s, Gone after 15s Away, walkover after 60s Gone:** replaced by hearing-aware silence, Gone from the member list, and no contest (N3, U5).
- **`final` sent 3 times with a `lawn` fallback on both screens:** replaced by host-decided results (N1).
- **Pemberton runs without physics; body caps of 40 awake and 80 loose:** replaced by no physics library at all and a 160 loose-item cap (N11).
- **Matter.js for the garden:** dropped (N11).

### Made While Planning (2026-10-12)

- **Design space 680 by 1,060, end-aligned, with fixed bands.** Reason: the HUD fits inside the budget, and spare height on tall phones lowers the fence toward the thumb.
- **The top bar sits over the design's top band, never pinned to the screen top.** Reason: it then sits directly above the peek strip on every screen.
- **Two additive shared changes: `handoff: false` on `PointerTracker`, `alignY` on `Viewport`.** Reason: both are backward compatible and small.
- **Mower speed limits in screen pixels.** Reason: one hand-speed rule with throws (U17).
- **Release sampler window 100 ms, pairs at least 8 ms apart.** Reason: matches the critic's rule and ignores event jitter.
- **Grab reach 22 px touch, 10 px mouse; fast-press snap within 44 px.** Reason: twice the reach for a missed grab, still in pixels.
- **The crate's 15 gnomes spill across your rows 8 to 13 and count against you.** Reason: a hot-potato finale, with hard throws that clip.
- **Biscuit drops fetched items on your back row.** Reason: they still count, and they sit at the hardest throw spot.
- **Snails leave at the far hedge after about 60s.** Reason: a second sink so clutter stays countable.
- **Loose unwilted weeds count for Tidy like rooted ones.** Reason: a weed on the lawn is a weed to Brenda.
- **Each clippings heap patch counts 0.5 for Tidy.** Reason: the design's "heap" needed a unit, and patches are what the grid stores.
- **Each score line rounds half up, and totals can go below 0.** Reason: whole points on screen, and a negative score is funny.
- **Blame weights: drowned 0.7, scalped 0.5, clip 1.0, flattened 0.1, bounce 1.5, dig 1.0.** Reason: rough point costs from the scoring rules; good enough for a joke line.
- **Reveal: rounds 1 and 2 run 20s; the last runs 30s, sharing the first 17s.** Reason: both screens know which branch by 17s.
- **`?fast`: 45s rounds, stretches scaled, reveal timeline at 0.5.** Reason: a whole e2e match in under 4 minutes.
- **Gusts in 6 fixed slots: over A, along L, over B, along R, over A, over B.** Reason: equal tailwinds overall and in the finale.
- **Heavy junk sinks on any landing, including your own lawn.** Reason: a short heavy throw becomes your own Junk, which reads as your fault.
- **A thrown mower always lands upright and runs.** Reason: a coin flip would be the only random fail in the game.
- **The tap keeps running when you pour, and floods after 8s.** Reason: the toggle needs its own fail to stay a chore.
- **Session ids are the page-load time in base36 plus 4 random characters.** Reason: they grow over time with no shared counter.
- **Every bundle has one sequence number; `lawn` and `sync` keep the newest.** Reason: one counter, two rules.
- **Silence threshold 3s in a round, 6s outside.** Reason: `lawn` beats every 1s in a round, `sync` every 2s outside.
- **No contest after 60s of heard silence while the neighbour is still listed.** Reason: only the member list can prove who left.
- **Practice runs through a memory transport with Pemberton as guest.** Reason: Practice exercises the real protocol, and the human hosts and scores.
- **Pemberton's id sorts last.** Reason: you are always the host in Practice.
- **Local player ids live in `sessionStorage`, with `?pid=` to force one.** Reason: reloads keep the id, and second-tab tests stay possible.
- **Names: NFC, letters with combining marks, digits, spaces, `'.-`, at least 1 letter or digit, 16 graphemes; the server also caps at 64 code points.** Reason: real names pass, and the server bounds its input.
- **Tips show in round 1 of every match and in Practice, with Hide Tips per page load.** Reason: no new storage (U20).
- **No reload penalty.** Reason: phones reload on their own, and the rebuild already includes everything missed (U21).
- **Throw arc `H = max(300, 0.6 D)` and `T = 800 + 0.4 D` ms; the neighbour's head pop masks low arrivals.** Reason: a front-row lob can't rise out of view in time, and the head makes the pop-in a joke.
- **`final` carries a marker for every item.** Reason: the reveal must draw "mud under 14 gnomes", not a count.
- **The neighbour's copy of your lawn travels back in their `sync` reply to your `hello`.** Reason: the rebuild needs it, and no new message kind is needed.
- **HTTPS for phone tests with a self-signed openssl certificate and `next dev --experimental-https-key/-cert`.** Reason: copy, share and wake lock need HTTPS, and openssl needs no install.
- **`?cvd` dev filter for colour checks.** Reason: a repeatable deuteranopia check without tools.

### Made While Building (2026-10-12)

- **M1 to M4 were built together, and M1's acceptance runs on the round-based build.** `e2e/fence.mjs` presses Ready on both pages first. Reason: a pre-match sandbox garden would have been thrown away in M4.
- **Gardens run only during a round.** The lobby and the time before round 1's countdown show a still preview garden seeded from the room code, and input does nothing outside play. Reason: garden time and throws need the match clock.
- **A rooted weed comes out once your finger is 60 units from where the press started, not from the root.** Reason: the press lands on the drawing, 10 units above the root, so measuring from the root yanked after a 50-unit pull.
- **Presses hit an item's drawn centre**, its ground point raised by a per-kind lift (gnome 16 units, weed 10). Reason: you press the drawing, not its shadow.
- **One `wide` outcome covers hedges and the back wall.** A flight that leaves the lawn past a hedge, or an arrival that would land past row 15, stops at the lawn edge and drops straight down inside it. Reason: one rule for every wall, and long throws end on the back row as designed.
- **The fence top is drawn 40 units above the lawn**, the fence band's height. A clip teeters there, then drops to a depth of 20 to 80 while keeping its screen position. Reason: it reads as falling straight off the fence onto your front rows.
- **4 rooted weeds start on each lawn, seeded in rows 3 to 13 off the gnome patches.** Reason: M1 needs weeds before M10's schedules; M10 replaces this starting set.
- **`sync` carries the sender's name.** Reason: names survive a lost `hello`, and `sync` stays far under 400 B.
- **A player seated alone repeats `hello` every 2s while anyone else is on the member list.** Reason: if both players' hellos are lost, each would otherwise sit alone in its own seat for good.
- **A newcomer who seats itself after the 3s wait sends a fresh `hello`.** Reason: two players who arrive together each seat alone, then the hellos seat each other with the same two ids.
- **`sync` repeats every 2s only outside play.** During play nothing beats until `lawn` arrives in M12. Reason: the plan's rate budget, and Away detection lands with `lawn` in M22.
- **The outbox gains `flush()`, which skips the 167 ms gap but not the limiter.** Leave, Room Full and closing the page flush, then close the socket 120 ms later. Reason: a final `leave` must go out before the socket closes.
- **The last 3s of every non-final reveal reports as the next round's countdown, and round 1 has a 0.5s `waiting` phase before its countdown.** Reason: the 3.5s start lead minus the 3s countdown, and one phase function for both screens.
- **`?fast` keeps the 3s countdown.** Reveals run 10s and the last one 15s. Reason: the countdown is a fixed beat, not part of the reveal timeline.
- **Until results land (M18, M20), a finished match returns both players to the lobby with Ready cleared.** Reason: the placeholder needs a way back to a new match.
- **The placeholder reveal shows "Time's up." for 2s, then "Brenda is judging."** M19 replaces it. Reason: both screens need something on screen during the 20s.
- **Room Full's Try Again reloads the page.** Reason: a fresh page is a fresh admission check with no leftover state.
- **The connection-quota error (Pusher 4004) shows "The garden is closed for today. Play Practice Alone instead."** Reason: the room table had no row for it, and the same buttons as Can't Connect apply.
- **Your identity until M5: a random 12-character player id and a random funny name in `localStorage`.** Under `?local`, each tab picks its funny name from its own id, so two test tabs show different names. Reason: the auth route needs a valid name before the name box exists.
- **The guest's resample ping goes out once per reveal, as soon as the reveal starts.** Reason: the plan's 1.5 times rule, with one ping per round at most.

- **Curly apostrophes in names become straight ones before the check, on the client and the server.** Reason: phone keyboards type curly apostrophes, so "O'Brien" would fail on an iPhone.
- **A name over 16 characters shows "Names fit 16 characters." instead of the helper line.** Blank names and other characters show the helper line. Reason: the helper line about allowed characters would mislead someone whose name is only too long.
- **The auth route normalises the name the same way and signs the normalised name.** Reason: the name box and the server must agree on every name.
- **The name box's helper line reads "Your neighbour sees this name." while the name is fine.** Reason: the line keeps its space, so the layout doesn't jump when an error appears.
- **Start a Room is the name form's submit button, so Enter in the name box starts a room.** Reason: Enter submits the name box, and starting is the main way in.
- **Join With Code opens the code box in place on the home screen.** The box ignores spaces and hyphens between groups, so "K7D M2Q" works. Enter on a half-typed code shows the code rule. Reason: friends read codes aloud in two groups.
- **A pasted link records the arrival as `link`; a typed code records `typed`.** Reason: the lobby copy should match what you did.
- **Dev builds carry the home page's query, such as `?local&fast`, into room links and the copied link.** Reason: two-tab tests can start from the home screen.
- **The home screen scrolls inside its own container, and room cards cap their height and scroll.** Reason: the shared styles lock page scroll, and on a 375 by 667 phone the open code box pushed Practice Alone off screen.
- **The room code shows in every lobby state, not only when you're alone.** Reason: it costs nothing and helps a third friend find the right room later.
- **Your Ready button pulses with a repeating scale animation from `globals.css`.** Reason: the shared wobble plays once, and the design asks for a pulse.
- **Share Link's text reads "Come and throw gnomes at my lawn."** Reason: the share sheet needs a line, and it sets the tone.
- **Showing the page again (tab visible or a back-forward cache restore) sends `hello` at most once a second.** The local transport rejoins after a restore, because its `pagehide` already said leave. Reason: the lobby must be fresh after the share sheet.
- **The phone stays awake whenever you hold a seat: in the lobby and during a match.** Reason: the design keeps the screen on in both.

### Made While Building M7 to M9 (2026-10-12)

- **Drying is a pure schedule per patch.** Dry progress runs 1 per 100s, then 1 per 75s from 1:20 left, and each patch starts at a seeded point in its cycle. Watering never moves it. Reason: catch-up, reloads and both lawns give the same result with no stored state beyond the next step.
- **`?fast` rounds scale drying and growth by their share of a full round.** Reason: an idle fast round then ends like an idle full one, so fast e2e runs see real end states.
- **The heatwave's 1.5 times drying and 6s fill run now, through the garden's `heatwave` option in round 3.** M16 keeps only the banners and dandelions. Reason: each is one line next to the timer it changes.
- **Your own lawn draws health 0 and 1 both as mud.** Reason: the 1-level-browner lie has no level below mud.
- **The grass ramp was retuned to about 9 L* per level, and at least 7.5 L* for protan and deutan viewers.** A unit test checks it through the same matrices as `?cvd`. Reason: levels 4 and 5 differed by under 5 L* for deutan viewers.
- **The lawn layer repaints at most 2 dirty rows a frame, and the whole lawn at once only for a new garden or a resize.** Measured with every row repainted once a second: worst frame 0.6 ms on a 390 by 844 page, 2.8 ms at 4x CPU throttle. Reason: 4 rows a frame cost 4.6 ms at 4x.
- **Every patch draws inside its own 50 by 40 box, and rows repaint through a device-pixel clip.** Reason: a row repaint must not cut blade tips from the row above.
- **Stripes treat rooted weeds and items lying on a patch as not clean, computed each frame from the garden.** Reason: the design's "clean" rule with no extra state to keep in step.
- **The pour waters every patch whose centre lies within 60 units, so a pour on a patch centre covers a plus of 5 patches.** Banked pour time resets when a patch leaves the pour or you let go. Reason: it matches the bot's "5-patch spot", and a sparkle means stop now, not later.
- **A flood counts its 2 patches as drowned, and a running tap floods again every 8s.** Reason: the flood is your own fault, and the tap must stay a chore.
- **The tap toggles on press, within 30 units of its handle or your reach if larger.** Reason: a tap that waits for release feels slow.
- **A moving press on grass commits to mowing at 100 ms, not at 12 px, and the mower then rolls from where the press began.** Reason: the fast-press rule needs the first 100 ms. A real flick starts below 1,000 px/s, and committing at 12 px mowed under flicks in testing.
- **The mower rolls through every patch between two pointer samples.** Reason: a fast rub on a phone crosses more than one patch per frame, and a pass skipped patches.
- **Mower speed is the finger's path length over the last 100 ms.** Reason: rubbing back and forth goes nowhere but is fast.
- **A cut on a patch at length 0 adds nothing to the bag, but still clears mess and restarts growth.** Reason: there's no grass to bag.
- **A full bag cuts nothing and leaves clippings on each patch the mower enters.** M13 adds emptying it. Reason: the design's "stops the mower and spits clippings".
- **The bag and Biscuit join the press order in M13 and M14.** Reason: neither can be pressed yet.
- **Tips and toasts share one line along the bottom of the patio.** A toast shows at once. A tip replaces the line once it has had 1.5s, and only the newest waiting tip is kept. Tips stay 5s and toasts 2.6s. Reason: a line at the patio's top covered the mower and tap on phones, and a queue showed tips long after their moment.
- **The patio tools moved up: the tap handle sits at lawn (40, 672), the can at (52, 730) and the mower at (220, 712).** Reason: the line along the bottom needs the strip below them.
- **The "first column at length 3" tip fires when every patch in a column has grown to 3.** Reason: it matches the tips table.
- **The dev panel gains Dry Lawn (2 health off every patch), Empty Can and Fill Bag.** Reason: quick setups for watering and mowing checks.

### Made While Building M10 (2026-10-12)

- **Lawns start with no weeds; the schedule sprouts the first at 4s to 6s.** The 4 starting weeds from M1 are gone, as planned. Reason: the schedule and round 1's back-row weed now cover the first throws.
- **Weed and snail arrivals are precomputed per round from the seed, each gap drawn by its own index.** The garden keeps only the next index. Reason: a catch-up jump reaches the same lawn as live play.
- **`?fast` scales arrival intervals with the round, like drying and growth; per-thing rates (drain, spread, eating, crawl speed, wilt and shell times) stay real.** Reason: a fast round gets a full round's arrivals, and the rules you see stay the same.
- **Round 1's second weed always sprouts at exactly 10s, on the back row.** Reason: "2:50 left" in the design, and the first weed always lands at 4s to 6s.
- **A scheduled weed tries up to 8 seeded patches and skips the ones holding a weed or a hole.** Reason: both lawns get the same spots unless play filled one.
- **A weed spreads to a free neighbour (up, down, left or right) picked by the seed, never onto a weed or a hole.** Reason: deterministic, and spreading needs room.
- **Weed drain, spread, snail eating and rest damage run on exact timers from each thing's start.** Reason: big jumps and small steps give the same lawn.
- **Snails crawl along one row from the hedge they enter by, and the 12-snail cap only skips scheduled arrivals.** A shell always lets its snail out. Reason: a thrown snail must never vanish.
- **Any snail shell that lies still for 3s lets its snail out, heading for the nearer hedge, thrown or put down.** Reason: one rule for every shell.
- **Snails on a patch keep it from counting as clean for stripes.** Reason: a snail is something lying on the patch.
- **A yanked weed wilts when it lies, slides or is held; in the air it wilts on landing.** Reason: a wilt mark needs a patch under it.
- **The slime trail is drawn fainter than other mess.** Reason: late in a round, slime covers most rows and drowned out everything else.

### Made While Building M13 (2026-10-12)

- **The bag lifts off the mower only with 24 cuts or more in it.** A press on a lighter bag falls through to whatever lies under it. Reason: without a minimum, one cut and a hard swipe would put a 4-patch heap next door every few seconds.
- **While the bag is in your hand, the mower draws without it.** Reason: one bag on screen, so you can see what you hold.
- **The bag's hold clamp stays at 100 units.** The bag counts as on the compost bin once it overlaps the bin, which a 70-unit drag right reaches. Reason: one clamp rule, and the patio layout already fits it.
- **Letting go anywhere other than a throw puts the bag back on the mower, cuts and all.** That covers a slow release, a release on the compost bin (even a swipe), a blocked throw and a cancelled press. Reason: a bag lying on the lawn would need its own scoring, smothering and pickup rules.
- **A bag empties as it leaves your hand, and an empty bag is back on the mower at once.** Reason: swiping it at the fence is an emptying method, so the mower must keep working.
- **Any bag that lands anywhere bursts into a 2 by 2 heap: its landing patch and the neighbours toward the landing point.** That covers next door, your own short throws, hedge drops and clips. A clip drops to a depth of 20 to 80 units, so its heap covers rows 0 to 2. Reason: one landing rule, and every heap on your side is your own fault.
- **A bag in the air can't be caught.** Reason: it bursts on landing, and a caught bag would be mistaken for your own.
- **Heaps are a mess mark (`Mess.heap`) that lighter marks never replace.** Each heap patch takes 1 health every 10s from the moment it lands, like a loose item. Reason: the grid already stores mess per patch, and the report's top state already ranks heaps.
- **Mowing a heap patch clears it and adds 6 cuts plus the grass cut, capped at 96. A full bag leaves heaps where they are.** Reason: the design's 6 cuts per heap patch, and a full bag cuts nothing.
- **A ring round the compost bin fills over the 1.5s hold.** Reason: the hold needs a visible countdown.
- **The bag tip reads "Drag the bag to the compost, or over the fence."** Reason: the planned line wrapped to two lines on a 375 px phone and covered the compost bin.

### Made While Building M11 and M12 (2026-10-12)

- **A throw released within 0.4s of your last one, or while a full arm meter locks throws, puts the item down where it is.** A tip explains it the first time. Reason: it keeps one release rule, and the red ring already shows why.
- **A throw's distance uses the arm meter as it was before that throw's own cost.** Reason: the throw you make is judged by how tired you were when you made it.
- **The arm meter keeps draining during the 1.5s lock.** Reason: one drain rule; you leave the lock at about 78%, so a burst locks again quickly.
- **The ring shows round whatever you hold, rooted weeds you're pulling included: green under 50%, orange under 80%, red above, pulsing red while locked.** Reason: the meter must be readable mid-swipe.
- **You catch a throw from next door once it is past its peak and drawn at or below the fence top, within 1.5 times its drawn radius.** Its ground point moves to where you see it. Reason: falling targets need extra reach, and a caught item must not jump.
- **An arrival fast-forwards by up to 300 ms for its time on the wire, but never past the moment it would drop below the fence top.** Reason: a late or low arrival then enters over the fence, never on the lawn.
- **Throw items are judged stale by their own crossing time, and clip records by their teeter time, not by the bundle's send time.** Reason: the design's one 6s window must cover time waiting in the outbox too.
- **Clip records carry `c`, the teeter's start on the shared clock.** Reason: the receiver draws the teeter in step with the thrower and skips stale ones.
- **Throws vanish only for a Gone neighbour (off the member list) until M22 adds Away.** Reason: Away needs the hearing-aware silence count, which M22 builds on top of M12's 1s lawn beat.
- **Their head pops up for 1.1s at the mirrored launch point when their throw arrives, and angry where your gnome or heavy junk landed.** Only the newest pop shows. Reason: you have one neighbour with one head.
- **Your clip's smug "heh heh heh" floats over the fence on your own screen, made locally.** Reason: it needs no message, and the clip already happened here.
- **`fence.mjs` runs full 3-minute rounds, not `?fast`.** Reason: its clip search retries with adjusted speeds and needs the time.
- **Lawn reports go out every 1s from the animation frame, and not at all while your neighbour is Gone.** Reason: a hidden tab then goes quiet, which is what Away means, and nobody pays quota for a report nobody hears.
- **Crawling snails count and mark like snail shells, and seed clocks count as weeds.** Reason: Brenda counts what she sees on the lawn, and the 8 count slots have no snail or clock split.
- **The peek strip hides their mess and puddles, and shows only weeds, holes, heaps and items.** Reason: the greener lie makes their lawn look perfect, but what you threw there must show.
- **Before their first report, the peek strip shows a perfect striped lawn.** Reason: next door always looks better.
- **The peek strip is three cached layers: the sky lie behind, their rows, and the hedge, bird and caption in front. Only the rows repaint, when a report changes what they show.** Measured at 4x CPU throttle: about 1 ms per rows repaint, against 2 to 7.5 ms for one combined layer. Reason: the strip changes once a second at most.
- **The caption moved up onto their hedge, above their rows.** Reason: it covered gnomes landing on row 2.
- **The lawn pack drops the landing's heavy flag.** Reason: heavy follows from the item type, so the bit said nothing new.
- **Dev `jump(msLeft, round)` can move the match into another round.** Reason: screenshots and checks of rounds 2 and 3 without waiting through rounds 1 and 2.

### Made While Building M14 to M16 (2026-10-12)

Biscuit:

- **Digs always win.** When it's time to trot to a dig, Biscuit drops what he carries, and a sit ends early. Reason: digs come from the seed, so they must fall at the same moments on both lawns.
- **He sets off so he reaches the patch exactly as the 2s circle starts.** Reason: the circle and the hole then land on the seeded times on both lawns.
- **His first dig comes 5s to 20s after he wakes at 2:20 left, then every 40s to 60s, scaled for `?fast`.** Reason: no idle first minute; it gives 2 to 3 digs a round.
- **Dig spots fall in rows 1 to 14 and columns 1 to 10, trying up to 8 seeded patches without a hole.** Reason: clear of the hedges' 20 px back-swipe strip and the fence, and the same spot on both lawns unless a tap changed it.
- **A tap anywhere within 40 units of the circled patch's centre counts. A pulsing red ring shows that area, with a shrinking arc for the time left.** Reason: he runs 3 laps in 2s at about 170 units/s, too fast to hit his body.
- **He barks 1.5s after an item comes to rest, or after he's free if that's later. Then he trots over and picks it up once it has lain untouched for 3s.** Reason: "on the back row by about 5s" needs the trot to start at the bark. Measured: bark at 1.5s, pickup at 3.45s, back row at 4.85s.
- **A dotted orange ring marks the item he's eyeing.** Reason: "Biscuit's eyeing that" must say which item.
- **He drops it on the back row in its own column, straight back toward the house. He tramples the first 4 patches he enters with paw prints, which cost no health.** Reason: the straight trot breaks that column's stripe, the design's "straight through your stripes".
- **He skips snail shells and items already on the back row.** Reason: a shell opens at 3s, before he could grab it, and a back-row item has nowhere to go.
- **The 20s cooldown counts from each pickup, and a take-back still uses it up.** Reason: "at most once every 20s", and taking it back is already your win.
- **The item in his mouth counts for Tidy and Junk, and a press within 1.5 times its drawn radius takes it back.** Reason: he only moves it round your lawn, and it moves at 260 units/s.
- **Dev Trigger Dig adds a dig 3.5s ahead on your garden only.** Reason: the longest trot to any dig spot takes about 3s.

Wind:

- **The vane's arrow points where the wind will blow: up over the fence for your tailwind, down at you for a headwind, or along the fence.** Reason: one glance must say whether a throw goes further; a real vane points into the wind, which reads backwards.
- **Wind acts on a throw only at release.** Distance takes 1.3 or 0.7 times, and an along gust bends the path by 25% of its distance, at most 150 units. Arrivals fly on unchanged. Reason: the thrower's screen decides the whole flight, so the screens never disagree. A front-row lob also drifts less than a back-row throw.
- **An along gust adds drift without changing a throw's depth.** Reason: it pushes sideways only, so it can send a throw into a hedge but never turn it into a clip.
- **Gust slots scale with `?fast` rounds, but each gust still blows 4s with a 2s vane lead.** In a fast round the last two gusts can overlap, and the later one wins. Reason: per-thing timings stay real, like Biscuit's and the weeds'.
- **A tailwind slides seed clocks, litter and snail shells toward the fence at 30 units/s, a headwind toward you, and an along gust sideways. They stop at the fence and hedges, and stay untouched for Biscuit.** Reason: the design's "gusts slide light things", and wind isn't your hand.
- **Throw events carry the planned ground distance.** Reason: the browser check proves the 1.3 and 0.7 on real swipes: 1,113 px/s flew 579 units with the tailwind and 312 into the headwind.
- **Dev Trigger Gust makes a gust in your own frame on your garden only.** Reason: quick looks at the vane and streaks.

Dandelions and the heatwave:

- **A seed clock bursts into 3 seeds the moment it touches the ground.** That covers a landing, a drop from a clip or a hedge, a put-down (a blocked throw too), and wilting in your hand. Reason: one rule, like the grass bag. Drop one and its seeds scatter round you; throw it over and it bursts on their side.
- **The seeds land on 3 different patches among the burst patch and its 8 neighbours, picked by the seed and the clock's id. Each roots as a plain weed 10s later, unless a weed or a hole is there.** Reason: "nearby patches" with a pick both lawns would make.
- **When a clock bursts in your tailwind, its seeds blow over the fence instead.** They fly as 3 seed items in normal throw messages and root where they land next door. It works both ways: a clock landing next door in their tailwind blows its seeds back at you. Reason: the design's "gusts carry dandelion seeds over the fence", with no new message kind.
- **Seeds on the wind pop no head, earn no "Throw it back." tip, and can't be caught.** Reason: nobody threw them, and they're too small to grab.
- **Only scheduled weeds can be dandelions, 1 in 4 by weed index. Spreads and seeds grow plain weeds, and rooted clocks never drop seeds on their own.** Reason: the same dandelions on both lawns, and no runaway seeding. A clock still drains and counts as a weed until you pull it.
- **Clocks turn after a real 40s, also in `?fast` rounds.** Reason: per-thing timers stay real, so fast rounds rarely show clocks.
- **Rounds 2 and 3 open with a banner under the countdown, shown until 2.5s into play: "Round 2: Dandelions" and "Round 3: Heatwave", each with one line on the new rule.** Reason: the design's banners needed copy, and each line explains its rule in under 20 words.
- **A dev `?calm` flag turns off gusts and Biscuit. `chores.mjs` and `fence.mjs` use it.** Reason: both check exact throw distances or presses on full rounds past 2:20 left, where wind and the dog now change the outcome.

### Made While Building M16b (2026-10-12)

- **Seating keeps the hello and sync handshake instead of seating straight from the member list.** It measured 293 ms and 3 bundles, far inside the 2s and 15-event target, and the host's `sync` is what tells a third visitor the room is full. Reason: the target is met without giving up the Room Full check.
- **A guest's Ready waits for its clock: its `sync` says ready only once the clock agrees with the host's, and goes out the moment it does.** The button shows pressed at once. Reason: a countdown started on an unsynced clock would put the two screens' rounds out of step.
- **The session logs each member snapshot, and `e2e/pusher.mjs` times both names showing from it inside the page, failing over 2s or at 15 events.** Reason: the number stays checked every time the real-Pusher script runs.

### Made While Building M17 (2026-10-12)

- **The crate empties at once.** Its 15 gnomes fly out of the shed door on soft arcs and settle on rows 8 to 13 with no crush and no scuff, so the patio byte's crate count stays 0. Reason: a crush on 15 patches would wipe both players' stripes through no fault of theirs.
- **Patio spots: the bin stands at lawn (130, 716) between the can and the mower and rolls in from 90 units to its right; the trampoline stands on its side like a wheel at (540, 742), in front of the shed door; the mower becomes junk where it parks.** Reason: the patio had no 150-unit gap for a flat trampoline, and one rolled out on its side reads as rolled out.
- **Heavy junk draws upright until it lands, then flat under everything: the bin on its side with the lid open, the trampoline over its 3 by 3 footprint.** Reason: "sinks in where it lands" needs a visible change.
- **A landing snaps heavy junk to the middle of its footprint, kept wholly on the lawn, and crushes exactly 4 or 9 patches by 2.** Drags flatten the lawn patches whose centres lie under the footprint, so the patio part of a drag costs nothing. Reason: one footprint rule for landings, drags, stripes and the report's heavy top state.
- **Heavy junk comes after weeds and snails in the press order. Sliding over 12 px before 0.6s drags it anywhere between the hedges, with no 100-unit clamp; holding still for 0.6s lifts it, with a ring that fills.** Letting go of a drag always sets it down. Reason: the design's drag forward and lift, and the clamp would stop a drag from the patio.
- **After a lift, a finger still slower than 400 px/s 100 ms after it leaves the 12 px wobble sets the junk down.** Reason: a still finger sends no samples, so a swipe shows its speed only after its first moves, and 100 ms is shorter than any real swipe.
- **Fast flicks never snap to heavy junk, and heavy junk can't be caught.** Reason: a snap could only drag it, and a caught bin would skip the sink.
- **"Can't clear the fence from the patio" is plain numbers.** The patio spots sit at depth 712 or more, past the 663 units a 2,500 px/s heavy throw clears even with a tailwind. Reason: no special case to explain.
- **The mower carries its bag when you drag or lift it. Throwing it empties the bag's cuts with it and ends mowing; a mow press afterwards shows "You threw your mower. No more mowing this round." once.** You can still mow and lift the bag with the mower set down on the lawn, and it rolls back to where it stands. Reason: one mower, and the bag goes where it goes.
- **A thrown mower drives 4 patches, one every 380 ms, along its flight's main direction with a sideways jog on about half the steps, turning back at a wall. Each patch loses 1 health under a scalp mark, which isn't blamed on the receiver.** Reason: the design's crooked scalping run, and the receiver didn't do it.
- **A landing bin spills one piece of each look (crisp packet, pizza box, banana skin, sock) on soft arcs 55 to 90 units round it.** The look rides in throw flags bits 3 and 4. Reason: the design's week of rubbish, kept the same when thrown back.
- **Light things (not bags, seeds or heavy junk) landing inside a sunk trampoline's footprint fly back along their arc's reversed ground vector at 0.9 times its length. A bounce that reaches the fence always goes over; bounces under 40 units just land.** Reason: a clip belongs to whoever threw, and nobody threw a bounce.
- **An own bounce counts when your throw bounces and stays on your lawn, or comes back over the fence to you.** Throw flags carry it: bit 0 heavy, bit 1 bounced, bit 2 going back to its thrower. Bounced arrivals pop no head. Reason: the design's "your next gnome bounces off it, back onto your lawn".
- **The last 10s of play tick once a second and the round clock turns red, in real seconds even in `?fast` rounds; the shed opens at the scaled 0:40.** Reason: the clock is a real-time warning.
- **Sounds: `slam` when the shed opens, `slam` and `rattle` on a heavy landing with `boing` for the trampoline and every bounce, `crank` on a lift.** They stay silent until M23 unlocks audio. Reason: the sound map, plus a cue for the lift.
- **Before the finale, a press on the parked mower shows the toast "Rub the grass to mow a stripe."** Reason: the plan's mowing tip, as a toast so it answers the press in every round.
- **`e2e/finale.mjs` throws the bouncing gnome through `act.throw`.** Reason: real swipes measured 2,128 to 2,225 px/s for a nominal 1,900, more than a trampoline's depth allows; the bin's lift and throw use real input.

### Made While Building M18 (2026-10-12)

- **A final carries every item with its litter look and a sunk flag, in bits 4 to 6 of its type byte, up to 172 items (the 160 loose cap plus 12 crawling snails).** The worst case is 555 bytes, 740 base64 characters. Reason: M19's peel draws "mud under 14 gnomes" with the bin knocked over and the right rubbish.
- **The host judges a round once both finals are in, at once when the guest is off the member list, or 6s after its own final.** A missing final is replaced by the guest's last lawn report from that round (no blame, health sum read from the patch bytes), else by a fresh lawn. Away joins "off the member list" in M22, which builds Away. Reason: the plan's fallback, with what exists now. (Replaced on 2026-10-13: see Made While Fixing the Second Audit.)
- **Holes count for Tidy from the patches whose top state is a hole.** A hole under heavy junk doesn't count, because Brenda can't see it. Reason: the counts have no hole slot, and the top state already ranks holes.
- **The session hands the room flow its final as soon as it sees the round's play ended, from the animation frame or the 1s timer, so a hidden tab still sends one.** A round left behind without a final sends it before its garden is replaced. Reason: one code path for live and catch-up, and a hidden guest still gets judged on its true lawn.
- **The `result` message names the loser's blame as `bl`, and carries 4 lines per player; totals are their sums.** Reason: shorter on the wire, and a total can never disagree with its lines.
- **The round that decides the match becomes its last round: its reveal runs the 30s last reveal, which shares its first 17s with a normal one.** Until M20 builds the match-end screen, both players then go back to the lobby. Reason: the plan's reveal timeline, and verdicts arrive within 6s.
- **The verdict also lives in the page as screen-reader text: both players' four lines and totals, the round line, and the match line after the deciding round.** "Brenda is judging." stays up until the verdict is in. Reason: M18 checked scores on screen with it before M19 drew the reveal, and screen readers still need it.
- **Round wins show as a drawn rosette per win beside each name in the top bar.** The live region announces each verdict, such as "You win round 2." Reason: the design's rosettes, and screen readers need the verdict too.
- **The host's `sync` carries the tally and how many verdicts it applied; a guest that knows of fewer shows the host's tally.** Reason: the tally heals even if a verdict went missing and the guest stopped asking.
- **Tips show only during play.** Reason: the final's catch-up replays garden events, and tips popped up over the verdict.

### Made While Building M19 (2026-10-12)

- **The reveal draws on the canvas over the garden.** Brenda walks along the fence during "Time's up.", then a paper board shows both true lawns at 0.52 size side by side, yours on the left. Reason: the count-up and peel run every frame, which React must never do.
- **A `?fast` reveal squeezes steps 1 to 4 into the 7s before its countdown, and the last fast reveal's ending runs from 7s to 15s.** Reason: the countdown is a fixed 3s beat, and fast checks still see every step.
- **Your lawn peels from 2s to 5s and theirs from 5s to 8s, with a cling-film edge Brenda drags her clipboard along. Under Reduced Motion the tint fades instead and she stands still.** Reason: the design's order, and the plan's fade.
- **The tinted lawns are the lies you saw: yours a level browner under grey with its mess, theirs greener by the round's peek tint with its mess hidden.** Items and weeds show on both. Reason: the same lies as the lawn layer and the peek strip.
- **Finals hold top states, not mess kinds, so true lawns draw any mess as a scuff, plus puddles, heaps and holes. Items stand on their patch centres with a small seeded spread, sunk junk flat underneath.** Reason: the final stays under 760 characters, and a patch is what Brenda scores.
- **The count-up runs Green, Stripes, Tidy and Junk one after another from 8s to 14s, then the total. Brenda's line shows under each lawn from 11s and the blame line under the loser's from 12.8s.** Reason: one line at a time reads as counting.
- **Brenda's lines follow the design's table in order, then "Too close. I'm going with my gut." under 3 points, else "Neat edges. I approve." for the winner and "Could be greener." for the loser.** Mud means health 1 or less, or a puddle. Reason: every lawn needs a line, and the table needed a mud rule.
- **The blame line reads "You lost by 4. You drowned 9 patches yourself." on the loser's screen and "Turf Lord lost by 4. They drowned 9 patches themselves." on the winner's.** Each fault has its own wording, such as "clipped the fence 3 times". Reason: the design's line, said to the right person.
- **The rosette pops onto the winner's lawn at 14s, and the top bar's rosette for that round appears only then. A drawn round stamps "Draw" across both lawns.** Reason: the design's "the round score updates" at the rosette.
- **The ending shows "Brenda's Lawn": impossibly even stripes under a plastic shine and a peeled-up corner reading "100% plastic". She walks across it with a "squeak" each step, then "It was never greener." shows at 30% of the ending and the match line with the prize rosette at 55%.** Until M20, both players then go back to the lobby. Reason: the joke needs the plastic shown, not told.
- **A drawn match reads "Brenda can't choose. She's calling the council."** Reason: the design's line.
- **The reveal plays `doorbell`, `scrub` for each peel, `tick` for each count line, `ding` or `fail` at the rosette and high `squish` squeaks, once each per reveal.** They stay silent until M23 unlocks audio. Reason: the sound map.
- **The 4 lawn layers paint one a frame during "Time's up."** Reason: painting all 768 patches at once would stall the first peel frame on a phone.
- **Tips and toasts clear the moment play ends.** Reason: they covered the board.
- **`e2e/reveal.mjs` checks step timing on round 1's reveal with no screenshots, and screenshots round 2's.** Reason: capturing one page held back its next frame by up to 870 ms, which looked like a sync gap.

### Made While Building M20 (2026-10-12)

- **The match end shows once the last reveal runs out, and the room keeps the match until a rematch or Back to Lobby.** It draws the deciding round's two true lawns with the same painter as the reveal, each name with its rosettes, every round's points with the round's winner in bold, then the points total. Reason: the design's "the result, both true lawns"; the replay and share card join it in M24.
- **Its heading reads "You Win the Match", "neighbour_name Wins the Match" or "Nobody Wins". The line under it gives the rounds score, the points when rounds are level, or Brenda's council line.** Reason: the heading carries the result and the line explains it.
- **A guest still missing the deciding verdict stays in the match after the last reveal, repeating its final, until the verdict comes or the host leaves the member list.** Reason: a match end needs a winner, and the final already repeats every 1s.
- **The host starts the next match when both players want one: Ready in the lobby and Rematch at the match end count the same.** The lobby shows a neighbour who pressed Rematch as Ready. Reason: a neighbour who reloaded into the lobby can still meet you at the match end, and no room gets stuck between the two screens.
- **The match end remembers who you played. If they leave the member list, press Leave, or someone else takes the seat, it reads "neighbour_name left." with Back to Lobby and Leave.** Reason: Rematch must never offer a match against a stranger.
- **Leave before Brenda decides the match sends the stayer to "Stormed Off": "neighbour_name stormed off. You win." with Back to Lobby. The seat frees at once, so anyone with the link can join.** Leave after the match is decided lets the reveal play out, and the match end then says they left. Reason: the design's stormed-off row, and a decided result stands.
- **The leave question is a dialog titled "Leave the Match?" with "Your neighbour wins." before the match is decided, and "The result stands." after. Its buttons are Stay and Leave.** The menu's Leave and the browser's Back both open it. Reason: the design's line as a title and body, true in every part of a match.
- **Back pushes one guard history entry at match start. Back steps off it, the game puts it back and asks. The entry goes when the match ends, Leave replaces it with the home page, and a reload mid-match reuses it.** Reason: the plan's Back rule without stacking entries.
- **Leaving the room screen any other way leaves the room.** Back from a lobby the home page opened is a client-side navigation, so the screen now sends `leave` and closes the connection when it goes. Reason: before M20 that Back left a hidden connection holding your seat, and your neighbour saw you sitting in the lobby.
- **The desktop leave warning asks only while the match is undecided.** `e2e/lib.mjs` confirms it like a player would and counts it. Reason: nothing is left to lose once Brenda decides.
- **The menu holds Keep Playing, Settings, How to Play, Hide Tips (while tips are on) and Leave, under "The round keeps going while this is open."** Settings shows Sound, Volume and Reduced Motion, and the Reduced Motion line says the tint fades instead of peeling. How to Play has 8 lines. Reason: the design's menu, with Assist Mode and sensitivity off for both players.
- **Hide Tips lives in the menu, not on the tip line.** Reason: a button on the line wrapped longer tips onto two lines on a 375 px phone and covered the patio tools.
- **Escape opens the menu. F waits for M23's Shake Fist.** The desktop key card in the left margin reads "Escape opens the menu." during a match when that margin is at least 180 px wide, and M23 adds F to it. Reason: F has nothing to do until the fist exists.
- **`SettingsPanel` gains `controls` and `motionHint`, both optional.** Reason: an additive shared change; the shared README documents both.
- **`?seed` still fixes every match's seed, rematches included.** Reason: dev scripts that rely on a seed keep working; `e2e/match.mjs` checks the new seed without it.
- **The host's `sync` doesn't carry `over` yet.** M22 adds it with the reload rebuild. Reason: a reloaded page has no finals to draw the match end from.

### Made While Building M21 (2026-10-12)

- **Mr Pemberton is a second `RoomSession` in the page: a muted guest on the memory transport, with the bot brain as its autopilot, run as the player session's companion every frame.** Reason: Practice uses the same room flow, outbox, finals and verdicts as online play, and nothing Practice-only enters the reducer.
- **`BotNeighbour` lives in `src/net/pemberton.ts`, not `src/game`.** Reason: it wraps a session, and `src/game` stays free of the network and the DOM. The module list is fixed.
- **The memory transport's presence works like Pusher's, not "always listed".** Reason: with both ends always listed, the bot and the player each sat 3s in `checking` before seating.
- **Polite Mr Pemberton stops throwing things back once the shed opens, because he's busy carrying his crate gnomes home.** Reason: returning every throw all round beat the learner in 40 of 40 seeded round 1s. With this change the learner wins 40 of 40, mean 19.7 to 9.0 (target 60% or more). M27 retunes.
- **His throws are aimed: the speed lands them 120 to 480 units into your lawn through the real throw maths, with his arm and the wind. A deliberate clip sets the throw's reach at 1.09 times the fence depth.** Scripted players throw at their profile speeds. Reason: the plan gives him clip chances, not speeds.
- **Polite Mr Pemberton pulls his weeds and drops them. Normal and petty throw a weed or snail over only when a send is due (every 5 to 9s, or 4 to 7s), and drop the rest.** He keeps his 3 starting gnomes until the shed opens. Reason: "only throws back what you send him", and "sends his own weeds and snails".
- **His reactions are speech bubbles from his bald, moustached head: "My begonias!" (cross) for your gnome in his front 4 rows, "Heh heh heh." for your clip, "Blast." (cross) for his own clip, and a shaking fist after 3 hits within 10s.** In Practice his laugh replaces the online "heh heh heh". Reason: the plan's reactions, with one laugh on screen, not two.
- **The `fist` message exists now: `{ k: 'fist', x }`, a round kind. It shows an angry head and a shaking fist for 1.8s.** M23 adds your own Shake Fist button, F, the 3s cooldown and the sound. Reason: Mr Pemberton's fist travels as a normal message.
- **Practice tips show in every round, the first time each thing happens in the match.** Reason: the design's "in round 1 of every match and in Practice".
- **The Practice lobby is its own card: "Practice With Mr Pemberton", his moods line, Start and Leave, and the how-to.** Each visit gets a fresh room code, and you always host. Reason: there's no code or link to share, and he is always ready.
- **The brain has one hand and works in this order: Biscuit's circle, the tap, catches, throw-backs, the finale, weeds, snails, its own loose items, watering, mowing, then the compost at 80 cuts.** The tap goes on below 1.2s of water and off when full or after 5s running. Watering builds a debt of upkeep times each drying step, then pours on the driest 5-patch spot long enough to bring its centre to 7; an overwater adds 2s. Mowing takes the longest column at 600 px/s. Reason: the plan's hand times, plus what a bot needs to stay out of trouble.
- **Measured bot rounds score low: no lawn ever stripes, and totals sit between -10 and 35.** Regular against normal won 2 of 20 round 2s, expert against petty 7 of 20 round 3s, and regular against regular 12 of 20. Reason: recorded so M27 starts from real numbers; stripes and Tidy need the first look.
- **`?bot=name` starts autopilot on that page, and the dev `autopilot(name | null)` switches it. In Practice, the dev `bot` hook shows his garden, state and events, and `mode(name)` fixes his mood.** Reason: the plan's dev hooks.

### Made While Building M22 (2026-10-12)

Presence:

- **Silence grows each 250 ms tick only while your page shows and your line is up, by at most 1s a tick, and any bundle from your neighbour's current page resets it.** Reason: a hidden or frozen tab must never judge its own nap.
- **Away comes at 3s of silence in play and 6s outside it. Throws, clip records and fists to an Away neighbour vanish; lawn reports still go to them.** Reason: the design's Away, and a lawn report is how their peek strip recovers when they're back.
- **A walkover needs your own line up: your neighbour off the member list for 60s while you're connected. A no contest is 60s of heard silence while they stay listed.** Neither applies once Brenda has decided the match. Reason: a stale member list must never hand out a win.
- **The host judges a round at once from the guest's last lawn when the guest is Away, as the design says, even though a hidden guest's own final arrives about 1s later.** Reason: the design's rule; the 6s wait now covers only a guest that is listed and talking.
- **A walkover offers Back to Lobby and Leave. The returner reads "You didn't come back in time. neighbour_name wins." A no contest offers Rematch and Leave.** Reason: the room table had no row for the player who came back.
- **The top bar shows Away as a yellow tag beside their name, and "Gone 0:42" in red in place of their rosettes; once the match is decided it reads just "Gone".** On a 375 px phone the names cut shorter than 10 characters while Gone shows; M25 owns the top bar's fit. Reason: the design's Away and Gone.
- **The Reconnecting banner sits at the top of the patio, never takes presses, and shows whenever you hold a seat and your line is down, in the lobby too.** Reason: "over the patio, never over the peek strip or the fence".
- **A hello clears your neighbour's Ready and Rematch until their next `sync`, and a seated page sends its `sync` with every hello. Leaving the member list clears them too.** Reason: a reloaded page must not inherit the old page's Ready, and a quick reload on Pusher may never show a leave.
- **The outbox's newest `sync` now replaces the pending one and goes behind everything queued since.** Reason: replaced in place, a sync could arrive before the hello it belongs with.
- **The 5s rejoin timeout is the 3s admission check.** A reloaded page with no `sync` in 3s sits alone in the lobby, so two reloaded players meet in the lobby at once. Reason: no second timer needed.
- **The local transport keeps a member that stops beating listed for 30s (was 5s), and refreshes everyone it knows when it comes back online.** A closed tab still says leave and goes at once. Reason: Pusher keeps a dropped connection listed until its own timeout, so the offline fault now shows Away like a real drop, and a page back online must not drop its neighbour for its own gap.
- **Real Pusher showed Gone 119 ms after a context closed** (`e2e/rejoin.mjs pusher`, 7 bundles, 8s, 2026-10-12). Reason: recorded so the next check has a number.

Rejoins and the match end:

- **Every `sync` outside the lobby carries the match, the tally, the totals and how many verdicts are known, from either seat.** A host page that has never seen a match takes a running match back from the guest's `sync` unless its clock has run out, and builds its next verdict on the guest's tally. It never judges a round the guest already has a verdict for. Reason: a host reload used to lose the match.
- **A `sync` at the match end carries how it ended (`over`), except after a storm-off.** A page still in that match, or a fresh page that never saw a match, shows it. A fresh page shows the result and the rounds score without lawns or the points table, since it has no finals. Reason: "If they return later, they see the result."
- **A guest still waiting for the deciding verdict ends the match when the host's `sync` reports the result, or shows the lobby after the guest's match clock ran out.** Reason: a host that reloaded at the end left the guest waiting for good.
- **Your neighbour's copy of your lawn rides in every `sync` during a match, not only in replies to a hello.** Reason: the outbox keeps only the newest sync, so a later one could replace the reply; during play syncs are hello replies anyway, so the copy costs about 400 B on reveal syncs only.

The rebuild:

- **A page rebuilds only when it creates a round's garden after that round's play started (a reload, or joining late). With no copy for that round it starts fresh and catches up.** Reason: a page that lived through the round already holds the truth.
- **A fresh garden runs idle to the copy's time, so every seeded schedule (weeds, snails, Biscuit, gusts, the shed and its crate) stands where live play left it. The lawn then takes the copy's health, length, holes, heaps and puddles, and any other mess as a scuff.** Reason: the copy shows mess only as "some mess", and Brenda scores it the same.
- **Rooted weeds keep the idle run's weed on each weed patch, with its kind and timers. The idle run's weeds hidden under an item or a heap stay while the copy's weed count allows. Items come from the markers, then the counts fill the item patches no marker covered (gnomes, litter, snail shells, then loose weeds).** Loose weeds get 10s to wilt, and snails come back as shells. Reason: the copy's counts and top states rebuild exactly; the unit test re-encodes a busy rebuilt lawn to the same patches, counts and markers.
- **Heavy junk on the lawn sank if its whole footprint shows heavy junk, else it stands where a drag left it. Patio junk stays as the idle run left it, minus each piece standing on the lawn after a drag, the mower when the copy says you threw it, and then enough to match the copy's thrown count.** Reason: the patio never shows in a copy.
- **The own-fault counts start again from 0 after a reload, and so do the arm meter, the can and the bag.** Reason: the copy doesn't carry them; noted as a known gap. (Fixed on 2026-10-13: the lawn pack carries them now.)
- **A reload late in round 3 costs one idle run: rebuilding from a copy at 2:50 into the round and catching up 8s took 13 to 17 ms in Node on this machine.** M26 checks it on a throttled phone. Reason: recorded so M26 starts from a number.
- **A host page that reloads during a reveal shows "Brenda is judging." until the next countdown.** It has the tally from the guest's sync but not that round's verdict to draw. Reason: rare, and the verdict stands on the guest's screen.

Dev and tests:

- **Dev `hide(ms)` stops frames and tells the room the page is hidden, then shown; `twin()` steps a fresh garden one tick at a time to the live garden's time and compares lawn packs and finals; `start()` says whether the round's garden was rebuilt and from which copy. The session logs every copy it sends (`copySent`).** Reason: the acceptance checks need them.
- **`e2e/fence.mjs` now checks a throw vanishing at an Away neighbour.** Reason: the offline fault no longer drops a member within 5s.

### Made While Building M23 (2026-10-12)

- **Sound unlocks on the page's first tap, click or key press, on the home screen and in the room.** Every sound goes through the session, which logs it as an `sfx` event only once audio is unlocked; the shared `sfx` gained `unlocked` for that. Reason: "nothing plays before the first tap", and the log proves what played.
- **The sound map lives in `scenes/sounds.ts`: `playEvent` turns your garden's events into sounds, and `SoundLoops` follows the garden each frame for the mower's rumble (louder the faster you rub), the can's pour, the running tap's rain and a gust's wind.** Sounds and loops play only during play, so the catch-up at 0:00 stays quiet. Reason: one place for the map, and loops that can never be left running.
- **Landings thud on grass and squish on mud (health 1 or less, or a puddle); heavy junk keeps its own slam. A snail grab squishes through a new `shell` garden event. Their head popping up for an arrival pops quietly.** Reason: the sound map's rows, with heavy junk heard once.
- **Their laugh at your clip comes 350 ms after the fence creaks, online and in Practice.** Reason: the map's "creak, then their laugh"; Mr Pemberton's bubble already said it, but nothing played.
- **The countdown ticks each second and rings `bell` on "Mow!".** Reason: the map's countdown row.
- **The match end stings: a `bell` when you win, `fail` when you lose, `buzz` for a draw or a no contest.** Reason: "win and loss stings", on top of the reveal's per-round ding or fail.
- **Vibration where supported: a short buzz on your clip, a triple buzz when their fist pops up, a thump when their heavy junk sinks into your lawn, and a long one when you win.** Reason: phones get the hits in the hand, and nothing else needs it.
- **Shake Fist is a yellow fist button at the right end of the top bar. It and F pop your fist up over their fence somewhere along its middle 60%, at most once every 3s, during play only.** The button greys out for the 3s rest but keeps its focus; the desktop key card reads "F shakes your fist. Escape opens the menu." Reason: the design's button and key; a random spot keeps a run of fists from stacking.
- **Juice: dust puffs where things land, a bigger one and a 380 ms screen shake when heavy junk sinks, dirt where Biscuit digs, clippings where a heap lands and spray on a flood.** The shake moves the canvas element with a touch of zoom, so every layer shakes and the page never peeks in. Under Reduced Motion the screen never shakes and puffs fade without growing. Reason: the art direction's effects, cheap enough to draw with plain arcs.
- **The top bar's names drop to the body size on phones narrower than 640 px.** "Sod Father" and "Snail Mail" now fit beside the fist at 375 px; with rosettes or Gone they still cut short, which M25 owns. Reason: the fist button took the space.

### Made While Building M24 (2026-10-12)

- **The worst moment counts health your lawn lost beyond scheduled drying, only in frames where one of your garden's events explains it: a landing, a sink, a drowning or flood, a scalp, a drag, a dig, a heap or a thrown mower's run.** Slow losses from weeds, snails and rest damage never make a moment, and a catch-up jump (more than 250 ms in one frame) never counts. Reason: drying alone costs about 20 health in any 3s, which would make every moment the same dull one.
- **The window is 3s. When a window costs more than the worst so far, the clip is taken 1s later, so it shows the moment and what follows. A moment must cost at least 1 health.** Reason: the recorder keeps only 3s, and the clip's last second shows the result.
- **Its caption names the window's most embarrassing cause, your own faults first: "Clipped the fence. Again.", "Bounced off your own trampoline.", "Drowned your own grass.", "Scalped your own stripes.", "Dragged junk across your own lawn.", "Biscuit dug a hole. You let him.", "Threw it onto your own lawn.", then theirs: "Their junk landed on you.", "Their mower ran you over.", "Buried in their clippings.", "Their throw landed on you."** A clip costs health only when its item drops, so the clip itself marks the window. Reason: the design's two lines, and one for every other cause.
- **The replay records only the band from the peek strip to the lawn's back edge, at 192 by 220 and 20 fps (about 10 MB a ring, two rings), and only during play.** Reason: everything worth replaying happens there, and a squarer clip fits the match end beside the points.
- **The match end shows the replay looping in slow motion beside the points table, with its caption under it, and Share Card between Rematch and Leave.** The shared `ReplayPlayer` gained `badge` (default true), so the small player can drop its "Slow-mo" badge. Reason: the card already scrolls on a 375 by 667 phone, and the badge covered the fence.
- **The share card reads "It was never greener." over both true lawns from the deciding round with both names, and lists Match (your rounds to theirs), Your Last Lawn, Gnomes on Your Lawn and Fence Clips (the whole match), with "Brenda judged both lawns. No appeals." at the bottom. It shares "Brenda judged our lawns. It was never greener."** The lawns paint only when the card is drawn. Reason: the design's four stats, and nothing paints unless you share.
- **The replay and the share card show only on a match Brenda decided.** A walkover, a no contest and a page that reloaded after the end have no finals to show. Reason: the card is about the verdict.

### Made While Building M25 (2026-10-12)

- **Each name in the top bar is a name tag: the name on top, its rosettes underneath, with Away beside their rosettes and "Gone 0:42" in place of them. The clock sits in its own centred grid column.** Phones use 15 px names, 16 by 20 px rosettes and a 22 px clock; 640 px and wider keep the old sizes. Reason: in one row the bar needed about 470 px at 375 px wide, so names cut short whenever rosettes or Gone showed; stacked, a 10-character name keeps 88 px at 375 by 548 with Gone showing.
- **Names cut to 10 characters as they show on screen (graphemes), the tenth an ellipsis.** "Gnome Hoarder" reads "Gnome Hoa…". Reason: cutting code points could split a vowel sign from its letter in names such as "एकांश".
- **The bar keeps its bottom on the top band's bottom and grows upward when the band is under 48 px, clamped to the screen's top.** Only screens shorter than about 530 px clamp, and then it covers a few px of the peek strip; none of the target sizes do. Reason: the design's rule, with a sane fallback.
- **The tip line and the Reconnecting banner share the strip under the patio props (design y 1000 to 1060) in one line at every size. While Reconnecting shows, tips wait.** Reason: the banner sat over the mower and compost, and the tip line hid the grass bag on phones, right when the bag tip asked you to drag it. The longest tip is 275 px at 15 px, so every tip fits one line at 375 by 548.
- **Next.js's dev badge is off (`devIndicators: false`).** Build and runtime errors still show. Reason: it sat on the tap in every phone screenshot.
- **A phone held sideways shows "Turn your phone upright." over the room, in the lobby and the match, and the cover takes every press. During a match it adds "The round keeps going."** It applies to landscape touch screens under 500 px tall, so short desktop windows never see it. The garden and the clock keep running. Reason: the design's rule; a cover that let presses through would mow by accident.
- **Pinch zoom is allowed again: the root viewport export no longer sets a maximum scale or blocks user scaling. The canvas's `touch-action: none` keeps zoom off the garden.** A page zoomed in when play starts stays zoomed until you pinch out on a card or button, since browsers offer no reliable way to reset zoom from script (Chromium ignored a `maximum-scale` toggle). Reason: "Pinch zoom works on menus and the lobby. Only the game canvas blocks it."
- **`bun run dev:https` makes a self-signed certificate with openssl in `.certs/` for localhost, 127.0.0.1 and every LAN address, and makes it again when the addresses change. It serves on port 5176, so stop `bun run dev` first: Next.js runs one dev server per folder.** Verified on 2026-10-12: a room loaded at the LAN address over https was a secure context with Web Locks and the wake lock. Reason: phones on plain http lack both.
- **Fixed: after your neighbour left the match end, the host's page swapped sides.** It read "You won 2 rounds to 1" for a 1 to 2 loss, swapped the points columns and drew your own lawn twice. `hostSide` now takes the side from the neighbour the match was played against once their seat is gone. Reason: found by the Gone check in `phone.mjs`.
- **`?cvd` at 375 by 548: health 2 to 7 separate by lightness through both filters. 0 and 1 look the same on your own lawn because the tint drops each level by one.** Reason: recorded for M27, which already owns it.
- **Dev additions: `?name=` names a `?local` tab, `spawnAt(kind, lx, ly)` drops an item at a lawn point, `e2e/lib.mjs` gained the `se` size (375 by 548).** Reason: the layout and edge guard checks need long names and items against a hedge.

### Made While Building M26 (2026-10-12)

- **Performance runs use this machine's GPU (`launch({ gpu: true })`).** Headless Chromium's default software raster spent about 270 ms a frame compositing the 780 by 1,688 canvas at 4x throttle, so even a fresh lawn ran at 3.7 fps, and the replay's copy cost 24 ms because it flushed that raster. Phones composite on the GPU, where the same frame's work is 1 to 3 ms. `lawn.mjs --cost` uses the GPU too. Reason: measure what phones pay.
- **The frame path allocates 3.4 KB/s at rest, from animation frame registrations and the room's 4 per second tick.** Removed: the garden's per-tick copy of its command queue, Biscuit's per-tick dig-trip sums (skipped until even the longest trot could be late) and a new phase object per `phase()` call (the session caches it per clock reading and room state). Nothing allocates per item or per patch. Reason: "no allocation in the per-frame path", within what a pure reducer allows.
- **The 50 ms catch-up target holds for a whole round of an ordinary lawn: 179.5s in 38.7 ms at 4x. A crowded lawn (30 gnomes, 41 weeds, 12 snails, junk) caught up 152.7s in 51.7 ms at 4x, about 13 ms unthrottled.** `perf.mjs` guards that at 100 ms. Reason: it's one hitch on the first frame back from the background, and stepping weeds by a shared next-due time would add an invariant to five places that add weeds.
- **A guest reload 172s into round 3 rebuilt in 51.8 ms at 4x, then caught up 1.3s in 0.8 ms.** Reason: the M22 rebuild measured 13 to 17 ms in Node; this is the throttled phone number.
- **The session logs `catchUp` (any frame 1s or more behind, with the play time and ms) and `rebuild` now carries its ms. The outbox counts `peakPerSecond`, the most bundles in any rolling second.** Reason: `perf.mjs` reads them, and the `?debug` overlay shows the peak.
- **Dev builds measure each frame's work (updates and drawing, 10s of frames), the replay's copies and React commits (a `Profiler` around the room). `perf()` returns them with the lawn layer and the stamps cached; `resetPerf()` starts the meters afresh. `?debug` adds "frame p95 … ms | worst … ms | commits …".** Production builds skip the meters and the `Profiler`. Reason: the acceptance numbers, and a readout for checking a real phone.

### Made While Building M27 (2026-10-12 and 13)

- **`bun run balance [seeds]` (`scripts/balance.ts`) plays 200 seeded rounds per pairing and round in about 16s and prints each target as pass or FAIL, plus the median regular lawn at 0:00.** Pairings: learner hosting polite Pemberton in round 1, expert hosting petty Pemberton in round 3, regular against regular in every round, and an expert `thrower` against an expert `mower` (throws its gnomes, then mows) in every round with sides swapped on odd seeds. Tidy, the Junk gap (the two lawns' Junk apart, per round) and upkeep come from the regular rounds; upkeep is the share of the round's 180s. `simulateRound` now returns both finals. `scripts/` is typechecked. Reason: M27's harness, ready for the tuning.
- **Baseline before any tuning, 200 seeds: learner 99.5% (pass), expert against petty 38.5% (FAIL), host regular 51.4% (pass), thrower 47.8% (pass), median Tidy 0 (FAIL), median Junk gap 3 (FAIL), upkeep 27.7% in rounds 1 and 2 (pass) and 28.2% in the heatwave (FAIL).** The median regular lawn at 0:00: Green 16, Stripes 0, Tidy 0, Junk -17, total -1, with 40 rooted weeds (the cap), 9 snails, 1 hole and 17 gnomes.
- **Why, from tracing one regular round: the arm meter, not the hand, sets the pace.** A light throw fills 18% and it drains 15% a second, so a bot sustains about 0.83 throws a second, about 150 a round; a regular threw 152. Demand is about 200: 57 scheduled weeds plus spreading, about 18 snails, about 110 of the neighbour's crossings thrown back, and 15 crate gnomes. While the arm is tired a player bot does nothing with a weed, so rooted weeds climb from 10 at 1:30 left to the 40 cap by 0:30, and no column stays clean enough to stripe.
- **Experiments in a scratch copy, none kept:** slower sprouting (6, 5, 4 and 4s) or slower spreading (45s) left weeds at the cap; skipping throw-backs of weeds near wilting changed nothing, since the hand isn't the limit; letting a tired player bot yank and drop weeds brought median weeds to 16 and Tidy to 8, but weeds outrank watering in the brain, so upkeep fell to 8%, Green to 11, the host regular won 57.5% and the expert beat petty only 17.5%. Reason: recorded so M27 starts from evidence.
- **The arm theory was wrong: the brain's order set the pace.** A regular threw 153 times a round, but only 16 were yanks; about 110 were throw-backs, which outranked weeds. Players now keep their lawn first: the finale, weeds, snails, watering and mowing, then throw-backs with the time left over (PLAN.md 2.9). Reason: a player whose lawn is dying stops throwing gnomes back, and the heatwave can only squeeze time that chores may take.
- **The arm meter stays at 18% a light throw and 15% a second.** With the new order, 15% or 12% a throw lowered upkeep, broke the thrower against mower pairing and helped no target. Reason: throughput isn't the limit any more.
- **Watering debt keeps credit.** A pour that gives back more than the debt that started it keeps the rest as credit. Before, the debt reset to 0, so a pour gave back about 10 health for 3 owed and a "100%" regular watered several times its share. Reason: "Upkeep, share of drying" now means what it says.
- **A tired player waters while its arm rests, then yanks the weed and drops it.** Reason: dropping alone starved watering in the earlier experiment; watering first keeps both.
- **Drying slows to every 140s, then 105s from 1:20 left (was 100s and 75s).** Keeping up with the old drying took about 34% of a regular's calm round on its own. Now calm upkeep, mowing included, is 23.2%. Reason: the 20% to 30% target.
- **The heatwave dries 2.5 times as fast (was 1.5).** At 2 times, heatwave upkeep reached 33%; at 2.5 it reaches 40.0%. Watering is the only chore heat scales, so the multiplier carries the whole jump. The round 3 banner now reads its numbers from `tuning.ts`. Reason: the 37% to 50% target.
- **Weeds sprout every 4s in the last 40s (was 2.5s).** Rooted weeds jumped from 2 to 22 in the finale while everyone threw gnomes, and median Tidy sat at 5. Now the median lawn ends with 15 weeds and Tidy 9. Reason: the finale is about junk.
- **The crate holds 12 gnomes (was 15).** With 15, both sides ended with matching backlogs: the median Junk gap was 3 to 4, with 52% of rounds at 4 or more. Crates of 18 and 20 shrank it. With 12, 61% of rounds reach 4 or more. Reason: a crate both players can keep up with lets the last throws decide.
- **Players throw heavy junk first, with the arm at 10% or less at the throw and no headwind, dragged only as deep as their slowest swipe clears.** An expert now drags to depth 244 instead of 280. Before, it threw junk after its gnomes with a tired arm: about half clipped and sank at home, and the drags flattened about 70 own patches. Now 2.8 heavies a round land next door. Reason: the thrower plan was self-harm, not a strategy.
- **In the finale, their gnome is as urgent as your own once its throw-back is due.** Every gnome on your lawn at 0:00 costs a point. Reason: it mixes the gnomes, which lifted the Junk gap from 2 to 4.
- **Mr Pemberton throws back before his chores (`spiteFirst` in `profiles.ts`); players don't.** Under the players' order, petty threw back 13 things a round about 15s late instead of 126 within 1.2s. Now he throws back about 100 a round, a median 1.0s after each falls due, which is 0.5s to 1.5s after it lands. Reason: his throw-backs are his character, and the design promises "within 1.5s".
- **Mr Pemberton's deliberate clips are light throws only, and petty's chance drops to 1 in 13 (was 1 in 8).** A clipped heavy sinks his own junk at home, so the expert's wins swung from 23% at no clips to 82% at 1 in 7. Light-only at 1 in 13 gives 47% to 54% across four seed families. Reason: a smooth lever, and a fumbled bin isn't a fair fumble.
- **Players mow a column every 20s, 14s and 10s (learner, regular, expert; was 12s, 7s and 5s), before throw-backs.** Mowing used to sit below throw-backs and almost never ran, so the old rates were never in effect. Reason: at the old rates, mowing alone would take 17% of a regular's round.
- **`bun run balance [seeds] [family]`: a second argument picks another family of seeds.** Reason: a pass on one seed set can be luck; every target passes on families 0 to 3.
- **Final numbers at 200 seeds, family 0: learner 100% (60% or more), expert against petty 54.0% (40% to 60%), host regular 50.0% (45% to 55%), thrower 44.0% (35% to 65%), median Tidy 9 (6 to 16), median Junk gap 4 (4 or more), upkeep 23.2% (20% to 30%) and 40.0% in the heatwave (37% to 50%).** Families 1 to 3: expert 48.5%, 50.5% and 47.0%; host 50.2%, 51.7% and 48.8%; thrower 39.5%, 41.5% and 41.8%; Junk gap 4, 5 and 4; upkeep 23.3% and 39.8% to 40.1%. The median regular lawn at 0:00: Green 23, Stripes 0, Tidy 9, Junk -14, total 17, with 15 weeds, 7 snails, 1 hole and 14 gnomes. Reason: the M27 record.
- **Stripes still score 0 at 0:00 in the median regular round.** The finale covers every column in gnomes, and no target covers stripes. Reason: recorded so a later pass can decide whether stripes need help.
- **The skill ladder against Mr Pemberton is steep.** A regular beats polite in 100% of round 1s, normal in 30% of round 2s and petty in 3% of round 3s; a learner never beats normal or petty. The design asks only that you beat polite on your first try and petty about half the time once you know the game. Reason: recorded for whoever tunes Practice for newcomers.
- **Health 0 and 1 stay identical on your own lawn.** Both draw as bare mud, because the tint draws every level one browner and clamps at the bottom. This is the same drawing in every colour filter, not a colour-vision fault, and both mean the patch needs water now. Reason: the lie is the design's ("1 health level browner than it is"), and M25 left this call to M27.
- **Fixed a seed-dependent failure in `rejoin.mjs`: the mid-round reload watered and mowed patch 100, in the starting gnomes' rows.** When a gnome stood there, its rest damage could take the patch below the check's health 6. The check now picks a patch in rows 2 to 4 with nothing on it and no snail on its row. Reason: it failed once at 390 by 844, then passed 3 times; the game was right.
- **`perf.mjs` after the tuning, at 4x throttle on this machine's GPU: frame work p95 3.6 ms, worst 4.9 ms; frame gaps p95 16.7 ms; 0.2 React commits a second; a fresh round caught up in 29.9 ms (was 38.7 ms, since slower drying fires fewer timers); the crowded lawn in 50.4 ms (was 51.7 ms); a late guest reload rebuilt in 53.1 ms.** A petty bot match peaked at 4 bundles a second, largest 1,226 B. Reason: tuning changes timer counts, so the M26 numbers were re-measured.

### Made While Playtesting (2026-10-13)

- **Playtests start from the home screen.** `e2e/playtest.mjs` types names, starts a room, joins by typed code, clicks Ready, plays a match with `e2e/hand.mjs`, then opens the share card and clicks Rematch. `e2e/rooms.mjs` covers room trouble and `e2e/practicetest.mjs` covers Practice. Reason: the milestone scripts start from the room page and skip the screens a friend sees first.
- **Local test tabs use the name typed in that tab.** The home screen also keeps it in `sessionStorage` in dev builds, and a `?local` room reads it before picking a funny name. Reason: tabs of one browser share `localStorage`, so typed names never reached a local lobby.
- **Lobby names wrap instead of cutting short.** "Gnome Hoarder" read "Gnome Hoa…" in a gate at 390 px wide. Reason: the lobby is where you check who joined.
- **The match end pins the rematch line and its buttons to the card's bottom.** At 375 by 667, "neighbour_name wants a rematch." pushed Rematch below the fold and Leave off screen. The rest of the card scrolls behind them. Reason: the next step must always show.
- **The match end's points columns show You and their name.** On phones both columns sat under the You lawn, beside the replay. Reason: you couldn't tell which column was yours.
- **Brenda's heading names the round's winner once she pins the rosette: "You Win Round 1", "Gnome Hoarder Wins Round 1" or "Round 1 Is a Draw".** It sits left of centre and ends before Brenda, so 16 wide letters still fit. Reason: the rosette alone left you to work out the result from the scores.
- **The reveal board starts at design y 112, under the peek strip's tint caption.** Reason: the board's top edge cut through "Somehow greener".
- **One mower pass cuts a patch to short: length 1, or 0 if it was already short.** It used to take 1 off. Grass reaches length 3 about 75s into a round, so one swipe left it at 2 and drew no stripe, while the tip says "Rub the grass to mow a stripe." Now the design's "One pass stripes a column for 75s. Two passes hold it for 150s." holds all round. Every M27 target is unchanged at 200 seeds. Regular bots now hold a median 2 stripes at 2:00 left, where they held 0. Reason: a swipe that mows without a stripe looks broken.
- **Stripes still score 0 at 0:00 for every bot, so mowing never moves a bot's score.** At 0:00 a regular's lawn is 25% slime, 22% landing scuffs and 10% wilted weeds, and almost every patch is long, because bots stop mowing once the shed opens. A column mowed after the last landing stripes if it holds 2 or fewer weeds, snails or items; columns hold 2.7 on average. Reason: recorded for the owner's balance check with real people.
- **Dev `act.pullWeeds(keep)` pulls rooted weeds, newest first.** `dandelion.mjs` failed 2 of 6 runs: an idle lawn late in round 2 sits at the 40-weed cap, so the thrown clock's seeds rightly never rooted. The script now thins the receiving lawn to 20 weeds first. Reason: the game was right and the check depended on the seed.
- **Headless Chromium ignores CDP's page freeze, so `rooms.mjs` acts out a background tab another way.** It reports the page hidden, then pauses its JavaScript in the debugger for 20s. Reason: a frozen phone tab runs no timers and sends nothing, and the freeze left this one running.
- **Under parallel load, `chores.mjs` and `finale.mjs` each failed once and passed when rerun alone.** `chores.mjs` saw a snail tip where it expected the empty-can toast, likely a snail under its fixed pour spot. `finale.mjs` read the garden before a starved frame applied the release. Reason: recorded so a later failure there starts from evidence.
- **Measured on 2026-10-13, local `?fast` matches at 1280 by 800, 390 by 844 and 375 by 667:** 1.36 to 1.44 bundles a second per player from Ready to the match end, a peak of 4 in any second and a largest bundle of 1,132 B. Both pages agreed on every verdict and tally. Reason: the network record for this pass.
- **Measured on 2026-10-13 over real Pusher, desktop against a 390 by 844 phone, `?fast`, 2 rounds to 0:** 177 and 180 client events from the home screen to the match end, about 714 Pusher messages. Each side received every bundle the other sent, with no drops, a peak of 4 a second and a largest bundle of 1,131 B. `rooms.mjs small pusher` passed too: Room Full, Away after 3.1s, a 20s background, a reload rebuilt in 6.3 ms, Stormed Off and a newcomer seated. Reason: the real-Pusher record for this pass.
- **Measured on 2026-10-13, a full-length local match, desktop against a 390 by 844 page, 2 rounds to 0 in 7.2 min:** 646 and 651 client events, about 2,594 Pusher messages, at 1.55 bundles a second per player, a peak of 4 and a largest bundle of 712 B. A 3-round match at that rate costs about 2,000 events, about 4,000 messages, so the daily quota covers about 50 full 3-round matches or about 77 matches won 2 to 0. Reason: the design's "about 55 a day" holds roughly.
- **Left as they are:** tips start again after a mid-round reload, since tips seen live only in the page; Practice loads the pusher-js code file (it never connects); dragging heavy junk often names "flattened" as the blame, because a drag off the patio flattens about 30 patches and each costs real Green. Reason: none of them misleads or costs a player anything.

### Made While Fixing the Audit (2026-10-13)

An audit listed 10 gaps. Each was confirmed in the code or a browser before fixing; none was rejected.

- **A host back from a closed page judges the round it missed from its own lawn, rebuilt from the guest's copy and caught up to the round's end.** The guest's `sync` names the round it waits on (`wait`) with its copy of the host's lawn from it (`waitCopy`), and the guest's repeated `final` triggers the same rebuild. Reason: a host back 1s after the reveal must get the same lawn as one that reloads during it, and a reload never rescues a bad lawn.
- **The guest repeats its `final` only while the host is on the member list.** The audit counted 56 repeats sent to an empty room while the host was gone. Reason: nobody can hear them, and the host's return asks again.
- **A reloaded host asks for the verdicts it lacks with `need` bits in its `sync`, and the guest sends back its `result` for each with its own final as `gf`.** The audit suggested sending the verdicts with every reply to a host `hello`. Reason: a host also says hello after every tab switch, and a verdict with both finals is up to 1.8 KB, so asking sends them only when missing.
- **The host's reveal and match end draw its own lawn from the verdict's `hf`, the final Brenda judged.** A reloaded host's rebuilt final can differ a little from the one judged. Reason: the drawing must match the scores under it.
- **Bundles are filtered message by message, against the room as the earlier messages left it.** A reloaded host's first bundle from the guest carries the `sync` that restores the match, then that match's `final`. The one-pass filter dropped the `final` as another match's. Reason: order within a bundle is the sender's order, so it must also be the receiver's.
- **The Pusher transport reports `connected` only once the room channel has subscribed, and every gap after the first join is `reconnecting`.** pusher-js says `connecting` while it retries, so the banner never showed and no hello went out. The room flow now says hello on any return to `connected`. Measured over real Pusher with `e2e/reconnect.mjs`: a cut showed Reconnecting… after 35 ms, 14s of refused sockets kept it up, and B was back 2s after the line returned with one hello; a brief cut showed it after 14 ms. The run cost 12 client events. Reason: the design's banner and hello.
- **A newcomer whose member list shows 2 other players sees Room Full at once and sends nothing.** Measured in a local tab: Room Full 753 ms after opening, page load included, with 0 bundles sent. Risk: a seated player who reloads while a third visitor's dead connection is still listed sees Room Full too, and Try Again works once Pusher drops it. Reason: the design asks for it, and that race needs a stranger leaving uncleanly at the same moment.
- **One Away tag shows in the top bar, under the neighbour's name on their lobby gate, and beside their name under their lawn on the match end.** A match end without lawns puts it on the rematch line, or after their name when there is no line. Reason: you can see why Ready or Rematch is taking a while.
- **The lobby code gives screen readers the spaced letters as hidden text and hides the grouped capitals from them.** Reason: screen readers read a span's text, not a label on it.
- **On wide screens the backdrop draws hedge clumps on both sides and a 300-unit shed on the right, with a gnome at the window.** The shed shrinks to fit and stays away below 45% of its size, about 210 spare units. It paints once per resize. Reason: the design's spare-width shed and hedge; the left side holds the keys hint.
- **The dev panel's cheat list is built only in dev builds.** No cheat label reaches the production client bundle. The garden's small dev helpers (`dryAll`, `digSoon`, `gustSoon`) still ship as class methods that nothing in production calls. Reason: a bundler can't drop class methods, and moving them out of `Garden` changes nothing a player can reach. (Replaced on 2026-10-13: they moved out after all, see Made While Fixing the Second Audit.)
- **The auth route answers a body that isn't a form with 400: "The join request is not a form post, so nothing was signed."** JSON and empty bodies used to crash it with a 500. Reason: a clean refusal.
- **The hard rule now says the canvas draws Brenda's reveal, and React mirrors her verdict as text.** `DESIGN.md`'s Layout line says the same. Reason: the reveal draws on the canvas for frame rate, as M19 decided.
- **Found while testing, and fixed: a guest that lost the host's `start` and every `sync` before play stayed in the lobby while the host played alone.** Nothing repeats them once play runs. `results.mjs soak` with `drop=0.3` hit it once in 3 runs. Now a host in a running match answers a guest's lobby `sync` with its own, which carries the match. Reason: repeats instead of one-offs, as the design asks.
- **Left as it was:** a guest that reloads during a reveal draws its own lawn from its rebuilt final, which can differ a little from the final the host judged. Reason: carrying the guest's final in every `result` would add up to 740 characters per round for a small drawing difference.

### Made While Fixing the Second Audit (2026-10-13)

A second audit listed 6 gaps. Each was confirmed in the code before fixing, then checked in a browser, mostly with `e2e/away.mjs`. None was rejected.

- **A hidden page's timer now runs the frame's step.** With no frame for 1s, the session's 250 ms tick catches the garden up and sends what crossed the fence. It sends the lawn up to 250 ms early, so a background tab's 1s timer never skips a beat. The step plays no sounds and stops the loops. Reason: a desktop tab hidden for 60s sent nothing in a round, so the match ended as a no contest. The audit's other option, a hidden flag that pauses the count, would still let a hidden tab dodge every throw.
- **So a hidden desktop tab never shows Away, and throws land on it.** A frozen phone tab still goes Away, then Gone once Pusher drops it. Measured: a 70s hide mid-round never showed Away, in 69 polls at 1280 by 800 and 68 at 390 by 844. Its lawn never went over 1.6s without an update, and a gnome thrown at it landed. Reason: its garden is still in play, so it should still take hits.
- **The host gives an Away guest that is still listed the full 6s for its final.** Only a Gone guest is judged at once. Reason: a hidden tab's timer still sends a final. The audit's guest dodged the crate's 12 gnomes by switching tabs for 15s.
- **The host replaces a missing guest final with the guest's last `lawn`, rebuilt and caught up to 0:00.** It's the same rebuild a reload runs. With no `lawn` from that round, a fresh lawn catches up instead, so being away never rescues a lawn. The verdict carries the rebuild as `gf`, and the guest draws its own lawn from it. So both screens show the lawn Brenda scored, and a late guest final gets the same verdict again. Measured at 1280 by 800 and 375 by 667: a guest frozen 12.5s before 0:00 was judged about 6.3s into the reveal on 15 gnomes and Junk -15. That matched the total of its own caught-up lawn. A guest frozen past the 30s member timeout was judged as Gone at once, and its rebuild matched too. Reason: the stale update scored Junk -3 for a lawn holding 15 gnomes.
- **The lawn pack, now version 2, adds the 6 own-fault counts, bag cuts, can level, tap state and arm level.** That's 10 more bytes, 392 characters at worst. A rebuild restores them. So a reload keeps a full bag, a part-used can, a running tap and a tired arm. Brenda's blame line and the share card's Fence Clips keep faults from before it too. The tap's run time travels in 100 ms steps, so a rebuilt flood can come up to 100 ms late. Measured: bag 90, a running tap, 2 drowned patches and the arm survived a reload. A 4,200 ms can survived another. Reason: a reload emptied the bag without the compost trip and stopped a flooding tap.
- **After a walkover, the loser's seat stays locked while the winner's screen shows the result.** Back to Lobby frees it under the usual 10s rule. Other match ends free seats as before. Measured: a newcomer 2s after the walkover saw Room Full. The loser came back 14s later to "You didn't come back in time." Reason: the design says a returner sees the result. Starting the 10s at the match end would still let a newcomer in after 10s.
- **The dev cheats left the game and network code.** `setPatch`, `dryAll`, `digSoon` and `gustSoon` are plain functions in `game/cheats.ts`. Only the dev scripting module and tests import it, and the dev panel's list comes from that module too. Dev `hide(ms)` fakes the page's visibility and stops frames from the dev module. Dev `jump` moves the match clock in place and reaches the guest's tab over a dev `BroadcastChannel`. So the room flow lost its `jump` input. Measured: a production build's code holds none of their names. Its Practice ran a full-length round with no `window.__game` and no dev panel (`e2e/prodcheck.mjs`). Risk: dev `jump` reaches only tabs of one browser, which every script that jumps already uses. Reason: the hard rule.
- **Ready's label says what pressing it does, with no pressed state.** Once pressed it reads Not Ready, and its description is the waiting line. A screen reader hears "Not Ready, button, Waiting for Sid to press Ready." Reason: the design's room table names a Not Ready button. The label swap plus a pressed state contradicted each other.
- **Measured over real Pusher on 2026-10-13, `away.mjs pusher phone`:** a guest frozen 12s before 0:00 woke to its rebuilt lawn on both screens. The round cost 57 and 42 client events, about 200 messages, and the largest bundle was the verdict with `gf` at 1,558 B. Reason: the real-Pusher record for this pass.
- **`lawn.mjs` now compares the two idle lawns at the same garden time.** Each page steps on its own frames, so a read one tick apart failed 2 of 5 runs when a patch dried in between. It passed 9 of 9 after. Reason: a flaky check hides real faults.
- **`rejoin.mjs`'s reload check lets the watered patch grow once.** Its growth timer can tick between the copy and the check, as it would live. The check failed once that way. Reason: the check is about health coming back.
- **Found while testing: a `?fast` reveal's last 3s are the next round's countdown.** So after the 6s wait for an Away guest, about 1s of pure reveal is left. A guest frozen through one wakes in the next countdown. Its match end still shows the judged lawns. Full-length reveals keep 11s after the wait. Reason: recorded, since `?fast` is a dev flag.

### Made While Planning Onboarding (2026-10-13)

Cold playtests found that a friend who joins by link learns throwing and little else. They scored Stripes 0 and Tidy 0 in every round, and learned that gnomes cost points only from Brenda. The research, the first plan and its critique are in `/tmp/greener-onboard/research.md`; the critique's corrected recommendation is the baseline. Ekansh made three decisions, and the lead made the rest.

- **Owner decision, scope: build the corrected recommendation, then run a fresh beginner playtest.** The lobby practice yard comes only if beginners still fail the basic moves. The build covers:
  - the lobby score card with How to Play;
  - staged tips across a new player's first match;
  - a tip queue that never loses a lesson;
  - failure cues for every player;
  - copy fixes;
  - reveal counts.

  Reason: these fix the top confusions with no rule change, and the yard is the riskiest piece.
- **Owner decision, new players: the browser remembers one yes/no fact in `localStorage`, "finished a match".** It's saved when the last reveal of a match ends, online or in Practice; a walkover or storm-off doesn't count. `ARCHITECTURE.md`'s hard rule now allows exactly this fact. Dev builds take `?first=1` or `?first=0`, since two `?local` tabs share storage. Reason: tips should follow the person, not the match.
- **Owner decision, stripes: they're repairable.** Clearing a column's gnomes and mowing it again restores the stripe, so the finale becomes a scramble to fix stripes. Every mark must clear by mowing, and `bun run balance` must keep its targets passing, retuned if needed. Reason: stripes scored 0 at 0:00 in every bot round and every playtest round.
- **A page reads the fact once, at each match's start.** Reason: teaching must not switch off mid-match, and a reload mid-match keeps you new because nothing was saved.
- **Returning players get no tips by default, which replaces U20.** Reason: the fact makes tips per player, and veterans had to press Hide Tips every match.
- **Practice follows the same rule.** Reason: one rule, and Show Tips covers a veteran who wants tips.
- **Teaching is staged, not rules. Wind and fetching get tips in round 2, and the heatwave and catching in round 3.** Reason: the 2:20 stretch stacked five lessons into 11s, and moving teaching leaves the veteran's match unchanged.
- **Every tip and toast fits 320 px at 18 px in the hand font.** Measured in Chromium on 2026-10-13, the longest planned tips run 313 to 320 px. Reason: a 375 px phone leaves about 329 px inside the line's border and padding. (Replaced by B11 in Onboarding Critique Decisions: 295 px.)
- **The tip line moves directly under the fence, at 18 px on phones and 20 px from 640 px wide. A tip whose object sits in the front 2 rows shows in the patio strip instead.** Reason: your eyes rest at the fence, and a tip must never hide what it teaches. (Replaced by B4 and F16: the line now sits over the fence band, and toasts stay in the patio strip.)
- **A pulsing ring marks the tip's object instead of a label beside it.** Reason: a 300 px label over 26 px patches covers 4 columns and sits under your thumb. (Replaced by B8: a marker-yellow arrow.)
- **A tip counts as seen after 3s on screen. Urgent tips cut in, and a waiting tip leaves when its moment passes and returns on its next trigger.** Reason: it keeps every lesson without showing a stale one.
- **Failure tips show once per round of the first match.** Reason: mistakes recur, and one lesson after the first failure came too late in both playtests.
- **"Mow!" and "Somehow greener." stay, and round 1 gets no banner. Round 2 names the lie with "Next door only looks greener."** Reason: the pun and the tint joke are the game, and the peel teaches the tint first. (The round 2 line became "Trust the sparkle, not the colour." under F20, and was cut after the 2026-10-14 playtests.)
- **The ghost finger on the first gnome is the only thing drawn over the grass.** Reason: labels and fingers on a phone lawn hide the brown patches and snails they teach.
- **The shed banner covers the peek strip, in round 1 of a first match only.** Reason: the crate's gnomes arrived "from nowhere", and the peek strip is the one band with nothing to press. (B10 makes it one line with no title.)
- **"Gnomes first. Then big junk, if you dare." replaces any line saying patio junk costs nothing.** Reason: the bin, mower and trampoline carry the best self-owns.
- **First Match shows on the friend's screen only, as an optional `first` flag in `sync`.** Reason: it tells the veteran a beginner is coming, costs no events, and older pages ignore it.
- **A new player's own top-bar name tag reads You.** Reason: the desktop tester never recognised "Hedge Fund" as their own name. (Replaced in Beginner Playtest Decisions: every player's own tag reads You.)
- **Cut from the first plan:**
  - Change Name;
  - plain worst-moment captions;
  - "Go!" in place of "Mow!";
  - the sideways-mow nudge;
  - patio labels;
  - catching in round 1;
  - the coaching line on the reveal board;
  - First Match Rules.

  Reason: each cost a joke, nagged veterans, needed a protocol change or changed the rules, as the critique found.
- **What Brenda Counts sits above Ready, and Ready keeps pulsing.** Reason: everyone passes the card before pressing, and the pulse is how you learn your friend is waiting.
- **How to Play opens inside the lobby card with 10 lines. The menu's version adds What Brenda Counts.** Reason: the lobby has no clock, and the menu has no lobby card above it.
- **Tips say "Press" for the tap and Biscuit, not "Tap".** Reason: desktop players click.
- **Reveal counts show on both boards, inline at the size of Brenda's line. Green shows "of 50".** Reason: knowing what each line counts helps both players, and Green's lesson is its scale. (B7 makes them 22 units in soft ink, and T25 has the verdict carry them.)
- **The coach tip compares your lawn with Green 36, Tidy 20 and Junk 0. It shows as the first tip of rounds 2 and 3, not on the reveal board.** Reason: the blame line fills the board's bottom, and the next round's start is when you can act.
- **Stripes were already repairable in the lawn rules.** A scratch check on 2026-10-13 broke a mown column with 3 scuffs, slime and drag ruts. One more pass restored it. M36 pins this in tests and adds a cue, and M37 teaches it to bots. Reason: the gap was knowledge and bot play, not rules.
- **M35 adds one balance target: the finale mower holds at least 1 striped column at 0:00 in half its rounds. If bot play can't reach it, the stripe rule drops to 13 of 16 patches for everyone.** Reason: repair must show in play, and a looser rule stays equal for both lawns. (Replaced by F14 and T21: no rule fallback, and the bot finale is now M37.)
- **No yard milestone. `DESIGN.md`'s Beginner Playtest Gate decides, by measured moves.** Reason: the owner's call. (The 2026-10-14 playtest failed Mow, so M44 and M45 build the yard; see Beginner Playtest Decisions.)
- **Noticed while planning:** `e2e/endings.mjs` is missing from the Code Map. The Code Map's `finale.mjs` line and a comment in the garden still say the crate holds 15 gnomes. M28 fixes the comment and M40 the Code Map. Reason: recorded so a builder fixes the drift.

### Made While Building M28 and M29 (2026-10-13)

- **The tap tip moved to its new trigger in M28: you turn the tap on.** Its new words, "Press the tap again within 8s, or it floods.", were wrong on the old trigger, 4s after the can filled. The `tap` event already existed. Reason: copy and trigger had to change together.
- **How to Play in the lobby is the same card with the title How to Play.** The card focuses its heading on a title change, and Back refocuses the How to Play button after it. A countdown or Back to Lobby closes it. Reason: one focus rule for every card.
- **Any match start moves focus to the menu button when focus would fall to the page.** That covers Ready, How to Play and Rematch. Reason: the lobby and match end cards leave the page, and a screen reader must land somewhere.
- **What Brenda Counts shows on alone lobby cards too, and every lobby card pins its buttons and status line.** Reason: a joiner waiting alone has time to read it.
- **The First Match flag clears when a match starts and on a hello, like Ready.** It comes back only with a lobby `sync` that says it. Reason: after the match, a stale tag must not show for the 2s before the next `sync`.
- **Mr Pemberton's session is never new and never saves the fact.** Reason: only the person's page decides what the browser remembers.
- **A new player's Ready pulse waits 6s from when the page is seated in the lobby, How to Play included (`NEW_PLAYER_PULSE_MS`).** Reason: reading How to Play counts as reading the card. (M45 adds: and only once the yard is finished or skipped.)
- **The e2e helpers' `launch()` is now async and patches `browser.newContext` to store the fact, with `fresh: true` to skip it.** Reason: T23; every script keeps a veteran's game.
- **The page logs a `finished` dev event when it saves the fact.** Reason: scripts can see the save without reading storage.

### Onboarding Critique Decisions (2026-10-13)

A critic reviewed the onboarding plan through three lenses: a beginner's first match (B), fun and fairness (F) and the build (T). Each issue is listed with what happened to it and why. Accepted issues are folded into `DESIGN.md`'s Onboarding section and milestones M28 to M40, which replaced the first M28 to M38. Widths are the hand font at 18 px, measured in Chromium on 2026-10-13.

**Beginner**

- **B1, the heavy-junk tip teaches a gesture that always fails: accepted.** Checked: a press that starts by sliding becomes a drag and can never lift in that press (`HeavyGrip`). Two urgent tips replace it: "Slide it halfway up the lawn, then let go." (258 px) and "Now hold it still until it lifts, then swipe up." (279 px), plus the failure tip "Let go first, then hold it until it lifts." (238 px). How to Play line 10 says the same. Reason: the game's own instruction must not cause the bin to sink at home.
- **B2, a mown column that fails to stripe gets no explanation: accepted.** A press that cuts 12 or more of a column's 16 patches without striping it flashes the blocking patches for 1s, for everyone. A new player also gets "Weeds or junk block this stripe. Clear them." (284 px). Reason: "I mowed and nothing happened" was the top mowing complaint.
- **B3, mowing's speed window is never taught: accepted, combined with F15.** The mow tip and the mower-poke toast become "Mow slowly up and down a whole column." (255 px). A fast flick that grabs nothing earns "Missed. Press on it first, then swipe." only when it aims within 60° of the fence with an item within 88 px. Any other gets "Too fast to mow. Press, then drag slowly." (266 px). The mow tip points at the shaggy column, not the mower. Reason: direction alone misreads an upward mowing rub, and distance alone misreads a sideways rub beside a gnome.
- **B4, the tip line hides where clipped throws land: accepted.** The line's bottom edge now sits on the lawn's top edge, over the fence and the bottom of the peek strip. Rejected part: the peek strip as the fallback spot. Reason: the fence band holds nothing to press and nothing that scores, but falling items and the vane pass through the peek strip, so the patio strip stays the fallback. A 375 by 548 screenshot checks a clipped gnome below a tip.
- **B5, the score lines depend on reading the card once: accepted.** The card's Stripes line now says "with nothing on it at 0:00". A first stripe earns "Stripe! It scores if it lasts until 0:00." (242 px). The incoming-throw tip becomes "That came from next door. Throw it back." (268 px). A new player's Ready pulse waits until the card has shown for 6s. The playtest asks for the four lines at round 1's "Time's up." Reason: the joiner usually finds their friend already Ready.
- **B6, failure tips clog the queue with stale advice: accepted.** Failure tips wait at most 2s, and only one waits at a time. The sparkle tip is urgent and ends when the pour stops or the patch drowns. Both heavy-junk tips are urgent. A unit test covers 3 failures and 2 staged tips within 2s. Reason: advice 9s after the mistake reads as noise.
- **B7, reveal counts are too small to read on a phone: accepted.** Counts draw at the score label's 22 units in soft ink. Reason: the reveal is the main place the four lines get explained.
- **B8, the tip ring looks like Biscuit's rings: accepted.** A small marker-yellow arrow bobs above the object instead, still under Reduced Motion. Objects with their own ring get no arrow. A column gets the arrow plus a thin outline from row 2. Reason: a ring already means "Biscuit is up to something".
- **B9, the countdown is wasted: accepted.** The start tip and one ghost-finger play run in round 1's countdown, and the finger plays once more at 0s. The coach tip shows during the countdowns of rounds 2 and 3. Input stays locked, so the rules don't change. Reason: it's the only moment with nothing to do.
- **B10, the shed banner can't fit the peek strip: accepted.** One 18 px line with no title: "The shed's open. Every gnome costs a point." (283 px). Screen readers hear the full sentence. Reason: the strip is 52 px tall at 375 by 548.
- **B11, the width budget uses the wrong phone: accepted.** The budget is 295 px, and every tip, toast and banner line is measured against it. The thrown-mower toast becomes "You threw your mower. No mowing this round." (292 px), and the mower-poke toast gets exact wording. Reason: 375 by 548 leaves about 297 px inside the line.
- **B12, the stripe tip fires at 0:15 with gnomes still down: accepted.** In round 1 it shows only once the lawn holds no gnome. From round 2 the 0:15 fallback stays. The words become "Mow columns now. Stripes count at 0:00." (261 px), which assumes no earlier stripes. Reason: gnomes are the finale job a beginner can manage.
- **B13, a beginner who loses 0 to 2 never learns catching: accepted.** How to Play gains an 11th line: "Press something while it falls over the fence to catch it." Reason: one line costs nothing and covers the likely 2-0 loss.

**Fun and fairness**

- **F14, the harness never re-mows late: accepted.** A new `closer` finale plan joins the harness, with thrower against closer and mower against closer each held to 35% to 65%. The 13-of-16 fallback is dropped. Reason: a taught human mows every column in the last 20s, and the rule must not change to rescue a bot.
- **F15, two failure cues name the wrong cause: accepted.** The blocked throw says "Too soon" with the tip "Too soon. Wait a moment between throws." (268 px). The arm says "Arm's tired" in both the puff and "Arm's tired. Throw once a second." (216 px). The missed flick picks its line as in B3. Reason: a wrong cause turns own-fault rage into blaming the game.
- **F16, toasts would cover the front row for veterans: accepted.** Toasts and the Reconnecting banner stay in the patio strip for everyone. Only a new player's tips use the line by the fence. Each tip's spot is fixed when it shows, and the clip tip waits until the item drops back. Reason: veterans see nothing new, and the line never hides a teeter or a landing.
- **F17, petty Practice becomes an easy win: accepted.** Petty Pemberton keeps his mower, re-mows late and throws the mower in the last few seconds. The expert-against-petty target is measured with the closer's finale. Reason: it stays in character and adds a last-second mower joke.
- **F18, the Junk coach tip blames you for their junk: accepted.** The coach tip counts only preventable losses: gnomes and your own heavy junk. Heavy junk from next door is left out, and the verdict carries that count. Reason: advice to lift sunk junk is impossible.
- **F19, a reload mid-reveal can mismatch the counts: accepted, merged with T25.** Reason: the same fix.
- **F20, three tip lines undercut a joke or a score word: accepted.** "Trust the sparkle, not the colour." replaces "Next door only looks greener." The snail tip says "your grass", and the incoming tip says "from next door". Reason: the joke stays unexplained, and "junk" stays the score word.

**Build**

- **T21, the finale mower's stripe target sits at 0%: accepted.** Stripe rules and cues (M36) ship apart from the bot finale (M37). The bots' finale mows from 0:15 left, and `bun run balance` prints why each column failed. All 8 M27 targets are explicit acceptance. Rejected part: changing the stripe rule if the breakdown blames the threshold. Reason: F14 already ruled the threshold out.
- **T22, nothing stops replayed events raising tips: accepted.** Frames that jump more than 500 ms, steps while hidden, and rebuilds raise no tips. Tip time stands still while hidden. Countdown tips, the ghost finger and the coach tip need the round's first live frame in its countdown or first 2s of play. Reason: a hidden tab would spend lessons on an empty screen.
- **T23, e2e scripts break more widely than planned: accepted, with a different default.** Contexts from the helpers' `launch()` start with the fact stored, instead of adding `first=0` to every URL. Most scripts build their own URLs, so the context is the one place every script shares. Each milestone lists the scripts it breaks, `match.mjs` checks Hide Tips against a round 1 dig tip, the stripe cue gets its own sound name, and M40 adds `wind.mjs`, `pests.mjs` and `sound.mjs`. Reason: every script keeps its old behaviour by default.
- **T24, the stripe you see and the stripe Brenda counts differ: accepted.** One shared covering rule, Brenda's, drives both. Cues reset on every garden change and skip catch-up. The no-gnome trigger uses Brenda's count. Reason: a sweep followed by no stripe at 0:00 breaks trust.
- **T25, counts come from lawns Brenda may not have scored: accepted.** The host counts both lawns when it judges, and the verdict carries the counts, under 30 bytes a lawn. Reason: both screens must agree after a reload too.
- **T26, the fast run can't check tips by stage: accepted.** Time triggers scale with the round's length. The `?fast` run checks only rules that hold at any speed, and the full run checks stages. Reason: timing luck can't decide a pass.
- **T27, the waiting line scrolls away, and How to Play hides the friend's status: accepted.** The waiting line is pinned with the buttons, How to Play keeps one status line, and focus moves to the menu button when the countdown starts. Reason: the waiting line is what a screen reader hears with Not Ready.
- **T28, the lobby flag could outlive the first match: accepted.** The `sync` flag reads the fact live for each message; the match-start read drives teaching only. M39 checks Back to Lobby. Reason: a rematch never returns to the lobby, so the old check couldn't fail.
- **T29, a toast holds back urgent tips: accepted, mostly made moot by F16.** Tips and toasts use separate lines. A tip moved to the patio strip waits for a toast there, unless urgent, and the catch tip always shows there. Reason: the dig circle lasts 2s and a toast 2.6s.
- **T30, the Tidy coach line names only weeds and snails: accepted.** Tidy's line follows its biggest kind: weeds and snails, holes ("Holes cost you 4. Press Biscuit as he circles.", 292 px with two digits), or litter and clippings. Reason: advice must match the loss.
- **T31, M31 is too big to verify in one pass: accepted.** Triggers (M31) and pointers with placement (M32) are separate milestones. Reason: unit tests can pin triggers before any screenshot.

Rejected outright: none. Three suggestions changed shape: the e2e default (T23), the fallback spot (B4) and the threshold escape hatch (T21).

### Made While Building M30 to M33 (2026-10-13)

- **M30's "5 tips raised within 1s" acceptance contradicted the 10s staged wait.** Each tip takes 3.4s with its gap, so a 5th tip waits 12.8s and leaves. The test shows 4 in order, and another shows a 5th leaving unseen and returning on its next trigger. Reason: the 10s rule keeps stale tips off the line, and round 1 never raises 5 tips at once.
- **Every tip comes from one `TipTriggers` per round garden, fed only live events and live frames.** A frame that isn't live updates its stripe mask and raises nothing. Reason: one place decides what counts as catch-up.
- **Garden events now carry the ids a tip points at.** Sprouts, snails, seed clocks, clips, landings, arrivals and sinks gained an id, set-downs a `fast` flag, and stopping a pour a `pourStop` event. Reason: an arrow needs its object, and a moment needs an end.
- **The watering tip points at the driest patch at health 4 or less with nothing on it, no hole and no mud.** Ties go to the patch nearest the patio. Reason: "brown grass" must be grass you can pour on.
- **"Throw it back" and the catch tip ignore heavy junk, bags and seeds.** Reason: sunk junk and a burst bag can't be thrown back or caught.
- **The stripes tip counts gnomes still falling onto your lawn as well as Brenda's count.** Reason: at 0:40 the crate's gnomes are in the air, and Brenda's count alone reads 0.
- **Time triggers check on whole 250 ms steps of garden time.** Reason: the check scans the lawn, and a step keeps a trigger at most 250 ms late.
- **The three wind lines share one tip id.** Reason: the wind tip shows once a match, whichever gust comes first.
- **A tip moves to the patio strip when its object's drawn middle sits within 64 design units above the lawn.** That is the tip line's 56 units plus 8 for half an object. Reason: a throw teetering on the fence sits there.
- **An arrow over a front-row object points up from below it instead.** Reason: pointing down, its tail reached under the tip line.
- **No arrow for an item in your hand or sunk, or for the bag while you hold it.** Reason: your finger and the lift and compost rings already mark them.
- **E2e scripts wait 3 animation frames after a dev jump before real input (`frames()`), and never run two at once.** Reason: a dev jump stops a page's frames for about 1s (see below), two browsers at once cause similar gaps, and a press in a gap lands in catch-up, which raises no tips by design.
- **Scripts measure a tip once its pop-in ends (`settledBox`).** Reason: mid pop-in, a tip is 14% larger and overhangs the lawn edge.
- **Staged tips don't use up their 10s wait while an urgent tip shows.** In `bag.mjs`, Biscuit's bark and fetch tips cut in on the water tip, which went back to the front. The bag tip then waited 10.8s and left unseen. Failure tips keep their 2s limit. Reason: an interruption must not cost a lesson that won't come back soon.
- **The ghost finger and the start tip's arrow both use the gnome nearest the middle of the patio edge.** The arrow stays hidden while the finger plays. Reason: that gnome is the one a thumb reaches first, and two pointers on one gnome are noise.
- **The finger drags a see-through copy of the gnome, which flies on over the fence once the finger lets go.** The real gnome never moves. Reason: showing where the throw goes teaches letting go mid-swipe, and the rules stay untouched.
- **The countdown play can't be stopped, and the 0s play stops on any press on the canvas.** Reason: presses do nothing in the countdown, and the design wants your first touch to stop the second play.
- **Under Reduced Motion, the still arrow runs from the gnome to the lawn's top edge.** Reason: drawn to the fence top, its head hid under the tip line.
- **The shed banner is marker yellow like a toast, in its own status region that speaks the full sentence.** The visible line is hidden from screen readers. Reason: it's a warning, and screen readers should hear the rule once.
- **From round 2, or after Show Tips past round 1, the shed tip shows at once with no banner.** Reason: the banner belongs to round 1 of a first match.
- **Noticed while building:** after a dev jump, a page's animation frames stop for 1,034 ms while its main thread stays free. The committed version from before onboarding does the same, and a natural round end shows no gap. So it's a dev-jump effect that players never meet. A first real press in a fresh browser sometimes meets a similar gap, so in long batches `fence.mjs` and `pests.mjs throws` each failed once and passed alone. Reason: recorded so the next builder doesn't chase it, and scripts wait it out with `frames()`.

### Made While Building M34 to M36 and M38 (2026-10-13)

- **A fast flick on grass goes to the garden as one `snap` command, which grabs the nearest light thing or reports the miss.** Reason: the garden is the one place that can say "missed" and name what was near, and unit tests pin it there.
- **The release rule names why it put an item down: slow, off-angle or cancelled. The garden turns any bag put down off the compost into `bag`, unless the press was cancelled.** Reason: "Hold the bag on the compost to empty it." fits the bag whatever the swipe, and a cancelled press is never your mistake.
- **A weed shakes, with the rooted tip, after any release before the 60-unit pull, slow or fast, but not after a cancelled press.** Reason: "Pull it out first" fits both, and the playtest gate counts these releases.
- **"Missed." needs the flick aimed within 60 degrees of the fence and a light thing within 88 px of the press. Heavy junk never counts.** Reason: pressing heavy junk and swiping drags it, so "Press on it first, then swipe." would be wrong there.
- **A blocked throw's words sit beside the dropped item for 0.8s in the marker font, white with a red edge, inside a flashing red ring.** Reason: it matches "Woof!" and the arm ring, and reads at 375 px.
- **A press on a bag too empty to lift does nothing now.** Checked on 2026-10-13: the bag sits 32 units from the mower's middle, inside its 40-unit reach, so a press on a bag under 24 cuts showed "Mow slowly up and down a whole column." A press on the drawn bag no longer pokes the mower. Reason: M34 asked for exactly this.
- **Cue timing runs from the input that caused it to the cue's first frame.** A blocked throw or a rooted weed counts from letting go, and a miss from the flick's first move. Reason: a miss happens mid-flick, before you let go.
- **Bit 7 of a final marker's type byte flags heavy junk from next door, and the final's version stays 1.** Reason: a page that ignores the bit still reads the final, and the coach tip needs it.
- **The verdict carries 11 counts a lawn as `ct`, about 26 bytes each, and the validator requires them.** Reason: both screens read the counts from the verdict, and every page in a room runs the same build.
- **A guest lawn the host rebuilt from its last lawn report counts no junk as theirs.** Reason: the report doesn't say where junk came from, it happens only when the guest's final never came, and it changes only the coach tip's pick.
- **Litter shows as "bits of litter" and clippings as "clippings patches".** Reason: the lobby card names them that way.
- **The coach tip is one tip id that shows once a round (`eachRound`), with a staged tip's waiting rules.** Reason: it must show in both rounds 2 and 3, and a failure tip's 2s wait could drop it behind another countdown tip.
- **Counts sit right-aligned just left of the score column, at 22 units in soft ink.** Reason: they line up from row to row and stay clear of both the label and a three-character score. The fit check measures each count.
- **The plan's coach example "Junk -8 from 2 trampolines" now says 2 bins.** Reason: 2 trampolines cost 12.
- **The two-digit Holes coach line measures exactly 295 px at 18 px.** Reason: recorded so nobody lengthens it; it still fits.
- **The stripe on screen now follows Brenda's covering rule, so an item in your hand or Biscuit's mouth hides it.** A second mask, `settledStripes`, ignores held and carried items, and the stripe cues and the first-stripe tip follow that one. Reason: T24 makes your screen and Brenda agree, and the design gives carrying across a stripe no cue.
- **The stripe cue watcher lives in the session, for every page but Mr Pemberton's.** It reports only live play, and a new garden, a new round or a rebuild, starts it fresh. Reason: tip triggers skip pages with tips off, and only the session knows which steps are live.
- **The blocked-stripe flash fires when a mowing press ends, for each column the press cut 12 or more patches of that still doesn't stripe.** Reason: the press may still cut the last patches, so its end is when "it doesn't stripe" is true.
- **The `stripe` chime is a new shared sound: two soft rising sine notes, quieter than `ding`.** It plays once a frame in which any column gains a stripe. Reason: T23 gave the stripe cue its own sound name, so scripts can tell it from the sparkle.
- **M38 was built before M37.** Reason: M38 is two small fixes that touch nothing M37 changes, and M37 is a long bot-tuning task best started fresh. The next builder starts at M37.
- **The live region empties when a match starts, and every countdown's clock shows the round's full time.** Reason: a rematch's live region still held "neighbour_name wins the match.", and the round 2 and 3 countdowns read 0:00.
- **`reveal.mjs` checks a reloaded guest's later steps only once its clock has a ping under 60 ms back and its frames flow.** A reloaded page's catch-up holds its frames for about 1s, so its step log misses that second, while its later steps land within 2 ms of the host's. Reason: the check is about the reveal staying in step, not the reload's first second.
- **Noticed while building:** the dev hook's `reveal().step` keeps the last reveal's step through the next round's play, because the reveal only draws during a reveal. Scripts should only read it during a reveal. Reason: it misled a step check.
- **Noticed while building:** on two `?local` tabs, a reloaded guest can come back with the host's display name, since the tabs share storage. Dev only; real players have their own browsers. Reason: recorded so nobody chases it in screenshots.
- **Noticed while building:** `e2e/lobby.mjs`, `e2e/pests.mjs`, `e2e/newplayer.mjs` and `src/net/room.ts` weren't formatted after the last round; this round ran Prettier on them. Reason: formatting only.
- **Noticed while building:** `chores.mjs` at 375 by 667 fails about one run in two on its first real rub ("the rub didn't stripe column"), and now and then on a later step. The committed version from before onboarding failed the same first rub in 2 of 3 runs on 2026-10-13, and desktop and 390 by 844 pass. Reason: recorded so the next builder doesn't chase it as a regression.

### Made While Building M37 (2026-10-13)

- **A closing stretch mows before it throws.** Measured at 200 seeds: when the closer only mowed from 0:18, as the plan said, the thrower beat it in 92.2% of rounds and beat the mower in 84.8%, since 18s without throw-backs hands the neighbour every gnome. When it threw whenever its arm was free and mowed while the arm rested, it beat the thrower (34.1%) and the expert beat petty in 67.5%. Mowing every column one pass would stripe first, then throwing, puts every pairing in range. Reason: it's the plan's "only mows columns back to back" while a column qualifies, and the arm-limited throws still go out after.
- **A column qualifies when at most 2 of its patches hold something a pass can't clear: a hole, a weed, a snail, an item or sunk junk.** The plan said "no sunk junk"; sunk junk now counts toward the 2 instead. Reason: sunk junk blocks a patch like a gnome, so a column with 1 sunk patch still stripes after a pass.
- **The bot picks the qualifying column with the fewest such patches, and empties the bag first when that column's cuts would overfill it.** Reason: a later landing is least likely to break it, and a full bag spits clippings that break the stripe.
- **The closer is the expert's own finale: its gnomes go over, it keeps its mower and throws no heavy junk, and it closes from 0:18 left.** `bun run balance` builds the thrower and the mower from the expert. Reason: the expert-against-petty target uses the closer, and "keeping its mower until the last seconds" reads as mowing to the end; a mower dragged up the lawn in the last seconds ruts 2 of your own stripes.
- **Regulars close from 0:08 left, not 0:15.** Closing at 0:15 or 0:10 dropped the median Junk gap to 3: 42% and 50% of rounds had a gap of 4 or more. At 0:08 it's 51% to 57% per seed family, and a regular still holds 3 striped columns at 0:00 (median Stripes 8). The mower plan keeps 0:15. Reason: the Junk gap target, with a skill ladder of 0:08, 0:15 and 0:18.
- **Petty Mr Pemberton throws his bin and trampoline at 0:40, keeps his mower, re-mows from 0:15 left and throws the mower 6s before 0:00.** In a full-length Practice round he striped his first column at 0:14, and his mower landed on your lawn at 0:03. The drag ruts 1 or 2 of his fresh stripes. Reason: F17, and the rut is his own-fault joke.
- **Mowing in a closing stretch counts as finale time, not upkeep.** Reason: upkeep measures what keeps a lawn alive, and the stripe scramble is a scoring play like throwing. Upkeep stays at 23.6% and 40.0%.
- **The closing stretch scales with the round's length, like the shed; the late mower throw doesn't.** Reason: the throw's 1.8s action and its flight take real time. In `?fast` rounds petty's mower can still be in the air at 0:00, where it doesn't count; `?fast` is a dev flag.
- **No score or rule change.** Stripes stay at 2.5 points a column and the stripe rule at 14 of 16 patches. Reason: retuned bot play put every target in range.
- **Why the finale mower's columns still fail at 0:00:** it ends a round with a median 3 striped columns, and about 8.5 unstriped. By main reason, 51% of those are marked, 28% covered, 20% long, under 1% sunk and none holed. In a 300-round sample, 94% of its unstriped columns held 3 or more patches a pass can't clear. Reason: the limit is clutter (15 weeds, 7 snails and the gnomes at 0:00), not mowing time, so a player who throws first and then mows is rewarded.
- **`bun run balance` now runs 3 more pairings and takes about 24s (was 15s).** Measured on 2026-10-13 at 200 seeds, families 0 to 3: learner 100% each; expert (closer) against petty 48.0%, 48.5%, 46.0% and 49.0%; host regular 48.5%, 50.5%, 51.8% and 51.7%; thrower against mower 51.9%, 48.0%, 51.3% and 51.5%; thrower against closer 59.2%, 54.0%, 57.4% and 59.8%; mower against closer 58.6%, 54.5%, 61.1% and 59.7%; the mower striped at 0:00 in 98.1%, 97.8%, 97.6% and 97.7% of rounds; median Tidy 9 and Junk gap 4 in all four; upkeep 23.6% to 23.7% and 39.9% to 40.1%. Median Stripes at 0:00: regular 8, mower 8, closer 8. Reason: the M37 record.

### Made While Building M39 (2026-10-13)

- **In dev builds the room link drops this tab's own player flags: `first`, `pid`, `name`, `bot` and `skew`.** It keeps room flags such as `?local` and `?fast`. Reason: a host on `?first=0` handed the friend `?first=0` too, so a friend joining by a copied link never counted as new, and a copied `?pid` would seat two players with one id. Production links carry no flags, as before.
- **`firstmatch.mjs` copies the link with Copy Link and opens it in B's tab.** Reason: it's the path a friend takes, and it checks the link itself.
- **The mixed pair shares B's phone context, with touch, and A's page is resized to 1280 by 800.** A plays by mouse. Reason: `?local` needs one context, and B is the player whose phone matters.
- **The Back to Lobby check runs after the rematch: B leaves, A presses Back to Lobby, and B opens the link again.** Back to Lobby shows on the match end only once the neighbour has left. Dev jumps end the rematch's rounds after its first 6s. Reason: it's the only way back to a lobby with both players, and the rematch's tips are checked before the jumps.
- **The script reads the tips from the event log, which keeps only 200 events, so it pulls both logs every 250 ms and reports any gap.** No run had a gap. Reason: a full-length match logs thousands of events.
- **The fact check allows for shared storage.** In one context, A's page saves the fact too, at the same moment. So a stored fact counts as early only before the last 500 ms of the last reveal, and B's own save time comes from its `finished` event. Reason: the first phone run failed when A's save landed a few milliseconds before B's room ended the match.
- **A staged tip may show again until it has shown for 3s; a failure tip, once a round.** The script fails only on a tip that shows again after that. Reason: the tip queue counts a tip as seen after 3s, so a tip cut short or cleared at 0:00 comes back, as `DESIGN.md` intends.
- **A new dev hook, `tipStages()`, gives each fixed tip line's first round and whether it's a failure tip.** Reason: the script checks stages against the game's own table instead of a copy.
- **`tipNotes` and `expectedCoach` moved from `tips.mjs` into `lib.mjs`.** Reason: `firstmatch.mjs` checks the coach tip the same way.

### Made While Building M40 (2026-10-13)

- **Found and fixed: a guest left on the match end missed a whole rematch round.** If the rematch's `start` and the 1 or 2 syncs before play were all lost, nothing repeated them once play began. The host sent only that match's messages, which the guest's filter drops as another match's. `results.mjs`'s soak with `drop=0.3` failed this way at a rematch in 3 of 3 runs, with the guest hearing nothing for 16s to 28s while the host played alone. A host in a running match now answers a sync from a guest still in the lobby, or still at the end of an earlier match, with its own sync, which carries the match. Reason: "repeats instead of one-offs"; the lobby case was fixed in the first audit, and the match end is the same gap.
- **The weathervane holds still under Reduced Motion: no idle wobble and no shudder while a gust blows.** It still turns to point at the coming gust. Measured: under Reduced Motion, screenshots of the vane 400 ms apart matched, and without it they differed. Reason: it was the one moving decoration left that ignored the setting.
- **`prodcheck.mjs` now covers the new-player fact on a production build.** It starts from empty storage with `?first=0`, sees the start tip, sits through a full-length Practice match, finds the fact saved only after it ends, and then gets no tip with the fact stored and `?first=1`. Reason: M40's acceptance; production must ignore `?first`.
- **`firstmatch.mjs` also takes `desktop`, where B plays by mouse, and B opens the link with a dev `?name=`.** The two tabs share storage, so B sometimes came up with A's typed name, and A's lobby showed two gates named Gnome Hoarder. Reason: M40 runs it at all three sizes, and screenshots must show which gate is which; the name flag doesn't touch who counts as new.
- **`match.mjs` reads the countdown clock 2 animation frames after the phase turns.** The clock follows the phase on the next frame, and a dev jump can hold frames for 1s; it read 0:00 once at 1280 by 800. Reason: a check race, with the game behaving as designed.
- **`stripes.mjs` sprouts its blocking weeds in rows 4, 8 and 13, not 2, 8 and 13.** At 375 by 667 it failed twice with no flash: a touch press at the rub's start in row 1 can reach a weed in row 2, so the rub pulled the weed instead of mowing. Reason: the check is about the flash, and a finger's 22 px reach is the game's rule.
- **`cues.mjs` gives a new player's failure tip a third try.** A staged tip raised in the same moment, such as the weed or snail tip, shows first for its 3s, and the failure tip leaves after its 2s wait, as the queue intends. It failed this way once with both tries taken. Each staged tip is seen once it pushes a failure tip out, so it can't do it again. Reason: the check is about the failure tip, and the queue's rules are checked in `tipQueue.test.ts`.
- **Left as flaky, passing on rerun:** `pests.mjs` once read a real 1,250 px/s mouse flick at desktop as a slow put-down, the first-press frame gap recorded in Made While Building M30 to M33. `biscuit.mjs` at 375 by 667 once saw "Seed clock. Throw it over, don't drop it." where it waited for the fetch tip, after a seeded seed clock appeared during round 2's bark. `reveal.mjs` at 390 by 844 twice saw a guest reloaded mid-reveal enter the ending step 434 ms after the host, though its earlier steps matched within 1 ms; it passed in 3 other runs. `cues.mjs` twice found no swish cue for the returning page's first flick, though the garden logged the miss; it passed in 5 other runs. Reason: each passed when rerun alone, and each looks like the long frames the batch's two busy tabs share; recorded so a later failure starts from evidence.
- **Found and fixed: a tip on the fence line could cover the hat of a gnome lying in the front row.** The spot rule looked at the object's middle, so a gnome clipped back to about 33 units from the fence kept its tip on the fence line over the top 6 units of its hat; `tips.mjs clipped` failed once on it at 375 by 548. The rule now looks at the object's drawn top, with 4 units to spare: any object whose top pokes above the lawn's edge sends its tip to the patio strip. A clipped gnome that dropped back to 21 units got its tip in the patio strip, with the arrow pointing up from below it. Reason: B4, a tip never covers what it teaches.
- **Found and fixed: the wind tip was often lost, so it's urgent now.** `wind.mjs` failed in 9 of 12 runs at one size or another, and its event logs showed why. The wind tip's moment is the vane's 2s warning, but a staged tip on show needs its full 3s plus the 0.4s gap. So a weed, snail or seed clock tip that started up to 1.4s before the vane swung, or any tip already waiting ahead of it, pushed the wind tip past its gust, and it left unseen; Biscuit's urgent dig and fetch tips did the same. As an urgent tip, it jumps the line and cuts in on a staged tip shown for under 3s, like Biscuit's dig tip, whose circle also lasts 2s. `DESIGN.md`'s staged table marks the 3 wind lines urgent. Reason: a wind tip after its gust teaches nothing, and the next gust's tip met the same odds.
- **`wind.mjs` also quiets Biscuit before round 2's first gust, with a new dev cheat, `act.quietDog()`, waits for both pages' tip lines to clear, and lands 6s before the gust instead of 3.5s.** The cheat stops him eyeing, fetching and setting off for new digs for the rest of the round. Reason: the check is about the wind tip, not Biscuit's tips, which `biscuit.mjs` checks, and 6s keeps a jump's 1s frame hold clear of the vane's swing.
- **The Code Map now lists `counts.ts`, `stripeWatch.ts` and `endings.mjs`, and its `finale.mjs` line says 12 crate gnomes.** Reason: M40's acceptance.

### Beginner Playtest Decisions (2026-10-14)

Two cold testers played their first match after M40. Screenshots are in `/tmp/greener-shots`.

- **Link joiner:** iPhone 12 Pro touch with empty storage, against a host on `?first=0` who only pressed Ready. They named all four score lines and pulled weeds before throwing. They never mowed a whole column in the first match, which fails Mow, and left 12 gnomes in round 1. They won 2 rounds to 0, so round 3 never came.
- **Practice tester:** 1280 by 800 with empty storage. They named the score lines, pulled weeds first, mowed a whole column in round 1, and passed every move. They lost 0 to 2 to Mr Pemberton, with 11 and 26 gnomes left.
- **Both testers:** each was a scripted agent taking 10s to 25s to look and act. So the tips they missed, the moving targets and the late finale throws partly reflect that loop rather than the game.

Per the owner's scope decision, a failed basic move means the yard gets built. Each reported problem became a milestone or a rejection:

- **The yard gets built, with 3 steps: throw a gnome, pull and throw a back-row weed, mow a marked column.** Reason: the failed move was mowing, which the critique's two steps don't cover, and both testers' stripe confusion was their most shared complaint.
- **Try the Yard is the main button on a new player's lobby card, and the yard never opens by itself.** Reason: What Brenda Counts taught best in both playtests and must come first, and the critique found that a yard opening first pushed the card to the end.
- **A new player's Ready doesn't pulse until they finish or skip the yard, and never while it's open.** Reason: the critique found the friend's pulse pushes joiners past teaching, and the gate and status line still show the friend is Ready.
- **The yard bar takes the top band, its panel covers the patio, and step lines use the tip line.** Reason: the 3 steps use only the lawn, so nothing covers what a step teaches, even at 375 by 548.
- **The step number rides the lobby `sync` as an optional `yard` field.** Reason: no new events, older pages ignore it, and a 2s lag suits a progress line.
- **The yard garden turns every schedule off and keeps throws local.** Reason: the critique's desync risk; nothing in the lobby may reach the neighbour's garden.
- **In the yard, failure tips show every time, and the ghost finger replays after 2 failed tries in a row.** Reason: the yard exists for mistakes, and it has no clock.
- **A finished yard step replaces its round 1 tip: the weed tip after step 2, the mow tip after step 3.** Reason: tip overload was the joiner's top complaint, and a move just learned needs no second lesson.
- **Returning players get no yard and no Try the Yard.** Reason: How to Play covers a veteran who wants a refresher, and the button would crowd a veteran's lobby.
- **A step's object that rests on the patio or against a hedge goes back to its start after 1s.** Reason: a throw from the patio is close to impossible, and a step must never get stuck.
- **"Drag" replaces "Pull" in the weed tips, and How to Play gains "Drag a weed until it pops out of the ground, then swipe it up."** Reason: both testers asked whether pulling meant holding or dragging, and the rule is a 60-unit drag in any direction.
- **Pulling shows its progress with a lean and a filling ring, for everyone.** Reason: the desktop tester's drag stopped short of 60 units and showed nothing.
- **The missed flick's swish turns grey and dashed, with a dust puff.** Reason: the joiner read the white swish as a throw's trail.
- **A light item held still and let go earns "Swipe it up to throw it. Water bare grass."** Reason: the joiner's watering hold landed on an item and got throwing advice that never said the press grabbed it.
- **New weeds pop up through a dirt puff, for everyone.** Reason: the desktop tester couldn't tell whether weeds came from next door, sprouted or spread.
- **Stripes get mow lines on cut patches, two shades that are both lighter and greener than unstriped grass, and a chalk tick each on the patio's edge that turns into a red cross when the stripe breaks.** Reason: the desktop tester read a dark stripe as dead grass, and the joiner's stripe broke with nothing showing it.
- **A new player's first broken stripe earns "Stripe broken. Clear it and mow again." from round 1.** Reason: repair is the owner's finale, and neither tester learned that a stripe can break and come back.
- **"Trust the sparkle, not the colour." is cut.** Reason: both testers found it cryptic, and it asks for no action.
- **The water tip names when to stop: "Hold still on brown grass until it sparkles."** Reason: the joiner drowned their first patch with a 3s hold.
- **Throw limits get a How to Play line and an exact tip: "Too soon. Wait half a second."** Reason: both testers found the limits only by failing, and "a moment" isn't a time. The hand needs 0.4s, and the arm keeps up about 0.8 throws a second.
- **How to Play gains a first line on what a press does, and a "More below" cue.** Reason: one press doing three jobs confused the joiner, and lines 10 and 11 sat below the fold at 390 by 664 with no hint.
- **The fetch tip names the item: "Biscuit has your gnome. Press it."** Reason: "Press it in his mouth" left the joiner unsure what "it" was, while the arrow sat on the weed Biscuit carried.
- **The seed clock tip says to drag it out: "Seed clock. Drag it out and throw it over."** Reason: a seed clock is rooted, and the desktop tester's swipes left it in the ground.
- **Round banners speak one sentence to screen readers.** Reason: the round 2 title and line ran together. The shed banner already hides its visible line, so M41 only confirms it in the accessibility tree; the tester read both versions from the page text.
- **Your own top-bar tag reads You for everyone, in every match.** Reason: the desktop tester saw it switch to their name in the rematch, and the lobby gate already says You.
- **A dev playtest clock pauses `?local` rooms and Practice.** Reason: both reports say their 10s to 25s loops made tips, moving targets and the finale unrepresentative. The next playtest pauses while it decides.
- **The playtest rule judges each move from round 2 on, and falls back to round 1 for a move the tester doesn't try later.** Reason: the desktop tester could mow and water but spent round 2 on weeds and gnomes, which the old rule counts as failing both.

Rejected, with reasons:

- **Longer or fewer tips in round 1's busy middle: rejected beyond the cut line and the yard's two.** Each tip already shows 3s to 6s. A person reads a line of under 10 words in about 2s, and the testers looked only every 10s to 25s. The next playtest measures this with the playtest clock.
- **Tidy reading "40 weeds" in every round: no change.** At most 40 weeds root in a lawn, and a thrown weed wilts 20s after its yank, so it never roots next door. Both testers' lawns went unweeded during their slow loops and reached the cap. The count is true.
- **A gentler lawn for beginners: rejected.** Rules stay equal for both lawns, and the learner bot beats polite Mr Pemberton in 100% of round 1s. If a tester using the playtest clock still loses round 1 to polite Mr Pemberton, the lead retunes polite Mr Pemberton.
- **Saying what patio junk costs: rejected.** The lobby card says junk costs points on your grass, and the shed tip says what to do. The critique ruled out "patio junk costs nothing" because it teaches skipping the funniest junk.
- **A wind tip in round 1: rejected.** Round 1's gusts need no action, and round 2's wind tip has been urgent since M40.
- **Round 3's lessons after a 2-0 match: rejected.** The owner's fact ends teaching with the match. How to Play's catching line covers it, and the heatwave banner shows everyone in round 3.
- **A pause for players in Practice: rejected.** Practice runs on the room's shared timeline like online play. The yard and the lobby's How to Play give a place to learn with no clock.
- **A new rule for which tip a fast flick that grabs nothing gets: rejected.** B3 stands, since a fast upward rub can be mowing. The testers' targets had moved during their loops, and the new swish shows the miss itself.
- **A cue for slow and sideways releases for everyone: rejected.** The item stays where you let go, which shows the failure, and a new player gets a tip. The joiner's returning-player flicks fit this.
- **Changing the queue because the seed clock tip was cut short: rejected.** An urgent tip sends the cut tip back to the front, as designed. The copy fix answers what the tester didn't learn.
- **"Swipe up toward the fence." and returning players' cues, which the testers couldn't check: no new milestone.** `cues.mjs` checked both by real input in M34. M47 reruns it with screenshots.

### Made While Building M41 to M43 (2026-10-14)

- **Round banners speak their title, then their whole line.** Round 2 reads "Round 2: Dandelions. 1 weed in 4 is a dandelion. Its seed clock bursts where it lands." M41's example sentence stopped after the first line's sentence. Reason: a screen reader should hear what the eye reads.
- **The fetch event names what Biscuit took, and the tip reads it.** Reason: the event is the tip's moment, so it carries the kind instead of a lookup that could miss.
- **"More below" sits on the top edge of whatever lies under the scroll area: the lobby card's pinned buttons, or the menu's footer.** It measures the list's last line against that edge on scroll, on resize and when an animation ends. Reason: the menu's pop-in scales the dialog, which no resize reports, and the cue must stay put while the list scrolls.
- **The cue waits for the list's last line, the keyboard line on desktop.** At 1280 by 800 every line fits in the lobby and the menu, so no cue shows there, and `lobby.mjs` checks it stays hidden. Reason: "the last line" is whatever the list ends with.
- **`phone.mjs` now expects You in your own top-bar slot.** Reason: every player's own tag reads You since M41.
- **`still` renames a put-down; it never stops a throw.** A release that would throw still throws. A put-down from a press held 0.4s or more that never moved 12 px says `still` instead of slow or off-angle. Reason: the rules stay identical, and only what a new player is told changes.
- **The pull ring takes the arm ring's place while you hold a rooted weed.** The arm ring comes back once the weed pops out. Reason: both rings sit in the same spot, and the arm meter means nothing until the weed can fly.
- **The ring fills marker yellow over a see-through ink track, 7 units wide.** Reason: the yellow must read on both bright and brown grass.
- **A pulled weed tilts toward your finger's side and slides up to 7 units toward it.** Reason: a tilt alone shows nothing for a pull straight up.
- **Yank and sprout events carry the weed's position, and the effects layer puffs there.** The missed flick's dust puff comes from the same layer. Reason: a weed sits up to 12 units off its patch's middle, and one layer owns every puff.
- **The dev cue list logs a pull when its ring first draws.** Reason: `cues.mjs` times the ring from the press, like every other cue.
- **The broken-stripe tip fires when a column loses its settled stripe but would still stripe on length alone.** A loss that long grass alone explains is a stripe growing back. Reason: it's the one rule that names "lost to something covering or marking it" without listing every cause.
- **Ticks draw after the patio props: white chalk with an ink edge.** The cross is red with a white edge. Reason: plain white needs an edge to read on the pale paving, and nothing may hide a tick.
- **The scene reads the settled stripes each frame for the ticks; crosses come from the session's live losses.** Reason: the ticks always show the lawn as it stands, catch-up included, while a cross, like the flicker, marks a moment you saw.
- **Both stripe shades are yellow-green washes, at 34% and 24%, with pale green lines.** Measured on the canvas at 375 by 667, 390 by 844 and 1280 by 800, against neighbours just as short: at health 3 the shades read L* 61 and 55 against 39, and at health 5 L* 66 to 69 and 60 to 64 against 54, each greener too. Reason: the darker shade read as dead grass to the desktop tester.
- **A cut patch shows three pale mow lines unless it stripes; a striped patch shows its stripe lines instead.** Reason: both sets of lines on one patch read as noise.
- **The stripe rule needs 3 bad patches to break a stripe, so the unit tests start from a column with the 2 long patches it allows.** Reason: recorded so a builder writing a stripe test doesn't expect one weed to break a clean column.
- **Noticed while building:** `pests.mjs` at 1280 by 800 again read a real 1,250 px/s mouse flick as a slow put-down, the first-press frame gap recorded in Made While Building M30 to M33. Reason: recorded; it passed on its rerun.

### Made While Building M44 (2026-10-14)

- **The yard lawn also takes no damage from what lies on it.** Reason: a gnome left 10 minutes on step 1 browned its patch to mud, and the yard's lawn should stay as you found it.
- **The yard's lawn uses the lobby lawn's seed.** Reason: opening the yard swaps the lawn under the card for one that looks the same.
- **Step 1's gnome stands at lawn (290, 340), in column 5 of row 8; step 2's weed roots on column 8 of the back row; step 3 grows the clear column nearest the middle, in the order 6, 5, 7, 4 and so on.** With no clear column it takes the middle one and clears its marks. Reason: the gnome sits where a thumb rests, the weed sits away from the gnome's column, and clips and landings from steps 1 and 2 mark columns near the middle.
- **A step's object put back by the 1s rule keeps its state, so a pulled weed comes back pulled.** Reason: the step continues at "Now swipe it up hard at the fence." instead of making you pull it again.
- **A failed try is a put-down you meant (not a cancelled press), a blocked throw, a weed left rooted, a missed flick, or a throw of the step's object that comes down on your own lawn (short, clipped or wide).** In step 3 it's a mowing press that ends without the stripe, or a missed flick, so mowing presses now raise a `mowEnd` event. Reason: these are the mistakes the step's move answers, each counted once.
- **Crossing events carry the item's id.** Reason: the yard must know that its own object went over, not just that something did.
- **The yard runs on real time from `performance.now()`, not the shared clock.** Its garden events still log on the shared clock. Reason: the yard has no match timeline, and the ghost finger already plays on real time.
- **The yard shows only failure tips from the tip triggers, each for 3s every time, and logs its lines as `note` events of kind `yard`.** Reason: a new player's staged tips belong to the match, and scripts that count match tips must not count yard lines.
- **The ghost finger's pull drags the weed 26 units sideways and 56 units down, then swipes up; its rub runs from row 1 to row 14 and back.** A pulled weed's replay shows the throw instead. Under Reduced Motion the pull shows the throw's arrow up to the fence, and the rub a two-headed arrow along the column. Reason: each shows the step's whole move in its 2.4s, and a still arrow can only show its direction.
- **A press acts only on the garden it began on.** Reason: a press held while the yard closes for a round must do nothing in round 1, and the same rule stops a press carrying over between rounds.
- **In M44 the yard closes 2s after "That's a stripe. Yard done." and the lobby card comes back.** Focus on Ready, the yard bar and panel, and Try the Yard come in M45. Reason: M44 opens the yard only by the dev hook.
- **Mr Pemberton's muted session never opens a yard, and the yard closes whenever the page leaves a seated lobby.** Reason: the yard belongs to the person's page, and a Room Full or a lost seat must not leave it open.
- **`yard.mjs` throws the weed too softly at 2.72 times its release depth in px/s.** From depth `d`, a straight throw lands short below `2.5 d` and crosses from `2.94 d`, so 2.72 sits mid-way through the clip window. The release depth is 92 units nearer the fence than the root, where the 100-unit hold clamp stops it after a sideways pull. Reason: the clip must come from real input, not a dev throw.

### Made While Building M45 (2026-10-14)

- **Until the yard is finished or skipped, Try the Yard is the yellow main button and Ready a plain dashed one beside it; afterwards they swap looks and keep their places.** Reason: two yellow buttons leave no main one, and buttons that move under a thumb get pressed by mistake.
- **Try the Yard shows on a new player's card even while they wait alone.** Reason: waiting for a friend is the best time to learn, and the yard needs no neighbour.
- **Every online lobby card's status line now reads "neighbour_name is ready." while your friend is Ready and you aren't.** Before, only How to Play showed it. Reason: the yard line hands over to that line once the friend presses Ready, so the card must be able to show it.
- **The yard sends `step + 1` in `sync` while it's open, 3 during "That's a stripe. Yard done.", even after you press Ready.** The friend's room hides it once you're Ready. Reason: the sender shouldn't guess what the friend's screen shows, and one rule on the receiving side covers Ready and Rematch.
- **The friend's line rides only the 2s `sync`, with no extra send on a step change.** Measured: 0.86s to 1.95s in `?local` and 2.03s over real Pusher. Reason: it stays inside the 2.5s and 3s targets without new events. M47 replaced this with a send on each step change (see Made While Building M47).
- **The friend hears each new yard step once, through the room's live region.** Reason: `DESIGN.md` says their screen reader hears each step change, and the live region already speaks "neighbour_name is ready.".
- **The yard's How to Play hides the bar, the panel and the tip line, and keeps the status line on its card.** Reason: it swaps the view as the lobby's does, and a tip line over the card's heading would cover it.
- **Toasts or tips moved to the patio strip, and Reconnecting…, sit on the panel's top edge while the yard is open.** Reason: the panel covers the patio strip, and a patio tip only shows when its object sits at the front of the lawn, far from the back row the line covers.
- **The yard stays open through Reconnecting… and closes on Can't Connect, Room Full, another tab, a match start or Leave.** It closes inside the room update that leaves the seated lobby, and when the session closes. Reason: a short drop shouldn't throw away a step, and the yard needs no network.
- **A yard closed by the countdown or a lost lobby counts as neither finished nor skipped.** Try the Yard stays the main button and Ready doesn't pulse. Reason: you didn't choose to stop, so the card still offers the yard first.
- **The tips a finished step replaces stay replaced for every match this page teaches, until a reload.** Reason: a walkover leaves you new for another first match, and you still know the move.
- **In Practice, Start pulses only for a new player once the yard is finished or skipped and the card has shown 6s.** A returning player's Start still never pulses. Reason: Mr Pemberton is always ready, so the pulse only says "you're done learning".
- **The yard panel's status line in Practice reads "Mr Pemberton is ready.", or "Mr Pemberton is on his way to the fence." before he arrives.** Reason: it's the same line the Practice How to Play card keeps.
- **Cards take a `focus` selector for what to focus when they open.** Reason: React's Strict Mode runs a newly mounted card's effects twice, after its parent's, so a parent's focus call loses to the card's heading in dev builds.
- **The yard panel starts 32 units below the patio's top edge, so step 3's stripe gets its chalk tick in view.** Its status line cuts names to 10 characters, as the top bar does. Reason: the tick is how a match counts stripes, and at 375 by 548 the shorter panel still fits one line and Ready.
- **The yard bar's buttons use 8 px padding and 16 px text below 640 px.** Reason: How to Play, the title and Skip must fit the 351 px design width at 375 by 548.
- **`yard.mjs` runs the second visit after Skip on the same page and then the match.** Reason: one run covers "starts again from step 1", finishing all 3 steps and the round 1 tips the yard replaced.

### Made While Building M46 (2026-10-14)

- **The pause lives in the shared clock: game time stands still, then runs on behind the shared clock by the paused span.** Reason: every timeline reads that clock (the rounds, both lawns, Mr Pemberton, the countdown, the reveal and the room's own waits), so one change stops them all together, and shifting the clock is the same as shifting the room's timeline.
- **Pongs carry the shared clock as it really runs.** Reason: a guest's offset must not take in the host's pauses, or a guest that pauses too would count the span twice.
- **A pause or resume starts 150 ms after the call, and the earliest one asked for wins.** Reason: every tab hears of it before it begins, so both stop at the same garden tick, and two tabs pressing at once still agree.
- **A page that loads after a pause asks the dev channel for the room's pauses and copies them.** Reason: a reloaded tab would otherwise run ahead of its neighbour by every paused span.
- **While paused, presses reach no garden, a press in progress is cut off as a phone would cut it, and Shake Fist rests.** Reason: "presses during a pause do nothing", and an item left in a hand through the pause would still be held after it. The garden takes the put-down on its first tick after the pause, at the paused moment's garden time.
- **While paused, the autopilot, the sound loops and the replay's capture stop, and the tip queue's time stands still.** Toasts, the ghost finger and Brenda's bob keep real time. Reason: those last three show nothing that scores or counts, and they end on their own.
- **Incoming throws still land in a paused garden and fly once it runs.** Reason: a throw already in the outbox when the pause began must not be lost.
- **The top bar's clock reads "Paused" through play, countdowns and reveals.** Reason: it's the one place every phase shows the time.
- **`__game.pause()` returns the shared time the pause begins, or null where pauses don't work.** Reason: scripts need to know a real Pusher room ignored it.
- **The dev panel gains Pause or Resume.** Reason: a human playtest lead can stop the game without the console.
- **`pause.mjs` checks the round's end by real time, not by a jump.** Reason: "the round ends 60s later" is what a tester waiting on the clock sees.
- **The session's pause methods stay in production builds, but refuse there, since `pausable` compiles to false.** `__game.pause()` and `resume()` exist only in the dev-only scripting module. Reason: class methods can't be dropped from the bundle, and nothing in a production build can call them to any effect.

### Made While Building M47 (2026-10-14)

- **A yard step change now sends the lobby `sync` at once, replacing M45's "no extra send".** Measured with the change in `?local`: A read B's step 1 line 105 ms to 156 ms after B pressed Try the Yard at 375 by 667, 390 by 844 and 1280 by 800, against 651 ms to 1,950 ms before. Reason: the 1280 by 800 line took 1.89s to 1.95s against the 2.5s target, so a slow machine could fail it, and the send costs at most 4 client events a visit.
- **On the yard's lawn, the patio strip above the panel shows bare slabs and the stripe ticks only.** The tap's post and handle, the compost bin's label, the shed's edge and Biscuit's Zs no longer poke into it. Reason: the strip exists for the ticks, and the props' tops there looked cluttered.
- **`cues.mjs` checks a downward release beside the sideways one, and expects the tip only after the sideways one.** Each failure tip shows once a round, so a second "Swipe up toward the fence." can't come in the same round. Reason: M47 asks that both releases leave the item where it was let go; the tip's trigger is the same `angle` reason, which `tipTriggers.test.ts` covers.
- **E2e scripts run one at a time, as Made While Building M30 to M33 says.** This pass first ran two scripts at once to save time. `chores`, `bag` and `yard` then failed at 1280 by 800 and `reveal` on a reload, each on timing. Run alone, `bag`, `yard` and `reveal` passed unchanged. Reason: two busy browsers stall each other's frames, and a mouse driven from outside the page then lands its moves late.
- **`chores.mjs` holds its pour for 2.9s, not 3.2s.** The pour starts 150 ms into the press and drowns the patch at 2.3s, so the old hold ran 767 ms past the drown, 33 ms short of a second health step. One late mouse-up failed the "1 health back" check. The pour now runs about 450 ms past the drown, with 330 ms to spare either way. It also prints the pour's event times when they're off. Reason: the check is about drowning, not about a 33 ms margin.
- **`pests.mjs` taps the patio and waits 10 frames before its first mouse flick, as `cues.mjs` does.** Its desktop weed throw read as a slow put-down 3 times in this session, the first-press frame gap recorded since M30 to M33. Reason: the first press unlocks sound and can stall the page's frames. A player's first press is Ready or Start, so no round meets it.
- **`cues.mjs` keeps 140 units clear round the aimed miss's press point too, not only round the gnome.** A snail crawling within reach of the press point got grabbed and thrown instead of the miss at 390 by 844. Reason: a fast flick grabs the nearest light thing within 44 px, which is the game's rule.
- **`pause.mjs` waits 3 frames after the pause begins before its first sample.** At 1280 by 800 the countdown's digit read 3 while its phase read 1,980 ms left, then 2. Reason: the digit follows the phase on the next frame, so the first sample raced it.
- **`phone.mjs` names the tip it finds off the fence line.** At 375 by 548 it once found a tip in the patio strip 600 ms into play. It passed on rerun, and 8 further runs of the same moment all showed the start tip on the fence. Reason: the next failure says which tip moved.
- **Left as flaky, passing on rerun:** `reveal.mjs` at 375 by 667 saw a guest reloaded mid-reveal enter the ending step 234 ms after the host, as recorded in M40. `yard.mjs` at 1280 by 800 once had its soft weed throw at 1,434 px/s cross instead of clip; the rerun clipped at 1,418 px/s. Both failures came while two scripts ran at once. Reason: recorded so a later failure starts from evidence.
- **Two `?local` tabs opened without `?name` can still share a funny name: not fixed.** With 10 names, any rule picks the same one for 1 pair in 10. Reason: dev only, scripts pass `?name`, and a real lobby marks your own gate You.
- **Toasts, the ghost finger and Brenda's bob still run on real time during a playtest pause: kept, as M46 decided.** Reason: they show nothing that scores or counts, and each ends on its own.

### Made While Fixing the Onboarding Audit (2026-10-14)

- **Catch-up passes every moment-ending event on to the tip queue, out of sight, and still raises no tip.** That covers Biscuit, landings and catches, the pour and the tap, gusts, set-downs and throws. Reason: a hidden tab replayed Biscuit's dig unseen. His waiting tip then showed about a hole already dug, and pushed out the flood tip.
- **The audit's simpler fix, dropping every waiting tip with a moment after any catch-up, is rejected.** Reason: after a 1s hide Biscuit can still be circling, and his tip should still show.
- **A tip with a moment also counts as seen if it showed for that whole moment.** Reason: Biscuit's bark cut in on the wind tip as its 2s warning ended. The wind tip then came back at the next gust with a different line.
- **A moment that ends during catch-up, or one a tip missed the start of, marks nothing seen.** Reason: you didn't watch it, or saw only its end. The 3s rule still covers both.
- **Each tip's end in the dev log says whether it counts as seen, and `firstmatch.mjs` checks repeats by tip, not by line.** Reason: the wind tip came back with a different line each time, which a check by line can't catch.
- **A failure tip raised after a hide still waits behind older staged tips, and can leave after 2s.** In the audit's case, the flood tip now loses to a watering tip waiting since before the hide. Reason: tips line up in the order they happened. The tap floods again 8s later, so the lesson comes back.
- **The tips script's `stream` check accepts a patio tip whose object the game's rule puts behind the tip line.** The dev `tipNow()` reports that rule's spot as `ruleSpot`. Reason: it keeps the random seed's coverage. Seed 12 roots its first weed in the front row and now passes at 375 by 667 and 1280 by 800.
- **The reveal script times each step as a span, from the frame before it to the frame that showed it.** Reason: its own screenshots held a page's frame, which read as drift: 383 ms in the audit, and 1,018 ms in this pass at 390 by 844 and 375 by 667. Clock drift past 100 ms still fails wherever no frame was held. The screenshots of every step stay.
- **`biscuit.mjs` taps the patio and waits 10 frames before its first real press, as `pests.mjs` does.** At 1280 by 800 its gnome press landed in a 1,003 ms frame the sound unlock held, so Biscuit barked 516 ms after the put-down instead of 1,500 ms. It failed twice in a row, then passed at all three sizes with the tap. Reason: the stall is the first press's, and a player's first press is Ready.
- **`cues.mjs` swipes the popped weed over the fence after its pull ring check, then waits 0.5s.** It used to let go of the weed still, a slow or still put-down whose failure tip took the round's one showing. The later slow put-down check then failed 3 of 7 runs. Reason: that release was never the step's point, and the wait lets the hand recover for "Too soon".
- **`cues.mjs` clears snails before each mistake, through a new dev `act.clearSnails()`.** Twice in 3 runs the "Missed" step found no bare spot, once the round's snails had piled up. Reason: no cue in the script needs a snail, and a crawling one near a press gets grabbed.
- **`cues.mjs` says what a pour did when its patch never drowns.** It failed once in about 15 runs: the press poured and sparkled 3 patches, but never drowned the one set to full. Reason: the cause wasn't found, so the next failure prints the patch's health and the pour's events.
- **Left as flaky, passing on rerun:** `wind.mjs` at 1280 by 800 once found no round 2 gust after its jump, then passed twice. Reason: the gust and its timing are garden logic this pass didn't touch, so it's recorded for the next failure.
- **The beginner playtest after M47 is not run in this pass.** Reason: the design needs cold testers who haven't seen the game or these documents. This pass's agent read them all and can't start a fresh one. The lead runs it next, as the design describes.

## 12. Owner Follow-Ups

Things that need a real phone or a human, recorded so nothing waits on them:

- Throw feel on a laptop trackpad: confirm the back-row throw (about 1,500 px/s) is reachable. If not, lower the back-row requirement for everyone.
- Mower shake and scalp speeds with a natural rub on a 375 by 548 phone.
- Pusher presence on a locked iPhone: how long until the member list drops it.
- Colours on real phone screens in sunlight.
- Performance on a real mid-range Android and an iPhone: open a room with `?debug` and check the overlay's frame line reads p95 under 16.7 ms during a busy round 3. The replay copies each frame into a 192 by 220 canvas, which some phones may keep in memory instead of on the GPU.
- `bun run dev:https` on a phone: accept the certificate warning once, then check Share Link and the wake lock.
- Stripes with real people: since M37, bots that mow in the last seconds hold a median 3 striped columns at 0:00 (see Made While Building M37). Check whether players mow after the finale's last landings and whether 2.5 points a column feels worth it.
- A real friend's first match by link: watch whether they read What Brenda Counts before pressing Ready, and whether the tips under the fence get read mid-swipe.
- A real friend in the yard: whether they open Try the Yard, how long the 3 steps take, and whether the friend waiting at the gate minds.
- Failure and stripe cues on a real phone: check that "Too soon", the missed flick's swish and the blocked-stripe flash read at a glance mid-swipe, and that the `stripe` chime is easy to tell from the sparkle's `ding`.
- Balance with real people: M27 tuned against scripted bots. Play a few matches with friends and check the heatwave (2.5 times drying) feels hot rather than hopeless, and the 12-gnome crate still feels like a flood.

## 13. Code Map

Builders keep this section current. List each file once, with one line on what it owns.

**Routes and server**

- `src/app/layout.tsx`: root layout, fonts, metadata and the viewport export (pinch zoom allowed; the canvas blocks it).
- `src/app/page.tsx`: the home page shell around `HomeClient`.
- `src/app/globals.css`: Tailwind entry plus the Ready pulse.
- `src/app/r/[code]/page.tsx`: room page; lowercases codes with capitals, shows the bad-link screen, renders `RoomClient`.
- `src/app/practice/page.tsx`: Practice Alone, rendering `PracticeClient`.
- `src/app/api/pusher/auth/route.ts`: signs presence joins through `src/server/pusherAuth.ts`, and refuses a body that isn't a form with 400.
- `src/app/icon.svg`: the tab icon.
- `src/server/pusherAuth.ts`: the Pusher signer; checks the channel and player id, and the name with `src/net/names.ts`.

**Game logic (`src/game`, pure, no DOM)**

- `tuning.ts`: every gameplay number, including the patio spots for the tap, can, mower, bin, trampoline and shed door, and the yard's (its objects' spots, the 1s return, the 3s failure tip, the 2s done line, 2 failed tries before the finger replays).
- `types.ts`: item kinds and wire codes, mess codes (the drag's `flat` too), item states (`sunk` heavy junk), items with their litter look and bounce flag, flights (the soft `settle` outcome), crossings with their flags, clip records, landings, garden events (put-downs with their reason, `still` too, blocked throws with where the item dropped, rooted weeds, missed flicks, blocked stripes, yanks and sprouts with the weed's position, fetches with what Biscuit took, crossings with the item's id, the end of each mowing press, and the yard putting an object back).
- `grid.ts`: the patch arrays, the round's `LawnClock`, seeded dry and grow timers (`runTimers`), patch lookup, crush, mess marks, dirty rows and the stripe rule (`stripeMask`).
- `items.ts`: drawn radius and lift per item kind, for hit tests and drawing.
- `flight.ts`: throw distance, arcs, short, clip, wide and cross outcomes (an along gust bends the path; the back wall stops bounces), trampoline bounces, crossing records with flags, mirrored arrival flights.
- `press.ts`: the release rule with its put-down reasons (slow, off-angle, still, cancelled) from the press's facts (`PressFacts`: cancelled, held time, furthest move), `towardFence`, and `JobPicker`, which turns a press on grass into watering, mowing or a fast-press snap.
- `seed.ts`: round seeds, gnome spots, patch jitter, each patch's dry and grow stagger, the weed and snail schedules with their spots, Biscuit's wake time, dig times and dig spots, the shed's time and the crate's spots.
- `match.ts`: match timings (`?fast` too), `matchPhaseAt`, stretches, dev jumps.
- `garden.ts`: `Garden`, the fixed-tick simulation of one lawn: lawn timers, scheduled weeds (dandelions too) and snails, hand, yank, clamp, the arm and hand rules on throws, wind on throws and on light things, catching, flights, teeter, falls, slides, landings, arrivals with the entry fast-forward and their flags, rest damage, wilting, shells, seed clocks bursting and seeds rooting or blowing over the fence, the 160-item cap, the can and tap, the mower, the grass bag with the compost hold, heaps and their smothering, Biscuit, the finale (the shed, crate gnomes, heavy junk gripped, dragged, lifted, thrown and sunk, bin litter, mower runs, trampoline bounces, the thrown mower ending mowing), blame counts, stripes by Brenda's covering rule (`stripes`, and `settledStripes` for the cues, which ignores held and carried items) with `stripeBlockers` and `stuckByColumn` (per column, the patches one mowing pass can't clear, for the bots), the blocked-stripe event when a mowing press ends, fast flicks on grass (`snap`, which grabs or reports a miss with what was near), put-down reasons, weeds left rooted, a rooted weed's pull (`pullProgress`, from where your finger is now), a press on the drawn bag never poking the mower, `openShed`, which the dev panel can also call early, and the lobby's yard lawn (`yard`: no gnomes, schedules, drying, growth, weed spread, wilting, lying damage or end) with `putBack` for its step objects.
- `cheats.ts`: dev and test cheats as plain functions on a garden: `setPatch`, `dryAll`, `digSoon`, `gustSoon` and `quietDog`. Only `devApi.ts` and tests import it, so production builds never contain it.
- `weeds.ts`: rooting, seeded sprout and spread spots, the drain and spread timers, dandelions turning into seed clocks, which weeds are dandelions, and where a burst clock's seeds land.
- `snails.ts`: new snails, snails out of shells, and the crawl that slimes and eats.
- `water.ts`: the can, the tap, the pour, sparkle, drowning and the tap's flood.
- `mow.ts`: the mower and grass bag: cuts on entry along its path (to short in one pass), the cooldown, the scalp, heap patches cleared at 6 cuts each, the 80-cut tip event, the full bag.
- `score.ts`: Brenda's scoring of a lawn (Green, Stripes, Tidy, Junk with `JUNK_POINTS`, half-up rounding), the round winner with the health tie-break, match results, the blame pick and its wording, and Brenda's findings and lines.
- `reveal.ts`: the reveal's timeline on the shared clock (Time's up, both peels, the count-up, the rosette, the ending), scaled for `?fast`, and when the tally may show a round.
- `tips.ts`: a new player's tip and toast copy from `DESIGN.md`'s Onboarding section (the put-down, still, rooted, missed-flick and blocked-stripe failure tips too, and the broken-stripe tip), the fetch tip naming what Biscuit carries (`fetchTip`, `FETCH_TIPS`), the three wind lines, the shed banner's line and spoken sentence, which tips are urgent, failure or once-a-round tips (the coach tip), the round each tip starts in, the round 2 and 3 banners, and every line for the width check, the coach lines included.
- `tipQueue.ts`: `TipQueue`, a new player's tip queue on an injected clock (3s to 6s, the 0.4s gap, urgent tips cutting in, moments, the 10s and 2s waits, seen after 3s or once a moment it showed from the start of ends on show, but not out of sight; seen once a match, or once a round for failure and `eachRound` tips), tip spots and targets, and the catch-up rules (`liveStep`, `freshRound`). `learn` marks a staged tip seen for this match without showing it, for the tips a finished yard step already taught.
- `counts.ts`: what Brenda counted on a lawn (`countLawn`, with heavy junk from next door apart), the counts' wire form for the verdict, the reveal's count words per score line (`countParts`) and the coach tip's pick and lines (`coachLine`, `COACH_LINES`).
- `stripeWatch.ts`: `StripeWatch`, which follows one page's settled stripes step by step for the stripe cues, reporting only changes in live play and starting fresh on a new garden.
- `tipTriggers.ts`: `TipTriggers`, which turns one round garden's live events and frames into tips with their targets and moments, while `ends` passes catch-up's moment ends on, out of sight, raising nothing: the staged table by round, the coach tip first in the round 2 and 3 countdowns, the failure tips (each put-down by its reason, a cancelled press earning none; rooted weeds; missed flicks by whether something was near; blocked stripes), the first stripe by the settled mask, the first stripe broken by something on it or a mark (not one that grew back, `grewBack`), the watering tip from 25s in, the stripes tip, and round 1's shed banner with the shed tip 3s after it; plus `driestPatch`, `gnomesLeft` and `nearestGnome`.
- `arm.ts`: the arm meter (fill per throw, drain, the 1.5s lock) and the 0.4s hand.
- `bag.ts`: where the bag sits, the compost overlap, and the 4 patches a landing bag bursts over.
- `report.ts`: `lying`, Brenda's rule for what covers a patch, `lawnReport`, a garden's lawn as its neighbour sees it (patch bytes with top states, counts, markers, landings, your own faults and chores: bag, can, tap and arm), `finalReport`, its true lawn at 0:00 for Brenda (with blame, the exact health sum and every item, heavy junk from next door flagged), and the stripe rule for a reported lawn.
- `biscuit.ts`: Biscuit's state machine: asleep until 2:20 left, digs that always win, the circle and the tap that sits him, the hole, eyeing and barking at an item, the fetch, the trot to the back row with trampling, the cooldown and take-backs.
- `wind.ts`: the round's 6 gusts in the host's frame, the guest's reversal, the wind a garden feels, and its effect on throws and light things.
- `heavy.ts`: heavy junk footprints, `HeavyGrip` (drag, lift and the slow set-down in screen pixels), a thrown mower's crooked run, a landing bin's litter spill, and the roll-in speed.
- `profiles.ts`: how bots play: Mr Pemberton's polite, normal and petty moods and the learner, regular and expert players, with every number from PLAN.md 2.9, including whether throw-backs come before chores (`spiteFirst`, his alone) and each finale plan (`FinalePlan`: gnomes, junk, when the mower goes over, mowing after the gnomes, and the closing stretch). The expert plays the closer's finale.
- `brain.ts`: `Brain`, one virtual hand driving any garden through real commands with hand times, in the order of PLAN.md 2.9 (lawn first, throw-backs with the time left; Mr Pemberton's throw-backs first): weeds (dropped while a tired arm rests), snails, aimed or profile-speed throws (his fumbles light only), watering by a drying debt that keeps credit, the tap, mowing, the compost, Biscuit taps, catches, heavy junk thrown first with a fresh arm from just deep enough, and crate gnomes, theirs too once due; a closing plan's last stretch, which mows the unstriped column one pass would stripe (`closingColumn`) back to back before any throw and empties a bag those cuts would overfill; a kept mower thrown in the last seconds; it counts its time shares.
- `worst.ts`: `WorstWindow`, the 3s window of health your lawn lost to events (not drying), its cause and the replay's caption.
- `headless.ts`: `simulateRound` and `simulateMatch`, two bot gardens on one seed joined by an in-process fence through the real wire codec, judged like the host would, with both finals.
- `yard.ts`: `YardSteps`, the lobby yard's 3 steps on a yard garden (a gnome in row 8, a weed rooted on the back row, a clear column grown shaggy by `clearColumn`), each finished on its crossing or its stripe, failed tries in a row, objects resting on the patio or by a hedge put back after 1s, and the step lines (`YARD_LINES`). `YARD_TIPS` names the round 1 tip each finished step replaces (step 2 the weed tip, step 3 the mow tip).
- `rebuild.ts`: `rebuildGarden`, the reload rebuild: an idle run to the copy's time, then the copy's patches, weeds, items, heavy junk, patio, own faults and chores. The host also rebuilds a guest whose final never came this way.

**Network (`src/net`)**

- `types.ts`: the `Transport` interface, member events, faults.
- `listeners.ts`: a tiny typed listener set.
- `ids.ts`: random ids and the player id rule.
- `roomCode.ts`: the code alphabet, validation, generation, channel names, and reading the code box (pasted links too).
- `names.ts`: the name rule shared by the name box and the auth route, graphemes, and `shortName`, which cuts a name to 10 characters as shown.
- `identity.ts`: your player id and name in `localStorage`, the finished-match fact (`greener-finished`) and whether you count as new, funny default names, and the name typed in this tab (`sessionStorage`) for dev `?local` rooms.
- `devNet.ts`: dev query flags (`local`, `skew`, `pid`, `seed`, `fast`, `debug`, `calm`, `cvd`, `bot`, `name`, `first`, faults).
- `localTransport.ts`: the dev BroadcastChannel transport with fake presence (30s expiry for a silent member, refreshed when it comes back online), the 10 per second cap and faults; per-tab local ids.
- `memoryTransport.ts`: `createMemoryPair`, two in-page transports with Pusher-like presence, for Practice and tests.
- `yardRun.ts`: `YardRun`, one visit to the yard on its own clock: the yard garden and its steps, the line on show (each failure tip every time for 3s, then the step's line), the ghost finger as each step starts and after 2 failed tries in a row, and when "That's a stripe. Yard done." has had its 2s. `learned` lists the round 1 tips its finished steps taught.
- `pemberton.ts`: `BotNeighbour`, Mr Pemberton: a muted guest session with the brain at its hands, his moods by round, Ready and Rematch at once, and his reactions (bubbles and the fist).
- `pusherTransport.ts`: the pusher-js presence transport, with `roomStatus`: connected only once the channel subscribes, and reconnecting through every gap after the first join.
- `protocol.ts`: message types and validators, `fist` included, the optional `first` flag and `yard` step (1 to 3) in `sync`, and the counts (`ct`) in `result`.
- `throwCodec.ts`: crossings and clip records to and from the wire with their flags (heavy, bounced, going back, litter look), and throw ids.
- `lawnCodec.ts`: the binary lawn pack in base64, and the base64 helpers.
- `finalCodec.ts`: the binary final pack in base64 (bit 7 of a marker flags heavy junk from next door), and reading a pack's round.
- `judge.ts`: `judgeRound`, the host's verdict from both finals with what Brenda counted on each lawn (the guest's possibly rebuilt by the host, carried as `guestFinal` so the guest draws it), `result` messages to and from verdicts, the round and match lines, and the match end's summary line.
- `neighbour.ts`: `NeighbourView`, what you see of next door: their last lawn report, puffs (`vanish` for a yard throw going over), clips teetering on the fence, head pops, laughs, speech bubbles and fists, and whether next door is Mr Pemberton.
- `envelope.ts`: bundles, session ids, `decodeBundle`, `StaleFilter` (`each` filters a bundle message by message against the room as the earlier ones left it).
- `limiter.ts`: 9 sends in any second.
- `outbox.ts`: the coalescing outbox with keep-newest kinds (the newest goes last), the 6s throw window, 3.5 KB splits and the peak bundles in any second.
- `clockSync.ts`: ping samples and the shared clock, with the dev playtest pause: game time (`now`) stands still from one shared moment to another and then runs behind the shared clock (`shared`, which pongs carry) by every paused span; the earliest pause or resume asked for wins, and a late page copies the room's pauses (`pauseState`, `copyPause`).
- `room.ts`: the pure room reducer: admission, seats, host, hello and sync, Ready (held until the guest's clock syncs, cleared by a hello), match start, the Web Lock states, finals (the guest's repeats, the host's 6s wait, which an Away guest still listed also gets, at once for a Gone guest, and a missing guest final rebuilt by the session), verdicts applied once, the tally (healed from either seat's `sync`), the match's last round, the match end (`over`, also reported in `sync`), Rematch (Ready and Rematch count the same), Back to Lobby, a neighbour storming off, presence (silence while hearing, Away, Gone, walkover, no contest, a walkover's loser keeping their seat while the result shows), a reloaded host taking the match back, the copy of your lawn for a rebuild, mending lost verdicts (a guest's `wait` makes a returning host build its missed final; a reloaded host's `need` gets the guest's verdicts back), Room Full straight from a member list with 2 others, a hello on any return to connected, the running match sent again to a guest still in the lobby or at an earlier match's end, and `hostSide`, the side you played even after your neighbour's seat is gone; the neighbour's First Match flag from their lobby `sync`, and `decidedMatchEnd`, which says when the finished-match fact saves. The neighbour's yard step from their lobby `sync` (`peer.yard`), announced on each change while they aren't Ready, `peerYard` (0 once they're Ready), `yardLine` for "neighbour_name is trying the yard (2 of 3).", and the yard step this page sends (`RoomEnv.yardStep`), with the `yard` UI input sending a lobby `sync` at once when that step changes.
- `session.ts`: `RoomSession`, the per-code singleton wiring the lock, transport, clock, outbox, filter, reducer and round gardens (host or guest frame for the wind), plus the `hud` store with its tip and toast line and Hide Tips, and `hold()`, which leaves the room once no screen shows the session. Options mute a session (Mr Pemberton's) or make it Practice; a `companion` runs after it each frame, an `autopilot` brain can play its garden, it sends and shows fists, and `theirClips` tells Mr Pemberton about your clips. It sends throws, clip records and the 1s lawn report (throws vanish at an Away or Gone neighbour), feeds the `NeighbourView`, ticks the last 10s, sends each round's final once play ends (from the 1s timer too), keeps the neighbour's last lawn per round for the copies in its `sync`, rebuilds a guest's final from it when the guest's own never came (`peerFinalBuilt` in the log), keeps the neighbour's copies of your lawn per round, builds a returning host's final for a round it missed (`finalBuilt` in the log), filters each bundle message by message, tells the room what it hears and whether the page shows, rebuilds a round's garden from the neighbour's copy when it joins mid-round, and plays and logs every sound (the sound map and its loops, the countdown, the last 10s, the match end's sting) once audio is unlocked, with Shake Fist's 3s rest in the `hud` store. It logs each catch-up of 1s or more and each rebuild with their cost, and caches `phase()` per clock reading. With no frame for 1s (a hidden tab), its timer runs the frame's step, so the garden catches up and the lawn still goes out. It saves the finished-match fact at a decided match end, reads `newPlayerNow()` live for each `sync`, and reads `firstMatch` once per match for teaching. A new player's tips: one `TipTriggers` per round garden fed only live steps (no hidden step, no jump over 500 ms, no rebuild), the countdown tips only from a round's first live frame in its countdown or first 2s, the queue's time held still while Reconnecting shows or the page is hidden, each tip's spot fixed when it shows, Show Tips and Hide Tips, `shownTip` for the arrow, the ghost finger's two plays (`ghost`, `stopGhost()`), the shed banner in the `hud` store, and the line cleared at 0:00. The coach tip for rounds 2 and 3 comes from the last verdict (`coachTip`). Every page but Mr Pemberton's follows its settled stripes (`StripeWatch`): in live play a gained stripe plays the `stripe` chime, and `onStripes` tells the scene of each gain and loss. The lobby's yard (`openYard`, `closeYard`, `hud.yard`): a `YardRun` on real time whose events play their sounds and cues and never reach the outbox, the replay or the room, a throw over the fence vanishing as a peek-strip puff, its line in the tip line through `shownTip`, its ghost finger, and `inputGarden()`, which gives presses the yard's garden while it's open; `yardHelp()` for How to Play over it, `hud.yardDone` once you finish or skip it, the step it sends in `sync` (a change goes out at once, `followYardStep`), and `yardLearned`, the tips finished steps taught, marked seen in each new match. Any room change that leaves the seated lobby closes it at once, inside `dispatch`, and so does `close()`. The dev playtest clock (`pauseAt`, `resumeAt`, `paused`, `pausable` in `?local` rooms and Practice only): while paused, presses reach no garden, the autopilot and sound loops stop, Shake Fist rests and the tip queue's time stands still.

**Scenes (`src/scenes`)**

- `layout.ts`: design bands (and where the yard's panel starts), lawn and design coordinates, the touch edge guard, and the band the replay records.
- `sampler.ts`: `ReleaseSampler`, peak swipe speed in the last 100 ms, and path speed for the mower.
- `input.ts`: `PressController`, one-finger presses to garden commands: Biscuit while he circles, the tap, the grass bag, grabs and throws (the item in Biscuit's mouth too, with how long the press held and how far it moved for the release rule), heavy junk (drag, lift, set down), the mower poke, and grass jobs (pour, mow, and a fast flick sent as a `snap` command); a press acts only on the garden it began on; `PressView` tells the scene where the can is. A playtest pause (`halted`) cuts off a press in progress, as a phone cutting it off would.
- `art.ts`: stamp keys and rects, the shaken fist, sketch art for items (gnome, weed, dandelion, seed clock, seed, shell, bag, mower), snails, Biscuit (standing both ways and asleep), patches (health ramp, blades, cracks, every mess mark, holes, short mow lines on a cut patch, stripes in two shades both lighter and greener than unstriped grass, the grey wash), the neighbour's head, fence, hedges, the patio's slabs (`paintPatioPaving`, which the yard's patio strip reuses) and its props with Biscuit's bed, can, mower, backdrop (with hedge clumps and the big shed in a wide screen's spare width) and captions; Mr Pemberton's bald head with its moustache.
- `junkArt.ts`: the finale's art: the wheelie bin upright and knocked over, the trampoline on its side and flat, the 4 litter looks, and the shed standing open.
- `peekStrip.ts`: the peek strip's three layers (the sky lie, their rows from the lawn report, the hedge with the bird and caption) and its live parts (puffs, song notes, the sprinkler).
- `lawnLayer.ts`: `LawnLayer`, your lawn's off-screen canvas with dirty-row repaint (2 rows a frame), and `CostMeter`, a rolling cost meter for the dev perf readouts.
- `brendaArt.ts`: Brenda, the prize rosette, and her plastic lawn.
- `trueLawn.ts`: reading a final (or a lawn pack) into a whole lawn, and `paintTrueLawn`, which paints it small with every item, or as the tinted lie, for the reveal and the match end.
- `revealScene.ts`: `RevealScene`, Brenda's reveal on the canvas (its sounds go through the session, so they log): her walk along the fence, both true lawns from the finals with the tint peeling (or fading), the count-up with her lines, what she counted beside each score line (fitted to its row, else its first kind) and the blame line, the rosette with the heading naming the round's winner (`roundHeading`), and the walk home across her plastic lawn.
- `sounds.ts`: the sound map: `playEvent` for your garden's events (a drowned patch's `squish` too), and `SoundLoops` for the mower, pour, tap and wind loops.
- `worstReplay.ts`: `WorstReplay`, the replay recorder for the lawn band during play (it says when it copied a frame), and the match's worst moment as a clip with its caption.
- `shareCard.ts`: `lawnsPicture`, both true lawns and names for the share card.
- `ghostFinger.ts`: `drawGhostFinger`, a 2.4s ghost finger play showing a move: a throw (the see-through finger and a ghost of the item flying over the fence), a pull (pressing a rooted weed, dragging it out, then the throw) or a mowing rub down a column and back; or a still arrow under Reduced Motion (up to the fence, or both ways along the column); `FingerPlay`, one play.
- `tipPointer.ts`: where a tip's arrow points (`pointerSpot`), which spot a tip takes when it shows (`tipSpotFor`: the patio strip when the object's drawn top pokes above the lawn's edge), and the marker-yellow arrow, bobbing or still under Reduced Motion, with a column's outline from row 2.
- `fx.ts`: `Effects`, the dust, dirt, clippings and spray puffs (a blocked throw's dust, a missed flick's dust where it began, a rooted weed's dirt, dirt where a pulled weed pops out and where every new weed comes up, a drowned patch's muddy splash) and the screen shake, both calmed by Reduced Motion.
- `cues.ts`: `FailureCues`, the failure cues every player sees: a blocked throw's "Too soon" or "Arm's tired" with a flashing red ring, a rooted weed's shake (none under Reduced Motion) and a missed flick's swish of three grey dashed strokes, each logged with when it was heard and first drawn, plus each pull's first ring (`notePull`).
- `stripeCues.ts`: `StripeCues`, the stripe cues every player sees: the sweep down a column that gains a stripe, the flicker of one that loses it (neither under Reduced Motion), and the blocked-stripe flash on the patches that block it; and `StripeTicks`, the chalk tick on the patio's edge under each settled stripe and the red cross for 1s under one just lost (still under Reduced Motion).
- `gardenScene.ts`: `GardenScene`, cached layers and per-frame drawing (with its `Effects`): the peek strip, their head and clips behind and over the fence, the laugh, sparkles, waiting seeds, the open shed, sunk junk flat under everything, items with Biscuit in their depth order (legs, tail, Woof, Grr, the dig ring and the eyed-item ring), the lift ring and the arm ring, the mower (parked wherever it stands, or running with sparks), the tap and can (home or in hand, with the pour), wind streaks, the weathervane (still under Reduced Motion, turning but never wobbling), crossing ghosts, their fist and speech bubbles, `?debug` hit areas, how many item stamps it has cached, and the arrow of a new player's tip (`pointer`) and the ghost finger (`ghost`), both set by the room each frame; on the yard's lawn, bare slabs over the patio strip above the panel, with no tap handle and no Biscuit; its `FailureCues`, `StripeCues` and `StripeTicks` (`stripeChange` from the session; the ticks read the settled stripes each frame and start fresh on a new garden), a rooted weed you pull leaning toward your finger (not under Reduced Motion) with its marker-yellow pull ring in the arm ring's place, water spilling over a full can under the running tap, and "Full" on a full bag.

**UI (`src/ui`)**

- `RoomClient.tsx`: the `next/dynamic` browser-only wrapper.
- `PracticeClient.tsx`: the same wrapper for Practice, with a fresh room code per visit.
- `RoomScreen.tsx`: the room (or Practice, with Mr Pemberton on a memory pair, and dev `?bot=` autopilot): session, canvas, loop (presses reach `inputGarden()`, so the yard too; the yard's bar and panel (`Yard`), with the tip line and Reconnecting raised onto the panel's top edge, and hidden under the yard's How to Play) (the garden, the replay's capture during play (not while paused), then Brenda's reveal over it), input, overlays, the Reconnecting banner, the match end, the menu (Escape too), F for Shake Fist, the leave question, the Back guard, the desktop leave warning, the key card, the sideways cover, the live region, a canvas press stopping the ghost finger, the session's stripe changes passed to the scene, sound unlocking on the first tap, and leaving the room when the screen goes; focus moves to the menu button when a match start removes the card or the yard that held it. Dev builds meter each frame's work, the replay's copies and React commits (a `Profiler`), and get the dev panel's cheats from `devApi.ts`.
- `HomeClient.tsx`: the home screen: title, pitch, name box, Start a Room, the code box and Practice Alone; a tap here unlocks sound for the room.
- `RoomPanel.tsx`: connection notices, Room Full, already open, moved, and the lobby with the code (spaced letters for screen readers), gates (names wrap instead of cutting short; a neighbour who pressed Rematch shows as Ready; Away once they go quiet; First Match for a new neighbour), What Brenda Counts, Try the Yard for a new player (the main button until the yard is finished or skipped, then plain), Ready (`ReadyButton`: Not Ready once pressed, described by the status line; the pulse by `readyPulses`), the status line (`lobbyStatus`: their yard step, your wait, or "neighbour_name is ready."), How to Play (`HelpCard`) swapping the card with one status line kept, and the buttons and status line pinned to the card's bottom (`Pinned`); Practice's own lobby card with Try the Yard and Start (`StartButton`); focus on How to Play after Back and on Ready (or Start) when the card comes back from the yard; no card while the yard is open.
- `Card.tsx`: the centred paper card over the garden, with focus on its heading when it opens, or on the element its `focus` selector names.
- `Yard.tsx`: the lobby's yard while it's open: the yard bar over the top band (How to Play, "The Yard" with "Step 2 of 3", Skip) and the panel over the patio below its stripe ticks (the status line with names cut to 10 characters and Ready, or Start in Practice, never pulsing), How to Play over both with Back to the same step, and focus on "The Yard" when it opens.
- `lobby.ts`: the lobby's pure rules: `readyPulses` (your friend Ready; for a new player also the card's 6s and a finished or skipped yard, never while it's open; Practice's Start only for a new player) and `lobbyStatus`, the one status line.
- `MatchEnd.tsx`: the match end: the result, both true lawns from the deciding round, every round's points under You and their name beside the worst-moment replay, Rematch, Share Card (the share card's stats), Leave and the rematch lines pinned to the card's bottom; "Stormed Off" with Back to Lobby; "Walkover" for both sides; "No Contest" with Rematch; the result without lawns on a page that reloaded after the end; "neighbour_name left." when they go; Away beside a quiet neighbour's name.
- `AwayTag.tsx`: the yellow Away tag the top bar, the lobby gate and the match end share, and the First Match tag in the same style.
- `HowToPlay.tsx`: What Brenda Counts, the 13 How to Play lines, shared by the lobby cards and the menu, and `MoreBelow`, the fade and "More below" with a down arrow on the edge under the list's scroll area until its last line shows.
- `Menu.tsx`: the match menu (Keep Playing, Settings with sound, volume and Reduced Motion, How to Play with What Brenda Counts after its lines, Hide Tips, Leave).
- `LeaveDialog.tsx`: "Leave the Match?" with Stay and Leave.
- `leaving.ts`: `useBackGuard`, the history entry that turns Back into the leave question, and `leaveRoom`, which says `leave`, closes the session, silences the leave warning and goes home.
- `ShareBox.tsx`: Copy Link, Share Link where supported, and the selectable link when copying fails. In dev builds the link keeps room flags such as `?local` and drops this tab's own player flags (`first`, `pid`, `name`, `bot` and `skew`).
- `TopBar.tsx`: the menu button, two name tags (your own reads You) (the name cut to 10 characters over its rosettes, each round's held back until its reveal's rosette), the round clock in a centred column and Shake Fist (resting 3s after each shake) over the design's top band, at least 48 px tall; the clock turns red for the last 10s and reads Paused during a playtest pause; Away beside their rosettes, and "Gone 0:42" in place of them.
- `useAudioUnlock.ts`: unlocks sound on the page's first tap, click or key press.
- `Reconnecting.tsx`: the "Reconnecting…" banner in the tip line's place under the patio props while your line is down. `raised` sits it on the patio's top edge, over the yard's panel.
- `TurnUpright.tsx`: "Turn your phone upright." over the room on a phone held sideways, taking every press.
- `Rosettes.tsx`: a drawn rosette per round win, sized by the caller.
- `Verdict.tsx`: the verdict as screen-reader text during the reveal: both scores line by line with what Brenda counted, the round line and the match line.
- `reveal.ts`: what Brenda's reveal shows each frame from the session (reused, no allocation), and the tally the top bar shows until the rosette.
- `Countdown.tsx`: "3, 2, 1, Mow!", the round 2 and 3 banners (screen readers hear the title and line as one sentence, `bannerSentence`), "Time's up." and "Brenda is judging." until the verdict.
- `Notice.tsx`: a new player's tip line over the fence, its bottom on the lawn's top edge, the strip under the patio props for toasts and tips moved there, and round 1's shed banner over the peek strip, each one line at every size with its own status region (the banner's speaks the full rule). `raised` moves the patio strip onto the patio's top edge while the yard is open.
- `CvdFilter.tsx`: the dev `?cvd` colour-vision SVG filter.
- `NetOverlay.tsx`: the `?debug` readout: network, send rate and peak, and each frame's work with React commits.
- `BadLink.tsx`: the bad-link screen.
- `copy.ts`: room screen copy, the yard's button, title, step and Skip included.
- `devApi.ts`: the dev panel's cheats (`devActions`) and `window.__game.greener` (dev builds only): state (with verdicts, the tally and the waiting final), reveal (the step and Brenda's lines), garden (with weeds and their clock times, seeds, snails, water, mower, stripes, blame, the arm, which items are catchable, Biscuit with the dig schedule, and the wind with every gust in this garden's frame), neighbour (their lawn report, puffs, clips, heads, laughs), net, events, toClient, targetClient, biscuitClient, `act` (throw, which lifts heavy junk first, yank, sprout, tap, water, mowColumn, setCan, setBag, swipeBag, setArm, biscuit, dig, dogReady, clearItems, pullWeeds, clearSnails, quietDog, gust, drag, lift, shed), the shed and heavy junk in `garden()`, spawn, setPatch, dryLawn, perf, dirtyLawn, ready, rematch, toLobby, leave, hideTips, playHere, jump (to any round), fault, autopilot, and in Practice `bot` (his garden, state, events and `mode`), `hide(ms)` (a hidden desktop tab: fake visibility and no frames, timers running), `packs(round)`, `twin()`, `start()` and `worst()`; `jump` moves the clock in place and reaches the guest's tab and Mr Pemberton without the room flow; `state()` carries `over`, `myRematch`, the peer's silence and Away, and `first` (this page now, this match, the neighbour's flag), and `neighbour()` carries fists and bubbles; `spawnAt`, `perf()` (lawn, frame, replay copies, commits, stamps) and `resetPerf()`; `tips(on)` for Show Tips and Hide Tips, `tipSeen(id)`, `tipNow()` (the tip on show with its spot, target and arrow on screen, and `ruleSpot`, the spot the tip line's rule picks for its target now), `ghostNow()` (the ghost finger's object or column, its move, play time and whether a press stops it), `yard()` (open, step, steps done, the step's object or column, failed tries, how the last visit ended, How to Play over it, whether it's finished or skipped on this page, the step it sends and the tips it taught) and `act.yard()`, `tipLines()` for the width check (every fetch variant too) and `tipStages()` (each fixed tip line's tip, first round and whether it's a failure tip); `ticks()` (the mark under each column on the patio's edge); `garden().pull` (a rooted weed's pull); `cues()` (the failure and stripe cues that showed, with when each was heard and first drawn), and `reveal()` carries the counts on each board. The playtest clock: `window.__game.pause()` and `resume()` stop and restart game time 150 ms ahead on this page, Mr Pemberton's session and the room's other tab through the dev channel, which a page that loads late asks for the room's pauses; `paused()` reports it, and the dev panel's Pause or Resume toggles it.

**Scripts**

- `scripts/devHttps.mjs`: `bun run dev:https`, the dev server over HTTPS with an openssl certificate in `.certs/` for localhost and the LAN addresses.
- `scripts/balance.ts`: `bun run balance [seeds] [family]`, the M27 and M37 targets over seeded headless bot rounds, with the expert's thrower, mower and closer finales, the median regular lawn at 0:00, the median Stripes of the regular, mower and closer, and why the finale mower's columns failed at 0:00; a family number picks another seed set.

**Shared (`src/shared`)**: see `src/shared/README.md`. This build added `handoff` to `PointerTracker`, `alignY` to `Viewport`, `sfx.unlocked`, `badge` to `ReplayPlayer`, and the `stripe` sound.

**E2E (`e2e`)**

- `lib.mjs`: launch (on the GPU with `gpu`; every context starts with the finished-match fact stored unless made with `fresh: true`), the sizes (`se` is 375 by 548), local pairs, waits, `frames` (animation frames to wait after a dev jump), `settledBox` (an element's box once its animations end), screenshots, time-based mouse and touch flicks, `hold` and `dragHold` (mouse or touch), `spokenText` (what a screen reader hears from a region, read from CDP's accessibility tree), `heldPointer` (one mouse or touch pointer held across several steps, moving at a steady speed by the clock), the `bars` size (390 by 664, a 390 by 844 phone with its browser's bars), the patio line (`noticeText`, `waitForNotice`), `rematch` (both pages from the match end into a new match), `watchErrors`, which also confirms and counts the desktop leave warning, `tipNotes` (the tips in an event log) and `expectedCoach` (the coach tip a verdict should give, from `DESIGN.md`'s table). `pauseAll` and `resumeAll` drive the playtest clock on a `?local` pair or a Practice page.
- `fence.mjs`: M1 and M11 at three sizes on full `?calm` rounds: the hand-off, a slow put-down, the arm ring, a soft swipe that clips and teeters on both pages, a catch thrown straight back with real pointer events, arrivals entering above the fence top, and a throw vanishing at an Away neighbour. Pass fault flags such as `lag=250` as the first argument.
- `lobby.mjs`: M6 walkthrough at three sizes (started, link and typed paths, copy, the code read letter by letter, Ready, Not Ready with no pressed state and the waiting line as its description, pulse, live region, Away on a quiet neighbour's gate), M28's What Brenda Counts on every path, How to Play by click and keyboard with its 13 lines and its status line, M41's "More below" in the lobby's and the menu's How to Play at five sizes (`more` runs only that), and the pinned buttons and waiting line at 375 by 548 and 375 by 667 with the countdown focusing the menu button, then M2 seats, Room Full with Try Again and no message sent, reloads, Play Here, clock skew both ways, Can't Connect.
- `cues.mjs`: M34 and M42 at 390 by 844 and 1280 by 800 (and `small`): every failure cue by real input on a new and a returning page, each within 100 ms of its cause (the swish for a fast flick on bare grass and beside a gnome, with a screenshot 250 ms after the flick, the swish beside a real throw in flight, a rooted weed's pull ring part full after a 30 px drag and the weed popping out after a longer one, then swiped over the fence, a rooted weed, "Too soon", "Arm's tired"), put-downs by reason (a gnome held still earns the still tip; sideways and downward releases leave the gnome where it was let go, and the sideways one earns "Swipe up toward the fence.") with a cancelled press earning no tip, a drowned patch's squish, the full can's spill, "Full" on a full bag, and a press on a light bag doing nothing; the new page gets each failure tip, the returning one none. Before each mistake it clears items, weeds and snails. Pass a size.
- `stripes.mjs`: M36 and M43 with the mouse at 390 by 844 and 1280 by 800 on a new and a returning page: a rub stripes a column with its sweep, chime and tick, a gnome on it makes it flicker out with a red cross for 1s and the new player's broken-stripe tip, a real flick throws the gnome off and a second rub brings the stripe back, and a rub down a column with 3 weeds flashes them, with the new player's blocked-stripe tip on that column; `still` checks Reduced Motion keeps the chime and drops the sweep and flicker; `look` checks mow lines halfway through a pass, striped columns lighter and greener than short unstriped neighbours at health 3 and 5 (mean L* and greenness from the canvas), and the tick row, at three sizes; `cvd` shoots the stripes through both filters. Pass a size, `still`, `look` or `cvd`.
- `tips.mjs`: M30 to M32, and M35's coach tip, with A returning and B new: `lines` (every tip and toast fits 295 px at 18 px, every fetch variant included, and the tip sits on the fence over a gnome in row 1 at four sizes), `stream` (B's tips on the fence line, or in the patio strip when `tipNow().ruleSpot` puts the object behind the tip line, none under 3s, toasts in the patio strip, A none until Show Tips), `hidden` (20s hidden shows and marks no tip, and Biscuit's circle tip, waiting behind the tap tip as the hide begins, never shows after he dug while hidden), `reload` (no start tip and no ghost finger after a reload at 1:30), `stages` (a full-length seeded round 1 with every staged tip in order and only the dig tip from 2:20 to 2:05), `pointers` (arrows on a snail, the tap and a shaggy column, none on the dig circle, at three sizes), `still` (Reduced Motion holds the arrow still), `clipped` (a clipped gnome in full view under a tip at 375 by 548), `catching` (round 3's catch tip in the patio strip), `ghost` (the finger in the countdown and at 0s, stopped by a press, at three sizes), `ghoststill` (the still arrow under Reduced Motion), `banner` (the shed banner inside the peek strip at 375 by 548 and 1280 by 800, its region holding only the spoken sentence in the accessibility tree, then the shed tip) and `coach` (round 2's banner heard as one sentence, the coach tip first in the round 2 and 3 countdowns, matching the last verdict, and not again after a reload). Pass a part.
- `firstmatch.mjs`: M39, a friend's first match by link in one `?local` context with empty storage: A starts a room from the home screen on `?first=0` and copies the link, B opens it as a new player, and `hand.mjs` plays the match (A by mouse at 1280 by 800, B by touch at `small` or `phone`). It checks First Match on A's screen only, You in both pages' own top-bar slot, B's tips (3s or more, each from its round, none again once seen, by tip rather than line, with seen read from each tip's end in the log, the start tip first, the coach tip first in rounds 2 and 3 matching the verdict, and in `full` rounds the timed tips by stage), none on A, the ghost finger and shed banner on B only, matching reveal counts, the fact saved as the last reveal ends, no tips in the rematch, and no First Match once B leaves and opens the link again. Screenshots of B's lobby, the finger, a pointer, the banner, the coach tip, a reveal and the match end. `pusher` runs the lobby over real Pusher in under 30 client events. It also checks Try the Yard on B's card only, and gone after Back to Lobby; `yard` has B finish the yard before Ready, and the match then never shows B the weed or mow tip. Usage: `node e2e/firstmatch.mjs [small|phone] [fast|full|pusher] [yard]`.
- `yard.mjs`: M44 and M45 with A on `?first=0` and B opening the room link from empty storage, at 375 by 548, 375 by 667 and 390 by 844 by touch and 1280 by 800 by mouse: Try the Yard on B's card only, focus on "The Yard", A's line "… is trying the yard (1 of 3)." within 2.5s and following each step in its status line and live region, B's Ready free of the pulse in the yard, the bar, panel and step line clear of each step's object, step 1 by real input with its peek-strip puff, How to Play and Back keeping step 2 with focus on How to Play, Skip returning the card with focus on a pulsing Ready; then Try the Yard again from step 1, all 3 steps by real input (a soft back-row throw clips with its tip and the step stays open), "That's a stripe. Yard done." and focus on Ready; A's lawn and log untouched and B sending only hello and sync; then the `?fast` match, where B's round 1 shows the start and dig tips and never the weed or mow tip. `ready` has B press Ready inside the yard with a pointer held: the countdown starts, the yard closes, focus moves to the menu button, the press does nothing in round 1, and the garden starts fresh. `still` shoots the 3 still arrows under Reduced Motion, `practice` checks Try the Yard and Start's pulse in a new player's Practice lobby, and `pusher` reads B's yard line on A over real Pusher. Usage: `node e2e/yard.mjs [se|small|phone|desktop|ready|still|practice|pusher] [size]`.
- `newplayer.mjs`: M29 at three sizes: First Match on a new neighbour's gate only, a new player's Ready pulse waiting for the yard to be skipped and for 6s, You in each page's own top-bar slot with the other's name beside it; then a context with empty storage that saves the fact at a decided match end, stays returning after a reload, and shows no First Match after Back to Lobby. Pass a size.
- `verdicts.mjs`: lost verdicts on `?local&fast&calm` pages: a host reloaded 0.5s after a verdict still sees the peel, count and rosette, and its match end lists every round like the guest's, with Away beside a quiet guest; a host closed 1s before round 1 ends and back in round 2 builds its round 1 final, both pages agree, and the guest repeats nothing while the host is gone. Pass `reload` or `missed` and a size.
- `reconnect.mjs`: real Pusher in the lobby: a 14s cut and a brief one each show Reconnecting… within a second, then a hello once the channel subscribes again (about 12 events).
- `home.mjs`: M5 name and code rules, pasted links, redirects, the bad link, the auth route's name rule.
- `pusher.mjs`: M3 on real Pusher, M16b's seat time (both names within 2s and under 15 events), plus a landing coming back in a lawn report (spends quota; about 56 events).
- `peek.mjs`: M12 at three sizes: lawn reports every second, a gnome on row 2 in the thrower's peek strip within 1.2s with a puff and an angry head, a row 10 landing puffing on the horizon with no marker, and screenshots of each round's sky lie.
- `match.mjs`: M4 countdown, clock and reveal agreement, the desktop leave warning on a reload, reload rejoin, round 2 (`clock`); then M20 at three sizes (`end`): Back from a lobby the home page opened leaves the room at once; the menu by Escape or its button with Settings, How to Play and Hide Tips; a match to its end screen with both lawns painted; Rematch on the guest, then the host, starting a new match with a new seed; Back on the guest opening the leave question, Stay, then Leave sending the host to Stormed Off and Back to Lobby; M38's checks that the round 2 and rematch countdowns show the round's full time and that a rematch's countdown leaves nothing from the last match in the live region or the verdict text. `countdowns` checks full-length round 1 and round 2 countdowns read 3:00.
- `lawn.mjs`: M7 health levels, mess marks and stripes (also through `?cvd`), idle drying equal on both pages at three sizes (read at the same garden time), and lawn repaint cost on the GPU (`--cost` runs only that, also at 4x throttle).
- `pests.mjs`: M10 on two seeded pages: identical spawns live and after a jump, round 1's back-row weed, 40 weeds on an idle lawn, a thrown weed wilting 20s after its yank, a thrown snail out of its shell 3s after landing. Pass `throws` to skip the spawn checks. A tap on the patio unlocks sound before its first mouse flick.
- `chores.mjs`: M8 and M9 by real mouse and touch on `?calm` rounds: pour timings, the tap's flood and tip, the empty-can toast, a stripe that lasts 75s, the scalp, fast flicks that never mow and snap to a gnome. Pass `water` or `mow` to run one half. The pour's hold ends about 450 ms after the drown, and timings that are off print the pour's events.
- `biscuit.mjs`: M14 at three sizes: the same seeded hole on both lawns, a patio tap that unlocks sound first, a gnome put down by a real press barked at after 1.5s and dropped on the back row by 5s, a real press taking the item back out of his mouth, a real tap during the circle that sits him with no hole, and a missed circle that digs one and counts in blame; a new player's dig tip in round 1, and the bark and fetch tips only after a jump into round 2, the fetch tip naming the gnome.
- `wind.mjs`: M15 at three sizes: the vane 2s before each gust and the gust at the same moment on both pages, a tailwind on one page as a headwind on the other with a real swipe on each (1.3 and 0.7 times the distance), and an along gust blowing opposite ways in each frame; no wind tip in round 1, and in round 2 each page's wind tip before the gust, with the line for that gust in its own frame.
- `dandelion.mjs`: M16 at three sizes on full rounds: the round 2 and 3 banners, a dandelion turning into a seed clock at the same moment on both pages, and a clock yanked and thrown with real input that bursts next door, where its 3 seeds root 10s later (it thins the receiving lawn to 20 weeds first, since seeds can't root at the 40-weed cap).
- `endings.mjs`: the endings nobody plays for: two idle gardens draw every round, so the match ends drawn ("Brenda can't choose."); then B leaves from the match end, A reads "neighbour_name left." and goes back to the lobby, and B comes back by the link for a new match from Ready. Pass a size.
- `finale.mjs`: M17 at three sizes on `?fast&calm` rounds: the shed opening on both pages together with 12 crate gnomes on rows 8 to 13, a real drag of the bin from the patio that flattens a path, a real hold-to-lift and swipe that sinks it next door with 4 litter looks and no way to grab it, a gnome bouncing off a trampoline next door and coming home as an own bounce (round 2), and a thrown mower that ends mowing with the clock red in the last 10s (round 3, or a rematch when round 2 decided it).
- `reveal.mjs`: M19 at three sizes: a guest that drowned its own lawn loses with the drowned line under its score, both lawns get the gnome line with the right count, both pages enter every reveal step within 100 ms, each page's span running from the frame before the step to the frame that showed it, so a frame a screenshot held isn't drift, both boards show the same counts (M35), also after the guest reloads mid-reveal, when its later steps still land within 100 ms once its clock syncs and its frames flow, and the screen-reader verdict reads each count, and round 2 ends the match with the walk home, with screenshots of every step.
- `results.mjs`: M18: the verdict card and rosettes on both pages at three sizes, a guest frozen through 0:00 waking to the host's verdict, and a soak of 20 rounds over as many matches (rematches) as it takes with `drop=0.3`, both pages agreeing on every verdict and tally. Pass the round count and a size, or `soak`, to shorten it.
- `practice.mjs`: M21 at three sizes on `?fast&calm`: What Brenda Counts and How to Play in his lobby, Start against Mr Pemberton, round 1's first tip, three gnomes into his front rows for "My begonias!" and his fist, a clip for his laugh, then autopilot on to the match end with his "Blast." on the way and his rematch request, and no Pusher traffic at all.
- `bots.mjs`: M21 two `?local&fast` pages on autopilot (`regular` and `expert` by default) through a whole match, agreeing on every verdict and the match end.
- `rejoin.mjs`: M22 with fixed player ids so page A hosts: at three sizes a mid-round guest reload rebuilt from the host's copy with the idle host's weeds, `hide(20000)` matching its `twin()` and never showing Away, and 12s offline showing Reconnecting and Away with no walkover; on desktop a lobby reload clearing Ready, a reveal reload rejoining with the verdict and a host reload taking the match back and judging the next round for both; a closed tab's Gone countdown and walkover with the returner's view (desktop, small); 60s of silence ending as a no contest on both pages, then Rematch (desktop, phone). `pusher` runs the short real-Pusher Gone check. Pass a size or `pusher`.
- `replay.mjs`: M24 at three sizes: a soft throw that clips becomes the worst moment, the host wins in 2 rounds, the match end replays it captioned "Clipped the fence. Again.", and Share Card downloads a 1080 by 1350 PNG, with screenshots of the match end and the card. Pass a size.
- `sound.mjs`: M23: no sound before the first click through a countdown; after one click, every sound in the map on one page through a `?fast` round, the `stripe` chime from a real rub included; a clicked Shake Fist popping up next door within 300 ms, resting 3s and ignoring F meanwhile; a tap on Shake Fist at both phone sizes with screenshots. Pass a size.
- `phone.mjs`: M25. `layout` at 375 by 548, 375 by 667, 390 by 844 and 1280 by 800: screenshots of home, the lobby, play, the menu, Away, Reconnecting, a reveal, both rosettes, Gone and the match end, checking the bar's height and edge, the centred clock, unclipped names, nothing pressable over the peek strip, fence or lawn, and the tip line and banner under the props. `touch` at the phone sizes: a touch throw, mow and pour, and the 20 px edge guard on both hedges. `turn`: the sideways cover in the lobby and play, gone when upright, never on a short desktop window. `zoom`: a pinch zooms the lobby card but not the canvas. `cvd`: every health level through both filters at 375 by 548. Pass a part and a size. A tip off the fence line is reported with its text.
- `perf.mjs`: M26 on the GPU at 4x throttle. `busy`: a crowded lawn with petty autopilot throwing at it: frame work, frame gaps, the lawn layer, replay copies, React commits, stamps, rows repainted, idle allocations by function, the crowded and fresh-round catch-ups, and a throttled guest reload's rebuild. `practice`: frame work with Mr Pemberton playing. `bots`: a petty bot match's peak bundles a second and largest bundle.
- `play.mjs`: M27, a full `?local` match with full-length rounds played by hand (`hand.mjs`) on both pages at once (the mouse on desktop, touch pointer events on phones): each hand reads its garden and taps Biscuit, runs the tap, empties the bag, drags, lifts and throws heavy junk, throws weeds, snails and loose things, waters the driest spot and mows the longest column; it prints each verdict, checks both pages agree and screenshots the match end. Pass a size.
- `hand.mjs`: `hand(page, label, touch)`, the scripted player that `play.mjs` and the playtests share: it reads its garden through the dev API and plays with real mouse or touch input.
- `playtest.mjs`: the playtest from the home screen: A types a name and starts a room, B types the code, Ready and Not Ready by click, a whole match by hand, screenshots of every round's middle and finale and every reveal step, the match end, the share card and a clicked rematch with a new seed; it checks both pages agree and prints bundles a second, the peak, the largest bundle and the match's client events and Pusher messages. Pass two sizes, the extra query (`fast` by default, `''` for full-length rounds) and `pusher` for real Pusher with a context per player.
- `away.mjs`: neighbours who step away, on fixed-id `?local` pages: a 70s desktop hide mid-round that never shows Away and still takes a throw (full length), a guest hidden over 0:00 judged on its own final, a guest frozen over 0:00 judged on its rebuilt lawn after the 6s wait (`frozen`) or at once once Gone (`gone`, full length), with both screens drawing the rebuild and its score matching the guest's own caught-up lawn, a reload keeping the bag, can, tap, arm and own faults, and a walkover's loser keeping their seat. `pusher` runs only when asked: a frozen guest's rebuilt lawn over real Pusher, about 200 messages. Pass a part, then a size.
- `prodcheck.mjs`: a production build's Practice against `next start` on another port (set `GREENER_URL`): from empty storage Try the Yard, whose yard opens and skips, then a new player's start tip despite `?first=0`, no `window.__game` and no playtest pause, no dev panel, `?fast` ignored, a tab switch, the fact saved only once the full-length match ends, then no tips for a browser holding the fact despite `?first=1`, with clean consoles. It takes 7 to 11 minutes.
- `pause.mjs`: M46's playtest clock: `round` pauses a `?local&first=1` full-length round 1 on both pages at 2:30 for 60s (garden t, the clock's Paused, the tip on show and Biscuit's state still across five samples 10s apart, a real press doing nothing) and checks the round ends 60s later with matching verdicts; `reveal` and `countdown` resume at the same step; `practice` stops Mr Pemberton and cuts off a held gnome with no tip; `pusher` shows a real Pusher room ignoring it. Usage: `node e2e/pause.mjs [round|reveal|countdown|practice|pusher] [size]`. `reveal` and `countdown` wait 3 frames after the pause begins before sampling.
- `rooms.mjs`: room trouble by click on `?fast` rounds: a third player's Room Full and Try Again, B's tab hidden and paused for 20s mid-round (A shows Away), a mid-round reload rebuilt from A's copy, both pages agreeing on the verdict, B leaving through the menu and the leave question, A's Stormed Off and Back to Lobby, and a newcomer taking the freed seat. Pass a size, and `pusher` to play it over real Pusher (about 500 messages).
- `practicetest.mjs`: Practice Alone from the home screen, a whole `?fast` match by hand against Mr Pemberton with his reactions screenshotted, the share card and a rematch, failing on any request to Pusher's servers. Pass a size.
- `bag.mjs`: M13 at three sizes: no bag tip at 80 cuts in round 1 and the bag tip in round 2, a real drag onto the compost held until it empties, a real swipe that heaps the other lawn, exact 1,900 and 1,700 px/s swipes (next door, then a clip onto your own front rows), the heap in the peek strip, and mowing a heap.

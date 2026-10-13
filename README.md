# Greener on the Other Side

Grow a better lawn than your neighbour in 3 minutes. Throw every weed, snail and gnome over the fence.

A 2-player realtime browser game. Rooms run over Pusher, and the only server code is one route that signs room joins. `DESIGN.md` describes the game, `ARCHITECTURE.md` the code, and `PLAN.md` the build history and every design decision.

## Run It

1. Copy `.env.example` to `.env.local` and paste your Pusher app secret into `PUSHER_SECRET`.
2. Turn on **Client Events** in the Pusher dashboard, under App Settings.
3. Install packages with `bun install`.
4. Start the dev server with `bun run dev`, then open http://localhost:5176.

For a production build, run `bun run build`, then `bun run start`.

## Play With Friends

- **Same Wi-Fi:** open the Network address that Next.js prints, for example `http://192.168.1.20:5176`. Start a room there, then send your friend the room link.
- **Anywhere:** deploy the folder to Vercel and set the four variables from `.env.example`. Room links use whatever address you opened the game on.
- **Alone:** press **Practice Alone** to play Mr Pemberton, the bot neighbour. Practice never connects to Pusher.

## Checks

- `bun run typecheck`, `bun run test` and `bun run build` must pass.
- `node e2e/<script>.mjs` drives two players in Chromium against the dev server. Most scripts use `?local`, which links two tabs without Pusher. `e2e/pusher.mjs` uses real Pusher and spends about 50 client events.
- `bun run balance` plays bot-against-bot matches and checks the balance targets.

## Dev Flags

These work in dev builds only:

- `?local`: connect two tabs of one browser instead of using Pusher.
- `?fast`: shorten rounds and waits.
- `?debug`: show network stats and other overlays.
- The backquote key opens the dev panel.

# Shared Foundation

The game's foundation: canvas, input, physics, timers, chores, coins and UI building blocks. Import everything from this folder's `index.ts`, and the CSS from `styles.css`, with relative paths.

```ts
import { createWallet, GameLayout, sketchBlob, startLoop, useGameCanvas } from '../shared'
```

Conventions used everywhere:

- Logical units: canvas code draws in a fixed design space (for example 600 x 800). `Viewport` maps it to the screen.
- Flat points: point lists are flat number arrays `[x0, y0, x1, y1, ...]`, plain or typed. This avoids one object per point.
- Stores: React reads game state through `createStore` stores. Publish snapshots on discrete events or at about 10 Hz, never every frame.
- Dev helpers check `process.env.NODE_ENV !== 'production'`, so production builds drop them.

For working examples, read the rest of the game source in `src`.

## Game Setup

```tsx
import '@fontsource/patrick-hand'
import '@fontsource/permanent-marker'
import './index.css' // @import './shared/styles.css'; @source '.';

function App() {
  const { canvasRef, viewport } = useGameCanvas({ width: 600, height: 800 })
  useEffect(() => {
    const pointer = new PointerTracker(viewport.ctx.canvas, {
      toLogical: (x, y, out) => viewport.toLogical(x, y, out)
    })
    const stop = startLoop({
      update: dt => game.update(dt),
      render: (_alpha, timeMs) => game.draw(viewport.begin(), timeMs)
    })
    return () => {
      stop()
      pointer.dispose()
    }
  }, [viewport])
  return <GameLayout canvasRef={canvasRef}>{/* HUD */}</GameLayout>
}
```

## math

Small numeric helpers. None of them allocate.

- `clamp(value, min, max)`: limits a value to a range.
- `lerp(a, b, t)`: blends from `a` to `b`.
- `invLerp(a, b, value)`: where `value` sits between `a` and `b` (0 to 1). Returns 0 when `a === b`.
- `damp(current, target, lambda, dtSeconds)`: frame-rate independent smoothing. `lambda` is a rate per second; 5 closes about 99% of the gap in 1 second.
- `dist(ax, ay, bx, by)`: distance between two points.
- `wrapAngle(angle)`: wraps radians into (-PI, PI].
- `angleDiff(from, to)`: shortest signed turn in radians.
- `rng(seed)`: seeded random source (mulberry32) returning `() => number` in [0, 1).
- `randRange(min, max, random = Math.random)`: random number in [min, max).
- `pick(items, random = Math.random)`: random item. Throws on an empty list.
- `shuffle(items, random = Math.random)`: Fisher-Yates shuffle in place; returns the same array.
- `hash01(seed, index)`: stable hash to [0, 1). Use it for per-item randomness without a random source.
- Types: `Rng` (`() => number`).

```ts
x = damp(x, targetX, 8, dtMs / 1000)
const r = rng(42)
const fly = pick(['left', 'right'], r)
```

## clock

Real-time waits stored as wall-clock times, so they stay correct while the tab sleeps.

- `now()`: `Date.now()`. Use it, not `performance.now()`, for waits.
- `waitMs(ms)`: the wait length to use. Returns `ms`, or at most 3000 when the dev `?fast` flag is on.
- `FAST_WAIT_MS`: 3000.
- `startTimer(label, durationMs, startedAt = now())`: starts a timer. Pass the designed duration; it applies `waitMs` itself, so `?fast` needs no changes at call sites.
- `timeLeftMs(timer, at = now())`: ms left, never below 0.
- `isDone(timer, at = now())`: true once the finish time has passed.
- `timerProgress(timer, at = now())`: 0 to 1.
- `formatClock(ms)`: countdown text, rounded up: `"0:42"`, `"1:02:05"`.
- `useNow(intervalMs = 250)`: React hook returning `Date.now()`; re-renders on the interval and when the tab becomes visible.
- Types: `RealTimer` (`{ id, label, startedAt, endsAt, durationMs }`; `durationMs` is the length after `waitMs`).

```ts
const fridge = startTimer('Jelly setting', 60_000)
if (isDone(fridge)) openFridge()
```

## dev

Dev-only helpers. Production builds report every flag as false and render no panel.

- `devFlags`: `{ enabled, fast, debug }`. `enabled` is true in dev builds; `fast` is `?fast`; `debug` is `?debug`.
- `parseDevFlags(search)`: parses a query string. Exported for tests.
- `exposeDev(name, api)`: puts a scripting API on `window.__game[name]` in dev builds. Returns a function that removes it.
- `DevPanel`: `<DevPanel actions={[{ label, run }]} />`, toggled with the backquote key. It also has `?fast` and `?debug` switches. `GameLayout` already mounts one; pass actions through its `dev` prop.
- `startLoop` publishes `window.__game.loop` by itself. See canvas.
- Types: `DevFlags`, `DevAction` (`{ label: string, run: () => void }`).

```ts
const unexpose = exposeDev('jelly', { state, addCoins: (n: number) => wallet.earn(n, 'Dev') })
if (devFlags.debug) drawPhysicsDebug(ctx, engine)
```

## store

A tiny observable state container for React.

- `createStore(initial)`: returns `{ get, set, subscribe }`. `set` takes a partial patch or an updater `s => patch`, shallow-merges, and only notifies when a value changed.
- `useStore(store, selector?, isEqual = Object.is)`: subscribes a component through `useSyncExternalStore`. Selectors should return primitives or references already in state. If a selector builds a new object or array, pass `shallowEqual`.
- `shallowEqual(a, b)`: compares top-level values.
- Types: `Store<T>`, `StoreUpdate<T>`.

```ts
const hud = createStore({ scene: 'kitchen', held: 0 })
hud.set(s => ({ held: s.held + 1 }))
const scene = useStore(hud, s => s.scene)
const both = useStore(hud, s => ({ scene: s.scene, held: s.held }), shallowEqual)
```

## chores

"This must be done before that."

- `createChoreBoard()`: returns a `ChoreBoard`.
- `board.add({ id, label, detail?, blocks?, createdAt? })`: adds a chore. Returns false and changes nothing when that id is already open.
- `board.complete(id)`: removes a chore. Returns false when it wasn't open.
- `board.has(id)`, `board.list()`: open chores, oldest first. The list reference only changes when the board changes.
- `board.blockersFor(action)`: open chores whose `blocks` include `action`, as a new array.
- `board.canDo(action)`: true when nothing blocks `action`.
- `board.subscribe(listener)`, `board.store`: change notifications and the backing store.
- `useChores(board)`: React hook returning the open chores.
- Types: `Chore`, `NewChore`, `ChoreBoard`, `ChoreBoardState`.

```ts
chores.add({ id: 'mop', label: 'Mop the splat', blocks: ['carry-tray'] })
if (!chores.canDo('carry-tray')) toast(`First: ${chores.blockersFor('carry-tray')[0]?.label}`, 'bad')
```

## economy

Coins, one upgrade shop per game, and consumables.

Wallet:

- `createWallet({ coins = 0, historySize = 5 })`: returns a `Wallet`.
- `wallet.coins()`, `wallet.canAfford(amount)`.
- `wallet.earn(amount, reason)`: adds coins. Returns false for amounts that are not finite and above 0.
- `wallet.spend(amount, reason = 'Spent')`: returns false for negative amounts, NaN, or overspending. Spending 0 succeeds without a transaction.
- `wallet.store`: `{ coins, history }`. `history` holds the latest transactions, newest first, each `{ id, amount, reason, at }` with negative amounts for spending.
- `wallet.subscribe(listener)`: runs after every change. Returns an unsubscribe function.
- `useCoins(wallet)`: React hook returning the coin count.

Upgrades:

- `UpgradeDef`: `{ id, name, cost, helps, newChore, requires? }`. Extend it with your own fields; the shop is generic.
- `createShop(defs, wallet)`: returns a `Shop`.
- `shop.list()`, `shop.get(id)` (throws for unknown ids), `shop.owned(id)`.
- `shop.check(id)`: a `BuyResult` saying whether `buy` would work.
- `shop.canBuy(id)`: boolean form of `check`.
- `shop.buy(id)`: pays and marks it owned, or returns why not. Add the upgrade's chore yourself on success.
- `shop.store` (`{ owned }`, ids in purchase order), `shop.wallet`, `shop.subscribe(listener)`.
- `BuyResult`: `{ ok: true }`, `{ ok: false, reason: 'owned' | 'poor' }`, or `{ ok: false, reason: 'locked', missing: readonly string[] }`. Checks run in that order: owned, locked, poor.

Consumables:

- `createStock([{ id, name, price, start?, max? }])`: returns a `Stock`. Amounts must be whole numbers of 0 or more; others throw a `RangeError`.
- `stock.list()`, `stock.get(id)` (throws for unknown ids).
- `stock.count(id)`, `stock.has(id, n = 1)`, `stock.price(id, n = 1)`.
- `stock.add(id, n = 1)`: adds units capped at `max`; returns the new count.
- `stock.use(id, n = 1)`: returns false and changes nothing when there aren't enough.
- `stock.buy(id, wallet, n = 1)`: `{ ok: true }` or `{ ok: false, reason: 'poor' | 'full' }`.
- `stock.store` (`{ counts }`), `stock.subscribe(listener)`.
- `useStockCount(stock, id)`: React hook returning one count.
- Types: `Transaction`, `WalletState`, `Wallet`, `UpgradeDef`, `BuyFailure`, `BuyResult`, `ShopState`, `Shop`, `StockItemDef`, `StockState`, `StockBuyResult`, `Stock`.

```ts
const shop = createShop(UPGRADES, wallet)
const result = shop.buy('screws')
if (result.ok) chores.add({ id: 'screw-in', label: shop.get('screws').newChore })
else if (result.reason === 'poor') toast('Not enough coins', 'bad')

if (!stock.use('nails')) toast('Out of nails', 'bad')
```

## settings

Player settings, in memory only.

- `settings`: the store. `{ sound, volume (0 to 1), sensitivity (0.5 to 2), assist, reducedMotion }`. `reducedMotion` starts from the OS preference.
- `useSettings(selector)`: React hook.
- `ASSIST_JOLT_SCALE`: 0.6. `JoltMeter` multiplies readings by it in Assist Mode, unless it gets its own `assistScale`.
- `SettingsPanel` (in the UI kit) edits them.
- Types: `Settings`.

`sfx` follows `sound` and `volume`, including loops already playing. `JoltMeter` reads `sensitivity` and `assist`. `TiltAxis` scales tilt and pointer steering by `sensitivity`. `boilSeed` and the CSS animations read `reducedMotion`. Read `settings.get().reducedMotion` before screen shake.

## lifecycle

- `startSession()`: keeps the screen on until `endSession`, and re-enables leave warnings. `StartScreen` calls it on the start tap.
- `endSession()`: lets the screen sleep again and silences every leave warning, since nothing is left to lose. `EndingScreen` calls it when it opens.
- `restartGame()`: `endSession()`, then reloads the page. Nothing is saved, so this is a full restart with no leave prompt.
- `useWakeLock(active)`: keeps the screen on while `active`, using the Screen Wake Lock API. Takes the lock again when the tab becomes visible. Does nothing where unsupported.
- `holdWakeLock()`: non-hook form. Returns a release function; holds stack.
- `useLeaveWarning(active)`: asks before the tab closes or reloads while `active` and the session hasn't ended. Desktop browsers show their own wording; phone browsers often skip it.
- `LEAVE_MESSAGE`: "Leave and lose everything?".

## canvas

Viewport sizing and the game loop.

- `useGameCanvas({ width, height, mode = 'contain', maxDpr = 2, alignY = 'center' })`: returns `{ canvasRef, viewport }`. `alignY: 'end'` puts all spare height above the design instead of splitting it. Pass `canvasRef` to `GameLayout` or a `<canvas>`. Options are read once.
- `Viewport`: sizes the canvas to its CSS box times the device pixel ratio (capped at `maxDpr`), and fits the logical design inside, centred. It re-measures on resize (ResizeObserver), window resize and orientation change.
  - `viewport.attach(canvas)`: starts tracking a canvas and returns a stop function. `useGameCanvas` calls it for you.
  - `viewport.resize()`: re-measures now. It runs by itself on resize events.
  - `viewport.ctx`: the 2D context. Throws until a canvas is attached, so read it inside effects.
  - `viewport.begin(background = palette.paper)`: clears the whole canvas, applies the logical transform, returns `ctx`. Call it at the start of `render`.
  - `viewport.apply(ctx?)`: applies only the logical transform, and tells the sketch helpers the scale.
  - `viewport.toLogical(clientX, clientY, out?)`: converts client coordinates to logical units. Pass a reused `out` to avoid allocating.
  - `viewport.view`: `{ x, y, width, height }`, the visible area in logical units. Larger than the design in contain mode (draw backgrounds across it), smaller in cover mode.
  - `viewport.designRect()`: the design area in canvas pixels, for replay crops. It allocates, so cache it in `onResize`.
  - `viewport.onResize(listener)`: returns an unsubscribe function.
  - Fields: `width`, `height`, `mode`, `maxDpr`, `scale`, `offsetX`, `offsetY`, `dpr`, `cssWidth`, `cssHeight`, `canvas`.
- `fitDesign(boxW, boxH, width, height, mode, alignY = 'center')`: the pure fit maths, returns `{ scale, offsetX, offsetY }`.
- `startLoop({ update(dtMs), render(alpha, timeMs) }, { stepMs = 1000 / 60, maxFrameMs = 100 })`: runs `update` at a fixed 60 Hz and `render` once per animation frame. Frame time is clamped to `maxFrameMs`, so a tab returning from the background runs at most 6 steps. Returns `stop`.
- `FixedStepper`: the accumulator behind `startLoop`, exported for tests.
- Types: `Point` (`{ x, y }`), `FitMode`, `Fit`, `ViewportOptions`, `LoopHandlers`, `LoopOptions`, `LoopDevApi`.

`timeMs` in `render` is the loop's simulated clock: it advances by `stepMs` with every update. Use it for animation, `boilSeed` and replay capture, not for real-time waits.

In dev builds `startLoop` publishes `window.__game.loop`. Automation calls `loop.step(n)` to run `n` updates, rendering after each one, so physics and replays advance even when the browser throttles animation frames. `loop.timeMs` reads the simulated clock.

## layer

- `new CachedLayer(viewport, paint, rect?)`: draws static art once into an off-screen canvas at the viewport's resolution. `paint(ctx)` draws in logical units. `rect` is the logical area to keep; it defaults to the whole design.
  - `layer.draw(ctx)`: draws it as one image at its rectangle. Call it with the logical transform applied.
  - `layer.stamp(ctx, x, y, angle = 0)`: draws it with its (0, 0) at (x, y), rotated. Centre `rect` on (0, 0) for stamps. It leaves the viewport transform applied.
  - `layer.drawAt(ctx, x, y, angle = 0)`: the same, but in whatever units `ctx` is set to, such as a zoomed world camera or another canvas. It keeps the current transform. Unrotated calls draw one image with no save and restore, so stamping 120 nails costs about half as much.
  - `layer.invalidate()`: repaints on the next draw, for example after a wall section locks.
  - `layer.dispose()`: stops following resizes and frees the canvas.
- It repaints by itself when the viewport's scale or pixel ratio changes.
- Types: `LayerRect` (`{ x, y, width, height }`).

```ts
const lockedWall = new CachedLayer(viewport, ctx => drawLockedSections(ctx))
const bean = new CachedLayer(viewport, drawBean, { x: -9, y: -6, width: 18, height: 12 })
// in render:
lockedWall.draw(ctx)
for (const b of spilled) bean.stamp(ctx, b.x, b.y, b.angle)
```

Use it for locked wall sections, backgrounds, and props repeated many times, such as up to 200 spilled beans.

## input

Separate pieces for each input, plus a controls layer that turns touch, tilt, mouse and keyboard into the same game actions. The rule for every action: phones use touch and tilt, desktops use mouse and keys, and each action works on both.

### PointerTracker

`new PointerTracker(element, { toLogical?, smoothingMs = 40, handoff = true })` tracks pointers with Pointer Events. It sets `touch-action: none`, captures pointers, blocks the context menu, and ends every pointer on window blur.

The primary pointer is the first one down. When it lifts while other fingers stay down, the oldest remaining finger takes over: it fires `onPress`, moves `x`/`y` to that finger and resets velocity, so walking with a held thumb keeps working when you swap thumbs. With `handoff: false`, a finger already down never becomes primary, and only a fresh press does.

- `onPress(fn)`, `onDrag(fn)`, `onRelease(fn)`: the primary pointer only. `onPress` fires when a press starts or a finger takes over. `onDrag` fires when it moves while pressed. `onRelease` fires once per `onPress`. Feed gestures and hold meters from these, so a resting thumb or a second finger can't add fake strokes or hits.
- `onDown(fn)`, `onMove(fn)`, `onUp(fn)`: every pointer, including second fingers. `onMove` also reports a hovering mouse.
- Listeners get `fn(pointer, event)`. Pointer objects are reused; copy values you keep. Pass `event.timeStamp` to gestures.
- `x`, `y`: primary pointer position in logical units. Also follows a hovering mouse.
- `isDown`, `downAt` (`performance.now()` time the current press started), `holdMs`.
- `vx`, `vy`, `speed`: smoothed velocity in logical units per second. Starts decaying to 0 once the pointer has been still for 50 ms.
- `lastType`: `'mouse'`, `'pen'` or `'touch'` from the latest press or mouse hover, or `''` before any input. `prefersMotion` reads it.
- `pointers`: `Map` of active `TrackedPointer` `{ id, type, x, y, startX, startY, downAt }`. `count` is its size.
- `pinch`: `{ active, distance, startDistance, scale, centerX, centerY, ax, ay, bx, by }` for the two oldest fingers. The scale restarts only when that pair changes, not when a third finger lands.
- `dispose()`.
- `isTouchDevice()`: true when the main input is a finger (`(hover: none) and (pointer: coarse)`).
- Types: `TrackedPointer`, `Pinch`, `PointerTrackerOptions`, `PointerListener`.

### Keyboard

`new Keyboard(target = window)` tracks keys by `KeyboardEvent.code` (`'KeyW'`, `'ArrowUp'`, `'Space'`). It ignores:

- keys typed into form fields;
- Space and Enter while a button or link has focus, because they press it;
- new presses while a dialog is open.

When the window loses focus or a dialog opens, it releases every held key and runs its release listeners. A charge or walk can't stick, and the next tap starts fresh.

- `isDown(code)`, `anyDown(codes)`.
- `axis(negativeCodes, positiveCodes)`: -1, 0 or 1. For smooth steering use `TiltAxis`.
- `onPress(codes, fn)`: on key down, not on auto-repeat. `onRelease(codes, fn)`: on key up or a forced release. Both return unsubscribe functions.
- `dispose()`.

```ts
const keys = new Keyboard()
keys.onPress('Space', () => hammer.start())
keys.onRelease('Space', () => hit(hammer.release()))
```

### Blocking Game Input

- `blockGameInput()`: stops game keys and releases held ones until the returned function runs. `Modal`, `EndingScreen` and `useDialog` call it while open.
- `isGameInputBlocked()`: true while any dialog blocks input.

### Gestures

Feed them from `onPress` and `onDrag`, and call `end()` from `onRelease`.

- `CircleGesture({ center?, minRadius = 12, centerWindowMs = 1200, onCircle? })`: counts full circles for stirring, cranking and screwing.
  - `add(x, y, timeMs)`: returns circles completed by this sample (0 or 1). Pass the event's `timeStamp`.
  - `circles`, `direction` (1 clockwise on screen, -1 anticlockwise), `radius`, `turn` (radians into the current circle), `progress` (0 to 1).
  - `evenness`: mean over completed circles, 0 to 1. `lastEvenness` is the latest circle. Turns count around `center`, but evenness is scored around the circle actually drawn. Each circle scores 1 minus penalties for radius spread and speed spread, with speed averaged over 80 ms.
  - Measured on generated circles of radius 80: perfect circles score 1.00, even 30 units off the given centre. Timestamp noise of ±6 ms scores 0.97. A 5% radius wobble with a 10% speed wobble scores 0.90. 15% and 30% wobble scores 0.73; 30% and 30% scores 0.59.
  - `center`: fixed when you pass one, otherwise the middle of the points drawn in the last `centerWindowMs`. Auto-centring needs about one circle to lock on, so the first circle may not count. Pass `center` when the game knows it (pot, crank axle, screw head).
  - `onCircle({ direction, radius, evenness })`, `end()`, `reset()`.
- `RubGesture({ minAmplitude = 40, reverseDistance?, onStroke? })`: counts back-and-forth strokes in any direction. Each one-way stroke counts once, so back and forth is 2. The stroke in progress counts when the pointer lifts, so short separate swipes count too.
  - `add(x, y)`: returns 1 when it completed a stroke.
  - `end()`: counts the stroke in progress if it is at least `minAmplitude` long. Returns 1 when it did.
  - `strokes`, `distance` (total path rubbed), `lastAmplitude`, `reset()`.
- `HoldCharge({ fillMs = 1000, oscillate = false, drainMs = 0 })`: press-and-hold meter from 0 to 1. Call `update(dtMs)` every step.
  - `start()`, `release()` (returns the level at release, or 0 when it wasn't holding), `level`, `holding`, `heldMs`, `reset()`.
  - `oscillate` swings 0 to 1 to 0 while held.
  - `drainMs = 0` drops to 0 on release (hammer). Above 0, the level drains over that time and the next press continues from it (boiling heat).
- Types: `CircleInfo`, `CircleGestureOptions`, `RubGestureOptions`, `HoldChargeOptions`.

```ts
const stir = new CircleGesture({ center: { x: 300, y: 420 } })
pointer.onPress((p, e) => stir.add(p.x, p.y, e.timeStamp))
pointer.onDrag((p, e) => stir.add(p.x, p.y, e.timeStamp))
pointer.onRelease(() => stir.end())
if (stir.circles >= 50) finishStirring(stir.evenness)

const hammer = new HoldCharge({ fillMs: 900 })
pointer.onPress(() => hammer.start())
pointer.onRelease(() => hit(hammer.release()))
```

### Motion

- `requestMotionPermission()`: resolves to `'granted' | 'denied' | 'unsupported'`. On iOS it shows the system prompt and must run inside a tap handler; `StartScreen` does this when `motion` is set. Elsewhere it resolves at once. Sensors need HTTPS, except on localhost.
- `screenTilt(beta, gamma, angle, out)`: maps device angles to screen axes for a screen rotation. Exported for tests.
- `createMotion({ peakWindowMs = 500, smoothing = 10, highPass = 1.5 })`: starts listening and returns a `Motion`:
  - `available`: true once real sensor data arrives. Some laptops and 2-in-1s send data too, so choose the input with `prefersMotion`.
  - `tiltX`: degrees from the calibrated pose; positive when the screen's right edge dips (gamma in portrait).
  - `tiltY`: degrees from the calibrated pose; positive when the screen's top edge rises (beta in portrait). Both follow screen rotation.
  - `jolt`: smoothed high-passed acceleration in m/s². About 0.1 at rest, 2 to 5 for a jolt.
  - `peakJolt`: highest unsmoothed jolt in the last `peakWindowMs`.
  - `calibrate()`: treats the current pose as level. `dispose()`.
- Types: `MotionPermission`, `MotionOptions`, `Motion`.

### Controls

The standard way to meet the desktop-fallback rule. Each helper picks the input the player is actually using.

- `prefersMotion(motion, pointer)`: true when sensors are sending data and the player uses a finger. Mouse or pen input means pointer and keys instead. Before any pointer input it follows `isTouchDevice()`.
- `isHeld(pointer, keys, codes)`: true while the primary pointer is pressed or any of `codes` is held. Use it for "hold a thumb down or W to walk".
- `new TiltAxis({ motion?, keys?, pointer?, negativeKeys = ['KeyA', 'ArrowLeft'], positiveKeys = ['KeyD', 'ArrowRight'], maxDegrees = 30, deadZoneDegrees = 1.5, rampMs = 300, pointerRange? })`: one left-right control from -1 to 1.
  - `update(dtMs)`: reads the inputs once per step and returns `value`.
  - Held keys win and ramp to full over `rampMs`, then ease back after release. Otherwise calibrated device tilt drives it when `prefersMotion` is true. Otherwise the pointer's horizontal offset from `originX` does, over `pointerRange` units: a mouse while hovering, a finger while touching.
  - Sensitivity scales tilt and pointer readings. Keys always reach exactly 1.
  - `value`, `source` (`'motion' | 'keys' | 'pointer' | 'none'`), `originX` (move it with the thing being steered).
- Types: `TiltAxisOptions`, `TiltSource`, `PointerInput`, `KeyInput`, `MotionInput` (the parts of each input the helpers read, so tests can pass plain objects).

```ts
const level = new TiltAxis({ motion, keys, pointer, pointerRange: 150 })
// in update:
level.originX = tray.x
tray.angle += level.update(dt) * 0.04
const walking = isHeld(pointer, keys, ['KeyW', 'ArrowUp'])
```

### JoltMeter

`new JoltMeter({ limit = 1, motionRef = 4, pointerRef = 6000, rise = 25, fall = 3, assistScale = ASSIST_JOLT_SCALE })` is a steadiness meter fed by either source. Feed it once per update step. Sensitivity and Assist Mode scale every reading. Pass `assistScale` when a game wants a gentler or stronger Assist Mode than 0.6.

- `feedMotion(joltMs2, dtMs)`: device jolt; `motionRef` m/s² reads as level 1.
- `feedPointer(vx, vy, dtMs)`: pointer velocity; it reads the change in velocity, so smooth movement stays calm. `pointerRef` units/s² reads as level 1. The first reading after any other feed only sets the baseline, so a new press never starts with a spike.
- `feed(raw, dtMs)`: any reading where 1 means "at the default limit". Feed 0 when idle so the level falls.
- `level` (can pass 1), `limit`, `over` (`level >= limit`), `fraction` (`level / limit`).
- `resetPointer()`: only needed if you skip feeding between presses. `reset()`.
- Types: `JoltMeterOptions`.

```ts
if (prefersMotion(motion, pointer)) steady.feedMotion(motion.jolt, dt)
else if (pointer.isDown) steady.feedPointer(pointer.vx, pointer.vy, dt)
else steady.feed(0, dt)
if (steady.over) drainSieve()
```

## audio

Synthesised comedy sounds. No audio files, one shared AudioContext.

- `sfx.unlock()`: creates or resumes the audio context. Call it from the first tap; `StartScreen` does. Sounds before unlock are skipped. After that, any tap or key press on the page resumes audio that the phone suspended, such as after a call.
- `sfx.unlocked`: true once `unlock` has run, so a game can log only the sounds that really play.
- `sfx.play(name, { volume = 1, pitch = 1 })`: plays a one-shot if sound is on. `volume` multiplies the settings volume; `pitch` multiplies every frequency. The same sound can't restart within 30 ms, so bursts don't stack.
- `sfx.loop(name, { volume = 1, pitch = 1 })`: starts a looping sound and returns a `LoopHandle`. Start it once when the action starts and keep the handle. It fades in over 80 ms and follows the sound and volume settings while playing. Before `unlock` it returns a handle that does nothing.
  - `handle.setVolume(volume)`: 0 to 1, with a 30 ms glide. Use it for pour strength or truck distance.
  - `handle.stop(fadeMs = 150)`: fades out and stops. Calling it again does nothing.
- `SFX_NAMES`: `click`, `coin`, `splat`, `squish`, `thud`, `hammer`, `pop`, `whoosh`, `fail` (sad trombone), `ding`, `tick`, `slosh`, `drip`, `splash`, `buzz` (fly), `bell` (bicycle), `slam` (door), `rumble` (truck), `meow`, `bark`, `coo` (pigeon), `sneeze`, `ring` (phone), `pour`, `scrub`, `rattle`, `crank`, `wind`, `boing` (cartoon spring, a nail bouncing out), `alarm` (smoke alarm, three beeps), `snip` (scissors), `laugh` (a smug "heh heh heh"), `stomp` (a heavy footstep upstairs), `creak` (old wood), `doorbell` (ding-dong), `stripe` (a soft rising chime).
- `LOOP_NAMES`: `pour`, `boil`, `wind`, `rain`, `rumble` (truck engine).
- `vibrate(pattern)`: `navigator.vibrate` where supported, otherwise nothing. iPhones never vibrate from the web.
- `Button` plays `click` on press unless `sound={false}`.
- Types: `SfxName`, `LoopName`, `PlayOptions`, `LoopHandle`.

```ts
sfx.play('splat', { pitch: randRange(0.9, 1.1) })
const pouring = sfx.loop('pour')
pouring.setVolume(flow)
pouring.stop()
```

## sketch

Scrappy felt-tip drawing on canvas 2D. Shapes are deterministic per `seed`, so they don't flicker. Drawing reuses scratch buffers and allocates nothing per point; hoist constant style objects out of the render loop.

The defaults look like quick marker doodles:

- Lines wobble up to 3 units.
- Each shape gets two strokes, the second thinner and offset, so line thickness varies.
- Straight edges overshoot their corners, so corners cross.
- Closed curves run past their start, so circles overlap where the pen began.
- Fills slip 2 to 4 units outside the outline.

`wobble: 0` draws clean shapes. On a screen smaller than the design, stroke widths grow so a line is never thinner than its width in CSS pixels. A 3-unit line stays at least 3 px on a phone.

`SketchStyle` options, all optional:

- `color` (stroke, default `palette.ink`), `width` (default 3; 0 skips the outline), `alpha`.
- `wobble`: largest wobble in logical units (default 3). It also sets the corner overshoot and the fill offset.
- `seed`: picks the wobble pattern (default 1).
- `passes`: 1 or 2 strokes (default 2).
- `fill`, `fillStyle: 'solid' | 'hatch'`, `hatchGap` (default 8), `hatchAngle` (radians, default -0.8).

Functions (all take `ctx` first):

- `sketchLine(ctx, x1, y1, x2, y2, style?)`.
- `sketchArrow(ctx, x1, y1, x2, y2, style & { head? })`: `head` is the arrowhead length (default 18).
- `sketchRect(ctx, x, y, w, h, style?)`, `sketchRoundRect(ctx, x, y, w, h, r, style?)`.
- `sketchEllipse(ctx, cx, cy, rx, ry, style?)`, `sketchCircle(ctx, cx, cy, r, style?)`.
- `sketchPolygon(ctx, points, style?, count?)`: closed shape with straight wobbly edges.
- `sketchPath(ctx, points, style & { closed?, smooth? }, count?)`: straight edges, or a smooth curve with `smooth`.
- `sketchBlob(ctx, points, style?, count?)`: smooth closed outline through the points, for jelly pieces and puddles. `count` draws only the first `count` points of a larger buffer.
- `blobPoints(cx, cy, radius, count, seed, irregularity = 0.25, out?)`: builds an irregular round outline as flat points, for splats and puddles.
- `sketchText(ctx, text, x, y, { font: 'hand' | 'marker', size = 24, color, align = 'center', baseline = 'middle', rotate, tilt, seed, outline, alpha, maxWidth })`: `rotate` is fixed radians; `tilt` adds a seeded random rotation up to that many radians; `outline` draws a thick stroke behind the text.
- `boilSeed(timeMs, fps = 6)`: a seed that changes `fps` times per second, for an intentional line boil. Add it to a shape's seed. Returns 0 when reduced motion is on.
- `setSketchScale(ctx, cssPixelsPerUnit)`: tells the helpers the scale of `ctx`. `Viewport.apply` and `CachedLayer` call it; call it only for your own scaled canvases.
- `loadSketchFonts()`: resolves once Patrick Hand and Permanent Marker are ready for canvas text. Call it before drawing share cards.
- `FONT_HAND`, `FONT_MARKER`: CSS font stacks.
- `palette`: `paper`, `paperDark`, `ink`, `inkSoft`, `red`, `orange`, `yellow`, `green`, `blue`, `water`, `purple`, `pink`, `brown`, `jelly`. They match the Tailwind colours. Red, green and blue reach 4.5:1 contrast with white and with paper.
- Types: `SketchStyle`, `SketchTextStyle`, `FlatPoints`, `PaletteColor`.

```ts
const JELLY: SketchStyle = { fill: 'rgba(255, 107, 107, 0.85)', color: palette.red }
// in render:
let seed = block.id
for (const piece of block.body.outline()) {
  JELLY.seed = seed++ + boilSeed(timeMs)
  sketchBlob(ctx, piece.points, JELLY, piece.count)
}
sketchRect(ctx, 20, 600, 200, 40, { fill: palette.brown, fillStyle: 'hatch' })
```

## physics

Matter.js helpers. Import Matter itself with `import Matter from 'matter-js'`.

- `createPhysics({ gravity = 1, positionIterations = 8, velocityIterations = 6, constraintIterations = 4, enableSleeping = false })`: returns a `Matter.Engine`.
- `stepPhysics(engine, dtMs, maxSteps = 4)`: advances in steps of at most 1/60 s and drops time beyond `maxSteps` steps. Call it from `update`.
- `softBody({ x, y, cols, rows, spacing, particleRadius, stiffness = 0.1, damping = 0.05, collisionFilter?, label?, particle? })`: a grid of circles joined by structural and shear springs, centred on (x, y). Add `composite` to the world yourself. Returns a `SoftBody`:
  - `composite`, `particles[row][col]`, `bodies`, `constraints` (springs still attached; tear them with `tear` or `tearNear`, not by editing the list).
  - `outline(inflate = particleRadius)`: writes and returns one `SoftBodyPiece` per connected piece. After tears, each piece the springs still hold together gets its own outline, and a loose particle is a round drop. Each piece has `points` (flat, clockwise, pushed out by `inflate`), `count`, `particles` and `centerX`/`centerY`. Pieces and buffers are reused and only rebuilt after springs tear.
  - `center(out?)`: average particle position.
  - `setStiffness(k)`, `tear(constraint)`, `tearNear(x, y, radius)` (returns how many springs tore), `integrity()` (fraction of springs left, 0 to 1).
- `pinToWorld(body, point, stiffness = 0.9, length = 0)`: a constraint pinning a body to a world point, like a nail. Add it to the world, or to the soft body's composite, yourself. Remove it to pull the nail.
- `drawPhysicsDebug(ctx, engine)`: plain outlines of every body and constraint, for `?debug`. It allocates, so keep it behind the flag.
- Types: `PhysicsOptions`, `SoftBodyOptions`, `SoftBody`, `SoftBodyPiece`.

Stiffness, measured on a 6 x 5 block (spacing 26) hanging 16s from its two top corners: 0.01 stretches 43%, 0.02 stretches 24%, 0.04 stretches 13%, 0.05 stretches 10%, 0.1 stretches 5%, and 0.3 stretches 2%. Bigger blocks and fewer constraint iterations stretch more.

A block's particles collide with each other when `2 * particleRadius < spacing`, so a hard landing can't fold the grid through itself. Dropped from 350 to 600 units onto a floor, a 6 x 5 block at stiffness 0.04 keeps 95% of its area. When particles overlap at rest, they skip each other instead. Pass your own `collisionFilter.group` to override either choice.

Phone budget: 4 x 4 to 6 x 6 particles per block, about 300 bodies moving at once. Turn locked or settled blocks into a `CachedLayer` instead of simulating them.

```ts
const jelly = softBody({ x: 300, y: 250, cols: 6, rows: 5, spacing: 26, particleRadius: 11, stiffness: 0.04 })
const top = jelly.particles[0]!
const nails = [pinToWorld(top[0]!, top[0]!.position), pinToWorld(top[5]!, top[5]!.position)]
Matter.Composite.add(engine.world, [jelly.composite, ...nails])
```

## replay

Fail replays from the last few seconds of the canvas.

- `new ReplayRecorder({ seconds = 3, fps = 30, width, height, stillSize = 960 })`: a ring of small canvases, created on first use and reused.
  - `capture(sourceCanvas, crop?, timeMs?)`: copies a frame if one is due at the recorder's fps; returns true when it captured. The image is scaled to fit (letterboxed). Pass `viewport.designRect()` as `crop` to record only the design area; cache it in `viewport.onResize` instead of creating it every frame. Pass the render `timeMs` from `startLoop`, so dev steps record frames too.
  - `clip(seconds?)`: hands over the last frames as a `ReplayClip` without copying them, and starts a fresh recording. Returns null when nothing was recorded. A clip stays valid until the next `clip()` call, which records over its frames.
  - `frameCount`, `reset()`.
- `ReplayClip`: `{ frames, still, fps, width, height, durationMs }`. `still` is a sharp copy of the source (cropped like the frames) at the moment of the clip, up to `stillSize` pixels on its longest side. Use it as the share card picture.
- `clipFrame(clip, t = 1)`: picks a frame by position (0 first, 1 last).
- `ReplayPlayer`: `<ReplayPlayer clip label="Held for 0.4s" speed={0.25} loop onDone badge className />`. Plays in slow motion with a big caption and a "Slow-mo" badge; `badge={false}` hides the badge for small players.
- Types: `ReplayOptions`, `ReplayClip`, `CropRect`, `ReplayPlayerProps`.

Memory: each frame is width x height x 4 bytes. 240 x 320 at 24 fps for 3s is 72 frames, about 22 MB. A clip takes the recorded frames instead of copying them, and recording continues in a second set. So a whole session uses at most two sets (about 44 MB) plus two stills (about 2.7 MB each at 720 x 960), however many fails happen. Taking a clip costs one still copy.

```ts
// in render, after drawing:
recorder.capture(viewport.ctx.canvas, crop, timeMs)
// on a fail:
const clip = recorder.clip()
if (clip) setReplay({ clip, label: `Held for ${held.toFixed(1)}s` })
// share card picture:
const image = clip.still ?? clipFrame(clip)
```

## share

- `renderShareCard({ game, title, stats, image?, footer?, seed? })`: draws a 1080 x 1350 card in the scrappy style and returns the canvas. Up to 4 stats `{ label, value }`. Load fonts first with `loadSketchFonts`.
- `shareCard(card, text)`: `card` is a `ShareCardInput`, a canvas, or a `File`. Opens the share sheet with the image where files can be shared, otherwise downloads the PNG. Resolves to `'shared' | 'downloaded' | 'cancelled'`. Safari only allows sharing straight after a tap, so pass a ready `File` from a click handler. `ShareModal` handles this.
- `canvasToFile(canvas, fileName?)`, `downloadFile(file)`, `cardFileName(game)`: the building blocks.
- `encodeAndFree(canvas, fileName?)`: encodes a PNG, then shrinks the canvas to 0 x 0 so its memory is freed at once. A 1080 x 1350 card holds 5.8 MB, and iPhone Safari caps total canvas memory. `shareCard` and `ShareModal` use it for the cards they draw.
- `SHARE_CARD_WIDTH`, `SHARE_CARD_HEIGHT`.
- Types: `ShareCardInput`, `ShareStat`, `ShareResult`.

## ui

React components styled with Tailwind. Every control has a touch target of at least 48 px, hand-drawn borders and the marker and hand fonts. `className` props are appended with `cn`, which doesn't resolve conflicts, so don't pass a utility that fights the component's own (for example `hidden` against `inline-flex`). Wrap the component instead.

Pointer events: the `GameLayout` overlay lets touches and clicks through to the canvas. Only controls take them back: `Button`, `Panel`, `Modal`, `StartScreen` and `EndingScreen`. Display-only pieces (`Meter`, `LiveText`, `TimerChip`, `CoinBadge`) let input through, so a thumb on the steadiness meter still reaches the game. Add `pointer-events-auto` to any other interactive HUD element.

Focus: after a mouse or touch click, `Button` and `ChoreList` buttons outside dialogs drop focus. A later Space or Enter then reaches the game instead of pressing the button again. Keyboard clicks keep focus.

- `cn(...classes)`: joins class names, skipping falsy values.
- `GameLayout`: `<GameLayout canvasRef dev={actions} className>{hud}</GameLayout>`. A full-viewport canvas with an overlay on top, inset by `env(safe-area-inset-*)`, no page scroll. It also mounts the `Toaster` and the `DevPanel`, and mirrors Reduced Motion onto `<html data-reduced-motion>`.
- `Button`: `variant: 'primary' | 'ghost' | 'danger'`, `size: 'md' | 'lg'`, `sound = true`. Press wobble, disabled styles, visible focus ring. Defaults to `type="button"`.
- `Panel`: paper card with an optional marker `title`. Accepts `ref` and every `<section>` prop.
- `Modal`: `<Modal open onClose title footer dismissible className>`. Portals to `<body>`, moves focus inside, keeps Tab inside, makes the page behind inert, blocks game keys, closes on Escape (the newest dialog only) or a backdrop tap, and returns focus on close.
- `useDialog(open, dialogRef, onEscape?)`: the dialog behaviour behind `Modal` and `EndingScreen`, for your own full-screen dialogs. Returns a `keydown` handler that keeps Tab inside; put it on the dialog element. Portal the dialog into `<body>`. Focus moves to the first control without scrolling, so a dialog taller than the screen opens at its title.
- `toast(message, kind = 'info', durationMs = 2600)`: `kind` is `'info' | 'good' | 'bad' | 'coin'`. Each kind has its own background and text colour at 4.5:1 contrast or more. Needs a `Toaster`; `GameLayout` mounts one. Toasts show above dialogs and stay announced while one is open.
- `CoinBadge`: `<CoinBadge wallet className />`. Coin count with a floating "+5" or "-3" after each transaction. `CoinIcon` is the drawn coin on its own.
- `TimerChip`: `<TimerChip timer label? doneLabel="Ready!" onDone? className />`. Countdown with a progress bar, updated 4 times a second. `onDone` fires once when the timer finishes while shown, not when mounting a finished timer.
- `Meter`: `<Meter label value | read max zones limit mode="fill" | "needle" hideLabel className />`. Pass `read={() => x.level}` for fast values: it updates every frame without re-rendering React. `zones` are `{ from, to, className? }` bands, such as a green zone; `limit` draws a red line. `hideLabel` hides the visible label but keeps it as the accessible name.
- `LiveText`: `<LiveText read={() => text} className />`. Text updated every frame without re-rendering React.
- `ChoreList`: `<ChoreList board title? emptyText? onSelect? className />`. Lists open chores; `onSelect` makes each one a button.
- `ShopPanel`: `<ShopPanel shop stock? onBuy? onBuyStock? unavailable? title="Shop" compact? className />`. Each upgrade shows what it helps, the chore it adds, and a buy button that explains why it's disabled (owned, needs another upgrade, or how many coins short). `onBuy(upgrade)` runs after a purchase; add the chore there. `unavailable(upgrade)` returns why an upgrade you don't own can't help any more, such as "The park's behind you.", or null; that row shows the reason and its button reads Unavailable. `stock` adds a Supplies list with Buy 1 buttons. Rows spread into four columns on screens 640 px and wider; `compact` keeps each row stacked (name and button over its lines) at every width, for narrow containers such as a `Modal`.
- `SettingsPanel`: `<SettingsPanel extra? assistHint? motionHint? controls? />`. Sound, volume, sensitivity, Assist Mode and Reduced Motion. Put it in a `Modal`. `assistHint` replaces the Assist Mode line ("Loosens steadiness limits for shaky hands.") with what Assist Mode changes in your game, and `motionHint` does the same for Reduced Motion. `controls` lists the ones to show (`'sound'`, `'volume'`, `'sensitivity'`, `'assist'`, `'reducedMotion'`); all five show by default.
- `StartScreen`: `<StartScreen title pitch story motion onStart buttonLabel="Tap to Start" className>{extra}</StartScreen>`. The tap unlocks audio, calls `startSession()`, asks for motion access when `motion` is set, and calls `onStart({ motion })` with the permission result. Children render under the button, such as a settings link.
- `EndingScreen`: `<EndingScreen title stats share={{ card, text, title? }} onRestart restartLabel="Play Again" className>{story}</EndingScreen>`. A dialog over the game that takes focus, makes the page behind inert and blocks game keys. Opening it calls `endSession()`. Restart defaults to `restartGame`, which reloads the page without the leave prompt. `share.title` heads the share dialog, which otherwise reads "Share Your Shame"; a winning ending can say something prouder.
- `ShareModal`: `<ShareModal open onClose card text title? />`. Draws the card once when it opens, previews it, and offers Share or Download.
- `ShareCardButton`: `<ShareCardButton card text label="Share" title? variant="primary" className />`. A button that opens a `ShareModal`, headed by `title` when given.
- Types: `SettingControl`, `ButtonVariant`, `ButtonProps`, `PanelProps`, `ModalProps`, `GameLayoutProps`, `MeterProps`, `MeterZone`, `TimerChipProps`, `ChoreListProps`, `ShopPanelProps`, `StartScreenProps`, `StartInfo` (`{ motion: MotionPermission }`), `EndingScreenProps`, `ShareModalProps`, `ShareCardButtonProps`, `ToastKind`, `ToastItem`.

```tsx
<GameLayout canvasRef={canvasRef} dev={[{ label: '+100 coins', run: () => wallet.earn(100, 'Dev') }]}>
  <CoinBadge wallet={wallet} className="absolute top-3 right-3" />
  {fridge && <TimerChip timer={fridge} onDone={() => sfx.play('ding')} />}
  <Meter label="Steadiness" read={() => steady.level} max={1.5} limit={1} className="absolute inset-x-4 bottom-4" />
</GameLayout>
```

## styles.css

The Tailwind v4 entry. The game's `src/index.css` is:

```css
@import './shared/styles.css';
@source '.';
```

It provides:

- Fonts: `font-hand` (Patrick Hand, body) and `font-marker` (Permanent Marker, titles), with Comic Sans fallbacks. Each game imports the font files in `main.tsx` through `@fontsource/patrick-hand` and `@fontsource/permanent-marker`.
- Colours: `paper`, `paper-dark`, `ink`, `ink-soft`, `jelly`, and `marker-red`, `marker-orange`, `marker-yellow`, `marker-green`, `marker-blue`, `marker-water`, `marker-purple`, `marker-pink`, `marker-brown`. Use them as `bg-paper`, `text-marker-red` and so on. White text on red, green or blue, and red, green or blue text on paper, all reach 4.5:1 contrast.
- `rounded-sketch` and `rounded-sketch-alt`: uneven radii for hand-drawn boxes.
- `animate-wobble`, `animate-pop-in`, `animate-float-up`.
- `game-layer`: no text selection, no long-press callout, no double-tap zoom. `GameLayout` applies it.
- `safe-inset`: padding from `env(safe-area-inset-*)`.
- Base styles: full-height `html`, `body` and `#root`, no page scroll or overscroll, a subtle paper background, and no animations or transitions when `<html data-reduced-motion="true">`.

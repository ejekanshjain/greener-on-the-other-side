# Greener on the Other Side: Design

A 2-player meme game that takes an idiom literally. It is built to start a petty feud between two friends and keep you both busy with chores. A match takes about 11 minutes.

## Decisions So Far

- **Players:** 2, each on their own phone or computer. Practice mode pits you against a scripted bot neighbour, so you can play alone.
- **Platform:** one web game built with Next.js. It runs in desktop browsers and phone browsers. There is no app store version.
- **Rooms:** you start a room and send a friend the link or the 6-character code. There is no matchmaking with strangers.
- **Realtime:** Pusher Channels is the only realtime service. The only server code is one tiny auth route that signs room joins.
- **Length:** about 11 minutes per match. A match is best of 3 rounds. Each round is 3 minutes of play plus a 20s reveal, or 30s after the last round.
- **Money:** free. No ads, no tip jar, no purchases.
- **No accounts:** no sign-up, no leaderboards, no public counters.
- **No saving:** nothing about a match is stored. Your browser remembers only your display name, a random player id and whether you've finished a match.
- **No shop:** no coins and no upgrades. Every round starts both lawns equal.
- **Art style:** hand-drawn, scrappy meme look.
- **Physics:** a small slide-and-arc step written for this game, with no physics library. Each browser simulates only its own garden.
- **Scale:** small, for Ekansh and a few friends. Pusher's free plan allows about 55 full matches a day (see Build Notes).

---

## The Game

**Pitch:** "Grow a better lawn than your neighbour in 3 minutes. Throw every weed, snail and gnome over the fence."

**Story:** you and your neighbour both entered Best Kept Garden. Brenda from Number 7 judges in 3 minutes. Over the fence, their lawn looks perfect. It always does.

### Goal

- Win 2 of 3 rounds. Each round lasts 3 minutes.
- When a round ends, Brenda scores both lawns by their true state. The better lawn wins the round.
- You can't touch your neighbour's lawn. You can only throw things onto it.

### Core Loop

1. Throw the 3 gnomes standing on your lawn over the fence.
2. Yank weeds and grab snails before they ruin a patch.
3. Flick them over the fence onto your neighbour's lawn.
4. Throw back whatever comes over from their side.
5. Between throws, mow stripes and water brown patches.
6. Turn the tap on and off, and empty the grass bag.
7. In the last 40s, throw the gnome crate and the heavy junk.
8. Watch Brenda peel the greener tint off both lawns.

### Your Garden

Your screen shows your own back garden, seen from your back door. Sizes below are in design units. The design is 680 units wide and 1,060 tall. From top to bottom:

- **The top bar (96):** the clock, both names, round wins, **Shake Fist** and the menu.
- **The peek strip (100):** the 4 rows of your neighbour's lawn nearest the fence, squashed with distance.
- **The fence (40):** tall and the full width of the garden. The weathervane sits on top.
- **Your lawn (640):** 12 columns by 16 rows, 192 patches. A patch is 50 wide and 40 deep, seen at a slant.
- **The patio (184):** the tap, the can, the mower and its grass bag, the compost bin, the shed and Biscuit's bed.

Hedges 40 units wide line both sides of the lawn. On a phone, nothing you can grab sits within 20 px of the screen's side edges, where the back swipe lives.

Your neighbour sees the same layout, with your lawn in their peek strip. Their left is your right.

Each patch tracks four things:

- **Health:** 0 (mud) to 7 (lush). Every patch starts the round at 5.
- **Length:** 0 to 3 (shaggy). Every patch starts at 2. Length 0 or 1 counts as short.
- **Mess:** slime, trampling, a landing scuff, clippings, a wilted weed, a scalp mark, drag ruts or a mud puddle. One mowing pass clears it.
- **Hole:** dug by your dog. A hole stays until the round ends.

Each patch dries by 1 health every 140s, or every 105s from 1:20 left. It grows 1 length every 75s, and mowing it restarts that timer. The timings are staggered per patch, so the lawn changes a patch at a time.

Health shows in lightness and texture as well as colour. A lush patch has dense blades. A dry one has sparse blades and cracks. Mud has a puddle. So red-green colour blindness never hides a dry patch.

### One Finger, Every Job

The game follows one finger at a time. A second finger does nothing. After you lift, the next job needs a fresh touch. So phone and mouse players play by the same rules.

Each press does one job until you let go. What sits under your finger picks the job, in this order:

1. Biscuit while he circles a patch, the tap or the grass bag.
2. A loose item, one falling over the fence, or one in Biscuit's mouth.
3. A rooted weed or a snail.
4. Grass. Move 12 px within the first 150 ms and you mow. Stay put and you water.

- Grab reach is 22 px from a finger and 10 px from a mouse pointer. A larger item uses its drawn size. The nearest target wins.
- The can tips during the 150 ms wait, so you see which job is starting.
- A pour turns into mowing once your finger moves faster than 200 px/s for 100 ms. Mowing never turns into watering.
- A press that moves faster than 1,000 px/s in its first 100 ms never mows. It grabs the nearest item within 44 px. With nothing in reach, it leaves a short grey dashed swish along your finger's path, with a puff of dust where it began, and does nothing else.

### Letting Go

One rule covers every release:

- Throw speed is the peak finger speed in the last 100 ms before you let go, in screen pixels per second. The direction comes from the same moment. Touch and mouse use the same rule.
- Let go at 400 px/s or faster, aimed within 60° of straight at the fence, and you throw. A throw inside that angle can still go wide into a hedge.
- Let go slower, or aimed further off, and you put the item down where it is.
- A press the phone cuts off, such as for an incoming call, always puts the item down.

### On Screen

- **Top bar:** "You", your rosettes, the clock, their rosettes, then their name. The clock sits in the middle and is the largest. Names shorten to 10 characters in the bar.
- **Their status:** **Away** shows beside their name. **Gone 0:42** replaces their rosettes while it applies.
- **Buttons:** the menu button sits at the left end of the top bar. **Shake Fist** sits at the right end, beside their name. Nothing you need to press sits under the top bar.
- **In the scene:** the water level shows on the can, and the fill shows on the grass bag. Arm tiredness is a ring around the item you hold.
- **Menu button:** Settings, How to Play, **Show Tips** or **Hide Tips**, and **Leave**. The menu reads "The round keeps going while this is open."
- **Tips:** a new player gets one-line tips through all of their first match, online or in Practice. Everyone gets the toasts. See Onboarding.
- **Phone sideways:** turning a phone sideways covers the game with "Turn your phone upright." The garden keeps running underneath. Desktop windows stay as they are.

### Mowing

- Press on grass and drag. Mow up and down a column, fence to patio, to cut the whole column in one pass. The mower appears 30 units above your finger, so you can see the blades. It rolls back to the patio when you let go.
- The mower is 1 patch wide. Each time it enters a patch, it cuts that patch to short: length 1, or 0 if it was already short. It restarts the patch's 75s growth timer.
- One pass stripes a column for 75s. Two passes hold it for 150s.
- A column shows a stripe once 14 of its 16 patches are short and clean. Clean means no mess, weed, hole, heap or item.
- A broken stripe comes back once you clear the column and mow it again. See Repairable Stripes.
- When one of your columns becomes a stripe, a light sweeps down it with a soft `ding`, and a white chalk tick appears on the patio's edge under it. When it loses its stripe, it flickers out and its tick turns into a red cross for 1s.
- When one press cuts 12 or more of a column's 16 patches and it still doesn't stripe, the patches that block it flash for 1s.
- Mow slowly. A press that moves faster than 1,000 px/s in its first 100 ms is a flick, and never mows.
- A cut patch shows short mow lines until it grows long again, so you can see your pass.
- Stripes alternate two shades by column on their own. Both look lighter and greener than unstriped grass at the same health, so a stripe never reads as dead grass.
- Mower speed is measured in screen pixels, like throws. From 1,000 px/s the mower shakes and sparks, as a warning. From 1,300 px/s it scalps: the patch loses 1 health and gets a scalp mark.
- Every cut adds 1 to the grass bag, which holds 96 cuts. A full bag reads "Full". It stops the mower, which spits clippings onto the patch under it.
- Mowing clears mess marks, including the scuffs your neighbour's throws leave. Mowing a clippings heap clears it a patch at a time, and each heap patch adds 6 cuts to your bag.

### Watering

- Press and hold still on grass. After 150 ms the can pours under your finger. Slide slowly to move the pour.
- The pour covers a circle 120 units across. Each patch under it gains 1 health every 0.4s.
- A full patch (7) sparkles. Pour on a sparkling patch for 1.5s more and it turns to mud: health 2, with a puddle. It splashes as it turns, with a `squish`.
- The can holds 10s of pouring.
- **The tap:** press it once and it runs. The can fills in 3s while you keep playing. Press it again to turn it off.
- Once the can is full, water spills over its rim while the tap runs.
- A tap left running for 8s floods the 2 patches nearest it to mud.
- Pouring takes the can back from the tap, but the tap keeps running.
- An empty can glugs and pours nothing. A toast says "The can's empty. Press the tap to fill it."

### Throwing

- Press on a weed, snail or piece of junk to grab it. A rooted weed needs a 60-unit pull before it comes out: drag it in any direction. While you drag, it leans toward your finger and a marker-yellow ring round it fills. When the ring is full, it pops out with a puff of dirt.
- A held item stays within 100 units of where you grabbed it. For a yanked weed, that's 100 units from its root. Your finger can keep moving, and the throw launches from that spot.
- Swipe toward the fence and let go. Swipe speed sets how far it flies, and swipe direction sets where.
- Swipe speed is measured in screen pixels, so phones and monitors feel the same. A throw flies 0.4 units per px/s, so 1,500 px/s flies 600 units. Speeds over 2,500 px/s add nothing.
- A throw must carry at least 15% of its distance past the fence. With no wind and a fresh arm, that means:
  - About 1,500 px/s from the back row.
  - About 650 px/s from the middle of the lawn.
  - The slowest throw (400 px/s) from the front 5 rows.
- A throw that reaches the fence without that 15% margin clips the top. It teeters there for 0.6s, on both screens, then drops back onto your front rows, across your stripes.
- Shorter throws drop on your lawn. Throws that go wide hit a hedge and drop back.
- A landing crushes the patch under it by 1 health and leaves a scuff mark. So a clipped throw costs you a stripe until you mow that column again.
- A throw long enough to cross their whole lawn bounces off their back wall onto their back row.
- Your hand needs 0.4s between throws.
- **Tired arm:** each throw fills the arm meter by 18%, or 45% for heavy junk. It drains 15% per second. Throws fly up to 40% shorter as it fills. A full meter means no throws for 1.5s.
- **Blocked throw:** a throw your hand or arm refuses drops the item with a puff. "Too soon" or "Arm's tired" shows beside it for 0.8s, and the arm ring flashes red.
- **Catch:** press on something falling over the fence to catch it before it touches your grass. Throw it straight back.

### Seeing Your Hits

- Your neighbour's screen reports each landing in its next lawn update, within 1s.
- A dust puff rises in your peek strip at that column, at the horizon if it landed further back. The thud sounds further away the deeper it landed.
- A gnome or heavy hit pops their head up over the fence.
- When their throw clips, you see it teeter on the fence top from your side too.
- Heavy junk on their lawn always shows on the peek strip's horizon at its column, however deep it lies.

### Chores

- **Turn the tap on and off:** the can fills in 3s, and a tap left running floods your patio rows.
- **Empty the grass bag:** every 96 cuts. Drag the bag onto the compost bin and hold it there for 1.5s. Or swipe the bag at the fence: their lawn gets a clippings heap that smothers 4 patches. Clip the fence and the heap bursts across your own front rows.
- **Watch the dog:** tap Biscuit while he circles a patch, or he digs a hole in it. When he barks at an item, throw it before he fetches it.
- **Re-mow:** grass grows back, and everything that lands leaves a mess mark. Mowing again restores the stripe.

### Things That Go Wrong

- **Weeds:** sprout on patches the round's seed picks. A rooted weed drains its patch by 1 health every 15s. Every 30s it spreads to a neighbouring patch. At most 40 weeds root at once. A new weed pops up through a small puff of dirt, whether it sprouts, spreads or grows from a seed.
- **Rooted weeds hold on:** a flick shorter than the 60-unit pull leaves the weed rooted. It shakes, with a small dirt puff.
- **Yanked weeds wilt:** a weed wilts 20s after you pull it, wherever it lies. A wilted weed becomes a mess mark that mowing clears. It never roots again.
- **Dandelions (rounds 2 and 3):** 1 weed in 4 is a dandelion. After 40s it turns into a seed clock. A seed clock bursts into 3 seeds wherever it touches the ground, and each seed roots as a weed after 10s. Yank one and drop it, and its seeds land around you. Throw it over the fence and it bursts on their side instead.
- **Snails:** crawl in from a hedge at 10 units/s and cross the lawn to the other hedge, where they leave. They slime every patch they cross and eat 1 health every 8s from the patch they sit on. At most 12 crawl in a garden.
  - A grabbed snail hides in its shell. A thrown snail comes out 3s after it lands and heads for the nearer hedge.
- **Loose things:** anything loose lying on a patch takes 1 health from it every 10s.
- **Biscuit, your dog:** helpful, in his own way.
  - **Digs:** from 2:20 left, every 40s to 60s, he circles a patch 3 times, growling, for 2s. Tap him in time and he sits for 10s. Miss it and the patch becomes a hole.
  - **Fetches:** from 2:20 left, he fetches any light item that lies untouched on your lawn for 3s. At 1.5s he barks and wags, as the warning, and trots over. Then he carries it straight back to your back row, proud, trampling up to 4 patches on the way.
  - He fetches at most once every 20s. Press the item in his mouth to take it back. Tapping Biscuit himself does nothing while he fetches.
- **Wind:** from 2:20 left, 6 gusts of 4s each round. Both gardens feel the same gust at the same moment. The weathervane on the fence swings 2s before a gust arrives.
  - Over-fence gusts take turns. Each of you gets 2 tailwinds per round, and 1 of them falls in the last 40s. A coin flip picks who gets the first.
  - A gust blowing over the fence toward your neighbour adds 30% to your throws and takes 30% off theirs.
  - A gust along the fence pushes throws up to 150 units sideways. A throw aimed near a hedge ends up in it. Along-fence gusts take turns left and right.
  - Gusts slide light things across the lawn: seed clocks, litter and snails in their shells. They also carry dandelion seeds over the fence.
- **The greener tint:** it lies to you on purpose. See below.

### The Last 40 Seconds

At 0:40 the shed door bangs open. A crate of 12 gnomes tips across the back half of your lawn, and the heavy junk rolls onto your patio. Your mower becomes throwable too.

| Junk | Footprint | When it lands on their lawn | Junk score |
|---|---|---|---|
| Garden gnomes, a crate of 12 | 1 patch each | Crushes its patch by 2 health | -1 each |
| Wheelie bin | 2 by 2 patches | Crushes each patch by 2; the lid flies open and 4 pieces of litter spill out | -4 |
| Your lawnmower | 2 by 2 patches | Crushes each patch by 2; it drives 4 patches in a crooked line, scalping each one | -4 |
| Trampoline | 3 by 3 patches | Crushes each patch by 2. Anything landing on it later bounces back the way it came, at 90% speed | -6 |

- The crate's gnomes count against you while they lie on your lawn. Get them over the fence.
- The crate's gnomes break stripes too. Throw them over, then mow those columns again before 0:00 to get the stripes back.
- Gnomes throw like weeds. The arm meter is all that stops you.
- The bin, the mower and the trampoline are heavy. Lift one first: press and hold it for 0.6s, then swipe. Up to 12 px of wobble still counts as holding.
- After a lift, only a throw works. Moving slowly sets it back down.
- Heavy junk flies 40% shorter than a weed for the same swipe.
- From the patio, heavy junk can't clear the fence. Drag it forward first: press it and slide without waiting. Dragging heavy junk flattens every patch it crosses by 1 health.
- Heavy junk sinks in where it lands, on either lawn. Nobody can lift it again.
- Heavy junk left on your own lawn at 0:00 counts against you.
- Throw your mower and you can't mow for the rest of the round.
- The trampoline cuts both ways. Throw it over, and your next gnome can bounce off it straight back onto your lawn.
- Anything still in the air at 0:00 freezes mid-air and doesn't count.

### The Greener Tint

Both screens lie in the same direction, so you both feel behind all round.

- Your own lawn is drawn 1 health level browner than it is, under a grey sky.
- Their lawn in the peek strip is drawn greener, and the lie grows each round:
  - **Round 1:** 2 levels greener, in sunshine, with a bird singing. The caption reads "Somehow greener."
  - **Round 2:** 3 levels greener, under a rainbow. The caption reads "Still greener."
  - **Round 3:** 4 levels greener, with a sprinkler running. The caption reads "Even greener. Somehow."
- Their junk looks 30% smaller, because it's further away.
- The sparkle on a full patch never lies. The brown tint tempts you to overwater, so the mud is your own fault.
- No score shows during the round.

### Brenda's Reveal

At 0:00 both screens freeze, and Brenda arrives with her clipboard. The reveal runs 20s on the shared clock, so both screens play it in step.

1. **0s to 2s:** "Time's up." The doorbell rings, and Brenda walks along the fence.
2. **2s to 8s:** both lawns appear side by side, top-down, tinted the way you saw them all round. Brenda drags her clipboard across them, and the tint peels off like cling film. She peels your lawn first and theirs last. In the best rounds, the lawn next door turns out to be mud under a trampoline and 14 gnomes.
3. **8s to 14s:** each lawn's score counts up: Green, Stripes, Tidy and Junk. Each line shows what Brenda counted, such as "11 gnomes" beside Junk (see Reveal Counts). Brenda gives one line per lawn.
4. **14s to 17s:** she pins a rosette on the winner's gate, and the round score updates.
5. **17s to 20s:** the next round's countdown.

After the last round, the reveal runs 30s. Steps 1 to 4 stay the same. From 17s to 30s, Brenda walks home (see Ending), then the match result shows.

Brenda picks her line from what she finds:

| She finds | She says |
|---|---|
| 10 or more gnomes | "I count `gnome_count` gnomes. Are they breeding?" |
| A trampoline | "Is that a trampoline?" |
| 20 or more mud patches | "Lovely mud." |
| 3 or more holes | "Something's been digging." |
| All 12 stripes | "Proper stripes. Suspicious." |
| Under 3 points between you | "Too close. I'm going with my gut." |
| Anything else, on the winner | "Neat edges. I approve." |
| Anything else, on the loser | "Could be greener." |

**Your own fault:** each screen counts the damage you did to your own lawn. It tracks 6 kinds:

- patches you drowned;
- patches you scalped;
- your fence clips;
- patches you flattened by dragging;
- your throws that bounced back;
- holes from Biscuit taps you missed.

Sometimes the loser's own damage is worth at least half the margin. Then Brenda names the biggest kind: "You lost by 4. You drowned 9 patches yourself." The same line shows under the loser's score.

### Scoring

Brenda scores each lawn from its true state. Both screens show the same numbers, because one screen does the counting (see Build Notes).

- **Green, 50 points:** average patch health, scaled so a lawn of all 7s scores 50.
- **Stripes, 30 points:** 2.5 points per striped column.
- **Tidy, 20 points:** start at 20. Lose 0.5 per weed, snail, piece of litter, clippings heap patch or hole. Tidy never drops below 0.
- **Junk, no limit:** lose 1 per gnome, 4 per wheelie bin or mower, and 6 per trampoline.

Only things on lawn patches count. Your patio doesn't. Each line rounds to whole points, halves rounding up, and the total adds them up. A total can drop below 0. A fresh lawn scores 53: Green 36, Stripes 0, Tidy 20, and Junk -3 for the 3 starting gnomes.

- **Tied round:** the greener lawn wins it. Equal Green too makes a drawn round that nobody wins.
- **Match result:** the first to 2 round wins takes the match. After 3 rounds, more round wins takes it. Equal wins go to the higher points total across all rounds. Equal totals make a drawn match: "Brenda can't choose. She's calling the council."

### Rounds and Escalation

Each 3-minute round gets busier in four stretches:

| Time left | Weeds sprout | Snails arrive | Each patch dries | New trouble |
|---|---|---|---|---|
| 3:00 to 2:20 | every 5s | every 15s | every 140s | 3 gnomes already stand on each lawn |
| 2:20 to 1:20 | every 3.5s | every 10s | every 140s | Biscuit digs and fetches; wind gusts |
| 1:20 to 0:40 | every 2.5s | every 7s | every 105s | faster drying |
| 0:40 to 0:00 | every 4s | every 7s | every 105s | the shed opens; the clock ticks the last 10s |

- **Every round** starts with 3 gnomes standing in the middle third of each lawn. The seed places them, and they stand on the same patches on both lawns. A new player's first tip reads "Throw the gnomes over the fence."
- **Round 1:** as in the table. Its second weed sprouts on the back row at 2:50 left, so the first hard throw comes early.
- **Round 2:** adds dandelions.
- **Round 3:** a heatwave. Grass dries 2.5 times as fast all round, and the can takes 6s to fill.

Both gardens get the same weeds and snails at the same times and patches, from the round's shared seed. Any difference comes from your play and from what you throw.

### Why It Makes You Angry

Every fail traces back to something you did. The game warned you, and you were busy.

- A soft swipe clips the fence top and drops your snail back onto your own stripes.
- You throw from the back row with a tired arm, and it falls short.
- You ignore the swinging weathervane, and a headwind turns a good throw into a clip.
- The brown tint makes you overwater, and the patch turns to mud. It was sparkling.
- You leave the tap running, and it floods the patches beside it.
- You rub too fast, and the mower scalps your best stripe.
- You swipe the full grass bag at the fence, clip it, and clippings bury your front rows.
- You miss Biscuit's bark, and he trots their gnome through your stripes.
- You drag the wheelie bin forward to throw it, and flatten a path through your lawn.
- You throw your trampoline over, and your next gnome bounces off it, back onto your lawn.
- You throw your mower, and then the grass grows.
- You didn't tap Biscuit in time.

### Petty Comedy

- When their throw comes over, their head pops up over the fence where it left their hand.
- When your gnome or heavy junk lands on their lawn, their head pops up too.
- When your throw clips, a smug "heh heh heh" floats over the fence.
- Biscuit trots their gnome to your back door, tail wagging, straight through your stripes.
- **Shake Fist** pops your fist up over their fence, at most once every 3s.
- A thrown mower keeps mowing their lawn when it lands, badly.
- The wheelie bin lid flies open and spreads a week of rubbish. That's a crisp packet, a pizza box, a banana skin and one sock.

### Room Flow

1. **Home:** the title, the pitch and a name box. The box starts with a random funny name, such as "Gnome Hoarder", so you can start at once. The buttons are **Start a Room**, **Join With Code** and **Practice Alone**.
2. **Names:** 1 to 16 characters as they show on screen. Letters in any script, digits, spaces, apostrophes, dots and hyphens are fine, with at least 1 letter or digit. Extra spaces are trimmed. The box checks as you type and says "Use letters, numbers, spaces, apostrophes, dots or hyphens."
3. **Start a Room:** makes a random 6-character code. Codes use 31 letters and digits, skipping 0, o, 1, l and i. The lobby opens at a link like `/r/k7dm2q`.
4. **Share:** the lobby shows the code in big capitals in a clear font, grouped as K7D M2Q. **Copy Link** confirms with a "Link copied" toast. **Share Link** opens the phone's share menu, and hides where the browser can't share. If copying fails, the link shows as text you can select. Under the buttons: "Come back here after you send it."
5. **Join:** your friend opens the link, or taps **Join With Code** and types the code.
   - The code box ignores case, shows capitals and turns off autocorrect. It joins on the 6th valid character.
   - A code with a character outside the alphabet shows "Codes are 6 characters with no 0, O, 1, L or I."
   - Pasting a whole link into the box works too.
   - A room link with capitals switches to lowercase. A link with a bad code shows "That link isn't a room."
6. **Lobby:** two garden gates, one per player, each with a name and a **Ready** button. The What Brenda Counts card sits under the gates, above **Ready**, and **How to Play** sits beside **Leave** (see Onboarding). A new player's card adds **Try the Yard**, a practice lawn with no clock (see The Yard). **Ready** is a toggle. The phone stays awake in the lobby.
7. **Countdown:** once both players are Ready, a 3s countdown runs on the shared clock: "3, 2, 1, Mow!"
8. **Rounds:** 3 minutes of play, then Brenda's reveal, which ends with the next round's countdown. Nobody presses Ready between rounds.
9. **Match end:** the result, both true lawns, your worst-moment replay and the share card. The buttons are **Rematch** and **Leave**.
10. **Rematch:** once both players press it, a new match starts after the 3s countdown, with a new seed.
11. **Leave:** back to the home screen. Leaving mid-match asks "Leave the match? Your neighbour wins." Your neighbour sees "neighbour_name stormed off. You win." and returns to the lobby, where they can wait for anyone with the link.
12. **Back:** during a match, the browser's Back button or a back swipe opens the same "Leave the match?" question instead of leaving.

**Practice Alone** needs no name.

A room exists only as a Pusher channel, so any valid code opens a lobby. The room's screens:

| State | You see | Buttons |
|---|---|---|
| Connecting | "Opening the garden gate…" | **Leave** |
| No connection after 8s | "Can't reach the garden. Check your signal or play Practice Alone." | **Try Again**, **Practice Alone** |
| Alone, you started the room | The code and "Send the link to your neighbour." | **Copy Link**, **Share Link**, **How to Play**, **Leave** |
| Alone, you arrived by link | "Waiting for your neighbour. Keep this page open." | **How to Play**, **Leave** |
| Alone, you typed a code | "Nobody's here yet. Check the code with your friend." | **How to Play**, **Leave** |
| Both here | Both gates and What Brenda Counts. A new neighbour's gate shows **First Match** | **Ready**, **How to Play**, **Leave** |
| You're Ready | "Waiting for neighbour_name to press Ready." | **Not Ready**, **How to Play**, **Leave** |
| They're Ready | Their gate reads Ready, and your **Ready** button pulses | **Ready**, **How to Play**, **Leave** |
| How to Play open | The How to Play lines and one status line, such as "neighbour_name is ready." | **Back** |
| Countdown | "3, 2, 1, Mow!" | none |
| Your connection drops | A **Reconnecting…** banner over the running garden | none |
| They pressed Leave mid-match | "neighbour_name stormed off. You win." Then the lobby | **Back to Lobby** |
| Walkover | "neighbour_name didn't come back. You win." | **Back to Lobby**, **Leave** |
| You came back after a walkover | "You didn't come back in time. neighbour_name wins." | **Back to Lobby**, **Leave** |
| No contest | "The line went dead. Nobody wins." | **Rematch**, **Leave** |
| You pressed Rematch | "Waiting for neighbour_name." | **Leave** |
| They pressed Rematch | "neighbour_name wants a rematch." | **Rematch**, **Leave** |
| They left after the match | "neighbour_name left." | **Back to Lobby**, **Leave** |
| Room Full | "Two people are already here. If one is you, close the other tab or app." | **Try Again**, **Start a Room**, **Practice Alone** |
| Open in another tab | "This room is open in another tab." | **Play Here**, **Leave** |
| Moved to another tab | "This game moved to another tab." | **Leave** |
| Bad link | "That link isn't a room." | **Start a Room** |

Accessibility:

- Screen readers read the room code letter by letter.
- A polite live region announces "neighbour_name joined", "neighbour_name is ready" and "neighbour_name left".
- Once pressed, **Ready** reads **Not Ready**, and screen readers hear the waiting line with it.
- Screen readers hear each tip, toast and round banner as it shows, from a polite status line. **First Match** is part of the gate's text.
- When a new match starts, nothing from the last match's verdict is read again.
- Enter submits the name and code boxes. Focus moves to the heading of each new screen.
- Pinch zoom works on menus and the lobby. Only the game canvas blocks it.

### Drops, Reloads and Gatecrashers

- **Your neighbour goes quiet:** after 3s with nothing from them in a round, or 6s outside one, their name shows **Away**. Your garden keeps running, and so does the clock. Your throws vanish over the fence while they're Away.
- **Silence counts only while you can hear:** their silence counts only while your own tab is showing and connected. When your tab comes back or your connection returns, the count restarts, and your screen says hello again.
- **Your neighbour drops:** when they leave the room's member list, their name shows **Gone** with a 60s countdown. Their last lawn update stays in the peek strip.
- **They come back within 60s:** play carries on.
- **They don't come back:** you win the match as a walkover. If they return later, they see the result.
- **The line goes dead:** they stay in the member list, but nothing arrives for 60s. The match ends as a no contest. This covers a Pusher outage, where both screens go quiet at once.
- **A round ends while they're Away or Gone:** Brenda gives an Away neighbour 6s to send their final. Without it, or once they're Gone, she scores their last update caught up to 0:00, like a reload. Both screens show that lawn. When the host was gone, its page judges that round once it returns. It rebuilds its own lawn from the guest's copy and catches it up to the round's end, like a reload during that reveal.
- **A reload or an app switch mid-round:** your garden comes back from your neighbour's last copy of it. Your bag, can, tap, arm meter and own faults come back as they were. Everything you missed then happens at once: drying, growth, weeds, snails and holes. A reload never rescues a bad lawn, and it never wipes a good one. With no copy to use, you get a fresh lawn plus everything you missed.
- **A reload in the lobby or during a reveal:** you rejoin at the same step, and Ready resets. A reloaded host gets back the verdicts it missed from the guest, so both reveals and match ends match.
- **Both of you reload mid-match:** neither page holds the match any more. After 5s you both land in the lobby.
- **Backgrounding the tab:** the round clock keeps going, and so does your garden. A hidden desktop tab still sends your lawn every 1s, so you never show Away. Throws still land on you. A hidden phone tab freezes and drops its connection, so throws sent at you meanwhile are lost. When you come back, your garden catches up at once to where it would be.
- **Your own connection drops:** a **Reconnecting…** banner shows, and your garden keeps running. Throws wait up to 6s for the connection. Older ones vanish over the fence.
- **A third person opens the link:** they see **Room Full** and leave the room at once, so they cost no messages. The two seats go to the first two players who meet in the lobby. A seat frees up only when its player presses **Leave**, or stays out of the room for 10s outside a match. During a match the seats stay locked, even while one player is Gone. After a walkover, the absent player's seat stays locked while the winner's screen shows the result.
- **A second tab of yours:** the same room in a second tab of your browser shows "This room is open in another tab." **Play Here** moves the game to the new tab.

### Practice

**Practice Alone** plays a full match against Mr Pemberton, a scripted bot neighbour. It needs no connection and sends nothing to Pusher, so it works when the day's quota runs out. It still runs through the same room code as online play, with Mr Pemberton on the other end.

- He plays by the same rules, with the same seeded weeds, snails and gnomes.
- **Round 1, polite:** he only throws back what you send him, 4s to 8s later. His watering makes up 60% of his drying, and he mows a column every 12s.
- A new player gets the same yard and staged tips in Practice as online, and finishing a Practice match counts as finishing a match (see Onboarding).
- **Round 2, normal:** he throws back within 2s to 6s. He also sends his own weeds and snails every 5s to 9s. 1 throw in 5 clips the fence and drops on his side. He says "Blast." His watering makes up all of his drying, and he mows a column every 6s.
- **Round 3, petty:** he throws back within 1.5s and empties his shed at 0:40, the bin and trampoline first. 1 light throw in 13 clips the fence. His watering makes up 130% of his drying, and he mows a column every 6s. He keeps his mower to re-mow his stripes from 0:15, then throws it over 6s before 0:00.
- He always waters his driest patches first.
- **His reactions:** his head pops up with "My begonias!" when a gnome lands in his front 4 rows. He shakes his fist after 3 hits within 10s. He laughs at your clips.
- Tuning target: you beat polite Pemberton on your first try. Once you know the game, you beat petty Pemberton about half the time. Rounds simulated without a screen, with scripted players on both sides, check both targets.
- The finale has three fair plans: throw everything over, mow once your gnomes are gone, or throw your gnomes and then mow for stripes in the last 18s. In simulated rounds each beats each other in 35% to 65% of rounds. A player who mows in the last 15s holds a stripe at 0:00 in 98% of rounds.
- Brenda's reveal, the replay and the share card work as they do online.

### Onboarding

A friend who opens your link skips the home screen and meets a running clock. Onboarding gives a new player more information, never easier rules. Both lawns play by the same rules, and both screens show the same scores.

#### Who Counts as New

- Your browser remembers one yes/no fact beside your name and player id: whether you've finished a match. It holds no scores and no history.
- The fact is saved when the last reveal of a match ends on your screen, online or in Practice. A page that rejoins a match Brenda already decided saves it too.
- A walkover, a storm-off, a no contest, or leaving before the last reveal ends saves nothing.
- Without the fact, you're a new player for your next match. From the rematch on, you're a returning player.
- Whether you get a new player's tips is read once, as each match starts, so teaching never switches off mid-match.
- The **First Match** tag on your lobby gate follows the fact as it is now. It goes as soon as you finish a match, so **Back to Lobby** shows your friend no tag. **Try the Yard** on your lobby card follows the fact the same way.
- The guess can be wrong. A returning player on a new phone gets tips for one match, and **Hide Tips** stops them. A new player on a shared browser can press **Show Tips**.
- Dev builds take `?first=1` or `?first=0` to make a tab new or returning, since `?local` test tabs share storage.

#### Your First Match by Link

What a new player sees, from opening the link to the end of their first match. Times are the round clock, with seconds played in brackets.

1. **The link:** "Opening the garden gate…" shows for 1s to 3s.
2. **The lobby:** the card **The Garden Gate** shows your gate, with your funny name and "You" under it. Alone, it reads "Waiting for your neighbour. Keep this page open."
3. **Your friend arrives:** both gates show. Your friend's screen adds a **First Match** tag to your gate. Yours shows nothing extra.
4. **What Brenda Counts** sits under the gates, above **Try the Yard**, **Ready**, **How to Play** and **Leave**.
5. **How to Play** swaps the card for the How to Play lines and a **Back** button. The lobby has no clock, so reading costs nothing. One status line stays, such as "neighbour_name is ready."
6. **Try the Yard** opens a practice lawn with no clock, where you throw a gnome, pull and throw a weed, and mow a stripe (see The Yard). Your friend's screen reads "neighbour_name is trying the yard (2 of 3)."
7. **Ready** turns into **Not Ready**, with "Waiting for neighbour_name to press Ready." If your friend pressed first, your **Ready** starts to pulse once the card has shown for 6s and you've finished or skipped the yard.
8. **Countdown:** "3, 2, 1, Mow!" over the real lawn. Round 1 has no banner, so the greener tint still fools you. The top bar shows 3:00. Your presses do nothing until "Mow!", as for everyone.
9. **Top bar:** your own name tag reads "You", as it does for everyone.

Round 1 teaches throwing, weeds, snails, watering, mowing, Biscuit's digs and the shed:

- **Countdown:** "Throw the gnomes over the fence." A see-through finger presses the nearest gnome, swipes it up and lets go mid-swipe.
- **3:00 (0s):** "Mow!" The finger plays once more, and your first touch stops it.
- **About 2:55 (5s):** the first weed sprouts. "Drag the weed out first, then swipe it up."
- **2:50 (10s):** a weed sprouts on the back row. A soft throw from there clips. Once it drops back: "Too soft. It clipped the fence."
- **About 2:47 (13s):** a snail crawls in. "Grab the snail before it slimes your grass."
- **Your friend's first throw lands:** "That came from next door. Throw it back."
- **2:35 (25s):** "Hold still on brown grass until it sparkles." At your first sparkle: "Sparkling means full. Stop pouring."
- **The can runs dry:** the toast "The can's empty. Press the tap to fill it." Once you turn the tap on: "Press the tap again within 8s, or it floods."
- **2:20 (40s) on:** Biscuit wakes. His first circle jumps the line: "Press Biscuit now, or he digs a hole." Wind and fetching get no tips until round 2.
- **About 1:55 (65s):** a column grows shaggy. "Mow slowly up and down a whole column."
- **Your first stripe:** "Stripe! It scores if it lasts until 0:00."
- **Your first stripe broken by something landing or a mark:** "Stripe broken. Clear it and mow again."
- **0:40 (140s):** the shed bangs open. A one-line banner covers the peek strip for 3s: "The shed's open. Every gnome costs a point." Then the tip "Gnomes first. Then big junk, if you dare."
- **Your first press on heavy junk on the patio:** "Slide it halfway up the lawn, then let go."
- **Your first press on heavy junk on the grass:** "Now hold it still until it lifts, then swipe up."
- **Your lawn first holds no gnome after 0:40:** "Mow columns now. Stripes count at 0:00."
- **0:00:** the tip line clears. Brenda's reveal runs as it does for everyone, with each score line showing what she counted.

A yard step you finished replaces its round 1 tip: step 2 the weed tip, and step 3 the mow tip. The start tip and the ghost finger still play in the countdown.

Round 2 teaches the wind, fetching, the bag and dandelions:

- The "Round 2: Dandelions" banner shows over the countdown, as for everyone. The coach tip shows in the tip line during the same countdown: what cost you most in round 1, and the fix.
- The weathervane's first swing gets the tip for its gust, such as "Wind in 2s. It pushes your throws back."
- Biscuit's first bark: "Biscuit's eyeing that. Throw it first." If he grabs it, the tip names what he took, such as "Biscuit has your gnome. Press it."
- The bag at 80 cuts: "Bag nearly full. Compost it or swipe it over."
- The first seed clock: "Seed clock. Drag it out and throw it over."
- "Mow columns now. Stripes count at 0:00." shows once your lawn holds no gnome after 0:40, or at 0:15 left.
- A round 1 tip you never earned can still show.

Round 3, if the match gets there, teaches the heatwave and catching:

- The "Round 3: Heatwave" banner and the coach tip during the countdown, then "The can fills slowly. Turn the tap on early."
- The first thing your friend throws, while it falls over your lawn: "Press it while it falls to catch it."

When the last reveal ends, your browser saves that you've finished a match. The match end looks the same as everyone's. A rematch has no tips, your gate loses its **First Match** tag, and your lobby card loses **Try the Yard**.

#### The Yard

The yard is a practice lawn in the lobby, for a new player only. It has no clock. Nothing you do there reaches your friend's garden or counts.

- **Try the Yard** is the main button on a new player's lobby card, online and in Practice, with **Ready** beside it. It opens the yard. The yard never opens by itself, so What Brenda Counts always comes first.
- Returning players don't see **Try the Yard**.
- Until you finish or skip the yard, **Try the Yard** is the yellow main button and **Ready** a plain one beside it. Afterwards they swap looks and keep their places.
- **Try the Yard** shows even while you wait alone for your friend.
- The lobby card goes, and your own lawn shows with nothing on it but the current step's object. No weeds sprout or spread, nothing dries, grows or wilts, nothing lying there browns the grass, and Biscuit, the wind and the shed stay away.
- **The yard bar** takes the top bar's place: **How to Play** on the left, "The Yard" with "Step 2 of 3" in the middle, and **Skip** on the right. Focus moves to "The Yard" when it opens.
- **The yard panel** covers the patio, which the 3 steps don't use, below the stripe ticks on its edge. The strip of patio above it shows bare slabs and the ticks; the tap, the compost bin, the shed and Biscuit stay under the panel. It holds the status line and **Ready**, or **Start** in Practice. The status line reads as the lobby card's would: "neighbour_name is ready.", "Waiting for neighbour_name to press Ready.", or "Mr Pemberton is ready." in Practice.
- A tip moved to the patio strip, and the **Reconnecting…** banner, sit on the panel's top edge while the yard is open.
- Each step's line shows in the tip line, with a pointer on its object. Screen readers hear it through the tip line's status.
- The ghost finger shows each step's move as the step starts, and again after 2 failed tries in a row. Your first touch stops it. With Reduced Motion on, a still arrow shows the move instead.

| Step | On the lawn | Line | Done when |
|---|---|---|---|
| 1 | a gnome in the middle of the lawn | "Throw the gnome over the fence." | it crosses the fence |
| 2 | a weed rooted on the back row | "Drag the weed until it pops out.", then once it's out, "Now swipe it up hard at the fence." | it crosses the fence |
| 3 | one clear column grown shaggy, with the column outline | "Mow slowly up and down this column." | the column stripes |

- After step 3, "That's a stripe. Yard done." shows for 2s. Then the lobby card returns, with focus on **Ready**.
- Failure cues show as they do in a match. Each failure shows its failure tip every time, for 3s, and then the step's line returns.
- A throw that crosses the fence vanishes with a puff in the peek strip. Your neighbour sees nothing land.
- A step's object that comes to rest on the patio or against a hedge goes back to its start after 1s, with a puff.
- **Skip** closes the yard and brings back the lobby card, with focus on **Ready**.
- After you finish or skip the yard, **Try the Yard** stays on the card as a plain button. It starts again from step 1.
- **How to Play** shows the How to Play lines with the status line and **Back**, which returns you to the same step with focus on **How to Play**. The bar, the panel and the step line hide meanwhile.
- **Ready** works at any time. Once you're both Ready, the countdown starts and the yard closes at once. A press you're still holding does nothing in the round.
- Your **Ready** never pulses while the yard is open. Once you finish or skip it, Ready pulses as usual when your friend is Ready. A yard closed by the countdown or a lost lobby counts as neither.
- In Practice, **Start** pulses once you finish or skip the yard, since Mr Pemberton is always ready. A returning player's **Start** never pulses.
- While you're in the yard and not Ready, your friend's status line reads "neighbour_name is trying the yard (2 of 3)." Their screen reader hears each step change. Once you press **Ready**, they see "neighbour_name is ready." instead. Every lobby card's status line shows "neighbour_name is ready." while your friend is Ready and you aren't.
- The yard sends only its step number, inside the lobby message both screens already send every 2s. That message also goes out as soon as the step changes, so your friend's line follows each step without waiting for the next one.
- Leaving, **Room Full**, another tab, or a lost connection closes the yard first.
- A reload forgets the yard, like the tips you've seen.
- The tips a finished step replaces stay replaced for every match this page teaches, until a reload.

#### Staged Tips

Tips show only to a new player. Each one shows from its round on, the first time its trigger happens. A pointer marks the thing the tip is about. Urgent tips jump the queue (see The Tip Queue).

| Round | When | Tip | Pointer on | Urgent |
|---|---|---|---|---|
| 1 | The countdown | "Throw the gnomes over the fence." | the nearest gnome, with the ghost finger | |
| 1 | The first weed sprouts, unless you finished yard step 2 | "Drag the weed out first, then swipe it up." | that weed | |
| 1 | The first snail crawls in | "Grab the snail before it slimes your grass." | that snail | |
| 1 | The first thing from next door lands | "That came from next door. Throw it back." | that item | |
| 1 | 25s in, with a patch at health 4 or less | "Hold still on brown grass until it sparkles." | the driest bare patch | |
| 1 | Your first sparkle, until the pour stops or the patch drowns | "Sparkling means full. Stop pouring." | that patch | yes |
| 1 | You turn the tap on | "Press the tap again within 8s, or it floods." | the tap | yes |
| 1 | Biscuit starts circling | "Press Biscuit now, or he digs a hole." | none, his dig circle shows | yes |
| 1 | A whole column grows shaggy, unless you finished yard step 3 | "Mow slowly up and down a whole column." | that column | |
| 1 | Your first stripe | "Stripe! It scores if it lasts until 0:00." | that column | |
| 1 | Your first stripe lost to something covering or marking it | "Stripe broken. Clear it and mow again." | that column | |
| 1 | The shed opens, after its banner | "Gnomes first. Then big junk, if you dare." | none | |
| 1 | Your first press on heavy junk on the patio, until you let go | "Slide it halfway up the lawn, then let go." | none, its grip shows | yes |
| 1 | Your first press on heavy junk on the grass, until you let go | "Now hold it still until it lifts, then swipe up." | none, its lift ring shows | yes |
| 1 | After 0:40, your lawn first holds no gnome | "Mow columns now. Stripes count at 0:00." | none | |
| 2 | The countdown | the coach tip | none | |
| 2 | The vane swings before a tailwind | "Wind in 2s. It carries your throws further." | the vane | yes |
| 2 | The vane swings before a headwind | "Wind in 2s. It pushes your throws back." | the vane | yes |
| 2 | The vane swings before a gust along the fence | "Wind in 2s. It pushes throws sideways." | the vane | yes |
| 2 | Biscuit barks at an item | "Biscuit's eyeing that. Throw it first." | none, his eyeing ring shows | yes |
| 2 | Biscuit picks something up | "Biscuit has your gnome. Press it." with the item's name | that item | yes |
| 2 | The bag reaches 80 cuts | "Bag nearly full. Compost it or swipe it over." | the bag | |
| 2 | The first seed clock | "Seed clock. Drag it out and throw it over." | that clock | |
| 2 | 0:15 left, if the stripes tip hasn't shown | "Mow columns now. Stripes count at 0:00." | none | |
| 3 | The countdown | the coach tip | none | |
| 3 | After the coach tip | "The can fills slowly. Turn the tap on early." | the tap | |
| 3 | Something from next door falls over your lawn | "Press it while it falls to catch it." | that item | yes |

- The wind tip shows once, on the first gust's warning, with the line for that gust in your garden's frame.
- Times such as "25s in" and "0:15 left" scale with the round's length in `?fast` rounds, like the lawn's schedules.
- The fetch tip names what Biscuit carries: weed, dandelion, seed clock, seed, gnome or litter.
- The broken-stripe tip skips a stripe that lapses because its grass grew back, and one hidden for a moment by something carried across.

Failure tips answer your own mistakes. Each shows the first time it happens in each round of your first match, so at most 3 times. Each points at the item, weed, patch or column involved.

| Trigger | Tip |
|---|---|
| You let go too slowly | "Let go while you're still moving." |
| You held a light item still for 0.4s or more, moving it under 12 px, then let go | "Swipe it up to throw it. Water bare grass." |
| You let go aimed more than 60° off the fence | "Swipe up toward the fence." |
| You put the bag down off the compost | "Hold the bag on the compost to empty it." |
| Your throw clips the fence, once it drops back | "Too soft. It clipped the fence." |
| You throw within 0.4s of your last throw | "Too soon. Wait half a second." |
| You throw while your arm is tired | "Arm's tired. Throw once a second." |
| A flick leaves a weed rooted | "It's rooted. Drag it until it pops out." |
| A fast flick grabs nothing, aimed within 60° of the fence, with an item within 88 px | "Missed. Press on it first, then swipe." |
| Any other fast flick that grabs nothing | "Too fast to mow. Press, then drag slowly." |
| A slide of heavy junk ends in a fast release | "Let go first, then hold it until it lifts." |
| One press cuts 12 or more of a column's 16 patches, and it doesn't stripe | "Weeds or junk block this stripe. Clear them." |
| You drown a patch | "Mud. Stop pouring at the sparkle." |
| Your tap floods | "Flooded. Press the tap to turn it off." |
| The mower stops on a full bag | "The bag's full. Hold it on the compost." |
| You scalp a patch | "Too fast. Mow slower or you scalp it." |
| Biscuit digs a hole you missed | "Hole. Press Biscuit while he circles." |

A press the phone cuts off, such as for an incoming call, earns no tip.

#### The Tip Line

- Tips show on one line whose bottom edge sits on your lawn's top edge. It covers the fence and the bottom of the peek strip, never your lawn. That band holds nothing to press and nothing that scores.
- The line is 18 px on phones and 20 px from 640 px wide.
- Toasts and the **Reconnecting…** banner keep the strip under the patio props, for every player.
- Every tip, toast and banner line fits 295 px at 18 px in the hand font. A 375 by 548 screen leaves about 297 px inside the line.
- Presses go through both lines to the garden underneath.
- A tip never covers what it teaches. Its spot is fixed when it shows. A tip whose object sits even partly behind the tip line then moves to the patio strip, such as a gnome in the front row whose hat pokes above the lawn's edge. The catch tip always shows there, since its item falls through the fence band.
- The clip tip waits until the clipped item drops back, so the line never hides the teeter.
- **Pointers:** a small marker-yellow arrow bobs above the tip's object, pointing down at it. Near the fence, where the tip line would hide it, the arrow sits below the object and points up. With Reduced Motion on, it holds still. For a column, the arrow sits above the column's row 2, and a thin marker-yellow outline runs from row 2 to the patio.
- A tip whose object already shows its own ring gets no pointer: Biscuit's dig circle, his eyeing ring, the lift ring and the compost ring.
- Pointers and the ghost finger are the only things tips draw over the grass.
- The ghost finger is see-through, so the gnome stays visible under it. With Reduced Motion on, a still arrow points from the gnome to the fence for the same 2.4s.
- Screen readers hear each tip and toast as it shows, through a polite status line.
- Screen readers hear each round banner as one sentence, its title then its line, such as "Round 2: Dandelions. 1 weed in 4 is a dandelion. Its seed clock bursts where it lands.", and the shed banner's full sentence only once.

#### The Tip Queue

- One tip shows at a time. Each shows for at least 3s, and stays up to 6s while nothing waits. A 0.4s gap separates two tips.
- Waiting tips line up in the order they happened.
- Urgent tips jump the line. The staged table marks them, and the catch tip is one. An urgent tip can cut in on a tip that has shown for under 3s, unless that tip is urgent too and its moment is still on. The cut tip goes back to the front, unless its moment has passed.
- A waiting tip leaves once its moment passes: Biscuit stops circling, its item lands, its gust arrives, the pour stops, or you let go. Any other staged tip leaves after 10s of waiting. Time an urgent tip spends on show doesn't count, so an interruption never costs a lesson.
- Failure tips wait at most 2s, and only one waits at a time. A newer failure tip replaces a waiting one.
- A tip counts as seen once it has shown for 3s. A tip with a moment also counts once that moment ends on show, if it showed from the moment's start. So the wind tip counts after its 2s warning, even when Biscuit's bark cuts in at the gust.
- A tip that left the line unseen shows the next time its trigger happens. Beginners repeat their mistakes, so a dropped failure tip comes back soon.
- A seen tip never shows again that match. Failure tips are the exception, once per round.
- Tips and toasts use different lines, so a toast never pauses a tip on the tip line. A tip moved to the patio strip waits for a toast there to end, unless it's urgent. An urgent tip ends the toast early.
- While **Reconnecting…** shows, or the page is hidden, tips wait and their time stands still.
- Events your garden replays to catch up raise no tips. That covers a frame that jumps more than 500 ms, any step while the page is hidden, and a rebuild after a reload.
- Catch-up still ends moments. A waiting tip whose moment passed out of sight leaves. If the tip on show loses its moment that way, urgent tips may cut in. A moment that ends out of sight counts nothing as seen.
- The countdown tips, the ghost finger and the coach tip show only when your page's first live frame of that round falls in its countdown or its first 2s of play. So a reload mid-round never replays them.
- At 0:00 the line clears, and waiting tips leave unseen.
- A reload forgets which tips you've seen, since that lives only in the page.

#### Show Tips and Hide Tips

- The menu's tips button reads **Hide Tips** while tips are on, and **Show Tips** while they're off.
- A new player starts with tips on. Everyone else starts with them off.
- **Show Tips** gives you a new player's tips for this round and every earlier one, from that moment on.
- The choice lasts until you reload.
- Toasts, failure cues, stripe cues and reveal counts show either way.

#### Failure Cues for Everyone

Every self-inflicted failure shows its cause at once, for every player in every match. Failure tips only add words for a new player. Two cues show progress instead of failure: pulling a weed, and a new weed.

- **Blocked throw:** the item drops with a puff, and "Too soon" or "Arm's tired" shows beside it for 0.8s. The arm ring flashes red.
- **Pulling a weed:** while you drag a rooted weed, it leans toward your finger and a marker-yellow ring round it fills with the pull. It pops out with a dirt puff when the ring is full. With Reduced Motion on, the weed doesn't lean, and the ring still fills.
- **Rooted weed:** a flick that leaves a weed rooted makes it shake, with a small dirt puff.
- **Missed flick:** a fast flick that grabs nothing leaves a short swish along your finger's path: three grey dashed strokes, with a puff of dust where it began. A throw's motion lines are never grey or dashed, so a miss can't pass for a throw.
- **New weed:** every new weed pops up through a small puff of dirt, so you see where weeds come from.
- **Full can:** while the tap runs into a full can, water spills over its rim.
- **Drowned patch:** the patch splashes as it turns to mud, with a `squish`.
- **Full bag:** the bag reads "Full".
- **Blocked stripe:** when one press cuts 12 or more of a column's 16 patches and the column still doesn't stripe, the patches that block it flash for 1s.
- The clip's creak and "heh heh heh", Biscuit's hole and the tap's flood splash stay as they are.
- A slow, still or sideways release has no cue of its own. The item stays where you let go, which shows it didn't fly.

#### The Lobby Score Card

Every lobby card, online and in Practice, shows this card between the gates and **Ready**. It replaces the old 3-line how-to.

**What Brenda Counts**

- Green, up to 50: how healthy your grass is.
- Stripes, 2.5 each: a column mown short, fence to patio, with nothing on it at 0:00.
- Tidy, up to 20: each weed, snail, hole, bit of litter or clippings patch costs half a point.
- Junk, no limit: each gnome on your grass costs 1, a bin or mower 4, a trampoline 6.
- Win 2 of 3 rounds. Each round lasts 3 minutes.

The four names show in the marker font, the rest in the hand font. On a 375 by 548 screen the card scrolls. **Ready**, **How to Play**, **Leave** and the waiting line stay pinned below it, with **Try the Yard** beside **Ready** on a new player's card. **Ready** still pulses once your friend is Ready, except on a new player's card before they finish or skip the yard.

#### How to Play

- **How to Play** sits beside **Leave** on every lobby card, in the yard bar, and in the menu.
- In the lobby and the yard it swaps the view for these lines and a **Back** button. In the menu, What Brenda Counts follows the lines, under "The round keeps going while this is open."
- The lines:
  1. Press a weed, snail or gnome to grab it. On bare grass, drag slowly to mow, or hold still to water.
  2. Swipe what you grabbed up at the fence. Let go while still moving.
  3. Drag a weed until it pops out of the ground, then swipe it up.
  4. Throw about once a second. Throwing faster tires your arm: throws fall short, then stop.
  5. A soft throw clips the fence and drops back onto your lawn.
  6. Mow slowly up and down a whole column to stripe it.
  7. Hold still on brown grass to water it. Stop when it sparkles.
  8. Press the tap to fill the can. Press it again before it floods.
  9. Drag the full grass bag onto the compost and hold. Or swipe it over the fence.
  10. Press Biscuit while he circles, or he digs a hole.
  11. At 0:40 the shed opens. Throw the gnomes, then mow your stripes back.
  12. Heavy junk: slide it halfway up the lawn and let go. Then hold it until it lifts, and swipe up hard.
  13. Press something while it falls over the fence to catch it.
- The keyboard line still shows on devices without touch.
- While lines sit below the visible area, the list's bottom edge fades out over "More below" with a down arrow. Both go once the last line is in view. Screen readers hear every line either way.
- In the lobby, one status line stays under **Back**: the waiting line once you're Ready, or "neighbour_name is ready." once they are.
- When the countdown starts, the lobby card goes and focus moves to the menu button in the top bar, also from How to Play.

#### Reveal Counts

In every reveal, both boards show what Brenda counted on each score line. The count sits between the label and the score, in soft ink hand text at the score label's size, 22 design units. That's about 12 px on a 375 px phone.

| Line | Shows | For example |
|---|---|---|
| Green | its scale | "of 50" |
| Stripes | striped columns | "2 columns", "1 column", "no columns" |
| Tidy | the 2 kinds that cost most; ties go weeds, snails, holes, litter, then clippings | "15 weeds, 7 snails" |
| Junk | the 2 kinds that cost most points | "11 gnomes", "11 gnomes, 1 trampoline" |
| Total | nothing | |

- A Tidy of 20 or a Junk of 0 shows no count.
- Litter counts as "bits of litter" and clippings as "clippings patches", such as "3 bits of litter".
- A count too wide to clear its label and score keeps only its first kind.
- Each count shows from its line's count-up until the board goes.
- The screen-reader table reads each score with its count.
- The host counts both lawns when it judges the round, and the verdict carries the counts. So both screens show the same counts, even after a reload mid-reveal.
- The blame line under the loser's score stays as it is.

#### The Coach Tip

During the countdowns of rounds 2 and 3, a new player's first tip names what cost them most last round. That time counts toward its 3s. Brenda compares your last lawn with Green 36, where every lawn starts, Tidy 20 and Junk 0. The line with the biggest loss you could have prevented picks the tip. Ties go to Junk, then Tidy, then Green.

- Junk counts only what you could have prevented: every gnome, and your own heavy junk on your grass, sunk or not. Heavy junk that came from next door sank where it landed, so it's left out.
- Tidy picks its line from its biggest kind.

| Biggest loss | Tip |
|---|---|
| Junk, gnomes only | "Gnomes cost you 11. Throw them all over." |
| Junk, with your own heavy junk | "Junk cost you 15. Throw it from halfway up." |
| Tidy, mostly weeds and snails | "Weeds and snails cost you 10. Throw them." |
| Tidy, mostly holes | "Holes cost you 4. Press Biscuit as he circles." |
| Tidy, mostly litter or clippings | "Litter and clippings cost you 6. Clear them." |
| Green | "Dry grass cost you 12. Water brown grass." |
| Nothing by 3 or more, and no stripes | "No stripes. Mow a whole column slowly." |

- The number is the points lost on that line, rounded like the score.
- With nothing lost by 3 or more and at least one stripe, there's no coach tip.
- The tip reads the verdict's counts, so a page that reloaded mid-match picks the same tip.

#### Repairable Stripes

- A stripe is never lost for good. Clear the column and mow it again, and the stripe comes back.
- A column loses its stripe when more than 2 of its 16 patches are long, marked or covered:
  - **Long:** length 2 or more.
  - **Marked:** slime, paw prints, a scuff, clippings, a wilted weed, a scalp mark, drag ruts or a puddle.
  - **Covered:** a weed, a snail, an item or a heap. An item in your hand or in Biscuit's mouth covers the patch under it.
- One mowing pass clears every mark and cuts the patch short. Throw off what covers it first.
- Holes and sunk heavy junk stay all round. A column with 3 holes, or 3 patches under a trampoline, can't stripe again that round.
- Your screen and Brenda use the same rule, so a stripe you see at 0:00 is a stripe she counts.
- At 0:40 the crate's gnomes cover most columns. In the last 40s you throw the gnomes over, then mow your columns again before 0:00.
- When one of your columns gains a stripe, a light sweeps down it, fence to patio, with a soft `ding` of its own. When it loses its stripe, it flickers out. Carrying something across a stripe hides it for that moment, with no cue.
- **Stripe ticks:** each striped column shows a small white chalk tick on the patio's edge, under the column, so you can count your stripes at a glance. When the column loses its stripe, its tick turns into a red cross for 1s, then goes. The ticks follow the same stripes as the cues.
- **Stripe look:** a cut patch shows short mow lines until it grows long again. A striped column always looks lighter and greener than unstriped grass at the same health, in both of its alternating shades.
- With Reduced Motion on, the stripe appears or goes without the sweep, and the `ding` stays. The red cross shows for its 1s without fading.
- Stripe cues skip catch-up, and a new round or a reload starts them fresh.

#### What a Returning Player Sees

- The same lobby card, with What Brenda Counts and **How to Play**, and no **Try the Yard**.
- **First Match** on a new neighbour's gate, and "neighbour_name is trying the yard (2 of 3)." while they're in the yard.
- "You" in the top bar, as for everyone.
- No tips, pointers, ghost finger, shed banner or coach tip, unless you press **Show Tips**.
- Everything meant for every player: toasts in the patio strip, failure cues, the pull ring, new-weed puffs, stripe cues and ticks, and reveal counts.

#### Beginner Playtests

After each onboarding build, two cold testers play their first match. Neither has seen the game or these documents.

- One joins by link on a 390 by 844 phone, against a host who plays like a regular.
- One plays Practice Alone on a 1280 by 800 desktop.
- A tester who can't act at human speed, such as a scripted agent, pauses the game with the dev playtest clock while it looks and decides. Game time then passes only while it acts.
- The playtest clock works in dev builds only, in `?local` rooms and Practice. `__game.pause()` stops game time on every tab of the room at the same moment, 150 ms after the call: the round clock, both lawns, Mr Pemberton, the tip queue, the countdown and the reveal. `__game.resume()` starts it again on every tab, and the match runs on that much later.
- While paused, the top bar's clock reads "Paused", presses do nothing, and a press held as the pause begins ends as if the phone cut it off. Real Pusher rooms ignore the playtest clock.

The game log records their moves. Each move is judged on the tester's tries from round 2 on. A move they don't try after round 1 is judged on round 1. A tester fails a basic move when:

| Move | Fails when |
|---|---|
| Throw | under half of their throws clear the fence |
| Pull a weed | flicks that leave a weed rooted outnumber weeds pulled out |
| Mow | none of their mowing presses ever cuts 12 or more of a column's 16 patches |
| Water | they never pour, or they drown more patches than they bring to a sparkle |

- **The first run, on 2026-10-14:** the link joiner never mowed a whole column in their first match, so the yard was built. The Practice tester passed every move.
- If a tester fails a basic move after the yard, the lead reworks how the yard teaches that move.
- The log also records:
  - whether each tester can name the four score lines, asked at round 1's "Time's up." before the scores count up;
  - how many of the crate's 12 gnomes they throw off in rounds 2 and 3;
  - that no tip showed for under 3s;
  - whether they opened the yard, which steps they finished, and how long it took.

### Length

- Lobby: about 1 minute.
- Each round: 3 minutes of play plus Brenda's 20s reveal. The last reveal runs 30s.
- A 3-round match: about 11 minutes. A 2-0 match: about 8 minutes.
- A rematch adds 8 to 11 minutes.

### Ending

After the last reveal, Brenda pins the Best Kept Garden rosette on the winner's gate. She walks home across her own perfect lawn. It squeaks. It's plastic. Caption: "It was never greener."

### Shareable Moments

- **The tint peel:** the lawn you envied all round is mud under a wheelie bin, a trampoline and 30 gnomes.
- **The share card:** both true lawns side by side, both names and "It was never greener." It lists four stats: the match score, your last lawn score, gnomes on your lawn and your fence clips.
- **Worst-moment replay:** a 3s slow-motion replay of the moment that cost you the most health. It's labelled "Clipped the fence. Again." or "Bounced off your own trampoline."
- **The trampoline bounce:** a last-second trampoline throw that sends your own gnome straight back over the fence.

### Controls

| Action | Phone | Desktop |
|---|---|---|
| Grab and throw | Press the item, swipe toward the fence and let go | Click the item, drag toward the fence and release while moving |
| Put an item down | Let go slowly, or swipe away from the fence | Release slowly |
| Yank a weed | Press it and pull, then swipe | Click it and pull, then drag and release |
| Catch | Press something falling over the fence | Click it |
| Lift heavy junk | Press and hold 0.6s until it lifts, then swipe | Click and hold, then drag and release |
| Drag junk forward | Press it and slide at once | Click it and drag at once |
| Mow | Press grass and drag up and down a column | Click grass and drag up and down a column |
| Water | Press and hold still on grass; slide slowly | Click and hold still on grass; move slowly |
| Turn the tap on or off | Tap the tap | Click the tap |
| Show or hide tips | Menu, then **Show Tips** or **Hide Tips** | The same, with the mouse |
| Empty the grass bag | Drag the bag onto the compost bin and hold, or swipe it at the fence | The same, with the mouse |
| Stop Biscuit digging | Tap Biscuit while he circles | Click Biscuit |
| Take back a fetch | Press the item in Biscuit's mouth | Click it |
| Shake Fist | Tap the fist button | Click the fist button, or press F |
| Menu and Leave | Tap the menu button, or go Back | Click the menu button, or press Escape |

### Build Notes

#### Who Simulates What

- Each browser is the only authority for its own garden. That covers the grass grid, weeds, snails, loose items, Biscuit, the patio, the arm meter and the garden's lawn report.
- No object is ever simulated on both machines, so the two simulations never need to match.
- A thrown item changes hands once, at the fence. The thrower's browser removes it when it crosses the fence line above fence height. Then it sends one `throw` message.
- The receiver mirrors the item left to right and spawns it above its own screen top. It runs the rest of the flight.
- A clip sends a small clip record the same way, so the receiver can draw the teeter. The item stays with the thrower.
- Wind comes from the round seed and the shared clock. Both browsers compute the same gusts with no messages. Gust directions are defined from the host's side, and the guest reverses both.
- Weeds, snails, gnome spots and Biscuit's digs come from the round seed too, so both gardens get the same ones.
- Every scheduled event comes from the seed by its own index, not from a shared random stream. So a garden can jump forward to any time and get the same lawn it would have reached live.
- Messages give positions in lawn units, measured from the fence, never in pixels. Phone and desktop layouts never need to match.

#### The Room Channel

- Each room is one Pusher presence channel: `presence-lawn-` plus the room code, such as `presence-lawn-k7dm2q`. Every game message is a client event on it.
- The auth route signs a join with your player id and name. Pusher attaches your player id to every event you send, and receivers trust only that id.
- **Seats:** the first two player ids to meet in the lobby take the seats. Each player's `sync` lists them. A newcomer who finds 2 other players already listed sees **Room Full** at once. One who finds 1 player waits up to 3s for that player's `sync`.
- **Host:** the seated player with the lower id. Seats and host stay fixed for the whole match, through reloads and blips.
- The page opens the Pusher connection only in a room. It closes it on **Leave**, on **Room Full** and in another-tab cases. Practice never opens one.
- The connection, the second-tab lock and the local test channel are created once per room code, outside React's page setup. They close on **Leave** or when the page closes for good.
- **Start:** the host sends one `start` per match. It holds the match id, the seed, the start time, the round length and the reveal length, after `?fast`. Each round's seed and start time follow from it, so no per-round message can go missing.
- **Clock sync:** the host's own clock is the reference. The guest sends 5 pings at join, keeps the shortest round trip and rejects any over 400 ms. Pings skip the outbox. One more ping runs at each reveal and counts only if its round trip is at most 1.5 times the best. A host reload needs no resync.
- **Freshness:** every message bundle carries a session id, the match id, the round number and a sequence number. Session ids grow over time. Receivers keep the newest session per player and drop older sessions, other matches and finished rounds.
- **Repeats instead of one-offs:** while both players are present outside a round, each sends a `sync` every 2s. Ready and Rematch travel inside it. Every `hello` gets a `sync` back, stating the match phase, including a walkover.
- **Results:** the host decides every round. It scores both lawns from their `final` messages, its own included. A missing guest final is replaced by the guest's lawn rebuilt to 0:00, which travels in the `result`. Then it sends `result` with both scores, the winner and the match tally. The guest re-sends its `final` every 1s while the host is in the room, until the `result` arrives. Each result applies once per match and round.
- **Mending results:** the guest's `sync` names the round it still waits on, with its copy of the host's lawn from that round. A host back from a closed page builds its lawn for that round from the copy, then judges it. A host that reloaded asks in its `sync` for the verdicts it lacks, and the guest sends them back.
- A Web Lock per room stops a second tab of the same browser. The `?local` dev mode gives each tab its own player id, kept across reloads of that tab.

#### Messages

| Message | Sent when | Size | Events per second, per player |
|---|---|---|---|
| `lawn` | every 1s during a round, even when nothing changed | under 600 bytes | 1 |
| `throw` | items or clips cross the fence, batched | about 70 bytes per item, up to 8 items | 0 to 2.5, about 0.5 on average |
| `final` | at 0:00; the guest repeats it every 1s while the host is in the room, until the result arrives | under 1 KB | 1 to 3 per round |
| `result` | the host, once both finals are in or 6s have passed, and again for each repeated `final`; the guest, for a reloaded host that asks | under 1.5 KB, or 1.8 KB with the guest's final | 1 per round |
| `start` | the host, once per match | under 200 bytes | rare |
| `sync` | every 2s outside rounds while both are present, and in reply to each `hello` | under 400 bytes, 1 KB with a copy of your lawn, 1.5 KB with a waiting round's copy too | 0.5 outside rounds |
| `hello` | page load, tab shown again, connection back | under 150 bytes | rare |
| `fist` | Shake Fist | under 60 bytes | at most 0.33 |
| `leave` | **Leave** pressed | under 60 bytes | rare |
| `ping`, `pong` | 5 at join, 1 per reveal; they skip the outbox | under 100 bytes | rare |

- `lawn` packs 1 byte per patch: 3 bits of health, 2 bits of length and 3 bits for what's on top. The top is clean, mess, puddle, weed, item, heap, hole or heavy junk. That's 192 bytes, about 256 characters in base64.
- `lawn` and `final` both carry per-type counts: weeds, snails, gnomes, litter, heap patches, bins, mowers and trampolines. So a lawn update scores exactly like a final, and no item cap can change Tidy.
- `lawn` also carries markers: up to 24 items in the peek strip's rows, and every piece of heavy junk at any depth. It lists up to 8 landings since the last update, each 2 bytes: the patch and the item type.
- `lawn` also carries your 6 own-fault counts and your chores: bag cuts, can level, the tap and the arm meter. A rebuild after a reload restores them all.
- `final` carries the 6 own-fault counts for Brenda's line too. It also has a 2-byte marker for every item, so the reveal can draw both true lawns. Snails mid-crawl and seed clocks count like any other item.
- `result` carries the host's own `final`, so the guest can draw the host's true lawn too.
- `sync` carries a `first` flag while its sender is a new player, so the friend's lobby shows **First Match**. Pages that don't know the flag ignore it.
- A `throw` is dropped when its id was seen before, or when it was sent over 6s ago. Throw ids join the session id and a counter.
- Pusher never echoes your own events, so your browser applies its own actions at once.
- Players ignore events from anyone but the other seated player.

#### Hiding Lag in the Arc

- Every arc peaks at least 250 units high. Even a short lob from the front row rises out of view.
- A throw that clears the fence is still climbing. Its peak sits above the top of both screens for about 400 ms.
- After the hand-off, the thrower's screen draws the item rising out of view for up to 300 ms. That drawing has no simulation behind it.
- Each `throw` carries the moment the item crossed the fence, on the shared clock. The receiver fast-forwards the flight by the time since then, capped at 300 ms. With 50 to 200 ms of delay, the item is still out of view when it appears.
- A throw that arrives over 300 ms late enters at the screen top with its remaining motion. It lands late but never jumps.
- A lost `throw` message makes one item vanish over the fence. The next `lawn` update corrects the peek strip within 1s.

#### Rate Budget

The Pusher rules in ARCHITECTURE.md set the budget. Pusher allows at most 10 client events per second per connection. Each event counts as 2 messages in a 2-player room, against 200,000 messages a day.

- Every send goes through a coalescing outbox capped at 6 events per second. It flushes at most every 167 ms and packs everything pending into one event, split at 3.5 KB.
- A send limiter under the outbox allows at most 9 events in any second, pings included.
- The 0.4s hand recovery caps throws at 2.5 a second. So a player peaks at 3.8 events per second: 1 `lawn`, 2.5 `throw` batches and 0.33 `fist`.
- One round costs about 270 events per player, so about 540 per room.
- A 3-round match, with the lobby and reveals, costs about 1,800 events. That's about 3,600 counted messages.
- 200,000 messages a day covers about 55 full matches.
- A room averages about 6 counted messages per second during a round and peaks near 15.
- The free plan's 100 connections allow 50 rooms at once. 50 busy rooms would use up the day's quota in about 11 minutes. That suits a few friends, not a public launch.
- These limits cover the whole Pusher account. Another app on the same account shares them; only a separate account would not.
- Practice and the `?local` dev transport send nothing to Pusher.

#### Phone Performance

- No physics library. Rooted weeds, crawling snails and Biscuit are drawings that follow scheduled paths.
- Loose items use a small slide-and-friction step. They collide only with the hedges, the fence and the back wall, never with each other. Resting items skip the step.
- Thrown items fly a fixed arc that the game computes. Trampoline landings use a footprint check.
- A garden holds at most 160 loose items. Past that, the oldest loose weed wilts at once.
- The lawn draws from a cached layer and repaints one row when a patch in it changes. Items draw as cached stamps. The peek strip repaints when a `lawn` update arrives, once a second.
- The garden is a 680 by 1,060 unit portrait design, fitted to the screen. On desktop, the shed and more hedge fill the spare width.
- On an iPhone SE in Safari, 375 by 548 px are visible. A patch is 26 by 21 px, and the top bar is 50 px tall.
- Target: 60 fps on a mid-range phone with 30 gnomes, a trampoline and a wheelie bin's litter on the lawn.

#### Trust and Security

- Each browser reports its own lawn, so a player with devtools can fake a perfect one. That's acceptable among friends.
- The Pusher secret stays on the server, in the auth route. No browser ever signs its own join.
- The auth route signs only valid room channels, player ids and names. A room channel is `presence-lawn-` plus 6 lowercase letters or digits. It checks names with the same rule as the name box.
- Anyone with the link can still join a room and spend the shared quota. Players ignore events from non-players, Room Full visitors leave at once, and the risk stays accepted for a friends-only game.

#### Settings and Build Order

- Settings offers sound, volume and Reduced Motion. Reduced Motion turns off screen shake and turns the tint peel into a fade. Assist Mode and sensitivity stay off, since both players must play by the same rules.
- The game never asks for motion access.
- Build the fence hand-off between two tabs over the `?local` transport first. Then add real Pusher rooms, then each mechanic.
- Cut order if time runs short: the mower's landing run, dandelions, catching, Shake Fist, then the heatwave.

---

## Shared Foundation

The game builds on these blocks in `src/shared`, and adds its own networking.

- **Real-time timers:** each timer stores its finish time on the shared clock. It stays accurate while the tab sits in the background.
- **Keep the screen awake:** the game asks the phone not to sleep in the lobby and during a match.
- **Leave warning:** on desktop, closing the tab mid-match asks first. Phone browsers don't reliably show this prompt, so Back opens the game's own question instead.
- **Controls:** the pointer tracker follows one finger, with hand-off to a resting finger turned off. Hold meters drive watering and heavy lifts. Throw speed comes from this game's own release sampler.
- **Sound:** synthesised effects. Throws go `whoosh`, the trampoline goes `boing`, and Biscuit barks.
- **Fail replays and share cards:** the worst-moment replay and the end-of-match card.
- **Layout:** React draws menus, the lobby and the HUD. A canvas draws the gardens and Brenda's reveal, and React mirrors her verdict as text for screen readers.
- **Scrappy look:** lines wobble like a felt-tip pen, so no art library is needed. Static art sits in cached layers.
- **New for this game:** the network layer, the room flow, the grass grid, the slide-and-arc step, the fence hand-off and the bot.
- **Not used:** Matter.js, phone motion, coins, upgrades and the chore board's blocking rules. A 3-minute round has no room for a shop.

/**
 * Every gameplay number, in lawn units, milliseconds and screen pixels. This file is the
 * source of truth; PLAN.md lists the starting values.
 */

// ------------------------------------------------------------------ Lawn

/** Lawn width in units, hedge to hedge. */
export const LAWN_W = 600
/** Lawn depth in units, fence to patio edge. */
export const LAWN_D = 640
/** Patio depth in units, below the lawn. */
export const PATIO_D = 184
/** Patch columns across the lawn. */
export const COLS = 12
/** Patch rows from the fence (row 0) to the back door (row 15). */
export const ROWS = 16
export const PATCHES = COLS * ROWS
/** Patch width in units. */
export const PATCH_W = 50
/** Patch depth in units. */
export const PATCH_D = 40

/** Every patch starts the round at this health. */
export const HEALTH_START = 5
export const HEALTH_MAX = 7
/** Every patch starts the round at this length. */
export const LENGTH_START = 2
export const LENGTH_MAX = 3

/** A patch at this length or shorter counts as short for stripes. */
export const SHORT_MAX = 1
/** A column shows a stripe once this many of its 16 patches are short and clean. */
export const STRIPE_MIN = 14

// ------------------------------------------------------------------ Round clock

/** A full round's play. `?fast` rounds scale every lawn schedule by their share of it. */
export const ROUND_MS = 180_000
/** Time left at each stretch boundary: 2:20, 1:20 and 0:40. */
export const STRETCH_LEFT_MS = [140_000, 80_000, 40_000] as const

// ------------------------------------------------------------------ Drying and growth

/** Each patch dries by 1 health this often. */
export const DRY_MS = 140_000
/** From the late-drying point on, each patch dries this often instead. */
export const LATE_DRY_MS = 105_000
/** Drying speeds up with this much of the round left (1:20). */
export const LATE_DRY_LEFT_MS = 80_000
/** The round index (0-based) that runs the heatwave. */
export const HEATWAVE_ROUND = 2
/** The heatwave dries grass this many times as fast. */
export const HEATWAVE_DRY = 2.5
/** Each patch grows 1 length this often; a cut restarts the wait. */
export const GROW_MS = 75_000

// ------------------------------------------------------------------ Jobs on grass

/** A press on grass waits this long before it waters. */
export const JOB_WAIT_MS = 150
/** Moving this far, in screen pixels, during the wait starts mowing instead. */
export const MOW_START_PX = 12
/** A press faster than this in its first 100 ms never mows; it snaps to an item. */
export const FAST_PRESS_PX = 1000
/** The fast-press rule looks at this much of the press's start. */
export const FAST_PRESS_MS = 100
/** A fast press grabs the nearest item within this many screen pixels. */
export const SNAP_REACH_PX = 44
/** A pour turns into mowing once the finger moves faster than this... */
export const POUR_TO_MOW_PX = 200
/** ...for this long. */
export const POUR_TO_MOW_MS = 100

// ------------------------------------------------------------------ Watering

/** Patches whose centre lies within this many units of the pour get water (a 120-unit circle). */
export const POUR_RADIUS = 60
/** Each patch under the pour gains 1 health per this much pouring. */
export const POUR_STEP_MS = 400
/** Pouring this long more on a full patch turns it to mud. */
export const DROWN_MS = 1500
/** A drowned or flooded patch drops to this health, with a puddle. */
export const MUD_HEALTH = 2
/** A full can holds this much pouring. */
export const CAN_MS = 10_000
/** A running tap fills an empty can in this long. */
export const FILL_MS = 3000
/** In the heatwave the can takes this long to fill. */
export const HEATWAVE_FILL_MS = 6000
/** A tap left running this long floods the patches nearest it, and again every time after. */
export const FLOOD_MS = 8000
/** How many patches a flood turns to mud. */
export const FLOOD_PATCHES = 2
/** The tip about the tap shows once the can has sat full under it this long. */
export const TAP_TIP_MS = 4000

// ------------------------------------------------------------------ Mowing

/** The mower runs this many units above your finger, so you can see the blades. */
export const MOWER_LIFT = 30
/** A patch the mower just cut can't be cut again for this long. */
export const CUT_COOLDOWN_MS = 250
/** From this finger speed, in screen pixels per second over 100 ms, the mower shakes and sparks. */
export const MOW_SHAKE_PX = 1000
/** From this finger speed the mower scalps: the patch loses 1 health and gets a scalp mark. */
export const MOW_SCALP_PX = 1300
/** Finger speed for the mower is measured over this window. */
export const MOW_SPEED_WINDOW_MS = 100
/** The grass bag holds this many cuts. */
export const BAG_CUTS = 96
/** The bag lifts off the mower only with at least this many cuts in it. */
export const BAG_LIFT_MIN = 24
/** At this many cuts the bag earns its tip. */
export const BAG_TIP_CUTS = 80
/** Holding the bag over the compost this long empties it. */
export const COMPOST_MS = 1500
/** Mowing a heap patch clears it and adds this many cuts to the bag. */
export const HEAP_CUTS = 6

// ------------------------------------------------------------------ Patio, in lawn units

/** The tap's handle, on the patio's left. Presses within `TAP_REACH` toggle it. */
export const TAP_POS = { lx: 40, ly: 672 } as const
export const TAP_REACH = 30
/** The can's spot under the tap, where it fills. */
export const CAN_POS = { lx: 52, ly: 730 } as const
/** Where the mower and its bag park on the patio. */
export const MOWER_POS = { lx: 220, ly: 712 } as const
/** The grass bag's centre on the parked mower. Presses within its drawn radius lift it. */
export const BAG_POS = { lx: 220, ly: 744 } as const
/** The compost bin on the patio, in lawn units. A bag overlapping it counts as on it. */
export const COMPOST_RECT = { lx: 312, ly: 666, w: 96, h: 80 } as const

// ------------------------------------------------------------------ Simulation

/** Fixed garden tick. */
export const TICK_MS = 1000 / 60

// ------------------------------------------------------------------ Hands

/** Grab reach from a finger, in screen pixels. */
export const REACH_TOUCH_PX = 22
/** Grab reach from a mouse pointer, in screen pixels. */
export const REACH_MOUSE_PX = 10
/** A held item stays within this many units of where you grabbed it, or of its root. */
export const HOLD_CLAMP = 100
/** A rooted weed comes out once your finger is this far from its root. */
export const YANK_PULL = 60

// ------------------------------------------------------------------ Release

/** The release sampler looks this far back from the moment you let go. */
export const RELEASE_WINDOW_MS = 100
/** Sample pairs closer together than this are ignored, to skip event jitter. */
export const RELEASE_PAIR_MIN_MS = 8
/** Slowest release that throws, in screen pixels per second. */
export const THROW_MIN_PX = 400
/** A throw must aim within this many degrees of straight at the fence. */
export const THROW_MAX_ANGLE_DEG = 60

// ------------------------------------------------------------------ Throws

/** Units flown per px/s of swipe speed. */
export const THROW_UNITS_PER_PX = 0.4
/** Swipe speeds above this add nothing. */
export const THROW_MAX_PX = 2500
/** Heavy junk flies this share of a light throw. */
export const HEAVY_DISTANCE = 0.6
/** A throw must carry at least this share of its distance past the fence. */
export const FENCE_MARGIN = 0.15
/** Lowest arc peak in units. */
export const ARC_MIN_H = 300
/** Arc peak as a share of throw distance, when above the minimum. */
export const ARC_H_PER_D = 0.6
/** Flight time base in ms. */
export const FLIGHT_BASE_MS = 800
/** Extra flight ms per unit of distance. */
export const FLIGHT_MS_PER_UNIT = 0.4

// ------------------------------------------------------------------ Arm and hand

/** Each light throw fills the arm meter by this share. */
export const ARM_LIGHT = 0.18
/** Each heavy throw fills the arm meter by this share. */
export const ARM_HEAVY = 0.45
/** The arm meter drains this share per second. */
export const ARM_DRAIN_PER_S = 0.15
/** A full arm meter shortens throws by this share; less full shortens in proportion. */
export const ARM_SHORTEN = 0.4
/** A full arm meter blocks throws for this long. */
export const ARM_LOCK_MS = 1500
/** Your hand needs this long between throws. */
export const HAND_MS = 400

// ------------------------------------------------------------------ Catching

/** A falling item counts as caught within this many times its drawn radius. */
export const CATCH_RADIUS_SCALE = 1.5

/** A clipped throw teeters on the fence top this long before it drops back. */
export const CLIP_TEETER_MS = 600
/** A clipped throw drops back to a depth between these, in units from the fence. */
export const CLIP_DROP_MIN = 20
export const CLIP_DROP_MAX = 80

/** The receiver fast-forwards an arriving flight by the time since it crossed, up to this. */
export const ARRIVAL_FAST_FORWARD_MS = 300
/** Throws sent longer ago than this are dropped. */
export const THROW_WINDOW_MS = 6000
/** The thrower draws a crossed item rising out of view for this long. */
export const GHOST_MS = 300

// ------------------------------------------------------------------ Lawn updates and the peek strip

/** Each garden reports its lawn to the neighbour this often during play. */
export const LAWN_EVERY_MS = 1000
/** The peek strip shows this many of the neighbour's rows nearest the fence. */
export const PEEK_ROW_COUNT = 4
/** A lawn report marks at most this many items in the peek rows. */
export const PEEK_MARKER_CAP = 24
/** A lawn report carries at most this many landings. */
export const LANDING_CAP = 8
/** Their lawn looks this many health levels greener in each round. */
export const PEEK_TINT = [2, 3, 4] as const
/** Their junk draws at this share of its row's scale, because it's further away. */
export const PEEK_ITEM_SCALE = 0.7

// ------------------------------------------------------------------ Landing and sliding

/** Health a light landing takes from its patch. */
export const CRUSH_LIGHT = 1
/** Health a gnome landing takes from its patch. */
export const CRUSH_GNOME = 2
/** A landing skids at this share of its ground speed. */
export const SKID_SHARE = 0.15
/** Slide speed decays as `exp(-SLIDE_DECAY * seconds)`. */
export const SLIDE_DECAY = 6
/** A slide stops below this speed, in units per second. */
export const SLIDE_STOP = 5
/** Falling items (clip drops, hedge drops) accelerate at this many units per second squared. */
export const FALL_GRAVITY = 2400
/** Drawn height of the fence top, in units above the lawn. */
export const FENCE_TOP_H = 40

// ------------------------------------------------------------------ Starting lawn

/** Gnomes standing on each lawn at round start. */
export const START_GNOMES = 3
/** Starting gnomes stand on rows in this range, inclusive. */
export const GNOME_ROW_MIN = 5
export const GNOME_ROW_MAX = 10

// ------------------------------------------------------------------ Weeds, snails and loose things

/** A new weed sprouts this often in each stretch (3:00, 2:20, 1:20 and 0:40 left). */
export const WEED_EVERY_MS = [5000, 3500, 2500, 4000] as const
/** A new snail crawls in this often in each stretch. */
export const SNAIL_EVERY_MS = [15_000, 10_000, 7000, 7000] as const
/** Each scheduled arrival lands this share early or late at most. */
export const SCHEDULE_JITTER = 0.2
/** In round 1 the second weed sprouts on the back row this long after the start (2:50 left). */
export const BACK_ROW_WEED_MS = 10_000
/** A rooted weed drains its patch by 1 health this often. */
export const WEED_DRAIN_MS = 15_000
/** A rooted weed spreads to a neighbouring patch this often. */
export const WEED_SPREAD_MS = 30_000
/** At most this many weeds root in one lawn at once. */
export const WEED_CAP = 40
/** A yanked weed wilts this long after the yank, wherever it lies. */
export const WILT_MS = 20_000
/** Snails crawl this many units per second. */
export const SNAIL_SPEED = 10
/** A snail eats 1 health from the patch it sits on this often. */
export const SNAIL_EAT_MS = 8000
/** At most this many snails crawl in one garden. */
export const SNAIL_CAP = 12
/** A snail shell lying still comes out this long after it stops. */
export const SHELL_MS = 3000
/** Anything loose lying on a patch takes 1 health from it this often. */
export const REST_DAMAGE_MS = 10_000
/** A garden holds at most this many loose items; past it the oldest loose weed wilts. */
export const LOOSE_CAP = 160

// ------------------------------------------------------------------ Biscuit

/** Biscuit's bed on the patio, where he sleeps and rests between jobs. */
export const BED_POS = { lx: 480, ly: 716 } as const
/** Biscuit wakes with this much of a full round left (2:20); `?fast` scales it. */
export const BISCUIT_WAKE_LEFT_MS = 140_000
/** His first dig comes this long after he wakes, drawn from the seed. */
export const DIG_FIRST_MS = [5000, 20_000] as const
/** After that he digs every 40s to 60s, drawn from the seed. */
export const DIG_EVERY_MS = [40_000, 60_000] as const
/** Dig spots fall in these rows and columns, inclusive, clear of the hedges and fence. */
export const DIG_ROWS = [1, 14] as const
export const DIG_COLS = [1, 10] as const
/** He circles the patch this long, growling, before the hole appears. */
export const CIRCLE_MS = 2000
/** Laps he runs round the patch while circling. */
export const CIRCLE_LAPS = 3
/** The circle's radius in units round the patch centre. */
export const CIRCLE_R = 16
/** A press within this many units of the patch centre taps him while he circles. */
export const BISCUIT_HIT = 40
/** A tap during the circle sits him for this long. */
export const SIT_MS = 10_000
/** Digging the hole takes this long before he trots home. */
export const DIG_MS = 600
/** He fetches a light item that lies untouched this long... */
export const FETCH_MS = 3000
/** ...and barks and wags at it at this point, then trots over. */
export const BARK_MS = 1500
/** He fetches at most once this often, counted from each pickup. */
export const FETCH_COOLDOWN_MS = 20_000
/** A carry tramples at most this many patches. */
export const TRAMPLE_MAX = 4
/** Biscuit trots this many units per second. */
export const TROT_SPEED = 260
/** He drops fetched items at this depth: the middle of the back row. */
export const DROP_LY = 620
/** The item in his mouth sits this far in front of him and this high. */
export const MOUTH_DX = 40
export const MOUTH_H = 6

// ------------------------------------------------------------------ Wind

/** Gusts start with this much of a full round left; `?fast` scales them with the round. */
export const GUST_LEFT_MS = [
  130_000, 105_000, 80_000, 55_000, 32_000, 14_000
] as const
/** Each gust starts up to this much early or late, drawn from the seed. */
export const GUST_JITTER_MS = 3000
/** Each gust blows this long. */
export const GUST_MS = 4000
/** The weathervane swings this long before a gust arrives. */
export const VANE_LEAD_MS = 2000
/** A tailwind adds this share to a throw's distance; a headwind takes it off. */
export const WIND_POWER = 0.3
/** An along-fence gust pushes a throw sideways by this share of its distance... */
export const WIND_SIDE_SHARE = 0.25
/** ...up to this many units. */
export const WIND_SIDE_MAX = 150
/** Gusts slide seed clocks, litter and snail shells this many units per second. */
export const WIND_SLIDE = 30

// ------------------------------------------------------------------ Dandelions

/** Dandelions sprout from this round on (0-based: round 2). */
export const DANDELION_FROM_ROUND = 1
/** This share of scheduled weeds sprout as dandelions. */
export const DANDELION_SHARE = 0.25
/** A dandelion turns into a seed clock this long after it sprouts. */
export const CLOCK_MS = 40_000
/** A seed clock bursts into this many seeds when it touches the ground. */
export const CLOCK_SEEDS = 3
/** Each seed roots as a weed this long after it lands. */
export const SEED_ROOT_MS = 10_000
/** Seeds a tailwind carries off fly at least this far past the fence... */
export const SEED_FLY_PAST = 120
/** ...plus up to this much more, drawn from the seed. */
export const SEED_FLY_SPREAD = 160

// ------------------------------------------------------------------ The heavy-junk finale

/** The shed bangs open with this much of a full round left (0:40); `?fast` scales it. */
export const SHED_LEFT_MS = 40_000
/** Gnomes in the crate that spills from the shed. */
export const CRATE_GNOMES = 12
/** Crate gnomes land on these rows and columns, inclusive: the back half of the lawn. */
export const CRATE_ROWS = [8, 13] as const
export const CRATE_COLS = [1, 10] as const
/** Where the crate's gnomes fly out from, and the heavy junk rolls out of: the shed door. */
export const SHED_DOOR = { lx: 584, ly: 760 } as const
/** Each crate gnome's flight takes this long, plus `CRATE_STAGGER_MS` per gnome. */
export const CRATE_FLIGHT_MS = 650
export const CRATE_STAGGER_MS = 60
/** Where the wheelie bin and the trampoline stand on the patio, clear of the other props. */
export const BIN_POS = { lx: 130, ly: 716 } as const
export const TRAMPOLINE_POS = { lx: 540, ly: 742 } as const
/** The bin rolls in from this far to the right of its spot. */
export const BIN_ROLL = 90
/** Hold heavy junk still this long to lift it. */
export const LIFT_MS = 600
/** Up to this much finger wobble, in screen pixels, still counts as holding still. */
export const LIFT_WOBBLE_PX = 12
/** After a lift, a finger this long past the wobble and slower than a throw sets it down. */
export const LIFT_SETTLE_MS = 100
/** A lifted heavy is drawn this many units off the ground. */
export const LIFT_H = 14
/** Footprints in patches (columns by rows). A landing crushes each footprint patch. */
export const FOOTPRINT = {
  bin: [2, 2],
  mower: [2, 2],
  trampoline: [3, 3]
} as const
/** Health a heavy landing takes from each footprint patch. */
export const CRUSH_HEAVY = 2
/** Health a drag takes from each patch it crosses, once per drag. */
export const FLATTEN = 1
/** A thrown mower drives this many patches after it lands, scalping each one. */
export const MOWER_RUN = 4
/** It takes this long to drive each patch. */
export const MOWER_RUN_STEP_MS = 380
/** A landing bin spills this many pieces of litter. */
export const BIN_LITTER = 4
/** Litter spills this far from the bin, plus up to `LITTER_SPREAD` more. */
export const LITTER_REACH = 55
export const LITTER_SPREAD = 35
/** A trampoline sends a landing back the way it came at this share of its distance. */
export const BOUNCE_SHARE = 0.9
/** Bounces shorter than this many units just land. */
export const BOUNCE_MIN = 40
/** The clock ticks each second for this much at the end of a round. */
export const LAST_TICKS_MS = 10_000
/** Shake Fist works at most once in this many ms. */
export const FIST_COOLDOWN_MS = 3000

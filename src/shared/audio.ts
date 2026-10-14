import { settings } from './settings'

/** Every built-in sound effect. */
export const SFX_NAMES = [
  'click',
  'coin',
  'splat',
  'squish',
  'thud',
  'hammer',
  'pop',
  'whoosh',
  'fail',
  'ding',
  'tick',
  'slosh',
  'drip',
  'splash',
  'buzz',
  'bell',
  'slam',
  'rumble',
  'meow',
  'bark',
  'coo',
  'sneeze',
  'ring',
  'pour',
  'scrub',
  'rattle',
  'crank',
  'wind',
  'boing',
  'alarm',
  'snip',
  'laugh',
  'stomp',
  'creak',
  'doorbell',
  'stripe'
] as const

export type SfxName = (typeof SFX_NAMES)[number]

export interface PlayOptions {
  /** Multiplies the settings volume, from 0 to 1. Defaults to 1. */
  volume?: number
  /** Multiplies every frequency. 1.2 is higher and squeakier. Defaults to 1. */
  pitch?: number
}

/** Building blocks shared by every recipe for one playback. */
interface Voice {
  ctx: AudioContext
  out: AudioNode
  t: number
  pitch: number
  noise: AudioBuffer
}

/** The same sound can't restart within this many seconds, so bursts don't stack into noise. */
const MIN_REPEAT_S = 0.03
const SILENT = 0.0001

/** Shapes a gain node with a fast attack and an exponential fade to silence by `start + dur`. */
function envelope(
  v: Voice,
  start: number,
  dur: number,
  peak: number,
  attack: number,
  dest: AudioNode
) {
  const gain = v.ctx.createGain()
  const t0 = v.t + start
  gain.gain.setValueAtTime(SILENT, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(SILENT, t0 + dur)
  gain.connect(dest)
  return gain
}

/** Ramps `param` through `path` (frequencies) spread evenly from `t0` to `t0 + dur`. */
function sweep(
  param: AudioParam,
  path: readonly number[],
  t0: number,
  dur: number,
  scale: number
) {
  param.setValueAtTime((path[0] ?? 440) * scale, t0)
  for (let i = 1; i < path.length; i++) {
    param.exponentialRampToValueAtTime(
      (path[i] as number) * scale,
      t0 + (dur * i) / (path.length - 1)
    )
  }
}

function tone(
  v: Voice,
  type: OscillatorType,
  path: readonly number[],
  start: number,
  dur: number,
  peak: number,
  attack = 0.005,
  dest: AudioNode = v.out
): OscillatorNode {
  const osc = v.ctx.createOscillator()
  osc.type = type
  sweep(osc.frequency, path, v.t + start, dur, v.pitch)
  osc.connect(envelope(v, start, dur, peak, attack, dest))
  osc.start(v.t + start)
  osc.stop(v.t + start + dur + 0.02)
  return osc
}

function noise(
  v: Voice,
  type: BiquadFilterType,
  path: readonly number[],
  q: number,
  start: number,
  dur: number,
  peak: number,
  attack = 0.005
): void {
  const src = v.ctx.createBufferSource()
  src.buffer = v.noise
  src.loop = true
  const filter = filterNode(
    v,
    type,
    path,
    q,
    start,
    dur,
    envelope(v, start, dur, peak, attack, v.out)
  )
  src.connect(filter)
  src.start(v.t + start, Math.random() * 0.5)
  src.stop(v.t + start + dur + 0.02)
}

function filterNode(
  v: Voice,
  type: BiquadFilterType,
  path: readonly number[],
  q: number,
  start: number,
  dur: number,
  dest: AudioNode
): BiquadFilterNode {
  const filter = v.ctx.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  sweep(filter.frequency, path, v.t + start, dur, v.pitch)
  filter.connect(dest)
  return filter
}

/** Wobbles `param` by `depth` at `rate` Hz, for vibrato and tremolo. */
function lfo(
  v: Voice,
  param: AudioParam,
  rate: number,
  depth: number,
  start: number,
  dur: number
) {
  const osc = v.ctx.createOscillator()
  const gain = v.ctx.createGain()
  osc.frequency.value = rate
  gain.gain.value = depth
  osc.connect(gain).connect(param)
  osc.start(v.t + start)
  osc.stop(v.t + start + dur + 0.02)
}

/** One synth recipe per sound. Times are in seconds from the start of playback. */
const RECIPES: Record<SfxName, (v: Voice) => void> = {
  click(v) {
    tone(v, 'square', [1400, 900], 0, 0.03, 0.12)
    noise(v, 'highpass', [3000], 0.7, 0, 0.015, 0.1)
  },
  coin(v) {
    tone(v, 'square', [988], 0, 0.08, 0.1)
    tone(v, 'square', [1319], 0.07, 0.35, 0.1)
  },
  splat(v) {
    noise(v, 'lowpass', [2500, 150], 1, 0, 0.3, 0.7, 0.002)
    tone(v, 'sine', [180, 45], 0, 0.18, 0.6)
  },
  squish(v) {
    noise(v, 'bandpass', [350, 1400, 500], 5, 0, 0.24, 0.7, 0.02)
    const osc = tone(v, 'sine', [260, 140], 0, 0.2, 0.25, 0.02)
    lfo(v, osc.frequency, 25, 40, 0, 0.2)
  },
  thud(v) {
    tone(v, 'sine', [130, 40], 0, 0.22, 0.8)
    noise(v, 'lowpass', [400, 100], 1, 0, 0.12, 0.4)
  },
  hammer(v) {
    tone(v, 'square', [1900, 1700], 0, 0.09, 0.15)
    tone(v, 'triangle', [3200, 3000], 0, 0.14, 0.15)
    noise(v, 'highpass', [2500], 1, 0, 0.04, 0.5)
    tone(v, 'sine', [160, 60], 0, 0.12, 0.5)
  },
  pop(v) {
    tone(v, 'sine', [300, 1100], 0, 0.07, 0.6)
    noise(v, 'bandpass', [1500], 2, 0, 0.03, 0.3)
  },
  whoosh(v) {
    noise(v, 'bandpass', [400, 2200, 600], 1.2, 0, 0.4, 0.5, 0.15)
  },
  fail(v) {
    // Sad trombone: four falling notes through a soft low-pass, the last one wobbling.
    const muffle = filterNode(v, 'lowpass', [1400], 1, 0, 2, v.out)
    const notes = [196, 185, 174.6]
    notes.forEach((freq, i) =>
      tone(v, 'sawtooth', [freq], i * 0.3, 0.32, 0.2, 0.03, muffle)
    )
    const last = tone(v, 'sawtooth', [164.8, 160], 0.9, 0.9, 0.22, 0.03, muffle)
    lfo(v, last.frequency, 5.5, 5, 0.9, 0.9)
  },
  ding(v) {
    tone(v, 'sine', [1760], 0, 0.9, 0.3)
    tone(v, 'sine', [2637], 0, 0.5, 0.1)
  },
  stripe(v) {
    // A soft rising pair of chimes, quieter and shorter than ding.
    tone(v, 'sine', [1319], 0, 0.3, 0.12)
    tone(v, 'sine', [1976], 0.08, 0.5, 0.1)
  },
  tick(v) {
    tone(v, 'square', [3200], 0, 0.012, 0.1)
  },
  slosh(v) {
    noise(v, 'lowpass', [300, 900, 350], 3, 0, 0.45, 0.5, 0.06)
    noise(v, 'bandpass', [600, 1200, 500], 2, 0.12, 0.35, 0.25, 0.05)
  },
  drip(v) {
    tone(v, 'sine', [500, 1600], 0, 0.08, 0.5, 0.002)
  },
  splash(v) {
    noise(v, 'highpass', [1200, 600], 0.7, 0, 0.55, 0.6, 0.003)
    noise(v, 'lowpass', [1500, 300], 1, 0, 0.25, 0.5)
    tone(v, 'sine', [900, 1800], 0.12, 0.06, 0.15, 0.002)
    tone(v, 'sine', [700, 1500], 0.2, 0.06, 0.12, 0.002)
  },
  buzz(v) {
    const muffle = filterNode(v, 'lowpass', [1800], 1, 0, 0.8, v.out)
    const osc = tone(
      v,
      'sawtooth',
      [210, 240, 200, 230],
      0,
      0.7,
      0.12,
      0.05,
      muffle
    )
    lfo(v, osc.frequency, 30, 12, 0, 0.7)
  },
  bell(v) {
    for (const start of [0, 0.22]) {
      tone(v, 'sine', [2093], start, 0.5, 0.22, 0.002)
      tone(v, 'sine', [2794], start, 0.3, 0.1, 0.002)
      tone(v, 'sine', [4186], start, 0.15, 0.05, 0.002)
    }
  },
  slam(v) {
    noise(v, 'lowpass', [900, 120], 1, 0, 0.35, 0.9, 0.002)
    tone(v, 'sine', [90, 35], 0, 0.3, 0.9)
    noise(v, 'bandpass', [2500], 3, 0.03, 0.12, 0.2)
  },
  rumble(v) {
    noise(v, 'lowpass', [140], 1, 0, 1.4, 0.6, 0.35)
    const muffle = filterNode(v, 'lowpass', [200], 1, 0, 1.4, v.out)
    tone(v, 'sawtooth', [45, 52, 40], 0, 1.4, 0.25, 0.35, muffle)
  },
  meow(v) {
    const mouth = filterNode(v, 'bandpass', [700, 1800, 600], 2, 0, 0.55, v.out)
    tone(v, 'sawtooth', [450, 750, 380], 0, 0.55, 0.5, 0.04, mouth)
  },
  bark(v) {
    const mouth = filterNode(v, 'bandpass', [900, 500], 1.5, 0, 0.16, v.out)
    tone(v, 'sawtooth', [320, 170], 0, 0.16, 0.6, 0.005, mouth)
    noise(v, 'bandpass', [1100, 600], 1, 0, 0.12, 0.3)
  },
  coo(v) {
    const throat = filterNode(v, 'lowpass', [900], 1, 0, 0.9, v.out)
    const first = tone(
      v,
      'triangle',
      [330, 400, 340],
      0,
      0.35,
      0.35,
      0.08,
      throat
    )
    const second = tone(
      v,
      'triangle',
      [360, 420, 330],
      0.4,
      0.45,
      0.3,
      0.08,
      throat
    )
    lfo(v, first.frequency, 7, 15, 0, 0.35)
    lfo(v, second.frequency, 7, 15, 0.4, 0.45)
  },
  sneeze(v) {
    const mouth = filterNode(v, 'lowpass', [1200], 1, 0, 0.7, v.out)
    tone(v, 'sawtooth', [260, 340], 0, 0.35, 0.12, 0.15, mouth)
    noise(v, 'highpass', [3000, 1800], 0.8, 0.38, 0.35, 0.8, 0.005)
    tone(v, 'sawtooth', [380, 220], 0.38, 0.25, 0.15, 0.005, mouth)
  },
  ring(v) {
    const bell = v.ctx.createGain()
    bell.gain.value = 0.5
    bell.connect(v.out)
    lfo(v, bell.gain, 20, 0.5, 0, 0.8)
    tone(v, 'sine', [440], 0, 0.8, 0.3, 0.01, bell)
    tone(v, 'sine', [480], 0, 0.8, 0.3, 0.01, bell)
  },
  pour(v) {
    noise(v, 'bandpass', [500, 1300], 1.5, 0, 0.9, 0.35, 0.08)
    noise(v, 'lowpass', [700], 1, 0, 0.9, 0.2, 0.08)
  },
  scrub(v) {
    noise(v, 'bandpass', [2200, 3000], 2, 0, 0.1, 0.4, 0.02)
    noise(v, 'bandpass', [3000, 2200], 2, 0.13, 0.1, 0.4, 0.02)
  },
  rattle(v) {
    for (let i = 0; i < 7; i++) {
      const start = i * 0.045 + Math.random() * 0.02
      noise(v, 'bandpass', [3500], 4, start, 0.025, 0.4)
      tone(v, 'square', [600 + Math.random() * 400], start, 0.02, 0.06)
    }
  },
  crank(v) {
    for (let i = 0; i < 5; i++) {
      noise(v, 'bandpass', [1800], 6, i * 0.06, 0.03, 0.5)
      tone(v, 'square', [220], i * 0.06, 0.025, 0.08)
    }
  },
  wind(v) {
    noise(v, 'bandpass', [400, 900, 500], 0.9, 0, 1.6, 0.4, 0.5)
    noise(v, 'bandpass', [700, 1300, 800], 3, 0.2, 1.3, 0.2, 0.4)
  },
  boing(v) {
    // A cartoon spring: a pitch bend up and down with a fast wobble that dies away.
    const spring = tone(
      v,
      'triangle',
      [140, 420, 220, 300],
      0,
      0.42,
      0.5,
      0.004
    )
    lfo(v, spring.frequency, 22, 45, 0, 0.42)
    noise(v, 'bandpass', [900], 3, 0, 0.03, 0.2)
  },
  alarm(v) {
    // A smoke alarm: three shrill beeps, square for the bite and sine for the body.
    for (const start of [0, 0.28, 0.56]) {
      tone(v, 'square', [2900], start, 0.18, 0.08, 0.003)
      tone(v, 'sine', [2900], start, 0.18, 0.16, 0.003)
    }
  },
  snip(v) {
    // Scissors: two quick metallic shears as the blades close.
    for (const start of [0, 0.06]) {
      noise(v, 'highpass', [5000, 3500], 1, start, 0.04, 0.45, 0.002)
      tone(v, 'triangle', [2400, 1700], start, 0.035, 0.12, 0.002)
    }
  },
  laugh(v) {
    // A smug "heh heh heh": three nasal bursts through a mouth filter, each a little lower.
    const mouth = filterNode(v, 'bandpass', [900, 700], 2, 0, 0.75, v.out)
    for (let i = 0; i < 3; i++) {
      const start = i * 0.21
      tone(
        v,
        'sawtooth',
        [230 - i * 18, 190 - i * 18],
        start,
        0.12,
        0.5,
        0.01,
        mouth
      )
      noise(v, 'bandpass', [1600], 1.5, start, 0.07, 0.12)
    }
  },
  stomp(v) {
    // A heavy footstep through the ceiling: a low thump and a muffled knock.
    tone(v, 'sine', [95, 45], 0, 0.18, 0.9)
    noise(v, 'lowpass', [320, 120], 1, 0, 0.12, 0.6)
  },
  creak(v) {
    // Old wood complaining: a slow wobbling squeak through a narrow filter.
    const wood = filterNode(v, 'bandpass', [600, 900, 500], 6, 0, 0.7, v.out)
    const osc = tone(v, 'sawtooth', [180, 260, 150], 0, 0.7, 0.35, 0.05, wood)
    lfo(v, osc.frequency, 9, 18, 0, 0.7)
  },
  doorbell(v) {
    // Ding-dong: two bell tones a major third apart, each with a quiet overtone.
    for (const [start, freq] of [
      [0, 659],
      [0.42, 523]
    ] as const) {
      tone(v, 'sine', [freq], start, 0.9, 0.35, 0.004)
      tone(v, 'sine', [freq * 2.76], start, 0.35, 0.06, 0.002)
    }
  }
}

// ---------------------------------------------------------------- Loops

/** Every built-in looping sound, for actions that last: pouring, boiling, weather, traffic. */
export const LOOP_NAMES = ['pour', 'boil', 'wind', 'rain', 'rumble'] as const

export type LoopName = (typeof LOOP_NAMES)[number]

/** Controls one playing loop. */
export interface LoopHandle {
  /** Sets this loop's volume from 0 to 1, with a 30 ms glide. */
  setVolume(volume: number): void
  /** Fades out over `fadeMs` (default 150) and stops. Calling it again does nothing. */
  stop(fadeMs?: number): void
}

/** Building blocks for one loop. Every source in `sources` starts and stops with the loop. */
interface LoopVoice {
  ctx: AudioContext
  out: AudioNode
  pitch: number
  noise: AudioBuffer
  sources: AudioScheduledSourceNode[]
}

/** Endless filtered noise at a fixed level. Returns the filter and gain so LFOs can move them. */
function loopNoise(
  v: LoopVoice,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  level: number
): { filter: BiquadFilterNode; gain: GainNode } {
  const src = v.ctx.createBufferSource()
  src.buffer = v.noise
  src.loop = true
  const filter = v.ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency * v.pitch
  filter.Q.value = q
  const gain = v.ctx.createGain()
  gain.gain.value = level
  src.connect(filter).connect(gain).connect(v.out)
  v.sources.push(src)
  return { filter, gain }
}

/** Endless oscillator through `dest`. */
function loopTone(
  v: LoopVoice,
  type: OscillatorType,
  frequency: number,
  level: number,
  dest: AudioNode
): OscillatorNode {
  const osc = v.ctx.createOscillator()
  osc.type = type
  osc.frequency.value = frequency * v.pitch
  const gain = v.ctx.createGain()
  gain.gain.value = level
  osc.connect(gain).connect(dest)
  v.sources.push(osc)
  return osc
}

/** Wobbles `param` by `depth` at `rate` Hz for as long as the loop plays. */
function loopLfo(
  v: LoopVoice,
  param: AudioParam,
  rate: number,
  depth: number
): void {
  const osc = v.ctx.createOscillator()
  osc.frequency.value = rate
  const gain = v.ctx.createGain()
  gain.gain.value = depth
  osc.connect(gain).connect(param)
  v.sources.push(osc)
}

const LOOP_RECIPES: Record<LoopName, (v: LoopVoice) => void> = {
  pour(v) {
    const stream = loopNoise(v, 'bandpass', 900, 1.2, 0.5)
    loopLfo(v, stream.filter.frequency, 3.1, 250 * v.pitch)
    loopNoise(v, 'lowpass', 600, 1, 0.22)
  },
  boil(v) {
    // Two LFOs at unrelated rates on the level make an irregular bubbling.
    const water = loopNoise(v, 'lowpass', 500, 2, 0.3)
    loopLfo(v, water.gain.gain, 6.3, 0.18)
    loopLfo(v, water.gain.gain, 9.7, 0.12)
    const pops = loopNoise(v, 'bandpass', 1200, 4, 0.08)
    loopLfo(v, pops.gain.gain, 4.3, 0.08)
  },
  wind(v) {
    const gust = loopNoise(v, 'bandpass', 500, 0.9, 0.4)
    loopLfo(v, gust.filter.frequency, 0.17, 250 * v.pitch)
    loopLfo(v, gust.gain.gain, 0.11, 0.15)
  },
  rain(v) {
    loopNoise(v, 'highpass', 1800, 0.7, 0.25)
    loopNoise(v, 'bandpass', 4500, 1, 0.15)
  },
  rumble(v) {
    const road = loopNoise(v, 'lowpass', 140, 1, 0.6)
    loopLfo(v, road.gain.gain, 7, 0.08)
    const muffle = v.ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = 200 * v.pitch
    muffle.connect(v.out)
    const engine = loopTone(v, 'sawtooth', 45, 0.25, muffle)
    loopLfo(v, engine.frequency, 0.6, 4 * v.pitch)
  }
}

const SILENT_LOOP: LoopHandle = { setVolume: noop, stop: noop }

// ---------------------------------------------------------------- Player

class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private readonly lastPlayed = new Map<SfxName, number>()

  /** True once `unlock` has run, so sounds can play. Nothing plays before it. */
  get unlocked(): boolean {
    return this.ctx !== null
  }

  /** Creates or resumes the audio context. Call from the first tap or key press. */
  unlock(): void {
    const ctx = this.ensure()
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(noop)
  }

  /** Plays a sound if sound is on and audio is unlocked. Cheap to call often. */
  play(name: SfxName, { volume = 1, pitch = 1 }: PlayOptions = {}): void {
    const { sound, volume: master } = settings.get()
    const ctx = this.ctx
    if (
      !sound ||
      master <= 0 ||
      volume <= 0 ||
      !ctx ||
      !this.master ||
      !this.noiseBuffer
    )
      return
    // Sounds scheduled while suspended play once the context resumes.
    if (ctx.state !== 'running') void ctx.resume().catch(noop)
    const t = ctx.currentTime
    if (t - (this.lastPlayed.get(name) ?? -1) < MIN_REPEAT_S) return
    this.lastPlayed.set(name, t)
    const out = ctx.createGain()
    out.gain.value = Math.min(1, volume)
    out.connect(this.master)
    RECIPES[name]({ ctx, out, t: t + 0.005, pitch, noise: this.noiseBuffer })
  }

  /**
   * Starts a looping sound and returns its handle. Start it once when the action starts,
   * keep the handle, and `stop()` it when the action ends. It follows the sound and
   * volume settings while it plays. Before `unlock`, it returns a handle that does nothing.
   */
  loop(
    name: LoopName,
    { volume = 1, pitch = 1 }: PlayOptions = {}
  ): LoopHandle {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noiseBuffer) return SILENT_LOOP
    if (ctx.state !== 'running') void ctx.resume().catch(noop)
    const t = ctx.currentTime
    const out = ctx.createGain()
    // Fade in so the loop doesn't start with a click.
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(clamp01(volume), t + 0.08)
    out.connect(this.master)
    const sources: AudioScheduledSourceNode[] = []
    LOOP_RECIPES[name]({ ctx, out, pitch, noise: this.noiseBuffer, sources })
    for (const source of sources) source.start(t)
    let stopped = false
    return {
      setVolume(next) {
        if (stopped) return
        out.gain.setTargetAtTime(clamp01(next), ctx.currentTime, 0.03)
      },
      stop(fadeMs = 150) {
        if (stopped) return
        stopped = true
        const now = ctx.currentTime
        const end = now + Math.max(0.01, fadeMs / 1000)
        out.gain.cancelScheduledValues(now)
        out.gain.setValueAtTime(out.gain.value, now)
        out.gain.linearRampToValueAtTime(0, end)
        for (const source of sources) source.stop(end + 0.02)
        const first = sources[0]
        if (first) first.onended = () => out.disconnect()
      }
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    if (typeof window === 'undefined') return null
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()
    const compressor = ctx.createDynamicsCompressor()
    compressor.connect(ctx.destination)
    const master = ctx.createGain()
    master.connect(compressor)
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    // The master level follows the settings, so playing loops react to the Sound switch and Volume.
    const syncVolume = () => {
      const { sound, volume } = settings.get()
      master.gain.setTargetAtTime(
        sound ? volume * 0.9 : 0,
        ctx.currentTime,
        0.02
      )
    }
    master.gain.value = 0
    syncVolume()
    settings.subscribe(syncVolume)

    // iPhones suspend audio after calls and app switches. Any later tap or key press may
    // resume it, so listen on the whole page, not only on buttons that play a sound.
    const resume = () => {
      if (ctx.state !== 'running') void ctx.resume().catch(noop)
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resume()
    })
    window.addEventListener('pointerdown', resume, true)
    window.addEventListener('keydown', resume, true)

    this.ctx = ctx
    this.master = master
    this.noiseBuffer = buffer
    return ctx
  }
}

/**
 * Synthesised comedy sound effects. No audio files. Respects the sound and volume settings.
 *
 * @example
 * sfx.unlock() // in the Tap to Start handler
 * sfx.play('splat', { pitch: randRange(0.9, 1.1) })
 * const pouring = sfx.loop('pour') // later: pouring.stop()
 */
export const sfx = new Sfx()

/** Vibrates the phone for `pattern` ms where supported. Does nothing elsewhere. */
export function vibrate(pattern: number | number[]): void {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    navigator.vibrate(pattern)
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function noop(): void {}

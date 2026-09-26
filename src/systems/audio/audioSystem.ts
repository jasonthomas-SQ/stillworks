// WebAudio, no library. Everything is synthesised from filtered noise, so this
// milestone ships zero audio files.
//
// A playback wrapper like Howler hides exactly the nodes this needs — biquad
// filters and slow LFOs on their own gain stages — so it would cost a
// dependency and buy nothing.

import { CONFIG } from '../../config';
import type { SkyState } from '../../world/sky/skyPalette';
import { windGainAt, waterGainAt, planFootsteps, footstepRate } from './synth';

type Bus = 'ambient' | 'world' | 'ui';

/** Two seconds of looping filtered noise. Built once, reused by every voice. */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic, and smoothed so it is closer to pink than to white — raw
  // white noise reads as static rather than as weather.
  let last = 0;
  let seed = CONFIG.seed;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    last = last * 0.86 + white * 0.14;
    data[i] = last * 3.2;
  }
  // Crossfade the seam so the loop has no click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[i] = data[i]! * k + data[length - fade + i]! * (1 - k);
  }
  return buffer;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private noise: AudioBuffer | null = null;

  private wind: GainNode | null = null;
  private water: GainNode | null = null;

  private footstepCarry = 0;
  private footstepIndex = 0;
  private lastDistance = 0;

  /** True once the context is running. The UI reads this in M3. */
  unlocked = false;
  /** Set when resume() is refused, so settings can say so rather than lying. */
  blocked = false;

  private readonly levels: Record<Bus, number> = { ambient: 0.7, world: 0.8, ui: 0.9 };

  /**
   * Build and resume on a genuine user gesture. Browsers hold the context until
   * one arrives, so this is called from the first key or pointer press.
   *
   * Never throws. If resume is refused the game runs silent and `blocked` is
   * set — a game that will not start because audio failed is a worse bug than
   * a quiet one.
   */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        this.blocked = true;
        return;
      }
      this.ctx ??= new Ctor();
      await this.ctx.resume();
      if (this.ctx.state !== 'running') {
        this.blocked = true;
        return;
      }
      this.build();
      this.unlocked = true;
      this.blocked = false;
    } catch {
      this.blocked = true;
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    this.noise = makeNoiseBuffer(ctx);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    for (const name of ['ambient', 'world', 'ui'] as Bus[]) {
      const g = ctx.createGain();
      g.gain.value = this.levels[name];
      g.connect(this.master);
      this.buses.set(name, g);
    }

    this.wind = this.buildWind();
    this.water = this.buildWater();

    // Fade up over 1.6 s rather than snapping on, per the UI spec's title flow.
    this.master.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.6);
  }

  /** Bandpassed noise with two slow LFOs, so it breathes without repeating. */
  private buildWind(): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 600;
    band.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(band).connect(gain).connect(this.buses.get('ambient')!);

    // Filter sweep and gain swell on different periods, so they never line up.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.07;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 260;
    sweep.connect(sweepDepth).connect(band.frequency);
    sweep.start();

    const swell = ctx.createOscillator();
    swell.frequency.value = 0.11;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.18;
    swell.connect(swellDepth).connect(gain.gain);
    swell.start();

    src.start();
    return gain;
  }

  /** Highpassed noise: the stream and the pool. */
  private buildWater(): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1200;

    const shape = ctx.createBiquadFilter();
    shape.type = 'peaking';
    shape.frequency.value = 2600;
    shape.gain.value = 5;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(high).connect(shape).connect(gain).connect(this.buses.get('ambient')!);
    src.start();
    return gain;
  }

  /** A short filtered noise burst. Splashier and longer in water. */
  private footstep(inWater: boolean, index: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = footstepRate(index, inWater);

    const filter = ctx.createBiquadFilter();
    filter.type = inWater ? 'highpass' : 'lowpass';
    filter.frequency.value = inWater ? 900 : 1500;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const decay = inWater ? 0.22 : 0.09;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(inWater ? 0.22 : 0.3, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    src.connect(filter).connect(gain).connect(this.buses.get('world')!);
    src.start(now);
    src.stop(now + decay + 0.05);
  }

  setBusLevel(bus: Bus, value: number): void {
    this.levels[bus] = value;
    const g = this.buses.get(bus);
    if (g && this.ctx) g.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  update(
    hero: { y: number; inWater: boolean; distanceTravelled: number },
    distanceToWater: number,
    state: SkyState,
  ): void {
    if (!this.unlocked || !this.ctx) {
      this.lastDistance = hero.distanceTravelled;
      return;
    }
    const now = this.ctx.currentTime;

    this.wind?.gain.setTargetAtTime(windGainAt(hero.y, state.windGain), now, 0.4);
    this.water?.gain.setTargetAtTime(waterGainAt(distanceToWater) * 0.5, now, 0.3);

    const moved = Math.max(0, hero.distanceTravelled - this.lastDistance);
    this.lastDistance = hero.distanceTravelled;
    const plan = planFootsteps(this.footstepCarry, moved);
    this.footstepCarry = plan.remainder;
    for (let i = 0; i < Math.min(plan.steps, 3); i++) {
      this.footstep(hero.inWater, this.footstepIndex++);
    }
  }

  /** Mute and suspend when the tab goes away; the loop is paused anyway. */
  setTabVisible(visible: boolean): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(visible ? 1 : 0, now, 0.05);
    if (visible) void this.ctx.resume();
    else window.setTimeout(() => void this.ctx?.suspend(), 150);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.unlocked = false;
  }
}

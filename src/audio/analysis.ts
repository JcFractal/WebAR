import type { AudioSettings } from '../config';

/**
 * Turns per-frame microphone RMS into the shared swarm controls. Pure and deterministic
 * (no Web Audio), so it can be checked with synthetic input. This is a sound heuristic:
 * any steady sound (hum, held vowel, music, room noise) can read as "steady".
 */
export type VoiceState = 'calibrating' | 'quiet' | 'sound' | 'steady';

export interface VoiceFrame {
  /** Smoothed level above the noise floor, 0..1. */
  energy: number;
  /** 0 = rapidly varying (speech), 1 = steady envelope. */
  steadiness: number;
  gatherTarget: number;
  /** True when the target comes from quiet settling (uses `quietSettleSeconds`). */
  settling: boolean;
  /** Burst strength to trigger this frame, 0 = none. */
  burst: number;
  state: VoiceState;
  levelDb: number;
  calibrationProgress: number;
}

const MIN_RMS = 1e-5;
const DEFAULT_FLOOR_DB = -60;
/** Gather target while sound is varying: the shape loosens but speech stirs rather than erases it. */
const SPEECH_GATHER = 0.15;
const PEAK_DECAY_DB_PER_S = 12;
/** Sound must last this long before it loosens the shape, so a single clap only bursts. */
const LOOSEN_AFTER_SECONDS = 0.6;

const toDb = (rms: number) => 20 * Math.log10(Math.max(rms, MIN_RMS));
const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class VoiceAnalyzer {
  noiseFloorDb = DEFAULT_FLOOR_DB;
  calibrated = false;

  private calibration: { elapsed: number; levels: number[] } | null = null;
  private energy = 0;
  private mean = 0;
  private variation = 0;
  private active = false;
  private steadyTime = 0;
  private steadyLatched = false;
  private quietTime = 0;
  private activeTime = 0;
  /** Recent peak level with slow decay: onsets are measured against it, so syllables after short gaps don't burst. */
  private peakDb = toDb(0);
  private cooldown = 0;
  private armed = true;
  private gatherTarget = 0;
  private settling = false;

  calibrate(): void {
    this.calibration = { elapsed: 0, levels: [] };
  }

  get isCalibrating(): boolean {
    return this.calibration !== null;
  }

  step(rms: number, dt: number, s: AudioSettings): VoiceFrame {
    const levelDb = toDb(rms);
    let burst = 0;

    if (this.calibration) {
      const c = this.calibration;
      c.elapsed += dt;
      c.levels.push(levelDb);
      this.energy *= 1 - ease(dt, 0.25);
      this.peakDb = levelDb;
      if (c.elapsed >= s.calibrationSeconds) {
        // 90th percentile: ordinary room fluctuations stay at or below the floor.
        const sorted = c.levels.sort((a, b) => a - b);
        this.noiseFloorDb = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
        this.calibrated = true;
        this.calibration = null;
      }
      return this.frame(levelDb, 0, 'calibrating', c.elapsed / s.calibrationSeconds);
    }

    const raw = clamp01(((levelDb - this.noiseFloorDb) * s.gain) / s.dynamicRangeDb);
    this.energy += (raw - this.energy) * ease(dt, raw > this.energy ? 0.04 : 0.25);

    if (!this.active && this.energy > s.enterThreshold) this.active = true;
    else if (this.active && this.energy < s.exitThreshold) this.active = false;

    // Steadiness: recent envelope variation relative to its mean level.
    this.mean += (raw - this.mean) * ease(dt, 0.4);
    this.variation += (Math.abs(raw - this.mean) - this.variation) * ease(dt, 0.35);
    const steadiness = this.active ? clamp01(1 - this.variation / Math.max(this.mean, 0.05) / 0.5) : 0;

    if (this.active && steadiness >= s.steadyThreshold) this.steadyTime += dt;
    else this.steadyTime -= dt * 0.75;
    this.steadyTime = Math.min(s.steadyHoldSeconds, Math.max(0, this.steadyTime));
    if (this.steadyTime >= s.steadyHoldSeconds) this.steadyLatched = true;
    else if (this.steadyTime <= s.steadyHoldSeconds * 0.5) this.steadyLatched = false;

    this.quietTime = this.active ? 0 : this.quietTime + dt;
    this.activeTime = this.active ? this.activeTime + dt : 0;

    if (this.steadyLatched) {
      this.gatherTarget = 1;
      this.settling = false;
    } else if (this.active && this.activeTime >= LOOSEN_AFTER_SECONDS) {
      this.gatherTarget = SPEECH_GATHER;
      this.settling = false;
    } else if (this.quietTime >= s.quietDelaySeconds) {
      this.gatherTarget = 1;
      this.settling = true;
    }
    // Short pause: keep the previous target so the bloom does not snap in between syllables.

    // Sharp onset: a jump well above the recent peak (which decays slowly toward the noise floor).
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.peakDb = Math.max(this.noiseFloorDb, this.peakDb - PEAK_DECAY_DB_PER_S * dt);
    const onset = levelDb - this.peakDb;
    if (this.armed && this.cooldown === 0 && onset >= s.burstThresholdDb && raw >= s.burstMinEnergy) {
      burst = Math.min(1, 0.6 + (onset - s.burstThresholdDb) / 20);
      this.cooldown = s.burstCooldownSeconds;
      this.armed = false;
    } else if (onset < s.burstThresholdDb * 0.5) {
      this.armed = true;
    }
    this.peakDb = Math.max(this.peakDb, levelDb);

    const state: VoiceState = this.steadyLatched ? 'steady' : this.active ? 'sound' : 'quiet';
    return this.frame(levelDb, steadiness, state, 1, burst);
  }

  private frame(levelDb: number, steadiness: number, state: VoiceState, progress: number, burst = 0): VoiceFrame {
    return {
      energy: this.energy,
      steadiness,
      gatherTarget: this.gatherTarget,
      settling: this.settling,
      burst,
      state,
      levelDb,
      calibrationProgress: clamp01(progress),
    };
  }
}

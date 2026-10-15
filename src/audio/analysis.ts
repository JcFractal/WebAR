import type { AudioSettings } from '../config';

/**
 * Turns per-frame microphone RMS into the shared swarm controls. Pure and deterministic
 * (no Web Audio), so it can be checked with synthetic input. This is a sound heuristic:
 * any steady sound (hum, held vowel, music, room noise) can read as "steady".
 *
 * Mapping: voice draws the particles toward the formation (`voiceGather`), steady sound
 * strengthens it to the full formation, silence releases it into a calm drifting cloud.
 */
export type VoiceState = 'calibrating' | 'quiet' | 'sound' | 'steady';

export interface VoiceFrame {
  /** Smoothed level above the noise floor, 0..1. */
  energy: number;
  /** 0 = rapidly varying (speech), 1 = steady envelope. */
  steadiness: number;
  gatherTarget: number;
  /** True when silence is releasing the formation (uses `quietSettleSeconds`). */
  settling: boolean;
  /** Burst strength to trigger this frame, 0 = none. */
  burst: number;
  state: VoiceState;
  levelDb: number;
  calibrationProgress: number;
}

const MIN_RMS = 1e-5;
const DEFAULT_FLOOR_DB = -60;
const PEAK_DECAY_DB_PER_S = 12;
/** After a burst, hold the gather target this long so a lone clap bursts without also pulling the shape in. */
const BURST_PULL_HOLD_SECONDS = 0.45;

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
  /** 0..1: how long steady sound has been held, relative to `steadyHoldSeconds`. */
  private steadyProgress = 0;
  private quietTime = 0;
  /** Recent peak level with slow decay: onsets are measured against it, so syllables after short gaps don't burst. */
  private peakDb = toDb(0);
  private cooldown = 0;
  private pullHold = 0;
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
      this.energy *= 1 - ease(dt, 0.2);
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
    this.energy += (raw - this.energy) * ease(dt, raw > this.energy ? 0.03 : 0.2);

    if (!this.active && this.energy > s.enterThreshold) this.active = true;
    else if (this.active && this.energy < s.exitThreshold) this.active = false;

    // Steadiness: recent envelope variation relative to its mean level.
    this.mean += (raw - this.mean) * ease(dt, 0.2);
    this.variation += (Math.abs(raw - this.mean) - this.variation) * ease(dt, 0.2);
    const steadiness = this.active ? clamp01(1 - this.variation / Math.max(this.mean, 0.05) / 0.5) : 0;

    const hold = Math.max(0.05, s.steadyHoldSeconds);
    if (this.active && steadiness >= s.steadyThreshold) this.steadyProgress += dt / hold;
    else this.steadyProgress -= dt / (hold * (this.active ? 1 : 2));
    this.steadyProgress = clamp01(this.steadyProgress);

    this.quietTime = this.active ? 0 : this.quietTime + dt;
    this.pullHold = Math.max(0, this.pullHold - dt);

    // Sharp onset: a jump well above the recent peak (which decays slowly toward the noise floor).
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.peakDb = Math.max(this.noiseFloorDb, this.peakDb - PEAK_DECAY_DB_PER_S * dt);
    const onset = levelDb - this.peakDb;
    if (this.armed && this.cooldown === 0 && onset >= s.burstThresholdDb && raw >= s.burstMinEnergy) {
      burst = Math.min(1, 0.6 + (onset - s.burstThresholdDb) / 20);
      this.cooldown = s.burstCooldownSeconds;
      this.armed = false;
      this.pullHold = BURST_PULL_HOLD_SECONDS;
    } else if (onset < s.burstThresholdDb * 0.5) {
      this.armed = true;
    }
    this.peakDb = Math.max(this.peakDb, levelDb);

    if (this.active && this.pullHold > 0) {
      // Just burst: keep the current target until it is clear whether the sound continues.
    } else if (this.active) {
      // Voice pulls toward the formation right away; holding a steady tone completes it.
      this.gatherTarget = s.voiceGather + (1 - s.voiceGather) * this.steadyProgress;
      this.settling = false;
    } else if (this.quietTime >= s.quietDelaySeconds) {
      this.gatherTarget = 0;
      this.settling = true;
    }
    // Short pause: keep the previous target so the shape does not drop between syllables or breaths.

    const state: VoiceState = this.active ? (this.steadyProgress >= 1 ? 'steady' : 'sound') : 'quiet';
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

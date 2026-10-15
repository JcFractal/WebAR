import type { AudioSettings } from '../config';

/**
 * Turns per-frame microphone measurements into the shared swarm controls. Pure and deterministic
 * (no Web Audio), so it can be checked with synthetic input. This is a sound heuristic, not
 * speech or pitch recognition: any steady tonal sound (hum, held vowel, sustained note) builds
 * the formation.
 *
 * Mapping (continuous, no on/off switch):
 * - `energy` (level above the noise floor) drives motion: brightness, point size, ripples.
 * - `turbulence` = loud × unsteady: varying speech churns the cloud without forming it.
 * - Coherence target = max(soft speech → `speechCoherence`, steady × tonal × loudness), so a soft
 *   hum holds an intermediate shape and a fuller hum completes it.
 * - Silence keeps the current shape for `quietDelaySeconds` (breaths), then relaxes it.
 */
export type VoiceState = 'calibrating' | 'quiet' | 'sound' | 'tonal';

export interface VoiceInput {
  rms: number;
  /** Analyser magnitudes in dB (`getFloatFrequencyData`), or null when unavailable. */
  spectrum: ArrayLike<number> | null;
  sampleRate: number;
  fftSize: number;
}

export interface VoiceFrame {
  /** Smoothed level above the noise floor, 0..1. */
  energy: number;
  /** 0 = rapidly varying envelope (speech), 1 = steady. */
  steadiness: number;
  /** Smoothed tonality, 0 = noise-like, 1 = harmonic. */
  tonality: number;
  /** Formation coherence the sound is asking for, 0..1. */
  gatherTarget: number;
  /** Extra motion from loud, varying sound, 0..1. */
  turbulence: number;
  /** True when silence is relaxing the formation (uses `quietSettleSeconds`). */
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
/** After a burst, hold the target this long so a lone clap bursts without changing the shape. */
const BURST_PULL_HOLD_SECONDS = 0.45;
const TONAL_MIN_HZ = 90;
const TONAL_MAX_HZ = 3000;

const toDb = (rms: number) => 20 * Math.log10(Math.max(rms, MIN_RMS));
const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / Math.max(tau, 1e-3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * Tonality from analyser magnitudes in dB (`getFloatFrequencyData`): one minus the spectral
 * flatness over 90 Hz–3 kHz, on a log scale, after removing the calibrated noise spectrum.
 * Harmonic sounds (hum, sung vowel) score near 1; broadband noise louder than the calibrated
 * room (fans, crowd hiss) scores low. Not a pitch detector.
 */
export function spectralTonality(db: ArrayLike<number>, sampleRate: number, fftSize: number, noise: ArrayLike<number> | null = null): number {
  const hz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(TONAL_MIN_HZ / hz));
  const hi = Math.min(db.length - 1, Math.ceil(TONAL_MAX_HZ / hz));
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    let p = Math.pow(10, Math.max(db[i], -160) / 10);
    if (noise) p = Math.max(p - 2 * noise[i], 0.02 * noise[i] + 1e-16);
    logSum += Math.log(p + 1e-16);
    sum += p;
    n++;
  }
  if (n === 0 || sum <= 0) return 0;
  const flatness = Math.exp(logSum / n) / (sum / n);
  return clamp01(-Math.log10(Math.max(flatness, 1e-6)) / 2);
}

export class VoiceAnalyzer {
  noiseFloorDb = DEFAULT_FLOOR_DB;
  calibrated = false;

  private calibration: { elapsed: number; levels: number[]; power: Float64Array | null; frames: number } | null = null;
  private noiseSpectrum: Float64Array | null = null;
  private energy = 0;
  private mean = 0;
  private variation = 0;
  private tonality = 0;
  private active = false;
  /** Smoothed steady × tonal × loudness drive. */
  private hum = 0;
  private turbulence = 0;
  private quietTime = 0;
  /** Recent peak level with slow decay: onsets are measured against it, so syllables after short gaps don't burst. */
  private peakDb = toDb(0);
  private cooldown = 0;
  private armed = true;
  private pullHold = 0;
  private gatherTarget = 0;
  private settling = false;

  calibrate(): void {
    this.calibration = { elapsed: 0, levels: [], power: null, frames: 0 };
  }

  get isCalibrating(): boolean {
    return this.calibration !== null;
  }

  step(input: VoiceInput, dt: number, s: AudioSettings): VoiceFrame {
    const levelDb = toDb(input.rms);
    let burst = 0;

    if (this.calibration) {
      const c = this.calibration;
      c.elapsed += dt;
      c.levels.push(levelDb);
      if (input.spectrum) {
        const sp = input.spectrum;
        if (!c.power || c.power.length !== sp.length) c.power = new Float64Array(sp.length);
        for (let i = 0; i < sp.length; i++) c.power[i] += Math.pow(10, Math.max(sp[i], -160) / 10);
        c.frames++;
      }
      this.energy *= 1 - ease(dt, 0.2);
      this.turbulence *= 1 - ease(dt, 0.2);
      this.peakDb = levelDb;
      if (c.elapsed >= s.calibrationSeconds) {
        // 90th percentile: ordinary room fluctuations stay at or below the floor.
        const sorted = c.levels.sort((a, b) => a - b);
        this.noiseFloorDb = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
        this.noiseSpectrum = c.power && c.frames > 0 ? c.power.map((p) => p / c.frames) : null;
        this.calibrated = true;
        this.calibration = null;
      }
      return this.frame(levelDb, 0, 'calibrating', c.elapsed / s.calibrationSeconds);
    }

    const raw = clamp01(((levelDb - this.noiseFloorDb) * s.gain) / s.dynamicRangeDb);
    this.energy += (raw - this.energy) * ease(dt, raw > this.energy ? 0.03 : 0.2);

    if (!this.active && this.energy > s.enterThreshold) this.active = true;
    else if (this.active && this.energy < s.exitThreshold) this.active = false;
    this.quietTime = this.active ? 0 : this.quietTime + dt;
    const breath = !this.active && this.quietTime < s.quietDelaySeconds;

    // Steadiness: recent envelope variation relative to its mean level.
    this.mean += (raw - this.mean) * ease(dt, 0.2);
    this.variation += (Math.abs(raw - this.mean) - this.variation) * ease(dt, 0.2);
    const steadiness = this.active ? clamp01(1 - this.variation / Math.max(this.mean, 0.05) / 0.5) : 0;
    if (this.active && input.spectrum) {
      const noise = this.noiseSpectrum?.length === input.spectrum.length ? this.noiseSpectrum : null;
      const tonal = spectralTonality(input.spectrum, input.sampleRate, input.fftSize, noise);
      this.tonality += (tonal - this.tonality) * ease(dt, 0.15);
    }

    const steadyScore = smooth(s.steadyThreshold - 0.25, s.steadyThreshold + 0.25, steadiness);
    const tonalScore = smooth(s.tonalThreshold - 0.15, s.tonalThreshold + 0.15, this.tonality);
    if (!breath) {
      // Rises over ~steadyHoldSeconds, falls faster so a wavering hum visibly loosens; silence relaxes it.
      const humRaw = this.active ? steadyScore * tonalScore * smooth(0.05, 0.45, this.energy) : 0;
      const tau = humRaw > this.hum ? s.steadyHoldSeconds : this.active ? s.steadyHoldSeconds * 0.5 : s.quietSettleSeconds / 3;
      this.hum += (humRaw - this.hum) * ease(dt, tau);
    }
    const turbRaw = this.active ? smooth(0.1, 0.7, this.energy) * (1 - steadyScore) : 0;
    this.turbulence += (turbRaw - this.turbulence) * ease(dt, turbRaw > this.turbulence ? 0.06 : 0.4);

    // Sharp onset: a jump well above the recent peak (which decays slowly toward the noise floor).
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pullHold = Math.max(0, this.pullHold - dt);
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

    if (this.pullHold > 0 || breath) {
      // Just burst, or a brief breath: keep the current shape.
    } else if (this.active) {
      const speech = s.speechCoherence * smooth(0.05, 0.25, this.energy) * (1 - this.turbulence);
      this.gatherTarget = Math.max(speech, this.hum);
      this.settling = false;
    } else {
      this.gatherTarget = 0;
      this.settling = true;
    }

    const state: VoiceState = !this.active ? 'quiet' : this.hum >= 0.5 ? 'tonal' : 'sound';
    return this.frame(levelDb, steadiness, state, 1, burst);
  }

  private frame(levelDb: number, steadiness: number, state: VoiceState, progress: number, burst = 0): VoiceFrame {
    return {
      energy: this.energy,
      steadiness,
      tonality: this.tonality,
      gatherTarget: this.gatherTarget,
      turbulence: this.turbulence,
      settling: this.settling,
      burst,
      state,
      levelDb,
      calibrationProgress: clamp01(progress),
    };
  }
}

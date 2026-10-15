/**
 * Normalized controls that drive the swarm. Manual buttons (now) and the microphone
 * (milestone 3) both write only the targets / burst trigger; `step` does the smoothing.
 */
export interface ControlTiming {
  gatherSeconds: number;
  /** Release time used instead of `releaseSeconds` while `settling` (silence → drifting cloud). */
  quietSettleSeconds: number;
  releaseSeconds: number;
  burstRecoverySeconds: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class SwarmControls {
  /** Smoothed sound level above the noise floor, 0..1. */
  energy = 0;
  /** Formation blend, 0 = drift, 1 = formation. */
  gather = 0;
  /** Decaying impulse, 0..1. Repeated triggers never exceed 1. */
  burst = 0;

  gatherTarget = 0;
  energyTarget = 0;
  /** Set by the voice mapping when silence is releasing the formation. */
  settling = false;

  triggerBurst(strength = 1): void {
    this.burst = Math.max(this.burst, clamp01(strength));
  }

  step(dt: number, timing: ControlTiming): void {
    const rising = this.gatherTarget > this.gather;
    const seconds = Math.max(0.05, rising ? timing.gatherSeconds : this.settling ? timing.quietSettleSeconds : timing.releaseSeconds);
    const delta = dt / seconds;
    this.gather = rising ? Math.min(this.gatherTarget, this.gather + delta) : Math.max(this.gatherTarget, this.gather - delta);
    this.gather = clamp01(this.gather);

    // ~95% recovered after burstRecoverySeconds.
    this.burst *= Math.exp((-3 * dt) / Math.max(0.05, timing.burstRecoverySeconds));
    if (this.burst < 1e-4) this.burst = 0;

    this.energy += (clamp01(this.energyTarget) - this.energy) * (1 - Math.exp(-dt * 12));
  }
}

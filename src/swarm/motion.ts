import type { MotionPresetId } from '../config';
import { gaussian, mulberry32 } from './random';

/** Per-particle drift parameters; positions are evaluated procedurally each frame (O(n), no neighbours). */
export interface Drift {
  preset: MotionPresetId;
  /** garden: home position; vortex: (orbit radius, start angle, height). */
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  /** Per-particle frequencies / phases for wobble. */
  freq: Float32Array;
  phase: Float32Array;
}

export function buildDrift(preset: MotionPresetId, n: number): Drift {
  const rng = mulberry32(preset === 'vortex' ? 0x7e47 : 0x6a7d);
  const d: Drift = {
    preset,
    a: new Float32Array(n),
    b: new Float32Array(n),
    c: new Float32Array(n),
    freq: new Float32Array(n * 3),
    phase: new Float32Array(n * 3),
  };
  for (let i = 0; i < n; i++) {
    if (preset === 'vortex') {
      d.a[i] = 0.12 + 0.95 * Math.sqrt(rng());
      d.b[i] = rng() * Math.PI * 2;
      d.c[i] = gaussian(rng) * 0.08 * (1.1 - d.a[i] * 0.6);
    } else {
      // Soft, slightly flattened cloud.
      const r = 0.95 * Math.cbrt(rng());
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      d.a[i] = r * Math.sin(ph) * Math.cos(th);
      d.b[i] = r * Math.sin(ph) * Math.sin(th) * 0.85;
      d.c[i] = r * Math.cos(ph) * 0.7;
    }
    for (let k = 0; k < 3; k++) {
      d.freq[i * 3 + k] = 0.18 + rng() * 0.4;
      d.phase[i * 3 + k] = rng() * Math.PI * 2;
    }
  }
  return d;
}

const GARDEN_AMPLITUDE = 0.14;

/** Writes the drift position of particle i at time t (unit sculpture space, untilted) into out[0..2]. */
export function evalDrift(d: Drift, i: number, t: number, out: Float32Array): void {
  const f0 = d.freq[i * 3];
  const f1 = d.freq[i * 3 + 1];
  const f2 = d.freq[i * 3 + 2];
  const p0 = d.phase[i * 3];
  const p1 = d.phase[i * 3 + 1];
  const p2 = d.phase[i * 3 + 2];
  if (d.preset === 'vortex') {
    const r0 = d.a[i];
    const omega = 0.85 / (0.22 + r0);
    const r = r0 * (1 + 0.09 * Math.sin(t * 0.6 + p0));
    const ang = d.b[i] + omega * t + 0.9 * r0;
    out[0] = r * Math.cos(ang);
    out[1] = r * Math.sin(ang);
    out[2] = d.c[i] + 0.05 * Math.sin(ang * 2 + p1) + 0.03 * Math.sin(t * f2 + p2);
  } else {
    const x = d.a[i] + GARDEN_AMPLITUDE * Math.sin(t * f0 + p0);
    const y = d.b[i] + GARDEN_AMPLITUDE * Math.sin(t * f1 + p1) + 0.04 * Math.sin(t * 0.3 + x * 3);
    const z = d.c[i] + GARDEN_AMPLITUDE * Math.sin(t * f2 + p2);
    const rot = t * 0.06;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    out[0] = x * cr - z * sr;
    out[1] = y;
    out[2] = x * sr + z * cr;
  }
}

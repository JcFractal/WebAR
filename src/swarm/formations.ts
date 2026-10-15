import type { FormationId } from '../config';
import { gaussian, mulberry32 } from './random';

/**
 * Per-particle formation targets in polar form (unit radius, XY plane facing the viewer, +Z toward viewer).
 * Evaluated each frame so layers/rings can rotate: angle(t) = angle + spin * t.
 */
export interface Formation {
  radius: Float32Array;
  angle: Float32Array;
  z: Float32Array;
  spin: Float32Array;
  /** 0..1 position along the palette. */
  colorT: Float32Array;
  /** 0..1 extra brightness for outlines / ring cores. */
  emphasis: Float32Array;
  /** Rotation about X applied to the whole sculpture, radians. */
  tilt: number;
}

function alloc(n: number): Omit<Formation, 'tilt'> {
  return {
    radius: new Float32Array(n),
    angle: new Float32Array(n),
    z: new Float32Array(n),
    spin: new Float32Array(n),
    colorT: new Float32Array(n),
    emphasis: new Float32Array(n),
  };
}

interface PetalLayer {
  share: number;
  petals: number;
  outer: number;
  inner: number;
  offset: number;
  depth: number;
  spin: number;
  colorT: number;
}

const FLOWER_LAYERS: PetalLayer[] = [
  { share: 0.4, petals: 6, outer: 1.0, inner: 0.22, offset: 0, depth: -0.06, spin: 0.05, colorT: 0.0 },
  { share: 0.3, petals: 6, outer: 0.7, inner: 0.16, offset: Math.PI / 6, depth: 0.04, spin: -0.035, colorT: 0.5 },
  { share: 0.2, petals: 10, outer: 0.4, inner: 0.08, offset: 0, depth: 0.12, spin: 0.08, colorT: 1.0 },
];

function buildFlower(n: number): Formation {
  const f = alloc(n);
  const rng = mulberry32(0xf10e);
  const coreShare = 1 - FLOWER_LAYERS.reduce((a, l) => a + l.share, 0);
  for (let i = 0; i < n; i++) {
    let pick = rng();
    if (pick < coreShare) {
      const r = 0.1 * Math.sqrt(rng());
      f.radius[i] = r;
      f.angle[i] = rng() * Math.PI * 2;
      f.z[i] = 0.16 + gaussian(rng) * 0.015;
      f.spin[i] = 0.1;
      f.colorT[i] = 0.85 + rng() * 0.15;
      f.emphasis[i] = 0.6;
      continue;
    }
    pick -= coreShare;
    let layer = FLOWER_LAYERS[FLOWER_LAYERS.length - 1];
    for (const l of FLOWER_LAYERS) {
      if (pick < l.share) {
        layer = l;
        break;
      }
      pick -= l.share;
    }
    const petal = Math.floor(rng() * layer.petals);
    const center = (petal / layer.petals) * Math.PI * 2 + layer.offset;
    const outline = rng() < 0.55;
    const s = outline ? rng() : Math.pow(rng(), 0.8);
    // Petal half-width (radians) peaks around the middle and closes at the tip.
    const halfWidth = Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.08 + s * 0.92)), 0.85) * (Math.PI / layer.petals) * 0.92;
    const v = outline ? (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.1) : (rng() * 2 - 1) * 0.85;
    f.angle[i] = center + v * halfWidth;
    f.radius[i] = layer.inner + (layer.outer - layer.inner) * s + gaussian(rng) * 0.006;
    f.z[i] = layer.depth + 0.1 * s * s + gaussian(rng) * 0.01;
    f.spin[i] = layer.spin;
    f.colorT[i] = Math.min(1, Math.max(0, layer.colorT + (s - 0.5) * 0.25 + gaussian(rng) * 0.05));
    f.emphasis[i] = outline ? 0.5 : 0;
  }
  return { ...f, tilt: 0.25 };
}

const RING_RADII = [0.22, 0.36, 0.5, 0.64, 0.79, 0.95];

function buildRings(n: number): Formation {
  const f = alloc(n);
  const rng = mulberry32(0x2165);
  const total = RING_RADII.reduce((a, r) => a + r, 0);
  for (let i = 0; i < n; i++) {
    const a0 = rng() * Math.PI * 2;
    if (rng() < 0.14) {
      // Faint two-arm spiral dust between the rings.
      const r = 0.12 + 0.88 * Math.sqrt(rng());
      const arm = rng() < 0.5 ? 0 : Math.PI;
      f.radius[i] = r;
      f.angle[i] = arm + 2.6 * Math.log(r + 0.05) + gaussian(rng) * 0.18;
      f.z[i] = gaussian(rng) * 0.02;
      f.spin[i] = 0.3 / (0.45 + r);
      f.colorT[i] = r;
      f.emphasis[i] = 0;
      continue;
    }
    let pick = rng() * total;
    let ring = RING_RADII.length - 1;
    for (let k = 0; k < RING_RADII.length; k++) {
      if (pick < RING_RADII[k]) {
        ring = k;
        break;
      }
      pick -= RING_RADII[k];
    }
    const r = RING_RADII[ring];
    f.radius[i] = r + gaussian(rng) * 0.012;
    f.angle[i] = a0;
    f.z[i] = gaussian(rng) * 0.008;
    f.spin[i] = 0.35 / (0.4 + r);
    f.colorT[i] = ring / (RING_RADII.length - 1);
    f.emphasis[i] = 0.35;
  }
  return { ...f, tilt: 1.0 };
}

export function buildFormation(id: FormationId, n: number): Formation {
  return id === 'rings' ? buildRings(n) : buildFlower(n);
}

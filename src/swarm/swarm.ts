import * as THREE from 'three';
import type { FormationId, MotionPresetId, SwarmTuning } from '../config';
import type { SwarmControls } from './controls';
import { buildFormation, type Formation } from './formations';
import { buildDrift, evalDrift, type Drift } from './motion';
import { mulberry32 } from './random';

const MAX_POINT_PX = 64;

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  uniform float uSize;
  uniform float uProj;
  uniform float uTime;
  uniform float uMaxPx;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uMaxPx, uSize * aSize * uProj / max(0.05, -mv.z));
    vColor = aColor;
    vTwinkle = 0.78 + 0.22 * sin(uTime * (1.2 + aSeed * 2.0) + aSeed * 40.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float halo = smoothstep(0.5, 0.0, d);
    halo *= halo;
    float core = smoothstep(0.16, 0.0, d);
    vec3 col = mix(vColor, vec3(1.0), core * 0.55);
    gl_FragColor = vec4(col * uBrightness * vTwinkle, halo);
  }
`;

export interface SwarmOptions {
  count: number;
  palette: string[];
  formation: FormationId;
  motion: MotionPresetId;
  /** Sculpture radius in metres (diameterMeters / 2). */
  radius: number;
  tuning: SwarmTuning;
}

/** One THREE.Points cloud; drift and formation positions are procedural, blended by `controls.gather`. */
export class Swarm {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;
  private positions!: Float32Array;
  private colors!: Float32Array;
  private delays!: Float32Array;
  private jitter!: Float32Array;
  private formation!: Formation;
  private drift!: Drift;
  private palette: THREE.Color[];
  private count = 0;
  private burstSmoothed = 0;
  private readonly tmp = new Float32Array(3);
  private readonly scratchColor = new THREE.Color();

  constructor(private opts: SwarmOptions) {
    this.palette = opts.palette.map((c) => new THREE.Color(c));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSize: { value: opts.tuning.pointSize },
        uProj: { value: 800 },
        uTime: { value: 0 },
        uMaxPx: { value: MAX_POINT_PX },
        uBrightness: { value: opts.tuning.brightness },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.setCount(opts.count);
  }

  get particleCount(): number {
    return this.count;
  }

  setCount(n: number): void {
    const count = Math.max(1, Math.round(n));
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.delays = new Float32Array(count);
    this.jitter = new Float32Array(count);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    const rng = mulberry32(0x5eed);
    for (let i = 0; i < count; i++) {
      this.delays[i] = rng();
      this.jitter[i] = rng();
      sizes[i] = 0.6 + rng() * 0.8;
      seeds[i] = rng();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.points.geometry.dispose();
    this.points.geometry = geometry;
    this.geometry = geometry;
    this.opts.count = count;
    this.formation = buildFormation(this.opts.formation, count);
    this.drift = buildDrift(this.opts.motion, count);
    this.writeColors();
  }

  setFormation(id: FormationId): void {
    this.opts.formation = id;
    this.formation = buildFormation(id, this.count);
    this.writeColors();
  }

  setMotion(id: MotionPresetId): void {
    this.opts.motion = id;
    this.drift = buildDrift(id, this.count);
  }

  setProjectionScale(pixelsPerUnitAtOneMetre: number): void {
    this.material.uniforms.uProj.value = pixelsPerUnitAtOneMetre;
  }

  private writeColors(): void {
    const pal = this.palette;
    const c = this.scratchColor;
    for (let i = 0; i < this.count; i++) {
      const t = this.formation.colorT[i] * (pal.length - 1);
      const k = Math.min(pal.length - 2, Math.floor(t));
      if (pal.length === 1) c.copy(pal[0]);
      else c.copy(pal[Math.max(0, k)]).lerp(pal[Math.max(0, k) + 1], t - Math.max(0, k));
      const boost = 0.75 + this.formation.emphasis[i] * 0.6;
      this.colors[i * 3] = c.r * boost;
      this.colors[i * 3 + 1] = c.g * boost;
      this.colors[i * 3 + 2] = c.b * boost;
    }
    this.geometry.attributes.aColor.needsUpdate = true;
  }

  update(t: number, dt: number, controls: SwarmControls): void {
    const tuning = this.opts.tuning;
    // Fast attack so a burst blooms over ~0.15 s instead of teleporting; decay follows controls.burst.
    this.burstSmoothed += (controls.burst - this.burstSmoothed) * (1 - Math.exp(-dt * 14));
    const bs = this.burstSmoothed;
    const energy = controls.energy;
    const gather = controls.gather;
    const strength = tuning.burstStrength;
    const shockwave = this.drift.preset === 'vortex';
    const f = this.formation;
    const ct = Math.cos(f.tilt);
    const st = Math.sin(f.tilt);
    const scale = this.opts.radius * (1 + 0.25 * energy);
    const tmp = this.tmp;
    const pos = this.positions;

    for (let i = 0; i < this.count; i++) {
      evalDrift(this.drift, i, t, tmp);
      const ang = f.angle[i] + f.spin[i] * t;
      const fr = f.radius[i];
      let g = (gather - this.delays[i] * 0.35) / 0.65;
      g = g <= 0 ? 0 : g >= 1 ? 1 : g * g * (3 - 2 * g);
      let x = tmp[0] + (fr * Math.cos(ang) - tmp[0]) * g;
      let y = tmp[1] + (fr * Math.sin(ang) - tmp[1]) * g;
      let z = tmp[2] + (f.z[i] - tmp[2]) * g;

      if (bs > 1e-4) {
        const j = this.jitter[i];
        if (shockwave) {
          const len = Math.hypot(x, y) + 1e-4;
          const k = (bs * strength * (0.35 + 0.9 * Math.min(len, 1.2)) * (0.8 + 0.4 * j)) / len;
          x += x * k;
          y += y * k;
        } else {
          const len = Math.hypot(x, y, z) + 1e-4;
          const k = (bs * strength * (0.5 + 0.9 * j)) / len;
          x += x * k;
          y += y * k;
          z += z * k;
        }
      }

      const o = i * 3;
      pos[o] = x * scale;
      pos[o + 1] = (y * ct - z * st) * scale;
      pos[o + 2] = (y * st + z * ct) * scale;
    }
    this.geometry.attributes.position.needsUpdate = true;

    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uSize.value = tuning.pointSize * (1 + 0.3 * energy);
    u.uBrightness.value = Math.min(tuning.brightness * 2.2, tuning.brightness * (1 + 0.5 * energy + 0.35 * bs));
  }

  /** Largest particle distance from the sculpture centre, in metres (diagnostics only). */
  maxRadius(): number {
    let m = 0;
    for (let i = 0; i < this.count * 3; i += 3) {
      m = Math.max(m, Math.hypot(this.positions[i], this.positions[i + 1], this.positions[i + 2]));
    }
    return m;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

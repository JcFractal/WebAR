import * as THREE from 'three';
import type { KeyingSettings } from '../config';
import { cbcr, hexToRgb } from './media';

/*
 * Colour convention: the VideoTexture uses NoColorSpace, so the shader reads and writes the
 * video's display (sRGB) values unchanged. Keying distances are therefore in display space,
 * matching the colour picker, and no extra output conversion is applied.
 */
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float chroma;
uniform vec2 keyCbCr;
uniform float tolerance;
uniform float softness;
uniform float spill;
varying vec2 vUv;
vec2 toCbCr(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}
void main() {
  vec3 rgb = texture2D(map, vUv).rgb;
  float alpha = 1.0;
  if (chroma > 0.5) {
    float d = distance(toCbCr(rgb), keyCbCr);
    alpha = smoothstep(tolerance, tolerance + max(softness, 0.0001), d);
    if (alpha < 0.01) discard;
    float fringe = spill * (1.0 - smoothstep(tolerance, tolerance + softness + 0.2, d));
    rgb = mix(rgb, vec3(dot(rgb, vec3(0.299, 0.587, 0.114))), fringe);
  }
  gl_FragColor = vec4(rgb, alpha);
}`;

export function createVideoMaterial(texture: THREE.Texture, keying: KeyingSettings): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      chroma: { value: 0 },
      keyCbCr: { value: new THREE.Vector2() },
      tolerance: { value: 0 },
      softness: { value: 0 },
      spill: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  applyKeying(material, keying);
  return material;
}

export function applyKeying(material: THREE.ShaderMaterial, k: KeyingSettings): void {
  const u = material.uniforms;
  u.chroma.value = k.mode === 'chroma' ? 1 : 0;
  const [cb, cr] = cbcr(hexToRgb(k.color));
  (u.keyCbCr.value as THREE.Vector2).set(cb, cr);
  u.tolerance.value = k.tolerance;
  u.softness.value = k.softness;
  u.spill.value = k.spill;
}

import * as THREE from 'three';
import { KEY_MODES, type KeyingSettings } from '../config';
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
uniform float mode;
uniform float texelX;
uniform vec2 keyCbCr;
uniform float tolerance;
uniform float softness;
uniform float spill;
varying vec2 vUv;
vec2 toCbCr(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}
void main() {
  vec3 rgb;
  float alpha = 1.0;
  if (mode > 2.5) {
    vec4 c = texture2D(map, vUv);
    rgb = c.rgb;
    alpha = c.a;
  } else if (mode > 1.5) {
    // Packed: colour in the left half, matte in the right half. Keep samples one texel inside each
    // half so bilinear filtering never mixes colour and matte across the centre seam.
    float u = clamp(vUv.x * 0.5, texelX, 0.5 - texelX);
    rgb = texture2D(map, vec2(u, vUv.y)).rgb;
    float m = dot(texture2D(map, vec2(u + 0.5, vUv.y)).rgb, vec3(0.299, 0.587, 0.114));
    alpha = clamp((m - 0.04) / 0.92, 0.0, 1.0);
  } else {
    rgb = texture2D(map, vUv).rgb;
  }
  if (alpha < 0.01) discard;
  if (mode > 0.5 && mode < 1.5) {
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
      mode: { value: 0 },
      texelX: { value: 1 / 1440 },
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
  u.mode.value = KEY_MODES.indexOf(k.mode);
  const [cb, cr] = cbcr(hexToRgb(k.color));
  (u.keyCbCr.value as THREE.Vector2).set(cb, cr);
  u.tolerance.value = k.tolerance;
  u.softness.value = k.softness;
  u.spill.value = k.spill;
}

/** Texel width of the decoded frame, used to keep packed samples off the colour/matte seam. */
export function setFrameWidth(material: THREE.ShaderMaterial, videoWidth: number): void {
  material.uniforms.texelX.value = videoWidth > 0 ? 1 / videoWidth : 1 / 1440;
}

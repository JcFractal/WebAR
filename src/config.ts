export const TEMPLATES = ['swarm', 'video'] as const;
export type TemplateId = (typeof TEMPLATES)[number];
export const MOTION_PRESETS = ['garden', 'vortex'] as const;
export type MotionPresetId = (typeof MOTION_PRESETS)[number];
export const FORMATIONS = ['flower', 'rings'] as const;
export type FormationId = (typeof FORMATIONS)[number];

/** Optional visual tuning; every field has a default in `SWARM_DEFAULTS`. */
export interface SwarmTuning {
  pointSize: number;
  brightness: number;
  burstStrength: number;
  burstRecoverySeconds: number;
  releaseSeconds: number;
  maxPixelRatio: number;
  /** Displacement (fraction of radius) at full turbulence. */
  turbulenceStrength: number;
  /** Radial ripple depth at full energy. */
  rippleStrength: number;
}

export const SWARM_DEFAULTS: SwarmTuning = {
  pointSize: 0.012,
  brightness: 1,
  burstStrength: 0.45,
  burstRecoverySeconds: 1.5,
  releaseSeconds: 3,
  maxPixelRatio: 2,
  turbulenceStrength: 0.14,
  rippleStrength: 0.05,
};

const SWARM_RANGES: Record<keyof SwarmTuning, [number, number]> = {
  pointSize: [0.002, 0.05],
  brightness: [0.1, 3],
  burstStrength: [0, 1.5],
  burstRecoverySeconds: [0.2, 10],
  releaseSeconds: [0.2, 20],
  maxPixelRatio: [0.5, 3],
  turbulenceStrength: [0, 0.6],
  rippleStrength: [0, 0.3],
};

/**
 * Voice-mapping settings (`settings.audio`). Every field has a default in `AUDIO_DEFAULTS`;
 * values are starting points for on-site tuning, not validated measurements.
 */
export interface AudioSettings {
  /** Sensitivity: multiplies the level above the noise floor. */
  gain: number;
  calibrationSeconds: number;
  /** Slight coherence (0..1) from soft speech; loud varying speech turns into turbulence instead. */
  speechCoherence: number;
  /** Tonality (0..1) around which a sound counts as tonal; noise-like sound below it barely forms the shape. */
  tonalThreshold: number;
  /** Time constant for a steady tonal sound to build coherence. */
  steadyHoldSeconds: number;
  /** Time for the formation blend to rise from cloud to full formation. */
  gatherSeconds: number;
  /** Time for silence to relax the formation into the drifting cloud. */
  quietSettleSeconds: number;
  /** Silence shorter than this (a breath) keeps the current shape. */
  quietDelaySeconds: number;
  burstCooldownSeconds: number;
  /** Jump in level (dB) over the recent average that counts as a sharp onset. */
  burstThresholdDb: number;
  /** Minimum energy (0..1) for an onset to burst, so quiet clicks are ignored. */
  burstMinEnergy: number;
  /** dB above the noise floor that maps to full energy (before gain). */
  dynamicRangeDb: number;
  /** Energy hysteresis: sound starts above `enterThreshold`, ends below `exitThreshold`. */
  enterThreshold: number;
  exitThreshold: number;
  /** Steadiness (0..1) required for sound to count as steady. */
  steadyThreshold: number;
}

export const AUDIO_DEFAULTS: AudioSettings = {
  gain: 1.4,
  calibrationSeconds: 2,
  speechCoherence: 0.2,
  tonalThreshold: 0.5,
  steadyHoldSeconds: 0.8,
  gatherSeconds: 1.2,
  quietSettleSeconds: 3,
  quietDelaySeconds: 0.7,
  burstCooldownSeconds: 1,
  burstThresholdDb: 15,
  burstMinEnergy: 0.45,
  dynamicRangeDb: 48,
  enterThreshold: 0.12,
  exitThreshold: 0.06,
  steadyThreshold: 0.6,
};

const AUDIO_RANGES: Record<keyof AudioSettings, [number, number]> = {
  gain: [0.1, 10],
  calibrationSeconds: [0.5, 10],
  speechCoherence: [0, 1],
  tonalThreshold: [0.05, 0.95],
  steadyHoldSeconds: [0.1, 10],
  gatherSeconds: [0.2, 15],
  quietSettleSeconds: [0.2, 20],
  quietDelaySeconds: [0, 10],
  burstCooldownSeconds: [0.1, 10],
  burstThresholdDb: [3, 40],
  burstMinEnergy: [0, 1],
  dynamicRangeDb: [10, 80],
  enterThreshold: [0.01, 0.9],
  exitThreshold: [0, 0.9],
  steadyThreshold: [0.1, 0.99],
};

export interface ManifestEntry {
  id: string;
  title: string;
  /** Test fixtures are listed in a separate gallery section, never mixed with the demo cards. */
  test?: boolean;
}

export interface SwarmSettings {
  particleCount: number;
  palette: string[];
  motionPreset: MotionPresetId;
  formation: FormationId;
  diameterMeters: number;
  heightAboveSurfaceMeters: number;
  audio?: Partial<AudioSettings>;
  swarm?: Partial<SwarmTuning>;
}

export const KEY_MODES = ['opaque', 'chroma'] as const;
export type KeyMode = (typeof KEY_MODES)[number];

/** Chroma keying in display (sRGB) space; distances are in the CbCr plane. */
export interface KeyingSettings {
  mode: KeyMode;
  color: string;
  /** CbCr distance from the key color that is fully transparent. */
  tolerance: number;
  /** Extra distance over which alpha ramps to opaque (soft edges). */
  softness: number;
  /** How strongly key-colored fringes are desaturated (0 = off). */
  spill: number;
}

export const KEYING_DEFAULTS: KeyingSettings = {
  mode: 'opaque',
  color: '#00b140',
  tolerance: 0.25,
  softness: 0.1,
  spill: 0.5,
};

const KEYING_RANGES: Record<'tolerance' | 'softness' | 'spill', [number, number]> = {
  tolerance: [0, 1],
  softness: [0, 0.5],
  spill: [0, 1],
};

/** Resolved video settings; JSON may omit any field except where noted in `validateVideoSettings`. */
export interface VideoDefaults {
  displayHeightMeters: number;
  bottomOffsetMeters: number;
  loop: boolean;
  localFile: boolean;
}

export const VIDEO_DEFAULTS: VideoDefaults = {
  displayHeightMeters: 1.2,
  bottomOffsetMeters: 0,
  loop: false,
  localFile: false,
};

export const VIDEO_RANGES: Record<'displayHeightMeters' | 'bottomOffsetMeters', [number, number]> = {
  displayHeightMeters: [0.25, 2.5],
  bottomOffsetMeters: [0, 2],
};

/** Same-origin static media only; no arbitrary URLs. */
export const VIDEO_SOURCE_PATTERN = /^media\/[a-z0-9]+(?:-[a-z0-9]+)*\.mp4$/;

export interface VideoSettings {
  /** Path under public/, e.g. "media/synthetic-greeting.mp4". Optional when `localFile` is true. */
  source?: string;
  /** Shown under the title, e.g. to label a synthetic fixture. */
  sourceNote?: string;
  displayHeightMeters?: number;
  bottomOffsetMeters?: number;
  loop?: boolean;
  /** Offer the temporary on-device MP4 selector. */
  localFile?: boolean;
  keying?: Partial<KeyingSettings>;
}

interface BaseExperienceConfig {
  id: string;
  title: string;
  brand?: { name?: string; accent?: string };
}

export interface SwarmExperienceConfig extends BaseExperienceConfig {
  template: 'swarm';
  settings: SwarmSettings;
}

export interface VideoExperienceConfig extends BaseExperienceConfig {
  template: 'video';
  settings: VideoSettings;
}

export type ExperienceConfig = SwarmExperienceConfig | VideoExperienceConfig;

export type LoadErrorKind = 'invalid-id' | 'unknown-id' | 'fetch-failed' | 'invalid-config';

export class ExperienceLoadError extends Error {
  readonly kind: LoadErrorKind;
  constructor(kind: LoadErrorKind, message: string) {
    super(message);
    this.name = 'ExperienceLoadError';
    this.kind = kind;
  }
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const MAX_PARTICLES = 10000;

export function isValidId(id: string): boolean {
  return id.length <= 64 && ID_PATTERN.test(id);
}

const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

async function fetchJson(path: string, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(assetUrl(path), { cache: 'no-cache' });
  } catch {
    throw new ExperienceLoadError('fetch-failed', `Could not reach the server to load ${label}. Check your connection and retry.`);
  }
  if (res.status === 404 || (res.ok && !(res.headers.get('content-type') ?? '').includes('json'))) {
    throw new ExperienceLoadError('fetch-failed', `${label} was not found on the server.`);
  }
  if (!res.ok) {
    throw new ExperienceLoadError('fetch-failed', `${label} could not be loaded (HTTP ${res.status}).`);
  }
  try {
    return await res.json();
  } catch {
    throw new ExperienceLoadError('invalid-config', `${label} is not valid JSON.`);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export async function loadManifest(): Promise<ManifestEntry[]> {
  const data = await fetchJson('manifest.json', 'The experience list');
  if (!isObject(data) || !Array.isArray(data.experiences)) {
    throw new ExperienceLoadError('invalid-config', 'The experience list (manifest.json) is malformed.');
  }
  return data.experiences
    .filter((e): e is ManifestEntry => isObject(e) && typeof e.id === 'string' && isValidId(e.id) && isNonEmptyString(e.title))
    .map((e) => ({ id: e.id, title: e.title, ...(e.test === true ? { test: true } : {}) }));
}

export function validateExperience(data: unknown, expectedId: string): ExperienceConfig {
  const problems: string[] = [];
  if (!isObject(data)) {
    throw new ExperienceLoadError('invalid-config', `Configuration "${expectedId}" must be a JSON object.`);
  }
  if (data.id !== expectedId) problems.push(`"id" must be "${expectedId}"`);
  if (!TEMPLATES.includes(data.template as TemplateId)) problems.push(`"template" must be one of: ${TEMPLATES.join(', ')}`);
  if (!isNonEmptyString(data.title)) problems.push('"title" must be a non-empty string');

  const s = data.settings;
  if (!isObject(s)) {
    problems.push('"settings" must be an object');
  } else if (data.template === 'video') {
    validateVideoSettings(s, problems);
  } else {
    validateSwarmSettings(s, problems);
  }

  if (data.brand !== undefined && !isObject(data.brand)) problems.push('"brand" must be an object when present');

  if (problems.length > 0) {
    throw new ExperienceLoadError('invalid-config', `Configuration "${expectedId}" is invalid: ${problems.join('; ')}.`);
  }
  return data as unknown as ExperienceConfig;
}

export async function loadExperience(id: string): Promise<ExperienceConfig> {
  if (!isValidId(id)) {
    throw new ExperienceLoadError('invalid-id', 'That experience link is malformed. IDs use lowercase letters, numbers, and dashes.');
  }
  const manifest = await loadManifest();
  if (!manifest.some((e) => e.id === id)) {
    throw new ExperienceLoadError('unknown-id', `There is no experience called "${id}".`);
  }
  const data = await fetchJson(`experiences/${id}.json`, `Experience "${id}"`);
  return validateExperience(data, id);
}

function checkRanges(path: string, value: unknown, ranges: Record<string, [number, number]>, problems: string[]): void {
  if (!isObject(value)) {
    problems.push(`"${path}" must be an object when present`);
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    const range = ranges[key];
    if (!range) {
      problems.push(`"${path}.${key}" is not a known setting`);
    } else if (typeof v !== 'number' || !Number.isFinite(v) || v < range[0] || v > range[1]) {
      problems.push(`"${path}.${key}" must be a number from ${range[0]} to ${range[1]}`);
    }
  }
}

function validateSwarmSettings(s: Record<string, unknown>, problems: string[]): void {
  const count = s.particleCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_PARTICLES) {
    problems.push(`"settings.particleCount" must be an integer from 1 to ${MAX_PARTICLES}`);
  }
  if (!Array.isArray(s.palette) || s.palette.length === 0 || !s.palette.every((c) => typeof c === 'string' && HEX_COLOR.test(c))) {
    problems.push('"settings.palette" must be a non-empty list of #RRGGBB colors');
  }
  if (!MOTION_PRESETS.includes(s.motionPreset as MotionPresetId)) {
    problems.push(`"settings.motionPreset" must be one of: ${MOTION_PRESETS.join(', ')}`);
  }
  if (!FORMATIONS.includes(s.formation as FormationId)) {
    problems.push(`"settings.formation" must be one of: ${FORMATIONS.join(', ')}`);
  }
  if (!isPositiveNumber(s.diameterMeters)) problems.push('"settings.diameterMeters" must be a positive number');
  if (typeof s.heightAboveSurfaceMeters !== 'number' || !Number.isFinite(s.heightAboveSurfaceMeters)) {
    problems.push('"settings.heightAboveSurfaceMeters" must be a number');
  }
  if (s.audio !== undefined) checkRanges('settings.audio', s.audio, AUDIO_RANGES, problems);
  if (isObject(s.audio)) {
    const enter = (s.audio.enterThreshold as number | undefined) ?? AUDIO_DEFAULTS.enterThreshold;
    const exit = (s.audio.exitThreshold as number | undefined) ?? AUDIO_DEFAULTS.exitThreshold;
    if (exit >= enter) problems.push('"settings.audio.exitThreshold" must be lower than "enterThreshold"');
  }
  if (s.swarm !== undefined) checkRanges('settings.swarm', s.swarm, SWARM_RANGES, problems);
}

const VIDEO_KEYS = new Set(['source', 'sourceNote', 'displayHeightMeters', 'bottomOffsetMeters', 'loop', 'localFile', 'keying']);
const KEYING_KEYS = new Set(['mode', 'color', 'tolerance', 'softness', 'spill']);

export function validateVideoSettings(s: Record<string, unknown>, problems: string[]): void {
  for (const key of Object.keys(s)) {
    if (!VIDEO_KEYS.has(key)) problems.push(`"settings.${key}" is not a known video setting`);
  }
  if (s.source !== undefined && (typeof s.source !== 'string' || !VIDEO_SOURCE_PATTERN.test(s.source))) {
    problems.push('"settings.source" must be a path like "media/<name>.mp4" (same-origin MP4 only)');
  }
  if (s.sourceNote !== undefined && (typeof s.sourceNote !== 'string' || s.sourceNote.length > 200)) {
    problems.push('"settings.sourceNote" must be a string of at most 200 characters');
  }
  for (const [key, [min, max]] of Object.entries(VIDEO_RANGES)) {
    const v = s[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)) {
      problems.push(`"settings.${key}" must be a number from ${min} to ${max}`);
    }
  }
  for (const key of ['loop', 'localFile'] as const) {
    if (s[key] !== undefined && typeof s[key] !== 'boolean') problems.push(`"settings.${key}" must be true or false`);
  }
  if (s.source === undefined && s.localFile !== true) {
    problems.push('"settings.source" is required unless "settings.localFile" is true');
  }
  const k = s.keying;
  if (k === undefined) return;
  if (!isObject(k)) {
    problems.push('"settings.keying" must be an object when present');
    return;
  }
  for (const key of Object.keys(k)) {
    if (!KEYING_KEYS.has(key)) problems.push(`"settings.keying.${key}" is not a known setting`);
  }
  if (k.mode !== undefined && !KEY_MODES.includes(k.mode as KeyMode)) {
    problems.push(`"settings.keying.mode" must be one of: ${KEY_MODES.join(', ')}`);
  }
  if (k.color !== undefined && (typeof k.color !== 'string' || !HEX_COLOR.test(k.color))) {
    problems.push('"settings.keying.color" must be a #RRGGBB color');
  }
  for (const [key, [min, max]] of Object.entries(KEYING_RANGES)) {
    const v = k[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)) {
      problems.push(`"settings.keying.${key}" must be a number from ${min} to ${max}`);
    }
  }
}

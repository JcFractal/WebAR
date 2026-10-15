export const TEMPLATES = ['swarm'] as const;
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
}

export const SWARM_DEFAULTS: SwarmTuning = {
  pointSize: 0.012,
  brightness: 1,
  burstStrength: 0.45,
  burstRecoverySeconds: 1.5,
  releaseSeconds: 3,
  maxPixelRatio: 2,
};

const SWARM_RANGES: Record<keyof SwarmTuning, [number, number]> = {
  pointSize: [0.002, 0.05],
  brightness: [0.1, 3],
  burstStrength: [0, 1.5],
  burstRecoverySeconds: [0.2, 10],
  releaseSeconds: [0.2, 20],
  maxPixelRatio: [0.5, 3],
};

/**
 * Voice-mapping settings (`settings.audio`). Every field has a default in `AUDIO_DEFAULTS`;
 * values are starting points for on-site tuning, not validated measurements.
 */
export interface AudioSettings {
  /** Sensitivity: multiplies the level above the noise floor. */
  gain: number;
  calibrationSeconds: number;
  /** Steady sound must last this long before the formation starts gathering. */
  steadyHoldSeconds: number;
  /** Time for steady sound to gather the formation fully. */
  gatherSeconds: number;
  /** Time for silence to settle into the formation. */
  quietSettleSeconds: number;
  /** Silence must last this long before settling starts, so pauses between syllables do not form it. */
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
  steadyHoldSeconds: 2,
  gatherSeconds: 3,
  quietSettleSeconds: 4,
  quietDelaySeconds: 1.2,
  burstCooldownSeconds: 1,
  burstThresholdDb: 15,
  burstMinEnergy: 0.45,
  dynamicRangeDb: 48,
  enterThreshold: 0.2,
  exitThreshold: 0.1,
  steadyThreshold: 0.6,
};

const AUDIO_RANGES: Record<keyof AudioSettings, [number, number]> = {
  gain: [0.1, 10],
  calibrationSeconds: [0.5, 10],
  steadyHoldSeconds: [0.2, 10],
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

export interface ExperienceConfig {
  id: string;
  template: TemplateId;
  title: string;
  settings: SwarmSettings;
  brand?: { name?: string; accent?: string };
}

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
  return data.experiences.filter(
    (e): e is ManifestEntry => isObject(e) && typeof e.id === 'string' && isValidId(e.id) && isNonEmptyString(e.title),
  );
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
  } else {
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

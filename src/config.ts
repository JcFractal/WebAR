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
  audio?: Partial<Record<string, number>>;
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
    if (s.audio !== undefined) {
      if (!isObject(s.audio) || !Object.values(s.audio).every(isPositiveNumber)) {
        problems.push('"settings.audio" must be an object of positive numbers');
      }
    }
    if (s.swarm !== undefined) {
      if (!isObject(s.swarm)) {
        problems.push('"settings.swarm" must be an object when present');
      } else {
        for (const [key, value] of Object.entries(s.swarm)) {
          const range = SWARM_RANGES[key as keyof SwarmTuning];
          if (!range) {
            problems.push(`"settings.swarm.${key}" is not a known setting`);
          } else if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) {
            problems.push(`"settings.swarm.${key}" must be a number from ${range[0]} to ${range[1]}`);
          }
        }
      }
    }
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

import type { VideoExperienceConfig } from '../config';

/** Stored playback representation of a greeting video (column `video_format`). */
export const VIDEO_FORMATS = ['packed', 'alpha', 'opaque'] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
export const FORMAT_LABELS: Record<VideoFormat, string> = {
  packed: 'Packed cutout MP4 (colour | matte side by side)',
  alpha: 'Native-alpha cutout WebM',
  opaque: 'Ordinary video (no cutout)',
};

export const GREETING_SECONDS = [3, 30] as const;
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const BUCKET = 'greeting-videos';
const SLUG = /^[a-f0-9]{12}$/;

export interface UploadCandidate {
  name: string;
  type: string;
  size: number;
}

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export function mimeFor(file: UploadCandidate): 'video/mp4' | 'video/webm' | null {
  if (file.type === 'video/mp4' || (file.type === '' && /\.mp4$/i.test(file.name))) return 'video/mp4';
  if (file.type === 'video/webm' || (file.type === '' && /\.webm$/i.test(file.name))) return 'video/webm';
  return null;
}

/** Suggested format for the picker; the creator confirms it and it is stored explicitly. */
export function suggestedFormat(file: UploadCandidate): VideoFormat {
  if (mimeFor(file) === 'video/webm') return 'alpha';
  return 'packed';
}

/** Format/container mismatches (also checked when a saved greeting's format is edited). */
export function formatProblems(mime: string | null, format: VideoFormat): string[] {
  if (format === 'alpha' && mime === 'video/mp4') return ['Native-alpha cutouts must be WebM files; choose the packed format for an MP4.'];
  if (format === 'packed' && mime === 'video/webm') return ['Packed cutouts are MP4 files; choose native alpha for a WebM.'];
  return [];
}

/** Problems that block saving, in creator wording; empty when the upload may proceed. */
export function uploadProblems(
  file: UploadCandidate,
  format: VideoFormat,
  meta?: { width: number; height: number; duration: number },
): string[] {
  const problems: string[] = [];
  const mime = mimeFor(file);
  if (!mime) problems.push(`“${file.name}” is not an MP4 or WebM file.`);
  if (file.size === 0) problems.push(`“${file.name}” is empty.`);
  if (file.size > UPLOAD_MAX_BYTES) {
    problems.push(`“${file.name}” is ${(Math.ceil(file.size / 10485.76) / 100).toFixed(2)} MiB; the limit is ${UPLOAD_MAX_BYTES / 1048576} MiB.`);
  }
  problems.push(...formatProblems(mime, format));
  if (meta) {
    if (!(meta.width > 0 && meta.height > 0)) problems.push('This video could not be decoded on this device.');
    else if (format === 'packed' && meta.width < meta.height) {
      problems.push(`This video is ${meta.width}×${meta.height}; a packed cutout is twice as wide as the person's frame (colour left, matte right). Choose “Ordinary video” if it is not packed.`);
    }
    const [min, max] = GREETING_SECONDS;
    if (!Number.isFinite(meta.duration)) {
      problems.push(`This video's length could not be read; re-export it as a finished ${min}–${max} s file.`);
    } else if (meta.duration < min || meta.duration > max) {
      problems.push(`This video is ${meta.duration.toFixed(1)} s; greetings must be ${min}–${max} s.`);
    }
  }
  return problems;
}

/** Client pre-check for an ordinary recording (the server re-checks before any paid processing). */
export function sourceProblems(file: UploadCandidate, meta?: { duration: number }): string[] {
  const problems: string[] = [];
  if (!mimeFor(file)) problems.push(`“${file.name}” is not an MP4 or WebM recording.`);
  if (file.size === 0) problems.push(`“${file.name}” is empty.`);
  if (file.size > UPLOAD_MAX_BYTES) {
    problems.push(`“${file.name}” is ${(Math.ceil(file.size / 10485.76) / 100).toFixed(2)} MiB; the limit is ${UPLOAD_MAX_BYTES / 1048576} MiB. Record at 1080p or keep it shorter.`);
  }
  const [min, max] = GREETING_SECONDS;
  if (meta && Number.isFinite(meta.duration) && meta.duration > 0 && (meta.duration < min || meta.duration > max)) {
    problems.push(`This recording is ${meta.duration.toFixed(1)} s; greetings must be ${min}–${max} s.`);
  }
  return problems;
}

/** Link recipients open; the same string is encoded in the QR. */
export function greetingUrl(base: string, slug: string): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('g', slug);
  return url.toString();
}

export interface PlayableGreeting {
  slug: string;
  title: string;
  video_format: string;
}

/** Existing Android player config for a stored greeting; the keying mode comes from the stored format. */
export function playerConfig(g: PlayableGreeting, videoUrl: string): VideoExperienceConfig {
  const mode = (VIDEO_FORMATS as readonly string[]).includes(g.video_format) ? (g.video_format as VideoFormat) : 'opaque';
  return {
    id: `greeting-${g.slug}`,
    title: g.title,
    template: 'video',
    settings: { source: videoUrl, displayHeightMeters: 1.2, bottomOffsetMeters: 0, loop: false, localFile: false, keying: { mode } },
  };
}

import type { MediaInfo } from './media.ts';

// Trusted, server-side media rules (the browser checks the same things only as a convenience).
export const MAX_BYTES = 50 * 1024 * 1024; // Supabase Free per-file limit (actual project setting).
export const SECONDS = [3, 30] as const;
const CONTAINERS = /^(mov,mp4,m4a,3gp,3g2,mj2|matroska,webm)$/;

export type Format = 'packed' | 'alpha' | 'opaque';

export interface Problem {
  code: string;
  message: string;
}

function durationProblem(d: number | null): Problem | null {
  const [min, max] = SECONDS;
  if (d === null || !Number.isFinite(d)) return { code: 'duration-unreadable', message: `The video's length could not be read; record or export a finished ${min}–${max} s clip.` };
  if (d < min || d > max) return { code: 'duration', message: `The video is ${d.toFixed(1)} s; greetings must be ${min}–${max} s.` };
  return null;
}

/** Ordinary phone recording that will be processed automatically. */
export function sourceProblems(bytes: number, info: MediaInfo): Problem[] {
  const out: Problem[] = [];
  if (bytes > MAX_BYTES) out.push({ code: 'too-large', message: `The video is ${(Math.ceil(bytes / 10485.76) / 100).toFixed(2)} MiB; the limit is 50 MiB. Record at 1080p or keep it shorter.` });
  if (!info.container || !CONTAINERS.test(info.container) || !info.vcodec || !info.width || !info.height) {
    out.push({ code: 'unreadable', message: 'This file could not be read as a video. Upload an MP4 or WebM recording.' });
    return out;
  }
  const d = durationProblem(info.duration);
  if (d) out.push(d);
  return out;
}

/** Already-processed upload (G3 path): the stored file must match its declared format. */
export function preparedProblems(bytes: number, info: MediaInfo, format: Format, mime: string): Problem[] {
  const out = sourceProblems(bytes, info);
  if (out.some((p) => p.code === 'unreadable')) return out;
  const webm = info.container === 'matroska,webm';
  if ((mime === 'video/webm') !== webm) out.push({ code: 'container', message: 'The file type does not match its contents.' });
  if (format === 'alpha' && !webm) out.push({ code: 'format', message: 'Native-alpha cutouts must be WebM files.' });
  if (format === 'packed' && webm) out.push({ code: 'format', message: 'Packed cutouts are MP4 files.' });
  if (format === 'packed' && info.width! < info.height!) {
    out.push({ code: 'format', message: `This video is ${info.width}×${info.height}; a packed cutout is twice as wide as the person's frame.` });
  }
  return out;
}

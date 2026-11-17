/** Pure helpers for the video template (no DOM or three.js), so they can be checked under Node. */

export const LOCAL_MAX_BYTES = 100 * 1024 * 1024;
export const RECOMMENDED_SECONDS: readonly [number, number] = [3, 30];
export const ACCEPTED_FORMAT = 'MP4 with H.264 video and AAC audio';

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

/** Returns a user-facing reason to reject a locally selected file, or null when it may be tried. */
export function checkLocalFile(file: FileLike): string | null {
  const isMp4 = file.type === 'video/mp4' || (file.type === '' && /\.mp4$/i.test(file.name));
  if (!isMp4) {
    return `“${file.name}” is not an MP4. Choose an ${ACCEPTED_FORMAT} (MOV and other formats are not supported yet).`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > LOCAL_MAX_BYTES) {
    return `“${file.name}” is ${(file.size / 1048576).toFixed(0)} MiB; the limit is 100 MiB.`;
  }
  return null;
}

/** Advisory only: greetings are planned as 3–30 s clips, but a local test may be any length. */
export function durationNote(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const [min, max] = RECOMMENDED_SECONDS;
  if (seconds < min || seconds > max) {
    return `This clip is ${seconds.toFixed(1)} s; greetings are planned for ${min}–${max} s.`;
  }
  return '';
}

/** Maps HTMLMediaElement error codes (MediaError.code) to recoverable wording. */
export function mediaErrorMessage(code: number | undefined, local: boolean): string {
  switch (code) {
    case 1:
      return 'Loading the video was interrupted. Tap Retry.';
    case 2:
      return local ? 'The video file could not be read. Choose it again.' : 'The video could not be downloaded. Check your connection and tap Retry.';
    case 3:
    case 4:
      return `This browser could not play the video. Use an ${ACCEPTED_FORMAT}; HEVC/H.265 recordings are not supported yet.`;
    default:
      return 'The video could not be loaded. Tap Retry.';
  }
}

/** Displayed rectangle in metres: the whole frame is `height` tall, width follows the video aspect. */
export function planeSize(height: number, aspect: number): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 9 / 16;
  return { width: height * a, height };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** BT.601 chroma (Cb, Cr) of an sRGB color in 0..1, matching the keying shader. */
export function cbcr([r, g, b]: [number, number, number]): [number, number] {
  return [-0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b];
}

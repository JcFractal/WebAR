/// <reference types="node" />
import { spawn } from 'node:child_process';
import { createWriteStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Server-side media steps (bundled ffmpeg): probe, normalize, pack, validate. Timed on a Vercel
// preview (2 vCPU, 2 GiB, 512 MiB /tmp): a 30 s 4K HEVC source normalizes in ~80 s, packs in ~60 s.
export const FFMPEG = process.env.FFMPEG_PATH ?? join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
export const PRESET = 'veryfast';
export const FPS = 30;

export interface MediaInfo {
  container: string | null;
  vcodec: string | null;
  /** Upright display size (rotation applied). */
  width: number | null;
  height: number | null;
  acodec: string | null;
  rotation: number;
  duration: number | null;
  frames: number | null;
}

export function ffmpeg(args: string[], bin = FFMPEG): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', '-y', ...args]);
    let err = '';
    p.stderr.on('data', (d) => {
      err = (err + d).slice(-20000);
    });
    p.stdout.on('data', (d) => {
      err = (err + d).slice(-20000);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`))));
  });
}

/** Parse ffmpeg's input banner (ffmpeg-static ships without ffprobe). */
export function parseBanner(stderr: string): Omit<MediaInfo, 'frames'> {
  const input = /Input #0, ([\w,]+), from/.exec(stderr);
  const v = /Stream #0:\d+[^:]*: Video: (\w+).*?, (\d{2,5})x(\d{2,5})/.exec(stderr);
  const a = /Stream #0:\d+[^:]*: Audio: (\w+)/.exec(stderr);
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const rot = /rotation of (-?[\d.]+) degrees/.exec(stderr);
  const rotation = rot ? +rot[1] : 0;
  const quarter = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const w = v ? +v[2] : null;
  const h = v ? +v[3] : null;
  return {
    container: input?.[1] ?? null,
    vcodec: v?.[1] ?? null,
    width: quarter ? h : w,
    height: quarter ? w : h,
    acodec: a?.[1] ?? null,
    rotation,
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
  };
}

export async function probe(path: string): Promise<MediaInfo> {
  const stderr = await ffmpeg(['-i', path, '-map', '0', '-c', 'copy', '-f', 'null', '-']).catch((e) => String(e));
  return { ...parseBanner(stderr), frames: await countFrames(path) };
}

/** Video packet count (= frames) without decoding. */
export function countFrames(path: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', path, '-map', '0:v:0', '-c', 'copy', '-f', 'framecrc', '-']);
    let n = 0;
    let line = '';
    p.stdout.on('data', (d: Buffer) => {
      const parts = (line + d.toString()).split('\n');
      line = parts.pop() ?? '';
      for (const l of parts) if (l && !l.startsWith('#')) n++;
    });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? n : null));
  });
}

export async function audioMd5(path: string): Promise<string | null> {
  const out = await ffmpeg(['-i', path, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-']).catch(() => null);
  return out ? (/MD5=([0-9a-f]{32})/.exec(out)?.[1] ?? null) : null;
}

/** Upright 720-wide portrait (or 1280-wide landscape), constant 30 fps H.264; AAC audio copied untouched. */
export async function normalize(src: string, out: string, info: MediaInfo): Promise<void> {
  const audio = info.acodec === 'aac' ? ['-c:a', 'copy'] : info.acodec ? ['-c:a', 'aac', '-b:a', '160k'] : [];
  await ffmpeg(['-i', src, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)':flags=lanczos,fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', PRESET, '-crf', '16', '-g', '30', ...audio, '-movflags', '+faststart', out]);
}

export interface PackCheck {
  frames_match: boolean;
  size_is_2w_x_h: boolean;
  audio_identical: boolean;
  duration_delta_s: number | null;
  matte_luma_per_s: number[];
  matte_not_blank: boolean;
}

export function packOk(c: PackCheck): boolean {
  return c.frames_match && c.size_is_2w_x_h && c.audio_identical && c.duration_delta_s !== null && Math.abs(c.duration_delta_s) <= 0.1 && c.matte_not_blank;
}

/** Colour | matte side by side (2W×H), with the normalized audio copied in, then validated. */
export async function pack(norm: string, mask: string, out: string, dir: string): Promise<{ info: MediaInfo; check: PackCheck }> {
  const n = await probe(norm);
  if (!n.width || !n.height || !n.frames) throw new Error('normalized video unreadable');
  const video = join(dir, 'packed.video.mp4');
  await ffmpeg(['-i', norm, '-i', mask, '-filter_complex',
    `[1:v]scale=${n.width}:${n.height}:flags=bicubic,fps=${FPS},format=gray,format=yuv420p[m];[0:v][m]hstack=inputs=2,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', PRESET, '-crf', '18', '-g', '30',
    '-frames:v', String(n.frames), video]);
  await ffmpeg(['-i', video, '-i', norm, '-map', '0:v:0', '-map', '1:a:0?', '-c', 'copy', '-movflags', '+faststart', out]);
  const p = await probe(out);
  const luma = await matteLuma(out);
  const [a, b] = await Promise.all([audioMd5(norm), audioMd5(out)]);
  return {
    info: p,
    check: {
      frames_match: p.frames === n.frames,
      size_is_2w_x_h: p.width === 2 * n.width && p.height === n.height,
      audio_identical: a === b,
      duration_delta_s: p.duration != null && n.duration != null ? Math.round((p.duration - n.duration) * 1000) / 1000 : null,
      matte_luma_per_s: luma,
      // Not entirely transparent and not a solid opaque box.
      matte_not_blank: luma.some((y) => y > 2) && luma.some((y) => y < 250),
    },
  };
}

/** Mean matte luma once per second (0 = transparent, 255 = opaque). */
export async function matteLuma(packed: string): Promise<number[]> {
  const out = await ffmpeg(['-i', packed, '-vf', 'fps=1,crop=iw/2:ih:iw/2:0,scale=90:160,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-']);
  return [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Math.round(+m[1] * 10) / 10);
}

/** Mock provider matte: a soft centred ellipse for the clip's length (no network, no cost). */
export async function mockMatte(out: string, width: number, height: number, seconds: number, dir: string): Promise<void> {
  const still = join(dir, 'mock-matte.png');
  await ffmpeg(['-f', 'lavfi', '-i', `color=black:s=${width}x${height}:d=1`, '-frames:v', '1',
    '-vf', "format=gray,geq=lum='255*lt(pow((X-W/2)/(W*0.36),2)+pow((Y-H*0.56)/(H*0.40),2),1)',boxblur=6", still]);
  await ffmpeg(['-loop', '1', '-i', still, '-t', seconds.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
}

/** Stream a URL to disk, refusing anything larger than maxBytes. */
export async function download(url: string, path: string, maxBytes: number, headers: Record<string, string> = {}): Promise<number> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`download is ${declared} bytes; limit ${maxBytes}`);
  let seen = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      cb(seen > maxBytes ? new Error(`download exceeds ${maxBytes} bytes`) : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as never), cap, createWriteStream(path));
  return statSync(path).size;
}

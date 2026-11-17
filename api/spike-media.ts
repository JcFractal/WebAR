/// <reference types="node" />
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, statfsSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';

// G4 timing spike (temporary, preview only): normalize + pack an existing clip and matte in a
// Vercel Function with bundled ffmpeg. No provider call. Inputs/outputs stay in the private
// `greeting-work` bucket under `spike/`.
const WORK = 'greeting-work';
const FFMPEG = process.env.FFMPEG_PATH ?? join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function tokenOk(got: string | null): boolean {
  const want = process.env.SPIKE_TOKEN;
  if (!want || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Run = { seconds: number; maxrssMiB: number | null; stderr: string };

function ffmpeg(args: string[]): Promise<Run> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-benchmark', ...args]);
    let err = '';
    let out = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-20000); });
    p.stdout.on('data', (d) => { out = (out + d).slice(-20000); });
    p.on('error', reject);
    p.on('close', (code) => {
      const rss = /maxrss=(\d+)KiB/.exec(err);
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${err.slice(-600)}`));
      resolve({ seconds: (Date.now() - t0) / 1000, maxrssMiB: rss ? Math.round(+rss[1] / 1024) : null, stderr: err + out });
    });
  });
}

async function info(path: string) {
  const { stderr } = await ffmpeg(['-i', path, '-map', '0', '-c', 'copy', '-f', 'null', '-']).catch((e) => ({ stderr: String(e) }));
  const v = /Stream #0:\d+[^:]*: Video: (\w+).*?, (\d{2,5})x(\d{2,5})/.exec(stderr);
  const a = /Stream #0:\d+[^:]*: Audio: (\w+)/.exec(stderr);
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const rot = /rotation of (-?[\d.]+) degrees/.exec(stderr);
  return {
    vcodec: v?.[1] ?? null, width: v ? +v[2] : null, height: v ? +v[3] : null,
    acodec: a?.[1] ?? null, rotation: rot ? +rot[1] : 0,
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
    frames: await countFrames(path),
  };
}

/** Video packet count (= frames) without decoding. */
function countFrames(path: string): Promise<number | null> {
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

async function audioMd5(path: string): Promise<string | null> {
  const r = await ffmpeg(['-i', path, '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-']).catch(() => null);
  return r ? (/MD5=([0-9a-f]{32})/.exec(r.stderr)?.[1] ?? null) : null;
}

/** Mean matte luma sampled once per second (0 = all transparent, 255 = all opaque). */
async function matteLuma(packed: string): Promise<number[]> {
  const r = await ffmpeg(['-i', packed, '-vf', 'fps=1,crop=iw/2:ih:iw/2:0,scale=90:160,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-']);
  return [...r.stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Math.round(+m[1] * 10) / 10);
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return json(404, { error: 'not-found' });
  if (!tokenOk(request.headers.get('x-spike-token'))) return json(401, { error: 'unauthorized' });
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: 'not-configured' });
  const body = (await request.json()) as { case: string; step: 'normalize' | 'pack'; preset?: string; mask?: string };
  if (!/^[a-z0-9-]{1,40}$/.test(body.case ?? '')) return json(400, { error: 'bad-case' });
  const preset = /^(ultrafast|superfast|veryfast|faster|fast|medium)$/.test(body.preset ?? '') ? body.preset! : 'veryfast';
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const dir = join('/tmp', `spike-${body.case}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const rss: Record<string, number | null> = {};
  const lap = (k: string, s0: number) => { timings[k] = (Date.now() - s0) / 1000; };

  async function get(obj: string, file: string) {
    const s0 = Date.now();
    const signed = await db.storage.from(WORK).createSignedUrl(obj, 600);
    if (signed.error) throw new Error(`sign ${obj}: ${signed.error.message}`);
    const res = await fetch(signed.data.signedUrl);
    if (!res.ok || !res.body) throw new Error(`download ${obj}: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
    lap(`download_${file.split('/').pop()}`, s0);
    return file;
  }
  async function put(file: string, obj: string) {
    const s0 = Date.now();
    const up = await db.storage.from(WORK).upload(obj, readFileSync(file), { contentType: 'video/mp4', upsert: true });
    if (up.error) throw new Error(`upload ${obj}: ${up.error.message}`);
    lap(`upload_${obj.split('/').pop()}`, s0);
  }

  try {
    const env = {
      cpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemMiB: Math.round(totalmem() / 2 ** 20),
      lambdaMemMiB: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? null, region: process.env.VERCEL_REGION ?? null,
      tmpFreeMiB: (() => { const s = statfsSync('/tmp'); return Math.round((s.bavail * s.bsize) / 2 ** 20); })(),
      ffmpegBytes: existsSync(FFMPEG) ? statSync(FFMPEG).size : null,
    };
    const result: Record<string, unknown> = { case: body.case, step: body.step, preset, env };
    if (body.step === 'normalize') {
      const src = await get(`spike/in/${body.case}-src.mp4`, join(dir, 'src.mp4'));
      result.source = { bytes: statSync(src).size, ...(await info(src)) };
      result.sourceAudioMd5 = await audioMd5(src);
      const norm = join(dir, 'normalized.mp4');
      const r = await ffmpeg(['-i', src, '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', "scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)':flags=lanczos,fps=30,format=yuv420p",
        '-c:v', 'libx264', '-preset', preset, '-crf', '16', '-g', '30', '-c:a', 'copy', '-movflags', '+faststart', norm]);
      timings.normalize = r.seconds; rss.normalize = r.maxrssMiB;
      result.normalized = { bytes: statSync(norm).size, ...(await info(norm)), audioMd5: await audioMd5(norm) };
      await put(norm, `spike/work/${body.case}-normalized.mp4`);
    } else if (body.step === 'pack') {
      const norm = await get(`spike/work/${body.case}-normalized.mp4`, join(dir, 'normalized.mp4'));
      const mask = await get(`spike/in/${body.mask ?? `${body.case}-mask.mov`}`, join(dir, 'mask'));
      const n = await info(norm);
      if (!n.width || !n.height || !n.frames) throw new Error('normalized video unreadable');
      const video = join(dir, 'packed.video.mp4');
      const packed = join(dir, 'packed.mp4');
      const r = await ffmpeg(['-i', norm, '-i', mask, '-filter_complex',
        `[1:v]scale=${n.width}:${n.height}:flags=bicubic,fps=30,format=gray,format=yuv420p[m];[0:v][m]hstack=inputs=2,format=yuv420p[v]`,
        '-map', '[v]', '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', preset, '-crf', '18', '-g', '30',
        '-frames:v', String(n.frames), video]);
      timings.pack = r.seconds; rss.pack = r.maxrssMiB;
      const m = await ffmpeg(['-i', video, '-i', norm, '-map', '0:v:0', '-map', '1:a:0?', '-c', 'copy', '-movflags', '+faststart', packed]);
      timings.mux = m.seconds;
      const s0 = Date.now();
      const p = await info(packed);
      const luma = await matteLuma(packed);
      const normMd5 = await audioMd5(norm);
      const packedMd5 = await audioMd5(packed);
      lap('validate', s0);
      result.packed = { bytes: statSync(packed).size, ...p, audioMd5: packedMd5 };
      result.validation = {
        frames_match: p.frames === n.frames,
        size_is_2w_x_h: p.width === 2 * n.width && p.height === n.height,
        audio_identical_to_normalized: !!packedMd5 && packedMd5 === normMd5,
        duration_delta_s: p.duration != null && n.duration != null ? Math.round((p.duration - n.duration) * 1000) / 1000 : null,
        matte_mean_luma_per_s: luma,
        matte_not_blank: luma.length > 0 && luma.every((y) => y > 2 && y < 253),
      };
      await put(packed, `spike/out/${body.case}-packed.mp4`);
    } else {
      return json(400, { error: 'bad-step' });
    }
    result.timings = timings;
    result.ffmpegMaxRssMiB = rss;
    result.nodeRssMiB = Math.round(process.memoryUsage().rss / 2 ** 20);
    result.totalSeconds = (Date.now() - t0) / 1000;
    return json(200, result);
  } catch (e) {
    return json(500, { error: String(e).slice(0, 800), timings, totalSeconds: (Date.now() - t0) / 1000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

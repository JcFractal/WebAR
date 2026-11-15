#!/usr/bin/env python3
"""G2 cutout pipeline: ordinary recording -> cutout files for the Android AR player.

Outputs go to a private directory OUTSIDE the repository (default ~/g2-private/<name>/):

  <name>-packed.mp4      H.264 + original audio; colour on the left half, grayscale matte on the
                         right half. Choose it in the player's local picker ("-packed.mp4" selects
                         Packed matte automatically).
  <name>-alpha.webm      VP9 with native alpha + Opus audio, for the native-alpha comparison.
  <name>-foreground.mov  Master: ProRes 4444 colour + alpha (10-bit), original audio.
  <name>-matte.mkv       Master: lossless FFV1 grayscale matte, frame-aligned to normalized.mp4.
  normalized.mp4         Orientation-normalized, scaled source used for matting.
  provider/              Raw provider outputs and response (when a provider is used).
  contact.png            Cutout over magenta/black at start, middle, end, for edge review.
  report.json            Method, timings, stream specs, frame counts, A/V sync and flicker numbers.

Matte methods (one at a time):
  fal-birefnet   fal.ai fal-ai/birefnet/v2/video (needs FAL_KEY; uploads the clip to fal).
  chroma-test    ffmpeg chromakey; only for the synthetic green-screen fixture (pipeline proof).
  file:<path>    Use an existing matte video (white = keep), e.g. from another tool.

Requires ffmpeg/ffprobe (libx264, libvpx-vp9, prores_ks, ffv1, libopus) and the packages in
scripts/g2/requirements.txt.

    python3 scripts/g2/cutout.py SOURCE.mp4 --method fal-birefnet [--name juan-take1]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
FAL_ENDPOINT = 'fal-ai/birefnet/v2/video'


def run(cmd, **kw):
    print('+', ' '.join(str(c) for c in cmd), file=sys.stderr)
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def ff(*args):
    run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *args])


def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', str(path)],
        check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def stream(info, kind):
    return next((s for s in info['streams'] if s['codec_type'] == kind), None)


def rotation(v):
    for sd in v.get('side_data_list', []) or []:
        if 'rotation' in sd:
            return int(sd['rotation'])
    return int((v.get('tags') or {}).get('rotate', 0))


def count_frames(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets',
         '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', str(path)],
        check=True, capture_output=True, text=True).stdout.strip()
    return int(out.split(',')[0])


def summary(path):
    info = probe(path)
    v, a = stream(info, 'video'), stream(info, 'audio')
    s = {
        'file': Path(path).name,
        'bytes': Path(path).stat().st_size,
        'container_duration': float(info['format'].get('duration', 0)),
        'video': v and {
            'codec': v['codec_name'], 'profile': v.get('profile'), 'pix_fmt': v.get('pix_fmt'),
            'width': v['width'], 'height': v['height'], 'rotation': rotation(v),
            'fps': v.get('avg_frame_rate'), 'start': float(v.get('start_time', 0)),
            'duration': float(v.get('duration', info['format'].get('duration', 0))),
            'frames': count_frames(path), 'bitrate': v.get('bit_rate'),
            'alpha_mode': (v.get('tags') or {}).get('alpha_mode') or (v.get('tags') or {}).get('ALPHA_MODE'),
        },
        'audio': a and {
            'codec': a['codec_name'], 'sample_rate': a.get('sample_rate'), 'channels': a.get('channels'),
            'start': float(a.get('start_time', 0)),
            'duration': float(a.get('duration', info['format'].get('duration', 0))),
        },
    }
    return s


def audio_md5(path):
    return subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-c', 'copy', '-f', 'md5', '-'],
                          check=True, capture_output=True, text=True).stdout.strip()


def matte_fal(normalized, out_dir, model, resolution):
    if not os.environ.get('FAL_KEY'):
        sys.exit('FAL_KEY is not set; the fal-birefnet method needs it.')
    import fal_client
    prov = out_dir / 'provider'
    prov.mkdir(exist_ok=True)
    t0 = time.time()
    url = fal_client.upload_file(str(normalized))
    t1 = time.time()
    args = {
        'video_url': url, 'model': model, 'operating_resolution': resolution,
        'output_mask': True, 'refine_foreground': True,
        'video_output_type': 'PRORES4444 (.mov)', 'video_quality': 'maximum',
    }
    handle = fal_client.submit(FAL_ENDPOINT, arguments=args)
    result = handle.get()
    t2 = time.time()
    meta = {
        'endpoint': FAL_ENDPOINT, 'request_id': handle.request_id,
        'arguments': {k: v for k, v in args.items() if k != 'video_url'},
        'upload_seconds': round(t1 - t0, 1), 'processing_seconds': round(t2 - t1, 1), 'result': result,
    }
    (prov / 'response.json').write_text(json.dumps(meta, indent=2))
    fg = prov / ('foreground' + Path(result['video'].get('file_name') or 'x.mov').suffix)
    urllib.request.urlretrieve(result['video']['url'], fg)
    mask = result.get('mask_video')
    if not mask:
        sys.exit('fal returned no mask_video; cannot build a matte.')
    mk = prov / ('mask' + Path(mask.get('file_name') or 'x.mp4').suffix)
    urllib.request.urlretrieve(mask['url'], mk)
    return mk, meta, fg


def matte_chroma(normalized, out_dir):
    raw = out_dir / 'chroma-matte.mkv'
    ff('-i', normalized, '-vf', 'chromakey=0x00b140:0.13:0.05,format=yuva444p,alphaextract,format=gray',
       '-an', '-c:v', 'ffv1', raw)
    return raw, {'method': 'ffmpeg chromakey 0x00b140 similarity 0.13 blend 0.05 (synthetic fixture only)'}


def matte_stats(path, w, h):
    """Coverage, softness and flicker of a matte, streamed one frame at a time (bounded memory)."""
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                            stdout=subprocess.PIPE)
    n = w * h
    coverage, soft_frac, edge_change, flips = [], [], [], []
    prev = prev_soft = None
    while True:
        buf = proc.stdout.read(n)
        if len(buf) < n:
            break
        f = np.frombuffer(buf, np.uint8).astype(np.float32) / 255
        soft = (f > 0.05) & (f < 0.95)
        coverage.append(float((f > 0.5).mean()))
        soft_frac.append(float(soft.mean()))
        if prev is not None:
            # Flicker: frame-to-frame change near the subject edge (pixels soft in either frame).
            band = soft | prev_soft
            edge_change.append(float((np.abs(f - prev) * band).sum() / max(int(band.sum()), 1)))
            flips.append(float(((f > 0.5) != (prev > 0.5)).mean()))
        prev, prev_soft = f, soft
    if proc.wait() != 0:
        sys.exit(f'could not decode matte {path}')
    if not flips:
        return {'frames': len(coverage)}
    r = lambda v, d=4: round(float(v), d)
    return {
        'frames': len(coverage),
        'coverage_mean': r(np.mean(coverage)),
        'coverage_min_max': [r(min(coverage)), r(max(coverage))],
        'soft_pixel_fraction': r(np.mean(soft_frac)),
        'edge_change_mean': r(np.mean(edge_change)),
        'edge_change_p95': r(np.percentile(edge_change, 95)),
        'binary_flip_fraction_mean': r(np.mean(flips), 5),
        'binary_flip_fraction_p95': r(np.percentile(flips, 95), 5),
        'worst_flip_frame': int(np.argmax(flips)) + 1,
    }


def contact_sheet(normalized, matte, w, h, duration, path):
    from PIL import Image
    tiles = []
    for t in (0.5, duration / 2, max(duration - 0.5, 0)):
        rgb = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', str(normalized), '-frames:v', '1',
                              '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout
        m = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', str(matte), '-frames:v', '1',
                            '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], check=True, capture_output=True).stdout
        c = np.frombuffer(rgb, np.uint8).reshape(h, w, 3).astype(np.float32)
        a = (np.frombuffer(m, np.uint8).reshape(h, w, 1).astype(np.float32) / 255)
        for bg in ((255, 0, 255), (0, 0, 0)):
            tiles.append((c * a + np.array(bg, np.float32) * (1 - a)).astype(np.uint8))
    sheet = np.concatenate(tiles, axis=1)
    Image.fromarray(sheet).resize((sheet.shape[1] // 2, sheet.shape[0] // 2), Image.LANCZOS).save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source')
    ap.add_argument('--method', required=True, help='fal-birefnet | chroma-test | file:<matte video>')
    ap.add_argument('--name', help='output base name (default: source file stem)')
    ap.add_argument('--out', help='output directory (default: ~/g2-private/<name>)')
    ap.add_argument('--height', type=int, default=1280, help='normalized long-edge height for portrait')
    ap.add_argument('--fal-model', default='Matting')
    ap.add_argument('--fal-resolution', default='1024x1024')
    ap.add_argument('--colour', help='colour video to pair with the matte (default: the provider foreground, '
                    'whose edge colours are refined, when there is one; otherwise the normalized source)')
    ap.add_argument('--source-colour', action='store_true', help='always use the normalized source colour')
    args = ap.parse_args()

    src = Path(args.source).resolve()
    name = args.name or src.stem
    out = Path(args.out or Path.home() / 'g2-private' / name).resolve()
    if out == REPO or REPO in out.parents:
        if 'public' in out.relative_to(REPO).parts or 'g2-private' not in out.parts:
            sys.exit(f'Refusing to write outputs inside the repository ({out}); personal footage stays out of Git.')
    out.mkdir(parents=True, exist_ok=True)
    report = {'source': summary(src), 'method': args.method, 'started': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    sv, sa = report['source']['video'], report['source']['audio']
    if not sv:
        sys.exit('source has no video stream')

    # 1. Normalize: ffmpeg applies the rotation tag, so the output is upright with no rotation tag.
    t0 = time.time()
    rot = abs(sv['rotation']) % 180 == 90
    w0, h0 = (sv['height'], sv['width']) if rot else (sv['width'], sv['height'])
    if h0 >= w0:
        scale = f'scale=-2:{args.height}:flags=lanczos'
    else:
        scale = f'scale={args.height}:-2:flags=lanczos'
    normalized = out / 'normalized.mp4'
    audio_args = ['-c:a', 'copy'] if sa and sa['codec'] == 'aac' else (['-c:a', 'aac', '-b:a', '160k'] if sa else ['-an'])
    ff('-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-vf', f'{scale},format=yuv420p', '-c:v', 'libx264',
       '-preset', 'slow', '-crf', '14', '-g', '30', *audio_args, '-movflags', '+faststart', normalized)
    nv = summary(normalized)['video']
    w, h = nv['width'], nv['height']
    report['normalize_seconds'] = round(time.time() - t0, 1)

    # 2. Matte.
    t0 = time.time()
    provider_colour = None
    if args.method == 'fal-birefnet':
        raw_matte, report['provider'], provider_colour = matte_fal(normalized, out, args.fal_model, args.fal_resolution)
    elif args.method == 'chroma-test':
        raw_matte, report['provider'] = matte_chroma(normalized, out)
    elif args.method.startswith('file:'):
        raw_matte, report['provider'] = Path(args.method[5:]).resolve(), {'method': 'external matte file'}
    else:
        sys.exit(f'unknown method {args.method}')
    report['matte_seconds'] = round(time.time() - t0, 1)
    report['raw_matte'] = summary(raw_matte)

    # 3. Conform the matte to the normalized frame grid (size, fps, frame count) as a lossless master.
    matte = out / f'{name}-matte.mkv'
    fps = nv['fps']
    ff('-i', raw_matte, '-vf', f'scale={w}:{h}:flags=bicubic,fps={fps},format=gray', '-frames:v', nv['frames'],
       '-an', '-c:v', 'ffv1', matte)

    # Colour: prefer refined provider foreground (background spill removed at soft edges).
    colour_in = None if args.source_colour else (Path(args.colour).resolve() if args.colour else provider_colour)
    colour = normalized
    if colour_in:
        colour = out / 'colour.mkv'
        ff('-i', colour_in, '-vf', f'scale={w}:{h}:flags=lanczos,fps={fps},format=yuv444p', '-frames:v', nv['frames'],
           '-an', '-c:v', 'ffv1', colour)
    report['colour_source'] = str(colour_in or 'normalized source')

    # 4. Deliverables. Video is encoded alone (exact frame count), then muxed with the ORIGINAL
    # source audio, copied when it is AAC, so no step can trim or shift the soundtrack.
    aac = bool(sa and sa['codec'] == 'aac')

    def deliver(path, filt, vcodec, acodec):
        tmp = path.with_name(path.stem + '.video' + path.suffix)
        ff('-i', colour, '-i', matte, '-filter_complex', filt, '-map', '[v]', '-an', *vcodec,
           '-frames:v', nv['frames'], tmp)
        mux = ['-map', '1:a:0', *acodec] if sa else []
        ff('-i', tmp, '-i', src, '-map', '0:v:0', *mux, '-c:v', 'copy',
           *(['-movflags', '+faststart'] if path.suffix == '.mp4' else []), path)
        tmp.unlink()

    packed = out / f'{name}-packed.mp4'
    deliver(packed, '[1:v]format=yuv420p[m];[0:v][m]hstack=inputs=2,format=yuv420p[v]',
            ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-g', '30'],
            ['-c:a', 'copy'] if aac else ['-c:a', 'aac', '-b:a', '160k'])
    alpha = out / f'{name}-alpha.webm'
    deliver(alpha, '[0:v][1:v]alphamerge,format=yuva420p[v]',
            ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-row-mt', '1', '-auto-alt-ref', '0', '-g', '30'],
            ['-c:a', 'libopus', '-b:a', '128k'])
    fg = out / f'{name}-foreground.mov'
    deliver(fg, '[0:v][1:v]alphamerge,format=yuva444p10le[v]', ['-c:v', 'prores_ks', '-profile:v', '4444'],
            ['-c:a', 'copy'] if aac else ['-c:a', 'pcm_s16le'])

    # 5. Checks.
    outputs = {k: summary(p) for k, p in
               (('normalized', normalized), ('matte', matte), ('packed', packed), ('alpha', alpha), ('foreground', fg))}
    report['outputs'] = outputs
    sync = {}
    for k in ('packed', 'alpha', 'foreground'):
        o = outputs[k]
        if o['audio'] and sa:
            sync[k] = {
                'audio_start_offset_vs_video_s': round(o['audio']['start'] - o['video']['start'], 4),
                'audio_duration_vs_source_s': round(o['audio']['duration'] - sa['duration'], 4),
                'video_frames_vs_normalized': o['video']['frames'] - nv['frames'],
            }
    report['sync'] = sync
    if aac:
        src_md5 = audio_md5(src)
        for k in ('packed', 'foreground'):
            sync[k]['audio_bitstream_identical_to_source'] = audio_md5(out / outputs[k]['file']) == src_md5
    report['source_av_offset_s'] = sa and round(sa['start'] - sv['start'], 4)
    report['matte_quality'] = matte_stats(matte, w, h)
    contact_sheet(colour, matte, w, h, nv['duration'], out / 'contact.png')
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ('sync', 'matte_quality', 'matte_seconds')}, indent=2))
    print(f'outputs in {out}')


if __name__ == '__main__':
    main()

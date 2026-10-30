#!/usr/bin/env python3
"""Generate the SYNTHETIC G1 test clip public/media/synthetic-greeting.mp4.

Not a real person: a drawn silhouette on a flat chroma-green background, with a soft
hum-like tone and three sync beeps (start / middle / end) that match an on-screen flash.
It proves loading, audio, keying and placement only; it says nothing about real hair or
edge quality. Requires Python 3 with Pillow and numpy, and ffmpeg with libx264 + aac.

    python3 scripts/make-synthetic-fixture.py
"""
import math
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SECONDS = 720, 1280, 30, 12
GREEN = (0, 177, 64)
BEEPS = (0.5, 6.0, 11.5)
SAMPLE_RATE = 48000
OUT = Path(__file__).resolve().parent.parent / 'public' / 'media' / 'synthetic-greeting.mp4'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
SS = 2  # supersampling for anti-aliased edges


def font(size):
    try:
        return ImageFont.truetype(FONT, size * SS)
    except OSError:
        return ImageFont.load_default()


def frame(i):
    t = i / FPS
    img = Image.new('RGB', (W * SS, H * SS), GREEN)
    d = ImageDraw.Draw(img)
    s = lambda v: int(v * SS)
    sway = 40 * math.sin(t * 1.3)
    cx = W / 2 + sway
    # Torso to the bottom edge so the subject stands on the frame bottom.
    d.rounded_rectangle([s(cx - 190), s(760), s(cx + 190), s(H + 80)], radius=s(150), fill=(52, 86, 160))
    d.ellipse([s(cx - 70), s(650), s(cx + 70), s(800)], fill=(214, 160, 128))  # neck
    d.ellipse([s(cx - 125), s(430), s(cx + 125), s(720)], fill=(224, 172, 140))  # head
    d.chord([s(cx - 132), s(415), s(cx + 132), s(640)], 180, 360, fill=(58, 40, 30))  # hair
    # Waving arm.
    ang = math.radians(-60 + 25 * math.sin(t * 4))
    sx, sy = cx + 170, 840
    ex, ey = sx + 230 * math.cos(ang), sy + 230 * math.sin(ang)
    d.line([s(sx), s(sy), s(ex), s(ey)], fill=(52, 86, 160), width=s(70))
    d.ellipse([s(ex - 45), s(ey - 45), s(ex + 45), s(ey + 45)], fill=(224, 172, 140))
    # Label and timecode on an opaque card.
    d.rounded_rectangle([s(60), s(70), s(W - 60), s(330)], radius=s(28), fill=(16, 18, 28))
    d.text((s(W / 2), s(130)), 'SYNTHETIC TEST CLIP', font=font(44), fill=(255, 255, 255), anchor='mm')
    d.text((s(W / 2), s(190)), 'not a real person', font=font(30), fill=(170, 180, 200), anchor='mm')
    d.text((s(W / 2), s(270)), f't = {t:5.2f} s   frame {i:03d}', font=font(34), fill=(124, 252, 154), anchor='mm')
    beep = any(b <= t < b + 0.2 for b in BEEPS)
    if beep:
        d.ellipse([s(W - 170), s(360), s(W - 70), s(460)], fill=(255, 255, 255))
    return img.resize((W, H), Image.LANCZOS)


def audio(path):
    n = SAMPLE_RATE * SECONDS
    t = np.arange(n) / SAMPLE_RATE
    envelope = 0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t) ** 2  # speech-like syllable rhythm
    hum = 0.12 * envelope * (np.sin(2 * np.pi * 180 * t) + 0.4 * np.sin(2 * np.pi * 360 * t))
    fade = np.clip(np.minimum(t, SECONDS - t) / 0.3, 0, 1)
    signal = hum * fade
    for b in BEEPS:
        m = (t >= b) & (t < b + 0.2)
        signal[m] += 0.5 * np.sin(2 * np.pi * 1000 * t[m])
    pcm = (np.clip(signal, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'audio.wav'
        audio(wav)
        cmd = [
            'ffmpeg', '-y', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
            '-i', str(wav),
            '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow',
            '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', str(OUT),
        ]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for i in range(FPS * SECONDS):
            proc.stdin.write(frame(i).tobytes())
        proc.stdin.close()
        if proc.wait() != 0:
            sys.exit('ffmpeg failed')
    print(f'wrote {OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()

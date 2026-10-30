# WebAR Voice Sculpture

A small WebAR player that loads experiences from static JSON configs (`/?exp=<id>`).

**Documentation**

- **AR Greetings (current direction):** start at [`docs/greetings/00_START_HERE.md`](docs/greetings/00_START_HERE.md), then [`01_CURRENT_STATE.md`](docs/greetings/01_CURRENT_STATE.md), [`02_MVP_SPEC.md`](docs/greetings/02_MVP_SPEC.md) (governs greeting work), [`03_BUILD_PLAN.md`](docs/greetings/03_BUILD_PLAN.md) and the living [`04_HANDOFF.md`](docs/greetings/04_HANDOFF.md).
- **Particle experiences (historical event scope):** [`SPEC.md`](SPEC.md) and [`DEVIN_RUNBOOK.md`](DEVIN_RUNBOOK.md) still define Neon Garden and Cosmic Vortex and are the reference for preserving them.

**Status (checked against the code):**

- Particle demo (milestones 1–5 merged): gallery with links and QR codes; Neon Garden and Cosmic Vortex on one shared swarm engine; continuous voice control (Live) or buttons (Manual); Android WebXR AR placement with Reset and Exit. The milestone 6 reliability pass and the camera overlay mode were not done and are paused.
- AR Greetings G1 (S24 phone test pending): a `video` template that plays a same-origin fixture or a locally selected MP4 on an upright plane, with optional chroma keying, size/bottom-offset/loop settings and placement through the same Android AR code. No uploads, accounts, background removal or shareable personal greetings yet; see the handoff.

## Voice input (milestone 3)

`Enable sound` (a user tap) creates/resumes the `AudioContext` and calls `getUserMedia({ audio, video: false })`. The signal goes only to an `AnalyserNode`: it is never played back, recorded, uploaded, or sent to any service. Echo cancellation / noise suppression / auto gain are requested off as preferences only, so they cannot make setup fail.

- `src/audio/mic.ts` — `MicInput`: one stream at a time (repeat taps reuse the pending request), refusal / missing device / busy / unsupported states with Retry, cleanup on Stop sound and page exit.
- `src/audio/analysis.ts` — `VoiceAnalyzer` (pure, deterministic): RMS → dB above the calibrated noise floor → `energy`; envelope variation → `steadiness`; onset above the recent peak → `burst`.
  - Continuous mapping; energy (motion) is separate from coherence (formation).
  - `energy` immediately drives brightness, point size and outward ripples (`swarm.rippleStrength`).
  - `turbulence` = loudness × unsteadiness: loud, varying speech churns the cloud (`swarm.turbulenceStrength`) without forming it.
  - Coherence target = max(soft speech → up to `speechCoherence`, steadiness × tonality × loudness). Tonality is spectral flatness (90 Hz–3 kHz, 2048-point FFT) after removing the calibrated noise spectrum, compared to `tonalThreshold`. A soft hum holds an intermediate shape, a full hum completes it, and a wavering hum loosens it. Steady broadband noise stays low. Coherence builds with time constant `steadyHoldSeconds`; the blend moves at most 1 / `gatherSeconds` per second.
  - Silence shorter than `quietDelaySeconds` (a breath) keeps the shape; longer silence relaxes it over `quietSettleSeconds`.
  - A jump of `burstThresholdDb` over the recent peak, with energy ≥ `burstMinEnergy`, triggers one burst, then waits `burstCooldownSeconds`.
- Calibration runs automatically on the first Enable sound (stay quiet ~2 s) and again from Diagnostics → Calibrate. The noise floor is the 90th percentile of the measured level.

**Live / Manual:** the badge shows the active input. In Live mode the microphone writes `SwarmControls`; in Manual mode Drift / Gather / Burst write the same controls. If the microphone is refused or lost, the player falls back to Manual. **Diagnostics** shows mic status, energy, level, noise floor, steadiness, gather, state, and frame rate, plus Sensitivity, Calibrate, Retry mic, and Stop sound.

This is a sound-level heuristic, not speech recognition: any steady tonal sound (humming, a held vowel, a sustained note or steady music) can complete the formation.

## Swarm (milestone 2)

One shared engine in `src/swarm/` renders every experience as a single `THREE.Points` cloud (typed arrays, O(n) update, soft additive point sprites).

- `controls.ts` — normalized `energy`, `gather`, `burst` (0–1). Written by the Manual buttons or, in Live mode, by the microphone.
- `formations.ts` — procedural `flower` and `rings` targets.
- `motion.ts` — `garden` and `vortex` drift presets.
- `swarm.ts` — blends drift → formation by `gather`, adds a bounded, decaying `burst` impulse.
- `ui.ts` / `mount.ts` — HUD (Live/Manual badge, Drift / Gather / Burst, sound meter, Fullscreen, Tune and Diagnostics panels), resize, and the single `renderer.setAnimationLoop`.

Add `&debug` to a player URL to expose `window.__webar` (controls, mic, analyzer, frame count, max radius) for testing.

Stack: Vite + vanilla TypeScript + Three.js. Versions are pinned in `package.json` / `package-lock.json`.

## Local commands

Requires Node 20.19+ (22 recommended, see `.nvmrc`).

```bash
npm ci            # install exactly what the lockfile pins
npm run dev       # dev server at http://localhost:5173
npm run build     # type-check + production build into dist/
npm test          # node:test checks for config validation and video helpers (tests/)
npm run preview   # serve dist/ at http://localhost:4173
```

## URLs

| URL | Shows |
|---|---|
| `/` | Gallery: one card per `public/manifest.json` entry with a link, a QR code, and a downloadable QR PNG |
| `/?exp=neon-garden` | Neon Garden player |
| `/?exp=cosmic-vortex` | Cosmic Vortex player |
| `/?exp=greeting-test` | Video greeting test (G1): synthetic fixture clip plus a local-MP4 picker; listed under "Test fixtures" in the gallery |
| `/?exp=<unknown or malformed>` | Error message with a link back to the gallery; never falls back to another experience |

## Adding an experience config

1. Add `public/experiences/<id>.json` (`id` must match the filename; lowercase letters, numbers, dashes).
2. Add `{ "id": "<id>", "title": "<Title>" }` to `public/manifest.json`. IDs not listed there are rejected before any fetch.

Validated fields: `id`, `template` (`swarm`), `title`, `settings.particleCount` (integer 1–10000), `settings.palette` (`#RRGGBB` list), `settings.motionPreset`, `settings.formation`, `settings.diameterMeters`, `settings.heightAboveSurfaceMeters`. `motionPreset` is `garden` or `vortex`; `formation` is `flower` or `rings`.

Optional `settings.swarm` tuning (defaults in `src/config.ts`): `pointSize` (0.002–0.05 m), `brightness` (0.1–3), `burstStrength` (0–1.5), `burstRecoverySeconds` (0.2–10), `releaseSeconds` (0.2–20), `maxPixelRatio` (0.5–3). `brand` is accepted for later milestones.

Optional `settings.audio` (defaults in `AUDIO_DEFAULTS`, `src/config.ts`; starting points to tune on site): `gain` 1.4 (sensitivity, 0.1–10), `calibrationSeconds` 2, `speechCoherence` 0.2, `tonalThreshold` 0.5, `steadyHoldSeconds` 0.8, `gatherSeconds` 1.2, `quietSettleSeconds` 3, `quietDelaySeconds` 0.7, `burstCooldownSeconds` 1, `burstThresholdDb` 15, `burstMinEnergy` 0.45, `dynamicRangeDb` 48, `enterThreshold` 0.12, `exitThreshold` 0.06 (must be below enter), `steadyThreshold` 0.6. Unknown keys and out-of-range values are rejected.

## Video greeting template (G1)

`src/video/` is a separate template beside `src/swarm/`; it never creates a microphone stream.

- `clip.ts` — `VideoClip`: one `<video>` + `THREE.VideoTexture`, playback states (`loading`, `ready`, `playing`, `paused`, `ended`, `blocked`, `error`), Retry, and `dispose()` that releases the element, listeners, texture and the local object URL together. Choosing another file disposes the previous clip.
- `material.ts` — opaque or chroma-key shader (BT.601 Cb/Cr distance to the key color, `tolerance`, `softness` edge ramp, `spill` suppression). This is a controlled test path for green-screen clips, not automatic background removal.
- `media.ts` — pure helpers (local-file checks, error wording, plane size, color math) covered by `npm test`.
- `mount.ts` / `ui.ts` — one renderer and animation loop; the plane's bottom edge sits `bottomOffsetMeters` above the placed point and the whole frame is `displayHeightMeters` tall. Nothing is drawn until the first decoded frame. Play/Pause, Replay, Sound, Enter AR / Reset placement / Exit AR, Choose local MP4, and an Adjust appearance panel (height, bottom offset, loop, keying, preview background). Playback starts only from a tap (Play, Replay or the AR placement tap) so sound is allowed on mobile; searching for a surface pauses and rewinds, placing starts from the beginning, Exit pauses.
- A locally chosen MP4 stays on the device as a temporary `blob:` URL. It is not uploaded, persisted or shareable, and the page says so.

Video config fields (`template: "video"`): `settings.source` (`media/<name>.mp4`, same-origin only; required unless `settings.localFile` is true), `settings.sourceNote` (≤200 chars), `settings.displayHeightMeters` (0.25–2.5, default 1.2), `settings.bottomOffsetMeters` (0–2, default 0), `settings.loop` (default false), `settings.localFile` (show the local picker, default false), and `settings.keying` with `mode` (`opaque` | `chroma`, default opaque), `color` (`#RRGGBB`, default `#00b140`), `tolerance` (0–1), `softness` (0–0.5), `spill` (0–1). Manifest entries may set `"test": true` to list them under "Test fixtures" in the gallery.

`public/media/synthetic-greeting.mp4` is a generated, clearly labeled synthetic clip (drawn figure on green, beeps for sync), made by `scripts/make-synthetic-fixture.py`. It is not personal footage and says nothing about real hair or edge quality.

## Vercel

Static Vite build, no backend or secrets. `vercel.json` pins these settings:

- Framework preset: **Vite**
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

Gallery links and QR codes use the single public base URL in `src/site.ts` (`https://web-ar-gold.vercel.app/`, override with `VITE_PUBLIC_BASE_URL` at build time), so new deployments on the same domain don't need reprinted QRs. Use the project's stable production `*.vercel.app` domain for demo links and QR codes, and confirm it opens signed-out (preview deployments may be protected by Vercel Deployment Protection).

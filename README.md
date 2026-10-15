# WebAR Voice Sculpture

A small WebAR player that loads experiences from static JSON configs (`/?exp=<id>`). See [`SPEC.md`](SPEC.md) (authoritative scope) and [`DEVIN_RUNBOOK.md`](DEVIN_RUNBOOK.md) (milestones).

**Status:** milestone 3 — shared particle swarm driven by the microphone (Live) or buttons (Manual). No camera or AR yet.

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
npm run preview   # serve dist/ at http://localhost:4173
```

## URLs

| URL | Shows |
|---|---|
| `/` | Entry page listing experiences from `public/manifest.json` (becomes the QR gallery later) |
| `/?exp=neon-garden` | Neon Garden player |
| `/?exp=<unknown or malformed>` | Error message with a link back to the gallery; never falls back to another experience |

## Adding an experience config

1. Add `public/experiences/<id>.json` (`id` must match the filename; lowercase letters, numbers, dashes).
2. Add `{ "id": "<id>", "title": "<Title>" }` to `public/manifest.json`. IDs not listed there are rejected before any fetch.

Validated fields: `id`, `template` (`swarm`), `title`, `settings.particleCount` (integer 1–10000), `settings.palette` (`#RRGGBB` list), `settings.motionPreset`, `settings.formation`, `settings.diameterMeters`, `settings.heightAboveSurfaceMeters`. `motionPreset` is `garden` or `vortex`; `formation` is `flower` or `rings`.

Optional `settings.swarm` tuning (defaults in `src/config.ts`): `pointSize` (0.002–0.05 m), `brightness` (0.1–3), `burstStrength` (0–1.5), `burstRecoverySeconds` (0.2–10), `releaseSeconds` (0.2–20), `maxPixelRatio` (0.5–3). `brand` is accepted for later milestones.

Optional `settings.audio` (defaults in `AUDIO_DEFAULTS`, `src/config.ts`; starting points to tune on site): `gain` 1.4 (sensitivity, 0.1–10), `calibrationSeconds` 2, `speechCoherence` 0.2, `tonalThreshold` 0.5, `steadyHoldSeconds` 0.8, `gatherSeconds` 1.2, `quietSettleSeconds` 3, `quietDelaySeconds` 0.7, `burstCooldownSeconds` 1, `burstThresholdDb` 15, `burstMinEnergy` 0.45, `dynamicRangeDb` 48, `enterThreshold` 0.12, `exitThreshold` 0.06 (must be below enter), `steadyThreshold` 0.6. Unknown keys and out-of-range values are rejected.

## Vercel

Static Vite build, no backend or secrets. `vercel.json` pins these settings:

- Framework preset: **Vite**
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

Use the project's stable production `*.vercel.app` domain for demo links and QR codes, and confirm it opens signed-out (preview deployments may be protected by Vercel Deployment Protection).

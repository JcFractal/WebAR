# WebAR Voice Sculpture

A small WebAR player that loads experiences from static JSON configs (`/?exp=<id>`). See [`SPEC.md`](SPEC.md) (authoritative scope) and [`DEVIN_RUNBOOK.md`](DEVIN_RUNBOOK.md) (milestones).

**Status:** milestone 2 — shared particle swarm with Manual controls. No microphone, camera, or AR yet.

## Swarm (milestone 2)

One shared engine in `src/swarm/` renders every experience as a single `THREE.Points` cloud (typed arrays, O(n) update, soft additive point sprites).

- `controls.ts` — normalized `energy`, `gather`, `burst` (0–1). The Manual buttons drive these now; the microphone will drive the same values in milestone 3.
- `formations.ts` — procedural `flower` and `rings` targets.
- `motion.ts` — `garden` and `vortex` drift presets.
- `swarm.ts` — blends drift → formation by `gather`, adds a bounded, decaying `burst` impulse.
- `ui.ts` / `mount.ts` — HUD (Manual badge, Drift / Gather / Burst, Fullscreen, Tune panel, optional FPS readout), resize, and the single `renderer.setAnimationLoop`.

Add `&debug` to a player URL to expose `window.__webar` (control state, frame count, current max radius) for testing.

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

Optional `settings.swarm` tuning (defaults in `src/config.ts`): `pointSize` (0.002–0.05 m), `brightness` (0.1–3), `burstStrength` (0–1.5), `burstRecoverySeconds` (0.2–10), `releaseSeconds` (0.2–20), `maxPixelRatio` (0.5–3). `settings.audio` and `brand` are accepted now and used in later milestones.

## Vercel

Static Vite build, no backend or secrets. `vercel.json` pins these settings:

- Framework preset: **Vite**
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

Use the project's stable production `*.vercel.app` domain for demo links and QR codes, and confirm it opens signed-out (preview deployments may be protected by Vercel Deployment Protection).

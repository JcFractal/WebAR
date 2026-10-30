# Current state — before AR Greetings
Recorded October 29, 2026. This is a baseline snapshot, not a new test report.

## Repository evidence
- Repository: https://github.com/JcFractal/WebAR
- Observed default/main commit: `accf90a1b6b968001edfbfb8e71314b994bacdd7`.
- Commit message: “Merge pull request #7 from JcFractal/devin/m5-gallery-qr”.
- Commit date reported by GitHub: October 15, 2026.
- Known production URL from code and prior project work: https://web-ar-gold.vercel.app/
- Existing experience links:
  - https://web-ar-gold.vercel.app/?exp=neon-garden
  - https://web-ar-gold.vercel.app/?exp=cosmic-vortex

The current session read the main branch metadata, repository tree, full existing planning documents, and the key modules listed below. It did not install dependencies, run a build, inspect the deployed site, or repeat phone tests. Production's current deployed commit has not been independently matched to main. Recheck branch and deployments when implementation starts.

## What exists
| Area | Observed implementation |
| --- | --- |
| Application | Vite + vanilla TypeScript + Three.js |
| Dependencies | package.json pins Vite 7.3.7, TypeScript 5.9.3, Three.js 0.185.1, qrcode 1.5.4 |
| Commands | npm run dev; npm run typecheck; npm run build; npm run preview |
| Runtime requirement | package.json requires Node >=20.19; follow the repo's .nvmrc |
| Experience routing | ?exp=<id>, static manifest, validated static JSON configs |
| Templates | Registry currently registers only swarm |
| Content | Neon Garden and Cosmic Vortex share particle/audio implementation |
| QR gallery | Links, displayed URLs, SVG QR, downloaded PNG; public URL helper |
| AR | WebXR immersive-ar hit-test, reticle, tap placement, reset, exit |
| Audio input | Mic calibration, continuous motion/coherence mapping, manual fallback |
| Hosting | Existing Vercel configuration |

Earlier conversation memory mentioned a different Three.js version. The package.json at the recorded commit is the authority for this snapshot. Do not upgrade dependencies just to start greetings.

## Phone evidence from Juan
These are user-reported results from the earlier hackathon conversation, not freshly verified here.

| Feature | Evidence status |
| --- | --- |
| Neon Garden surface placement | Juan reported working on S24 Ultra |
| Walk around placed particles | Juan reported working |
| Mic response in AR | Juan reported working |
| Reset placement | Juan reported working |
| Exit AR | No explicit completed phone result in the supplied conversation |
| Cosmic Vortex in AR | No explicit completed phone result in the supplied conversation |
| Both downloaded QRs scanned on phone | No explicit completed phone result in the supplied conversation |
| Video playback/keying | Not implemented/tested |
| iPhone playback/AR | Not verified |

Devin previously reported passing browser builds, QR decoding, gallery/config loading, manual formations, and unknown-ID behavior. Treat those as historical agent reports until reproduced for the new branch.

## Reuse and change map
| File | Present responsibility | Implication for greeting work |
| --- | --- | --- |
| src/main.ts | Gallery, ?exp routing, template loading, error page | Add greeting entry carefully; keep old routes |
| src/config.ts | Swarm-specific config/settings and validation | Introduce a discriminated video config; do not weaken validation |
| src/templates.ts | Lazy registry with swarm only | Add a separate video template |
| src/site.ts | Public base URL and publicExperienceUrl | Preserve existing QR payloads; later add greeting URL helper |
| src/xr/ar.ts | ArPlacement receives renderer, scene, anchor, overlay and height | Reuse for an upright video plane; adjust particle-specific wording carefully |
| src/swarm/mount.ts | Owns renderer, camera, scene, mic and one animation loop | Renderer is not yet a universal player service; avoid a broad rewrite |
| public/manifest.json | Public list of two demos | Personal greetings must not be appended here |
| public/experiences/*.json | Static particle configs | Keep the existing files compatible |
| vercel.json | Existing deployment settings | Add backend routing only when needed and verify old paths |

Important geometry detail: ArPlacement applies the supplied height to the anchor. The swarm caller adds its radius. A video with a bottom-at-origin group should use its bottom offset directly, with the plane center positioned half a video-height above that origin. Do not copy the swarm radius formula into the video template.

## Missing pieces
No video template, VideoTexture lifecycle, transparency pipeline, creator UI, persistent uploads, creator authentication, database, processing queue, publishing API, or greeting templates are present in the observed tree.

An ordinary MP4 is not automatically a transparent cutout. Background extraction and playback packaging are separate work. Neither copying a green-screen shader nor selecting a file proves automated background removal.

## Platform boundaries
Current tracking is local surface placement, not GPS, image recognition, a shared anchor, or a persistent anchor after reload. A flat video can be viewed from an angle but does not become a 3D person.

Do not infer iPhone ground placement from Android success. Use runtime support detection, record real devices and OS/browser versions, and provide a normal preview when AR cannot run.

## Documentation drift
The root README's opening status still says milestone 3 and “No camera or AR yet,” despite the AR implementation and PR #7 merge being present. Root SPEC.md and DEVIN_RUNBOOK.md still describe the completed event's scope. Correct the README status and append pointers to the greeting docs in G1; preserve the original history and old demo behavior.

## Starting procedure
Fetch current refs, read any AGENTS.md, compare main against this snapshot, inspect open branches/PRs, and preserve existing work. Use the latest appropriate main as the base unless an existing greeting branch already contains authorized work. Record any differences in 04_HANDOFF.md. Never reset a working branch to this historical SHA.

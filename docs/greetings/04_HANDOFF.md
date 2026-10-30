# AR Greetings — living handoff
Last updated: October 30, 2026 (G1 implementation, Devin)
Update this file in every implementation PR and before pausing or switching tools.

## Current status
- Stage: G1 code complete and in review; S24 phone test pending. G2 not started (do not start until Juan reports the G1 phone results and assigns G2).
- Active agent: Devin (G1). Stopped before G2.
- Current authorized next assignment: Juan's S24 test of G1 (checklist below), then G2 only if he assigns it.
- Repository: https://github.com/JcFractal/WebAR
- Observed baseline main: accf90a1b6b968001edfbfb8e71314b994bacdd7.
- Greeting branch / commit / PR: `devin/g1-video-placement`; G1 code commit a1fd865ea68f7e449f6c0a7265a42f760f6514b5 plus a later handoff-only commit (check the branch tip); PR https://github.com/JcFractal/WebAR/pull/8 (open, not merged).
- Greeting preview deployment / deployed commit: Vercel branch preview https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app/?exp=greeting-test (Vercel check passed for a1fd865; unauthenticated requests get a 302 to Vercel login, so open it signed in to Vercel). Production is unchanged.
- Existing production URL: https://web-ar-gold.vercel.app/ — historical project address; not rechecked live during planning.
- Backend project, schema and storage: not configured.
- Processing provider and media format: undecided; G2 owns the decision.
- Credentials: none supplied or created in this planning task.
- Personal test clips: none supplied. The repo contains only a generated synthetic fixture (`public/media/synthetic-greeting.mp4`, made by `scripts/make-synthetic-fixture.py`).
- Current blocker: real video AR, audio and keying quality need Juan's S24 test; the preview requires Vercel sign-in.
- Next concrete action: Juan runs the G1 S24 checklist below on the preview and reports results; Devin fixes any G1 defects on the same PR.

## Milestone tracking
| Milestone | Code/status | Browser checks | Phone checks | PR / commit |
| --- | --- | --- | --- | --- |
| G1 video placement | Code complete, in review | typecheck/build/`npm test` 12/12; headless CDP smoke 30/30 | Pending (Juan, S24) | PR #8, a1fd865 |
| G2 cutout/format proof | Not started | Not run | Not run | — |
| G3 persistent creator app | Not started | Not run | Not run | — |
| G4 automatic processing | Not started | Not run | Not run | — |
| G5 templates/private trial | Not started | Not run | Not run | — |

## Decision log
| Date | Decision | Basis / consequence |
| --- | --- | --- |
| 2026-10-29 | Recorded-person greeting is the MVP | Preserve the person's real speech and delivery |
| 2026-10-29 | Android surface placement first | Existing user-tested S24 foundation |
| 2026-10-29 | iPhone ordinary preview fallback; AR parity separate | No verified iPhone tracking path |
| 2026-10-29 | Private invited-creator alpha | Keeps the first upload product small and testable |
| 2026-10-29 | Simple one-page creator flow | Upload → processing → preview → publish |
| 2026-10-29 | Plain and Birthday only | A useful decorated greeting without an editor |
| 2026-10-29 | Hosted cutout experiment first | Prove quality before operating GPU infrastructure |
| 2026-10-29 | Provider and transport not selected yet | Need real clip, audio and device evidence |
| 2026-10-29 | Supabase is a proposed isolated backend default | Not an existing configured project |
| 2026-10-29 | One active coding agent | Avoid conflicting changes; GitHub is the durable source |
| 2026-10-30 | Separate `video` template; `ExperienceConfig` union on `template` | Juan: greetings are a new content type; config-only still applies within a template |
| 2026-10-30 | Plane size = whole-frame height (`displayHeightMeters`, default 1.2 m), bottom edge at `bottomOffsetMeters` (default 0) | Predictable placement; person height inside the frame varies by clip |
| 2026-10-30 | Synthetic labeled fixture in repo; personal clips only via local picker (blob URL, not shared) | No permitted public footage; privacy |
| 2026-10-30 | Test fixtures listed separately in gallery via manifest `"test": true` | Keeps the two particle demo cards first and unchanged |
| 2026-10-30 | Playback starts only from a tap (Play/Replay/AR placement tap) | Mobile autoplay-with-sound restrictions |

## Latest implementation report — fill after each milestone
- Timestamp and implementer: 2026-10-30, Devin (session https://app.devin.ai/sessions/90c954c7fe24476e8853485fba8f404c).
- Branch: `devin/g1-video-placement` (from main accf90a).
- Commit: a1fd865ea68f7e449f6c0a7265a42f760f6514b5 (G1 code); 1ac9b6e (planning pack); a later commit updates this file only.
- PR: https://github.com/JcFractal/WebAR/pull/8 — open, not merged.
- Preview URL: https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app/?exp=greeting-test (gallery at https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app/). Requires Vercel sign-in (302 to login when signed out). Gallery QR codes still encode the production base URL from `src/site.ts`, so scanning a QR on the preview opens production, where the greeting route does not exist until merge — open the preview link directly on the phone.
- Preview deployed commit: a1fd865 (Vercel check on PR #8); re-check the PR for the branch tip.
- Release URL and independently checked deployed commit: none; production https://web-ar-gold.vercel.app/ not changed.
- Changes and reason:
  - Planning pack added under `docs/greetings/`. A note at the top of `SPEC.md` and `DEVIN_RUNBOOK.md` points to the greeting docs. README status corrected to match the code (milestones 1–5 merged; milestone 6 and the camera overlay paused) and now documents the video template.
  - `src/config.ts`: `ExperienceConfig` is now a union of `SwarmExperienceConfig` and `VideoExperienceConfig`. `validateSwarmSettings` keeps the earlier swarm rules unchanged. `validateVideoSettings` accepts a same-origin `media/<name>.mp4`, height and offset ranges, `loop`, `localFile` and `keying`. Manifest entries can set `test`.
  - `src/templates.ts`: `loadTemplate(config)` lazily imports the swarm or video mount.
  - `src/xr/ar.ts`: optional `ArWording` (greeting vs sculpture text). Hit-test and placement logic unchanged.
  - `src/video/`:
    - `clip.ts` (`VideoClip` lifecycle, states, Retry, dispose) and `material.ts` (opaque / chroma Cb-Cr key with tolerance, softness, spill).
    - `media.ts` (pure helpers) and `ui.ts` (HUD and Adjust appearance panel).
    - `mount.ts`: one renderer and loop; bottom-aligned plane; AR search pauses and rewinds, placing restarts with sound, Reset pauses, Exit pauses; no microphone use.
  - `public/experiences/greeting-test.json` + `public/media/synthetic-greeting.mp4` (synthetic, labeled; 12 s 720×1280 H.264/AAC) + manifest test entry; gallery shows it under "Test fixtures".
  - `tests/` + `npm test` (`node --test`, Node ≥22.18 type stripping).
- Commands actually run and results (Node 22.23.4 via nvm):
  - `npm ci`: OK.
  - `npm run typecheck`: OK.
  - `npm run build`: OK.
  - `npm test`: 12/12 pass. Both particle configs validate as swarm; manifest order; video config accept/reject cases; local-file checks, error wording, plane size and color math.
- Static/code inspection: `ArPlacement` is reused unchanged apart from its wording. The swarm mount changed only in its config type. Particle JSON and audio tuning are untouched.
- Browser/simulated tests actually run: a headless Chrome 137 CDP script against `npm run preview` (412×915 mobile emulation, SwiftShader WebGL, no WebXR); 30/30 pass.
  - Gallery: both particle links unchanged and first; test section separate; 3 QR codes.
  - Particles: Neon Garden and Cosmic Vortex mount with no page errors and no microphone request on load.
  - Invalid IDs: `does-not-exist`, `..%2Fmanifest` and `NEON-GARDEN` show the error page.
  - Greeting playback:
    - First frame arrives before the plane is shown; 9:16 size.
    - Play with sound via mouse click; Pause; Replay restarts near 0; Sound toggle.
    - Without loop the clip ends; loop toggle; height and offset keep the bottom edge at the offset.
    - Enter AR shows "not available" and stays in the preview.
  - Local file: a local MP4 creates exactly one object URL; choosing again keeps one URL and one `<video>`; non-MP4 rejected; corrupt MP4 shows a recoverable error with no plane; Use test clip revokes the URL; no `getUserMedia` call at any point.
  - Screenshots inspected (opaque and chroma on a light background). This proves nothing about S24 AR, phone audio or real edge quality.
- Real provider calls and measured result: none (G1 has no processing).
- Real phone tests reported by Juan/tester: none yet.
- Remaining failures / limitations:
  - Video AR is untested on a phone. Chroma keying is a basic test path; no despill tuning on real footage.
  - MP4 (H.264/AAC) only; HEVC/MOV are rejected or reported as unplayable. Local picks are temporary blob URLs: not uploaded, persisted or shareable.
  - The preview needs Vercel sign-in. No iPhone ground placement.
  - Gallery QR for `greeting-test` points at production, which only works after merge.
- Relevant config variable names and setup location (never values): `VITE_PUBLIC_BASE_URL` (optional, build time; existing). No secrets.
- New migrations and whether applied: none.
- Exact next assignment: Juan runs the G1 S24 checklist below and reports the results. Devin fixes G1 defects on PR #8. G2 starts only when Juan assigns it.

### G1 S24 checklist (Chrome, preview URL above)
1. Choose a 10–15 s local MP4 (Choose local MP4): correct aspect, sound after tapping Play, Replay works.
2. Prepared green-screen clip (or the synthetic test clip): with Background set to Chroma key, the green disappears in AR against the camera; adjust Tolerance and Edge softness; note any halo.
3. Enter AR, scan a surface, tap to place: the greeting appears upright and starts with sound.
4. Bottom offset and Video height (Adjust appearance before entering AR): the bottom edge sits on or above the surface by the set amount; the size looks right.
5. Walk sideways: position and facing stay fixed (it does not turn to follow you).
6. Play/Pause/Replay in AR.
7. Turn Loop on once and confirm it repeats; off and confirm it ends.
8. Reset placement (playback stops, place again), Exit AR (pauses, preview returns), Enter AR again.
9. Background Chrome and return: no duplicate audio, no stale or black canvas; playback paused.
10. Reopen Neon Garden and Cosmic Vortex (production links) and confirm they still work.

## Device evidence log
| Date | Device / OS / browser | Feature and test | Result | Reporter / evidence |
| --- | --- | --- | --- | --- |
| Historical hackathon | S24 Ultra / versions unrecorded / Chrome | Neon Garden placement, walk-around, mic and Reset | User reported working | Juan; supplied conversation |
| Planning 2026-10-29 | No device | No new physical tests | Not tested | Planning session |
| G1 2026-10-30 | Headless Chrome 137 (cloud VM), no WebXR | G1 playback, keying, local-file lifecycle, regressions | 30/30 simulated pass; not device evidence | Devin, PR #8 |

Add video decode/format, audio start/middle/end, keying/matte edges, Reset/Exit/re-entry, QR signed-out launch and iPhone fallback rows as they are actually tested. Never carry historical particle success forward as proof that video works.

## Environment inventory — fill when configured
| Resource | Identifier / nonsecret setup reference | Environment | Status |
| --- | --- | --- | --- |
| Vercel project | `jc-fractal-studios/web-ar`; posts per-branch previews on PRs | Existing demo + PR previews | Preview for PR #8 ready; protected by Vercel login |
| Auth / DB | Not provisioned | Planned isolated dev/preview | — |
| Object storage | Not provisioned | Planned private uploads/outputs | — |
| Processing API/worker | Not selected | Planned experiment | — |
| Job recovery trigger | Not selected | G4 | — |
| Production public base URL | Existing demo default in src/site.ts | Existing site | Reconfirm before publishing |

Put secrets only in the appropriate local/deployment secret store. Handoff may list variable names and where to configure them.

## Switching from Devin to ChatGPT/Codex (or back)
1. Stop the outgoing agent after it records this file and commits/pushes the active branch, including in-progress work where appropriate. Preserve uncommitted work rather than discarding it.
2. Record branch, exact commit, PR, deployment linkage, tests, open issues and the next bounded task.
3. The incoming coding environment opens the same repo/branch, reads AGENTS.md and docs/greetings/00_START_HERE.md through 04_HANDOFF.md, and compares the actual working tree with this record.
4. Resolve any stale documentation against code and evidence. Do not restart from the old hackathon branch or repeat completed work blindly.
5. Confirm the new environment has the required credentials; they do not transfer automatically just because Git history does.
6. Continue one assigned milestone, preserving existing links. Both agents must not write the same branch simultaneously.

### Copyable continuation prompt
Continue AR Greetings in https://github.com/JcFractal/WebAR. Read repository instructions and docs/greetings/00_START_HERE.md through 04_HANDOFF.md. Reconcile the recorded branch/commit and open PR with current GitHub state. Continue the documented next task on that branch or a suitable new branch; do not repeat completed milestones or modify unrelated projects. Preserve the old particle experiences. Report real checks separately from simulated tests, update the handoff, and produce a focused PR.

## Known limitations at planning
Video is a flat plane, not a volumetric person. Tracking is session-local. iPhone ground placement is unproven. Matting quality, target-device alpha transport, processing price/runtime and sound preservation are unmeasured. Ordinary videos will initially have explicit codec/size/duration limits. Unlisted public links can be forwarded. No dashboard drawing or previous discussion constitutes implemented backend functionality.

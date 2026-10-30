# AR Greetings — living handoff
Last updated: October 30, 2026 (G1 AR invisibility no longer reproduces on the S24; remaining acceptance checks, Devin)
Update this file in every implementation PR and before pausing or switching tools.

## Current status
- Stage: G1 in review on PR #8. The AR invisibility from the first S24 tests **no longer reproduces**: on the real greeting page both the synthetic clip (with and without `&diag`) and Juan's local MP4 are visible and play with sound after placement. **The cause is unknown**; no change is a proven fix (see the investigation section). The remaining G1 acceptance checks below are not yet done. G2 not started and paused (do not start until G1 passes and Juan assigns G2).
- Active agent: Devin (G1). Stopped before G2.
- Current authorized next assignment: finish the remaining G1 acceptance checks on the S24, one at a time, fixing G1 problems on PR #8. No more isolation tests. Automatic background removal and G2 stay paused; PR #8 stays unmerged until the G1 review is done.
- Repository: https://github.com/JcFractal/WebAR
- Observed baseline main: accf90a1b6b968001edfbfb8e71314b994bacdd7.
- Greeting branch / commit / PR: `devin/g1-video-placement`; G1 code commit a1fd865ea68f7e449f6c0a7265a42f760f6514b5 plus a later handoff-only commit (check the branch tip); PR https://github.com/JcFractal/WebAR/pull/8 (open, not merged).
- Greeting preview deployment / deployed commit: Vercel branch preview https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app/?exp=greeting-test (Vercel check passed for a1fd865; unauthenticated requests get a 302 to Vercel login, so open it signed in to Vercel). Production is unchanged.
- Existing production URL: https://web-ar-gold.vercel.app/ — historical project address; not rechecked live during planning.
- Backend project, schema and storage: not configured.
- Processing provider and media format: undecided; G2 owns the decision.
- Credentials: none supplied or created in this planning task.
- Personal test clips: none supplied. The repo contains only a generated synthetic fixture (`public/media/synthetic-greeting.mp4`, made by `scripts/make-synthetic-fixture.py`).
- Current blocker: none known. Open risk: the invisibility cause was never identified, so it could return; if it does, the probe (`&probe&step=…`) and `&diag` readout remain as references. The preview requires Vercel sign-in.
- Next concrete action: checks 1–6 passed; Juan runs remaining acceptance check 7 (see "Remaining G1 acceptance checks"); Devin guides one check at a time and records each result.

## Milestone tracking
| Milestone | Code/status | Browser checks | Phone checks | PR / commit |
| --- | --- | --- | --- | --- |
| G1 video placement | In review; AR invisibility no longer reproduces (cause unknown); diagnostics and probe kept behind URL flags | typecheck/build/`npm test` 12/12; headless CDP smoke 68/68 (no WebXR) | First tests failed (no video in AR). Later on 2026-10-30: synthetic clip and local MP4 visible with sound in AR on the real page. Remaining acceptance checks pending | PR #8 |
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
- Browser/simulated tests actually run: a headless Chrome 137 CDP script against `npm run preview` (412×915 mobile emulation, SwiftShader WebGL, no WebXR); 30/30 pass at a1fd865. After the S24 failure the script grew to 39/39 (adds `&diag` readout, Plane material cycle, Opaque defaults for the fixture and local files, loop still running); all pass.
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
- Exact next assignment: superseded by the S24 failure section below (focused diagnostic retest, then the full checklist). G2 starts only when Juan assigns it.

### Remaining G1 acceptance checks (real greeting page, S24, after the invisibility stopped reproducing)
Already seen on the real page: synthetic clip and local MP4 visible and playing with sound after placement. Pause, Sound off, walk-around, Reset and Exit/re-enter were confirmed only on the probe (`step=hud`), so they are repeated here.
1. Placement and walk-around: upright, bottom edge on the surface, stays fixed (does not turn to follow you).
2. Play/Pause, Replay and Sound on/off in AR.
3. Reset placement (stops, place again); Exit AR (pauses, preview returns); Enter AR and place again.
4. Adjust appearance before AR: Video height and Bottom above surface match what you set.
5. Loop on (repeats) and off (ends).
6. Background Chrome and return: paused, no doubled audio, no black or frozen view.
7. Optional chroma keying: synthetic clip with Background = Chroma key in AR; green removed, note halo.
8. Particle regression on production: Neon Garden and Cosmic Vortex in AR. Also record the ARCore version.

### Original G1 S24 checklist (Chrome, preview URL above)
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

## G1 S24 failure and AR rendering investigation (2026-10-30)
Observed by Juan on the S24 (Chrome): his own ordinary MP4 (original background, no green screen) displays and plays with sound in the normal preview. Enter AR opens the camera; after scanning and tapping, the UI says "Placed" and playback/audio run, but no video is visible.

Follow-up from Juan: the included synthetic test clip fails the same way. Both clips play in the ordinary preview, and in AR both report "Placed" with audio but show no video. The failure is therefore in the shared AR rendering path, not in his file's codec, content or green-screen settings, and the investigation focuses there. Further code changes wait for the diagnostic results below (no more speculative fixes).

Not reproducible here: the VM has no WebXR device, so headless checks can neither reproduce nor confirm a fix.

**Outcome (2026-10-30):** the failure stopped reproducing on the real page (see the device log). The exact cause remains unknown. The code changes below, the probe and the diagnostics coincided with it stopping, but none was shown to be the fix; do not describe any of them as one.

Code inspection of the AR rendering path:
- Keying: in Opaque mode the shader always writes alpha 1 and never discards, so Opaque alone cannot make the plane invisible. Both clips ran with Chroma (the fixture config defaulted to it and a chosen local file kept it), but Chroma on the synthetic clip removes only the green and would still leave the figure visible, so keying does not explain an entirely invisible plane. The fixture and chosen local files now start in Opaque only to remove that variable.
- Renderer: the video template created its WebGL context with `antialias: true`; the swarm template, whose AR is verified on the S24, uses `antialias: false`. It now matches the swarm (the XR layer inherits this setting).
- Texture updates: three r185 `VideoTexture` uploads new frames only from `requestVideoFrameCallback`, which is tied to window rendering and may not fire during an immersive session. That would freeze the picture rather than hide it, but the render loop now flags `needsUpdate` whenever `currentTime` advances.
- Loop failure: three requests the next XR frame only after the animation callback returns, so any exception in the callback (for example on the first frame the plane is drawn) would stop all later XR rendering while audio continues. The callback now catches errors, keeps the loop alive and reports them.
- Transforms/frustum/first frame: placement uses the unchanged `ArPlacement`. The plane is a child of the anchor at y = offset + height/2, 0.68 × 1.2 m by default, double-sided, frustum-culled by its bounding sphere. It is hidden until `frameReady` (`loadeddata`), which was already true from the preview.

Temporary diagnostics (only with `&diag` in the URL; remove or keep behind the flag once G1 passes):
- Magenta outline around the plane rectangle and a cyan cube at the anchor origin. Both are children of the same anchor, drawn without depth test and independent of the video texture, shader and first-frame gate.
- "Plane:" button cycling the plane material: keying shader → plain video material (`MeshBasicMaterial`, bypasses the custom shader) → solid magenta (no video, shown even without a frame).
- On-screen readout (4×/s): XR on/off, AR state, blend mode, XR layer type; frame and XR-frame counters, caught render errors, last WebGL error; anchor visibility/position; camera position and distance; plane visibility, size, position and in-view test; video readyState, size, time and paused state; texture version, frameReady and clip state; keying mode and plane material; last error text.

How to read the result: outline/cube visible but no video → texture or shader problem (then check whether "plain video material" shows it). Nothing visible and the xrFrames counter stops → the render loop is dying (error line names it). Nothing visible with counters running → placement/transform/frustum (check distance, positions, inView). If the plane now shows normally, the antialias/texture changes fixed it.

### Focused S24 retest (diagnostic)
Open https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app/?exp=greeting-test&diag (signed in to Vercel).
1. Choose your local MP4 (keying should switch to Opaque), Play once, then Enter AR, scan and tap to place. Take a screenshot showing the readout and the scene.
2. Is the video visible? Is the magenta outline / cyan cube visible? Wait 2 s and screenshot again (do the frame counters advance?).
3. Tap "Plane:" once (plain video material) and screenshot, then once more (solid magenta) and screenshot.
4. If the video is visible: run checklist items 3–9 below, then 2 (Chroma with the test clip) and 10.

### S24 diagnostic result and controlled isolation (2026-10-30, second round)
Confirmed phone environment (Juan): Samsung SM-S928U (S24 Ultra), Android 17, build CP2A.260605.016, Chrome 156.0.8078.73. ARCore / Google Play Services for AR version: not yet recorded.

Confirmed on the phone with `&diag` (Juan, screenshot): layer `XRProjectionLayer`; XR frame counter advancing; `renderErr 0`; `gl 0x0`; plane `vis=true` and `inView=true`; `frameReady=true`; keying `opaque`. Video still not visible. So the render loop is alive, throws nothing, and the plane is placed in front of the camera; the earlier "loop dying" and "placement/frustum" branches are not supported by this evidence.

Hypotheses (unconfirmed, each tested separately below):
- H1: no WebGL scene content at all reaches the AR view on this phone/Chrome (not specific to video). Tested by the probe page: reticle plus one untextured cube, no `<video>`, no texture, no custom shader, no microphone.
- H2: the DOM overlay root contains the WebGL canvas (the whole `.player` is the root), and that interacts badly with the XR compositor. Tested with `overlay=hud`: a HUD-only child element is the overlay root and the canvas sits outside it.
- H3: the CSS rule `html.ar-active .stage { visibility: hidden }` affects the XR output. Tested with `stage=visible`, which keeps the canvas visible during AR. Default behaviour is unchanged; this is neither assumed harmless nor assumed to be the cause.
- H4: the `XRProjectionLayer` path that three r185 selects is the problem. Tested with `layer=legacy`: `XRWebGLBinding` is hidden only while that page's renderer is constructed (restored immediately; no prototype changes), so three uses `XRWebGLLayer`. The readout reports the layer actually selected (`renderer.xr.getBaseLayer()` constructor plus `session.renderState` layers/baseLayer).
- Related evidence only, not a diagnosis: three.js issue #33404 (camera-access crashes, Chrome 147/148 regression, fixes reported in 149). The app does not request the `layers` feature; three can still select a projection layer, so H4 is tested directly.

Implementation (temporary, opt-in; normal URLs unchanged): `src/xr/probe.ts` (probe page, `&probe`), `src/xr/options.ts` (the three flags), routing in `src/main.ts`, two CSS rules in `src/style.css`. The video page also accepts the same three flags so a variant that fixes the probe can be confirmed on video. Swarm/particle code untouched. Readout adds flags, layer actually used, renderState, blend mode, DOM overlay type, enabled features, whether the canvas is inside the overlay root and its computed visibility.

### S24 isolation test (one variable per page)
All on https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app (signed in to Vercel). For each: Enter AR, scan, tap to place, one screenshot showing readout and room. Note: is the reticle visible while scanning? Is the cube visible after tapping?
1. Baseline probe: `/?exp=greeting-test&probe`
2. Overlay root HUD-only, canvas outside: `/?exp=greeting-test&probe&overlay=hud`
3. Canvas not hidden by CSS: `/?exp=greeting-test&probe&stage=visible`
4. Legacy layer: `/?exp=greeting-test&probe&layer=legacy` (readout should say `layer XRWebGLLayer`)
5. Particle recheck, same phone/browser: https://web-ar-gold.vercel.app/?exp=neon-garden , Enter AR, place, are particles visible? (Cosmic Vortex too if practical.)
If a probe variant shows the cube where 1 does not, open the video page with the same flag, e.g. `/?exp=greeting-test&diag&layer=legacy`.

### Baseline probe PASSED on the S24; probe ladder (2026-10-30, third round)
Confirmed (Juan, screenshot): `?exp=greeting-test&probe`, flags none, `XRProjectionLayer` (renderState layers=1, baseLayer=no), blend alpha-blend, domOverlay screen, features local,viewer,hit-test,dom-overlay, canvas `inOverlayRoot=true visibility=hidden`, renderErr 0, gl 0x0. The reticle appeared, the cube was placed and visibly rendered, and he walked around it. So basic XR geometry renders with the existing layer, DOM overlay root and `.stage` CSS. H1–H4 are not the cause for plain geometry; the overlay/stage/legacy-layer variants were not needed and stay unused. The cause is in a difference introduced by the video template.

The ladder keeps the passing probe's XR setup constant (same renderer settings, overlay root, layer, ArPlacement, CSS) and adds one change per step (`&probe&step=<name>`):
1. `cube`: passed.
2. `plane`: untextured magenta upright plane (MeshBasicMaterial, double-sided) at the video plane's size and position (0.675 × 1.2 m, bottom edge on the surface).
3. `video-element`: as step 2, plus a playing `<video>` of the synthetic clip created by the same `VideoClip` code as the video page (1 px, opacity 0, inside the overlay root; starts with sound on placement). The plane stays magenta and does not use the video.
4. `video-texture`: as step 3, but the plane shows the video through a plain MeshBasicMaterial (VideoTexture, `needsUpdate` set from the loop as on the video page).
5. `video-shader`: as step 4, but with the video page's keying ShaderMaterial in Opaque mode.
The first step that fails is the cause, or at least points to it. If all five pass, the remaining differences are video-page-only (the hidden-until-first-frame gate, GridHelper floor, diagnostic markers, tune panel and HUD), and they get the same treatment.

### S24 probe ladder test
Open each link on https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app (signed in to Vercel), then Enter AR, scan, tap to place, and take one screenshot with the readout. Stop at the first step where the object is not visible.
- `/?exp=greeting-test&probe&step=plane`
- `/?exp=greeting-test&probe&step=video-element` (sound should play)
- `/?exp=greeting-test&probe&step=video-texture`
- `/?exp=greeting-test&probe&step=video-shader`
Still to do: the Neon Garden particle recheck on the same phone/browser, and the ARCore version.

### Probe ladder PASSED on the S24 (2026-10-30, fourth round)
Confirmed (Juan, four screenshots), each with the default XR setup:
2. `step=plane`: magenta upright plane visible.
3. `step=video-element`: magenta plane visible, hidden video playing, sound audible.
4. `step=video-texture`: video visible through the plain material.
5. `step=video-shader`: video visible through the app's keying shader in Opaque mode; readout `step=video-shader (5/5)`, renderErr 0, gl 0x0, state=playing.
So the `<video>` element, VideoTexture updates and the custom shader each render in AR on this phone. The failure comes from something only the full video page (`src/video/mount.ts`) does.

### Full-page difference ladder (steps 6–10)
Result: `step=hud` (all of steps 6–10) **passed** on the S24 (see the device log), so none of these differences alone or together reproduces the failure. Steps 7–9 were not run separately because 10 includes them.
Control: `step=video-shader` (passed). Each step adds one difference copied from `mountVideo`, cumulatively:
6. `placeholder`: material created with an empty `THREE.Texture` placeholder, clip texture swapped into the uniform afterwards (as `setClip`).
7. `visibility`: plane starts hidden; `plane.visible = frameReady && state !== 'error'` every frame (video page rule).
8. `floor`: the `GridHelper` floor in the scene, hidden while AR is active.
9. `layout`: the video page's `layout()` (pixel ratio, size and preview-camera framing on clip change, resize and AR exit) and "searching pauses and rewinds".
10. `hud`: the full video HUD (transport, Choose MP4, Adjust appearance, Fullscreen, tune panel) and its `beforexrselect` rule on the container, replacing the probe buttons. Local file choice is not wired in the probe.
Not covered by the ladder: diagnostic markers (only with `&diag`; the failure predates them) and the local-file flow (the synthetic clip fails the same way).

Test order, one S24 test per round (bisection over the cumulative steps):
- First: `step=hud`. If it **passes**, the ladder does not reproduce the failure; the cause is outside it (for example element order in `mountVideo`, user actions like Fullscreen, or something not yet copied), and the next test compares the real page against `step=hud`. If it **fails**, test `step=visibility`; then `placeholder` or `layout`/`floor` to pin the first failing step.

### Real page vs passing probe (`step=hud`)
Static comparison of `src/video/mount.ts` against `src/xr/probe.ts` at `step=hud`. Same in both: renderer and XR setup, overlay root, `ArPlacement`, `VideoClip`, placeholder swap, keying shader (Opaque), first-frame visibility rule, GridHelper floor, `layout()`, the full HUD and `beforexrselect` rule, the loop's texture update and try/catch.
Remaining differences:
- Only with `&diag` (the only way the current page was run on the S24, because the retest link had `&diag`): the visible `PlacementMarkers` (magenta outline + cyan cube, `transparent`, `depthTest: false`, `renderOrder` 10, children of the same anchor), the readout inside the video HUD, and the Plane chip.
- Always: the markers exist in the anchor but are hidden; `loop` is false from the config (the probe loops); keying uniforms come from the config (also Opaque, same values); two unused diagnostic materials; `isArSupported()` gates Enter AR; a `visibilitychange` pause; note/source HUD text; the `<video>` is appended after the HUD instead of before.
No difference is a confirmed cause, so no fix was made. The first failure (before the `9e14bfb` changes: antialias, Opaque defaults, texture update from the loop, loop try/catch) and the `&diag` failure are different code; as far as recorded, the current page without `&diag` is untested on the phone.
Planned next test (done, see the device log: it passed, and so did `&diag` and the local MP4): real page, no `&diag`, synthetic clip. If it shows, the next test is the same page with `&diag` (to see whether diagnostics hide it), then the local MP4. If it fails, the always-present differences above go into the probe one at a time.

## Device evidence log
| Date | Device / OS / browser | Feature and test | Result | Reporter / evidence |
| --- | --- | --- | --- | --- |
| Historical hackathon | S24 Ultra / versions unrecorded / Chrome | Neon Garden placement, walk-around, mic and Reset | User reported working | Juan; supplied conversation |
| Planning 2026-10-29 | No device | No new physical tests | Not tested | Planning session |
| G1 2026-10-30 | Headless Chrome 137 (cloud VM), no WebXR | G1 playback, keying, local-file lifecycle, regressions | 30/30 simulated pass; not device evidence | Devin, PR #8 |
| G1 2026-10-30 | S24 Ultra / Chrome (versions unrecorded) | Juan's own ordinary MP4 (no green screen), preview then AR | Normal preview: displays and plays with sound. AR: camera opens, scan + tap shows "Placed", playback/audio runs, **no video visible**. FAIL | Juan; two screenshots |
| G1 2026-10-30 | S24 Ultra / Chrome | Included synthetic test clip, preview then AR | Normal preview plays. AR: "Placed" and audio, **no video visible** (same as his MP4). FAIL | Juan (report) |
| G1 2026-10-30 | Headless Chrome 137, no WebXR | `&diag` readout, Plane material cycle, Opaque defaults, loop kept alive | 39/39 simulated pass; does not reproduce or resolve the phone failure | Devin, PR #8 |
| G1 2026-10-30 | S24 Ultra SM-S928U / Android 17 (CP2A.260605.016) / Chrome 156.0.8078.73; ARCore unrecorded | Video page `&diag`, Opaque | Readout: XRProjectionLayer, XR frames advancing, renderErr 0, gl 0, plane visible and in view, frameReady true. **Video still not visible.** FAIL | Juan; screenshot |
| G1 2026-10-30 | Headless Chrome 137, no WebXR | Probe page and `layer`/`overlay`/`stage` flags (preview path only) | 48/48 simulated pass; cannot test XR output | Devin, PR #8 |
| G1 2026-10-30 | S24 Ultra SM-S928U / Android 17 / Chrome 156.0.8078.73 | Baseline `&probe` (reticle + untextured cube), default flags, XRProjectionLayer, canvas in overlay root and CSS-hidden | Reticle shown, cube placed and **visibly rendered**, walk-around OK. PASS | Juan; screenshot |
| G1 2026-10-30 | Headless Chrome 137, no WebXR | Probe ladder steps plane / video-element / video-texture / video-shader (preview path only) | 57/57 simulated pass; cannot test XR output | Devin, PR #8 |
| G1 2026-10-30 | S24 Ultra SM-S928U / Android 17 / Chrome 156.0.8078.73 | Probe ladder steps 2–5: plane, video-element, video-texture, video-shader (Opaque) | All four visible; video-element and later audible; renderErr 0, gl 0x0. PASS | Juan; four screenshots |
| G1 2026-10-30 | Headless Chrome 137, no WebXR | Probe steps 6–10 placeholder / visibility / floor / layout / hud (preview path only) | 68/68 simulated pass; cannot test XR output | Devin, PR #8 |
| G1 2026-10-30 | S24 Ultra SM-S928U / Android 17 / Chrome 156.0.8078.73 | Probe `step=hud` (10/10: all five video-page differences plus the full video HUD), synthetic clip | Video visible with sound; Pause, Sound off, walk-around, Reset + re-place, Exit AR + re-enter + re-place all work; renderErr 0, gl 0x0. PASS (probe only; not the real greeting page) | Juan; screenshot |
| G1 2026-10-30 | S24 Ultra SM-S928U / Android 17 / Chrome 156.0.8078.73 | Real greeting page, synthetic clip, without and with `&diag` | Visible and playing after placement in both; `&diag` readout renderErr 0, gl 0x0, plane inView. PASS. Invisibility no longer reproduces; cause unknown | Juan; screenshot |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Real greeting page (no `&diag`), Juan's local MP4 | Visible and playing with sound after placement. PASS | Juan; screenshot |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 1, real page (no `&diag`), synthetic clip: placement and walk-around | Upright, bottom edge at the placement surface, position and facing stable while walking around. PASS | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 2, real page (no `&diag`), synthetic clip: Play/Pause, Sound on/off, Replay, end of clip in AR | PASS | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 3, real page (no `&diag`), synthetic clip: Reset placement, Exit AR, Enter AR and place again | PASS | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 4, real page (no `&diag`), synthetic clip: Video height ≈0.6 m and Bottom above surface ≈0.3 m set before AR | Size and bottom-edge gap matched the settings. PASS | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 5, real page (no `&diag`), synthetic clip: Loop on (repeats) and off (ends with "Finished") in AR | PASS | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 6, real page (no `&diag`), synthetic clip: background Chrome and return, preview and AR | Backgrounding ends the AR session and returns to the paused normal preview; re-entering AR restores video and sound. PASS | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Remaining G1 acceptance checks 7–8; ARCore version | Pending | Juan |

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

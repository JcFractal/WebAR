# Devin Build Prompts and Phone Test Runbook

**For:** Juan Carlos Gallo  
**Event:** Converge, Thursday October 15 2026  
**All times:** Miami local time, Eastern  
**Read with:** `SPEC.md`

## How to use these documents

Put both Markdown files at the root of the fresh web repository. `SPEC.md` is the authoritative product brief; this runbook is your sequence of instructions and checks. Older planning documents must not add scope or override these files.

Complete account, cable, and projection preparation using your separate event preparation guide. These documents do not create a repository or deploy anything by themselves.

1. Start with Prompt 1 below. Each fenced prompt is meant to be copied into Devin.
2. Let Devin read the entire specification, but implement only the assigned milestone.
3. Read its short approach. Redirect a material scope mistake immediately; do not add a separate approval round for routine implementation decisions.
4. When it reports completion, check its build and deployment results, then run your phone checks.
5. Fix failures in the same session. Send the next numbered prompt only when the current result passes, or explicitly record a deliberate cut.
6. Continue in the same Devin session while productive. If you need a new one, provide the repository, branch, latest commit, completed milestones, and unresolved phone failures.

Do not have two assistants edit the same files concurrently. Use GitHub as the shared source of truth. If ChatGPT supplies a patch, have Devin review and apply that patch against the current branch, then rebuild. Ask a Cognition engineer for help if access, permissions, or an AR issue stalls progress.

## Time budget and priority

These are planning budgets, not promises of agent speed. Count your device checks inside each block.

| Milestone | Suggested window | Exit result |
|---|---|---|
| 1 | 4:30–4:55 PM | Public player URL and config loader |
| 2 | 4:55–5:40 PM | Beautiful swarm with manual formations |
| 3 | 5:40–6:15 PM | Sound controls the swarm |
| 4 | 6:15–6:50 PM | S24 tap-to-place AR |
| 5 | 6:50–7:15 PM | Two configurations and QR gallery |
| 6 | 7:15–7:45 PM | Reliability fixes and complete demo flow |
| Buffer | 7:45–8:15 PM | Venue projection checks and essential fixes |
| Rehearsal | 8:15–8:30 PM | Feature freeze and two rehearsals |

The published event schedule lists 8:30 PM as a final push and 9 PM demos. Aim to be ready before then. Event details: [official listing](https://luma.com/6wrq2pmv).

If one problem consumes roughly 15 minutes without progress, ask for a diagnosis and choose a smaller implementation or get help. Preserve the voice interaction, second configuration, QRs, and rehearsal. The camera-overlay fallback is expendable. Fullscreen voice sculpture remains the fallback if immersive AR fails. Record any cut rather than calling it completed.

## Prompt 1 Working player and deployment

```text
Read SPEC.md and DEVIN_RUNBOOK.md in this repository. SPEC.md is authoritative and supersedes the three older WebAR planning files. Implement milestone 1 only.

First give a short approach, flag any blocking missing access, then proceed with routine implementation. Use Vite, vanilla TypeScript, and Three.js. Create the shared player that reads ?exp=<id>, validates the ID, fetches the matching static JSON, and displays its title with a simple Three.js placeholder. Create a minimal neon-garden config now. Missing or invalid experiences must show a useful error and a gallery/back link, not silently load another experience. With no exp, show a simple entry page that can later become the gallery.

Add the dependency lockfile and working dev/build scripts. Add a concise README with local commands and Vercel build settings. No swarm, microphone, camera, AR, auth, database, or editor yet.

Run the build and check the ordinary browser flow, including an unknown ID. Push the work to the agreed branch. Use the existing authorized Vercel connection if available; otherwise report the exact account action Juan must take to import and deploy it. Do not ask for passwords or fabricate a live URL.

Report changed files, build/browser check results, commit and branch, verified URL if available, and remaining blockers. Stop after milestone 1. A deployment you could not verify remains pending.
```

### Juan checks

- [ ] Import the repository in Vercel if needed. Verify the selected account/team and production branch.
- [ ] Open the actual HTTPS production URL on the S24 using mobile data. Confirm the title and placeholder appear.
- [ ] Open the same URL signed out or in Incognito. No Vercel login should be required.
- [ ] Change `exp` to an unknown ID. Confirm a readable error and a working way back.

**Pass:** the public phone URL works and the configuration loader behaves correctly. Do not start swarm polish while deployment remains inaccessible.

## Prompt 2 Swarm and manual formations

```text
Continue from the current repository state. Implement milestone 2 only, following SPEC.md. Preserve the working player and deployment.

Replace the placeholder with one shared swarm module using THREE.Points and a lightweight update path. Start near 3,000 configurable particles. Build smooth drift, a gradual gather blend, and a burst impulse with recovery. Implement procedural flower and ring formations plus garden/vortex movement presets within the same engine. Keep them selectable through configuration or developer controls; the final second experience is milestone 5.

Make Neon Garden look compelling in fullscreen browser mode without any camera or audio requirement. Use soft luminous particles and bounded additive effects. Avoid expensive bloom infrastructure, all-pairs boids, or thousands of meshes. Handle canvas resize and reuse buffers. Expose the few tuning values identified in SPEC.md.

Add clearly labeled Manual controls for Drift, Gather, and Burst, using the same normalized controls the microphone will later drive. Include a lightweight optional frame-rate display. Do not implement the microphone or WebXR yet.

Run the build, check resizing and manual transitions in your browser, and verify there is no unbounded burst or duplicate animation loop. Update the existing deployment through the agreed branch and report checks actually performed, changed files, commit, URL, and the phone test handoff. Stop after milestone 2.
```

### Juan checks

- [ ] Let it run on the S24 for about a minute. Look for smooth motion and an attractive default appearance.
- [ ] Tap Gather. A recognizable flower should gradually form without a hard jump.
- [ ] Tap Burst, then let it recover. Repeat several times. No disappearing or permanently scattered sculpture.
- [ ] Rotate the phone and inspect both formations through the supplied controls. Check the optional frame rate, aiming for about 30 FPS or better.
- [ ] Mirror the fullscreen view to the laptop. Confirm the particles are visible and large enough for the room.

**Pass:** a visually convincing sculpture exists even before sound or AR. If performance struggles, reduce particle count or resolution before adding complexity.

## Prompt 3 Voice interaction

```text
Implement milestone 3 only. Keep the manual controls and shared swarm from milestone 2.

Add user-initiated microphone input and Web Audio analysis per SPEC.md. Request audio without video, resume AudioContext from a user action, and do not send microphone sound to speakers. No recording, uploads, speech recognition, pitch detector, backend, or AI service.

Derive smoothed energy, a sustained-sound steadiness heuristic, and a sharp-onset burst trigger. Add ambient calibration, a practical sensitivity adjustment, hold timing, quiet settling, threshold hysteresis, and burst cooldown. Start simple; frequency-band embellishments are secondary. Both quiet settling and steady-sound gathering should reach the configured formation gradually. Short pauses in speech should not instantly form it.

Provide explicit Live and Manual modes. In Live mode audio drives the existing swarm controls. Manual mode must be labeled and use the same control path. Add a compact optional diagnostic panel showing mic status, energy, noise floor, gather, and frame rate. Explain briefly that any sufficiently steady sound may gather the particles; do not claim to recognize Om.

Handle microphone refusal, missing input, retry, and repeated starts without duplicate streams. The sculpture must remain usable in Manual mode if permission is denied. Run the build and check UI/error paths. If you test with synthetic audio, label it as simulated and do not claim S24 microphone success. Deploy the update, report results, and stop after milestone 3.
```

### Juan checks

- [ ] Tap Enable Sound and grant permissions. Calibrate while quiet. The meter should respond to your phone's microphone.
- [ ] Talk in short phrases. Check that syllables stir the swarm rather than cause constant full bursts.
- [ ] Hold an "Ommm" or another vowel for several seconds. A formation should gradually gather. Repeat at different volumes and tune sensitivity.
- [ ] Clap once, then remain quiet. Check one burst with controlled recovery, followed by a calm settle.
- [ ] Test refusal in a fresh permission context, then retry using site permissions if necessary. Manual mode should still work. Stop and restart sound twice.

**Pass:** the actual S24 microphone controls the sculpture. A steady-room-noise false positive may need calibration; this is a sound heuristic, not speech understanding.

## Prompt 4 Android AR placement

```text
Implement milestone 4 only. Preserve the working fullscreen voice sculpture.

Add feature-detected WebXR immersive-ar on supported browsers, with required hit-test, reticle, and one tap-to-place swarm. Keep the selected transform fixed after placement rather than following subsequent hit tests. Use the configured diameter and height above the surface. Provide an obvious reset path and preserve sound while entering/exiting AR in the same experience.

Use a separate explicit Enter AR tap after microphone setup so requestSession retains valid user activation. Let WebXR own the camera; do not open a simultaneous getUserMedia video stream. Use the installed Three.js version's current XR helpers and one renderer animation loop. Request DOM overlay only as optional and handle its absence; a UI tap must not accidentally place a swarm. If an in-AR reset control is unavailable, exit/re-enter is acceptable and should be explained.

Handle unsupported XR and session failures with a working fullscreen option. If time permits, add a rear-camera overlay as a floating, untracked mode. Timebox that additional fallback to about ten minutes and omit it if it threatens placement or reliability. Stop overlay video tracks before XR. Do not describe floating mode as spatial tracking.

Clean up sessions, hit-test sources, and mode-specific resources. Build and check fallback and error flows available in your environment. Do not claim physical tracking or projection verification. Deploy, report what Juan must test, and stop after milestone 4.
```

### Juan checks

- [ ] Enable sound first, then tap Enter AR. Move the camera over a well-lit, textured floor or table until a reticle appears.
- [ ] Tap to place. Walk a few steps and move sideways. The sculpture should stay at the chosen surface location.
- [ ] Speak and hum while in AR. Confirm the sound input survives the transition.
- [ ] Reset placement, exit, and re-enter twice. Check for camera failures, duplicates, and a lost microphone.
- [ ] Mirror the immersive view. Confirm the external screen shows both the real camera and particles. Check fullscreen fallback afterward.

**Pass:** physical placement and audio work together on the S24, and the projected view is usable. If projection or XR fails, choose and document the fallback before proceeding.

## Prompt 5 Two experiences and QR gallery

```text
Implement milestone 5 only. Reuse the current player, swarm engine, audio logic, and presentation modes.

Finalize neon-garden.json and cosmic-vortex.json using the schema in SPEC.md. Neon Garden needs soft drift and a flower formation; Cosmic Vortex needs stronger orbital/spiral movement and ring or galaxy formation. Make both movement and formation visibly different, not only palette. Keep all experience-specific choices in configuration or reusable presets, with no copied renderer or audio implementation.

Create a static manifest and gallery with one card, ordinary clickable link, and QR per experience. URLs must use the real public production origin/current origin or one documented base URL and preserve ?exp=<id>. Do not hardcode an invented hostname or temporary deployment-specific preview URL. Downloadable QR images are useful if quick. With no exp, show the gallery. Preserve errors for missing IDs/configs.

Ensure the gallery is readable on a phone and laptop and that loading the second experience releases the first experience's resources. A normal page navigation between experiences is acceptable; do not add a complex router just for this.

Build, verify both config loads, inspect console/network errors, and check that QR payloads equal their corresponding links. Deploy, report the two actual links, commit, and checks. Stop after milestone 5.
```

### Juan checks

- [ ] Display the gallery on the laptop and scan each QR with the phone. Confirm the correct name, motion, formation, and palette.
- [ ] Check both links while signed out. They must use the stable public production domain.
- [ ] Test speech, gathering, and a burst in each experience. Verify AR in each if using the AR demo route.
- [ ] Switch between experiences, use Back, and start again. No stuck camera or silent microphone.
- [ ] Save the QRs and direct links locally. If the domain changes, regenerate and recheck them.

**Pass:** two clearly different configurations run through the same engine and open from their own QRs.

## Prompt 6 Reliability and final demonstration

```text
Implement milestone 6 only. Do not add new features or refactor working architecture. First review Juan's latest phone findings in this conversation. Fix the failures that threaten the agreed demonstration.

Check the complete gallery-to-player flow, both configuration files, invalid ID handling, microphone retry/calibration, Live/Manual labeling, fullscreen fallback, and repeated starts/mode transitions. Handle resize and return from background without particle explosions or duplicate loops. Check that resources are released when appropriate and that no audio is routed to speakers or sent to a server.

Run the production build and relevant browser checks. Use focused automated checks only if they help resolve a real concern; do not build a test framework now. Inspect the production deployment where available. Report device-dependent items as awaiting Juan, not passed by simulation.

Update README with actual local/build commands, production links, configuration fields, how to publish another configuration, demo controls, known limitations, and any scope cuts. State whether camera overlay was included and whether AR projection has been verified by Juan. Keep the gallery and both experiences easy to reopen.

Commit the final reviewed state, report the tested commit and deployment, outstanding failures, and any reduced demo mode. Stop for Juan's rehearsal. Routine fixes to this milestone are allowed; do not expand scope.
```

### Juan final acceptance

- [ ] Run the full demo twice using the actual S24, intended input microphone, laptop, and venue display.
- [ ] Confirm noise calibration and sensitivity under venue conditions. Check the manual backup without presenting it as live sound.
- [ ] Confirm public QR access over mobile data and keep the direct links ready.
- [ ] Record a short backup clip after the real experience works. Confirm the recording includes the intended camera and particle view.
- [ ] Freeze features around 8:15 PM. Note the last working commit/deployment. If an essential fix follows, repeat the affected rehearsal.

## Ready to paste feedback and recovery prompts

Replace bracketed fields with observations. Do not paste placeholders as facts.

### A specific phone failure

```text
Stay on milestone [number]. On my S24 Ultra in Chrome at [URL], I did [steps]. Expected: [result]. Actual: [result]. Permissions showed [what happened]. The page/debug panel showed [message or values, if any]. [Manual control/fallback] still works or fails as follows: [observation].

Find the smallest fix. Preserve completed milestones. Report your likely cause and checks, deploy the correction, and stop for the same phone retest.
```

### Stop a stalled approach

```text
Stop the current approach and summarize the blocker, attempts, and simplest alternatives. We have about [minutes] left. Preserve the last working build. Recommend one smaller implementation or explicit scope cut that protects the voice sculpture, two QR experiences, and rehearsal. Do not add another library or rewrite the renderer without explaining why it is necessary.
```

### A new session handoff

```text
Continue this build from the repository's actual current state. Read SPEC.md, DEVIN_RUNBOOK.md, and README first. Repository: [URL]. Branch: [branch]. Last working commit: [hash]. Production URL: [URL]. Completed milestones: [numbers]. Current milestone: [number]. Verified on my S24: [observations]. Remaining issue or deliberate cuts: [details].

Check the branch and files before editing. Do not restart or reimplement completed milestones. Execute only the current task and report the build, deployment, and phone retest needed.
```

## The live demonstration

Aim for approximately 90 seconds, adapting to the time the organizers give you:

1. Show QR 1 and open Neon Garden. Explain that a link launches it without an app installation.
2. Place it if using the verified AR route. Otherwise use the rehearsed fullscreen route and name it accurately.
3. Ask for a little talking or a clap. Let the sculpture react.
4. Ask the room to hold a steady tone, then become quiet. Let the formation gather and settle. One nearby participant can supply the tone if crowd input is unclear.
5. Open QR 2 or its direct link. Show Cosmic Vortex briefly and explain that it is another configuration of the same player.

The microphone is on the demo phone. Each attendee who opens a QR gets an independent local experience; phones are not synchronized. The projected phone is the shared audience view. No multiplayer or shared room state is part of this MVP.

## Fill these in at the event

- Repository: ____________________
- Working branch: ____________________
- Production domain: ____________________
- Neon Garden URL: ____________________
- Cosmic Vortex URL: ____________________
- Last working commit: ____________________
- Projection route tested: ____________________
- Actual demo mode and deliberate cuts: ____________________

These prompts specify work to perform. No implementation, deployment, or phone test is claimed complete by this document.

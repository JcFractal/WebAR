# WebAR Voice Sculpture Build Specification

> **AR Greetings:** greeting development is governed by [`docs/greetings/02_MVP_SPEC.md`](docs/greetings/02_MVP_SPEC.md) and [`docs/greetings/03_BUILD_PLAN.md`](docs/greetings/03_BUILD_PLAN.md) (start at [`00_START_HERE.md`](docs/greetings/00_START_HERE.md)). This file remains the reference for preserving the existing particle experiences. Greetings use a separate `video` template; the config-only rule still applies to variations within an existing template.

**Owner:** Juan Carlos Gallo / JC Fractal  
**Event:** Converge, Miami, Thursday October 15 2026  
**Demo device:** Samsung Galaxy S24 Ultra, Chrome  
**Companion:** `DEVIN_RUNBOOK.md`

## Purpose and authority

Build a small WebAR player that loads different experiences from JSON configurations. For this event, publish two voice-reactive particle experiences, each with its own link and QR code. The live audience shapes a sculpture through sound. The second experience proves that the same player can deliver different content without duplicating its engine.

This is the authoritative event scope. It supersedes `webar_mvp_spec.md`, `webar_llm_brief.md`, and `devin_workflow.md` wherever they differ. Those files are historical context, not additional requirements. Use Vercel rather than the older Netlify suggestion. Execute only the milestone Juan assigns from the runbook.

Juan knows Unity, C#, AR Foundation, and native AR. Explain web-specific decisions and device limitations clearly without teaching AR basics. Juan owns visual direction, sound tuning, and physical device testing. Devin owns implementation, ordinary browser verification, and repository changes. Neither cloud-browser checks nor simulated microphone input establish that the phone works.

## Deliverable and scope

The full target is:

1. A shared player reading `?exp=<id>` and loading the matching JSON file.
2. One reusable `swarm` template with drift, gather, and burst behavior.
3. Two visibly different experiences: **Neon Garden** and **Cosmic Vortex**.
4. Microphone-driven interaction with calibration and manual test controls.
5. Android WebXR hit-test placement, verified on the S24.
6. A gallery with both QR codes and ordinary clickable links.
7. A public production HTTPS URL on Vercel, plus working fullscreen mode.

Keep this repository separate from Juan's native platform. Do not copy, inspect, or integrate its Unity scripts, architecture, private assets, or services. This is an independent web implementation. New original assets and procedural geometry are sufficient.

Not in this event: image recognition, painting animations, face tracking, geospatial placement, persistent or shared anchors, a client editor, uploads, authentication, database, payments, analytics, multiplayer, speech recognition, AI APIs, or a Unity build. A future image-tracking template can be added later, but do not implement it or build abstractions for it tonight.

## Experience design

| Property | Neon Garden | Cosmic Vortex |
|---|---|---|
| Default movement | Gentle floating paths around a center | Stronger spiral and orbital motion |
| Gathered formation | Layered flower or mandala with readable petals | Concentric rings or a shallow spiral galaxy |
| Palette | Mint, cyan, pink | Violet, electric blue, amber |
| Sudden sound | Petals scatter outward and recover | Rings expand into a radial shockwave and recover |
| Quiet ending | Slow, luminous bloom | Slow, composed rotating rings |

Use the same renderer and swarm module. Distinction must include trajectory and formation, not just color. Procedural presets selected by configuration are enough. These are artistic responses to sound, not a physical cymatics simulation.

### Sound behavior

| Input | Desired response |
|---|---|
| Soft speech | Small ripples and slight organization |
| Louder, varying speech | More motion and turbulence; does not complete the formation |
| Sustained tonal hum or held vowel | Formation coherence builds gradually; a softer hum holds an intermediate shape, a fuller hum completes it |
| Changes within a hum | Level and steadiness changes visibly move and loosen the formed sculpture; it stays alive |
| Steady broadband noise (fan, crowd hiss) | Little formation, because it is not tonal |
| Sharp onset such as a clap | A distinct burst with cooldown, then recovery; a lone clap does not change coherence |
| Silence | Brief breaths keep the shape; longer silence gradually relaxes it into a calm drifting cloud |

Accepted direction after phone testing (Milestone 3 revisions): control is continuous and expressive, not an on/off switch. Sound energy (motion) is separate from formation coherence. Do not gather automatically during silence, and do not map "any sound" to a fixed formation level.

The system does not recognize the word "Om," identify a speaker, or distinguish humming from every other steady sound. Humming, a held vowel, music, or steady background sound may produce similar responses. Tune this heuristic against the venue. Do not promise reliable chant detection.

### Proposed control model

Keep the controls understandable and expose tuning values:

- `energy`: smoothed sound level above the calibrated noise floor; drives immediate motion (brightness, size, ripples).
- `turbulence`: loudness × unsteadiness; drives churn without forming the shape.
- `gather`: formation coherence from 0 to 1, from steadiness × tonality × loudness (plus a small soft-speech contribution).
- `burst`: a short impulse that decays.
- Bass, mid, and treble band energies for secondary movement, when time permits.

Obtain RMS from time-domain analyser data. Use frequency-domain data for optional band energies. Estimate steadiness from recent envelope variation over time. Estimate a lightweight tonality from frequency-domain data (spectral flatness after removing the calibrated noise spectrum) so steady broadband noise is less likely to complete the formation. Gate both on meaningful input above the noise floor so silence is handled separately. No pitch detector or speech recognition is required.

Suggested starting behavior, subject to phone testing:

- Measure ambient sound for about two seconds on a user-initiated calibration action. Show progress and ask the user to stay quiet during calibration.
- Motion responds within about 100–200 ms. A full steady hum reaches a recognizable formation in about 1–2 seconds; coherence changes are smooth, and intermediate levels can be held.
- Variable speech stirs and adds turbulence; sharp rises can trigger a burst, with a cooldown so one clap does not trigger repeatedly.
- Let bursts recover over roughly one to two seconds.
- Silence keeps the shape through brief breaths (under about 0.7 s), then relaxes it gradually (about 3 s) into a drifting cloud.
- Clamp movement and brightness. Use smoothing and separate enter/exit thresholds to avoid rapid flickering between behaviors.

These timings are starting design values, not validated measurements. Expose sensitivity, calibration, tonal threshold, coherence build timing, quiet-relax timing, turbulence/ripple strength, and burst threshold/cooldown. If bass/treble mapping consumes time, retain the core energy, steadiness, and onset controls first.

### Manual controls and visible status

Provide **Live** and **Manual** modes. In Manual mode, Drift, Gather, and Burst act on the same controls used by the audio mapping. In Live mode, the microphone drives them. Clearly show the selected input mode. Manual controls must never masquerade as voice input.

Include a compact optional diagnostics panel with microphone status, energy, noise floor, gather amount, and frame rate. Include Calibrate, sensitivity adjustment, and mic retry. Keep implementation details out of the normal visitor view. Show only short instructions such as "Speak to stir the particles" and "Hold a steady hum to form the shape."

## Web implementation

Use **Vite + vanilla TypeScript + Three.js + Web Audio**. Use a small QR library. Pin compatible package versions with a lockfile; use Three.js helpers from the same installed version. Avoid adding React, a second rendering engine, or unnecessary infrastructure.

Suggested boundaries, not a rigid class hierarchy:

- Player/configuration loader and a minimal template registry.
- Shared swarm rendering and behavior.
- Audio analysis producing normalized controls.
- Presentation mode handling fullscreen, WebXR, and optional camera overlay.
- Gallery rendering and QR generation.

Start around 3,000 particles and make the count configurable up to approximately 6,000 for initial testing. Use one `THREE.Points` object, typed arrays, and a simple point shader or material. An O(n) update with procedural target positions is acceptable. Avoid all-pairs boids, GPU simulation infrastructure, per-particle meshes, and expensive postprocessing. Soft sprites and additive blending can provide an inexpensive luminous appearance.

Aim for at least roughly 30 FPS on the S24 during the projected demonstration; measure rather than promise. Reduce count or render resolution if needed. Cap regular canvas pixel ratio and avoid excessive point size and transparent overdraw. Reuse buffers, clamp frame delta after tab suspension, handle resize, and use one animation loop compatible with XR. Use `renderer.setAnimationLoop` for the shared Three.js rendering path.

## Configuration and loading

Use static files such as:

```text
public/manifest.json
public/experiences/neon-garden.json
public/experiences/cosmic-vortex.json
```

The player URL is `/?exp=neon-garden` or `/?exp=cosmic-vortex`. With no `exp`, show the gallery or an explicit link to it. Invalid IDs, missing JSON, or invalid settings must show a useful error and a gallery link. Never silently substitute another experience after a failed load. Validate IDs and essential fields; do not construct arbitrary paths from unchecked input.

Example configuration to guide the implementation:

```json
{
  "id": "neon-garden",
  "template": "swarm",
  "title": "Neon Garden",
  "settings": {
    "particleCount": 3000,
    "palette": ["#7CFC9A", "#4DD8FF", "#FF6AD5"],
    "motionPreset": "garden",
    "formation": "flower",
    "diameterMeters": 0.8,
    "heightAboveSurfaceMeters": 0.6,
    "audio": {
      "gain": 1.4,
      "calibrationSeconds": 2,
      "steadyHoldSeconds": 0.8,
      "gatherSeconds": 1.2,
      "quietSettleSeconds": 3,
      "burstCooldownSeconds": 1
    }
  },
  "brand": { "name": "JC Fractal", "accent": "#4DD8FF" }
}
```

Thresholds may be additional documented settings. Choose and document reasonable defaults. Configuration values are design starting points; Juan will tune them. Cosmic Vortex uses the same schema with `motionPreset: "vortex"`, `formation: "rings"`, and a different palette. Keep config names consistent across both files, the loader, UI, and README.

Generate gallery links and QRs from the actual current origin or a single documented public base URL. Preserve `exp` query parameters. Include a downloadable QR image if easy. A new deployment on the same production domain should not require reprinting the QRs.

## Permissions and presentation modes

### Explicit user actions

Load the landing UI without opening camera or microphone automatically. Provide Start, then a user action to enable sound and resume the AudioContext. Use a separate Enter AR action after sound setup. An immersive session must be requested from a valid user gesture; do not lose that gesture while awaiting unrelated microphone setup. Handle refusal and retry without a blank screen. [1, 2]

Request microphone with `audio` and `video: false`. Analyse locally and do not route the microphone to speakers. Do not record, upload, or store audio. Treat echo cancellation, noise suppression, and automatic gain options as tuning requests, not guarantees. Avoid adding those constraints as a reason for microphone setup to fail.

### Mode behavior

| Mode | What it does | Delivery priority |
|---|---|---|
| Fullscreen sculpture | Ordinary canvas, no camera needed; same sound and particle controls | Required, working by milestone 2 |
| WebXR AR | On supported S24 Chrome, hit-test reticle and tap-to-place | Primary AR target in milestone 4 |
| Camera overlay | Rear camera behind the swarm, without spatial attachment | Preferred additional fallback, only if time permits |

Use feature detection such as `navigator.xr?.isSessionSupported('immersive-ar')`, then handle session startup failures as well. Require `hit-test` for the placement path. Use the chosen Three.js version's current WebXR helpers or a small implementation based on official samples. Do not copy obsolete Three.js APIs from an older tutorial. [1, 3]

Place one swarm per session, with a configurable surface offset and scale. Show the reticle only with a valid hit; a tap without one should not place content. Lock the chosen transform after placement instead of chasing the reticle. Provide a working reset route, either an in-AR control when DOM overlay is available or exit and re-enter. No persistent anchoring or cross-device alignment is claimed.

Let WebXR manage its camera. Do not simultaneously open a second camera stream. If camera overlay is added, stop its video tracks before entering XR and reacquire them only when that mode is selected again. Optional overlay features must not block an otherwise valid AR session. [1, 3]

Camera overlay must be labeled as floating camera mode. It is not world tracking. Do not promise equivalent AR behavior on every iPhone or browser. If camera access fails or overlay is cut, fullscreen mode remains available. All fallbacks retain the same engine and voice controls.

On switching experiences, ending a mode, or leaving the page, clean up the relevant XR session, hit-test source, microphone/camera tracks, AudioContext/nodes, listeners, and GPU resources. Preserve mic input while intentionally moving from fullscreen to XR within the same experience. Repeated starts must not create duplicate loops or streams. Resume or request an explicit tap after returning from background if necessary.

## Deployment and acceptance

Deploy the static Vite build to Juan's existing Vercel account. Conventional settings are `npm run build` and output `dist`. Juan performs account authorization and confirms the correct project/team. Do not request account passwords or paste tokens into source. No backend secrets are required. [4]

Use the stable project production `vercel.app` URL for the demo and QRs. Verify public signed-out access; preview URLs can be protected. Leave GoDaddy and Cloudflare unchanged for the event. HTTPS is provided by Vercel. [5, 6]

Definition of full success: both QRs load the correct configurations; the sculpture is attractive and voice-reactive on the S24; WebXR placement works; the projected view is usable; repeated starts do not break it; and Juan completes two rehearsals.

If AR or mirroring cannot be made reliable within the remaining time, present the voice sculpture in fullscreen mode and describe that mode accurately. That is a useful reduced demo, not completion of the AR acceptance criteria. If the microphone fails, manual mode is an honestly labeled last fallback, not proof of voice interaction.

At each milestone Devin runs the build, checks the relevant ordinary browser flow and console, and reports what was actually checked. Use focused automated checks only where they add value, such as invalid configuration handling or deterministic audio-control logic. Do not spend the event building a test framework or substitute mocks for phone verification.

## Technical references

Use these as references, not extra feature requirements. Verify APIs against the installed package versions.

1. [Google WebXR session and hit-test guide](https://developers.google.com/ar/develop/webxr/hello-webxr)
2. [MDN requestSession and user activation](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession)
3. [Three.js documentation](https://threejs.org/docs/) and [WebXR hit-test sample](https://immersive-web.github.io/webxr-samples/hit-test.html)
4. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
5. [Vercel HTTPS](https://vercel.com/docs/cdn-security/encryption)
6. [Vercel deployment protection](https://vercel.com/docs/deployment-protection)
7. [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) and [microphone access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

These documents define a planned build. They do not claim that code, a repository, a deployment, or physical-device testing already exists.

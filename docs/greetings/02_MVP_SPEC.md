# AR Greetings — MVP specification
Version 1.0 · October 29, 2026 · Owner: Juan Carlos Gallo / JC Fractal Studios

## Goal and release boundary
A creator uploads a short ordinary recording of one person, previews a convincing cutout, chooses Plain or Birthday, and publishes a stable link and QR. A recipient needs no account and can hear the original message, placing the video in their room on the tested Android browser.

Deliver a private alpha with restricted creator access. Support Android AR first and a normal browser playback fallback. Equivalent iPhone ground placement is a separate future milestone. A local-file preview and a manually prepared video are intermediate results, not the completed recorded-greeting MVP.

## Creator experience
One guided page with a small My Greetings list:
1. **Upload:** choose an MP4; show limits and short filming tips.
2. **Processing:** show honest states, elapsed time, a recoverable error, and a retry action. Refreshing must recover the job.
3. **Preview:** play/pause/restart the actual processed result, hear its audio, and check the silhouette against light/dark backgrounds. Select Plain or Birthday; enter an optional recipient name and heading.
4. **Publish:** show Copy link and Download QR. Publish only a ready revision. Sharing should open the recipient view, not the editor.
5. **Manage:** reopen, edit template/text, republish without changing the link, unpublish, or delete.

Keep advanced rendering controls out of the main flow. Put size and bottom height under “Adjust appearance.” Loop is a simple toggle and defaults off because this is a spoken greeting. Avoid a timeline editor, manual masking, multi-person selection, and exposed model settings.

## Recipient experience
1. Open the stable link or scan the QR; see a greeting title, brief instruction, and loading/error state.
2. Tap Play preview or Enter AR as separate explicit actions. Request the camera only for AR. Greeting playback does not need microphone permission.
3. In Android AR, scan a surface, tap to place an upright cutout facing the viewer at placement time, then tap Play if audible playback still needs a user gesture.
4. Walk around it; use Play/Pause, Replay, sound toggle, Reset placement, and Exit AR.
5. Reset stops playback and hides the content until placed again; a subsequent Play starts from the beginning. Exit pauses playback and returns to a working preview.
6. When AR is unavailable, show an ordinary greeting preview with sound and clear wording. A camera overlay without tracking must never be called ground placement.

Do not autoplay sound before placement. Treat every play() rejection as a recoverable “Tap Play” state. The blank rectangle must not flash before a decoded video frame is ready.

## Initial limits and defaults
These are product choices to implement and validate, not already-supported capabilities.

| Item | Initial choice |
| --- | --- |
| Creator access | Juan plus explicitly invited test accounts; public signup disabled |
| Input | MP4, one person, 3–30 seconds, maximum 100 MiB |
| Initial codec | H.264 video with AAC audio when present; inspect actual media server-side |
| Other inputs | Reject unsupported HEVC/MOV/etc. with a helpful explanation in the first alpha |
| Processing target | Fit within 720x1280 portrait or 1280x720 landscape, max 30 fps, preserve aspect and audio |
| Appearance | Entire subject within frame, adequate light, steady camera, contrast from background |
| Virtual size | Whole displayed video rectangle 1.2 m high by default; width follows display aspect |
| Height | Bottom of displayed rectangle 0 m above detected surface |
| Adjustable range | Display height 0.25–2.5 m; bottom offset 0–2 m |
| Loop | Off initially; creator may enable |
| Facing | Set yaw toward recipient at placement; no continual billboard rotation |
| Templates | Plain and Birthday; one active template per greeting |
| Text | Optional recipient name <=60 characters; heading <=100; render as text |
| Initial quota | Up to 10 greetings/creator; one processing job at a time/creator |
| Retry | Explicit retry after failure; no unlimited billable automatic retry |
| Sharing | Unlisted opaque link; never add personal greetings to public manifest |
| Raw retention | Delete original after 7 days following successful processing; permit earlier creator deletion |
| Failed/draft retention | Expire abandoned originals/intermediates after 7 days; disclose this in creator UI |
| Processed retention | Until creator deletes or an explicitly communicated expiration policy is added |

Displayed video height is not inferred human height. Padding around the person remains part of the frame in v1; do not silently stretch or promise exact life size. Alpha inputs are intentionally narrower than “any phone video.” Broader codec normalization is future work.

## Technical direction
Keep the current Vite/TypeScript frontend and existing demo deployment. Add a video template and reuse ArPlacement. Use a single renderer and animation loop per active experience. Do not instantiate the particle mic pipeline for a greeting.

Proposed default for G3: an isolated Supabase project for Auth, Postgres, and private object storage, plus a small server-side API on the existing hosting stack. Confirm the deployment integration before adopting it. This is a proposed choice, not an already configured account or a dependency from another product. Do not reuse AR Miami Passport data or credentials.

Upload directly from the browser to scoped object storage; do not proxy a 100 MiB video through a short request handler. Keep provider keys and service credentials server-side. Background removal and heavy FFmpeg encoding belong in a durable processing provider/worker, not a browser tab or a request that must stay open.

Keep processing behind a small provider adapter:
- Submit a validated source object and receive a durable job identifier.
- Retrieve job state, or verify a provider webhook.
- Import output into our own storage, validate it, and create a playback asset.
- Preserve original audio if the provider drops it; align durations/timestamps.
- Expose provider-neutral failure codes to the UI.

A hosted API is the first experiment. Self-hosted Python/GPU matting remains an option if quality, cost, and maintenance justify it. No custom model training in this MVP.

## Transparency and media decision
G2 must choose a playback representation with actual device evidence:
- Native-alpha video, only where the target browser decodes and renders its alpha correctly.
- A single MP4 packing RGB and a grayscale matte into separate regions, combined by a shader. This avoids two independently playing videos; prove matte resolution, orientation, seam handling, audio, and decode performance.
- Chroma-key MP4 as a documented fallback if it produces an acceptable result. Green clothing, spill, and compressed edges are limitations.

Keep the best available foreground/matte master when available. Adding green after extraction is not a requirement. A normal H.264 MP4 does not gain native alpha because its filename says “cutout.” Separate RGB and matte streams require reliable synchronization; do not select them casually.

Do not commit the entire product to one format before the spike. Normalize rotations, color handling, frame dimensions and aspect; keep the video/shader texture color-space conventions consistent. A known-good opaque MP4 should also work for diagnosis.

## Minimal data model
Implementation may combine tables if the same lifecycle and access rules remain clear.

| Record | Minimum information |
| --- | --- |
| Greeting | id, owner_id, title, draft_revision_id, published_revision_id, opaque public_id, created/updated/deleted timestamps |
| Revision | greeting_id, source/output asset references, template, text, size, bottom offset, loop, status |
| Processing job | revision_id, provider/job id, attempt, state, error code, timestamps, idempotency key |
| Asset | owner, storage key, MIME/codec, dimensions, duration, size, transparency representation, cleanup status |

Separate revision processing status from publication state. A ready draft is not automatically public. Reprocessing must not replace the existing published revision until the new version is ready and the creator publishes it.

Processing: draft → uploading → queued → processing → ready; failures lead to failed with a retry/correction action. Failed attempts and timed-out jobs must not stay “Processing” forever.
Publication: unpublished → published → unpublished/deleted. Stable public_id points to the currently published ready revision.

## Routing and publication
Preserve ?exp=neon-garden and ?exp=cosmic-vortex exactly. Add a distinct dynamic greeting route, for example /?g=<opaque-public-id>, so greetings do not pass through the static manifest whitelist. Resolve any ambiguous route parameters deterministically.

QR payload is a stable canonical page URL on the configured production domain, never a signed storage URL, local blob URL, provider URL, or preview host. The page resolves short-lived playback access when opened. Published links survive deploys and ordinary editing. A draft local preview or a preview deployment must not pretend to create a durable production greeting.

Before Publish, verify the chosen revision is ready and its asset exists. Unpublish removes anonymous access immediately at the resolver; issued playback URLs may remain valid until their short expiry. Delete revokes access, queues deletion of originals/outputs/intermediates, and reports pending cleanup honestly.

## Basic access and reliability requirements
Creator routes/API/storage enforce authentication, owner checks, and the invitation rule. Test two distinct users; hiding UI is not authorization. Never expose raw source or draft assets through anonymous APIs. Recipient DTOs expose only published rendering settings and playback access.

Unlisted means anyone possessing the link can open or forward it; say so before sharing. Use opaque unguessable IDs and no public directory. This alpha does not promise recipient authentication or DRM.

Validate file signature/metadata/duration/size on trusted infrastructure before paid processing, not just the extension. Use scoped upload credentials. Restrict worker fetches to our storage or verified provider output; do not create an arbitrary URL fetch endpoint.

Make submit/retry/webhook processing idempotent. Set a job deadline, recover via polling when a webhook is missed, and ignore stale attempts. Limit concurrency and record actual processing/storage costs. Do not invent a price from an unauthenticated provider page.

## “Good MVP” completion criteria
- Juan signs in, uploads an ordinary accepted MP4, and receives a processed, previewable greeting without manually moving media between services.
- Refreshing during processing recovers the same job; a failed job can be retried without duplicate uncontrolled submissions.
- Background extraction is accepted by Juan on three representative recordings; the face/torso stay intact, hands do not disappear for sustained intervals, and no persistent background slab appears.
- Original speech is audible and acceptably synchronized at the start, middle, and end. Replay and looping work.
- Plain and Birthday preview identically in layout to recipient delivery; confetti stays within a bounded draw/particle budget.
- The QR decodes to the published stable page and opens on a second device signed out.
- S24 placement, walking around, Reset, Exit, and re-entry work with video and sound.
- iPhone ordinary playback fallback is tested on a real phone, or release notes explicitly limit the alpha to verified devices.
- A second creator cannot read/edit/delete another creator's source/draft or unpublished greeting.
- Unpublish/delete and expired playback access behave as documented.
- Existing two particle URLs, gallery, unknown-ID errors, audio, and AR entry/exit still work.
- Provider secrets and personal recordings are absent from Git and public demo lists.
- Tests, open limitations, deployment URLs, and continuation instructions are recorded in 04_HANDOFF.md.

## Deferred
Public signup/payments/subscriptions, native apps, photo animation, cloned voices, automatic filming, rich editor, custom template authoring, multi-person masking, image tracking, geospatial or persistent anchors, downloads of private originals, recipient analytics, and fully equivalent iPhone AR.

## Technical references checked October 29, 2026
- Three.js VideoTexture: https://threejs.org/docs/pages/VideoTexture.html
- Hosted spike candidate, not a selected provider: https://fal.ai/models/fal-ai/birefnet/v2/video/api — documents video and optional mask output; verify output alpha, original audio, runtime, limits, pricing and retention in a real test.
- Optional local matting research: https://github.com/PeterL1n/RobustVideoMatting — a human video-matting implementation with temporal memory; code license and model terms must be considered before adoption.
- Apple engineer's historical WebXR response: https://developer.apple.com/forums/thread/756850 — useful context, not proof of current target-device behavior. Recheck capabilities at runtime and on hardware.

These sources establish candidate mechanisms. They do not establish our processing quality, browser compatibility, commercial pricing, or a tested iPhone delivery path.

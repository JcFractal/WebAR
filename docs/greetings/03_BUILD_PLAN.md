# AR Greetings — build plan and assignments
Version 1.0 · October 29, 2026

## Milestone discipline
Work from current GitHub state. One active implementer; branch/PR per milestone. Routine implementation decisions do not need a separate permission round. Report a material product-scope or service-access decision when it arises, and continue independent work. Do not merge or change production merely because a preview build passed.

At each stop update 04_HANDOFF.md with branch, exact commit, PR, deployment, changes, checks, required device tests, blockers and next action. Existing demo behavior is a regression boundary. Use targeted tests for the new behavior rather than broad refactors.

| Milestone | Deliverable | Estimated focused effort |
| --- | --- | --- |
| G1 | Video template, local MP4 selection, controlled keying, Android placement | 1–2 days |
| G2 | Real cutout and playback-format experiment | 0.5–1.5 days |
| G3 | Private creator app, stored uploads, stable publish/QR | 1–2 days |
| G4 | Automatic ordinary-video processing integrated end to end | 1–3 days |
| G5 | Birthday template and recipient trial/reliability pass | 0.5–1.5 days |

Ranges overlap in practice. Plan roughly 6–10 development days overall if G2 succeeds. G1+G3 can demonstrate prepared-video upload earlier, but retain G2's early feasibility work so we do not invest in a dashboard around an unacceptable cutout. Equivalent iPhone placement is excluded from these estimates.

## G1 — prove video in the current player
### Implement
- Install the six planning files under docs/greetings and add root documentation pointers.
- Correct the stale README status after checking actual code.
- Add a discriminated video experience config/template while keeping swarm configs valid.
- Minimal video settings: source, display height, bottom offset, loop, and opaque/chroma mode with key color/tolerance/edge softness. Use conservative defaults; advanced keying controls belong to test UI.
- Reuse ArPlacement with a bottom-at-origin content group. One active canvas, renderer, and animation loop.
- Add an in-page local file selector for private MP4 testing. Object URLs are temporary; revoke on replacement/disposal and explain that no upload or shareable greeting exists yet.
- Add a non-personal hosted test fixture/config with a test link and QR only if a permitted fixture is available. Do not commit or upload Juan's personal greeting as a public fixture.
- A deterministic synthetic clip can prove loading, audio and shader behavior. Label it synthetic; it does not prove realistic hair/edge quality.
- First-frame guard, loading/error/retry states, muted preview/user-gesture audible playback, play/pause/replay, loop, Reset/Exit/re-entry.
- Pause playback while searching for a surface; no greeting mic permission. Keep an opaque playback option for diagnosing keying problems.
- Feature-detect AR and provide an ordinary preview fallback.

### Verify
Run npm ci, npm run typecheck, npm run build. Add focused checks for video config validation and backward compatibility, playback cleanup, and relevant placement lifecycle changes. Browser checks cover missing/bad media, blocked playback, one active renderer/loop, and old gallery/errors. Do not add a broad new test framework merely for a smoke check.

Juan's S24 checklist:
1. Select a 10–15 second local MP4; check aspect, sound and replay.
2. For a prepared green-screen clip, check transparency against the real camera scene.
3. Enter AR, scan, place; the bottom offset and size are understandable.
4. Walk sideways; fixed position and yaw remain stable.
5. Play/Pause/Replay, loop once, Reset, place again, Exit, re-enter.
6. Background/resume the browser; no extra audio tracks or stale canvas.
7. Open each original particle experience; check it still works.

### Done when
A controlled video plays with sound and can be placed/reset/exited on the S24 with evidence recorded. Until Juan tests, mark “implemented; phone verification pending.” G1 does not establish automatic removal, durable upload or iPhone tracking.

### Assignment
Use 05_DEVIN_START.md as the first prompt.

## G2 — prove ordinary-recording cutout and choose media format
### Implement/research
- Use the same three 10–15 second consented recordings described in 00_START_HERE.md. Start with one, then compare the other two once basic processing works.
- Evaluate one hosted video-matting endpoint first; the fal candidate in the spec is a starting point, not a commitment. Confirm current API, credentials, output schema, commercial use terms, processing cost and handling of private media.
- Run one alternative only if the first output fails materially. Avoid an open-ended vendor survey.
- Preserve source audio, account for orientation, and inspect foreground/matte frame alignment.
- Trial native alpha or packed RGB/matte playback in the real G1 player. Use chroma as a fallback if it meets the visible quality bar.
- Build a small reproducible processing experiment outside public assets; keep sensitive samples out of Git.
- Record method, model/version, input/output specs, measured elapsed processing time and actual billable cost per clip when available.
- Record the delivery format in the handoff decision log and implement its decoder/material in the video template if needed.
- Check ordinary video fallback on a real iPhone as soon as one is available. Do not start a new iPhone tracking engine here.

### Verify and decision
Judge face/hair/hands, background leakage, flicker during motion, audio sync, decode smoothness, loading time and replay on S24. Juan accepts the visual result. Browser-only screenshots cannot establish AR quality.

If no output is acceptable, record the failed samples and the smallest proposed correction. Continue the prepared-video alpha honestly if useful; do not call manual preparation automatic removal or silently expand into model training.

### Prompt after G1
“Proceed with G2 only in docs/greetings/03_BUILD_PLAN.md. Prove an ordinary greeting recording through background extraction and the actual G1 player. Start with one hosted method and at most one alternative if needed. Choose a measured playback representation, preserve original audio, and record cost, quality and device evidence. Implement the chosen decoder if necessary. No creator backend or iPhone tracking engine yet. Update 04_HANDOFF.md and open a focused PR for code/document changes.”

## G3 — make the private creator web app real
### Implement
- Confirm a small isolated backend/storage choice; default proposal is Supabase Auth/Postgres/private storage plus thin server API. Keep the Vite player.
- Invited creators only, no public signup. Use server-side authorization and storage rules; keep service-role/provider credentials out of client builds.
- Create/edit/list greeting drafts; direct signed uploads with progress; 30-second/100-MiB limits and trusted metadata validation.
- In this phase, upload a prepared playable video; clearly distinguish it from automatic background removal.
- Build the one-page Upload → Preview → Publish flow and basic My Greetings.
- Add a dynamic greeting route separate from the public static demo manifest.
- Publish only a verified ready revision. Stable public page URL → published revision → short-lived asset access.
- Copy link and Download QR, unpublish, delete, expired-link and unavailable states.
- Add schema migrations, local setup instructions and an .env.example with variable names/placeholders only.
- Configure preview environments explicitly; never point test writes at an unrelated production database.

### Verify
Two creator accounts and signed-out recipient: ownership enforcement, draft privacy, upload rejection, failed upload retry, publish readiness, QR payload decoding, independent recipient access, stable link after redeploy/edit, unpublish, delete and storage cleanup. The QR points to a page, not a blob or signed media URL.

### Done when
Juan uploads a prepared video through a persistent creator app, publishes it, and another signed-out phone opens the QR and plays it. Re-uploading after an error must not orphan unlimited files.

### Prompt
“Proceed with G3 only, following the MVP spec and recorded G2 media decision. Build the invited-creator upload/preview/publish app with persistent storage and a stable unlisted QR page. Use isolated project resources and preserve the two original experiences. Prepared-video support is enough for this milestone; automatic removal comes in G4. Include migrations/env setup, meaningful owner/privacy tests and a preview PR. Record real configuration blockers and update 04_HANDOFF.md.”

## G4 — connect automatic processing
### Implement
- On completed validated upload, submit a durable background-removal job using the G2-selected method.
- Persist attempt/provider ids and processing states; idempotent submission, verified callbacks, polling recovery, timeout and manual retry.
- Move provider outputs into our storage; normalize/encode the selected playback format in a durable worker/service.
- Keep original audio synchronized. Validate output before ready; do not publish a black/opaque/missing file as a cutout.
- Creator refresh/reconnect resumes status. Show useful failure wording, not raw infrastructure errors.
- Process each upload once per requested attempt; recipient scans only resolve/play the finished asset.
- A new revision does not disrupt an already published greeting.
- Enforce quota/concurrency and retention cleanup.

### Verify
A real normal MP4 runs upload → processing → preview → publish → signed-out QR → S24 AR without manual file transfer. Test duplicate submission/webhook, expired provider access, failed processing, timeout/retry, page refresh, output copy failure, missing audio and deletion during a job. Prevent a late callback from restoring a deleted or superseded revision.

### Done when
Three representative normal recordings meet the spec and G4's entire user flow works. If a provider is mocked or credentials are missing, mark integration incomplete; mocks establish contract behavior only.

### Prompt
“Proceed with G4 only. Integrate the measured G2 processor into G3's real upload flow using persistent jobs, idempotency, recovery and output validation. Preserve original audio and published revisions. Demonstrate a real ordinary video through processing, preview and a stable QR into the S24 player; separate simulated tests from Juan's hardware results. Update 04_HANDOFF.md and open a focused PR.”

## G5 — greeting polish and private trial
### Implement
- Plain and Birthday templates sharing the same person video, placement group and transport controls.
- Birthday has optional recipient name, heading and modest confetti; keep the room visible between elements.
- Keep template layout consistent between creator preview, regular recipient preview and AR.
- No arbitrary canvas editor, background video gallery, or new AI generation.
- Confirm sensible touch controls, short recording instructions, helpful processing failures and honest sharing/retention copy.
- Complete My Greetings unpublish/delete behavior and ordinary iPhone playback fallback if a device is available.
- Run a small trial with Juan and 2–3 recipients. Record what confused them, whether it played, and whether the cutout felt worthwhile.

### Release checks
Use the acceptance criteria in 02_MVP_SPEC.md, including the original particle regression checks. Capture exact devices/browsers, build result, preview/release commit, provider/format decision, known defects, current processing cost and next steps. Record deployment linkage; do not assert production is on a commit merely because main contains it.

### Prompt
“Proceed with G5 only. Add Plain/Birthday selection, recipient text and restrained confetti, finish the private-alpha user flow, and run the documented checks. No public signup/payments or iPhone AR engine. Prepare a concise trial checklist and release notes with exact verified devices, remaining limitations and deployment commit. Update 04_HANDOFF.md and open the PR.”

## iPhone follow-on decision
After the alpha, separately test one iPhone-capable tracking approach with the same real transparent video and audio. Compare SDK/deployment restrictions, actual surface placement, device range, cost and ownership. Quick Look is not assumed to run our current shader/video/template pipeline. Device-orientation overlays do not establish world tracking. Choose the product promise only after a real-device proof.

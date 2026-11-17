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
> **Priority (Juan, Nov 16):** ship the smallest usable Android creator MVP first: sign in → upload an already processed cutout (packed MP4) → private draft → publish/unpublish → stable link + downloadable QR → a recipient with no account plays/places it in the existing player. Automatic fal processing (G4), decorative templates and visual polish come after this flow works. iOS stays deferred. Implemented on PR #10 (see 04_HANDOFF.md, G3 section). Deviation recorded: account sign-up is open, but creating greetings requires an allowlisted email (`creator_emails`).

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

### Implementation plan (Nov 16, after G3 shipped)
Flow: creator picks an **ordinary** phone video → resumable upload → server normalizes → fal matte → server packs → validate → creator previews the draft in the existing player → Publish (only a validated `ready` video can be published). G3's prepared-video upload stays as an alternative path.

**Measured inputs.** G2 run: 8.56 s clip, 56.2 s fal inference at $0.000575/s = **$0.032** (≈6.6 compute-s per clip-second at 1024×1024). Projected: 15 s ≈ $0.06, 30 s ≈ $0.11 per attempt (estimate; record real `metrics.inference_time` per job). VM normalize of the 4K HEVC clip took 8.9 s. The S24 4K clip is **43 MB for 8.6 s (40 Mbit/s)**, so a 30 s 4K clip (~150 MB) exceeds the Supabase Free 50 MB per-file limit (current `fileSizeLimit` = 52428800).

**Processing hosting (recommended: no new service).**
- Orchestration and media work run as Vercel Functions in `web-ar` (`iad1`, next to Supabase `us-east-1`; fluid compute, 300 s default timeout), with `ffmpeg-static` for normalize/pack. fal does the GPU matting via its queue API.
- Each step is a short, resumable stage, so no single invocation needs the full 300 s:
  1. `normalize`: download original by signed URL → upright 720×1280, 30 fps CFR, AAC copy (`cutout.py` logic ported to TS) → `normalized.mp4` in storage.
  2. `submit`: `POST queue.fal.run/fal-ai/birefnet/v2/video` (model `Matting`, `output_mask`, 1024) with a short-lived signed URL of `normalized.mp4` (no fal upload step) and `fal_webhook=https://web-ar-gold.vercel.app/api/fal-webhook`. Store `request_id`.
  3. `collect`: on a verified webhook (ED25519 via fal JWKS, ±300 s timestamp, raw-body SHA-256) or a status poll, download the mask immediately (fal media URLs expire) → storage.
  4. `pack`: colour from `normalized.mp4` + mask → packed H.264/AAC MP4 (original audio stream copied), same as the S24-tested G2 output.
  5. `validate`: frame count = normalized, duration ±0.05 s, audio present and bit-identical, matte not all-black/all-white, not static. Then `ready`.
- First G4 task is a **free timing spike**: run normalize + pack in a deployed preview function on Juan's existing G2 clip and mask (no fal call). If 30 s clips exceed ~240 s or memory, fall back to one small container worker (Fly.io / Cloud Run) running `scripts/g2/cutout.py` (new account; Juan decides). GitHub Actions is rejected (public repo logs and personal footage).

**Durable jobs.**
- New table `processing_jobs`, written only by the service role; owners can read their own:
  - `id`, `greeting_id`, `revision`, `state`;
  - `attempt`, `fal_request_id` (unique), `lease_until`;
  - `error_code`, `user_message`, `inference_seconds`, `cost_usd`, timestamps.
- `state` moves through `uploaded → normalizing → normalized → submitted → matte_ready → packing → ready | failed | cancelled`.
- Every transition is a conditional update (`where state = <expected>`), so duplicate webhooks, double clicks and concurrent polls are no-ops.
- A job belongs to one revision. A late callback for a deleted or superseded revision is ignored, and its files are removed.
- The greeting keeps `published_video_path`. A new revision never touches the published file until the creator publishes it.

**Progress and error recovery.**
- **Upload:** Supabase TUS resumable upload (`/storage/v1/upload/resumable`), so phone network drops resume instead of restarting. The progress bar and cancel stay as in G3.
- **Processing UI:** the page shows a stage list (Uploading → Preparing → Removing background → Finishing → Ready) and polls `GET /api/process?id=` every 5 s. Refreshing or reopening the page resumes from the stored state.
- **Self-healing polls:** each poll also advances a stalled job. Expired lease → re-run the free stage. `submitted` past 10 min → check the fal status URL, which recovers a missed webhook. Past 30 min → `failed`, cancelling the fal request.
- **Retry:** free stages retry automatically (max 2). The paid fal step is never auto-resubmitted; the creator taps **Try again**, which counts against quota.
- **Errors:** creator-facing wording maps from `error_code` (unsupported video, too long, provider busy, processing failed: try again, daily limit reached). Raw errors go to logs only.

**Cost controls.**
- **Kill switch:** `G4_PROCESSING_ENABLED` env var; when off, only the prepared-video upload works.
- **Limits:** server-side `ffprobe` enforces 3–30 s **before** any fal call. One active job per creator. Per-creator daily quota (default 5 attempts). Global daily budget (default $1 ≈ 30 × 10 s clips), summed from `cost_usd`. Only allowlisted, confirmed creators.
- **Idempotency:** one fal submission per (revision, attempt), using a DB uniqueness constraint.
- **Ledger:** cost recorded per job from fal `metrics.inference_time` × unit price, and shown in the handoff after each test.
- **Spend limit:** Juan sets a spend limit or low balance on the fal dashboard as the hard cap. `FAL_KEY` is server-only in Vercel (sensitive), never in the browser or Git.
- **Approval:** paid test runs need Juan's explicit approval with a stated count, e.g. "3 runs".
- **Retention:** originals, normalized copies and raw masks are deleted 7 days after `ready`. The matte master (fal mask) and the packed output are kept while the greeting exists. Deleting a greeting cancels its job and removes all files.

**Security fixes folded in (from PR #10 review).**
- Publishing moves to a server endpoint (or a policy check) that requires `is_creator()` and a `ready` job. The client can no longer write `video_*` or `status = 'published'` directly.
- Removing an address from the allowlist then also blocks publishing.

**Decisions for Juan before G4 starts.**
1. **Upload size:** either upgrade Supabase to Pro (≈$25/month, raises the per-file limit), or keep Free and tell creators to record at 1080p and keep clips ≤ ~20 s (≈17 Mbit/s → ~45 MB).
2. **Paid test budget:** approve N fal runs. Three representative clips ≈ $0.10–$0.35 total, plus a fal spend cap.
3. **Hosting fallback:** OK to create a small container worker account if the Vercel timing spike fails?

**Order of work** (each step is a commit; stop for an S24 test at the end):
1. Free timing spike on Vercel.
2. Migration (`processing_jobs`, revisions, publish gate).
3. TUS upload.
4. `/api/process` stages + `/api/fal-webhook` with signature tests, mocked fal for contract tests (marked simulated).
5. Creator progress UI.
6. Cost controls/kill switch.
7. One approved real run end to end.
8. Then the remaining approved runs and Juan's S24 check.

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

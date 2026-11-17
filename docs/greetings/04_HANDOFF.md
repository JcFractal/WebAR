# AR Greetings — living handoff
Last updated: November 17, 2026 (G4 automatic processing built and tested with mocks on `devin/1794878050-g4-processing`; not merged, no paid fal runs; Devin)
Update this file in every implementation PR and before pausing or switching tools.

## Current status
- Stage: **G1–G3 merged to `main` and live in production (Nov 16): #8 `a080019`, #9 `cfdd342`, #10 `d12b269`.** Production https://web-ar-gold.vercel.app/ hosted desktop E2E passed 16/16 on `d12b269`; **production S24 test passed (Juan, Nov 16, 20:08 EST): placement, background removal, playback, audio and Replay.** **G4 (automatic processing) built on `devin/1794878050-g4-processing` and tested with mocks only (see the G4 section); not merged, hosted migration not applied, no paid fal runs.** S24 full flow incl. unpublish passed on the G3 preview. The rest of G1 check 8 (Neon Garden and Cosmic Vortex AR placement, ARCore version) is still not recorded. The earlier AR invisibility no longer reproduces; **its cause is unknown** (see the investigation section).
- iOS / iPhone: **untested.** Juan has no iPhone available. The iPhone milestone (ordinary-playback fallback check and the separate iPhone tracking follow-on) is **deferred** by Juan on 2026-11-14 and does not block Android work. Nothing in G1 or G2 claims iPhone compatibility.
- Active agent: Devin. G2 (Android cutout proof) assigned by Juan on 2026-11-14 and continues on a new branch from the tested G1 commit; see the G2 section when present.
- Merges: Juan only. PR #8 stays open until he merges it.
- Repository: https://github.com/JcFractal/WebAR
- Observed main: accf90a1b6b968001edfbfb8e71314b994bacdd7 (rechecked 2026-11-14; unchanged).
- Greeting branch / commit / PR: `devin/g1-video-placement`; G1 code a1fd865, last code change 0f1ad9e (probe steps 6–10), phone-tested tip 67a13fb (later commits are docs only); PR https://github.com/JcFractal/WebAR/pull/8 (open, mergeable, not merged).
- Greeting preview deployment: Vercel branch preview https://web-ar-git-devin-g1-video-placement-jc-fractal-studios.vercel.app/?exp=greeting-test (requires Vercel sign-in). Production is unchanged.
- Existing production URL: https://web-ar-gold.vercel.app/ (main).
- Backend project, schema and storage: schema + bucket defined in `supabase/migrations/`; verified on a local Supabase; dedicated hosted project not yet provided (see G3 setup).
- Processing provider and media format: G2 in progress (see G2 section). Candidate formats implemented: packed colour|matte MP4 (primary) and native-alpha VP9 WebM (comparison); not yet decided on S24 evidence.
- Personal test clips: none in Git. The repo contains only a generated synthetic fixture (`public/media/synthetic-greeting.mp4`, made by `scripts/make-synthetic-fixture.py`).
- Open risk: the invisibility cause was never identified, so it could return; the probe (`&probe&step=…`) and `&diag` readout stay as opt-in references.
- Next concrete action (G1): Juan reviews and merges PR #8 when satisfied; optionally records check 8 (particle AR on both experiences + ARCore version). Devin does not merge.

### PR #8 final review summary (G1)
- Scope: a separate `video` template (`src/video/`), discriminated config union, lazy `loadTemplate`, `ArPlacement` wording only, synthetic fixture and test-fixture gallery section, local MP4 picker (blob URL, not uploaded), opaque/chroma keying, first-frame gate, tap-to-play, Reset/Exit/re-entry, no microphone use for video. Particle configs, swarm code and audio tuning unchanged apart from the config type.
- Opt-in diagnostics kept behind URL flags and inert by default: `&diag`, `&probe&step=…`, `layer=legacy`, `overlay=hud`, `stage=visible`. Removing them is optional cleanup; they cost nothing on normal URLs.
- Checks: `npm run typecheck`, `npm run build`, `npm test` 12/12; headless CDP smoke 68/68 (no WebXR; preview paths only).
- S24 evidence: checks 1–7 pass (placement/walk-around, AR transport, Reset/Exit/re-enter, height/offset, loop, backgrounding, chroma on the synthetic clip); Juan's own MP4 visible with sound in AR; particle voice response OK after recalibration.
- Not established by G1: background removal, uploads, sharing of personal greetings, real-footage keying quality, iPhone anything. Still open: check 8 particle AR + ARCore version.
- After merge, the gallery's `greeting-test` QR (production base URL) starts working; before merge it points at a route production does not have.

## G2 — Android cutout proof (accepted on Android, Nov 16)
- Branch `devin/g2-cutout`, created from the G1 branch at f43ca6a (tested code 67a13fb + docs). PR https://github.com/JcFractal/WebAR/pull/9, base `devin/g1-video-placement` so the diff is G2 only; retarget to `main` after PR #8 merges. Juan merges.
- Preview (after Vercel builds the branch; Vercel sign-in): `https://web-ar-git-devin-g2-cutout-jc-fractal-studios.vercel.app/?exp=greeting-cutout-test` (packed) and `?exp=greeting-alpha-test` (native-alpha WebM). Both use the synthetic clip.
- Player: `KEY_MODES` = `opaque | chroma | packed | alpha`. `packed` = one H.264/AAC MP4 at 2W×H, colour left, grayscale matte right; samples are clamped one texel inside each half; the plane shows half the decoded width. `alpha` = the texture's own alpha (VP9 `yuva420p` WebM). The local picker accepts MP4 and WebM; `*-packed.mp4` → packed, `*.webm` → alpha, otherwise opaque. Formats stay replaceable: the representation is just the `keying.mode` value plus the file.
- Pipeline: `scripts/g2/cutout.py SOURCE --method fal-birefnet|chroma-test|file:<matte>`. Setup: ffmpeg/ffprobe with libx264, libvpx-vp9, prores_ks, ffv1, libopus; `python3 -m venv ~/g2-venv && ~/g2-venv/bin/pip install -r scripts/g2/requirements.txt`; `FAL_KEY` in the environment for `fal-birefnet` (never in Git). Outputs go to `~/g2-private/<name>/`: `-packed.mp4`, `-alpha.webm`, masters `-foreground.mov` (ProRes 4444 + alpha) and `-matte.mkv` (FFV1), `provider/` raw outputs + response, `contact.png`, `report.json`. Paths inside the repo are refused; `.gitignore` adds `g2-private/` and `*.private.*`.
- Audio: video is encoded alone with the exact frame count, then muxed with the original source audio (stream copy when AAC; `report.json` checks the audio bitstream is identical to the source). Single-pass `-shortest` / `-frames:v` truncated video by 44 frames or audio by 1.6 s on the synthetic clip and was replaced.
- Synthetic pipeline proof (`chroma-test`, not real matting): 360/360 frames in every output; packed/foreground audio start offset 0.000 s, duration equal to the source; WebM Opus preroll −0.007 s.
- Colour paired with the matte: the provider's refined foreground when it returns one (spill removed at soft edges), else the normalized source; `--colour PATH` / `--source-colour` override, and `report.json` records `colour_source`. Matte statistics stream frame by frame (about 650 MB peak RSS on the synthetic run).
- Chosen first real method: fal.ai `fal-ai/birefnet/v2/video`, model `Matting`, `operating_resolution` 1024x1024, `output_mask` true, ProRes 4444 output. Per-frame model: watch flicker. Fallback only if needed: RobustVideoMatting locally (GPL-3.0, CPU).
- Real clip received Nov 16 (private attachment, not in Git): 8.6 s 3840×2160 HEVC, rotation −90 (portrait), VFR ≈29 fps, AAC stereo 48 kHz. Normalized to 720×1280, constant 30 fps, 257 frames, AAC copied (`~/g2-private/juan-take1/`, VM only).
- First attempt blocked before upload (fal 403 "Exhausted balance"; nothing uploaded, $0.00). After Juan's top-up, **one run**: request `01a1e652-1617-76a0-97fe-3ab106efcbfe`, `Matting` @ 1024×1024, `refine_foreground`, ProRes 4444 out; upload 0.7 s, wall 56.6 s, fal `inference_time` 56.2 s → **$0.032** (56.2 × $0.000575). No further runs without Juan's approval.
- fal returned `mask_video` (ProRes 4444, 720×1280, 30 fps, 257 frames) and `video` (refined foreground, 152 MB). The mask URL 404'd for ~1 min after the result, then downloaded; the foreground URL still 404'd 20+ min later (also via `fal_client.result`). The script now retries downloads on 404 rather than failing (`4904b72`). Deliverables were therefore built locally from the downloaded mask with `--method file:provider/mask.mov --source-colour` (no second provider call), so soft edges carry source-background spill.
- VM evaluation (`report.json`): every output 257 frames; packed + ProRes audio bitstream identical to source, offset 0.000 s; WebM Opus offset −0.014 s. Matte coverage 0.51–0.62, soft-pixel fraction 0.021, binary flip mean 0.58% / p95 1.75%, worst frame 103. Visual: hair/face edges clean with a slight light fringe; at frame 103 a fast, motion-blurred arm at the left frame edge goes partly transparent and the shirt edge shows a light halo. Packed MP4 4.2 MB, alpha WebM 2.5 MB.
- Delivered to Juan as private chat attachments (not in Git): `juan-take1-packed.mp4`, `juan-take1-alpha.webm`, contact sheet and edge crops. Masters (`-foreground.mov` 217 MB ProRes 4444, `-matte.mkv` FFV1, raw `provider/mask.mov`) remain in `~/g2-private/juan-take1/` on the VM only. S24 test: open `?exp=greeting-cutout-test` on the G2 preview, "Choose local video", pick each file.
- **S24 result (Juan, Nov 16): the processed alpha WebM (`juan-take1-alpha.webm`, real clip, fal matte + source colour) worked in AR on the S24.** Packed MP4 (`juan-take1-packed.mp4`) was re-sent as MP4 + ZIP after the first link downloaded as `.xml`. On Nov 16 Juan asked to "record the G2 phone passes" and proceed to G3; G2 is recorded as **accepted on Android** on that basis. No separate written packed-MP4 phone report or edge/flicker/sync notes exist; G3 stores `packed` and `alpha` explicitly, so either works, and the first G3 phone test (a stored packed greeting) doubles as the packed S24 check.
- Cost: fal pricing API (authenticated) lists `fal-ai/birefnet/v2/video` at $0.000575 per compute second. The session key cannot read billing/usage, so actual cost = reported compute time × unit price (recorded in `provider/response.json` `metrics`).
- Still to evaluate on S24: edges (hair/face/hands), leakage, flicker, audio sync start/middle/end, decode smoothness, load/replay, AR placement, for packed vs alpha.

## G3 — Android creator MVP (priority set by Juan, Nov 16; PR #10)
Juan's priority (Nov 16, ~4 h of access left): a usable Android creator MVP before automatic fal processing, decorative templates or visual polish. Target: sign in, upload an already processed packed MP4, create and save a greeting, publish a stable link and a downloadable QR; a recipient opens the link with no account and views/places it in the existing Android player. iOS stays deferred; the particle experiences are untouched.

- Branch `devin/g3-creator` (from `devin/g2-cutout` at a40adbf). PR https://github.com/JcFractal/WebAR/pull/10, base `devin/g2-cutout` (G3-only diff); retarget after #8/#9 merge. Juan merges.
- Routes: `?create` = creator (sign in / create account, new greeting, My greetings); `?g=<12-hex slug>` = recipient; `?exp=` unchanged. The gallery links to `?create`.
- Creator: email + password (Supabase Auth). Pick an MP4/WebM, **choose the format explicitly** (`packed` | `alpha` | `opaque`; packed is suggested for MP4). Checks before upload: MP4/WebM only, ≤ 50 MiB, 3–30 s, the first frame must decode, a packed file must be wider than tall, and the format must match the container. Upload goes by XHR to Storage with a progress bar, Cancel, and plain-language errors. Saved as a **private draft**; edit the title/format; Publish / Unpublish / Delete. A published greeting shows the link, an SVG QR, **Download QR (PNG)** and Copy link.
- Data (`supabase/migrations/20261116000000_greetings.sql`):
  - `public.greetings`: `owner_id`, a stable `slug` assigned at creation, `title`, `video_path`, `video_format`, `video_mime`, `video_bytes`, width/height/duration, `status draft|published`, `published_at`.
  - RLS allows the owner only. A guard trigger keeps `id`/`owner_id`/`slug`/`video_path` immutable.
  - Invitation gate: `public.creator_emails` + `is_creator()` (the caller's **confirmed** email must be listed) are required to insert a greeting or upload. Anyone can sign up, but cannot create.
  - Private bucket `greeting-videos` (50 MiB, video/mp4 + video/webm). Paths are `<uid>/<greeting id>.<ext>`; owners read/insert/delete their own folder.
- Recipient: `api/greeting.ts` (Vercel function, Web `GET` signature) looks up one **published** greeting by slug with the service role and returns `{title, video_format, video_url}` with a 6 h signed URL. There is no anonymous table or storage access, so drafts and other greetings cannot be listed. The page then mounts the existing `mountVideo` with `keying.mode = video_format`; playback never depends on the file name. The signed-in owner can preview their own draft at the same URL. In dev, `vite.config.ts` serves the same handler at `/api/greeting`.
- Links: `VITE_GREETING_BASE_URL` pins links/QRs to one domain. Unset, they use the deployment serving the page, which is a preview until merge, because production doesn't have the route yet. **Set it to `https://web-ar-gold.vercel.app/` after G3 merges, before printing real QRs.**
- Verification so far:
  - `npm run typecheck` passes, `npm test` 19/19, `npm run build` passes.
  - Desktop Chrome (CDP, no WebXR) end-to-end against a **local** Supabase (`supabase start`, same migration, `~/g3-local/e2e.mjs`, not in Git): 32/32 checks pass.
  - Covered: the gallery link; wrong-password error; a non-allowlisted account refused at upload; packed/portrait and non-video rejected; upload progress with throttling; a double tap gives one draft; draft private and listed; owner preview of the draft; anonymous blocked from the draft; a second account can't read/publish/sign/write A's data; anonymous storage listing empty; slug/owner immutable; publish → QR PNG with payload equal to the link; editing keeps the link; anonymous recipient plays the packed cutout (1440-wide video, crossOrigin, cutout rendered); unpublish stops the link; malformed link explained; `?exp=neon-garden` still loads.
- **S24 result (Juan, Nov 16, 19:22 EST): pass.** On the hosted preview, as `jcfractal2012@yahoo.com`, Juan created, published and opened a stored greeting. In his words: "the published greeting opens, places in AR, plays with no background, includes audio, and Replay works." This is also the S24 check for a stored **packed** greeting.
- **S24 full flow (Juan, Nov 16, 19:34 EST): pass.** Upload, draft preview, publish, recipient playback, AR placement, background removal, audio and Replay all passed. Unpublish passed too: refreshing the recipient link then showed "greeting unavailable".
- Not reported: whether the recipient side was a second phone or a signed-out browser; detailed edge/flicker/sync notes. iOS untested (deferred).

### G3 hosted state (Nov 16)
- Supabase project `webar-greetings` (ref `jqgxymyyxuozmvbujixs`, us-east-1). Migration applied via the Management API. Auth: email on, Confirm email **on**, Site URL `https://web-ar-gold.vercel.app`, redirect allow-list `https://web-ar-gold.vercel.app/**`, `https://*-jc-fractal-studios.vercel.app/**`, `http://localhost:5173/**`. Allowlisted creators: `jcfractal2012@yahoo.com` (the account Juan uses, confirmed) and `juan@jcfractal.com` (unused).
- New Supabase projects no longer grant table privileges to `anon`/`authenticated`/`service_role` by default. The migration now grants them explicitly (`4a2b4b6`). Without that, `api/greeting` returned 502 `lookup-failed`.
- Vercel `web-ar` (`prj_xFo9OOOefZJpx4f6S4XAjUD2RclB`, team `team_SBqpKAEMAXH5ZRcXOZlZkKb6`). Env vars are set for **Preview, branch `devin/g3-creator` only**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (sensitive). **Production** (all branches → production target) also set Nov 16, before merge: the same four vars plus `VITE_GREETING_BASE_URL=https://web-ar-gold.vercel.app/`. They are live since the production deploy of `d12b269`. Juan turned Vercel Authentication off.
- Preview: `https://web-ar-git-devin-g3-creator-jc-fractal-studios.vercel.app/?create`. Signed-out access verified with curl and a fresh browser context.
- Hosted E2E (desktop Chrome via CDP against that preview and the real project; temporary confirmed users created via the admin API and deleted afterwards): **16/16 pass**. Covered: sign-in; upload with progress → private draft with `video_format=packed`; second user can't read/publish/sign; non-allowlisted user can't upload; anonymous table/storage listing empty; the API hides the draft (404); publish → link + QR PNG; signed-out recipient plays the 1440-wide packed cutout; unpublish stops it; delete removes row + file; `?exp=neon-garden` loads.
- At merge: Production env vars are already in place; the merge deploy of `main` applies them. Supabase Auth Site URL is `https://web-ar-gold.vercel.app` and the redirect allow-list covers production, `*-jc-fractal-studios.vercel.app` previews and localhost. Built-in Supabase email is limited to 2 confirmation emails/hour; add custom SMTP before inviting more creators.

### G3 setup (once per project; no secrets in Git)
1. Create a dedicated Supabase project (e.g. `webar-greetings`). Auth → Providers → Email: enable it and **keep "Confirm email" on**. `is_creator()` requires a confirmed address; with auto-confirm, anyone could register an unused allowlisted email. Auth → URL configuration: set the Site URL to production and add the preview domain(s) to the redirect URLs, because the confirmation link returns to `?create`.
2. Apply the migration in the SQL editor (or via the Management API `POST /v1/projects/{ref}/database/query`).
3. Allow a creator: `insert into public.creator_emails values ('<email, lowercase>');`
4. Vercel project `web-ar`, env vars for Preview (+ Production when merged):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public, built into the client);
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by `api/greeting.ts`);
   - optionally `VITE_GREETING_BASE_URL`.
   Then redeploy.
5. Vercel Deployment Protection: off for previews, or recipients get a Vercel sign-in page instead of the greeting.
6. Local dev: `cp .env.example .env.local`, fill it in, `npm run dev`; or `npx supabase start` + `supabase db reset` for a fully local stack.

### G3 next steps (exact)
1. Done Nov 16: hosted project, migration, allowlist, preview env vars, signed-out access (see hosted state).
2. Done Nov 16: S24 creator → publish → open → AR place → play with audio → Replay passed.
3. **Done Nov 16:** #8 → #9 → #10 merged (merge commits). Production deploy of `d12b269` Ready. Hosted E2E against production 16/16: sign-in, upload progress → private `packed` draft, second account blocked (rows/publish/sign), non-allowlisted upload refused, anon table/storage empty, draft hidden from `/api/greeting`, published link `https://web-ar-gold.vercel.app/?g=…`, QR PNG download (QR generated from that link; image not decoded), signed-out playback, unpublish, delete (row + file), particle page. Also: `/api/greeting` 404 `not-published` / 400 `invalid-link`; service-role key absent from the production bundle; gallery, the three greeting test pages, Neon Garden and Cosmic Vortex load without page errors (desktop Chrome, no WebXR). Test users/data removed; only Juan's account and his published `fb9e397da3fd` remain.
4. **Done Nov 16:** production S24 test passed (Juan): placement, background removal, playback, audio and Replay all worked. Still open: G1 check 8 particle AR + ARCore version.
5. **Open review findings (PR #10, escalated):** (a) removing an address from `creator_emails` doesn't stop that owner publishing existing drafts. Fix with a migration adding `is_creator()` to the update policy when `status = 'published'`. (b) Video metadata/readiness is validated in the browser only. Have G4's server worker set `video_*` and publication readiness. Rejected as MVP edge cases: orphaned uploads/rollback after lost responses; pinned base URL vs draft preview (only Production pins it, to the same origin).
6. Supabase built-in email sends at most 2 confirmation emails/hour. Add custom SMTP before inviting more creators.
7. Next milestone: G4, now built and mock-tested; see the G4 section for the exact pre-merge steps. Paid runs still need Juan's approval; then G5 templates/polish.

## G4 — automatic processing (mock-tested, Nov 17; branch `devin/1794878050-g4-processing`)
Juan's instruction (Nov 16, 20:13 EST): stay on Supabase Free, enforce the real 50 MB limit, upload directly to private Supabase Storage, benchmark normalize + pack first without fal, never blindly resubmit an uncertain fal submission, reserve budget for in-flight jobs. **Not authorized yet: Supabase upgrade, new hosting account, paid fal runs.** Everything below runs against mocks; integration with real fal is incomplete by definition.

### Timing spike (Vercel preview function, iad1, no fal call; commit `c5209f9`)
Function: 2 vCPU, ~2,279 MiB memory, ~513 MiB free `/tmp`, bundled `ffmpeg-static` (~80 MB), x264 `veryfast`, normalize and pack as separate calls.
| Clip | Normalize (ffmpeg / whole call) | Pack (ffmpeg / whole call) | Peak RSS ffmpeg / Node |
| --- | --- | --- | --- |
| Juan's G2 clip: 43,245,518 B, 3840×2160 HEVC, rotation −90, 8.56 s | 35.3 s / 39.6 s | 15.7 s / 20.2 s | 294–376 MiB / 117–119 MiB |
| Synthetic worst case: ~46 MB, 2160×3840 HEVC, 30 s | 78.5 s / 81.8 s | 50.9 s / 59.4 s | 335–367 MiB / 160–169 MiB |
Validation passed on both: upright 720×1280 at 30 fps (257 and 900 frames), packed 1440×1280 with the same frame count, AAC audio byte-identical to the source (Juan's clip MD5 `9e1d6324c2de6b81922f179fbcb108ca`), duration delta 0, matte non-blank. The spike function (`api/spike-media.ts`) has since been removed; the shared code lives in `api/_lib/media.ts`. Caveat: `veryfast` output has not been checked on the S24.

### What is built
- **Schema** `supabase/migrations/20261117000000_g4_processing.sql` (applied locally only): server-owned `greetings.media_state/media_error/media_checked_at`, `source_kind` (`prepared`|`ordinary`), `source_path`; `processing_settings` (kill switch, $1.00/day budget, 5 attempts/creator/day, rates); `processing_jobs` (unique `(greeting_id, attempt)`, idempotency key, provider request id/urls, leases, `version` for optimistic updates, one active job per owner); private `greeting-work` bucket; `reserve_processing()` (advisory lock, counts `max(reserved, cost)` of unfinished jobs, so in-flight work holds budget); `greetings_guard()` rewritten so clients can't set media fields, a published greeting needs a **current** creator (fixes PR #10 finding a), and, once `enforce_trusted_media` is switched on, a server-verified video (fixes finding b). `enforce_trusted_media` defaults to **false** so the G3 flow keeps working until it is switched on.
- **Server** (`api/process.ts`, `api/fal-webhook.ts`, `api/_lib/*`): `start/retry → tick → cancel/verify/delete`. Each `tick` does at most one step: normalize → upload to `greeting-work` → reserve budget → submit → poll/webhook → download matte into `/tmp` (never stored: a real 30 s ProRes matte is ~58 MB) → pack + validate (frames, size, audio MD5, matte non-blank) → store packed MP4 → `ready`; source and temp files are deleted afterwards. Server-side rules (`api/_lib/rules.ts`): ≤ 52,428,800 bytes, 3–30 s, readable MP4/WebM; prepared uploads are re-checked by the server (`verify`).
- **fal handling** (`api/_lib/provider.ts`, `webhook.ts`): queue submit with webhook URL `…/api/fal-webhook?job=&attempt=`; explicit 4xx = rejected (reservation released); timeout/network/5xx/malformed = **uncertain**: the job keeps its reservation, is never resubmitted, waits up to 30 min for a webhook naming the request, then fails charging the reservation. Webhooks are verified (ED25519 via fal JWKS, ±300 s timestamp, raw-body SHA-256), idempotent, and checked against job/attempt/request id; late webhooks never revive failed, cancelled, deleted or superseded jobs. Polling every 15 s is the fallback; a submitted job times out after 60 min.
- **Mock provider** (`MOCK_PROVIDER_MODE` = `ok`|`fail`|`reject`|`uncertain`): no network, makes an ellipse matte. Disabled on `VERCEL_ENV=production`, so production can never publish a placeholder cutout.
- **Creator UI** (`src/greetings/creator.ts`): ordinary upload behind `VITE_ORDINARY_UPLOAD=1` (off in production), client prechecks (50 MiB, 3–30 s), upload progress, stage text (step 1–3), recovery after reload, Cancel processing, Try again, Publish disabled until `media_state = ready`. Delete now goes through the server so provider requests and all files are cleaned up.

### Tests (no fal calls)
- `npm test`: 31/31 (state machine, leases, uncertain/no-resubmit, polling, cost, 50 MiB boundary, duration/format rules, fal response parsing, webhook signature valid/tampered/stale/wrong-key/missing, mock modes).
- `npm run test:int` against local Supabase: 10/10 (full mock pipeline, client can't fake `ready`, revoked creator can't publish, prepared verification gate, uncertain submit adopted by webhook with one submit, give-up charging the reservation + late webhook ignored + retry with new idempotency key, in-flight budget refusal before submit, per-creator quota, kill switch, one active job, provider fail/reject, cancel, cross-owner 404s, delete cleans rows and files, bucket refuses 52,428,801 B, bounded download, junk source refused, unsigned webhook 401).
- Desktop Chrome on local Vite + local Supabase: G3 regression E2E 32/32 (prepared flow unchanged apart from the new server check); G4 ordinary E2E 14/14 (50 MiB refusal, upload progress, stages, reload recovery, publish gating, signed-out recipient plays the 1440×1280 output, cancel → Try again, delete, Cosmic Vortex loads). Bug found and fixed: a repeated `SIGNED_IN` event re-rendered the list and left the processing loop updating a detached list.
- Not done: hosted preview, real fal run, S24 test of an automatically processed greeting, iOS (deferred).

### Before merging (exact)
1. Apply `20261117000000_g4_processing.sql` to the hosted project `jqgxymyyxuozmvbujixs` **before** merging: the new code reads `media_state` and calls `/api/process` for verify/delete, so production would break without it. The migration is additive and keeps the G3 flow working (`enforce_trusted_media = false`, ordinary upload hidden).
2. After the merge deploy: run the prepared-upload smoke (upload → verify → publish → signed-out open → delete) on production, then switch on `enforce_trusted_media` and re-check publishing. Rows that existed before the migration are grandfathered as `media_state = 'ready'`; Juan's existing greeting can be re-checked with `verify` if wanted.
3. Juan's decisions still pending: number of paid fal runs allowed. To go live: set Vercel env `PROCESSING_PROVIDER=fal`, `FAL_KEY` (sensitive), optionally `PROCESSING_WEBHOOK_BASE=https://web-ar-gold.vercel.app`, and `VITE_ORDINARY_UPLOAD=1`; keep the fal dashboard spend limit as the hard cap.
4. Then the G4 acceptance run: three real ordinary recordings (1080p, ≤ 30 s, ≤ 50 MB) through upload → processing → preview → publish → signed-out QR → S24 AR.

### Known limits
- Progress is driven by the creator page (`tick` loop) plus the fal webhook (which also triggers packing). If the webhook is lost and the page is closed, the job continues next time the creator opens `?create`; stale jobs time out. No cron (Vercel Hobby cron runs once a day).
- 4K phone recordings hit 50 MB after ~10 s; creators should record at 1080p.
- The fal adapter follows fal's documented queue/webhook contract but has never talked to fal.

## Milestone tracking
| Milestone | Code/status | Browser checks | Phone checks | PR / commit |
| --- | --- | --- | --- | --- |
| G1 video placement | Complete on Android; merged to main (a080019). Diagnostics and probe kept behind URL flags | typecheck/build/`npm test` 12/12; headless CDP smoke 68/68 (no WebXR) | S24: checks 1–7 pass; check 8 voice part pass, particle AR + ARCore version not recorded. iOS untested (deferred) | PR #8, tested tip 67a13fb |
| G2 cutout/format proof | Accepted on Android (Nov 16), merged to main (cfdd342): player `packed`/`alpha` modes, `scripts/g2/cutout.py`, synthetic fixtures; one fal run on Juan's real clip ($0.032) | typecheck/build/`npm test` 15/15; headless desktop Chrome renders both synthetic cutouts | Real clip: alpha WebM works in AR (Juan, Nov 16); packed MP4 pending | PR #9 (base `devin/g1-video-placement`), branch `devin/g2-cutout` |
| G3 creator MVP | Passed on Android (Nov 16); merged to main (d12b269), live in production: Supabase auth/storage, private drafts, explicit format, publish/unpublish, link + QR, recipient `api/greeting` | typecheck/build/`npm test` 19/19; local-Supabase desktop Chrome E2E 32/32 ; hosted preview E2E 16/16 | S24 pass (Juan, Nov 16): published greeting opens, AR places, cutout, audio, Replay | PR #10 (base `devin/g2-cutout`), branch `devin/g3-creator` |
| G4 automatic processing | Built, mock-tested; hosted migration not applied; no paid fal runs | `npm test` 31/31; local-Supabase integration 10/10; local desktop E2E G3 32/32 + G4 14/14 | Not run | Branch `devin/1794878050-g4-processing` (PR pending) |
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
| 2026-11-14 | Android-first; iPhone milestone deferred, iOS recorded as untested | Juan has no iPhone; Devin access ends 2026-11-17. iPhone work must not block G2/G3 |
| 2026-11-14 | G2 starts from the tested G1 code on a new branch; PR #8 merge stays with Juan | Keeps G1 reviewable on its own |

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
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 7, real page, synthetic clip: Background = Chroma key in AR, Tolerance/Edge softness adjusted | Green removed in AR; drawn figure and text box preserved; no obvious green halo. PASS (synthetic drawn clip only; says nothing about real hair or edge quality) | Juan; screenshot |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 8 (part): particle voice response on production | Voice response works after recalibrating in silence; calibration resolved what Juan observed. No sensitivity changes; current audio defaults kept (audio tuning stays frozen) | Juan |
| G1 2026-10-30 | S24 Ultra / Chrome 156 | Acceptance check 8 (rest): Neon Garden and Cosmic Vortex AR placement on production; ARCore version | Not yet recorded (non-blocking for G2) | Juan |
| G3 2026-11-16 | Desktop Chrome (cloud VM), no WebXR | Production https://web-ar-gold.vercel.app/ at `d12b269`: hosted E2E (creator → draft → publish → link/QR → signed-out play → unpublish → delete, ownership/anon denial) + gallery, greeting test pages, Neon Garden, Cosmic Vortex | 16/16 pass; pages load without errors. Not device evidence | Devin |
| G3 2026-11-16 | S24 Ultra / Chrome | Production https://web-ar-gold.vercel.app/ greeting | Placement, background removal, playback, audio and Replay. PASS | Juan |
| 2026-11-14 | iPhone / iOS Safari | Ordinary playback fallback, AR | **Not tested**: no device available; iPhone milestone deferred by Juan | — |

Add video decode/format, audio start/middle/end, keying/matte edges, Reset/Exit/re-entry, QR signed-out launch and iPhone fallback rows as they are actually tested. Never carry historical particle success forward as proof that video works.

## Environment inventory — fill when configured
| Resource | Identifier / nonsecret setup reference | Environment | Status |
| --- | --- | --- | --- |
| Vercel project | `jc-fractal-studios/web-ar`; posts per-branch previews on PRs | Existing demo + PR previews | Preview for PR #8 ready; protected by Vercel login |
| Auth / DB | Dedicated Supabase project (to be created by Juan); schema `supabase/migrations/20261116000000_greetings.sql` | G3 preview → production | `webar-greetings` (ref `jqgxymyyxuozmvbujixs`) configured Nov 16 |
| Object storage | Supabase Storage private bucket `greeting-videos` (created by the migration) | G3 | Created on the hosted project Nov 16 |
| Processing API/worker | fal.ai `fal-ai/birefnet/v2/video` via `fal-client`; secret name `FAL_KEY` | G2 experiment, run from the Devin VM | Session-only key provided Nov 16 (topped up by Juan); one run, $0.032 |
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

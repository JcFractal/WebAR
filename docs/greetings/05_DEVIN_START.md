# First Devin assignment — G1 video placement
Attach this planning pack to the existing Devin WebAR project/session, then paste the assignment below.

---

Continue my existing WebAR project: https://github.com/JcFractal/WebAR.
Existing production demo: https://web-ar-gold.vercel.app/.

We are starting AR Greetings: a creator eventually uploads a short recording, our app removes the background, and the recipient scans a QR and places/plays the greeting in their room. Start with Android / Samsung S24 Ultra Chrome. Preserve the two particle experiences and their exact links.

I attached six Markdown planning files. Put them under docs/greetings/ using their existing filenames. Read repository AGENTS.md instructions if present, then all six files. For greeting work, 02_MVP_SPEC.md and 03_BUILD_PLAN.md define the new product scope; the old hackathon SPEC.md and DEVIN_RUNBOOK.md still document the existing demo. Append cross-links and correct the stale root README status rather than discarding history.

The planning snapshot observed main at accf90a1b6b968001edfbfb8e71314b994bacdd7, which merged PR #7. Fetch current refs and inspect open work before choosing a branch. Do not reset to that historical commit or overwrite existing work.

Implement only G1, “prove video in the current player,” from 03_BUILD_PLAN.md:
- A separate validated video config/template beside swarm. Reuse src/xr/ar.ts for an upright, bottom-aligned plane.
- Local MP4 selection so I can privately try my own video immediately. Explain that this local selection is temporary and not a persistent/shared upload.
- Opaque and chroma-key playback with configurable key color, tolerance and soft edges. No automatic background removal yet.
- Display size, bottom height offset and loop setting, with sensible defaults.
- First-frame protection and recoverable loading/playback errors; no blank rectangle flash.
- Play/Pause, Replay and sound controls; handle mobile user-gesture restrictions explicitly.
- Enter AR → scan → place → play with sound; Reset, Exit and re-entry. No microphone request for a video greeting.
- One renderer/animation loop per active experience; clean up media, object URLs, textures, listeners and XR on replacement/exit/dispose.
- Ordinary browser preview when AR cannot run. Do not promise iPhone ground tracking.
- If a permitted public video fixture is available, add a test config/link/QR. Otherwise use a clearly labeled synthetic fixture or document the missing media; do not publish personal footage or pretend a local blob URL can be shared.

Avoid a framework migration or broad particle refactor. No accounts/backend, persistent uploads, paid processing integration, birthday template or iPhone tracking engine in G1. Those have later milestones.

Use one new branch and a focused PR; do not push directly to main or merge/deploy to production. Run npm ci, npm run typecheck and npm run build, plus focused checks for config/backward compatibility and the new media lifecycle. Smoke-test both original experiences, gallery and unknown-ID behavior. A build or headless test does not prove video AR works on my phone.

Update docs/greetings/04_HANDOFF.md with exact branch/commit/PR, preview deployment linkage, changes, tests, blockers and next action. Clearly separate code inspection, simulated/browser checks, real video processing (none in G1), and tests I still need to perform on the S24.

Send the PR/preview as soon as G1 is reviewable, provide a short phone checklist, and stop before G2. If you lack my video, implement what you can with a non-personal fixture/local selector and tell me the exact accepted format to supply. Do not claim the full greeting MVP is complete.

I may later continue in ChatGPT/Codex, so leave the repository and handoff complete enough for another coding agent to resume without this conversation.

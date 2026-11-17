# AR Greetings — MVP planning pack
Version 1.0 · October 29, 2026 · Owner: Juan Carlos Gallo / JC Fractal Studios

## The product
Record a personal message on a phone, upload it, preview yourself with the background removed, and publish a link and QR code. The recipient opens it without an account and, on a supported Android phone, places the greeting in their room and hears the original recording.

The first release is a private creator alpha for Juan and invited testers. A small Birthday template adds a name, a heading, and restrained confetti. The person remains a flat video cutout; this is not volumetric capture.

## Read these files
| File | Purpose |
| --- | --- |
| [01_CURRENT_STATE.md](01_CURRENT_STATE.md) | Verified repository baseline, user-reported phone results, gaps, and reuse points |
| [02_MVP_SPEC.md](02_MVP_SPEC.md) | Product scope, creator/recipient flows, architecture, and completion criteria |
| [03_BUILD_PLAN.md](03_BUILD_PLAN.md) | Five milestones with acceptance checks and next-task prompts |
| [04_HANDOFF.md](04_HANDOFF.md) | Living status, device evidence, decisions, and switching agents |
| [05_DEVIN_START.md](05_DEVIN_START.md) | First assignment to paste into Devin |

## Start
1. Attach this whole folder or its ZIP to the existing Devin project/session for https://github.com/JcFractal/WebAR.
2. Paste the contents of 05_DEVIN_START.md.
3. Devin installs these six files under `docs/greetings/` in a new branch and implements only G1.
4. Review its PR, then test the preview on the S24. G1 includes a local-file selector so Juan can immediately try an MP4 without storage setup. Local selection is temporary and does not produce a shareable upload.
5. After the G1 phone check, assign G2 from the build plan.

No application code, repository files, deployments, provider accounts, or backend resources were changed while producing this pack. Repository reads established the baseline. These documents become tracked project documentation when Devin installs them.

## Scope authority
For greeting work, 02_MVP_SPEC.md defines the new scope and 03_BUILD_PLAN.md defines the sequence. They explicitly permit the uploads, authentication, database, and processing that the old hackathon SPEC.md excluded for the event.

The root SPEC.md and DEVIN_RUNBOOK.md remain historical requirements for the existing particle experiences. Their implementation constraints that still apply—independent web code, working existing links, meaningful phone tests—remain useful. Event deadlines and obsolete exclusions do not govern this product phase. Add links from the root documents rather than deleting their history.

Existing user instructions and repository AGENTS.md instructions take precedence. Implement only the currently assigned milestone.

## Delivery ladder
| Result | What Juan can do |
| --- | --- |
| G1: video player | Select a prepared local video and place/play it on the S24; use a hosted fixture for a test QR |
| G2: cutout proof | See real ordinary recordings processed and replayed through the actual player |
| G3: persistent creator app | Sign in, upload a prepared video, preview it, publish it, and open its stable QR on another phone |
| G4: recorded-greeting MVP | Upload an ordinary recording and let the app remove the background and publish the result |
| G5: private alpha | Choose Plain or Birthday, manage greetings, and complete a small recipient trial |

## Planning estimate
Budget roughly 1–2 focused development days for G1; roughly 3–5 days cumulatively to reach a prepared-video upload-to-QR prototype; roughly 6–10 focused development days for the full private alpha if the processing experiment succeeds and service access is available. Allow additional calendar time for phone tests, accounts, and iteration. These are engineering planning ranges, not promises of agent turnaround; they revise the earlier rough estimate by including publishing reliability and a small template.

This estimate excludes equivalent iPhone ground placement, a public subscription service, and running a production GPU fleet. The iPhone fallback is a normal browser greeting preview; test it on a real iPhone before claiming compatibility.

## What Juan supplies
- One 10–15 second MP4 that is safe to share for G1. A prepared green-screen video is useful, but a normal MP4 can prove opaque video playback first.
- Three short ordinary greeting recordings for G2: plain background, some hand motion/hair detail, and a moderately busy background. Use adults who consent to the test. Keep them private unless explicitly designated as public samples.
- S24 Ultra / Chrome phone tests. An iPhone tester is needed for the fallback check.
- Backend/processing credentials through secret configuration when those milestones need them. Nothing secret belongs in a prompt attachment or Git.

## Working rhythm
One active coding agent and one focused PR per milestone. Report code checks separately from real-phone evidence. Use preview deployments for review; keep personal clips out of public demo listings. Update 04_HANDOFF.md at every stop so Devin, ChatGPT/Codex, or a human can continue from GitHub.

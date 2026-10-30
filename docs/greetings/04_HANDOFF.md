# AR Greetings — living handoff
Last updated: October 29, 2026
Update this file in every implementation PR and before pausing or switching tools.

## Current status
- Stage: planning complete; greeting implementation has not started.
- Active agent: none assigned yet; Devin is the intended first implementer.
- Current authorized next assignment: G1 from 03_BUILD_PLAN.md / 05_DEVIN_START.md.
- Repository: https://github.com/JcFractal/WebAR
- Observed baseline main: accf90a1b6b968001edfbfb8e71314b994bacdd7.
- Greeting branch / commit / PR: not created.
- Greeting preview deployment / deployed commit: not created.
- Existing production URL: https://web-ar-gold.vercel.app/ — historical project address; not rechecked live during planning.
- Backend project, schema and storage: not configured.
- Processing provider and media format: undecided; G2 owns the decision.
- Credentials: none supplied or created in this planning task.
- Personal test clips: none supplied in this task.
- Current blocker: none for implementing G1 code and a local-file selector; real media/device evidence requires Juan's test input.
- Next concrete action: attach the planning pack to Devin and run 05_DEVIN_START.md.

## Milestone tracking
| Milestone | Code/status | Browser checks | Phone checks | PR / commit |
| --- | --- | --- | --- | --- |
| G1 video placement | Not started | Not run | Not run | — |
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

## Latest implementation report — fill after each milestone
- Timestamp and implementer:
- Branch:
- Commit:
- PR:
- Preview URL:
- Preview deployed commit:
- Release URL and independently checked deployed commit:
- Changes and reason:
- Commands actually run and results:
- Browser/simulated tests actually run:
- Real provider calls and measured result:
- Real phone tests reported by Juan/tester:
- Remaining failures / limitations:
- Relevant config variable names and setup location (never values):
- New migrations and whether applied:
- Exact next assignment:

## Device evidence log
| Date | Device / OS / browser | Feature and test | Result | Reporter / evidence |
| --- | --- | --- | --- | --- |
| Historical hackathon | S24 Ultra / versions unrecorded / Chrome | Neon Garden placement, walk-around, mic and Reset | User reported working | Juan; supplied conversation |
| Planning 2026-10-29 | No device | No new physical tests | Not tested | Planning session |

Add video decode/format, audio start/middle/end, keying/matte edges, Reset/Exit/re-entry, QR signed-out launch and iPhone fallback rows as they are actually tested. Never carry historical particle success forward as proof that video works.

## Environment inventory — fill when configured
| Resource | Identifier / nonsecret setup reference | Environment | Status |
| --- | --- | --- | --- |
| Vercel project | Existing project; inspect current repo connection | Existing demo | Not inspected live in planning |
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

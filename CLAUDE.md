# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**`AGENTS.md` is the canonical engineering document for this repo — read it
before making any change.** It contains the system map, the invariants (I1–I10),
the deployment asymmetry rules (the backend does NOT deploy from git), the
SHARED SCHEDULER sync procedure, workflows, and runbooks. It is imported below.

@AGENTS.md

Quick facts for orientation (details and rationale live in AGENTS.md and
`docs/DECISIONS.md`; known issues and designed improvements in `docs/BACKLOG.md`):

- Tests: `npm test` (Node built-in runner, zero dependencies). Syntax gate:
  `node --check script.js scheduler.js google_apps_script.js` (one at a time).
- The scheduling algorithm lives in `scheduler.js` inside the
  `SHARED SCHEDULER` marker block, which must stay byte-identical to its copy
  in `google_apps_script.js` — edit it in `scheduler.js` only, then copy it
  over verbatim; `tests/parity.test.js` enforces this.
- Any change to `google_apps_script.js` requires bumping `BACKEND_VERSION` and
  a manual redeploy by the owner (runbook R-A) — say so in your summary.
- UI text is Traditional Chinese (Taiwan). Chinese docs are canonical;
  `*_EN.md` are derived.

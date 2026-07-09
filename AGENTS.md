# AGENTS.md — Operating Manual for AI Agents

This is the **canonical** engineering document for this repository. `CLAUDE.md`
points here. Read this before changing anything. Audience: AI coding agents
(Claude, Codex/GPT, etc.) and future maintainers.

---

## 1. What this is — and the philosophy you must preserve

MO 旅醫門診排班系統: a duty roster for a travel-medicine clinic that operates
**Wednesdays only** (AM + PM). A handful of doctors, one admin, Traditional
Chinese (Taiwan) UI.

The architecture is deliberately primitive: static HTML/CSS/vanilla JS on
GitHub Pages, one Google Apps Script (GAS) file as the API, a Google Sheet as
the database. Zero hosting cost, zero build step, zero dependencies.

**Simplicity is the load-bearing feature.** Before adding a framework, bundler,
package, or abstraction, assume the answer is no. The correct fix is almost
always a small amount of plain code plus a test. If you believe heavier tooling
is justified, add an entry to `docs/BACKLOG.md` with the trade-off analysis and
ask the owner — do not just do it.

## 2. System map

| File | Role |
|---|---|
| `index.html` | Static SPA shell; all modals live here |
| `style.css` | All styling; CSS vars in `:root`; mobile = Wednesday-card layout at ≤900px |
| `scheduler.js` | **Canonical scheduling algorithm** (pure, unit-tested). Browser global `Scheduler`; `require()`-able in Node |
| `script.js` | All UI logic + API calls. Loads after `scheduler.js` |
| `google_apps_script.js` | Entire backend. Pasted into Apps Script manually (see §4) |
| `tests/scheduler.test.js` | Behavioral spec of the algorithm |
| `tests/parity.test.js` | Enforces the shared-block sync rule (§5) |
| `docs/DECISIONS.md` | Why things are the way they are. Update when you change a norm |
| `docs/BACKLOG.md` | Known issues + designed-but-not-built improvements. Check before starting work |

Database = 4 tabs in the bound Google Sheet:
`Users` (Name, Limit, Email) · `Constraints` (User, Date, Slot) ·
`Schedule` (Key, Assigned User) · `Holidays` (Date).

API: `doGet` → all data + `version`. `doPost` dispatches on `action`:
`addUser`, `deleteUser`, `editUser`, `addConstraint`, `removeConstraint`,
`saveSchedule`, `addHoliday`, `removeHoliday`, `sendReminders`.

## 3. Invariants — do not break these

- **I1 · Schedule keys**: flat map `"YYYY-MM-DD_AM"` / `"YYYY-MM-DD_PM"` → doctor name. Dates always zero-padded via `formatDate()`.
- **I2 · Unassigned sentinel**: write `UNASSIGNED` (`"未安排"`); read with `isUnassigned()` (also accepts legacy `"Unassigned"`). Never compare against either literal directly — sessions before this rule existed shipped real bugs that way.
- **I3 · Client is source of truth on save**: `saveSchedule` clears and rewrites the whole Schedule tab from the client's map. Consequence: concurrent editors can silently overwrite each other (accepted risk, see D-02; mitigation designed in BACKLOG B-03).
- **I4 · `limit` is a hard cap**: the algorithm never relaxes it to fill a slot. Empty slots are surfaced instead (red UI + email note via `getUnassignedSlots`/`formatUnassignedNote`).
- **I5 · Algorithm determinism**: fairness queue = this-year duty count ascending (excluding target month), ties broken by `localeCompare` on name; round-robin to back of queue; same-day AM/PM exclusion; holidays clear both slots. Tests depend on this determinism — no randomness.
- **I6 · Optimistic UI pairing**: every mutation takes `snapshotState()` first, updates state + re-renders, `await postData(...)`, and calls `restoreState(snap)` on falsy result. Never add a mutation without the rollback half.
- **I7 · XSS discipline**: user-controlled strings (names, emails) reach the DOM only via `textContent`, `createTextNode`, or the `.title` property — never interpolated into `innerHTML`.
- **I8 · Language**: UI strings and email bodies are zh-TW. `README.md`/`USER_GUIDE.md` (Chinese) are canonical; `*_EN.md` are derived translations — update Chinese first.
- **I9 · Duplicate constraint prevention exists on both client and server** — keep both.
- **I10 · Timezone**: all date math assumes the GAS project timezone is `Asia/Taipei` (Apps Script editor → Project Settings). If cron emails or dates ever look shifted by a day, check this first.

## 4. The deployment asymmetry — most important operational fact

**The repo and the deployed backend are different artifacts.** GitHub Pages
serves `main` automatically (~1 min after merge). `google_apps_script.js` does
NOT deploy from git: a human must paste it into the Apps Script editor and
create a new deployment version. Therefore:

- **R1**: Any PR touching `google_apps_script.js` must bump `BACKEND_VERSION`
  (top of file) and state "backend redeploy required" in its description.
- **R2**: Deploys are always **full-file replacement** — never paste fragments.
- **R3**: To check for drift, fetch the API and compare: the JSON from `doGet`
  echoes `version`; the browser console also logs it on every page load.
  If deployed version < repo version, the backend is stale.
- **R4**: There is **no staging environment**. Opening `index.html` locally
  hits the **production** API and real data. When testing locally, do not
  press destructive buttons (清除整年班表, 一鍵排班 on a month with real data,
  發送通知信 — the last one emails real doctors).

## 5. The SHARED SCHEDULER block

GAS cannot import local files, so the algorithm exists twice — but the copies
are **mechanically locked together**:

- Both `scheduler.js` and `google_apps_script.js` contain a block delimited by
  `// ===== BEGIN SHARED SCHEDULER (sync-guarded) =====` and
  `// ===== END SHARED SCHEDULER =====`.
- `tests/parity.test.js` fails unless the blocks are **byte-identical**, and
  additionally executes the GAS copy against the canonical module.
- **Procedure for algorithm changes**: edit the block in `scheduler.js` →
  add/adjust cases in `tests/scheduler.test.js` → copy the whole block verbatim
  into `google_apps_script.js` → `npm test` → bump `BACKEND_VERSION` → remind
  the owner to redeploy.
- The block must stay dependency-free (no DOM, no `SpreadsheetApp`, no
  outer-scope references) and is deliberately unindented inside the
  `scheduler.js` factory to keep byte-identity possible.

## 6. Change workflow

1. Branch from fresh `origin/main`; one branch per task. Never stack new work
   on a branch whose PR already merged — reset it on latest main first.
2. Make the change; obey the invariants; match surrounding code style
   (vanilla JS, 4-space indent, zh-TW strings).
3. `npm test` and `node --check` on every JS file you touched.
4. Update docs in this order when applicable: `docs/DECISIONS.md` (norm
   changed), `docs/BACKLOG.md` (issue found/fixed), `README.md`/`USER_GUIDE.md`
   zh first (user-visible behavior changed), then `*_EN.md`.
5. PR using the template checklist; state deployment impact explicitly.
6. After a backend merge, the work is NOT done until the owner redeploys —
   say so in your final summary every time.

## 7. Verification playbook

- `npm test` — algorithm spec + parity. This is the only automated safety net;
  keep it green and extend it with every rule change.
- `node --check <file>` — cheap syntax gate for all three JS files (no build
  step means nothing else catches a typo before runtime).
- Manual smoke test: `python3 -m http.server` in the repo root, open the page.
  **Remember R4 — this is production data.** Safe checks: navigate months,
  open modals, hover tooltips. Unsafe: anything that writes.
- CI (`.github/workflows/test.yml`) runs the same checks on every PR/push.

## 8. Runbooks

**R-A · Deploy backend**: bump `BACKEND_VERSION` → copy all of
`google_apps_script.js` over Code.gs in the Apps Script editor → save →
Deploy → Manage deployments → Edit → Version: New version → Deploy →
reload the web page and confirm the console logs the new backend version.
(Manage-deployments/Edit keeps the URL; a brand-new deployment changes it and
requires updating `API_URL` in `script.js` — avoid unless intended.)

**R-B · From-scratch setup**: new Google Sheet → Extensions → Apps Script →
paste file → run `setup()` once → run `createMonthlyTriggers()` once → run
`createBackupTrigger()` once → Deploy as Web app (Execute as: Me / Access:
Anyone) → put the Web App URL into `API_URL` in `script.js`. Verify project
timezone = Asia/Taipei (I10).

**R-C · Enable the write-auth gate** (currently disabled by decision D-07):
uncomment the token check in `doPost`, restore `getAuthToken()` +
`PUBLIC_ACTIONS` in `script.js` `postData` (see git history around the commit
"disable the admin-password gate"), set the password via `setApiToken()`,
redeploy. Keep the two `PUBLIC_ACTIONS` lists identical.

**R-D · Data recovery**: two layers. 1) Weekly automatic backups: Drive files
named `RosterBackup_YYYY-MM-DD` (newest 8 kept; created by `weeklyBackup`,
Mondays 02:00 — requires `createBackupTrigger()` to have been run once).
2) The Sheet's own File → Version history. A bad `saveSchedule` is recoverable
either way; tell the owner immediately rather than attempting silent repair.

**R-E · Cron triggers**: three time-based triggers: `autoSendReminderEmail`
(1st, 01:00) and `autoGenerateSchedule` (5th, 01:00, schedules the NEXT month,
skips if the target month already has real duties), installed by
`createMonthlyTriggers()`; `weeklyBackup` (Mondays, 02:00), installed by
`createBackupTrigger()`. Inspect/delete under the clock icon in the Apps
Script editor.

**R-F · "Manual and automatic schedules differ" diagnosis**: 1) parity test
green? 2) deployed `version` = repo `BACKEND_VERSION`? (usually the answer)
3) did constraints/users change between the two runs? Fairness seeding makes
results time-sensitive by design.

## 9. Security & data posture (deliberate, owner-approved)

- Reads AND writes are open to anyone with the API URL — and the URL is public
  in this repo. The auth mechanism exists but is disabled (D-07). Data is
  doctors' names, emails, and shifts.
- `sendReminders` (mass email to all doctors; MailApp consumer quota ≈ 100
  recipients/day) is rate-limited to one send per hour server-side (D-13) —
  that limit is the only thing standing between the public URL and the mail
  quota, so never remove it casually.
- Do not silently re-enable auth or add security friction; propose via
  BACKLOG/PR instead. If you find evidence of actual abuse, alert the owner
  and recommend R-C the same day.

## 10. Where knowledge lives

- **Why** → `docs/DECISIONS.md` (numbered D-xx, cited throughout this file).
- **What's next / known-broken** → `docs/BACKLOG.md` (numbered B-xx,
  prioritized, each with a design sketch — read it before proposing "new"
  ideas; yours may already be designed there).
- **Behavioral spec** → `tests/scheduler.test.js` (the algorithm's rules as
  executable statements; extend it whenever rules change).
- **History** → git log is clean and descriptive; `git log --oneline -- <file>`
  before rewriting anything non-obvious.

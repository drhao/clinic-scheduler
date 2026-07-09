# DECISIONS.md — Architecture & Norm Decision Log

Lightweight ADR log. Each entry: context → decision → consequences → when to
revisit. **Append, don't rewrite history**: if a decision is reversed, mark it
`superseded by D-xx` and add a new entry. Agents: cite these IDs in PRs and
update this file whenever you change a norm.

---

## D-01 · Serverless GAS + Sheets, no frameworks, no build
**Context**: tiny clinic tool; one admin; budget = 0; maintainers change over time.
**Decision**: static vanilla-JS frontend on GitHub Pages; one Google Apps
Script file as API; Google Sheet as DB. No npm dependencies, no bundler.
**Consequences**: zero cost and near-zero attack/maintenance surface, but
manual backend deploys (AGENTS §4), no staging, and Sheets-scale data limits
(fine at ~hundreds of rows/year).
**Revisit when**: multiple clinics/weekdays, >20 users, or a real auth need.

## D-02 · Client-authoritative full-overwrite `saveSchedule`
**Context**: schedule edits happen on the client (generate, manual assign, holiday clear).
**Decision**: client sends its entire schedule map; server clears the tab and rewrites it.
**Consequences**: dead-simple sync, idempotent; but last-writer-wins — two
concurrent admins can silently drop each other's changes. Accepted because
there is effectively one admin. Mitigation designed in B-03.
**Revisit when**: more than one person routinely edits schedules.

## D-03 · `limit` is a hard cap; empty slots are surfaced, not forced
**Context**: owner chose staff protection over guaranteed coverage (2026-07 session).
**Decision**: the algorithm never exceeds a doctor's monthly limit; unfillable
slots become `未安排`, shown red in the UI and listed in notification emails.
**Consequences**: coverage gaps are a human coordination problem by design.
**Revisit when**: owner asks for soft limits or auto-relaxation.

## D-04 · Deterministic fairness algorithm
**Decision**: queue seeded by this-year duty count ascending (excluding the
target month), ties by `localeCompare(name)`; round-robin after each
assignment; same-day AM+PM exclusion; holidays clear both slots.
**Consequences**: reproducible outputs → testable; fairness is cross-month
within the calendar year; 清除整年班表 exists precisely to reset the fairness
baseline at year end.
**Revisit when**: fairness should span calendar years or weight AM/PM differently.

## D-05 · Same-day AM/PM exclusion is a real rule
**Context**: README promised it; pre-2026-07 code didn't implement it.
**Decision**: implemented in the shared algorithm; each Wednesday is cleared
before assignment so the check only sees the current run. Manual assignment
(單格指派) may override it after an explicit confirm — human overrides beat
algorithmic rules.

## D-06 · `未安排` sentinel with legacy-value tolerance
**Decision**: write the zh constant `UNASSIGNED`; read via `isUnassigned()`
accepting legacy English `"Unassigned"` (old rows may persist in the Sheet).
**Consequences**: never compare sentinel literals directly (invariant I2).
Two real bugs shipped from violating this; both fixed 2026-07.

## D-07 · Write-auth gate built, then disabled (owner decision)
**Context**: gate was added (Script-Property token + localStorage password),
then the owner chose zero-friction for the small trusted team.
**Decision**: all writes open; mechanism kept in code, commented, with
`setApiToken()`/`clearApiToken()` and runbook R-C for one-step re-enable.
**Consequences**: anyone with the (public) URL can write and trigger mass
email. Accepted knowingly. See B-01 for the sendReminders-specific mitigation.
**Revisit when**: any sign of abuse, or the team grows beyond mutual trust.

## D-08 · SHARED SCHEDULER block + byte-parity test (instead of true code sharing)
**Context**: GAS cannot import files; hand-mirroring the algorithm caused drift risk.
**Decision**: identical marked block in both files; `tests/parity.test.js`
enforces byte equality AND behavioral equality (executes the GAS copy).
**Consequences**: drift is now a CI failure, not a code-review hope. The block
must stay dependency-free and unindented (AGENTS §5).
**Revisit when**: a clasp-based build could generate the GAS file from source (see B-04).

## D-09 · Optimistic UI with snapshot/rollback
**Decision**: every mutation = `snapshotState()` → local update + render →
`postData` → `restoreState()` on failure.
**Consequences**: instant-feeling UI on a slow GAS backend; the pattern is
mandatory for new mutations (invariant I6).

## D-10 · Mobile layout = Wednesday cards, not a month grid
**Context**: 7-column grid collapsed on phones; clinic only runs Wednesdays.
**Decision**: at ≤900px hide non-Wednesday cells entirely and stack Wednesdays
as full-width cards; page scrolls normally instead of the desktop app-shell.
**Consequences**: mobile shows no month-at-a-glance context — deemed fine
because only Wednesdays matter.

## D-11 · Clinic hours are hardcoded
**Decision**: AM = 09:00–12:00, PM = 13:30–16:30, encoded in
`createGCalLink()` and email/UI text only.
**Revisit when**: hours change — grep for `090000`/`133000` and the guide text.

## D-12 · Docs are Chinese-canonical; engineering docs are English
**Decision**: user-facing docs zh-TW first (`README.md`, `USER_GUIDE.md`),
`*_EN.md` derived. Agent-facing docs (`AGENTS.md`, this file, BACKLOG) are
English for cross-model reliability, with zh domain terms (畫休, 未安排) kept
verbatim because they appear in code and data.

## D-13 · `sendReminders` is rate-limited instead of password-gated
**Context**: the API URL is public; `sendReminders` mass-emails every doctor;
auth is disabled (D-07). Owner chose friction-free protection (2026-07).
**Decision**: `doPost` rejects a manual `sendReminders` within 60 minutes of
the last successful one (`LAST_REMINDER_TS` Script Property). The monthly cron
bypasses `doPost` and is unaffected.
**Consequences**: an attacker gets at most one mass email per hour; a
legitimate admin who needs an immediate resend must wait or delete the Script
Property. This limit is the only guard on the mail quota — do not remove.

## D-14 · Weekly whole-spreadsheet backups
**Context**: client-authoritative overwrite (D-02) makes the Sheet a single
point of data loss; version history thins over time.
**Decision**: `weeklyBackup()` copies the spreadsheet to Drive
(`RosterBackup_YYYY-MM-DD`), keeps the newest 8; trigger installed once via
`createBackupTrigger()` (Mondays 02:00). Adds a Drive OAuth scope.
**Consequences**: worst-case data loss window ≈ 1 week + version history for
anything newer. Recovery runbook: AGENTS R-D.

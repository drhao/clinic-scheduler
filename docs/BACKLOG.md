# BACKLOG.md — Known Issues & Designed Improvements

Prioritized. Each entry has enough design detail that a future agent can
implement it without re-deriving the analysis. **Before starting any "new"
idea, check whether it's already here.** When you fix an entry, delete it and
note the fix in the PR; when you find a new issue, add it with a sketch.

Priorities: **P1** = real risk today · **P2** = will bite as usage grows ·
**P3** = quality-of-life.

IDs are stable and never reused; gaps mean the item shipped (B-01 → rate
limit, D-13; B-02 → weekly backup, D-14).

---

## P2

### B-03 · Concurrent-editor lost updates (D-02's accepted risk)
**Sketch (optimistic concurrency)**: `doGet` returns a `revision` (store an
integer in Script Properties, bumped inside every `saveSchedule`). Client
remembers the revision it loaded; `saveSchedule` sends it; server rejects on
mismatch with "資料已被其他人更新，請重新整理後再操作"; client refetches.
~20 lines total across both files. Do this before ever adding a second admin.

### B-04 · Backend deploys are manual (drift risk)
Owner decided (2026-07) to stay manual with the `BACKEND_VERSION` marker for
now — drift is *visible*, not *impossible*. If deploys are ever forgotten
repeatedly, upgrade to clasp. **Sketch**: `npm i -g @google/clasp`,
`clasp login`, `.clasp.json` with the script ID, GitHub Action running
`clasp push` + `clasp deploy` on main using a `CLASPRC_JSON` secret. Requires
owner's one-time Google authorization (~30 min). Until then, runbook R-A is
the law.

### B-05 · Local testing hits production data (R4)
**Sketch**: a `TEST_MODE` query param (`?api=<url>`) letting `script.js`
override `API_URL` at load, so a second GAS deployment bound to a copy of the
Sheet can serve as staging. Document the staging URL in this file if created.

### B-06 · User docs lag the implemented behavior
`README.md`/`USER_GUIDE.md` (+ `_EN` mirrors) still describe the pre-2026-07
app. Missing: 手動指派/換班 (click any slot), holiday confirm dialog, red
未安排 highlighting, unassigned-slots email note, mobile card layout, password
gate removed, `scheduler.js`/`npm test` in the dev notes. One documentation
pass, Chinese first (I8).

## P3

### B-07 · Buttons invoked from list items aren't disabled while `isLoading`
`setLoading()` disables the three main buttons only; inline-created buttons
(刪除/編輯/×, slot clicks) still fire during an in-flight request → possible
double-submit. Sketch: guard `postData` with a module-level in-flight flag, or
disable via CSS `pointer-events` on `body.loading`.

### B-08 · Server-side duplicate checks are thinner than client-side
`addUser` has no server-side name-uniqueness check (client only). Two tabs can
create duplicate doctors. Mirror the client check in `doPost`.

### B-09 · Yearly stats always show the *current* year
`renderYearlyDutyCounts()` uses `new Date().getFullYear()` regardless of the
month being browsed; viewing December while planning January shows the old
year's stats under the new month. Consider following `currentDate`'s year.

### B-10 · Add-to-home-screen polish for phones
No favicon / `manifest.json` / `apple-touch-icon`; doctors likely open this on
phones monthly. Small static-file addition, no build needed.

### B-11 · Real identity instead of a shared secret
If auth is ever needed beyond D-07's shared password: deploy GAS as
"Execute as: user accessing" + Google sign-in, or a per-doctor magic-link
token column in Users. Both are significant UX changes — design doc first.

### B-12 · Per-doctor calendar feed
Replace per-slot GCal links with a per-doctor ICS URL (GAS `doGet` with
`?ics=<doctor>` returning `text/calendar`) so a doctor subscribes once and
future duties appear automatically. Nice demo-able win; needs cache headers
and a stable per-doctor identifier.

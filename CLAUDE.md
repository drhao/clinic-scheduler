# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MO Travel Clinic Scheduler (MO旅醫門診排班系統) — a serverless duty-rostering app for a travel-medicine clinic that runs **only on Wednesdays** (AM and PM slots). The UI is in Traditional Chinese.

There is **no build system or linter**, and no runtime dependencies. The frontend is plain HTML/CSS/Vanilla JS served as static files; the backend is a single Google Apps Script file. Development means editing files directly and deploying manually (see below). The one piece of pure logic — the scheduling algorithm in `scheduler.js` — has unit tests run with `npm test` (`node --test`, no install needed).

## Architecture

Three tiers, no server cost:

1. **Frontend SPA** (`index.html`, `style.css`, `script.js`, `scheduler.js`) — deployed as static files (GitHub Pages at `https://drhao.github.io/clinic-scheduler/`). No frameworks; all DOM built imperatively in `script.js`. State lives in module-level globals (`users`, `constraints`, `schedule`, `holidays`) and is re-rendered via `renderAll()`. `scheduler.js` is loaded (before `script.js`) as a global `Scheduler` and holds the pure scheduling algorithm.
2. **Backend** (`google_apps_script.js`) — pasted into a Google Apps Script project bound to a Google Sheet. Exposes a Web App: `doGet` returns all data, `doPost` dispatches on `data.action` (e.g. `addUser`, `addConstraint`, `saveSchedule`, `addHoliday`, `sendReminders`). Uses `LockService` to serialize writes.
3. **Database** — a Google Sheet with four tabs: `Users` (Name, Limit, Email), `Constraints` (User, Date, Slot), `Schedule` (Key, Assigned User), `Holidays` (Date). `setup()` creates these tabs.

Frontend ↔ backend coupling: `script.js` line ~13 holds `API_URL`, the deployed Web App URL. Changing the backend requires re-deploying the Apps Script and (if the URL changes) updating `API_URL`.

Write auth (currently DISABLED): a shared-password gate exists but is commented out — no action requires or sends a password. The mechanism (`getAuthToken`/`PUBLIC_ACTIONS` in `script.js`, the token check in `doPost`, and `setApiToken`/`clearApiToken`) is kept for easy re-enable; to turn it back on, restore the commented block in `doPost` and the token logic in `postData`, then run `setApiToken()`. `doGet` (reads) is public regardless. Enable via `setApiToken()` in the editor; `doGet` (reads) remains public — protecting reads would require a Google-login deployment.

### Key data conventions

- **Schedule is a flat map** keyed `"YYYY-MM-DD_AM"` / `"YYYY-MM-DD_PM"`, value = assigned user name. `saveSchedule` always clears and rewrites the entire `Schedule` sheet from the client's map — the client is the source of truth on save.
- **Unassigned sentinel**: a slot with no eligible doctor is written as `"未安排"`. The legacy English `"Unassigned"` may still exist in old data, so read paths use `isUnassigned()` (in `scheduler.js` and `script.js`), which accepts both. Write the `UNASSIGNED` constant.
- Dates round-trip through `formatDate()` (exists in `scheduler.js`, `script.js` and `google_apps_script.js`) because Sheets may return Date objects rather than strings.

### The scheduling algorithm lives in scheduler.js — but the GAS copy is duplicated

The fairness/round-robin logic has a single canonical, unit-tested implementation in `scheduler.js` → `generateMonthSchedule()`, used by the manual "一鍵排班" button (`script.js` → `generateSchedule()`). **However, `google_apps_script.js` → `autoGenerateSchedule()` (the cron that runs on the 5th for next month) keeps its own hand-copied version**, because Apps Script cannot import local files. **Any rule change in `scheduler.js` must be mirrored into `autoGenerateSchedule()`**, or the manual and automatic schedules will diverge.

The algorithm: seed a queue sorted by **this-year duty count ascending** (excluding the target month) then name; for each Wednesday AM/PM, pick the first queued user who (a) is under their monthly `limit`, (b) has no matching `Constraints` row, and (c) is not already assigned to the other slot of the same day, then move them to the back of the queue (round-robin). Each Wednesday's two slots are cleared before assigning so the same-day check sees only this run's results. Cover the rules with cases in `tests/scheduler.test.js`.

`limit` is a hard cap — the algorithm never relaxes it to fill a slot. When a notification email is sent (manual `sendReminders` action with `isScheduled`, or `autoGenerateSchedule`), `getUnassignedSlots`/`formatUnassignedNote` append a list of any `"未安排"` slots so staff can arrange cover.

### Automation (cron)

`createMonthlyTriggers()` (run once manually in the Apps Script editor) installs two time-based triggers:
- `autoSendReminderEmail` — 1st of month, emails users to fill in next month's availability.
- `autoGenerateSchedule` — 5th of month, auto-generates next month's schedule and emails results.

Both skip the target month if it already has duties, and send mail via `MailApp` to each user's Email column.

## Common patterns

- **Optimistic UI with rollback**: mutations (`addUser`, `addConstraint`, `deleteUser`, `editUser`, `toggleHoliday`, `generateSchedule`, `clearScheduleForYear`) take a `snapshotState()`, update local state and re-render *first*, then `await postData(...)`; if the sync returns falsy they call `restoreState(snap)` to revert. Preserve this snapshot/restore pairing when adding mutations.
- **Duplicate prevention** for constraints is enforced on **both** client (`addConstraint`) and server (`addConstraint` action) — keep both checks if editing.
- Global handlers invoked from inline `onclick` (`removeConstraint`, `deleteUser`, `editUser`) are attached to `window`. `editUser` opens the `#edit-user-modal` form; the legacy `prompt()` flow is gone.

## Running / deploying

- **Tests**: `npm test` (runs `node --test` over `tests/`). Only `scheduler.js` is covered; the rest is DOM/Apps Script glue.
- **Frontend locally**: open `index.html` directly, or serve the folder (e.g. `python3 -m http.server`). It will hit the live `API_URL` backend.
- **Backend**: copy `google_apps_script.js` into the bound Sheet's Apps Script editor, run `setup()` once, run `createMonthlyTriggers()` once, then Deploy → New deployment → Web app (Execute as: Me; Access: Anyone). Full steps are in `README.md` (Setup Guide) and the header comment of `google_apps_script.js`.

`README.md`/`USER_GUIDE.md` are the canonical (Chinese) docs; `*_EN.md` are English translations — update the Chinese versions first.

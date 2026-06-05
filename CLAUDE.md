# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MO Travel Clinic Scheduler (MO旅醫門診排班系統) — a serverless duty-rostering app for a travel-medicine clinic that runs **only on Wednesdays** (AM and PM slots). The UI is in Traditional Chinese.

There is **no build system, package manager, test suite, or linter**. The frontend is plain HTML/CSS/Vanilla JS served as static files; the backend is a single Google Apps Script file. Development means editing files directly and deploying manually (see below).

## Architecture

Three tiers, no server cost:

1. **Frontend SPA** (`index.html`, `style.css`, `script.js`) — deployed as static files (GitHub Pages at `https://drhao.github.io/clinic-scheduler/`). No frameworks; all DOM built imperatively in `script.js`. State lives in module-level globals (`users`, `constraints`, `schedule`, `holidays`) and is re-rendered via `renderAll()`.
2. **Backend** (`google_apps_script.js`) — pasted into a Google Apps Script project bound to a Google Sheet. Exposes a Web App: `doGet` returns all data, `doPost` dispatches on `data.action` (e.g. `addUser`, `addConstraint`, `saveSchedule`, `addHoliday`, `sendReminders`). Uses `LockService` to serialize writes.
3. **Database** — a Google Sheet with four tabs: `Users` (Name, Limit, Email), `Constraints` (User, Date, Slot), `Schedule` (Key, Assigned User), `Holidays` (Date). `setup()` creates these tabs.

Frontend ↔ backend coupling: `script.js` line ~13 holds `API_URL`, the deployed Web App URL. Changing the backend requires re-deploying the Apps Script and (if the URL changes) updating `API_URL`.

Write auth (optional): `doPost` checks an `API_TOKEN` Script Property against `data.token`; if no token is configured the gate is open (back-compat). The frontend prompts for an admin password once, caches it in `localStorage` (`clinicAdminToken`), and sends it with every `postData`. Enable via `setApiToken()` in the editor; `doGet` (reads) remains public — protecting reads would require a Google-login deployment.

### Key data conventions

- **Schedule is a flat map** keyed `"YYYY-MM-DD_AM"` / `"YYYY-MM-DD_PM"`, value = assigned user name. `saveSchedule` always clears and rewrites the entire `Schedule` sheet from the client's map — the client is the source of truth on save.
- **Unassigned sentinel is inconsistent**: the algorithm writes the Chinese string `"未安排"`, but counting/filtering code guards against the English `"Unassigned"`. Both appear in the codebase; check which one you're comparing against when touching duty-count or fairness logic.
- Dates round-trip through `formatDate()` (exists in both `script.js` and `google_apps_script.js`) because Sheets may return Date objects rather than strings.

### The scheduling algorithm is duplicated — keep both copies in sync

The fairness/round-robin assignment logic exists **twice**:
- `script.js` → `generateSchedule()` + `assignNextAvailable()` (manual "一鍵排班" button)
- `google_apps_script.js` → `autoGenerateSchedule()` (cron, runs on the 5th for *next* month)

Both implement the same algorithm: seed a queue sorted by **this-year duty count ascending** (excluding the target month) then name; for each Wednesday AM/PM, pick the first queued user who (a) is under their monthly `limit`, (b) has no matching `Constraints` row, and (c) is not already assigned to the other slot of the same day, assign them, then move them to the back of the queue (round-robin). Each Wednesday's two slots are cleared before assigning so the same-day check sees only this run's results. A slot with no eligible user is written as `"未安排"`. **Any change to scheduling rules must be applied to both functions**, or the manual and automatic schedules will diverge.

`limit` is a hard cap — the algorithm never relaxes it to fill a slot. When a notification email is sent (manual `sendReminders` action with `isScheduled`, or `autoGenerateSchedule`), `getUnassignedSlots`/`formatUnassignedNote` append a list of any `"未安排"` slots so staff can arrange cover.

### Automation (cron)

`createMonthlyTriggers()` (run once manually in the Apps Script editor) installs two time-based triggers:
- `autoSendReminderEmail` — 1st of month, emails users to fill in next month's availability.
- `autoGenerateSchedule` — 5th of month, auto-generates next month's schedule and emails results.

Both skip the target month if it already has duties, and send mail via `MailApp` to each user's Email column.

## Common patterns

- **Optimistic UI**: mutations (`addUser`, `addConstraint`, `deleteUser`, etc.) update local state and re-render *first*, then `await postData(action, payload)` to sync. There is no rollback on failure beyond an alert.
- **Duplicate prevention** for constraints is enforced on **both** client (`addConstraint`) and server (`addConstraint` action) — keep both checks if editing.
- Global handlers invoked from inline `onclick` (`removeConstraint`, `deleteUser`, `editUser`, etc.) are attached to `window`.

## Running / deploying

- **Frontend locally**: open `index.html` directly, or serve the folder (e.g. `python3 -m http.server`). It will hit the live `API_URL` backend.
- **Backend**: copy `google_apps_script.js` into the bound Sheet's Apps Script editor, run `setup()` once, run `createMonthlyTriggers()` once, then Deploy → New deployment → Web app (Execute as: Me; Access: Anyone). Full steps are in `README.md` (Setup Guide) and the header comment of `google_apps_script.js`.

`README.md`/`USER_GUIDE.md` are the canonical (Chinese) docs; `*_EN.md` are English translations — update the Chinese versions first.

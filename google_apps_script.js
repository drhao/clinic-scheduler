/**
 * Google Apps Script Backend for Clinic Scheduler
 *
 * DEPLOY (always full-file replace — never paste fragments):
 * 1. Bump BACKEND_VERSION below.
 * 2. Open the bound Sheet > Extensions > Apps Script, select ALL of Code.gs,
 *    paste this entire file over it, save.
 * 3. Deploy > Manage deployments > Edit > Version: "New version" > Deploy.
 *    (Editing the existing deployment keeps the URL stable; a NEW deployment
 *    changes the URL and requires updating API_URL in script.js.)
 * 4. Verify: curl "<API_URL>" and check the returned "version" matches.
 *
 * FIRST-TIME SETUP: run setup() once (creates the four tabs), then
 * createMonthlyTriggers() once (installs the two cron jobs), then
 * sendLoginLinksToAll() once (emails everyone their personal login link).
 * Full steps in README.md / AGENTS.md.
 *
 * ACCESS (D-15): each user has a personal token (Users column D). Every email
 * the system sends carries the recipient's link (APP_URL#t=<token>). Writes
 * other than PUBLIC_ACTIONS require a valid token; emails are only returned
 * to token holders.
 *
 * SYNC RULE: the BEGIN/END SHARED SCHEDULER block below must be byte-identical
 * to the one in scheduler.js (tests/parity.test.js enforces it). Never edit it
 * here — edit scheduler.js and copy the block over.
 */

// Bump on every deploy (any scheme works; date + counter is conventional).
// doGet echoes this so drift between the repo and the deployed backend is
// detectable: curl the API and compare with this constant.
const BACKEND_VERSION = '2026-11-02.1';

// Front-end URL used for the personal login links inside emails.
const APP_URL = 'https://drhao.github.io/clinic-scheduler/';

// Actions anyone may call without a login token (D-15). Keep in sync with the
// read-only UI in script.js: 畫休 entry stays open; everything else needs a token.
const PUBLIC_ACTIONS = ['addConstraint', 'removeConstraint', 'requestLink'];

// ===== BEGIN SHARED SCHEDULER (sync-guarded) =====
// This block MUST be byte-identical in scheduler.js and google_apps_script.js
// (tests/parity.test.js enforces it). Edit the copy in scheduler.js, run
// `npm test`, then paste the whole block verbatim into google_apps_script.js.
// Keep it dependency-free: no DOM, no SpreadsheetApp, no outer-scope references.

// Sentinel written when no eligible doctor can be found for a slot.
// "Unassigned" is the legacy English value; accept both when reading.
var UNASSIGNED = "未安排";

function isUnassigned(name) {
    return name === UNASSIGNED || name === "Unassigned";
}

// Accepts a Date (normal case) or an already-formatted string (Sheets cells
// may hold either); anything else falls back to String().
function formatDate(date) {
    if (!date) return "";
    if (typeof date === 'string') return date;
    try {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    } catch (e) {
        return String(date);
    }
}

/**
 * Builds the schedule for one month's Wednesdays (AM + PM). Returns a NEW
 * schedule map; opts.existingSchedule is never mutated. Entries for other
 * months/days are carried over untouched (so the yearly stats survive).
 *
 * Rules, applied per slot in queue order:
 *   1. fairness: queue seeded by this-year duty count asc (excluding the
 *      target month), then name asc;
 *   2. skip anyone at/over their monthly `limit`;
 *   3. skip anyone with a matching constraint (畫休);
 *   4. skip anyone already assigned the other slot the same day;
 *   5. round-robin: an assigned doctor moves to the back of the queue.
 * Holidays clear that Wednesday's slots and assign no one. A slot with no
 * eligible doctor is set to UNASSIGNED.
 *
 * @param {{year:number, month:number, users:Array, constraints:Array,
 *          holidays:Array, existingSchedule:Object}} opts  month is 0-indexed
 * @return {Object} new schedule map "YYYY-MM-DD_AM|PM" -> name
 */
function generateMonthSchedule(opts) {
    var year = opts.year;
    var month = opts.month; // 0 = January
    var users = opts.users || [];
    var constraints = opts.constraints || [];
    var holidays = opts.holidays || [];
    var schedule = Object.assign({}, opts.existingSchedule || {});

    // 1. Fairness seed: this-year counts, excluding the target month.
    var yearlyCounts = {};
    users.forEach(function (u) { yearlyCounts[u.name] = 0; });
    Object.keys(schedule).forEach(function (key) {
        var dateStr = key.split('_')[0];
        var parts = dateStr.split('-').map(Number);
        if (parts[0] === year && (parts[1] - 1) !== month) {
            var who = schedule[key];
            if (who && !isUnassigned(who) && yearlyCounts.hasOwnProperty(who)) {
                yearlyCounts[who]++;
            }
        }
    });

    var queue = users.slice().sort(function (a, b) {
        var ca = yearlyCounts[a.name] || 0;
        var cb = yearlyCounts[b.name] || 0;
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
    });

    var monthlyCounts = {};
    users.forEach(function (u) { monthlyCounts[u.name] = 0; });

    function assign(dateStr, slot) {
        var key = dateStr + '_' + slot;
        var otherSlot = slot === 'AM' ? 'PM' : 'AM';
        var foundIndex = -1;
        for (var i = 0; i < queue.length; i++) {
            var user = queue[i];
            if (monthlyCounts[user.name] >= user.limit) continue;
            var blocked = constraints.some(function (c) {
                return c.user === user.name && c.date === dateStr && c.slot === slot;
            });
            if (blocked) continue;
            if (schedule[dateStr + '_' + otherSlot] === user.name) continue; // same-day
            foundIndex = i;
            break;
        }
        if (foundIndex >= 0) {
            var picked = queue[foundIndex];
            schedule[key] = picked.name;
            monthlyCounts[picked.name]++;
            queue.push(queue.splice(foundIndex, 1)[0]); // round-robin
        } else {
            schedule[key] = UNASSIGNED;
        }
    }

    var daysInMonth = new Date(year, month + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
        var dateObj = new Date(year, month, d);
        if (dateObj.getDay() !== 3) continue; // Wednesday only
        var dateStr = formatDate(dateObj);

        // Clear this day first so the same-day check sees only this run.
        delete schedule[dateStr + '_AM'];
        delete schedule[dateStr + '_PM'];

        if (holidays.indexOf(dateStr) !== -1) continue;

        assign(dateStr, 'AM');
        assign(dateStr, 'PM');
    }

    return schedule;
}
// ===== END SHARED SCHEDULER =====

function doGet(e) {
    // Public read: never includes emails or tokens (logged-in clients use the
    // 'getData' POST action instead).
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return jsonResponse({
        status: 'success',
        version: BACKEND_VERSION,
        data: readAllData(ss, false)
    });
}

function readAllData(ss, includeEmails) {
    // Read Users
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let users = [];
    if (usersData.length > 0) {
        let startRow = (usersData[0][0] === "Name") ? 1 : 0;
        for (let i = startRow; i < usersData.length; i++) {
            if (usersData[i][0]) {
                const user = {
                    name: usersData[i][0],
                    limit: usersData[i][1] || 4
                };
                if (includeEmails) user.email = usersData[i][2] || '';
                users.push(user);
            }
        }
    }

    // Read Constraints
    const constraintsSheet = ss.getSheetByName('Constraints');
    const constraintsData = constraintsSheet.getDataRange().getValues();
    let constraints = [];
    if (constraintsData.length > 0) {
        let startRow = (constraintsData[0][0] === "User" && constraintsData[0][1] === "Date") ? 1 : 0;
        for (let i = startRow; i < constraintsData.length; i++) {
            if (constraintsData[i][0]) {
                constraints.push({
                    user: constraintsData[i][0],
                    date: formatDate(constraintsData[i][1]),
                    slot: constraintsData[i][2]
                });
            }
        }
    }

    // Read Schedule
    const scheduleSheet = ss.getSheetByName('Schedule');
    const scheduleData = scheduleSheet.getDataRange().getValues();
    let schedule = {};
    if (scheduleData.length > 0) {
        let startRow = (scheduleData[0][0] === "Key") ? 1 : 0;
        for (let i = startRow; i < scheduleData.length; i++) {
            if (scheduleData[i][0]) {
                schedule[scheduleData[i][0]] = scheduleData[i][1];
            }
        }
    }

    // Read Holidays
    const holidaysSheet = ss.getSheetByName('Holidays');
    const holidaysData = holidaysSheet.getDataRange().getValues();
    let holidays = [];
    if (holidaysData.length > 0) {
        let startRow = (holidaysData[0][0] === "Date") ? 1 : 0;
        for (let i = startRow; i < holidaysData.length; i++) {
            if (holidaysData[i][0]) {
                holidays.push(formatDate(holidaysData[i][0]));
            }
        }
    }

    return { users, constraints, schedule, holidays };
}

function doPost(e) {
    let data;
    try {
        data = JSON.parse(e.postData.contents);
    } catch (err) {
        return errorResponse("Invalid JSON");
    }

    const action = data.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
        return errorResponse("系統忙碌中，請稍後再試");
    }

    try {
        // Login gate (D-15)
        if (PUBLIC_ACTIONS.indexOf(action) === -1 && !findUserByToken(ss, data.token)) {
            return errorResponse("尚未登入或登入連結已失效，請使用 Email 中的個人連結開啟網頁", 'unauthorized');
        }

        if (action === 'getData') {
            return jsonResponse({
                status: 'success',
                version: BACKEND_VERSION,
                data: readAllData(ss, true)
            });

        } else if (action === 'addUser') {
            const sheet = ss.getSheetByName('Users');
            sheet.appendRow([data.name, data.limit, data.email || '', Utilities.getUuid()]);

        } else if (action === 'deleteUser') {
            const sheet = ss.getSheetByName('Users');
            const values = sheet.getDataRange().getValues();
            for (let i = values.length - 1; i >= 0; i--) {
                if (values[i][0] === data.name) {
                    sheet.deleteRow(i + 1);
                }
            }

            // Release this user's duties so the slots show as unassigned
            // rather than referencing a doctor who no longer exists.
            const scheduleSheet = ss.getSheetByName('Schedule');
            const scheduleValues = scheduleSheet.getDataRange().getValues();
            for (let i = 0; i < scheduleValues.length; i++) {
                if (scheduleValues[i][1] === data.name) { // Column 2 (index 1) is Assigned User
                    scheduleSheet.getRange(i + 1, 2).setValue("未安排");
                }
            }

        } else if (action === 'editUser') {
            const oldName = data.oldName;
            const newName = data.newName;
            const newLimit = data.newLimit;

            // 1. Update Users Sheet
            const usersSheet = ss.getSheetByName('Users');
            const userValues = usersSheet.getDataRange().getValues();
            for (let i = 0; i < userValues.length; i++) {
                if (userValues[i][0] === oldName) {
                    usersSheet.getRange(i + 1, 1).setValue(newName);
                    usersSheet.getRange(i + 1, 2).setValue(newLimit);
                    usersSheet.getRange(i + 1, 3).setValue(data.newEmail || '');
                }
            }

            // 2. Update Constraints Sheet
            const constraintsSheet = ss.getSheetByName('Constraints');
            const constraintValues = constraintsSheet.getDataRange().getValues();
            for (let i = 0; i < constraintValues.length; i++) {
                if (constraintValues[i][0] === oldName) {
                    constraintsSheet.getRange(i + 1, 1).setValue(newName);
                }
            }

            // 3. Update Schedule Sheet
            const scheduleSheet = ss.getSheetByName('Schedule');
            const scheduleValues = scheduleSheet.getDataRange().getValues();
            for (let i = 0; i < scheduleValues.length; i++) {
                if (scheduleValues[i][1] === oldName) { // Column 2 (Index 1) is Assigned User
                    scheduleSheet.getRange(i + 1, 2).setValue(newName);
                }
            }

        } else if (action === 'addConstraint') {
            // Public action: only accept well-formed rows for a doctor on the list.
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date)) ||
                (data.slot !== 'AM' && data.slot !== 'PM') ||
                !userExists(ss, data.user)) {
                return errorResponse("不排班時間的資料格式不正確");
            }
            const sheet = ss.getSheetByName('Constraints');
            const values = sheet.getDataRange().getValues();
            let exists = false;
            for (let i = 0; i < values.length; i++) {
                if (values[i][0] === data.user && formatDate(values[i][1]) === data.date && values[i][2] === data.slot) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                sheet.appendRow([data.user, data.date, data.slot]);
            }

        } else if (action === 'removeConstraint') {
            const sheet = ss.getSheetByName('Constraints');
            const values = sheet.getDataRange().getValues();
            for (let i = values.length - 1; i >= 0; i--) {
                const row = values[i];
                const rowDate = formatDate(row[1]);
                if (row[0] === data.user && rowDate === data.date && row[2] === data.slot) {
                    sheet.deleteRow(i + 1);
                    break;
                }
            }

        } else if (action === 'saveSchedule') {
            const sheet = ss.getSheetByName('Schedule');
            sheet.clear();
            sheet.appendRow(["Key", "Assigned User"]);
            const scheduleMap = data.schedule;
            const rows = [];
            for (const key in scheduleMap) {
                rows.push([key, scheduleMap[key]]);
            }
            if (rows.length > 0) {
                sheet.getRange(2, 1, rows.length, 2).setValues(rows);
            }

        } else if (action === 'addHoliday') {
            const sheet = ss.getSheetByName('Holidays');
            sheet.appendRow([data.date]);

        } else if (action === 'removeHoliday') {
            const sheet = ss.getSheetByName('Holidays');
            const values = sheet.getDataRange().getValues();
            for (let i = values.length - 1; i >= 0; i--) {
                if (formatDate(values[i][0]) === data.date) {
                    sheet.deleteRow(i + 1);
                    break;
                }
            }
        } else if (action === 'sendReminders') {
            // Abuse guard (D-13): the API URL is public, so cap manual
            // notification sends to one success per hour. The monthly cron
            // (autoSendReminderEmail) does not go through doPost and is
            // therefore unaffected.
            const props = PropertiesService.getScriptProperties();
            const lastSendTs = Number(props.getProperty('LAST_REMINDER_TS') || 0);
            if (Date.now() - lastSendTs < 60 * 60 * 1000) {
                return errorResponse("通知信 60 分鐘內已發送過，請稍後再試");
            }
            props.setProperty('LAST_REMINDER_TS', String(Date.now()));

            const targetYear = data.year || new Date().getFullYear();
            const targetMonth = data.month || (new Date().getMonth() + 1);
            const isScheduled = data.isScheduled;

            let subject = "";
            let makeBody;

            if (isScheduled) {
                // Read the current schedule to flag any slot that could not be filled.
                const scheduleSheet = ss.getSheetByName('Schedule');
                const scheduleData = scheduleSheet.getDataRange().getValues();
                const scheduleMap = {};
                let startRowSch = (scheduleData.length > 0 && scheduleData[0][0] === "Key") ? 1 : 0;
                for (let i = startRowSch; i < scheduleData.length; i++) {
                    if (scheduleData[i][0]) scheduleMap[scheduleData[i][0]] = scheduleData[i][1];
                }
                const unassignedNote = formatUnassignedNote(getUnassignedSlots(scheduleMap, targetYear, targetMonth - 1));

                subject = `[通知] MO旅醫門診 ${targetYear}年${targetMonth}月 班表已排定`;
                makeBody = link => `大家好，\n\n${targetYear}年${targetMonth}月 的旅醫門診班表已經排定。\n請至排班網頁確認您的班表，並可以點擊班表上的「行事曆圖示」將門診時段加入您的個人 Google Calendar 中。${unassignedNote}\n\n排班網頁（您的個人連結，請勿轉寄）：${link}\n\n謝謝！\n\n排班系統敬上\n=================================\n此信件為系統自動產生發送，請不要直接回信`;
            } else {
                let deadlineMonth = targetMonth - 1;
                if (deadlineMonth === 0) {
                    deadlineMonth = 12; // Handle January -> December
                }

                subject = `[提醒] 請填寫 MO旅醫門診 ${targetYear}年${targetMonth}月 不排班時間`;
                makeBody = link => `大家好，\n\n這是一封自動提醒信。\n請記得在 ${deadlineMonth} 月 3 日前至排班網頁填寫 ${targetMonth} 月份的不排班時間（畫休）。\n\n⚠️ 系統將於每月 5 日自動進行一鍵排班作業，若未填寫畫休，將視同隨時皆可排班，排定後請自行協調換班。\n\n排班網址（您的個人連結，請勿轉寄）：${link}\n\n謝謝！\n\n排班系統敬上\n=================================\n此信件為系統自動產生發送，請不要直接回信`;
            }

            sendToAllUsers(ss, subject, makeBody);

        } else if (action === 'requestLink') {
            // Public action. Always answers success so the response never
            // reveals whether an address is on the list; at most one email per
            // address every 10 minutes.
            const email = String(data.email || '').trim().toLowerCase();
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 100) {
                const cache = CacheService.getScriptCache();
                const cacheKey = 'login_link_' + email;
                if (!cache.get(cacheKey)) {
                    cache.put(cacheKey, '1', 600);
                    getUsersWithTokens(ss)
                        .filter(u => u.email.toLowerCase() === email)
                        .forEach(u => sendLoginLink(u));
                }
            }
        }

        return jsonResponse({ status: 'success' });

    } catch (err) {
        return errorResponse(err.toString());
    } finally {
        lock.releaseLock();
    }
}

function jsonResponse(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// code: 'unauthorized' tells the frontend to drop its stored login token.
function errorResponse(msg, code) {
    return jsonResponse({ status: 'error', message: msg, code: code || 'error' });
}

// ==========================================
// PERSONAL LOGIN LINKS (D-15)
// ==========================================

function userExists(ss, name) {
    const values = ss.getSheetByName('Users').getDataRange().getValues();
    return values.some((row, i) => !(i === 0 && row[0] === "Name") && row[0] === name);
}

function findUserByToken(ss, token) {
    if (typeof token !== 'string' || token.length < 20) return null;
    const values = ss.getSheetByName('Users').getDataRange().getValues();
    const row = values.find(r => r[0] && String(r[3] || '') === token);
    return row ? { name: row[0], email: row[2] } : null;
}

/**
 * Returns every user with an email address and login token, generating a
 * token (Users column D) for anyone who doesn't have one yet.
 */
function getUsersWithTokens(ss) {
    const sheet = ss.getSheetByName('Users');
    const values = sheet.getDataRange().getValues();
    const startRow = (values.length > 0 && values[0][0] === "Name") ? 1 : 0;
    const result = [];
    for (let i = startRow; i < values.length; i++) {
        if (!values[i][0]) continue;
        let token = values[i][3];
        if (!token) {
            token = Utilities.getUuid();
            sheet.getRange(i + 1, 4).setValue(token);
        }
        result.push({
            name: values[i][0],
            email: String(values[i][2] || '').trim(),
            token: String(token)
        });
    }
    return result;
}

function loginLinkFor(user) {
    return APP_URL + '#t=' + user.token;
}

/**
 * Emails every user who has an address. makeBody(link) receives the
 * recipient's personal login link and returns the body text.
 */
function sendToAllUsers(ss, subject, makeBody) {
    getUsersWithTokens(ss).forEach(user => {
        if (!user.email) return;
        try {
            MailApp.sendEmail({
                to: user.email,
                subject: subject,
                body: makeBody(loginLinkFor(user))
            });
        } catch (e) {
            Logger.log(`Failed to send email to ${user.email}`);
        }
    });
}

function sendLoginLink(user) {
    if (!user.email) return;
    MailApp.sendEmail({
        to: user.email,
        subject: '[登入連結] MO旅醫門診排班系統',
        body: `${user.name} 您好，\n\n這是您在排班系統的個人登入連結。用這個連結開啟網頁後，這台裝置就可以管理人員、假日與班表（含換班）：\n\n${loginLinkFor(user)}\n\n此連結等同您的登入身分，請勿轉寄給他人。\n換新的電腦或手機時，再點一次這個連結即可。\n\n排班系統敬上\n=================================\n此信件為系統自動產生發送，請不要直接回信`
    });
}

/**
 * Emails every user their personal login link. Run ONCE from the editor after
 * deploying the login-link version (and again whenever you want to re-send).
 */
function sendLoginLinksToAll() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    getUsersWithTokens(ss).forEach(user => {
        try {
            sendLoginLink(user);
        } catch (e) {
            Logger.log(`Failed to send login link to ${user.email}`);
        }
    });
}

// formatDate lives in the SHARED SCHEDULER block near the top of this file.

/**
 * Scans a schedule map for slots left "未安排" in the given year/month.
 * @param {Object} scheduleMap  Map of "YYYY-MM-DD_AM|PM" -> assigned user name.
 * @param {number} year         Four-digit year.
 * @param {number} monthIdx     Month index (0 = January, 11 = December).
 * @return {Array<{m:number, d:number, slot:string}>} sorted by day then AM before PM.
 */
function getUnassignedSlots(scheduleMap, year, monthIdx) {
    const unassigned = [];
    Object.keys(scheduleMap).forEach(key => {
        const [dateStr, slot] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);
        if (y === year && (m - 1) === monthIdx && isUnassigned(scheduleMap[key])) {
            unassigned.push({ m, d, slot });
        }
    });
    unassigned.sort((a, b) => (a.d - b.d) || (a.slot === 'AM' ? -1 : 1));
    return unassigned;
}

/**
 * Builds a human-readable warning block listing unassigned slots for an email
 * body. Returns an empty string when every slot was filled.
 */
function formatUnassignedNote(unassigned) {
    if (!unassigned || unassigned.length === 0) return "";
    let note = "\n\n⚠️ 注意：以下時段目前無人可排（所有人皆已達當月上限或已畫休），請大家自行協調補班：\n";
    unassigned.forEach(u => {
        const slotName = u.slot === 'AM' ? '上午' : '下午';
        note += `・${u.m}月${u.d}日 (${slotName})\n`;
    });
    return note;
}

function setup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName('Users')) ss.insertSheet('Users').appendRow(['Name', 'Limit', 'Email', 'Token']);
    if (!ss.getSheetByName('Constraints')) ss.insertSheet('Constraints').appendRow(['User', 'Date', 'Slot']);
    if (!ss.getSheetByName('Schedule')) ss.insertSheet('Schedule').appendRow(['Key', 'Assigned User']);
    if (!ss.getSheetByName('Holidays')) ss.insertSheet('Holidays').appendRow(['Date']);

    // Sheets created before D-15: add the Token header (tokens fill in lazily).
    const usersSheet = ss.getSheetByName('Users');
    if (usersSheet.getRange(1, 1).getValue() === 'Name' && !usersSheet.getRange(1, 4).getValue()) {
        usersSheet.getRange(1, 4).setValue('Token');
    }
}

// ==========================================
// WEEKLY BACKUP (D-14)
// ==========================================

/**
 * Copies the entire spreadsheet to Drive as "RosterBackup_YYYY-MM-DD" and
 * keeps only the newest 8 copies. Installed by createBackupTrigger().
 * NOTE: uses DriveApp — the first deploy after adding this will ask for the
 * additional Drive permission during authorization.
 */
function weeklyBackup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const name = 'RosterBackup_' + formatDate(new Date());
    ss.copy(name);
    Logger.log('Backup created: ' + name);

    // Prune: keep the 8 newest backups, trash the rest.
    const files = [];
    const it = DriveApp.searchFiles("title contains 'RosterBackup_' and trashed = false");
    while (it.hasNext()) files.push(it.next());
    files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
    for (let i = 8; i < files.length; i++) {
        files[i].setTrashed(true);
        Logger.log('Trashed old backup: ' + files[i].getName());
    }
}

/**
 * Run ONCE from the editor to install the weekly backup trigger
 * (every Monday around 2:00 AM).
 */
function createBackupTrigger() {
    const exists = ScriptApp.getProjectTriggers()
        .some(t => t.getHandlerFunction() === 'weeklyBackup');
    if (exists) {
        Logger.log('Backup trigger already exists.');
        return;
    }
    ScriptApp.newTrigger('weeklyBackup')
        .timeBased()
        .onWeekDay(ScriptApp.WeekDay.MONDAY)
        .atHour(2)
        .create();
    Logger.log('Weekly backup trigger created (Mondays ~2:00 AM).');
}

// ==========================================
// AUTOMATIC SCHEDULING (CRON JOB)
// ==========================================

/**
 * Creates two time-driven triggers:
 * 1. autoSendReminderEmail on the 1st of every month at 1:00 AM.
 * 2. autoGenerateSchedule on the 5th of every month at 1:00 AM.
 * Run this function manually ONE TIME from the Apps Script editor to set it up.
 */
function createMonthlyTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    let hasReminderTrigger = false;
    let hasScheduleTrigger = false;

    // Check if triggers already exist
    for (let i = 0; i < triggers.length; i++) {
        const handlerName = triggers[i].getHandlerFunction();
        if (handlerName === 'autoSendReminderEmail') hasReminderTrigger = true;
        if (handlerName === 'autoGenerateSchedule') hasScheduleTrigger = true;
    }

    if (!hasReminderTrigger) {
        ScriptApp.newTrigger("autoSendReminderEmail")
            .timeBased()
            .onMonthDay(1)
            .atHour(1)
            .create();
        Logger.log('1st of the month reminder trigger created successfully.');
    } else {
        Logger.log('Reminder trigger already exists.');
    }

    if (!hasScheduleTrigger) {
        ScriptApp.newTrigger("autoGenerateSchedule")
            .timeBased()
            .onMonthDay(5)
            .atHour(1)
            .create();
        Logger.log('5th of the month schedule trigger created successfully.');
    } else {
        Logger.log('Schedule trigger already exists.');
    }
}

/**
 * Runs automatically on the 1st of the month to remind users to fill out next month's availability.
 */
function autoSendReminderEmail() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Determine Target Month and Year
    const today = new Date();
    // The trigger runs on the 1st of the current month. We are reminding for the NEXT month.
    let targetYear = today.getFullYear();
    let targetMonthIdx = today.getMonth() + 1; // 0-indexed + 1 = next month's index
    
    let currentMonthDisplay = today.getMonth() + 1; // The current month (deadline month)

    if (targetMonthIdx > 11) {
        targetMonthIdx = 0; // January
        targetYear++;
    }
    
    const targetMonthDisplay = targetMonthIdx + 1; // 1-12 for display purposes

    // 2. Construct and Send Emails (each with the recipient's login link)
    const subject = `[提醒] 請填寫 MO旅醫門診 ${targetYear}年${targetMonthDisplay}月 不排班時間（畫休）`;
    sendToAllUsers(ss, subject, link => `大家好，\n\n這是一封自動提醒信。\n請記得在 ${currentMonthDisplay} 月 3 日前至排班網頁填寫 ${targetMonthDisplay} 月份的不排班時間（畫休）。\n\n⚠️ 系統將於每月 5 日自動進行一鍵排班作業，若未填寫畫休，將視同隨時皆可排班，排定後請自行協調換班。\n\n排班網址（您的個人連結，請勿轉寄）：${link}\n\n謝謝！\n\n排班系統自動派發\n=================================\n此信件為系統自動產生發送，請不要直接回信`);

    Logger.log(`Successfully sent email reminders for target month ${targetYear}-${targetMonthDisplay}.`);
}

/**
 * Core auto-scheduling logic. Runs automatically on the 5th of the month.
 * It schedules duties for the NEXT month.
 */
function autoGenerateSchedule() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lock = LockService.getScriptLock();
    // Wait up to 30 seconds for other processes to finish
    if (!lock.tryLock(30000)) {
        Logger.log('Could not obtain lock, aborting autoGenerateSchedule.');
        return;
    }

    try {
        // 1. Determine Target Month and Year
        const today = new Date();
        // The trigger runs on the 5th of the current month. We are scheduling for the NEXT month.
        let targetYear = today.getFullYear();
        let targetMonthIdx = today.getMonth() + 1; // 0-indexed + 1 = next month's index
        
        if (targetMonthIdx > 11) {
            targetMonthIdx = 0; // January
            targetYear++;
        }
        
        const targetMonthDisplay = targetMonthIdx + 1; // 1-12 for display purposes
        
        // Ensure we don't accidentally overwrite an existing schedule for the target month
        const scheduleSheet = ss.getSheetByName('Schedule');
        const scheduleData = scheduleSheet.getDataRange().getValues();
        let scheduleMap = {};
        
        let startRowSchedule = (scheduleData.length > 0 && scheduleData[0][0] === "Key") ? 1 : 0;
        let hasExistingDuties = false;

        for (let i = startRowSchedule; i < scheduleData.length; i++) {
            if (scheduleData[i][0]) {
                const key = scheduleData[i][0];
                const assignedUser = scheduleData[i][1];
                scheduleMap[key] = assignedUser;

                const [dateStr, _] = key.split('_');
                const [y, m, d] = dateStr.split('-').map(Number);
                if (y === targetYear && (m - 1) === targetMonthIdx) {
                    if (assignedUser && !isUnassigned(assignedUser)) {
                        hasExistingDuties = true;
                    }
                }
            }
        }

        if (hasExistingDuties) {
            Logger.log(`Target month ${targetYear}-${targetMonthDisplay} already has a schedule. Aborting auto-generation.`);
            return;
        }

        // 2. Load Data (Users, Constraints, Holidays)
        const usersSheet = ss.getSheetByName('Users');
        const usersData = usersSheet.getDataRange().getValues();
        let users = [];
        let startRowUsers = (usersData.length > 0 && usersData[0][0] === "Name") ? 1 : 0;
        for (let i = startRowUsers; i < usersData.length; i++) {
            if (usersData[i][0]) {
                users.push({
                    name: usersData[i][0],
                    limit: parseInt(usersData[i][1]) || 4,
                    email: usersData[i][2] || ''
                });
            }
        }

        const constraintsSheet = ss.getSheetByName('Constraints');
        const constraintsData = constraintsSheet.getDataRange().getValues();
        let constraints = [];
        let startRowConst = (constraintsData.length > 0 && constraintsData[0][0] === "User" && constraintsData[0][1] === "Date") ? 1 : 0;
        for (let i = startRowConst; i < constraintsData.length; i++) {
            if (constraintsData[i][0]) {
                constraints.push({
                    user: constraintsData[i][0],
                    date: formatDate(constraintsData[i][1]),
                    slot: constraintsData[i][2]
                });
            }
        }

        const holidaysSheet = ss.getSheetByName('Holidays');
        const holidaysData = holidaysSheet.getDataRange().getValues();
        let holidays = [];
        let startRowHol = (holidaysData.length > 0 && holidaysData[0][0] === "Date") ? 1 : 0;
        for (let i = startRowHol; i < holidaysData.length; i++) {
            if (holidaysData[i][0]) {
                holidays.push(formatDate(holidaysData[i][0]));
            }
        }

        // 3. Run the shared scheduling algorithm (SHARED SCHEDULER block above —
        // the exact same code path the manual 一鍵排班 button exercises).
        scheduleMap = generateMonthSchedule({
            year: targetYear,
            month: targetMonthIdx,
            users: users,
            constraints: constraints,
            holidays: holidays,
            existingSchedule: scheduleMap
        });

        // 4. Save Schedule back to Sheet
        scheduleSheet.clear();
        scheduleSheet.appendRow(["Key", "Assigned User"]);
        const rows = [];
        for (const key in scheduleMap) {
            rows.push([key, scheduleMap[key]]);
        }
        if (rows.length > 0) {
            scheduleSheet.getRange(2, 1, rows.length, 2).setValues(rows);
        }

        Logger.log(`Successfully generated schedule for ${targetYear}-${targetMonthDisplay}.`);

        // 5. Send Notifications
        const unassignedNote = formatUnassignedNote(getUnassignedSlots(scheduleMap, targetYear, targetMonthIdx));
        const subject = `[通知] MO旅醫門診 ${targetYear}年${targetMonthDisplay}月 班表已自動排定`;
        sendToAllUsers(ss, subject, link => `大家好，\n\n系統已於今日自動完成 ${targetYear}年${targetMonthDisplay}月 的旅醫門診自動排班作業。\n請至排班網頁確認您的班表，並可以點擊班表上的「行事曆圖示」將門診時段加入您的個人 Google Calendar 中。\n(若需臨時異動，請自行協商換班)${unassignedNote}\n\n排班網頁（您的個人連結，請勿轉寄）：${link}\n\n謝謝！\n\n排班系統自動派發\n=================================\n此信件為系統自動產生發送，請不要直接回信`);

    } catch (err) {
        Logger.log("Error in autoGenerateSchedule: " + err.toString());
    } finally {
        lock.releaseLock();
    }
}

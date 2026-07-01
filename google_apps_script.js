/**
 * Google Apps Script Backend for Clinic Scheduler
 * 
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Rename the first tab to 'Users'.
 * 3. Create a second tab named 'Constraints'.
 * 4. Create a third tab named 'Schedule'.
 * 5. Create a fourth tab named 'Holidays'.
 * 6. Go to Extensions > Apps Script.
 * 7. Paste this code into Code.gs.
 * 8. Click Deploy > New Deployment.
 * 9. Select type: Web app.
 * 10. Description: "Clinic API v3 (Holidays)".
 * 11. Execute as: Me.
 * 12. Who has access: Anyone.
 * 13. Click Deploy.
 * 14. Copy the "Web app URL" and paste it into script.js as API_URL.
 */

function doGet(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Read Users
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let users = [];
    if (usersData.length > 0) {
        let startRow = (usersData[0][0] === "Name") ? 1 : 0;
        for (let i = startRow; i < usersData.length; i++) {
            if (usersData[i][0]) {
                users.push({
                    name: usersData[i][0],
                    limit: usersData[i][1] || 4,
                    email: usersData[i][2] || ''
                });
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

    const result = {
        status: 'success',
        data: { users, constraints, schedule, holidays }
    };

    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    let data;
    try {
        data = JSON.parse(e.postData.contents);
    } catch (err) {
        return errorResponse("Invalid JSON");
    }

    const action = data.action;

    // The shared-password gate is currently DISABLED — all write actions are
    // open. To re-enable it, uncomment the block below (and restore
    // getAuthToken()/PUBLIC_ACTIONS in script.js), then run setApiToken().
    //
    // const PUBLIC_ACTIONS = ['addConstraint', 'removeConstraint', 'saveSchedule'];
    // const expectedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    // if (expectedToken && PUBLIC_ACTIONS.indexOf(action) === -1 && data.token !== expectedToken) {
    //     return errorResponse("未授權：管理密碼錯誤");
    // }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        if (action === 'addUser') {
            const sheet = ss.getSheetByName('Users');
            sheet.appendRow([data.name, data.limit, data.email || '']);

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
            const usersSheet = ss.getSheetByName('Users');
            const usersData = usersSheet.getDataRange().getValues();
            let startRow = (usersData.length > 0 && usersData[0][0] === "Name") ? 1 : 0;

            const targetYear = data.year || new Date().getFullYear();
            const targetMonth = data.month || (new Date().getMonth() + 1);
            const isScheduled = data.isScheduled;

            let subject = "";
            let body = "";

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
                body = `大家好，\n\n${targetYear}年${targetMonth}月 的旅醫門診班表已經排定。\n請至排班網頁確認您的班表，並可以點擊班表上的「行事曆圖示」將門診時段加入您的個人 Google Calendar 中。${unassignedNote}\n\n排班網頁：https://drhao.github.io/clinic-scheduler/\n\n謝謝！\n\n排班系統敬上\n=================================\n此信件為系統自動產生發送，請不要直接回信`;
            } else {
                let deadlineMonth = targetMonth - 1;
                if (deadlineMonth === 0) {
                    deadlineMonth = 12; // Handle January -> December
                }

                subject = `[提醒] 請填寫 MO旅醫門診 ${targetYear}年${targetMonth}月 不排班時間`;
                body = `大家好，\n\n這是一封自動提醒信。\n請記得在 ${deadlineMonth} 月 3 日前至排班網頁填寫 ${targetMonth} 月份的不排班時間（畫休）。\n\n⚠️ 系統將於每月 5 日自動進行一鍵排班作業，若未填寫畫休，將視同隨時皆可排班，排定後請自行協調換班。\n\n排班網址：https://drhao.github.io/clinic-scheduler/\n\n謝謝！\n\n排班系統敬上\n=================================\n此信件為系統自動產生發送，請不要直接回信`;
            }

            for (let i = startRow; i < usersData.length; i++) {
                const email = usersData[i][2];
                if (email && String(email).trim() !== "") {
                    try {
                        MailApp.sendEmail({
                            to: String(email).trim(),
                            subject: subject,
                            body: body
                        });
                    } catch (e) {
                        // Ignore invalid emails or limits
                    }
                }
            }
        }

        return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return errorResponse(err.toString());
    } finally {
        lock.releaseLock();
    }
}

function errorResponse(msg) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: msg }))
        .setMimeType(ContentService.MimeType.JSON);
}

function formatDate(date) {
    if (!date) return "";
    if (typeof date === 'string') return date;
    try {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    } catch (e) {
        return String(date);
    }
}

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
        if (y === year && (m - 1) === monthIdx && scheduleMap[key] === "未安排") {
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

/**
 * Sets the shared admin password that the frontend must send for write
 * actions. Edit the password below, run this ONCE from the editor, then
 * delete the password from this file (it lives in Script Properties after).
 * To disable the gate again, run clearApiToken().
 */
function setApiToken() {
    const PASSWORD = 'CHANGE_ME'; // <-- change to your chosen admin password
    PropertiesService.getScriptProperties().setProperty('API_TOKEN', PASSWORD);
    Logger.log('API_TOKEN has been set. Remember to remove the password from setApiToken().');
}

/** Removes the admin password, reopening write actions to anyone. */
function clearApiToken() {
    PropertiesService.getScriptProperties().deleteProperty('API_TOKEN');
    Logger.log('API_TOKEN cleared. Write actions are now open.');
}

function setup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName('Users')) ss.insertSheet('Users').appendRow(['Name', 'Limit', 'Email']);
    if (!ss.getSheetByName('Constraints')) ss.insertSheet('Constraints').appendRow(['User', 'Date', 'Slot']);
    if (!ss.getSheetByName('Schedule')) ss.insertSheet('Schedule').appendRow(['Key', 'Assigned User']);
    if (!ss.getSheetByName('Holidays')) ss.insertSheet('Holidays').appendRow(['Date']);
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

    // 2. Load Users Data
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let startRowUsers = (usersData.length > 0 && usersData[0][0] === "Name") ? 1 : 0;

    // 3. Construct Email Content
    const subject = `[提醒] 請填寫 MO旅醫門診 ${targetYear}年${targetMonthDisplay}月 不排班時間（畫休）`;
    const body = `大家好，\n\n這是一封自動提醒信。\n請記得在 ${currentMonthDisplay} 月 3 日前至排班網頁填寫 ${targetMonthDisplay} 月份的不排班時間（畫休）。\n\n⚠️ 系統將於每月 5 日自動進行一鍵排班作業，若未填寫畫休，將視同隨時皆可排班，排定後請自行協調換班。\n\n排班網址：https://drhao.github.io/clinic-scheduler/\n\n謝謝！\n\n排班系統自動派發\n=================================\n此信件為系統自動產生發送，請不要直接回信`;

    // 4. Send Emails
    for (let i = startRowUsers; i < usersData.length; i++) {
        const email = usersData[i][2];
        if (email && String(email).trim() !== "") {
            try {
                MailApp.sendEmail({
                    to: String(email).trim(),
                    subject: subject,
                    body: body
                });
            } catch (e) {
                Logger.log(`Failed to send reminder email to ${email}`);
            }
        }
    }
    
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
                    if (assignedUser && assignedUser !== "Unassigned") {
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

        // 3. Fairness Seed: Calculate Yearly Counts excluding the target month
        const yearlyCounts = {};
        users.forEach(u => yearlyCounts[u.name] = 0);

        Object.keys(scheduleMap).forEach(key => {
            const [dateStr, _] = key.split('_');
            const [y, m, d] = dateStr.split('-').map(Number);

            if (y === targetYear && (m - 1) !== targetMonthIdx) {
                const assignedUser = scheduleMap[key];
                if (assignedUser && assignedUser !== "Unassigned" && yearlyCounts.hasOwnProperty(assignedUser)) {
                    yearlyCounts[assignedUser]++;
                }
            }
        });

        // Initialize Queue sorted by Yearly Count (ASC) then Name (ASC)
        let queue = [...users].sort((a, b) => {
            const countA = yearlyCounts[a.name] || 0;
            const countB = yearlyCounts[b.name] || 0;
            if (countA !== countB) return countA - countB;
            return a.name.localeCompare(b.name);
        });

        const monthlyCounts = {};
        users.forEach(u => monthlyCounts[u.name] = 0);

        // 4. Iterate over days in target month
        // We need the number of days in the target month
        // Date(year, month, 0) gives the last day of the PREVIOUS month. 
        // So Date(targetYear, targetMonthIdx + 1, 0) gives last day of targetMonthIdx.
        const lastDayObj = new Date(targetYear, targetMonthIdx + 1, 0);
        const daysInMonth = lastDayObj.getDate();

        // Helper function for assigning valid user
        function assignNextAvailable(dateStr, slot) {
            const key = `${dateStr}_${slot}`;
            let assignedUser = null;
            let foundIndex = -1;

            for (let i = 0; i < queue.length; i++) {
                const user = queue[i];

                if (monthlyCounts[user.name] >= user.limit) continue;

                const isUnavailable = constraints.some(c =>
                    c.user === user.name && c.date === dateStr && c.slot === slot
                );
                if (isUnavailable) continue;

                // Same-Day: avoid assigning the same person to both AM and PM on the same day
                const otherSlot = slot === 'AM' ? 'PM' : 'AM';
                if (scheduleMap[`${dateStr}_${otherSlot}`] === user.name) continue;

                // Found
                assignedUser = user;
                foundIndex = i;
                break;
            }

            if (assignedUser) {
                scheduleMap[key] = assignedUser.name;
                monthlyCounts[assignedUser.name]++;
                // Round Robin
                queue.push(queue.splice(foundIndex, 1)[0]);
            } else {
                scheduleMap[key] = "未安排";
            }
        }

        // Iterate Slots
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(targetYear, targetMonthIdx, d);
            if (dateObj.getDay() === 3) { // Wednesday
                const dateStr = formatDate(dateObj);

                // Clear any previous assignment for this day first, so the
                // same-day check evaluates against this run's results only.
                delete scheduleMap[`${dateStr}_AM`];
                delete scheduleMap[`${dateStr}_PM`];

                if (holidays.includes(dateStr)) {
                    continue;
                }

                assignNextAvailable(dateStr, 'AM');
                assignNextAvailable(dateStr, 'PM');
            }
        }

        // 5. Save Schedule back to Sheet
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

        // 6. Send Notifications
        const unassignedNote = formatUnassignedNote(getUnassignedSlots(scheduleMap, targetYear, targetMonthIdx));
        const subject = `[通知] MO旅醫門診 ${targetYear}年${targetMonthDisplay}月 班表已自動排定`;
        const body = `大家好，\n\n系統已於今日自動完成 ${targetYear}年${targetMonthDisplay}月 的旅醫門診自動排班作業。\n請至排班網頁確認您的班表，並可以點擊班表上的「行事曆圖示」將門診時段加入您的個人 Google Calendar 中。\n(若需臨時異動，請自行協商換班)${unassignedNote}\n\n排班網頁：https://drhao.github.io/clinic-scheduler/\n\n謝謝！\n\n排班系統自動派發\n=================================\n此信件為系統自動產生發送，請不要直接回信`;

        for (let i = startRowUsers; i < usersData.length; i++) {
            const email = usersData[i][2];
            if (email && String(email).trim() !== "") {
                try {
                    MailApp.sendEmail({
                        to: String(email).trim(),
                        subject: subject,
                        body: body
                    });
                } catch (e) {
                    Logger.log(`Failed to send email to ${email}`);
                }
            }
        }

    } catch (err) {
        Logger.log("Error in autoGenerateSchedule: " + err.toString());
    } finally {
        lock.releaseLock();
    }
}

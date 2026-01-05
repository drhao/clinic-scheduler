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
                    limit: usersData[i][1] || 4
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        if (action === 'addUser') {
            const sheet = ss.getSheetByName('Users');
            sheet.appendRow([data.name, data.limit]);

        } else if (action === 'deleteUser') {
            const sheet = ss.getSheetByName('Users');
            const values = sheet.getDataRange().getValues();
            for (let i = values.length - 1; i >= 0; i--) {
                if (values[i][0] === data.name) {
                    sheet.deleteRow(i + 1);
                }
            }

        } else if (action === 'editUser') {
            const sheet = ss.getSheetByName('Users');
            const values = sheet.getDataRange().getValues();
            for (let i = 0; i < values.length; i++) {
                if (values[i][0] === data.oldName) {
                    sheet.getRange(i + 1, 1).setValue(data.newName);
                    sheet.getRange(i + 1, 2).setValue(data.newLimit);
                }
            }

        } else if (action === 'addConstraint') {
            const sheet = ss.getSheetByName('Constraints');
            sheet.appendRow([data.user, data.date, data.slot]);

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

function setup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName('Users')) ss.insertSheet('Users').appendRow(['Name', 'Limit']);
    if (!ss.getSheetByName('Constraints')) ss.insertSheet('Constraints').appendRow(['User', 'Date', 'Slot']);
    if (!ss.getSheetByName('Schedule')) ss.insertSheet('Schedule').appendRow(['Key', 'Assigned User']);
    if (!ss.getSheetByName('Holidays')) ss.insertSheet('Holidays').appendRow(['Date']);
}

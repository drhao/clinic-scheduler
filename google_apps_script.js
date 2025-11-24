/**
 * Google Apps Script Backend for Clinic Scheduler
 * 
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Rename the first tab to 'Users'.
 * 3. Create a second tab named 'Constraints'.
 * 4. Create a third tab named 'Schedule'.
 * 5. Go to Extensions > Apps Script.
 * 6. Paste this code into Code.gs.
 * 7. Click Deploy > New Deployment.
 * 8. Select type: Web app.
 * 9. Description: "Clinic API".
 * 10. Execute as: Me.
 * 11. Who has access: Anyone. (Important for avoiding CORS issues easily)
 * 12. Click Deploy.
 * 13. Copy the "Web app URL" and paste it into script.js as API_URL.
 */

function doGet(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Read Users
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    // Assuming column A has names, skip header if exists (checking row 1)
    let users = [];
    if (usersData.length > 0) {
        // If first row is header "Name", skip it. Simple check:
        let startRow = (usersData[0][0] === "Name") ? 1 : 0;
        for (let i = startRow; i < usersData.length; i++) {
            if (usersData[i][0]) users.push(usersData[i][0]);
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
                    date: formatDate(constraintsData[i][1]), // Ensure string format
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

    const result = {
        status: 'success',
        data: { users, constraints, schedule }
    };

    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    // Handle CORS preflight if necessary (though usually GET/POST is enough for simple web apps)
    // Parse payload
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
            sheet.appendRow([data.name]);

        } else if (action === 'deleteUser') {
            const sheet = ss.getSheetByName('Users');
            const values = sheet.getDataRange().getValues();
            for (let i = values.length - 1; i >= 0; i--) {
                if (values[i][0] === data.name) {
                    sheet.deleteRow(i + 1);
                }
            }
            // Also clean up constraints? Optional but good.

        } else if (action === 'editUser') {
            const sheet = ss.getSheetByName('Users');
            const values = sheet.getDataRange().getValues();
            for (let i = 0; i < values.length; i++) {
                if (values[i][0] === data.oldName) {
                    sheet.getRange(i + 1, 1).setValue(data.newName);
                }
            }
            // Update constraints and schedule logic would be complex here, 
            // simpler to just update the name in the list for now.

        } else if (action === 'addConstraint') {
            const sheet = ss.getSheetByName('Constraints');
            sheet.appendRow([data.user, data.date, data.slot]);

        } else if (action === 'removeConstraint') {
            const sheet = ss.getSheetByName('Constraints');
            const values = sheet.getDataRange().getValues();
            // Find matching constraint
            for (let i = values.length - 1; i >= 0; i--) {
                const row = values[i];
                // Date comparison can be tricky in GAS. 
                // Assuming data.date is YYYY-MM-DD string.
                // row[1] might be Date object.
                const rowDate = formatDate(row[1]);
                if (row[0] === data.user && rowDate === data.date && row[2] === data.slot) {
                    sheet.deleteRow(i + 1);
                    break; // Delete one match
                }
            }

        } else if (action === 'saveSchedule') {
            const sheet = ss.getSheetByName('Schedule');
            // Clear old schedule or just append/update?
            // Simplest: Clear all and rewrite current state (or just update keys)
            // For this app, let's just clear and rewrite the whole schedule map to keep it synced
            sheet.clear();
            sheet.appendRow(["Key", "Assigned User"]); // Header
            const scheduleMap = data.schedule;
            const rows = [];
            for (const key in scheduleMap) {
                rows.push([key, scheduleMap[key]]);
            }
            if (rows.length > 0) {
                sheet.getRange(2, 1, rows.length, 2).setValues(rows);
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
    if (typeof date === 'string') return date; // Already string
    // If Date object
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
    // Run this once to create sheets if they don't exist
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName('Users')) ss.insertSheet('Users').appendRow(['Name']);
    if (!ss.getSheetByName('Constraints')) ss.insertSheet('Constraints').appendRow(['User', 'Date', 'Slot']);
    if (!ss.getSheetByName('Schedule')) ss.insertSheet('Schedule').appendRow(['Key', 'Assigned User']);
}

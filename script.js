/**
 * Clinic Scheduler SPA
 * 
 * Data Structures:
 * 
 * users: Array<string>
 * constraints: Array<Object> { user, date, slot }
 * schedule: Object { "YYYY-MM-DD_AM": "User" }
 */

// CONFIGURATION
// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
const API_URL = "https://script.google.com/macros/s/AKfycbwPm4NPYv9xYyN4YGPzkXiGI-1ChO5zMy4KUNLX4Vnm-Y5w-j2jo4kjufAKgXnuJ7d6/exec";

// State
let currentDate = new Date();
let users = []; // Array of { name: string, limit: number }
let constraints = [];
let schedule = {};
let holidays = []; // Array of date strings "YYYY-MM-DD"
let isLoading = false;

// Sentinel written into the schedule when no eligible doctor could be found.
// "Unassigned" is the legacy English value; accept both when reading.
const UNASSIGNED = "未安排";
function isUnassigned(name) {
    return name === UNASSIGNED || name === "Unassigned";
}

// DOM Elements
const calendarGrid = document.getElementById('calendar-grid');
const currentMonthLabel = document.getElementById('current-month-label');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const generateBtn = document.getElementById('generate-btn');
const userSelect = document.getElementById('user-select');
const datePicker = document.getElementById('date-picker');
const amCheck = document.getElementById('am-check');
const pmCheck = document.getElementById('pm-check');
const addConstraintBtn = document.getElementById('add-constraint-btn');
const constraintsUl = document.getElementById('constraints-ul');
const userListUl = document.getElementById('user-list-ul');
const newUserNameInput = document.getElementById('new-user-name');
const newUserEmailInput = document.getElementById('new-user-email');
const newUserLimitInput = document.getElementById('new-user-limit');
const addUserBtn = document.getElementById('add-user-btn');
const clearYearBtn = document.getElementById('clear-year-btn');
const dutyCountsTableBody = document.querySelector('#duty-counts-table tbody');
const yearlyDutyCountsTableBody = document.querySelector('#yearly-duty-counts-table tbody');

// Initialization
function init() {
    // Modal Elements (Fetch inside init to ensure they exist)
    const guideModal = document.getElementById('guide-modal');
    const helpBtn = document.getElementById('help-btn');
    const closeGuideBtn = document.getElementById('close-guide-btn');

    if (API_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE") {
        alert("Please configure the API_URL in script.js with your Google Apps Script deployment URL.");
    }

    fetchData();

    // Event Listeners
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));
    addConstraintBtn.addEventListener('click', addConstraint);
    generateBtn.addEventListener('click', generateSchedule);
    addUserBtn.addEventListener('click', addUser);
    const remindBtn = document.getElementById('remind-btn');
    if (remindBtn) remindBtn.addEventListener('click', sendReminders);
    if (clearYearBtn) clearYearBtn.addEventListener('click', clearScheduleForYear);

    // Modal Event Listeners
    if (helpBtn && guideModal) {
        helpBtn.addEventListener('click', () => {
            guideModal.style.display = 'flex';
        });
    } else {
        console.error("Help button or guide modal not found");
    }

    if (closeGuideBtn && guideModal) {
        closeGuideBtn.addEventListener('click', () => {
            guideModal.style.display = 'none';
        });
    }

    // Edit-user modal
    const editUserModal = document.getElementById('edit-user-modal');
    const saveEditUserBtn = document.getElementById('save-edit-user-btn');
    const cancelEditUserBtn = document.getElementById('cancel-edit-user-btn');
    const closeEditUserBtn = document.getElementById('close-edit-user-btn');
    if (saveEditUserBtn) saveEditUserBtn.addEventListener('click', saveEditUser);
    if (cancelEditUserBtn) cancelEditUserBtn.addEventListener('click', closeEditUserModal);
    if (closeEditUserBtn) closeEditUserBtn.addEventListener('click', closeEditUserModal);

    // Manual assign / swap modal
    const assignSlotModal = document.getElementById('assign-slot-modal');
    const saveAssignSlotBtn = document.getElementById('save-assign-slot-btn');
    const cancelAssignSlotBtn = document.getElementById('cancel-assign-slot-btn');
    const closeAssignSlotBtn = document.getElementById('close-assign-slot-btn');
    if (saveAssignSlotBtn) saveAssignSlotBtn.addEventListener('click', saveAssignSlot);
    if (cancelAssignSlotBtn) cancelAssignSlotBtn.addEventListener('click', closeAssignSlotModal);
    if (closeAssignSlotBtn) closeAssignSlotBtn.addEventListener('click', closeAssignSlotModal);

    window.addEventListener('click', (e) => {
        if (guideModal && e.target === guideModal) {
            guideModal.style.display = 'none';
        }
        if (editUserModal && e.target === editUserModal) {
            closeEditUserModal();
        }
        if (assignSlotModal && e.target === assignSlotModal) {
            closeAssignSlotModal();
        }
    });
}

async function sendReminders() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Check if the current month already has scheduled duties
    let hasExistingDuties = false;
    Object.keys(schedule).forEach(key => {
        const [dateStr, _] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);
        if (y === year && (m - 1) === month) {
            const assignedUser = schedule[key];
            if (assignedUser && assignedUser !== "Unassigned") {
                hasExistingDuties = true;
            }
        }
    });

    const monthName = month + 1;
    let confirmMsg = "";

    if (hasExistingDuties) {
        confirmMsg = `目前畫面上 ${year}年${monthName}月 的班表「已經排班完成」。\n\n確定要發送【已完成班表】通知信給所有人嗎？`;
    } else {
        confirmMsg = `目前畫面上 ${year}年${monthName}月 的班表「尚未排班」。\n\n確定要發送【填寫畫休時間提醒】通知信給所有人嗎？`;
    }

    if (!confirm(confirmMsg)) return;

    const success = await postData('sendReminders', {
        year: year,
        month: monthName,
        isScheduled: hasExistingDuties
    });

    if (success) {
        alert("通知信已發送成功！");
    }
}

// API Helpers
async function fetchData() {
    setLoading(true);
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        if (result.status === 'success') {
            users = result.data.users;
            constraints = result.data.constraints;
            schedule = result.data.schedule;
            holidays = result.data.holidays || [];

            renderAll();
        } else {
            console.error("API Error:", result.message);
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        // Fallback for demo
        if (users.length === 0) users = [{ name: "測試人員 A", limit: 4 }, { name: "測試人員 B", limit: 4 }];
        renderAll();
    } finally {
        setLoading(false);
    }
}

// NOTE: The admin-password gate is currently DISABLED — no action requires a
// password and none is prompted for or sent. To re-enable it, restore
// getAuthToken()/PUBLIC_ACTIONS here and the token check in google_apps_script.js
// doPost (see git history), then run setApiToken() in the Apps Script editor.

async function postData(action, payload) {
    setLoading(true);
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action, ...payload })
        });
        const result = await response.json();
        if (result.status !== 'success') {
            alert("Error saving data: " + result.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error("Post Error:", err);
        alert("Network error. Check console.");
        return false;
    } finally {
        setLoading(false);
    }
}

function setLoading(loading) {
    isLoading = loading;
    document.body.style.cursor = loading ? 'wait' : 'default';
    generateBtn.disabled = loading;
    addConstraintBtn.disabled = loading;
    addUserBtn.disabled = loading;
}

// Optimistic-update safety net: snapshot state before a local mutation, and
// restore it if the backend sync fails so the UI never silently diverges.
function snapshotState() {
    return {
        users: JSON.parse(JSON.stringify(users)),
        constraints: JSON.parse(JSON.stringify(constraints)),
        schedule: JSON.parse(JSON.stringify(schedule)),
        holidays: JSON.parse(JSON.stringify(holidays))
    };
}

function restoreState(snap) {
    users = snap.users;
    constraints = snap.constraints;
    schedule = snap.schedule;
    holidays = snap.holidays;
    renderAll();
}

function renderAll() {
    renderCalendar();
    renderConstraints();
    renderUserList();
    updateUserSelect();
    renderDutyCounts();
    renderYearlyDutyCounts();
}

// Calendar Logic
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
    renderConstraints(); // Update list when month changes
    renderDutyCounts(); // Update counts when month changes
    renderYearlyDutyCounts(); // Update yearly counts (year might change)
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Update Header
    const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月",
        "七月", "八月", "九月", "十月", "十一月", "十二月"
    ];
    currentMonthLabel.textContent = `${year}年 ${monthNames[month]}`;

    // Clear Grid
    calendarGrid.innerHTML = '';

    // Render Day Headers
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    days.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell header';
        cell.textContent = day;
        calendarGrid.appendChild(cell);
    });

    // Calculate days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayIndex = firstDay.getDay(); // 0 = Sunday

    // Empty cells before first day
    for (let i = 0; i < startDayIndex; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell disabled';
        calendarGrid.appendChild(cell);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const dayOfWeek = dateObj.getDay();
        const dateStr = formatDate(dateObj);

        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const dayNum = document.createElement('div');
        dayNum.className = 'day-number';
        dayNum.textContent = d;
        cell.appendChild(dayNum);

        // Highlight Wednesday (3)
        if (dayOfWeek === 3) {
            cell.classList.add('wednesday');

            const isHoliday = holidays.includes(dateStr);
            if (isHoliday) cell.classList.add('holiday');

            // Holiday Checkbox
            const holidayCheckContainer = document.createElement('div');
            holidayCheckContainer.className = 'holiday-check-container';
            const holidayCheck = document.createElement('input');
            holidayCheck.type = 'checkbox';
            holidayCheck.checked = isHoliday;
            holidayCheck.title = "設為假日";
            holidayCheck.onchange = (e) => toggleHoliday(dateStr, e.target.checked);

            const holidayLabel = document.createElement('span');
            holidayLabel.textContent = "假日";

            holidayCheckContainer.appendChild(holidayCheck);
            holidayCheckContainer.appendChild(holidayLabel);
            cell.appendChild(holidayCheckContainer);

            if (isHoliday) {
                const holidayMsg = document.createElement('div');
                holidayMsg.className = 'holiday-msg';
                holidayMsg.textContent = "停診";
                cell.appendChild(holidayMsg);
            } else {
                // Render Slots
                const amKey = `${dateStr}_AM`;
                const pmKey = `${dateStr}_PM`;

                const amUser = schedule[amKey] || '-';
                const pmUser = schedule[pmKey] || '-';

                cell.appendChild(buildScheduleSlot('AM', amUser, dateStr));
                cell.appendChild(buildScheduleSlot('PM', pmUser, dateStr));
            }
        }

        calendarGrid.appendChild(cell);
    }
}

async function toggleHoliday(dateStr, isChecked) {
    if (isChecked) {
        if (!holidays.includes(dateStr)) {
            const [y, m, d] = dateStr.split('-').map(Number);

            // 防呆：若當天已經有排班，設為假日會清除這些班，先列出來確認
            const amUser = schedule[`${dateStr}_AM`];
            const pmUser = schedule[`${dateStr}_PM`];
            const assigned = [];
            if (amUser && !isUnassigned(amUser)) assigned.push(`　上午：${amUser}`);
            if (pmUser && !isUnassigned(pmUser)) assigned.push(`　下午：${pmUser}`);

            let confirmMsg;
            if (assigned.length > 0) {
                confirmMsg = `⚠️ ${y}年${m}月${d}日 這天已經有排班：\n${assigned.join('\n')}\n\n設為假日（停診）將會「清除」以上排班，且無法復原。\n\n確定要繼續嗎？`;
            } else {
                confirmMsg = `確定要將 ${y}年${m}月${d}日 設為假日（停診）嗎？\n\n設為假日後，這天將不會排任何人。`;
            }

            if (!confirm(confirmMsg)) {
                renderCalendar(); // 使用者取消，還原勾選狀態
                return;
            }

            const snap = snapshotState();
            holidays.push(dateStr);
            // Clear schedule for this date if it exists
            delete schedule[`${dateStr}_AM`];
            delete schedule[`${dateStr}_PM`];

            const ok = await postData('addHoliday', { date: dateStr });
            if (!ok) { restoreState(snap); return; }
            const ok2 = await postData('saveSchedule', { schedule });
            if (!ok2) { restoreState(snap); return; }
        }
    } else {
        const idx = holidays.indexOf(dateStr);
        if (idx !== -1) {
            const snap = snapshotState();
            holidays.splice(idx, 1);
            const ok = await postData('removeHoliday', { date: dateStr });
            if (!ok) { restoreState(snap); return; }
        }
    }
    renderCalendar();
    renderDutyCounts(); // Schedule might change (cleared slots)
    renderYearlyDutyCounts();
}

// Builds one AM/PM schedule cell. The doctor name is set via textContent
// (never innerHTML) so a name can never inject markup. Clicking the slot opens
// the manual assign/swap modal.
function buildScheduleSlot(slot, user, dateStr) {
    const div = document.createElement('div');
    div.className = 'schedule-slot';
    if (isUnassigned(user)) div.classList.add('unassigned');
    div.title = '點擊指派 / 換班';
    div.addEventListener('click', () => openAssignModal(dateStr, slot));

    const inner = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = slot;
    inner.appendChild(strong);
    inner.appendChild(document.createTextNode(' ' + user));
    div.appendChild(inner);

    if (user !== '-' && !isUnassigned(user)) {
        div.appendChild(createGCalLink(user, dateStr, slot));
    }
    return div;
}

// Google Calendar Helper
function createGCalLink(titlePrefix, dateStr, slot) {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'gcal-btn';
    a.title = '加入行事曆';
    // Use an SVG calendar icon instead of just text
    a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="15" x2="12" y2="15"></line></svg>`;

    a.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation(); // don't also trigger the slot's assign-modal click

        // Slot timings (Example: AM 09:00-12:00, PM 13:30-16:30)
        let startTime = '090000';
        let endTime = '120000';
        if (slot === 'PM') {
            startTime = '133000';
            endTime = '163000';
        }

        const formattedDate = dateStr.replace(/-/g, '');
        const details = encodeURIComponent('支援台大旅醫門診');
        const text = encodeURIComponent(`旅醫門診`);
        // Note: Z assumes UTC, better to omit Z and use local time parameters if strictly necessary, but Google usually parses this as local if no timezone is provided explicitly without Z. Let's send local time.

        // Correct time format for Google Calendar (local time without Z)
        const localDates = `${formattedDate}T${startTime}/${formattedDate}T${endTime}`;

        const url = `https://calendar.google.com/calendar/r/eventedit?text=${text}&dates=${localDates}&details=${details}`;
        window.open(url, '_blank');
    };
    return a;
}

// Constraint Management
async function addConstraint() {
    const user = userSelect.value;
    const date = datePicker.value;
    const isAm = amCheck.checked;
    const isPm = pmCheck.checked;

    if (!user || !date || (!isAm && !isPm)) {
        alert("請選擇人員、日期，並最少勾選一個時段（上午或下午）。");
        return;
    }

    // Check for duplicates and create new constraints array
    const newConstraints = [];
    if (isAm) {
        if (!constraints.some(c => c.user === user && c.date === date && c.slot === 'AM')) {
            newConstraints.push({ user, date, slot: 'AM' });
        }
    }
    if (isPm) {
        if (!constraints.some(c => c.user === user && c.date === date && c.slot === 'PM')) {
            newConstraints.push({ user, date, slot: 'PM' });
        }
    }

    if (newConstraints.length === 0) {
        alert("該人員在指定的日期和時段已經有填寫紀錄，請勿重複新增。");
        return;
    }

    // Optimistic Update
    const snap = snapshotState();
    constraints.push(...newConstraints);
    renderConstraints();

    // Sync with Backend
    for (const c of newConstraints) {
        const ok = await postData('addConstraint', c);
        if (!ok) {
            restoreState(snap);
            return;
        }
    }

    // Reset inputs
    amCheck.checked = false;
    pmCheck.checked = false;
}

function renderConstraints() {
    constraintsUl.innerHTML = '';

    // Filter by current month and year
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const filteredConstraints = constraints.filter(c => {
        // c.date is YYYY-MM-DD string
        const [y, m, d] = c.date.split('-').map(Number);
        // Note: m in date string is 1-12, getMonth() is 0-11
        return y === currentYear && (m - 1) === currentMonth;
    }).sort((a, b) => {
        // Sort by User Name, then by Date
        const nameComparison = a.user.localeCompare(b.user);
        if (nameComparison !== 0) return nameComparison;
        return a.date.localeCompare(b.date);
    });

    if (filteredConstraints.length === 0) {
        constraintsUl.innerHTML = '<li style="color: #888; font-style: italic;">本月份無不排班時間</li>';
        return;
    }

    filteredConstraints.forEach((c) => {
        // We need the original index to delete correctly from the main array
        // So let's find the index in the main 'constraints' array
        const originalIndex = constraints.indexOf(c);

        const li = document.createElement('li');

        const label = document.createElement('span');
        label.textContent = `${c.user} – ${c.date} (${c.slot})`;

        const del = document.createElement('span');
        del.className = 'delete-constraint';
        del.textContent = '×';
        del.addEventListener('click', () => removeConstraint(originalIndex));

        li.appendChild(label);
        li.appendChild(del);
        constraintsUl.appendChild(li);
    });
}

window.removeConstraint = async function (index) {
    const c = constraints[index];

    // Optimistic Update
    const snap = snapshotState();
    constraints.splice(index, 1);
    renderConstraints();

    // Sync
    const ok = await postData('removeConstraint', { user: c.user, date: c.date, slot: c.slot });
    if (!ok) restoreState(snap);
}

// User Management
function renderUserList() {
    userListUl.innerHTML = '';
    users.forEach((user, index) => {
        const li = document.createElement('li');
        li.className = 'user-list-item';

        const info = document.createElement('div');
        info.style.cssText = 'display: flex; flex-direction: column; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 70%;';

        const nameSpan = document.createElement('span');
        nameSpan.id = `user-name-${index}`;
        nameSpan.textContent = `${user.name} (Max: ${user.limit})`;

        const emailSpan = document.createElement('span');
        emailSpan.style.cssText = 'font-size: 0.75rem; color: var(--text-light);';
        emailSpan.textContent = user.email || '尚未設定 Email';

        info.appendChild(nameSpan);
        info.appendChild(emailSpan);

        const actions = document.createElement('div');
        actions.className = 'user-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-user-btn';
        editBtn.textContent = '編輯';
        editBtn.addEventListener('click', () => editUser(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-user-btn';
        deleteBtn.textContent = '刪除';
        deleteBtn.addEventListener('click', () => deleteUser(index));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        li.appendChild(info);
        li.appendChild(actions);
        userListUl.appendChild(li);
    });
}

function updateUserSelect() {
    userSelect.innerHTML = '';
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = user.name;
        userSelect.appendChild(option);
    });
}

async function addUser() {
    const name = newUserNameInput.value.trim();
    const limit = parseInt(newUserLimitInput.value, 10);
    const email = newUserEmailInput ? newUserEmailInput.value.trim() : '';

    if (!name || isNaN(limit) || limit < 1) {
        alert("請輸入有效的姓名與每月上限。");
        return;
    }

    if (users.some(u => u.name === name)) {
        alert("此人員已存在！");
        return;
    }

    // Optimistic
    const snap = snapshotState();
    users.push({ name, limit, email });
    renderUserList();
    updateUserSelect();
    renderDutyCounts();
    renderYearlyDutyCounts();

    // Sync
    const ok = await postData('addUser', { name, limit, email });
    if (!ok) {
        restoreState(snap);
        return;
    }

    // Clear inputs only once the add is confirmed
    newUserNameInput.value = '';
    if (newUserEmailInput) newUserEmailInput.value = '';
    newUserLimitInput.value = '4';
}

window.deleteUser = async function (index) {
    const userToDelete = users[index].name;
    if (confirm(`確定要刪除「${userToDelete}」嗎？這將會一併移除他在系統中所有設定好的不排班時間，已排定的班則會變成「未安排」。`)) {
        // Optimistic
        const snap = snapshotState();
        users.splice(index, 1);
        constraints = constraints.filter(c => c.user !== userToDelete);

        // Release any duties this user was assigned to, marking them unassigned
        // so they show up (in red) as needing cover rather than vanishing.
        let scheduleChanged = false;
        Object.keys(schedule).forEach(key => {
            if (schedule[key] === userToDelete) {
                schedule[key] = UNASSIGNED;
                scheduleChanged = true;
            }
        });

        renderUserList();
        updateUserSelect();
        renderConstraints();
        renderCalendar();
        renderDutyCounts();
        renderYearlyDutyCounts();

        // Sync
        const ok = await postData('deleteUser', { name: userToDelete });
        if (!ok) {
            restoreState(snap);
            return;
        }
        if (scheduleChanged) {
            const ok2 = await postData('saveSchedule', { schedule });
            if (!ok2) restoreState(snap);
        }
    }
}

// Index of the user currently open in the edit modal (-1 = none).
let editingUserIndex = -1;

window.editUser = function (index) {
    editingUserIndex = index;
    const u = users[index];
    document.getElementById('edit-user-name').value = u.name;
    document.getElementById('edit-user-limit').value = u.limit;
    document.getElementById('edit-user-email').value = u.email || '';
    document.getElementById('edit-user-modal').style.display = 'flex';
    document.getElementById('edit-user-name').focus();
};

function closeEditUserModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
    editingUserIndex = -1;
}

async function saveEditUser() {
    if (editingUserIndex < 0) return;
    const index = editingUserIndex;
    const oldUser = users[index];

    const trimmedName = document.getElementById('edit-user-name').value.trim();
    const newLimit = parseInt(document.getElementById('edit-user-limit').value, 10);
    const newEmail = document.getElementById('edit-user-email').value.trim();

    if (!trimmedName || isNaN(newLimit) || newLimit < 1) {
        alert("輸入無效，請檢查姓名與每月上限。");
        return;
    }
    if (trimmedName !== oldUser.name && users.some(u => u.name === trimmedName)) {
        alert("名稱已存在！");
        return;
    }

    const snap = snapshotState();
    const oldName = oldUser.name;

    // Optimistic update
    users[index] = { name: trimmedName, limit: newLimit, email: newEmail };
    if (oldName !== trimmedName) {
        constraints.forEach(c => {
            if (c.user === oldName) c.user = trimmedName;
        });
        Object.keys(schedule).forEach(key => {
            if (schedule[key] === oldName) schedule[key] = trimmedName;
        });
    }

    renderUserList();
    updateUserSelect();
    renderConstraints();
    renderCalendar();
    renderDutyCounts();
    renderYearlyDutyCounts();
    closeEditUserModal();

    const ok = await postData('editUser', { oldName, newName: trimmedName, newLimit, newEmail });
    if (!ok) restoreState(snap);
}

// ---- Manual slot assignment / swap ----
// The "YYYY-MM-DD_AM|PM" key currently open in the assign modal (null = closed).
let assigningSlotKey = null;

function openAssignModal(dateStr, slot) {
    assigningSlotKey = `${dateStr}_${slot}`;
    const slotName = slot === 'AM' ? '上午' : '下午';
    document.getElementById('assign-slot-info').textContent = `${dateStr}（${slotName}）`;

    // Monthly counts for this slot's month, to flag who is near their limit.
    const [y, m] = dateStr.split('-').map(Number);
    const monthlyCounts = {};
    users.forEach(u => monthlyCounts[u.name] = 0);
    Object.keys(schedule).forEach(key => {
        const [ds] = key.split('_');
        const [yy, mm] = ds.split('-').map(Number);
        if (yy === y && mm === m) {
            const who = schedule[key];
            if (!isUnassigned(who) && monthlyCounts.hasOwnProperty(who)) monthlyCounts[who]++;
        }
    });

    const otherUser = schedule[`${dateStr}_${slot === 'AM' ? 'PM' : 'AM'}`];
    const current = schedule[assigningSlotKey];

    const select = document.getElementById('assign-slot-select');
    select.innerHTML = '';

    // First option: leave the slot unassigned.
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— 未安排 —';
    if (!current || current === '-' || isUnassigned(current)) none.selected = true;
    select.appendChild(none);

    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.name;
        const flags = [];
        if (constraints.some(c => c.user === u.name && c.date === dateStr && c.slot === slot)) flags.push('已畫休');
        if (otherUser === u.name) flags.push('同日已排');
        const atLimit = monthlyCounts[u.name] >= u.limit ? ' 已達上限' : '';
        let label = `${u.name}（本月 ${monthlyCounts[u.name]}/${u.limit}${atLimit}）`;
        if (flags.length) label += ' ⚠️ ' + flags.join('、');
        opt.textContent = label;
        if (current === u.name) opt.selected = true;
        select.appendChild(opt);
    });

    document.getElementById('assign-slot-modal').style.display = 'flex';
}

function closeAssignSlotModal() {
    document.getElementById('assign-slot-modal').style.display = 'none';
    assigningSlotKey = null;
}

async function saveAssignSlot() {
    if (!assigningSlotKey) return;
    const key = assigningSlotKey;
    const [dateStr, slot] = key.split('_');
    const chosen = document.getElementById('assign-slot-select').value; // '' = unassigned

    // Manual assignment is an override, but warn when it breaks a rule.
    if (chosen) {
        const warnings = [];
        if (constraints.some(c => c.user === chosen && c.date === dateStr && c.slot === slot)) {
            warnings.push('・該醫師當天此時段有畫休');
        }
        if (schedule[`${dateStr}_${slot === 'AM' ? 'PM' : 'AM'}`] === chosen) {
            warnings.push('・該醫師同一天已被排另一個時段');
        }
        if (warnings.length && !confirm(`此指派有以下提醒：\n${warnings.join('\n')}\n\n仍要指派嗎？`)) {
            return; // keep the modal open so they can pick someone else
        }
    }

    const newValue = chosen || UNASSIGNED;
    if (schedule[key] === newValue) { closeAssignSlotModal(); return; } // no change

    // Optimistic update with rollback
    const snap = snapshotState();
    schedule[key] = newValue;

    renderCalendar();
    renderDutyCounts();
    renderYearlyDutyCounts();
    closeAssignSlotModal();

    const ok = await postData('saveSchedule', { schedule });
    if (!ok) restoreState(snap);
}

// Scheduling Algorithm — delegates to the shared, unit-tested scheduler.js
async function generateSchedule() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Check if the current month already has scheduled duties
    let hasExistingDuties = false;
    Object.keys(schedule).forEach(key => {
        const [dateStr, _] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);
        if (y === year && (m - 1) === month) {
            if (!isUnassigned(schedule[key]) && schedule[key]) {
                hasExistingDuties = true;
            }
        }
    });

    if (hasExistingDuties) {
        if (!confirm("本月份已經有排班資料了，這樣會把舊的排班資料洗掉重新排班，確定要清除嗎？")) {
            return; // Cancelled
        }
    }

    const snap = snapshotState();
    schedule = Scheduler.generateMonthSchedule({
        year, month, users, constraints, holidays, existingSchedule: schedule
    });

    renderCalendar();
    renderDutyCounts();
    renderYearlyDutyCounts();

    // Sync Schedule (roll back the UI if the save fails)
    const ok = await postData('saveSchedule', { schedule });
    if (!ok) restoreState(snap);
}

function renderDutyCounts() {
    if (!dutyCountsTableBody) return;
    dutyCountsTableBody.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Initialize counts
    const counts = {};
    users.forEach(u => counts[u.name] = 0);

    // Count duties for current month
    Object.keys(schedule).forEach(key => {
        // key format: YYYY-MM-DD_AM or YYYY-MM-DD_PM
        const [dateStr, slot] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);

        if (y === year && (m - 1) === month) {
            const assignedUser = schedule[key];
            if (assignedUser && !isUnassigned(assignedUser) && counts.hasOwnProperty(assignedUser)) {
                counts[assignedUser]++;
            }
        }
    });

    // Render rows
    users.forEach(u => {
        const row = document.createElement('tr');
        const count = counts[u.name];
        const isAtLimit = count >= u.limit;

        const nameTd = document.createElement('td');
        nameTd.textContent = u.name;

        const countTd = document.createElement('td');
        countTd.textContent = count;
        if (isAtLimit) countTd.style.cssText = 'color: var(--danger-main); font-weight: bold;';

        const limitTd = document.createElement('td');
        limitTd.textContent = u.limit;

        row.appendChild(nameTd);
        row.appendChild(countTd);
        row.appendChild(limitTd);
        dutyCountsTableBody.appendChild(row);
    });
}

function renderYearlyDutyCounts() {
    if (!yearlyDutyCountsTableBody) return;
    yearlyDutyCountsTableBody.innerHTML = '';

    const year = new Date().getFullYear();

    // Update Header
    const yearlyHeader = document.querySelector('#yearly-duty-counts-table th:nth-child(2)');
    if (yearlyHeader) yearlyHeader.textContent = `${year} 總排班次數`;

    // Initialize counts and breakdown
    const counts = {};
    const breakdown = {}; // { "User": { 0: 2, 1: 3... } } (Month index -> count)

    users.forEach(u => {
        counts[u.name] = 0;
        breakdown[u.name] = {};
    });

    // Track unique slots to prevent double counting (e.g. '2026-01-01_AM' vs '2026-1-1_AM')
    const processedSlots = new Set();

    // Count duties for current year
    Object.keys(schedule).forEach(key => {
        const [dateStr, slot] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);

        // Normalize unique key: YYYY-MM-DD-SLOT (ensure MM/DD are padded or standard)
        // using indices: y, m-1, d
        const uniqueKey = `${y}-${m}-${d}-${slot}`;

        if (y === year) {
            if (processedSlots.has(uniqueKey)) return; // Skip duplicate representation
            processedSlots.add(uniqueKey);

            let assignedUser = schedule[key];
            if (assignedUser && !isUnassigned(assignedUser)) {
                // Ensure robustness
                assignedUser = String(assignedUser).trim();

                if (counts.hasOwnProperty(assignedUser)) {
                    counts[assignedUser]++;

                    // Add to breakdown
                    if (!breakdown[assignedUser][m - 1]) breakdown[assignedUser][m - 1] = 0;
                    breakdown[assignedUser][m - 1]++;
                }
            }
        }
    });

    // Month Names for Tooltip
    const monthNamesShort = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

    // Render rows
    users.forEach(u => {
        const row = document.createElement('tr');

        // Generate Tooltip Text
        let tooltipText = `${u.name} 的排班明細：\n`;
        const userBreakdown = breakdown[u.name];
        let hasData = false;

        Object.keys(userBreakdown).sort((a, b) => a - b).forEach(monthIdx => {
            tooltipText += `${monthNamesShort[monthIdx]}: ${userBreakdown[monthIdx]} 次\n`;
            hasData = true;
        });

        if (!hasData) tooltipText += "本年度尚未被分配排班。";

        const nameTd = document.createElement('td');
        nameTd.textContent = u.name;

        const countTd = document.createElement('td');
        countTd.textContent = counts[u.name];
        countTd.title = tooltipText; // .title is plain text — safe against markup in names
        countTd.style.cssText = 'cursor: help; text-decoration: underline dotted; text-underline-offset: 4px;';

        row.appendChild(nameTd);
        row.appendChild(countTd);
        yearlyDutyCountsTableBody.appendChild(row);
    });
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function clearScheduleForYear() {
    const year = new Date().getFullYear();

    if (!confirm(`【警告】此功能將會清除 ${year} 年「一整年」所有的排班資料！\n\n這通常只在每年年底準備跨入新的一年，需要歸零所有人的排班次數統計時才使用。\n\n確定要清除嗎？（此動作無法復原）`)) {
        return;
    }

    // Identify keys to remove
    const keysToRemove = [];
    Object.keys(schedule).forEach(key => {
        const [dateStr, _] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);

        if (y === year) {
            keysToRemove.push(key);
        }
    });

    if (keysToRemove.length === 0) {
        alert(`${year} 年目前沒有任何排班資料需要清除。`);
        return;
    }

    // Remove locally
    const snap = snapshotState();
    keysToRemove.forEach(k => delete schedule[k]);

    renderAll();

    // Sync (Overwrite schedule)
    const ok = await postData('saveSchedule', { schedule });
    if (!ok) {
        restoreState(snap);
        return;
    }

    alert(`成功清除了 ${keysToRemove.length} 筆位於 ${year} 年的排班資料。`);
}

// Run
init();

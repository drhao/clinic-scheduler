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
const newUserLimitInput = document.getElementById('new-user-limit');
const addUserBtn = document.getElementById('add-user-btn');
const dutyCountsTableBody = document.querySelector('#duty-counts-table tbody');
const yearlyDutyCountsTableBody = document.querySelector('#yearly-duty-counts-table tbody');

// Initialization
function init() {
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
        if (users.length === 0) users = [{ name: "Dr. A", limit: 4 }, { name: "Dr. B", limit: 4 }];
        renderAll();
    } finally {
        setLoading(false);
    }
}

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
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    currentMonthLabel.textContent = `${monthNames[month]} ${year}`;

    // Clear Grid
    calendarGrid.innerHTML = '';

    // Render Day Headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
            holidayCheck.title = "Mark as Holiday";
            holidayCheck.onchange = (e) => toggleHoliday(dateStr, e.target.checked);

            const holidayLabel = document.createElement('span');
            holidayLabel.textContent = "Holiday";

            holidayCheckContainer.appendChild(holidayCheck);
            holidayCheckContainer.appendChild(holidayLabel);
            cell.appendChild(holidayCheckContainer);

            if (isHoliday) {
                const holidayMsg = document.createElement('div');
                holidayMsg.className = 'holiday-msg';
                holidayMsg.textContent = "No Duty";
                cell.appendChild(holidayMsg);
            } else {
                // Render Slots
                const amKey = `${dateStr}_AM`;
                const pmKey = `${dateStr}_PM`;

                const amSlot = document.createElement('div');
                amSlot.className = 'schedule-slot';
                amSlot.innerHTML = `<strong>AM</strong> ${schedule[amKey] || '-'}`;

                const pmSlot = document.createElement('div');
                pmSlot.className = 'schedule-slot';
                pmSlot.innerHTML = `<strong>PM</strong> ${schedule[pmKey] || '-'}`;

                cell.appendChild(amSlot);
                cell.appendChild(pmSlot);
            }
        }

        calendarGrid.appendChild(cell);
    }
}

async function toggleHoliday(dateStr, isChecked) {
    if (isChecked) {
        if (!holidays.includes(dateStr)) {
            holidays.push(dateStr);
            await postData('addHoliday', { date: dateStr });

            // Clear schedule for this date if it exists
            delete schedule[`${dateStr}_AM`];
            delete schedule[`${dateStr}_PM`];
            await postData('saveSchedule', { schedule });
        }
    } else {
        const idx = holidays.indexOf(dateStr);
        if (idx !== -1) {
            holidays.splice(idx, 1);
            await postData('removeHoliday', { date: dateStr });
        }
    }
    renderCalendar();
    renderDutyCounts(); // Schedule might change (cleared slots)
    renderYearlyDutyCounts();
}

// Constraint Management
async function addConstraint() {
    const user = userSelect.value;
    const date = datePicker.value;
    const isAm = amCheck.checked;
    const isPm = pmCheck.checked;

    if (!user || !date || (!isAm && !isPm)) {
        alert("Please select a user, date, and at least one time slot.");
        return;
    }

    // Optimistic Update
    const newConstraints = [];
    if (isAm) newConstraints.push({ user, date, slot: 'AM' });
    if (isPm) newConstraints.push({ user, date, slot: 'PM' });

    constraints.push(...newConstraints);
    renderConstraints();

    // Sync with Backend
    for (const c of newConstraints) {
        await postData('addConstraint', c);
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
    });

    if (filteredConstraints.length === 0) {
        constraintsUl.innerHTML = '<li style="color: #888; font-style: italic;">No unavailable times for this month.</li>';
        return;
    }

    filteredConstraints.forEach((c) => {
        // We need the original index to delete correctly from the main array
        // So let's find the index in the main 'constraints' array
        const originalIndex = constraints.indexOf(c);

        const li = document.createElement('li');
        li.innerHTML = `
            <span>${c.user} – ${c.date} (${c.slot})</span>
            <span class="delete-constraint" onclick="removeConstraint(${originalIndex})">×</span>
        `;
        constraintsUl.appendChild(li);
    });
}

window.removeConstraint = async function (index) {
    const c = constraints[index];

    // Optimistic Update
    constraints.splice(index, 1);
    renderConstraints();

    // Sync
    await postData('removeConstraint', { user: c.user, date: c.date, slot: c.slot });
}

// User Management
function renderUserList() {
    userListUl.innerHTML = '';
    users.forEach((user, index) => {
        const li = document.createElement('li');
        li.className = 'user-list-item';
        li.innerHTML = `
            <span id="user-name-${index}">${user.name} (Max: ${user.limit})</span>
            <div class="user-actions">
                <button class="edit-user-btn" onclick="editUser(${index})">Edit</button>
                <button class="delete-user-btn" onclick="deleteUser(${index})">Delete</button>
            </div>
        `;
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

    if (!name || isNaN(limit) || limit < 1) {
        alert("Please enter a valid name and limit.");
        return;
    }

    if (users.some(u => u.name === name)) {
        alert("User already exists!");
        return;
    }

    // Optimistic
    users.push({ name, limit });
    newUserNameInput.value = '';
    newUserLimitInput.value = '4';
    renderUserList();
    updateUserSelect();
    renderDutyCounts();
    renderYearlyDutyCounts();

    // Sync
    await postData('addUser', { name, limit });
}

window.deleteUser = async function (index) {
    const userToDelete = users[index].name;
    if (confirm(`Are you sure you want to delete ${userToDelete}?`)) {
        // Optimistic
        users.splice(index, 1);
        constraints = constraints.filter(c => c.user !== userToDelete);

        renderUserList();
        updateUserSelect();
        renderConstraints();
        renderDutyCounts();
        renderYearlyDutyCounts();

        // Sync
        await postData('deleteUser', { name: userToDelete });
    }
}

window.editUser = async function (index) {
    const oldUser = users[index];
    const newName = prompt("Enter new name:", oldUser.name);
    if (newName === null) return; // Cancelled

    const newLimitStr = prompt("Enter new max duties:", oldUser.limit);
    if (newLimitStr === null) return; // Cancelled

    const newLimit = parseInt(newLimitStr, 10);

    if (newName && newName.trim() !== "" && !isNaN(newLimit) && newLimit > 0) {
        if (newName !== oldUser.name && users.some(u => u.name === newName)) {
            alert("Name already exists!");
            return;
        }

        // Optimistic
        const oldName = oldUser.name;
        users[index] = { name: newName, limit: newLimit };

        if (oldName !== newName) {
            constraints.forEach(c => {
                if (c.user === oldName) c.user = newName;
            });
            Object.keys(schedule).forEach(key => {
                if (schedule[key] === oldName) schedule[key] = newName;
            });
        }

        renderUserList();
        updateUserSelect();
        renderConstraints();
        renderCalendar();
        renderDutyCounts();
        renderYearlyDutyCounts();

        // Sync
        await postData('editUser', { oldName, newName, newLimit });
    } else {
        alert("Invalid input.");
    }
}

// Scheduling Algorithm
async function generateSchedule() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    // 1. Calculate yearly counts for initial queue sorting (Fairness Seed)
    const yearlyCounts = {};
    users.forEach(u => yearlyCounts[u.name] = 0);

    // Count duties for current year, EXCLUDING the current target month
    // (We want to base fairness on past performance, unaffected by current run)
    Object.keys(schedule).forEach(key => {
        const [dateStr, _] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);

        if (y === year && (m - 1) !== month) {
            const assignedUser = schedule[key];
            if (assignedUser && assignedUser !== "Unassigned" && yearlyCounts.hasOwnProperty(assignedUser)) {
                yearlyCounts[assignedUser]++;
            }
        }
    });

    // 2. Initialize Queue
    // Sort logic: Primary = Yearly Count (ASC), Secondary = Name (ASC)
    let queue = [...users].sort((a, b) => {
        const countA = yearlyCounts[a.name] || 0;
        const countB = yearlyCounts[b.name] || 0;
        if (countA !== countB) return countA - countB;
        return a.name.localeCompare(b.name);
    });

    const shiftCounts = {};
    users.forEach(u => shiftCounts[u.name] = 0);

    // 3. Iterate Slots
    for (let d = 1; d <= lastDay; d++) {
        const dateObj = new Date(year, month, d);
        if (dateObj.getDay() === 3) { // Wednesday
            const dateStr = formatDate(dateObj);

            if (holidays.includes(dateStr)) {
                delete schedule[`${dateStr}_AM`];
                delete schedule[`${dateStr}_PM`];
                continue;
            }

            assignNextAvailable(dateStr, 'AM', queue, shiftCounts);
            assignNextAvailable(dateStr, 'PM', queue, shiftCounts);
        }
    }

    renderCalendar();
    renderDutyCounts();
    renderYearlyDutyCounts();

    // Sync Schedule
    await postData('saveSchedule', { schedule });
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
            if (assignedUser && assignedUser !== "Unassigned" && counts.hasOwnProperty(assignedUser)) {
                counts[assignedUser]++;
            }
        }
    });

    // Render rows
    users.forEach(u => {
        const row = document.createElement('tr');
        const count = counts[u.name];
        const isAtLimit = count >= u.limit;

        row.innerHTML = `
            <td>${u.name}</td>
            <td style="${isAtLimit ? 'color: var(--danger-color); font-weight: bold;' : ''}">${count}</td>
            <td>${u.limit}</td>
        `;
        dutyCountsTableBody.appendChild(row);
    });
}

function renderYearlyDutyCounts() {
    if (!yearlyDutyCountsTableBody) return;
    yearlyDutyCountsTableBody.innerHTML = '';

    const year = new Date().getFullYear();

    // Update Header to reflect which year is being shown
    const yearlyHeader = document.querySelector('#yearly-duty-counts-table th:nth-child(2)');
    if (yearlyHeader) yearlyHeader.textContent = `Total Duties in ${year}`;

    // Initialize counts
    const counts = {};
    users.forEach(u => counts[u.name] = 0);

    // Count duties for current year
    Object.keys(schedule).forEach(key => {
        const [dateStr, slot] = key.split('_');
        const [y, m, d] = dateStr.split('-').map(Number);

        if (y === year) {
            const assignedUser = schedule[key];
            if (assignedUser && assignedUser !== "Unassigned" && counts.hasOwnProperty(assignedUser)) {
                counts[assignedUser]++;
            }
        }
    });

    // Render rows
    users.forEach(u => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${u.name}</td>
            <td>${counts[u.name]}</td>
        `;
        yearlyDutyCountsTableBody.appendChild(row);
    });
}

function assignSlot(dateStr, slot, shiftCounts) {
    const key = `${dateStr}_${slot}`;

    // Find available users
    const availableUsers = users.filter(user => {
        // Check constraints
        const hasConstraint = constraints.some(c =>
            c.user === user.name && c.date === dateStr && c.slot === slot
        );
        if (hasConstraint) return false;

        // Check duty limit
        if (shiftCounts[user.name] >= user.limit) return false;

        return true;
    });

    if (availableUsers.length === 0) {
        schedule[key] = "Unassigned";
    } else {
        // Sort by shift count (asc) to ensure fairness
        availableUsers.sort((a, b) => shiftCounts[a.name] - shiftCounts[b.name]);
        const selectedUser = availableUsers[0];
        schedule[key] = selectedUser.name;
        shiftCounts[selectedUser.name]++;
    }
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Run
init();

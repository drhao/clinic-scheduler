/**
 * Clinic Scheduler SPA
 * 
 * Data Structures:
 * 
 * users: Array<string>
 *   List of available staff names.
 * 
 * constraints: Array<Object>
 *   {
 *     id: number,
 *     user: string,
 *     date: string (YYYY-MM-DD),
 *     slot: 'AM' | 'PM'
 *   }
 * 
 * schedule: Object
 *   Key: "YYYY-MM-DD_AM" or "YYYY-MM-DD_PM"
 *   Value: string (assigned user name)
 */

// State
let currentDate = new Date();
let users = ["Dr. A", "Dr. B", "Dr. C", "Dr. D", "Dr. E"];
let constraints = [];
let schedule = {};

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
const addUserBtn = document.getElementById('add-user-btn');

// Initialization
function init() {
    renderCalendar();
    renderConstraints();
    renderUserList();
    updateUserSelect();

    // Event Listeners
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));
    addConstraintBtn.addEventListener('click', addConstraint);
    generateBtn.addEventListener('click', generateSchedule);
    addUserBtn.addEventListener('click', addUser);
}

// Calendar Logic
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
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

        calendarGrid.appendChild(cell);
    }
}

// Constraint Management
function addConstraint() {
    const user = userSelect.value;
    const date = datePicker.value;
    const isAm = amCheck.checked;
    const isPm = pmCheck.checked;

    if (!user || !date || (!isAm && !isPm)) {
        alert("Please select a user, date, and at least one time slot.");
        return;
    }

    // Check if Wednesday? (Optional, but good for UX)
    const d = new Date(date);
    // Note: datePicker value is YYYY-MM-DD. new Date(date) might be UTC or local depending on browser.
    // Safest to parse manually or use simple check.
    // Let's allow blocking any day for now, but scheduling only cares about Wednesdays.

    if (isAm) {
        constraints.push({ id: Date.now() + Math.random(), user, date, slot: 'AM' });
    }
    if (isPm) {
        constraints.push({ id: Date.now() + Math.random(), user, date, slot: 'PM' });
    }

    // Reset inputs
    amCheck.checked = false;
    pmCheck.checked = false;

    renderConstraints();
}

function renderConstraints() {
    constraintsUl.innerHTML = '';
    constraints.forEach((c, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${c.user} – ${c.date} (${c.slot})</span>
            <span class="delete-constraint" onclick="removeConstraint(${index})">×</span>
        `;
        constraintsUl.appendChild(li);
    });
}

// Expose to global scope for onclick handler
window.removeConstraint = function (index) {
    constraints.splice(index, 1);
    renderConstraints();
}

// User Management
function renderUserList() {
    userListUl.innerHTML = '';
    users.forEach((user, index) => {
        const li = document.createElement('li');
        li.className = 'user-list-item';
        li.innerHTML = `
            <span id="user-name-${index}">${user}</span>
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
        option.value = user;
        option.textContent = user;
        userSelect.appendChild(option);
    });
}

function addUser() {
    const name = newUserNameInput.value.trim();
    if (!name) return;

    if (users.includes(name)) {
        alert("User already exists!");
        return;
    }

    users.push(name);
    newUserNameInput.value = '';
    renderUserList();
    updateUserSelect();
}

window.deleteUser = function (index) {
    const userToDelete = users[index];
    if (confirm(`Are you sure you want to delete ${userToDelete}?`)) {
        users.splice(index, 1);

        // Cleanup constraints and schedule?
        // For now, let's just leave them or filter them out during generation.
        // But better to clean up constraints at least.
        constraints = constraints.filter(c => c.user !== userToDelete);

        renderUserList();
        updateUserSelect();
        renderConstraints();
        // Re-render calendar to show unassigned if they were scheduled? 
        // Or just leave it until regeneration. Let's leave it.
    }
}

window.editUser = function (index) {
    const oldName = users[index];
    const newName = prompt("Enter new name:", oldName);

    if (newName && newName.trim() !== "" && newName !== oldName) {
        if (users.includes(newName)) {
            alert("Name already exists!");
            return;
        }

        users[index] = newName;

        // Update constraints
        constraints.forEach(c => {
            if (c.user === oldName) c.user = newName;
        });

        // Update schedule
        Object.keys(schedule).forEach(key => {
            if (schedule[key] === oldName) schedule[key] = newName;
        });

        renderUserList();
        updateUserSelect();
        renderConstraints();
        renderCalendar();
    }
}

// Scheduling Algorithm
function generateSchedule() {
    // Clear current month's schedule
    // We only want to clear schedule for the currently displayed month? 
    // Or regenerate everything? The prompt says "Generate Schedule... within the current month".
    // Let's clear only keys that match the current month to be safe, or just overwrite them.

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    // Track shift counts for fairness (reset for this generation or keep global? 
    // Prompt implies "distribute shifts... among users". Usually this is per month or cumulative.
    // Let's do per-month fairness for simplicity as we generate per month.)
    const shiftCounts = {};
    users.forEach(u => shiftCounts[u] = 0);

    // Find all Wednesdays
    for (let d = 1; d <= lastDay; d++) {
        const dateObj = new Date(year, month, d);
        if (dateObj.getDay() === 3) { // Wednesday
            const dateStr = formatDate(dateObj);

            // Schedule AM
            assignSlot(dateStr, 'AM', shiftCounts);

            // Schedule PM
            assignSlot(dateStr, 'PM', shiftCounts);
        }
    }

    renderCalendar();
}

function assignSlot(dateStr, slot, shiftCounts) {
    const key = `${dateStr}_${slot}`;

    // Find available users
    const availableUsers = users.filter(user => {
        // Check if user has a constraint for this date & slot
        const hasConstraint = constraints.some(c =>
            c.user === user && c.date === dateStr && c.slot === slot
        );
        return !hasConstraint;
    });

    if (availableUsers.length === 0) {
        schedule[key] = "Unassigned";
    } else {
        // Sort by shift count (asc) to ensure fairness
        // If tie, pick random or first
        availableUsers.sort((a, b) => shiftCounts[a] - shiftCounts[b]);

        const selectedUser = availableUsers[0];
        schedule[key] = selectedUser;
        shiftCounts[selectedUser]++;
    }
}

// Helper
function formatDate(date) {
    // Returns YYYY-MM-DD
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Run
init();

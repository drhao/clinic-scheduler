# Clinic Scheduler - User Guide

Welcome to the Clinic Scheduler! This guide will help you manage your weekly Wednesday clinic duties efficiently.

## 1. Getting Started
To use the application, simply open the **`index.html`** file in your web browser (Chrome, Edge, Safari, etc.). No installation is required.

## 2. Managing Staff
You can add new doctors or staff members on the right-hand panel under **"Manage Staff"**.

-   **Add User**: Enter the name and set a "Max" limit (the maximum number of shifts they can do in a month). Click **Add**.
-   **Edit**: Click the "Edit" button next to a name to change their name or duty limit.
-   **Delete**: Click "Delete" to remove a user. *Note: This will also remove their assigned shifts.*

## 3. Setting Holidays (No Duty)
If a specific Wednesday is a holiday (e.g., National Holiday, New Year):
1.  Find the date on the calendar.
2.  Check the box labeled **"Holiday"** inside that day's cell.
3.  The system will mark it as "No Duty" and will **not** assign anyone to that day.

## 4. Managing Availability (Constraints)
If a staff member is unavailable on a specific day (e.g., taking leave):
1.  Go to the **"Manage Constraints"** section on the right.
2.  **Select User**: Choose the staff member.
3.  **Date**: Pick the date they are unavailable.
4.  **Time**: Check "Wednesday AM" or "Wednesday PM" (or both).
5.  Click **"Add Unavailable Time"**.

## 5. Generating the Schedule
Once you have updated your staff, holidays, and constraints:
1.  Click the **"Generate Schedule"** button in the top-right corner.
2.  The system will automatically assign staff to the empty slots using a fair "Round Robin" system.
    -   It respects duty limits.
    -   It skips holidays.
    -   It avoids unavailable constraints.

## 6. Viewing Statistics
-   **Monthly Summary**: The table below the calendar shows how many shifts everyone has *this month*. (Red numbers mean they hit their limit).
-   **Yearly Summary**: The bottom table shows the total shifts for the *entire year*.
    -   **Tip**: Hover your mouse over the total number to see a breakdown (e.g., "Jan: 2, Feb: 1").

## 7. Starting a New Year / Clearing Data
If you need to start fresh for the year (or delete old test data):
1.  Click the **"Clear Year"** button in the header.
2.  Confirm the action.
3.  **Warning**: This deletes ALL assigned duties for the current year.

---
*If you encounter connectivity issues ("API Error"), please check your internet connection.*

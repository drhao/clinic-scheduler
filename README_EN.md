# Clinic Scheduler SPA

A lightweight, single-page web application for managing weekly (Wednesday) clinic duty schedules. It features a fair "Round Robin" assignment algorithm, duty limits, holiday management, and Google Sheets integration for data persistence.

![Clinic Scheduler](https://img.shields.io/badge/Status-Active-success)

![Mockup](file:///Users/drhao/.gemini/antigravity/brain/74503927-3448-4e97-af2f-654d1accf546/clinic_scheduler_mockup_1767599639319.png)

## Features

- **Round Robin Scheduling**: Ensures fair distribution of duties using a queue-based system.
- **Duty Limits**: Set maximum monthly shifts per staff member.
- **Global Holidays**: Mark specific Wednesdays as holidays to prevent assignments.
- **Duty Summaries**: View real-time monthly and yearly duty counts.
- **Data Persistence**: All data (users, schedule, holidays) is saved to a Google Sheet.
- **Responsive Design**: Clean, pastel-themed UI that works on desktop and tablets.

## Setup Instructions

This application runs entirely in the browser (`index.html`) but requires a Google Apps Script backend to save data.

### 1. Google Sheets Setup
1. Create a new Google Sheet.
2. Create four tabs at the bottom with the exact names:
   - `Users` (Columns: Name, Limit)
   - `Constraints` (Columns: User, Date, Slot)
   - `Schedule` (Columns: Key, User)
   - `Holidays` (Columns: Date)

### 2. Google Apps Script Deployment
1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Copy the content of `google_apps_script.js` from this project into the script editor (`Code.gs`).
4. Click **Deploy > New deployment**.
5. Select **Type: Web app**.
6. Set **Description** (e.g., "v1").
7. Set **Execute as**: `Me` (your email).
8. Set **Who has access**: `Anyone` (IMPORTANT for the SPA to access it).
9. Click **Deploy**.
10. Copy the **Web App URL** (it ends in `/exec`).

### 3. Connect Frontend
1. Open `script.js` in this project.
2. Find the constant `API_URL` at the top of the file:
   ```javascript
   const API_URL = "YOUR_WEB_APP_URL_HERE";
   ```
3. Paste your Web App URL there.

---

## User Guide

For detailed instructions on how to use the application (Managing Staff, Holidays, Generating Schedules, etc.), please refer to the standalone User Guide:

- **[📖 User Guide (English)](USER_GUIDE.md)**

## File Structure

- `index.html`: Main application structure.
- `style.css`: All styling (Pastel theme).
- `script.js`: Frontend logic (UI, Scheduling Algorithm, API calls).
- `google_apps_script.js`: Backend code for Google Sheets.

## Troubleshooting

- **"API Error"**: Check your internet connection and ensure the `API_URL` is correct.
- **Counts look wrong?**: Hover over the yearly count to see the breakdown. Use "Clear Year" if there is old test data.
- **Holidays not saving?**: Ensure you have created the `Holidays` tab in your Google Sheet and re-deployed the Apps Script.

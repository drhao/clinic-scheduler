# 🏥 MO 旅醫門診排班系統 (MO Travel Clinic Scheduler)

這是一個專為管理「旅遊醫學門診」醫師排班所設計的輕量級網頁應用程式 (Single Page Application)。
系統採用 **Frontend (HTML/CSS/JS) + Serverless Backend (Google Apps Script) + Database (Google Sheets)** 的無伺服器架構，讓診所可以免費且無縫地進行雲端排班與人員管理。

---

## 🏗️ 系統架構 (Architecture)

本專案將複雜的後端邏輯與資料庫託管於 Google 的免費服務上，前端則可部署於任何靜態網頁伺服器（例如 GitHub Pages）。

1. **前端 (Frontend)**
   - `index.html`: 系統主結構與使用者介面 (UI)。
   - `style.css`: 視覺樣式與響應式排版設計。
   - `script.js`: 核心業務邏輯，負責處理畫面渲染、排班演算法、與後端 API 通訊 (Fetch)、以及計算公平性。
2. **後端 (Backend)**
   - `google_apps_script.js`: 部署於 Google Apps Script (GAS) 的代碼。負責接收前端的請求 (GET/POST)，並對 Google Sheets 進行讀寫操作。
3. **資料庫 (Database)**
   - **Google Sheets**: 作為無實體伺服器的關聯式資料庫。儲存了四份資料表：
     - `Users`: 醫師名單、每月排班上限 (Max Duties)、以及聯絡用的 Email。
     - `Constraints`: 每位醫師畫休（不便排班）的日期與時段（上午/下午）。
     - `Schedule`: 最終的排班結果紀錄。
     - `Holidays`: 設定為國定假日或停診的日期。

---

## ✨ 核心功能 (Key Features)

### 1. 人員與權限管理
- 可新增、編輯、刪除參與排班的醫師名單。
- 可為每位醫師設定「每月最高排班次數上限 (Max Limit)」，避免過勞。
- 支援綁定醫師個人的 Email 信箱。

### 2. 畫休與假日設定 (Constraints & Holidays)
- **不可排班時間 (Constraints)**: 醫師可自行輸入特定日期與時段（上午/下午）無法排班的請求。
- **國定假日 (Holidays)**: 排班負責人可直接在日曆上將特定日期（如某個星期三）切換為「假日」，該日將全天停診，不會指派任何人。

### 3. 智慧自動排班演算法 (Automated Scheduling)
點擊「一鍵排班」後，系統會自動分配當月的班表，演算法的邏輯如下：
1. **公平性基礎 (Fairness Seed)**：系統會先讀取今年度（Yearly）所有人的累積排班次數。次數最少的人將獲得最高優先權（排在 Queue 的最前面）。
2. **規則過濾 (Rule Checking)**：在指派某個時段（例如星期三上午）時，系統會從 Queue 的最前面開始找人，並檢查以下條件：
   - 該醫師是否已經達到「本月排班上限 (Max Limit)」？
   - 該醫師是否在該時段有「畫休 (Constraint)」？
   - 該醫師是否已經被安排了同一天的另一個時段（避免同一天連上早午診）？
3. **輪序制 (Round-Robin)**：如果找到符合條件的醫師，系統會派班給他，將其本月排班數 +1，然後**把這個人移到 Queue 的最後面**，確保下一次派班的機會讓給其他人。
4. **防呆機制**：如果當月已經產生過班表，再次點擊「一鍵排班」時會跳出警告，避免意外覆蓋舊資料。

### 4. 便利整合 (Integrations)
- **Email 提醒信 (`MailApp`)**: 一鍵發送 Email 給所有名單上的醫師，提醒他們「在每月 3 號前」填寫次月的畫休時間，信件中會自動附上系統網址。
- **Google Calendar 整合**: 排班結果出爐後，醫師名單旁邊會出現一個「🗓️」按鈕，點擊後會直接將該門診時段（上午 09:00-12:00 或 下午 13:30-16:30）與標題（支援台大旅醫門診）帶入個人的 Google 日曆新增頁面。

### 5. 數據統計與可視化
- **當月統計**: 顯示每個人在這個月被分配到的班數，以及他們的上限為何。
- **年度統計**: 紀錄今年度每個人總共上過幾次班。滑鼠游標停留在數據上時，會自動彈出 **Tooltip (提示框)**，顯示該醫師在每個月各上了幾次班的詳細明細。

---

## 🚀 部署與設定指南 (Setup Guide)

若您是接手此專案的開發者或管理員，請按照以下步驟完成部署：

### 第一步：建立後端 (Google Sheets + Apps Script)
1. 建立一個全新的 **Google Sheets (Google 試算表)**。
2. 點擊試算表選單上的 `擴充功能 (Extensions)` -> `Apps Script`。
3. 將本專案中的 `google_apps_script.js` 檔案內容，完全複製並貼上到 Apps Script 的編輯器中（取代原本的 `Code.gs`）。
4. （選用）在編輯器上方選擇並執行 `setup()` 函式，程式會自動幫您在試算表中建立好 `Users`, `Constraints`, `Schedule`, `Holidays` 四個分頁。
5. 點擊右上角的 **「部署 (Deploy)」** -> **「新增部署 (New deployment)」**。
6. 選擇類型為 **「網頁應用程式 (Web app)」**。
7. 設定：
   - 執行身分 (Execute as)：`我 (Me)`
   - 存取權限 (Who has access)：`所有人 (Anyone)`
8. 點擊部署，同意授權（包含讀寫試算表與發送 Email 的權限）。
9. 部署完成後，您會獲得一串 **Web App URL**，請複製它。

### 第二步：設定前端 (HTML/JS)
1. 開啟本專案的 `script.js` 檔案。
2. 找到最上方的 `const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";`。
3. 將剛剛複製的 Web App URL 貼上替換掉它。
4. 儲存檔案。

### 第三步：發布上線
您可以使用任何靜態網頁託管服務來發布這三個前端檔案（`index.html`, `style.css`, `script.js`），例如：
- GitHub Pages (推薦)
- Vercel
- Netlify

部署完成後，即可隨時隨地開啟網頁進行排班！

---

## �️ 開發與維護筆記 (Developer Notes)

- **UI 框架**: 為了維持輕量化與最高相容性，本專案沒有使用任何前端框架（如 React, Vue）或 CSS 框架（如 Bootstrap, Tailwind）。所有樣式皆採用純 Vanilla CSS 撰寫。
- **狀態管理**: 前端的狀態管理採用「樂觀更新 (Optimistic UI Update)」。也就是當使用者點擊新增或刪除時，畫面會立刻更新，背景則同時非同步 (`async`/`await`) 呼叫後端 API。
- **清除歷史資料**: 「清除整年班表」的按鈕位於畫面上方，此功能專門設計給「年底結算後，準備進入新的一年歸零統計」時使用。使用前務必確認該年排班資料已不需要，或已於 Google Sheets 中自行備份。

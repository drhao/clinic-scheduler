# 門診排班系統 (Clinic Scheduler SPA)

這是一個輕量級的單頁網頁應用程式 (SPA)，專門用於管理每週三的門診值班表。它具備公平的 "輪詢 (Round Robin)" 分配演算法、值班上限設定、假期管理以及 Google Sheets 整合功能。

![Clinic Scheduler](https://img.shields.io/badge/Status-Active-success)

![Mockup](file:///Users/drhao/.gemini/antigravity/brain/74503927-3448-4e97-af2f-654d1accf546/clinic_scheduler_mockup_1767599639319.png)

## 功能特色

- **公平輪詢排班 (Round Robin)**：使用佇列系統確保每位人員的值班分配公平，達到「一輪一次」的原則。
- **值班上限 (Duty Limits)**：可設定每位員工每月的排班次數上限。
- **全域假期 (Global Holidays)**：可將特定週三標記為假期，系統將自動跳過該日不排班。
- **值班統計 (Duty Summaries)**：即時查看每月及每年的值班總數統計。
- **資料儲存 (Data Persistence)**：所有資料 (人員、排班表、假期) 皆自動儲存於 Google Sheet。
- **響應式設計**: 清新柔和的介面風格，適用於電腦與平板。

## 設定說明 (Setup Instructions)

本應用程式完全在瀏覽器中執行 (`index.html`)，但需要搭配 Google Apps Script 後端來儲存資料。

### 1. Google Sheets 設定
1. 建立一個新的 Google Sheet。
2. 在底部建立四個工作表 (Tabs)，名稱必須完全一致：
   - `Users` (欄位: Name, Limit)
   - `Constraints` (欄位: User, Date, Slot)
   - `Schedule` (欄位: Key, User)
   - `Holidays` (欄位: Date)

### 2. Google Apps Script 部署
1. 開啟您的 Google Sheet。
2. 點選 **擴充功能 (Extensions) > Apps Script**。
3. 將本專案中的 `google_apps_script.js` 內容複製到編輯器 (`Code.gs`) 中。
4. 點選 **部署 (Deploy) > 新增部署 (New deployment)**。
5. 選擇類型：**網頁應用程式 (Web app)**。
6. 設定 **說明** (例如 "v1")。
7. 設定 **執行身分 (Execute as)**：`我 (Me)`。
8. 設定 **誰可以存取 (Who has access)**：`任何人 (Anyone)` (**重要**：這樣 SPA 才能存取)。
9. 點選 **部署 (Deploy)**。
10. 複製 **網頁應用程式網址 (Web App URL)** (結尾為 `/exec`)。

### 3. 連接前端
1. 開啟本專案中的 `script.js`。
2. 在檔案最上方找到 `API_URL` 常數：
   ```javascript
   const API_URL = "在此貼上您的_WEB_APP_URL";
   ```
3. 貼上您的網址並儲存。

---

## 使用者指南 (User Guide)

如需詳細的操作說明 (包含人員管理、假日設定、產生排班表等)，請參閱獨立的使用者指南檔案：

- **[📖 使用者指南 (中文版)](USER_GUIDE_ZH.md)**

## 常見問題排除

- **出現 "API Error"？** 請檢查網路連線，並確認 `script.js` 中的 `API_URL` 是否正確。
- **統計數字看起來不對？** 請將滑鼠移到年度總數上查看明細。若包含舊月份的測試資料，請使用 "Clear Year" 清除重來。
- **假期沒有儲存？** 請確認您的 Google Sheet 中是否有建立 `Holidays` 工作表，並重新部署 Apps Script。

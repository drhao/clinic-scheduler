# HANDOFF.md — 交接快照

> **文件性質**：這是一份「某個時間點」的交接快照（最後更新：2026-10-01），
> 用途是讓新帳號／新 session 的 AI 與維護者快速接手。
> **常青知識不在這裡**——架構與規範在 `AGENTS.md`、決策理由在
> `docs/DECISIONS.md`、待辦與設計草圖在 `docs/BACKLOG.md`。
> 接手後若本文件描述的狀態已改變，請直接更新或刪除本文件。

---

## 1. 專案一句話

MO 旅醫門診排班系統：只在**週三**（上午/下午）看診的門診排班工具。
前端 = GitHub Pages 靜態頁（`https://drhao.github.io/clinic-scheduler/`），
後端 = Google Apps Script（手動部署），資料庫 = Google Sheet。零成本、零依賴。

## 2. 目前狀態（2026-10-01）

- **`main` = 乾淨且完整**：PR #1–#5 全部合併，無未合併分支、無未完成的程式工作。
- **測試**：`npm test` 12/12 綠燈（演算法規格 10 + 共用區塊 parity 2）；
  CI（GitHub Actions）會在每個 PR/push 自動跑。
- **repo 內不含任何 secrets**；`API_URL`（`script.js` 頂部）本來就是公開的。

## 3. 本輪完成的工作總覽（Fable 5 session，PR #1–#5）

**排班正確性**
- 同一天不連排 AM+PM（原文件有寫但程式沒做，已實作於共用演算法）。
- 修掉 `"Unassigned"`/`"未安排"` 哨兵值混用造成的真 bug
  （全空月份被誤判為已排班 → 自動排班跳過、通知信發錯類型）。
- 月上限維持硬上限；排不出的時段以紅底顯示並列入通知信（D-03）。

**結構性防護**
- 演算法抽成 `scheduler.js`，前後端共用同一份 `SHARED SCHEDULER` 區塊，
  `tests/parity.test.js` 強制兩份逐字相同（D-08）。
- `BACKEND_VERSION` 版本標記：`doGet` 回傳、前端 console 顯示，部署漂移可見。

**功能**
- 單格手動指派／換班（點日曆任一時段，含畫休/同日/上限提示與覆蓋確認）。
- 設假日防呆確認框（會列出將被清除的排班）。
- `editUser` 改 Modal 表單；所有寫入操作有樂觀更新＋失敗回滾（I6）。
- 手機版改為「週三卡片」直列版面（D-10）。

**安全／維運（皆為 owner 拍板，見 D-07/D-13/D-14）**
- 管理密碼機制：建好後**依 owner 決定停用**（全開放），保留註解可一鍵恢復（R-C）。
- `sendReminders` 伺服器端限流：每小時最多寄一次（擋公開網址的群發濫用）。
- `weeklyBackup()` 每週一 02:00 整份試算表備份到 Drive，保留最近 8 份。
- 防 XSS：姓名/Email 一律 `textContent` 輸出（I7）。

**制度文件**
- `AGENTS.md`（正典操作手冊）、`docs/DECISIONS.md`（D-01~D-14）、
  `docs/BACKLOG.md`（含實作草圖）、PR 範本檢查清單、CI。

## 4. ⚠️ 交接後的待辦行動（依急迫順序）

1. **確認後端已部署最新版**（最可能的遺漏！）：打開網頁按 F12 看 console——
   - 顯示 `Backend version: 2026-07-09.1` → 已是最新，跳過此項。
   - **沒有顯示版本** → 線上還是加版本標記「之前」的舊版，
     本輪所有後端改動（同日檢查、限流、備份、共用演算法）都尚未生效
     → 依 `AGENTS.md` **Runbook R-A** 整份重新部署。
2. **跑一次 `createBackupTrigger()`**（Apps Script 編輯器內，部署後執行；
   首次會多要求 Drive 權限）。沒跑的話每週備份不會啟動。
3. **確認 GAS 專案時區 = Asia/Taipei**（I10）與三個 trigger 存在（R-E）。
4. 使用者文件已過時（BACKLOG **B-06**）——`README.md`/`USER_GUIDE.md`
   還是改版前的描述，建議作為新 session 的第一個工作。

## 5. 帳號轉移注意事項

- **GitHub**：repo 在 `drhao/clinic-scheduler`。新的 Claude 帳號需要在
  claude.ai 連接 GitHub 並授權此 repo，才能 clone/push/開 PR。
- **Google 端完全不受影響**：Sheet、Apps Script、部署、trigger 都綁在
  **Google 帳號**上，跟 Claude 帳號無關，什麼都不用搬。
- **GitHub Pages / API_URL 不變**：前端網址與後端 Web App URL 照舊。
- 舊 Claude 帳號裡的對話紀錄帶不過來——**這就是本文件與
  AGENTS/DECISIONS/BACKLOG 存在的原因**，所有必要知識都已落地在 repo。

## 6. 新 session 建議開場白（可直接複製貼上）

> 這是 MO 旅醫門診排班系統。請先讀 `AGENTS.md`（規範與 runbook）與
> `docs/HANDOFF.md`（交接狀態），跑 `npm test` 確認 12 個測試綠燈，
> 然後告訴我 HANDOFF 第 4 節的待辦哪些還沒完成，再從
> `docs/BACKLOG.md` 建議下一步。

## 7. 下一步工作建議（取自 BACKLOG，優先序）

1. **B-06** 使用者文件補課（中文優先，再同步英文版）。
2. **B-13** 一鍵排班完成後詢問「是否立即發送通知信？」（已討論、owner 未拍板）。
3. **B-03** 多人同時編輯的覆蓋防護（若開始有第二位管理者，升為必做）。
4. 其餘見 `docs/BACKLOG.md`（B-07~B-12）。

<!-- 描述這個 PR 做了什麼、為什麼。Describe what & why. -->

## Checklist（提交前逐項確認）

- [ ] `npm test` 全數通過（含 SHARED SCHEDULER parity 測試）
- [ ] 改了排班規則？→ 只改 `scheduler.js` 的共用區塊，並**逐字複製**到 `google_apps_script.js`，且 `tests/scheduler.test.js` 有涵蓋新規則
- [ ] 改了 `google_apps_script.js`？→ 已 bump `BACKEND_VERSION`，且 PR 描述包含「**需要重新部署後端**」與部署後驗證方式（`curl API_URL` 比對 version）
- [ ] 新增的資料異動（mutation）遵循 `snapshotState()` → 樂觀更新 → 失敗 `restoreState()` 模式
- [ ] 使用者輸入只透過 `textContent` / `createTextNode` / `.title` 輸出（禁止插值進 `innerHTML`）
- [ ] UI 文字為繁體中文（台灣用語）；文件先改中文版（`README.md`/`USER_GUIDE.md`），再同步 `*_EN.md`
- [ ] 改變了慣例或決策？→ 已更新 `docs/DECISIONS.md`；發現/修復已知問題？→ 已更新 `docs/BACKLOG.md`

## 部署影響 Deployment impact

<!-- 三選一，留下適用的：
- 純前端：merge 後 GitHub Pages 自動生效
- 含後端：需要手動重新部署 google_apps_script.js（見 AGENTS.md Runbook R-A）
- 純文件/測試：無部署動作 -->

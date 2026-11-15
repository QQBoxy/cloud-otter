# 海獺盒子

海獺盒子提供兩個管理員共用的公告和帳本。開啟 Web App 會進入 Board 首頁，唯讀顯示公告頁排序最前面的 5 則公告。點選頁首的「海獺盒子」可返回首頁。手機從底部導覽切換公告、記帳或功能表，桌機使用左側導覽。記帳頁直接顯示新增表單和當月清單，右上角可開啟年度統計。記帳統計以台灣時區計算。

網站入口為 [otter.qqboxy.com](https://otter.qqboxy.com/)。

## 地端啟動

macOS 與 Windows 11 x64 都可使用下列流程。需要 Node.js 24 以上與 pnpm 10.21.0。Wrangler 會啟動本機 Worker 與 D1，資料保留在 `.wrangler/state`。

1. 執行 `pnpm install`。
2. 執行下列指令，貼上地端測試密碼，再按 Enter 取得雜湊。輸入時密碼會隱藏。兩個測試帳號各執行一次。

   ```sh
   pnpm hash-password
   ```

3. 如果專案根目錄還沒有 `.dev.vars`，先複製範本。

   ```sh
   cp -n .dev.vars.example .dev.vars
   ```

   Windows PowerShell 使用 `Copy-Item .dev.vars.example .dev.vars`。

   在 `.dev.vars` 填入兩個不同帳號、各自的密碼雜湊，以及用下列指令產生的 Session 金鑰。

   ```sh
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

4. 執行 `pnpm db:local` 套用 migration，再執行 `pnpm dev`，用瀏覽器開啟 [http://127.0.0.1:8787](http://127.0.0.1:8787)。

## 驗證

單元測試和整合測試都在本機執行。GitHub Actions 執行型別檢查、Lint 和正式部署。

```sh
pnpm typecheck
pnpm lint
pnpm test
```

整合測試會在暫存目錄啟動獨立的本機 Worker 和 D1，驗證共用帳本、跨月跨年和登入續期。瀏覽器驗收時，可用兩個不同的瀏覽器工作階段登入，確認公告排序與記帳資料共用。

## 加入主畫面

在 iPhone 的 Safari 用「分享 → 加入主畫面」，或在 Android 的 Chrome 選「安裝應用程式／加入主畫面」。從圖示開啟時沿用網站的登入檢查。Web App 的登入效期在成功使用後重新起算 7 天。離線開啟會顯示連線提示。

## 交易 API

- `GET /api/transactions?month=2026-11&offset=0&limit=10` 查詢台灣時間的月明細。回傳當頁的 `data`、整月筆數 `total` 和整月支出 `price`（新台幣元）。預設從第 0 筆開始，每頁 10 筆，最多 100 筆。同一交易時間依交易 ID 由新到舊排列。
- 記帳頁位於 `/transaction`，年度統計位於 `/transaction/total`。切換年份或月份會直接更新資料。
- `GET /api/transactions/summary?year=2026` 回傳全年和各月的筆數及金額。記帳頁以 `GET /api/transactions/years` 取得已有交易的年份，並加上當年。
- `POST /api/transactions` 新增一筆支出。送出 `name` 品項和 `price` 金額（新台幣元，最多兩位小數），以及 `occurredAt` 含時區的 ISO 8601 交易時間，精度至毫秒。
- `GET`、`PATCH`、`DELETE /api/transactions/:id` 分別讀取、修改、刪除個別支出。
- 呼叫 API 須先登入。寫入需帶同源的 `Origin`，API 用戶端可另外呼叫 `POST /api/sessions/current/renewals` 更新目前的登入效期。

## Release Notes

正式部署成功後，GitHub Actions 會用 git-cliff 根據 commit 訊息計算版號，把標籤加到已上線的 commit，並建立 GitHub Release 草稿。第一個版本是 `v0.1.0`。之後 `feat:` 會升次版本、`fix:` 會升修補版，重大變更會升主版本。只有 `ci:`、`docs:` 或 `chore:` 的變更會跳過升版。

部署流程會在切換 Worker 版本前套用正式 D1 migration，部署用的 Cloudflare API Token 需能寫入正式 D1。

驗收後，在 GitHub 的 Releases 頁面確認草稿內容，再按 **Publish release** 發布。

修改發版流程後，在本機執行 `bash test/release-draft.test.sh`，檢查標籤與草稿的建立和重跑行為。

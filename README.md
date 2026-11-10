# Cloud Otter

海獺公告欄是登入後可共用的單頁公告欄。兩個管理員可以新增、讀取、修改、刪除多行公告，以及用上移、下移調整順序。

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

```sh
pnpm typecheck
pnpm lint
pnpm test
```

整合測試會在暫存目錄啟動獨立的本機 Worker 和 D1。瀏覽器驗收時，用兩個不同的瀏覽器工作階段登入，確認公告及排序會共用，並驗證登出後無法取得私有內容。

## Release Notes

正式部署驗收後，把版本標籤加到實際上線的 `main` commit，再推送標籤。以 `v0.1.0` 為例。

```sh
git tag v0.1.0 <上線的 commit SHA>
git push origin v0.1.0
```

GitHub Actions 會用 git-cliff 整理該版本的 commit，並建立 GitHub Release 草稿。在 GitHub 的 Releases 頁面確認內容後即可發佈。合併 PR 時，可用 `feat:`、`fix:`、`docs:` 或 `perf:` 當作 commit 訊息的開頭，讓變更自動分類。

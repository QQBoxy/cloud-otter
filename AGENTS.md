# 專案開發規範

## RESTful API

- 以資源為中心設計 API。路徑以名詞表示資源，操作由 HTTP 方法表達。
- 依 RFC 9110 與 RFC 5789 選擇 HTTP 方法，遵守其安全性與冪等性語意。讀取操作不得變更資源狀態。
- 依請求的實際結果回傳符合 HTTP 語意的狀態碼，區分成功、用戶端錯誤與伺服器端錯誤。

## 資料庫查詢

- Worker 的 D1 查詢使用 Drizzle 的型別化查詢 API，由 Drizzle 綁定動態值。SQL 檔用於 D1 migration。

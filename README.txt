陳家糖燻滷味 PWA 第一版
========================

功能
- 新增 / 修改 / 刪除訂單
- 姓名、電話、取貨日期、各品項數量、備註
- 依日期與姓名/電話篩選訂單
- 依取貨日期統計各品項總數及每位客戶明細
- Excel (.xls) 匯出：訂單明細 + 品項總計
- 品項新增、改名、排序、啟用/停用、刪除
- IndexedDB 本機儲存
- JSON 完整備份 / 還原
- PWA 離線快取及 Android 安裝支援

如何在電腦測試
1. 解壓縮後進入本資料夾。
2. 不要直接雙擊 index.html；PWA/Service Worker 需要 HTTP/HTTPS。
3. 若已安裝 Node.js，可執行：
   npx http-server . -p 8080
4. 瀏覽器開啟 http://localhost:8080

如何在 Android 使用
- 正式使用時，需將整個資料夾部署到 HTTPS 網址（例如 GitHub Pages、Cloudflare Pages、Netlify 等）。
- Android Chrome 開啟該網址後，可使用「安裝 App」或瀏覽器的「加到主畫面」。
- 第一次載入完成後，核心功能可離線使用。

資料安全
- 資料預設只存於目前手機 / 瀏覽器的 IndexedDB。
- 清除瀏覽器網站資料、換手機、重設手機可能造成資料消失。
- 建議定期使用「備份」頁的「匯出完整備份」。

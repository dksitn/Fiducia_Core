// Cloudflare Pages Function - 這個檔案 Cloudflare 會自動識別為 Worker
export default {
  // 這個 scheduled 函式會被 Cloudflare Cron 觸發
  async scheduled(event: any, env: any, ctx: any) {
    const secret = env.CRON_SECRET;
    const baseUrl = env.NEXT_PUBLIC_APP_URL; // 你的部署網址
    
    try {
      const res = await fetch(
        `${baseUrl}/api/cron/sync-financials?secret=${secret}`,
        { method: 'GET' }
      );
      const result = await res.json();
      console.log('Cron 執行結果:', JSON.stringify(result));
    } catch (err) {
      console.error('Cron 執行失敗:', err);
    }
  }
};
```

---

## 步驟三：在 Cloudflare Dashboard 設定環境變數

進入 Cloudflare → 你的 Pages 專案 → Settings → Environment Variables，新增：

| 變數名稱 | 值 |
|---|---|
| `CRON_SECRET` | 自己取一個隨機字串，例如 `fiducia-cron-2024-secret` |
| `NEXT_PUBLIC_APP_URL` | `https://fiducia-core.pages.dev` |

同樣在 `.env.local` 加：
```
CRON_SECRET=fiducia-cron-2024-secret
```

---

## 步驟四：在 Cloudflare Dashboard 設定 Cron Schedule

進入 Cloudflare → Workers & Pages → 你的專案 → Settings → Functions → **Cron Triggers**

新增：`0 18 * * *`（這是 UTC 時間，對應台灣凌晨 2:00）

---

## 你現在立刻要做的事（優先順序）

**第一：** 先確認測試資料有進去 → 去你的財務儀表板頁面看看有沒有顯示台積電資料

**第二：** 建立 `app/api/cron/sync-financials/route.ts`

**第三：** 手動測試這個 API（在瀏覽器打）：
```
https://fiducia-core.pages.dev/api/cron/sync-financials?secret=fiducia-cron-2024-secret
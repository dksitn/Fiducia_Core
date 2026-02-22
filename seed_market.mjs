// seed_market.mjs
import yf from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 載入 .env.local 檔案
dotenv.config({ path: '.env.local' });

// 防禦性實例化 yahoo-finance2
const yahooFinance = typeof yf === 'function' ? new yf() : yf;

// 從環境變數安全地讀取金鑰
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// 防呆機制
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ 錯誤：找不到 Supabase 環境變數，請確認 .env.local 檔案是否存在且包含 URL 與 SERVICE_ROLE_KEY。");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COMPANIES = {
  '2330': '2330.TW', '2317': '2317.TW', '2454': '2454.TW',
  '2881': '2881.TW', '2882': '2882.TW', '2891': '2891.TW',
  '1301': '1301.TW', '2002': '2002.TW', '1216': '1216.TW',
  '2308': '2308.TW', 'TAIEX': '^TWII' // 大盤
};

async function fetchAndUpload() {
  console.log("🚀 開始透過 Node.js 獲取真實市場歷史資料...");
  
  // 計算一年前的日期
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const period1 = oneYearAgo.toISOString().split('T')[0];

  for (const [companyCode, ticker] of Object.entries(COMPANIES)) {
    console.log(`📥 正在處理: ${companyCode} (${ticker})...`);
    try {
      // 獲取歷史資料
      const result = await yahooFinance.historical(ticker, { period1 });
      
      if (!result || result.length === 0) {
        console.log(`⚠️ 找不到 ${companyCode} 的資料，跳過。`);
        continue;
      }

      // 轉換成 Supabase 需要的格式
      const records = result.map(row => ({
        company_code: companyCode,
        trade_date: row.date.toISOString().split('T')[0],
        open: Number(row.open.toFixed(2)),
        high: Number(row.high.toFixed(2)),
        low: Number(row.low.toFixed(2)),
        close: Number(row.close.toFixed(2)),
        volume: row.volume || 0,
        status: 'VALID',
        dq_score: 100
      }));

      // 冪等性寫入：先刪除舊資料，再寫入新資料
      await supabase.from('mkt_daily_series').delete().eq('company_code', companyCode);
      
      // 分批寫入避免 payload 過大
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from('mkt_daily_series').insert(chunk);
        if (error) throw error;
      }
      
      console.log(`  ✅ 成功寫入 ${records.length} 筆日 K 資料。`);
    } catch (err) {
      console.error(`❌ 處理 ${companyCode} 時發生錯誤:`, err.message);
    }
  }
  console.log("🎉 全部同步完成！");
}

fetchAndUpload();
// seed_market_v2.mjs
// 執行方式：node seed_market_v2.mjs
// 需求：npm install yahoo-finance2 @supabase/supabase-js dotenv

import yf from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const yahooFinance = typeof yf === 'function' ? new yf() : yf;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 找不到 Supabase 環境變數，請確認 .env.local 包含：');
  console.error('   NEXT_PUBLIC_SUPABASE_URL=...');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COMPANIES = {
  '2330': '2330.TW', '2317': '2317.TW', '2454': '2454.TW',
  '2881': '2881.TW', '2882': '2882.TW', '2891': '2891.TW',
  '1301': '1301.TW', '2002': '2002.TW', '1216': '1216.TW',
  '2308': '2308.TW',
  'TAIEX': '^TWII',  // ✅ 大盤指數（技術分析必要）
};

const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
const period1 = oneYearAgo.toISOString().split('T')[0];

console.log(`\n🚀 FIDUCIA Core - 市場 K 線歷史資料同步`);
console.log(`📅 抓取期間：${period1} ~ 今日`);
console.log(`📦 目標：${Object.keys(COMPANIES).length} 家公司 + 大盤 TAIEX\n`);

let totalInserted = 0;
let failed = [];

for (const [companyCode, ticker] of Object.entries(COMPANIES)) {
  process.stdout.write(`  [${companyCode}] ${ticker} ... `);
  try {
    const result = await yahooFinance.historical(ticker, {
      period1,
      interval: '1d',
    });

    if (!result || result.length === 0) {
      console.log('⚠️  無資料，跳過');
      failed.push({ code: companyCode, reason: '無歷史資料' });
      continue;
    }

    const records = result
      .filter(row => row.close != null)
      .map(row => ({
        company_code: companyCode,
        trade_date:   row.date.toISOString().split('T')[0],
        open:         Number((row.open  ?? row.close).toFixed(2)),
        high:         Number((row.high  ?? row.close).toFixed(2)),
        low:          Number((row.low   ?? row.close).toFixed(2)),
        close:        Number(row.close.toFixed(2)),
        volume:       row.volume || 0,
        status:       'VALID',
        dq_score:     100,
        source_ref:   'YAHOO_FINANCE',
      }));

    // 先刪舊資料再批次插入（冪等）
    await supabase.from('mkt_daily_series').delete().eq('company_code', companyCode);

    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < records.length; i += CHUNK) {
      const { error } = await supabase.from('mkt_daily_series').insert(records.slice(i, i + CHUNK));
      if (error) throw error;
      inserted += Math.min(CHUNK, records.length - i);
    }

    totalInserted += inserted;
    console.log(`✅ ${inserted} 筆`);

  } catch (err) {
    console.log(`❌ 失敗`);
    failed.push({ code: companyCode, reason: err.message });
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`🎉 同步完成！共寫入 ${totalInserted} 筆 K 線資料`);

if (failed.length > 0) {
  console.log(`\n⚠️  以下 ${failed.length} 家未成功：`);
  failed.forEach(f => console.log(`   ${f.code}: ${f.reason}`));
}

console.log(`\n✅ 下一步：重整瀏覽器，開啟「技術分析」頁籤即可看到 K 線資料`);

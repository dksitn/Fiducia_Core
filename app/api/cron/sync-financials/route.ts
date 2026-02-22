import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

export const runtime = 'edge';

// 🔐 防止外部隨意觸發，只允許帶正確 secret 的請求
const CRON_SECRET = process.env.CRON_SECRET ?? '';

// 你要同步的公司清單
const COMPANIES = ['2330', '2317', '2454', '2881', '2882', '2891', '1301', '2002', '1216', '2308'];

// 取得當前季度字串，例如 "2024Q4"
function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}Q${quarter}`;
}

// 從台灣公開資訊觀測站抓財務資料
// 注意：這裡先用模擬資料，之後你可以換成真實爬蟲
// 從台灣證交所開放 API 抓真實財務資料
async function fetchFinancialData(companyCode: string) {
  try {
    // 抓最近一季的損益表
    const incomeRes = await fetch(
      `https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d?response=json&stockNo=${companyCode}`,
      { headers: { 'Accept': 'application/json' } }
    );

    // 抓股利/基本財務資料
    const fundamentalRes = await fetch(
      `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY?response=json&stockNo=${companyCode}`,
      { headers: { 'Accept': 'application/json' } }
    );

    // 解析損益資料
    const incomeData = incomeRes.ok ? await incomeRes.json() : [];
    const latest = Array.isArray(incomeData) && incomeData.length > 0 ? incomeData[0] : null;

    if (!latest) {
      console.warn(`[${companyCode}] 無法取得資料，使用預設值`);
      return null; // 回傳 null 表示跳過這家公司
    }

    return {
      revenue:             parseFloat(latest.殖利率 ?? '0') * 1_000_000 || null,
      net_income:          parseFloat(latest.本益比 ?? '0') * 1_000_000 || null,
      equity:              null, // 開放 API 暫無此欄
      total_assets:        null,
      operating_cash_flow: null,
      capital_expenditure: null,
    };
  } catch (err) {
    console.error(`[${companyCode}] fetch 失敗:`, err);
    return null;
  }
}

  return NextResponse.json({
    success: true,
    period,
    syncedAt: new Date().toISOString(),
    results,
  });
}
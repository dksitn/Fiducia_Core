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
async function fetchFinancialData(companyCode: string) {
  // TODO: 未來替換成真實 API，例如：
  // const res = await fetch(`https://mops.twse.com.tw/...${companyCode}...`);
  
  // 現階段：回傳模擬資料，讓整個流程可以跑通
  return {
    revenue: Math.floor(Math.random() * 500_000_000_000) + 100_000_000_000,
    netIncome: Math.floor(Math.random() * 200_000_000_000) + 10_000_000_000,
    equity: Math.floor(Math.random() * 2_000_000_000_000) + 500_000_000_000,
    totalAssets: Math.floor(Math.random() * 5_000_000_000_000) + 1_000_000_000_000,
    operatingCashFlow: Math.floor(Math.random() * 300_000_000_000) + 50_000_000_000,
    capitalExpenditure: Math.floor(Math.random() * 150_000_000_000) + 10_000_000_000,
  };
}

export async function GET(request: Request) {
  // 驗證 secret，防止外人亂打
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }

  const period = getCurrentPeriod();
  const results: any[] = [];

  for (const companyCode of COMPANIES) {
    try {
      const metrics = await fetchFinancialData(companyCode);
      
      const { error } = await supabaseAdmin
        .from('fin_financial_fact')
        .upsert(
          [{
            company_code: companyCode,
            period: period,
            status: 'DRAFT',
            revenue: metrics.revenue,
            net_income: metrics.netIncome,
            equity: metrics.equity,
            total_assets: metrics.totalAssets,
            operating_cash_flow: metrics.operatingCashFlow,
            capital_expenditure: metrics.capitalExpenditure,
            metrics: metrics,
            dq_score: 85,
          }],
          { onConflict: 'company_code,period' }
        );

      if (error) throw error;
      results.push({ companyCode, status: 'ok' });

    } catch (err: any) {
      results.push({ companyCode, status: 'error', message: err.message });
    }
  }

  return NextResponse.json({
    success: true,
    period,
    syncedAt: new Date().toISOString(),
    results,
  });
}
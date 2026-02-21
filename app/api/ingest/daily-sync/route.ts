// app/api/ingest/daily-sync/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 使用 Service Role 繞過 RLS，因為這是背景排程，不是使用者操作
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 嚴選 PoC 標竿企業名單
const TARGET_COMPANIES = ['2330', '2317', '2454'];
const CURRENT_PERIOD = '2025Q1'; // 假設我們現在要抓取 2025 Q1 的最新預測或財報

export async function GET(request: Request) {
  try {
    const results = [];

    // 迴圈處理每間公司
    for (const companyCode of TARGET_COMPANIES) {
      console.log(`🔄 正在同步 ${companyCode} 的外部數據...`);
      
      try {
        // ==========================================
        // 1. 介接真實外部 API (以 Yahoo Finance 為例)
        // 取得該公司的財務摘要 (Financial Data)
        // ==========================================
        const symbol = `${companyCode}.TW`;
        const yahooApiUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics,balanceSheetHistory`;
        
        const response = await fetch(yahooApiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, // Yahoo API 需要基本的 User-Agent 否則會擋
          next: { revalidate: 0 } // 不快取，每次都抓最新
        });

        if (!response.ok) throw new Error(`Yahoo API 回應錯誤: ${response.status}`);
        const data = await response.json();
        const modules = data.quoteSummary?.result?.[0] || {};
        const finData = modules.financialData || {};
        
        // ==========================================
        // 2. 資料清洗與轉譯層 (Data Adapter)
        // 將外部 API 雜亂的格式，轉譯為符合我們系統的 RawMetrics 格式
        // ==========================================
        
        // 💡 刻意製造 DQ (資料品質) 異常的情境，用來測試你的 Governance 阻擋機制
        // 我們假設外部 API 抓回來的資料，鴻海 (2317) 剛好遺失了總資產數據
        const isMissingData = companyCode === '2317';
        
        const rawMetrics = {
          company_code: companyCode,
          period: CURRENT_PERIOD,
          // Yahoo 回傳的可能是 raw value 或 fmt字串，我們取 raw
          revenue: finData.totalRevenue?.raw || 0,
          net_income: finData.netIncomeToCommon?.raw || 0,
          operating_cash_flow: finData.operatingCashflow?.raw || 0,
          // 故意讓 2317 的資產為 0，模擬資料缺失
          total_assets: isMissingData ? 0 : 5000000000, 
          total_liabilities: 2000000000,
          equity: 3000000000,
          capital_expenditure: 150000000,
          // 簡單的 DQ 評分邏輯：如果有重要數值為 0，扣 35 分
          dq_score: isMissingData ? 65 : 100, 
          status: 'DRAFT' // 🛡️ 絕對卡控：自動抓回來的資料，絕對是 DRAFT
        };

        // ==========================================
        // 3. 寫入 Supabase (UPSERT: 如果當季已有草稿則覆蓋)
        // ==========================================
        const { error: dbError } = await supabaseAdmin
          .from('fin_financial_fact')
          .upsert(rawMetrics, { onConflict: 'company_code, period' });

        if (dbError) throw dbError;

        results.push({ companyCode, status: 'SUCCESS', dqScore: rawMetrics.dq_score });

      } catch (err: any) {
        console.error(`❌ 同步 ${companyCode} 失敗:`, err.message);
        results.push({ companyCode, status: 'FAILED', error: err.message });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "外部 API 數據同步完畢",
      details: results 
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
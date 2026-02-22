// app/api/v1/fin/facts/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

// ✅ 使用 service role，繞過 RLS，確保 DRAFT 寫入成功
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyCode, period, metrics, userId } = body;

    if (!companyCode || !period || !metrics) {
      return NextResponse.json(
        { success: false, error: { message: '缺少必要欄位：companyCode, period, 或 metrics' } },
        { status: 400 }
      );
    }

    // 從 metrics 解包扁平欄位（camelCase → snake_case）
    const flatFields = {
      revenue:             metrics.revenue             ?? null,
      net_income:          metrics.netIncome           ?? null,
      equity:              metrics.equity              ?? null,
      total_assets:        metrics.totalAssets         ?? null,
      total_liabilities:   metrics.totalLiabilities    ?? null,
      operating_cash_flow: metrics.operatingCashFlow   ?? null,
      capital_expenditure: metrics.capitalExpenditure  ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('fin_financial_fact')
      .upsert(
        [{
          company_code: companyCode,
          period,
          status:    'DRAFT',   // ✅ 強制 DRAFT，走治理放行流程
          metrics,              // 保留原始 JSONB
          ...flatFields,
          dq_score:  85,
          created_by: userId ?? null,
        }],
        { onConflict: 'company_code,period' }
      )
      .select('id, status')
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        data: {
          id:      data.id,
          status:  data.status,
          message: '✅ 財務數據已寫入，等待 DQ 驗證與治理放行。',
        },
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('[fin/facts] 寫入失敗:', error);
    return NextResponse.json(
      { success: false, error: { message: error.message || '伺服器內部錯誤' } },
      { status: 500 }
    );
  }
}

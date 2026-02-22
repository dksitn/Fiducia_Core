// app/api/v1/fin/facts/route.ts （升級版）
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyCode, period, metrics, userId } = body;

    if (!companyCode || !period || !metrics) {
      return NextResponse.json(
        { success: false, error: { message: "缺少必要欄位：companyCode, period, 或 metrics" } },
        { status: 400 }
      );
    }

    // 🌟 核心升級：從 metrics 解包扁平欄位
    const flatFields = {
      revenue:              metrics.revenue              ?? null,
      net_income:           metrics.netIncome            ?? null,
      equity:               metrics.equity               ?? null,
      total_assets:         metrics.totalAssets          ?? null,
      operating_cash_flow:  metrics.operatingCashFlow    ?? null,
      capital_expenditure:  metrics.capitalExpenditure   ?? null,
    };

    // 使用 upsert 避免重複寫入（相同 company_code + period 視為更新）
    const { data, error } = await supabase
      .from('fin_financial_fact')
      .upsert(
        [{
          company_code: companyCode,
          period:       period,
          status:       'DRAFT',
          metrics:      metrics,        // 保留原始 JSONB
          ...flatFields,                // 扁平欄位同步寫入
          dq_score:     85,
          created_by:   userId ?? null,
        }],
        { onConflict: 'company_code,period' }  // 需要先建 unique constraint（見下方）
      )
      .select('id, status')
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        data: {
          id: data.id,
          status: data.status,
          message: "✅ 財務數據已寫入，等待 DQ 驗證與治理放行。"
        }
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error("API 寫入失敗:", error);
    return NextResponse.json(
      { success: false, error: { message: error.message || "伺服器內部錯誤" } },
      { status: 500 }
    );
  }
}
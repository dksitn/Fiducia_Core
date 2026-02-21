import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase'; // 確保這裡引入你原本專案設定好的 supabase client

export async function POST(request: Request) {
  try {
    // 1. 解析前端或外部系統傳來的 JSON
    const body = await request.json();
    const { companyCode, period, metrics, userId } = body;

    // 2. 基本資料驗證 (防禦性編程的第一道防線)
    if (!companyCode || !period || !metrics) {
      return NextResponse.json(
        { success: false, error: { message: "缺少必要欄位：companyCode, period, 或 metrics" } },
        { status: 400 } // HTTP 400: Bad Request
      );
    }

    // 3. 寫入 Supabase (對齊我們剛才設計的 Schema)
    const { data, error } = await supabase
      .from('fin_financial_fact')
      .insert([
        {
          company_code: companyCode,
          period: period,
          status: 'DRAFT',   // 預設為草稿
          metrics: metrics,
          dq_score: 85,      // 暫時給一個預設的 DQ 分數，未來可串接真實檢查引擎
          created_by: userId // 記錄是誰上傳的
        }
      ])
      .select('id, status')
      .single();

    // 如果資料庫拋出錯誤 (例如違反唯一性或型別錯誤)
    if (error) throw error;

    // 4. 成功回應
    return NextResponse.json(
      {
        success: true,
        data: {
          id: data.id,
          status: data.status,
          message: "✅ 財務數據草稿已建立，等待 DQ 驗證與治理放行。"
        }
      },
      { status: 201 } // HTTP 201: Created
    );

  } catch (error: any) {
    console.error("API 寫入失敗:", error);
    return NextResponse.json(
      { success: false, error: { message: error.message || "伺服器內部錯誤" } },
      { status: 500 } // HTTP 500: Internal Server Error
    );
  }
}
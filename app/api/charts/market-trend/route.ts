// app/api/charts/market-trend/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase'; // 使用你專案內的 supabase client

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyCode = searchParams.get('companyCode');

    if (!companyCode) {
      return NextResponse.json(
        { success: false, error: { message: "缺少參數 companyCode" } },
        { status: 400 }
      );
    }

    // 平行查詢個股與大盤過去 280 筆資料
    const [targetRes, benchmarkRes] = await Promise.all([
      supabase
        .from('mkt_daily_series')
        .select('trade_date, open, high, low, close, volume')
        .eq('company_code', companyCode)
        .eq('status', 'VALID')
        .order('trade_date', { ascending: false })
        .limit(280),
      supabase
        .from('mkt_daily_series')
        .select('trade_date, open, high, low, close, volume')
        .eq('company_code', 'TAIEX')
        .eq('status', 'VALID')
        .order('trade_date', { ascending: false })
        .limit(280)
    ]);

    if (targetRes.error) throw targetRes.error;
    if (benchmarkRes.error) throw benchmarkRes.error;

    // 將資料反轉，讓前端圖表從左(舊)畫到右(新)
    const targetData = (targetRes.data || []).reverse();
    const benchmarkData = (benchmarkRes.data || []).reverse();

    return NextResponse.json({
      success: true,
      data: { targetData, benchmarkData }
    });

  } catch (error: any) {
    console.error("API 獲取真實資料失敗:", error);
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}
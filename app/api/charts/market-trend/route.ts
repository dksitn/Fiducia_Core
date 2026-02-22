// app/api/charts/market-trend/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyCode = searchParams.get('companyCode');

    if (!companyCode) {
      return NextResponse.json(
        { success: false, error: { message: '缺少參數 companyCode' } },
        { status: 400 }
      );
    }

    // 平行撈個股與大盤，280筆（約 200 個交易日）
    const [targetRes, benchmarkRes] = await Promise.all([
      supabase
        .from('mkt_daily_series')
        // ✅ 短名欄位，與 seed_market.mjs 寫入格式一致
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
        .limit(280),
    ]);

    if (targetRes.error)    throw targetRes.error;
    if (benchmarkRes.error) throw benchmarkRes.error;

    // 反轉讓圖表由左（舊）畫到右（新）
    const targetData    = (targetRes.data    || []).reverse();
    const benchmarkData = (benchmarkRes.data || []).reverse();

    return NextResponse.json({ success: true, data: { targetData, benchmarkData } });

  } catch (error: any) {
    console.error('[market-trend] 錯誤:', error);
    return NextResponse.json(
      { success: false, error: { message: error.message } },
      { status: 500 }
    );
  }
}

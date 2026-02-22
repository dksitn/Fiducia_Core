// app/api/charts/market-trend/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// R6: Mock 資料生成器 (模擬真實股市波動)
function generateMockData(calendarDays: number, basePrice: number, volatility: number) {
  const data = [];
  let currentPrice = basePrice;
  const today = new Date();

  // 從過去 N 天往今天推算
  for (let i = calendarDays; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    // 實用技巧：跳過星期日 (0) 與 星期六 (6)，模擬真實交易日
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    // 隨機漲跌幅
    const changePct = volatility * (Math.random() - 0.5); 
    const open = currentPrice;
    const close = currentPrice * (1 + changePct);
    const high = Math.max(open, close) * (1 + (volatility * 0.5 * Math.random()));
    const low = Math.min(open, close) * (1 - (volatility * 0.5 * Math.random()));
    const volume = Math.floor(Math.random() * 10000000) + 5000000;

    data.push({
      trade_date: date.toISOString().split('T')[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume
    });
    
    currentPrice = close; // 隔天以今天的收盤價繼續算
  }
  return data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get('companyCode');

  if (!companyCode) {
    return NextResponse.json({ success: false, error: { message: "缺少 companyCode" } }, { status: 400 });
  }

  // 1. 產生假資料：往回推 210 個日曆天 (扣掉週末約等於 150 個交易日)
  // 假設個股基準價 1000 (波動度 3%)，大盤基準價 20000 (波動度 1.5%)
  const targetData = generateMockData(210, 1000, 0.03); 
  const benchmarkData = generateMockData(210, 20000, 0.015);

  // 2. 這裡已經預留好了，未來只要把 generateMockData 換成 R5 教你的 Supabase 查詢即可！
  return NextResponse.json({
    success: true,
    data: {
      targetData,
      benchmarkData
    }
  });
}
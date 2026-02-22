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
    
    // 跳過星期日 (0) 與 星期六 (6)，模擬真實交易日
    if (date.getDay() === 0 || date.getDay() === 6) continue;

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
    
    currentPrice = close;
  }
  return data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get('companyCode');

  if (!companyCode) {
    return NextResponse.json({ success: false, error: { message: "缺少 companyCode" } }, { status: 400 });
  }

  // 🟢 更改為推算 280 個日曆天 (約等於 200 個交易日)
  const targetData = generateMockData(280, 1000, 0.03); 
  const benchmarkData = generateMockData(280, 20000, 0.015);

  return NextResponse.json({
    success: true,
    data: {
      targetData,
      benchmarkData
    }
  });
}
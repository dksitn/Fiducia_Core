import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

export const runtime = 'edge';

const COMPANIES = ['2330','2317','2454','2881','2882','2891','1301','2002','1216','2308'];

function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}Q${quarter}`;
}

export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }

  // 直接呼叫 TW_FUNDAMENTAL_SYNC plugin，走真實 TWSE API
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/plugins/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId: 'TW_FUNDAMENTAL_SYNC', userId: 'SYSTEM_CRON' })
  });

  const result = await res.json();
  return NextResponse.json({
    success: true,
    period: getCurrentPeriod(),
    syncedAt: new Date().toISOString(),
    result
  });
}
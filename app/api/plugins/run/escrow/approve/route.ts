import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { evidenceId, action, userId } = await request.json(); 
    // action 會是 'APPROVE' 或 'REJECT'
    const newStatus = action === 'APPROVE' ? 'VALID' : 'REJECTED';

    // 1. 更新原證據的狀態 (從 PENDING 變成 VALID 或 REJECTED)
    const { error: updateError } = await supabaseAdmin
      .from('sys_evidence_items')
      .update({ status: newStatus })
      .eq('id', evidenceId);
    
    if (updateError) throw updateError;

    // 2. 決策存證：把主管的「放行/退回」動作也寫入歷史軌跡
    await supabaseAdmin.from('sys_state_versions').insert({
      version_hash: `decision-${evidenceId.substring(0,5)}-${Date.now()}`,
      author_user_id: userId,
      summary: `[放行決策] ${action === 'APPROVE' ? '✅ 核准' : '❌ 退回'} 程式碼上線 (Evidence ID: ${evidenceId})`
    });

    /* 實務整合點：
      這裡會寫一段 fetch 去呼叫 GitHub API (Deployment Status API)，
      告訴 GitHub "state": "success" (放行) 或 "failure" (阻擋)。
    */

    return NextResponse.json({ success: true, newStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
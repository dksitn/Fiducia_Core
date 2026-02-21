'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function GovernanceDashboardPage() {
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [latestEvidence, setLatestEvidence] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSealing, setIsSealing] = useState(false);
  const [sealResult, setSealResult] = useState<{ hash: string; fingerprint: string } | null>(null);

  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);

  // ─────────────────────────────────────────────
  // 核心一：撈取待辦視圖
  // v_pending_governance_reviews 應包含以下欄位：
  //   task_id, source_record_id, company_code, period,
  //   type (e.g. '財務報表' | 'ESG報告'), dq_score,
  //   action_status (e.g. '待放行' | '已阻擋'), issue
  // ─────────────────────────────────────────────
  const fetchPendingTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('v_pending_governance_reviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = (data || []).map((task: any) => ({
        id: task.task_id,
        recordId: task.source_record_id,
        company: task.company_code,
        period: task.period,
        type: task.type,
        dqScore: task.dq_score,
        status: task.action_status,
        issue: task.issue ?? '無'
      }));

      setPendingTasks(formattedData);
      setSelectedTask(formattedData.length > 0 ? formattedData[0] : null);
    } catch (err) {
      console.error('無法取得待審核任務:', err);
    }
  };

  const fetchLatestEvidence = async () => {
    const { data } = await supabase
      .from('sys_evidence_items')
      .select('*, sys_state_versions (version_hash)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setLatestEvidence(data);
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);

      // 取得登入身份
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data: roleData } = await supabase
          .from('sys_role_grants')
          .select('role')
          .eq('grantee_user_id', session.user.id)
          .maybeSingle();
        if (roleData) setRole(roleData.role);
      }

      await Promise.all([fetchPendingTasks(), fetchLatestEvidence()]);
      setIsLoading(false);
    };
    init();
  }, []);

  // ─────────────────────────────────────────────
  // 核心二：數位簽章放行
  //
  // 流程：
  //   1. 前端 DQ 門檻前置阻擋
  //   2. 從 DB 撈完整原始 payload（不信任 view 欄位）
  //   3. 呼叫封存引擎（後端再次做 DQ 雙重防線）
  //   4. 封存成功 → 回寫 status='VALID' + evidence_id 到來源資料表
  //   5. 重新整理佇列（已 VALID 的資料不會再出現在 view 中）
  // ─────────────────────────────────────────────
  const handleApprove = async () => {
    if (!selectedTask) return alert('請先選擇任務');
    if (!user) return alert('請先登入');
    if (selectedTask.dqScore < 80) return alert('此資料品質未達標 (DQ < 80)，嚴禁放行！');
    if (!confirm(
      `⚠️ 確定要以數位簽章放行？\n\n公司: ${selectedTask.company}\n期別: ${selectedTask.period}\n類型: ${selectedTask.type}\n\n此動作將產生不可篡改 SHA-256 指紋並寫入治理金庫，無法撤銷。`
    )) return;

    setIsSealing(true);
    setSealResult(null);

    try {
      // Step 1: 決定來源資料表與封存引擎
      const isFinancial = selectedTask.type === '財務報表';
      const tableName = isFinancial ? 'fin_financial_fact' : 'esg_metrics';
      const pluginId = isFinancial ? 'P_FIN_REPORT_VERSION_SEAL' : 'P_ESG_REPORT_VERSION_SEAL';

      // Step 2: 從 DB 撈完整原始 payload（以 recordId 精確定位）
      const { data: rawPayload, error: payloadErr } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', selectedTask.recordId)
        .single();

      if (payloadErr || !rawPayload) {
        throw new Error(`無法取得原始資料 Payload (id=${selectedTask.recordId}): ${payloadErr?.message}`);
      }

      // 前端再次確認這筆資料是 DRAFT（防止重複提交）
      if (rawPayload.status === 'VALID') {
        throw new Error('此記錄已封存，請重新整理頁面');
      }
      if (rawPayload.status === 'REJECTED') {
        throw new Error('此記錄已被拒絕，無法放行');
      }

      // Step 3: 呼叫封存引擎
      const res = await fetch('/api/plugins/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId,
          userId: user.id, // 合法 UUID，對應登入用戶
          input: {
            companyId: selectedTask.company,  // P_FIN 使用
            orgId: selectedTask.company,      // P_ESG 使用
            period: selectedTask.period,
            payload: rawPayload               // ★ 完整原始資料
          }
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '封存引擎回傳錯誤');

      // Step 4: 回寫 status='VALID' + evidence_id（建立可追溯鏈）
      // 注意：此處用 service role 在前端仍受 RLS 保護
      // 如需繞過 RLS，應改為呼叫另一支 API route（建議 PoC 後升級）
      const { error: updateErr } = await supabase
        .from(tableName)
        .update({
          status: 'VALID',
          // evidence_id: result.evidence_id  ← 若資料表有此欄位則啟用
        })
        .eq('id', selectedTask.recordId);

      if (updateErr) {
        // 封存已成功，status 更新失敗屬次要問題，警告不拋出
        console.warn('⚠️ evidence 已封存，但 status 更新失敗:', updateErr.message);
      }

      // Step 5: 更新畫面
      setSealResult({
        hash: result.version_hash,
        fingerprint: result.fingerprint
      });
      await Promise.all([fetchPendingTasks(), fetchLatestEvidence()]);

    } catch (err: any) {
      alert('❌ 放行失敗: ' + err.message);
    } finally {
      setIsSealing(false);
    }
  };

  // ─────────────────────────────────────────────
  // 退回修改：將 DRAFT 改為 RETURNED，並從佇列移除
  // ─────────────────────────────────────────────
  const handleReturn = async () => {
    if (!selectedTask) return;
    if (!confirm(`確定退回 ${selectedTask.company} ${selectedTask.period} ${selectedTask.type}？`)) return;

    const tableName = selectedTask.type === '財務報表' ? 'fin_financial_fact' : 'esg_metrics';
    await supabase
      .from(tableName)
      .update({ status: 'RETURNED' })
      .eq('id', selectedTask.recordId);

    await fetchPendingTasks();
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto h-full flex flex-col">

      {/* Header */}
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0">
        <h1 className="text-2xl font-black text-slate-800 mb-1">治理與放行 (核決樞紐)</h1>
        <p className="text-xs font-bold text-slate-500">
          在此佇列中的資料皆處於{' '}
          <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">DRAFT</span>{' '}
          狀態，需通過 DQ≥80 門檻並經您數位簽章後，方能生效供業務端查閱。
        </p>
        {/* 目前登入角色提示 */}
        {role && (
          <p className="text-[10px] text-slate-400 mt-1">
            登入身份：<span className="text-indigo-600 font-bold">{role}</span>
            {user?.email && ` (${user.email})`}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">

        {/* ─── 左側：待審核佇列 ─── */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
            <h2 className="text-sm font-black text-slate-800">待審核佇列 (Pending)</h2>
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-1 rounded-full">
              {pendingTasks.length} 筆
            </span>
          </div>

          <div className="overflow-y-auto p-3 space-y-2 flex-1">
            {pendingTasks.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">🎉 目前無待處理的任務</p>
            ) : (
              pendingTasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => { setSelectedTask(task); setSealResult(null); }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedTask?.id === task.id
                      ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                      : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded truncate max-w-[100px]">
                      {task.id}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                      task.status === '待放行' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">{task.company}</h3>
                  <p className="text-xs text-slate-500 mt-1">{task.type} | {task.period}</p>
                  {/* DQ 分數預覽 */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${task.dqScore >= 80 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                        style={{ width: `${task.dqScore}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-black ${task.dqScore >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {task.dqScore}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 最新入庫指紋 */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
            <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">最新入庫指紋</p>
            {latestEvidence ? (
              <div>
                <p className="text-xs text-emerald-400 font-mono truncate">
                  {latestEvidence.sys_state_versions?.version_hash ?? '—'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 truncate">
                  SHA256: {latestEvidence.fingerprint ?? latestEvidence.sha256}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">尚無存證紀錄</p>
            )}
          </div>
        </div>

        {/* ─── 右側：詳細資訊與審核決策 ─── */}
        <div className="lg:col-span-2 flex flex-col min-h-0 gap-6">
          {selectedTask ? (
            <>
              {/* 封存成功通知 */}
              {sealResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shrink-0 animate-fade-in-up">
                  <p className="text-sm font-black text-emerald-700 mb-2">✅ 審核放行成功！資料已寫入不可篡改金庫。</p>
                  <p className="text-[10px] font-mono text-emerald-600 truncate">治理版本: {sealResult.hash}</p>
                  <p className="text-[10px] font-mono text-emerald-500 truncate mt-0.5">指紋: {sealResult.fingerprint}</p>
                  <p className="text-[10px] text-emerald-600 mt-1">請至「追溯查詢」或「財務分析」查看已生效資料。</p>
                </div>
              )}

              {/* 任務詳情卡 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-800">{selectedTask.company}</h2>
                    <p className="text-sm font-bold text-slate-500 mt-1">
                      {selectedTask.period} ｜ {selectedTask.type} ｜ 審核請求
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 mt-1">Record ID: {selectedTask.recordId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">DQ 資料品質分數</p>
                    <p className={`text-3xl font-black ${selectedTask.dqScore >= 80 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {selectedTask.dqScore}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">門檻：80分</p>
                  </div>
                </div>

                {/* DQ 長條圖 */}
                <div className="h-20 w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[{ name: 'DQ', value: selectedTask.dqScore, threshold: 80 }]}
                      margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Bar dataKey="value" barSize={18} radius={[0, 10, 10, 0]}>
                        <Cell fill={selectedTask.dqScore >= 80 ? '#10B981' : '#F43F5E'} />
                      </Bar>
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: any) => [`${v} / 100`, 'DQ 分數']}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 檢查結果 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">自動阻擋檢查</p>
                    <p className={`text-sm font-bold ${selectedTask.issue === '無' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {selectedTask.issue === '無' ? '✔️ 通過 (無異常)' : `❌ 攔截: ${selectedTask.issue}`}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">封存引擎</p>
                    <p className="text-sm font-bold text-slate-700">
                      {selectedTask.type === '財務報表' ? 'P_FIN_REPORT_VERSION_SEAL' : 'P_ESG_REPORT_VERSION_SEAL'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 決策行動區 */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm font-black text-slate-800">執行放行決策</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    按下放行後，資料將印上您的操作員 UUID 指紋並不可逆地寫入治理金庫。
                  </p>
                  {selectedTask.dqScore < 80 && (
                    <p className="text-xs text-rose-600 font-bold mt-1">⛔ DQ 不足，放行按鈕已鎖定</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleReturn}
                    disabled={isSealing}
                    className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    退回修改
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={selectedTask.dqScore < 80 || isSealing}
                    className={`px-5 py-2.5 text-white text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2
                      ${selectedTask.dqScore < 80
                        ? 'bg-slate-300 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                      }
                      ${isSealing ? 'opacity-70 cursor-wait' : ''}
                    `}
                  >
                    {isSealing ? '🔒 正在封存入庫...' : '✔️ 數位簽章放行'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl flex-1 flex flex-col items-center justify-center text-slate-400">
              <span className="text-4xl mb-3 opacity-50">📥</span>
              <p className="text-sm font-bold">請自左側選擇一筆待處理任務</p>
              {pendingTasks.length === 0 && (
                <p className="text-xs text-slate-300 mt-2">目前佇列為空，所有資料已處理完畢</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

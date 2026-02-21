'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

export default function GovernanceDashboardPage() {
  const { user, isSuperAdmin, isAuthLoading } = useAuth();

  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [latestEvidence, setLatestEvidence] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSealing, setIsSealing] = useState(false);
  const [sealResult, setSealResult] = useState<{ hash: string; fingerprint: string } | null>(null);

  const fetchPendingTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('v_pending_governance_reviews')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const formatted = (data || []).map(task => ({
        id: task.task_id,
        recordId: task.source_record_id,
        company: task.company_code,
        period: task.period,
        type: task.type,
        dqScore: task.dq_score,
        status: task.action_status,
        issue: task.issue,
      }));
      setPendingTasks(formatted);
      setSelectedTask((prev: any) => {
          // 保留原本選中的 task（如果還存在），否則選第一筆
          if (prev) {
          const stillExists = formatted.find(t => t.id === prev.id);
          if (stillExists) return stillExists;
        }
        return formatted.length > 0 ? formatted[0] : null;
      });
    } catch (err) {
      console.error('無法取得待審核任務:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchPendingTasks();

      const { data: evidence } = await supabase
        .from('sys_evidence_items')
        .select('*, sys_state_versions (version_hash)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (evidence) setLatestEvidence(evidence);

      setIsLoading(false);
    };
    init();
  }, []);

  // ── 核心：數位簽章放行
  const handleApprove = async () => {
    // 等待 auth 載入完成
    if (isAuthLoading) return alert('身份驗證中，請稍候...');
    if (!user) return alert('請先登入後才能執行放行操作。');
    if (!isSuperAdmin) return alert('需要 System Admin 權限才能執行放行。');
    if (!selectedTask) return alert('請先從左側選擇一筆任務。');
    if (selectedTask.dqScore < 80) return alert(`DQ 分數 ${selectedTask.dqScore} 未達 80，禁止放行！`);

    if (!confirm(`確定要以數位簽章放行 ${selectedTask.company} 的 ${selectedTask.type} (${selectedTask.period}) 嗎？\n\n此動作將產生不可篡改指紋並寫入金庫。`)) return;

    setIsSealing(true);
    setSealResult(null);
    try {
      // 1. 取得原始 Payload
      const tableName = selectedTask.type === '財務報表' ? 'fin_financial_fact' : 'esg_metrics';
      const { data: rawPayload, error: payloadErr } = await supabase
        .from(tableName).select('*').eq('id', selectedTask.recordId).single();
      if (payloadErr || !rawPayload) throw new Error('無法取得原始資料 Payload');

      // 確認資料仍為 DRAFT（前端二次檢查）
      if (rawPayload.status === 'VALID') throw new Error('此記錄已是 VALID 狀態，無需重複放行。');
      if (rawPayload.status === 'REJECTED') throw new Error('此記錄已被拒絕，無法放行。');

      // 2. 呼叫封存引擎
      const pluginId = selectedTask.type === '財務報表'
        ? 'P_FIN_REPORT_VERSION_SEAL'
        : 'P_ESG_REPORT_VERSION_SEAL';

      const res = await fetch('/api/plugins/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId,
          userId: user.id,
          input: {
            companyId: selectedTask.company,
            orgId: selectedTask.company,
            period: selectedTask.period,
            payload: rawPayload,
          }
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '封存引擎回傳錯誤');

      // 3. 回寫 status = VALID（RLS 已關閉，anon key 可寫入）
      const { error: updateErr } = await supabase
        .from(tableName)
        .update({ status: 'VALID' })
        .eq('id', selectedTask.recordId);
      if (updateErr) throw new Error(`封存成功但狀態回寫失敗: ${updateErr.message}`);

      // 4. 顯示成功結果
      setSealResult({ hash: result.version_hash, fingerprint: result.fingerprint });

      // 5. 重新整理佇列
      await fetchPendingTasks();

    } catch (err: any) {
      alert('❌ 放行失敗: ' + err.message);
    } finally {
      setIsSealing(false);
    }
  };

  // ── 退回修改
  const handleReturn = async () => {
    if (!user || !isSuperAdmin) return alert('需要 System Admin 權限。');
    if (!selectedTask) return alert('請先選擇任務。');
    if (!confirm(`確定要將 ${selectedTask.company} ${selectedTask.type} 退回修改嗎？`)) return;

    const tableName = selectedTask.type === '財務報表' ? 'fin_financial_fact' : 'esg_metrics';
    const { error } = await supabase
      .from(tableName)
      .update({ status: 'RETURNED' })
      .eq('id', selectedTask.recordId);

    if (error) return alert('退回失敗: ' + error.message);
    alert('已退回修改。');
    await fetchPendingTasks();
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-slate-800 mb-1">治理與放行 (核決樞紐)</h1>
            <p className="text-xs font-bold text-slate-500">
              在此佇列中的資料皆處於{' '}
              <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">DRAFT</span>{' '}
              狀態，需通過 DQ 門檻並經您數位簽章後，方能生效供業務端查閱。
            </p>
          </div>
          {/* 權限狀態 */}
          {!user ? (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              🔒 請登入後才能執行放行
            </span>
          ) : !isSuperAdmin ? (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
              👁️ 唯讀模式（需 Admin 權限）
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              ✅ System Admin — 可執行放行
            </span>
          )}
        </div>
      </header>

      {/* 封存成功通知 */}
      {sealResult && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-start">
          <div>
            <p className="text-sm font-black text-emerald-700">✅ 數位簽章放行成功！資料已寫入不可篡改金庫。</p>
            <p className="text-[10px] font-mono text-emerald-600 mt-1">
              Hash: {sealResult.hash} | Fingerprint: {sealResult.fingerprint.substring(0, 20)}...
            </p>
          </div>
          <button onClick={() => setSealResult(null)} className="text-emerald-400 hover:text-emerald-600 font-bold text-sm">✖</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">

        {/* 左側：待審核佇列 */}
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
                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                      {task.id}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                      task.status === '待放行' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">{task.company}</h3>
                  <p className="text-xs text-slate-500 mt-1">{task.type} | {task.period}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">DQ: {task.dqScore}</p>
                </div>
              ))
            )}
          </div>

          {/* 最新指紋 */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
            <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">最新入庫指紋</p>
            {latestEvidence ? (
              <div>
                <p className="text-xs text-emerald-400 font-mono truncate">
                  {latestEvidence.sys_state_versions?.version_hash?.substring(0, 24)}...
                </p>
                <p className="text-[10px] text-slate-500 mt-1 truncate">
                  SHA256: {latestEvidence.fingerprint?.substring(0, 20)}...
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">尚無存證紀錄</p>
            )}
          </div>
        </div>

        {/* 右側：審核詳情 */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          {selectedTask ? (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 shrink-0">
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-800">{selectedTask.company}</h2>
                    <p className="text-sm font-bold text-slate-500 mt-1">
                      {selectedTask.period} {selectedTask.type} 審核請求
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {selectedTask.recordId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">DQ 資料品質分數</p>
                    <p className={`text-3xl font-black ${selectedTask.dqScore >= 80 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {selectedTask.dqScore}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {selectedTask.dqScore >= 80 ? '✅ 達標（可放行）' : '❌ 未達標（禁止放行）'}
                    </p>
                  </div>
                </div>

                {/* DQ 長條圖 */}
                <div className="h-20 w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={[{ name: 'DQ', value: selectedTask.dqScore, threshold: 80 }]}
                      margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Bar dataKey="value" barSize={20} radius={[0, 10, 10, 0]}>
                        <Cell fill={selectedTask.dqScore >= 80 ? '#10B981' : '#F43F5E'} />
                      </Bar>
                      <Tooltip cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">自動阻擋檢查</p>
                    <p className={`text-sm font-bold ${selectedTask.issue === '無' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {selectedTask.issue === '無' ? '✔️ 通過 (無異常)' : `❌ 攔截: ${selectedTask.issue}`}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">對應業務模組</p>
                    <p className="text-sm font-bold text-slate-700">
                      {selectedTask.type === '財務報表' ? 'P_FIN_REPORT_VERSION_SEAL' : 'P_ESG_REPORT_VERSION_SEAL'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 決策行動區 */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between mt-auto shrink-0">
                <div>
                  <h3 className="text-sm font-black text-slate-800">執行放行決策</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    按下放行後，資料將印上您的操作員指紋並寫入金庫。
                  </p>
                  {!user && (
                    <p className="text-[10px] text-amber-600 font-bold mt-1">⚠️ 請先從左側 sidebar 登入</p>
                  )}
                </div>

                <div className="flex gap-3">
                  {/* 退回按鈕 */}
                  <button
                    onClick={handleReturn}
                    disabled={!isSuperAdmin || isSealing}
                    className={`px-5 py-2.5 text-sm font-bold rounded-xl shadow-sm transition-colors border ${
                      isSuperAdmin
                        ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                        : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                    }`}
                    title={!isSuperAdmin ? '需要 Admin 權限' : undefined}
                  >
                    退回修改
                  </button>

                  {/* 放行按鈕 */}
                  <button
                    onClick={handleApprove}
                    disabled={!isSuperAdmin || selectedTask.dqScore < 80 || isSealing || isAuthLoading}
                    className={`px-5 py-2.5 text-white text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2
                      ${!isSuperAdmin || selectedTask.dqScore < 80
                        ? 'bg-slate-300 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                      }
                      ${isSealing ? 'opacity-70 cursor-wait' : ''}
                    `}
                    title={
                      !user ? '請先登入' :
                      !isSuperAdmin ? '需要 Admin 權限' :
                      selectedTask.dqScore < 80 ? 'DQ 未達標，禁止放行' :
                      undefined
                    }
                  >
                    {isSealing ? '🔒 正在封存入庫...' :
                     isAuthLoading ? '驗證中...' :
                     !isSuperAdmin ? '🔒 需要 Admin 權限' :
                     '✔️ 數位簽章放行'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl flex-1 flex flex-col items-center justify-center text-slate-400">
              <span className="text-4xl mb-3 opacity-50">📥</span>
              <p className="text-sm font-bold">請自左側選擇一筆待處理任務</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// app/dashboard/governance/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function GovernanceDashboardPage() {
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [latestEvidence, setLatestEvidence] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSealing, setIsSealing] = useState(false);
  const [isSealingAll, setIsSealingAll] = useState(false); // 🟢 新增：批次放行狀態
  
  const [user, setUser] = useState<any>(null);

  const fetchPendingTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('v_pending_governance_reviews')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      const formattedData = (data || []).map(task => ({
        id: task.task_id,
        recordId: task.source_record_id,
        company: task.company_code,
        period: task.period,
        type: task.type,
        dqScore: task.dq_score,
        status: task.action_status,
        issue: task.issue
      }));
      
      setPendingTasks(formattedData);
      if (formattedData.length > 0) {
        setSelectedTask(formattedData[0]);
      } else {
        setSelectedTask(null);
      }
    } catch (err) {
      console.error("無法取得待審核任務:", err);
    }
  };

  useEffect(() => {
    const fetchAuthAndData = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUser(session.user);
      
      await fetchPendingTasks();

      const { data: evidence } = await supabase
        .from('sys_evidence_items')
        .select('*, sys_state_versions (version_hash)')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (evidence) setLatestEvidence(evidence);
      
      setIsLoading(false);
    };
    fetchAuthAndData();
  }, []);

  // 🌟 單筆放行邏輯
  const handleApprove = async (taskToApprove: any) => {
    if (!taskToApprove) return;
    if (taskToApprove.dqScore < 80) return alert('此資料品質未達標，嚴禁放行！');
    
    setIsSealing(true);
    try {
      const tableName = taskToApprove.type === '財務報表' ? 'fin_financial_fact' : 'esg_metrics';
      const { data: rawPayload, error: payloadErr } = await supabase.from(tableName).select('*').eq('id', taskToApprove.recordId).single();
      if (payloadErr || !rawPayload) throw new Error('無法取得原始資料 Payload');

      const pluginId = taskToApprove.type === '財務報表' ? 'P_FIN_REPORT_VERSION_SEAL' : 'P_ESG_REPORT_VERSION_SEAL';

      const res = await fetch('/api/plugins/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId,
          userId: user?.id || 'SYSTEM_ADMIN',
          input: { companyId: taskToApprove.company, orgId: taskToApprove.company, period: taskToApprove.period, payload: rawPayload }
        })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '封存失敗');

      await supabase.from(tableName).update({ status: 'VALID' }).eq('id', taskToApprove.recordId);
      return result;
    } catch (err: any) {
      throw err;
    } finally {
      setIsSealing(false);
    }
  };

  // 🌟 🟢 新增：一鍵全部放行邏輯
  const handleApproveAll = async () => {
    const validTasks = pendingTasks.filter(t => t.dqScore >= 80);
    if (validTasks.length === 0) return alert('目前沒有 DQ 分數及格的待放行任務。');
    
    if (!confirm(`⚠️ 確定要「一鍵放行」全部 ${validTasks.length} 筆及格資料嗎？\n(DQ 分數低於 80 的項目將被自動略過)`)) return;

    setIsSealingAll(true);
    let successCount = 0;
    try {
      // 依序執行放行 (確保指紋循序產生)
      for (const task of validTasks) {
        await handleApprove(task);
        successCount++;
      }
      alert(`✅ 批次審核完畢！成功放行 ${successCount} 筆資料。`);
      await fetchPendingTasks();
    } catch (err: any) {
      alert(`❌ 批次放行中斷。已成功 ${successCount} 筆，錯誤原因: ${err.message}`);
      await fetchPendingTasks();
    } finally {
      setIsSealingAll(false);
    }
  };

  const handleSingleApproveClick = async () => {
    if (!confirm(`⚠️ 確定要以數位簽章放行 ${selectedTask.company} 的 ${selectedTask.type} 嗎？`)) return;
    try {
      await handleApprove(selectedTask);
      alert('✅ 單筆審核放行成功！資料已寫入不可篡改金庫。');
      await fetchPendingTasks();
    } catch (err: any) {
      alert('❌ 放行失敗: ' + err.message);
    }
  };

  if (isLoading) return <div className="p-8 flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">治理與放行 (核決樞紐)</h1>
          <p className="text-xs font-bold text-slate-500">
            在此佇列中的資料皆處於 <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">DRAFT</span> 狀態，需通過 DQ 門檻方能生效。
          </p>
        </div>
        
        {/* 🟢 新增：一鍵全部放行按鈕 (放在 Header 右上角) */}
        {pendingTasks.length > 0 && (
          <button 
            onClick={handleApproveAll}
            disabled={isSealingAll || isSealing}
            className={`px-4 py-2 text-sm font-black rounded-lg shadow-sm transition-all flex items-center gap-2
              ${(isSealingAll || isSealing) ? 'bg-slate-300 text-slate-500 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-200'}
            `}
          >
            {isSealingAll ? '🔄 批次處理中...' : `🚀 一鍵全部放行 (${pendingTasks.filter(t => t.dqScore >= 80).length}筆)`}
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        
        {/* 左側：待審核佇列 */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
            <h2 className="text-sm font-black text-slate-800">待審核佇列 (Pending)</h2>
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-1 rounded-full">{pendingTasks.length} 筆</span>
          </div>
          
          <div className="overflow-y-auto p-3 space-y-2 flex-1">
            {pendingTasks.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">🎉 目前無待處理的任務</p>
            ) : (
              pendingTasks.map(task => (
                <div 
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedTask?.id === task.id ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-slate-50'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{task.company} | {task.period}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${task.dqScore >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      DQ: {task.dqScore}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">{task.type}</h3>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右側：詳細資訊與審核決策 */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          {selectedTask ? (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 shrink-0">
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-800">{selectedTask.company}</h2>
                    <p className="text-sm font-bold text-slate-500 mt-1">{selectedTask.period} {selectedTask.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">DQ 資料品質分數</p>
                    <p className={`text-3xl font-black ${selectedTask.dqScore >= 80 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {selectedTask.dqScore}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">自動阻擋檢查</p>
                    <p className={`text-sm font-bold ${selectedTask.issue === '無' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {selectedTask.issue === '無' ? '✔️ 通過 (無異常)' : `❌ 攔截: ${selectedTask.issue}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* 單筆決策行動區 */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between mt-auto shrink-0">
                <div>
                  <h3 className="text-sm font-black text-slate-800">執行單筆放行</h3>
                </div>
                
                <div className="flex gap-3">
                  <button className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-100 transition-colors">
                    退回修改
                  </button>
                  <button 
                    onClick={handleSingleApproveClick}
                    disabled={selectedTask.dqScore < 80 || isSealing || isSealingAll}
                    className={`px-5 py-2.5 text-white text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2
                      ${selectedTask.dqScore < 80 ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}
                      ${(isSealing || isSealingAll) ? 'opacity-70 cursor-wait' : ''}
                    `}
                  >
                    {isSealing ? '🔒 處理中...' : '✔️ 數位簽章放行'}
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
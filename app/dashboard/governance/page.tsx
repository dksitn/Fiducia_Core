'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function GovernanceDashboardPage() {
  // 🌟 真實資料狀態
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [latestEvidence, setLatestEvidence] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSealing, setIsSealing] = useState(false);
  
  // 權限管理
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);

  // 🌟 核心一：撈取待辦視圖
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
      // 預設選中第一筆，如果佇列空了就設為 null
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
      if (session?.user) {
        setUser(session.user);
        const { data: roleData } = await supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id);
        if (roleData && roleData.length > 0) setRole(roleData[0].role);
      }
      
      await fetchPendingTasks();

      // 抓取最新金庫證據 (僅供左下方顯示)
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

  // 🌟 核心二：數位簽章與放行邏輯
  const handleApprove = async () => {
    if (!selectedTask || !user) return alert('請先登入或選擇任務');
    
    // 嚴格阻擋機制 (雙重防線)
    if (selectedTask.dqScore < 80) return alert('此資料品質未達標，嚴禁放行！');
    
    if (!confirm(`⚠️ 確定要以數位簽章放行 ${selectedTask.company} 的 ${selectedTask.type} 嗎？此動作將產生不可篡改指紋並寫入金庫。`)) return;

    setIsSealing(true);
    try {
      // 1. 從對應的 Table 撈出這筆草稿的完整原始資料 (Payload)
      const tableName = selectedTask.type === '財務報表' ? 'fin_financial_fact' : 'esg_metrics';
      const { data: rawPayload, error: payloadErr } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', selectedTask.recordId)
        .single();
        
      if (payloadErr || !rawPayload) throw new Error('無法取得原始資料 Payload');

      // 2. 決定要呼叫哪個業務引擎 (對齊你的 route.ts)
      const pluginId = selectedTask.type === '財務報表' ? 'P_FIN_REPORT_VERSION_SEAL' : 'P_ESG_REPORT_VERSION_SEAL';

      // 3. 發送封存請求給我們堅不可摧的 route.ts
      const res = await fetch('/api/plugins/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId,
          userId: user.id,
          input: {
            companyId: selectedTask.company, // Fin Engine 用
            orgId: selectedTask.company,     // ESG Engine 用
            period: selectedTask.period,
            payload: rawPayload
          }
        })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '封存失敗');

      // 4. 封存成功後，將資料表原本的 DRAFT 改為 VALID，並關聯 evidence_id
      await supabase.from(tableName).update({ 
        status: 'VALID',
        // 假設未來的 schema 支援反向寫入 evidence_id (PoC階段先改狀態)
      }).eq('id', selectedTask.recordId);

      alert(`✅ 審核放行成功！資料已寫入不可篡改金庫。\n\n治理版本 Hash: ${result.version_hash}\n請至「追溯查詢」或「財務分析」查看。`);
      
      // 5. 重新整理佇列，這筆資料就會從畫面上消失！
      await fetchPendingTasks();

    } catch (err: any) {
      alert('❌ 放行失敗: ' + err.message);
    } finally {
      setIsSealing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto h-full flex flex-col">
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0">
        <h1 className="text-2xl font-black text-slate-800 mb-1">治理與放行 (核決樞紐)</h1>
        <p className="text-xs font-bold text-slate-500">
          在此佇列中的資料皆處於 <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">DRAFT</span> 狀態，需通過 DQ 門檻並經您數位簽章後，方能生效供業務端查閱。
        </p>
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
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{task.id}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${task.status === '待放行' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {task.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">{task.company}</h3>
                  <p className="text-xs text-slate-500 mt-1">{task.type} | {task.period}</p>
                </div>
              ))
            )}
          </div>

          {/* 最新一筆證據 (示意) */}
          <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
            <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">最新入庫指紋</p>
            {latestEvidence ? (
              <div>
                <p className="text-xs text-emerald-400 font-mono truncate">{latestEvidence.sys_state_versions?.version_hash}</p>
                <p className="text-[10px] text-slate-500 mt-1 truncate">SHA256: {latestEvidence.fingerprint}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">尚無存證紀錄</p>
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
                    <p className="text-sm font-bold text-slate-500 mt-1">{selectedTask.period} {selectedTask.type} 審核請求</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">DQ 資料品質分數</p>
                    <p className={`text-3xl font-black ${selectedTask.dqScore >= 80 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {selectedTask.dqScore}
                    </p>
                  </div>
                </div>

                {/* DQ 分數長條圖 (視覺化) */}
                <div className="h-24 w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={[{ name: 'DQ Score', value: selectedTask.dqScore }]} margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Bar dataKey="value" barSize={20} radius={[0, 10, 10, 0]}>
                        <Cell fill={selectedTask.dqScore >= 80 ? '#10B981' : '#F43F5E'} />
                      </Bar>
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
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
                    <p className="text-sm font-bold text-slate-700">scoringEngine.ts</p>
                  </div>
                </div>
              </div>

              {/* 決策行動區 */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between mt-auto shrink-0">
                <div>
                  <h3 className="text-sm font-black text-slate-800">執行放行決策</h3>
                  <p className="text-xs text-slate-500 mt-1">按下放行後，資料將印上您的操作員指紋並寫入金庫。</p>
                </div>
                
                <div className="flex gap-3">
                  <button className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 text-sm font-bold rounded-xl shadow-sm hover:bg-slate-100 transition-colors">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
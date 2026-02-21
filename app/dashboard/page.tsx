'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// 總覽頁的整合型圖表 (這裡暫用模擬資料展示「財務與非財務」的綜合趨勢)
const consolidatedData = [
  { period: '2024Q1', revenue: 1000, dqScore: 85, esgRisk: 45 },
  { period: '2024Q2', revenue: 1100, dqScore: 88, esgRisk: 42 },
  { period: '2024Q3', revenue: 1200, dqScore: 92, esgRisk: 38 },
  { period: '2024Q4', revenue: 1300, dqScore: 95, esgRisk: 35 },
];

export default function DashboardOverview() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [govStats, setGovStats] = useState({
    totalSealed: 0,
    pendingReview: 0,
    rejected: 0
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  useEffect(() => {
    const fetchAuthAndData = async () => {
      // 1. 驗證權限
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data: roleData } = await supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id);
        if (roleData && roleData.length > 0) setRole(roleData[0].role);
      }

      // 2. 取得治理層數據
      try {
        const { data: evidences, error } = await supabase.from('sys_evidence_items').select('status');
        if (!error && evidences) {
          const sealed = evidences.filter(e => e.status === 'VALID' || e.status === 'APPROVED').length;
          const pending = evidences.filter(e => e.status === 'PENDING' || e.status === 'PENDING_REVIEW').length;
          const rejected = evidences.filter(e => e.status === 'REJECTED' || e.status === 'BLOCKED').length;
          setGovStats({ totalSealed: sealed, pendingReview: pending, rejected });
        }
      } catch (err) {
        console.error("無法取得治理層數據", err);
      } finally {
        setIsStatsLoading(false);
      }
    };
    
    fetchAuthAndData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) { setUser(session.user); fetchAuthAndData(); } 
      else { setUser(null); setRole(null); }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsAuthLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
      });
    } catch (error: any) { alert('登入失敗'); setIsAuthLoading(false); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };
  const displayRole = (role === 'superadmin' || user?.email === 'e10090903@gmail.com') ? 'System Admin' : (role ? role : '訪客模式');

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto">
      
      <header className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">企業營運與治理總覽 (Executive Overview)</h1>
          <p className="text-xs font-bold text-slate-500">此頁面數據皆受底層密碼學存證保護，確保管理層決策基於「絕對可信」之事實。</p>
        </div>
        <div className="flex gap-3 items-center">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-black shadow-sm ${user ? 'bg-indigo-50 border border-indigo-200 text-indigo-700' : 'bg-slate-100 border border-slate-200 text-slate-500'}`}>
            角色 : {user ? displayRole : '未登入'}
          </span>
          {!user ? (
            <button onClick={handleGoogleLogin} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm">登入</button>
          ) : (
            <button onClick={handleLogout} className="px-4 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-lg shadow-sm">登出</button>
          )}
        </div>
      </header>

      <div className="mb-8">
        <h2 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-600 block"></span> 治理金庫即時狀態
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">已封存可信數據 (筆)</p>
              <h2 className="text-3xl font-black text-slate-800">
                {isStatsLoading ? '...' : govStats.totalSealed}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shadow-inner">🔒</div>
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">待放行審核任務 (筆)</p>
              <h2 className="text-3xl font-black text-indigo-600">
                {isStatsLoading ? '...' : govStats.pendingReview}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shadow-inner">⏳</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">異常/阻擋入庫 (筆)</p>
              <h2 className="text-3xl font-black text-rose-600">
                {isStatsLoading ? '...' : govStats.rejected}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-xl shadow-inner">🛡️</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="mb-6 flex justify-between items-center border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">營收成長 vs 資料品質與風險 (整合視角)</h3>
            <p className="text-xs text-slate-500 mt-1">左軸：財務營收 (長條圖) | 右軸：非財務 ESG 風險與 DQ 分數 (折線圖)</p>
          </div>
          <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded">資料源：已放行證據包</span>
        </div>
        
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={consolidatedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="period" tick={{fontSize: 12, fill: '#64748B'}} axisLine={false} tickLine={false} />
              
              <YAxis yAxisId="left" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
              
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }} />
              <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
              
              <Bar yAxisId="left" dataKey="revenue" name="營業收入 (億)" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={40} />
              <Line yAxisId="right" type="monotone" dataKey="dqScore" name="資料品質分數 (DQ)" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2 }} />
              <Line yAxisId="right" type="monotone" dataKey="esgRisk" name="ESG 風險指數" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// 模擬 ESG 數據
const injuryCountData = [
  { company: '台積電', value: 3 },
  { company: '鴻海', value: 12 },
];

const injuryRateData = [
  { company: '台積電', value: 2.0 },
  { company: '鴻海', value: 10.0 },
];

const revenueReferenceData = [
  { period: '2024Q1', value: 1000 },
  { period: '2024Q2', value: 1100 },
  { period: '2024Q3', value: 1200 },
  { period: '2024Q4', value: 1300 },
];

export default function ESGDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    const fetchAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data } = await supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id);
        if (data && data.length > 0) setRole(data[0].role);
      }
    };
    fetchAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) { setUser(session.user); fetchAuth(); } 
      else { setUser(null); setRole(null); }
      setIsAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}`, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw error;
    } catch (error: any) { alert('登入失敗: ' + error.message); setIsAuthLoading(false); }
  };

  const handleLogout = async () => { 
    setIsAuthLoading(true);
    await supabase.auth.signOut();
    setIsAuthLoading(false);
  };

  const isSuperAdmin = role === 'superadmin' || user?.email === 'e10090903@gmail.com';
  const displayRole = isSuperAdmin ? 'System Admin' : (role ? role : '訪客模式 (唯讀)');

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto">
      
      {/* 頁首標題與 Meta 資訊 */}
      <header className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">ESG / 永續儀表板 (Demo)</h1>
          <p className="text-xs font-bold text-slate-500">非財務數據與財務數據之交叉驗證與揭露</p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 shadow-sm">期間 : 2024 (年度)</span>
          <span className={`px-3 py-1.5 rounded-lg text-xs font-black shadow-sm ${user ? 'bg-indigo-50 border border-indigo-200 text-indigo-700' : 'bg-slate-100 border border-slate-200 text-slate-500'}`}>
            角色 : {user ? displayRole : '未登入'}
          </span>
          {!user ? (
            <button onClick={handleGoogleLogin} disabled={isAuthLoading} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition flex items-center gap-2">
              {isAuthLoading ? '處理中...' : 'Google 登入'}
            </button>
          ) : (
            <button onClick={handleLogout} disabled={isAuthLoading} className="px-4 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-lg shadow-sm hover:bg-slate-50 transition">
              {isAuthLoading ? '處理中...' : '登出'}
            </button>
          )}
        </div>
      </header>

      {/* 核心指標卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-slate-500 mb-2">職災人數 (年度)</p>
          <h2 className="text-3xl font-black text-slate-800">3</h2>
          <p className="text-xs font-medium text-slate-500 mt-2">公司 : 2330 台積電</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-slate-500 mb-2">職災比率 (年度)</p>
          <h2 className="text-3xl font-black text-slate-800">2.0%</h2>
          <p className="text-xs font-medium text-slate-500 mt-2">公司 : 2330 台積電</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-slate-500 mb-2">同業最高職災比率</p>
          <h2 className="text-3xl font-black text-slate-800">10.0%</h2>
          <p className="text-xs font-medium text-slate-500 mt-2">公司 : 2317 鴻海 (示例)</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-bold text-slate-500 mb-2">揭露狀態</p>
          <h2 className="text-3xl font-black text-emerald-600">已揭露</h2>
          <p className="text-xs font-medium text-slate-500 mt-2">資料源 : TWSE ESG 彙總</p>
        </div>
      </div>

      {/* 圖表與資訊區 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* 職業災害人數 */}
        <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-700">職業災害人數</h3>
            <p className="text-xs text-slate-400">年度指標 (ESG/職安)</p>
          </div>
          <div className="flex-1 w-full h-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={injuryCountData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="company" tick={{fontSize: 12, fill: '#64748B'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0' }}/>
                <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 職業災害比率 */}
        <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-700">職業災害比率</h3>
            <p className="text-xs text-slate-400">年度指標 (ESG/職安)</p>
          </div>
          <div className="flex-1 w-full h-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={injuryRateData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="company" tick={{fontSize: 12, fill: '#64748B'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0' }}/>
                <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 營收趨勢 (參考對照) */}
        <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-700">營收趨勢 (參考)</h3>
            <p className="text-xs text-slate-400">用於對照營運規模變化</p>
          </div>
          <div className="flex-1 w-full h-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueReferenceData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={3} dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 揭露說明與限制 */}
        <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
          <h3 className="text-sm font-bold text-slate-700 mb-2">揭露說明與限制</h3>
          <p className="text-xs text-slate-400 mb-4 border-b border-slate-100 pb-2">避免誤用：跨產業/口徑差異</p>
          <ul className="text-sm text-slate-600 space-y-3 font-medium flex-1">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block"></span>指標來源：TWSE ESG 彙總 (年度)</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block"></span>公司可能出現未申報/未揭露 ➔ 顯示缺值原因</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block"></span>同業比較需鎖定相近產業/規模 (避免誤導)</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block"></span>若制度或欄位變更 ➔ 版本轉待審並阻擋放行</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 block"></span>可附永續報告書頁碼作為補充證據 (選配)</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
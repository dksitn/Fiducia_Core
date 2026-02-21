'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function TraceabilityDashboardPage() {
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
      
      {/* 頁首標題 */}
      <header className="flex justify-between items-end mb-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">追溯查詢儀表板 (Demo)</h1>
          <p className="text-xs font-bold text-slate-500">把「來源追溯」做成可查詢介面 (批次、指紋、版本差異、證據包一鍵開啟)</p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 shadow-sm">查詢 : ROE | 2330 台積電 | v12</span>
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

      {/* 搜尋列 */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-6 flex items-center gap-4">
        <label className="text-sm font-bold text-slate-600 whitespace-nowrap">指標/欄位/批次 搜尋</label>
        <input type="text" defaultValue="ROE" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 transition-colors" />
        <button className="px-6 py-2 bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 rounded-lg hover:bg-indigo-100 transition">搜尋</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側：指標定義與追溯路徑 */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-1">指標定義 : ROE</h3>
            <p className="text-sm text-slate-500 mb-4 border-b border-slate-100 pb-4">稅後淨利 / 平均權益 (示例)</p>
            <ul className="space-y-2 text-sm text-slate-600 font-medium list-disc list-inside">
              <li>公式：ROE = 稅後淨利 / 平均權益</li>
              <li>欄位：稅後淨利 (財報)、權益期初/期末 (資產負債表)</li>
              <li>期間：季度 (2024Q1~2024Q4)</li>
              <li>限制：若權益缺欄位 ➔ 指標不可計算並阻擋放行</li>
            </ul>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-1">
            <h3 className="text-lg font-black text-slate-800 mb-1">追溯路徑 (Lineage 示意)</h3>
            <p className="text-sm text-slate-500 mb-8 border-b border-slate-100 pb-4">從資料源到指標的轉換歷程</p>
            
            {/* 視覺化資料流 (Lineage Flow) */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-2 overflow-x-auto pb-4">
              {/* 節點 1 */}
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-xl text-center shadow-sm">
                  <p className="text-xs text-slate-400 font-bold mb-1">資料源</p>
                  <p className="text-sm font-black text-slate-700">TWSE OpenAPI</p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono mt-2 bg-slate-100 px-2 py-0.5 rounded">指紋 : SHA-256</span>
              </div>
              
              <div className="text-slate-300 font-black hidden md:block">➔</div>
              
              {/* 節點 2 */}
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-xl text-center shadow-sm">
                  <p className="text-xs text-slate-400 font-bold mb-1">Raw</p>
                  <p className="text-sm font-black text-slate-700">原始落地</p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono mt-2 bg-slate-100 px-2 py-0.5 rounded">批次 : 2025-01-15</span>
              </div>

              <div className="text-slate-300 font-black hidden md:block">➔</div>
              
              {/* 節點 3 */}
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-xl text-center shadow-sm">
                  <p className="text-xs text-slate-400 font-bold mb-1">Curated</p>
                  <p className="text-sm font-black text-slate-700">清洗標準化</p>
                </div>
                <span className="text-[10px] text-emerald-600 font-mono mt-2 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">放行 : v12</span>
              </div>

              <div className="text-slate-300 font-black hidden md:block">➔</div>

              {/* 節點 4 */}
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="w-full bg-indigo-50 border-2 border-indigo-200 p-3 rounded-xl text-center shadow-sm">
                  <p className="text-xs text-indigo-400 font-bold mb-1">Mart</p>
                  <p className="text-sm font-black text-indigo-700">指標彙總 (ROE)</p>
                </div>
                <span className="text-[10px] text-indigo-600 font-mono mt-2 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">展示端</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：查詢結果摘要與版本差異 */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 mb-1">查詢結果 (摘要)</h3>
            <p className="text-xs text-slate-500 mb-4 border-b border-slate-100 pb-2">可直接用於稽核/對帳與會議自證</p>
            
            <div className="space-y-4 text-sm font-medium text-slate-600">
              <div>
                <p className="text-xs font-bold text-slate-400 mb-1">來源批次</p>
                <ul className="space-y-1">
                  <li>• 資料源：TWSE OpenAPI (財務報表)</li>
                  <li>• 抓取時間：2025-01-15 02:10</li>
                  <li>• 批次編號：FIN_20250115_0210</li>
                  <li>• 版本：<span className="text-emerald-600 font-bold">v12 (已放行)</span></li>
                </ul>
              </div>
              <div className="pt-3 border-t border-slate-50">
                <p className="text-xs font-bold text-slate-400 mb-1">指紋與證據</p>
                <p className="font-mono text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 mb-2 truncate">SHA-256: 9f3a1c7b...e2a9 (示例)</p>
                <button className="text-xs font-bold px-4 py-2 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 transition">開啟證據包</button>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex-1">
            <h3 className="text-sm font-black text-slate-800 mb-4 border-b border-slate-100 pb-2">版本差異 (示例)</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2">指標</th>
                  <th className="pb-2">v11</th>
                  <th className="pb-2">v12</th>
                  <th className="pb-2">原因</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 font-medium">
                <tr className="border-t border-slate-50">
                  <td className="py-2 font-bold">ROE</td>
                  <td className="py-2">7.2%</td>
                  <td className="py-2 text-indigo-600 font-bold">7.5%</td>
                  <td className="py-2 text-slate-400">資料源更正</td>
                </tr>
                <tr className="border-t border-slate-50">
                  <td className="py-2 font-bold">淨利率</td>
                  <td className="py-2">33.1%</td>
                  <td className="py-2 text-indigo-600 font-bold">33.8%</td>
                  <td className="py-2 text-slate-400">財報更新</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
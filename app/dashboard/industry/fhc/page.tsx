'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

// 🌟 嚴格對齊 FHC_VERTICAL_DASHBOARD_VIEW_EXISTING_DATA (金控 4 大流程域)
const MOCK_FHC_RESULT = {
  meta: { subject_id: '2881 富邦金控 (集團母體)', period: '2024 年度', consolidation_scope: '合併報表', currency: 'TWD' },
  
  // G1: 集團總覽 (Group Command Center)
  command_center: {
    risk_pulse: { high_risk_subs: 1, open_issues: 3, data_gap_rate: '12%' },
    esg_readiness: { assurance_coverage: '85%', estimation_ratio_avg: '22%' },
    evidence_health: { generated_this_period: 142, unsealed_references: 0 },
    exposure_hotspots: [
      { name: '商業銀行', exposure: 4500, risk_level: 'LOW' },
      { name: '人壽保險', exposure: 6800, risk_level: 'HIGH' },
      { name: '綜合證券', exposure: 1200, risk_level: 'LOW' },
      { name: '資產管理', exposure: 350, risk_level: 'LOW' }
    ]
  },

  // G2: 子公司穿透 (Subsidiary Drill-down)
  subsidiary_drilldown: {
    selected_sub: '人壽保險',
    snapshot: { revenue: '4,500億', net_income: '350億', debt_ratio: '88%' },
    financial_trend: [
      { period: '23Q1', revenue: 1050, net_income: 80 },
      { period: '23Q2', revenue: 1120, net_income: 85 },
      { period: '23Q3', revenue: 1080, net_income: 70 },
      { period: '23Q4', revenue: 1200, net_income: 95 },
      { period: '24Q1', revenue: 1150, net_income: 88 },
      { period: '24Q2', revenue: 1250, net_income: 92 },
      { period: '24Q3', revenue: 1300, net_income: 105 },
      { period: '24Q4', revenue: 1400, net_income: 110 }
    ],
    // 具象化 L1 Events 缺口防呆
    gap_report: { missing_sources: ['L1_EVENTS_API'], blocked_reason: '尚未介接重大事件資料庫，事件時間軸 (Event Timeline) 模組暫時停用。' },
    evidences: [
      { id: 'EVD-9921', type: 'FIN_SEAL', hash: 'a7f8b9e4...2c1', date: '2024-11-01', operator: 'System' },
      { id: 'EVD-9922', type: 'ESG_SEAL', hash: 'c3d4e5f6...8f9', date: '2024-11-05', operator: 'System' }
    ]
  },

  // G3: ESG 與投融資排放 (ESG & Financed Emissions)
  esg_emissions: {
    financed_emissions_total: '2,450,000',
    methodology: 'PCAF (Global)',
    dq_grade_dist: [
      { grade: 'A級 (高度可信)', pct: 40 },
      { grade: 'B級 (合理推估)', pct: 35 },
      { grade: 'C級 (缺乏確信)', pct: 25 } // 觸發橘燈
    ]
  },

  // G4: 治理稽核 (Governance Assurance)
  governance_assurance: {
    evidence_coverage: '98.5%',
    pending_to_valid_days: 2.4,
    schema_drift_alerts: 0,
    recent_logs: [
      { id: 'SYS-001', action: '執行 P_FIN_REPORT_VERSION_SEAL', operator: 'System', status: 'VALID', date: '2024-11-10 09:15' },
      { id: 'SYS-002', action: '執行 P_ESG_REPORT_VERSION_SEAL', operator: 'System', status: 'VALID', date: '2024-11-11 14:22' },
      { id: 'SYS-003', action: '例外放行 (Risk Acceptance) 申請', operator: 'CAE', status: 'APPROVED', date: '2024-11-12 10:05' }
    ]
  }
};

export default function FHCIndustryPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  // 🌟 金控業 4 大頁籤 (G1~G4)
  const [activeTab, setActiveTab] = useState<'G1_COMMAND' | 'G2_DRILLDOWN' | 'G3_ESG' | 'G4_GOVERNANCE'>('G1_COMMAND');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id)
          .then(({ data }) => setRole(data?.[0]?.role || null));
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) { setUser(session.user); } else { setUser(null); setRole(null); }
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
  const isSuperAdmin = role === 'superadmin' || user?.email === 'e10090903@gmail.com';
  const displayRole = isSuperAdmin ? 'System Admin' : (role ? role : '訪客模式');

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto">
      
      {/* 🌟 標頭與登入區塊 (完全 100% 複製 page.tsx 的黑底 Email 樣式) */}
      <header className="flex justify-between items-end mb-6 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest">金控業專屬視角</span>
            <h1 className="text-2xl font-black text-slate-800">集團合規與穿透式監理</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">向內檢視集團風險、穿透子公司資料血緣，並監控跨部門之證據與治理健康度。</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="flex flex-col items-end">
            <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 shadow-sm">分析標的 : {MOCK_FHC_RESULT.meta.subject_id}</span>
            <span className="text-[9px] text-slate-400 font-bold mt-1 tracking-wider">{MOCK_FHC_RESULT.meta.consolidation_scope} | {MOCK_FHC_RESULT.meta.period}</span>
          </div>
          
          <div className="text-right">
            {!user ? (
              <button onClick={handleGoogleLogin} disabled={isAuthLoading} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs py-1.5 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                {isAuthLoading ? '連線中...' : '以 Google 帳號登入'}
              </button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded border shadow-sm ${isSuperAdmin ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {user.email} <span className="text-[9px] ml-1 opacity-80">({displayRole})</span>
                  </span>
                  <button onClick={handleLogout} className="text-[10px] font-bold text-slate-500 hover:text-red-600 underline underline-offset-2">登出</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 🌟 G1~G4 Tab 頁籤切換器 */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto hide-scrollbar">
        <button onClick={() => setActiveTab('G1_COMMAND')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'G1_COMMAND' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          G1 集團總覽 (Command Center)
        </button>
        <button onClick={() => setActiveTab('G2_DRILLDOWN')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'G2_DRILLDOWN' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          G2 子公司穿透 (Drill-down)
        </button>
        <button onClick={() => setActiveTab('G3_ESG')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'G3_ESG' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          G3 ESG 與投融資排放
        </button>
        <button onClick={() => setActiveTab('G4_GOVERNANCE')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'G4_GOVERNANCE' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          G4 治理稽核 (Governance)
        </button>
      </div>

      {/* 🏛️ G1：集團總覽 (Command Center) */}
      {activeTab === 'G1_COMMAND' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="md:col-span-1 space-y-6">
            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-200 shadow-sm">
              <h3 className="text-sm font-bold text-indigo-800 mb-4 tracking-widest border-b border-indigo-100 pb-2">風險脈搏 (Risk Pulse)</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600">高風險子公司數</span>
                  <span className="text-xl font-black text-rose-600">{MOCK_FHC_RESULT.command_center.risk_pulse.high_risk_subs} 家</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600">重大事件 Open 件數</span>
                  <span className="text-xl font-black text-amber-600">{MOCK_FHC_RESULT.command_center.risk_pulse.open_issues} 件</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-indigo-100">
                  <span className="text-xs font-bold text-slate-600">全局資料缺口率</span>
                  <span className="text-xl font-black text-indigo-700">{MOCK_FHC_RESULT.command_center.risk_pulse.data_gap_rate}</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 tracking-widest border-b border-slate-100 pb-2">永續準備度 (ESG Readiness)</h3>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-500">第三方確信覆蓋率</span>
                <span className="text-lg font-black text-emerald-600">{MOCK_FHC_RESULT.command_center.esg_readiness.assurance_coverage}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">碳排估算比例 (平均)</span>
                <span className="text-lg font-black text-slate-700">{MOCK_FHC_RESULT.command_center.esg_readiness.estimation_ratio_avg}</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800">子公司曝險熱區 (Exposure Hotspots)</h3>
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: fin_financial_fact (VALID)</span>
              </div>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={MOCK_FHC_RESULT.command_center.exposure_hotspots} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E2E8F0" />
                    <XAxis type="number" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{fontSize: 11, fill: '#334155', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }} cursor={{fill: '#F8FAFC'}} />
                    <Bar dataKey="exposure" name="曝險餘額 (億)" radius={[0, 4, 4, 0]} barSize={35}>
                      {MOCK_FHC_RESULT.command_center.exposure_hotspots.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.risk_level === 'HIGH' ? '#F43F5E' : '#4F46E5'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">紅柱代表該子公司偵測到高風險異常 (財務惡化或重大裁罰)</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setActiveTab('G2_DRILLDOWN')} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">深度穿透高風險子公司 ➔</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔍 G2：子公司穿透 (Drill-down) */}
      {activeTab === 'G2_DRILLDOWN' && (
        <div className="animate-fade-in-up">
          {/* L1 Events 缺口防呆 */}
          {MOCK_FHC_RESULT.subsidiary_drilldown.gap_report && (
            <div className="mb-6 bg-slate-800 text-white p-4 rounded-xl shadow-md flex items-start gap-4">
              <div className="text-2xl mt-1">🚧</div>
              <div>
                <h3 className="text-sm font-black text-amber-400 mb-1">防篡改引擎攔截：偵測到資料缺口 (Gap Report)</h3>
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  缺乏第一級資料源 <code className="bg-slate-700 px-1 py-0.5 rounded text-rose-300">[{MOCK_FHC_RESULT.subsidiary_drilldown.gap_report.missing_sources.join(', ')}]</code>。
                  {MOCK_FHC_RESULT.subsidiary_drilldown.gap_report.blocked_reason}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500 mb-2 tracking-widest">當前檢視子公司</p>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-2xl">🏢</span>
                  <select className="text-2xl font-black text-indigo-900 bg-transparent focus:outline-none cursor-pointer border-b-2 border-indigo-200 pb-1">
                    <option>{MOCK_FHC_RESULT.subsidiary_drilldown.selected_sub}</option>
                    <option>商業銀行</option>
                    <option>綜合證券</option>
                  </select>
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-500 font-bold mb-1">總營收 / 淨利</p>
                    <p className="text-lg font-black text-slate-800">{MOCK_FHC_RESULT.subsidiary_drilldown.snapshot.revenue} / <span className="text-emerald-600">{MOCK_FHC_RESULT.subsidiary_drilldown.snapshot.net_income}</span></p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-500 font-bold mb-1">負債比 (Debt Ratio)</p>
                    <p className="text-lg font-black text-rose-600">{MOCK_FHC_RESULT.subsidiary_drilldown.snapshot.debt_ratio}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800">近 8 季財務趨勢穿透 (Financial Trend)</h3>
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: DER_FIN_SNAPSHOT</span>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <ComposedChart data={MOCK_FHC_RESULT.subsidiary_drilldown.financial_trend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                    <Bar yAxisId="left" dataKey="revenue" name="營收(億)" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={25} />
                    <Line yAxisId="left" type="monotone" dataKey="net_income" name="淨利(億)" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
          {/* Evidence Panel (核心稽核溯源) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">可稽核證據鏈 (Evidence Panel)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2 rounded-l-lg">證據 ID</th>
                    <th className="px-3 py-2">類型 (Type)</th>
                    <th className="px-3 py-2">生成日期</th>
                    <th className="px-3 py-2">核准人</th>
                    <th className="px-3 py-2 rounded-r-lg">指紋 Hash (點擊核對)</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_FHC_RESULT.subsidiary_drilldown.evidences.map(ev => (
                    <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-3 font-bold text-slate-700">{ev.id}</td>
                      <td className="px-3 py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono text-[9px]">{ev.type}</span></td>
                      <td className="px-3 py-3 text-slate-500">{ev.date}</td>
                      <td className="px-3 py-3 text-slate-500">{ev.operator}</td>
                      <td className="px-3 py-3 font-mono text-blue-600 hover:underline cursor-pointer">{ev.hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 🌍 G3：ESG 與投融資排放 */}
      {activeTab === 'G3_ESG' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative">
            <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">投融資碳排 (Financed Emissions)</h3>
            <p className="absolute top-6 right-6 text-[9px] text-slate-300 font-mono">SRC_FINANCED_EMISSIONS</p>
            
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-400 mb-1">集團總計碳排</p>
              <h2 className="text-4xl font-black text-slate-800">{MOCK_FHC_RESULT.esg_emissions.financed_emissions_total} <span className="text-sm font-medium text-slate-500">tCO2e</span></h2>
              <p className="text-[10px] text-slate-400 mt-2">方法學: {MOCK_FHC_RESULT.esg_emissions.methodology}</p>
            </div>
            
            <button className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700 transition">產出監理輸出包 (Disclosure Pack)</button>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
              <h3 className="text-sm font-bold text-slate-800">ESG 資料品質儀表板 (DQ Scoreboard)</h3>
              <p className="text-xs text-slate-500 mt-1">碳排品質分級分佈 (橘色代表缺乏第三方確信)</p>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={MOCK_FHC_RESULT.esg_emissions.dq_grade_dist} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E2E8F0" />
                  <XAxis type="number" domain={[0, 100]} tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} />
                  <YAxis dataKey="grade" type="category" tick={{fontSize: 10, fill: '#334155', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }} cursor={{fill: '#F8FAFC'}} />
                  <Bar dataKey="pct" name="佔比" radius={[0, 4, 4, 0]} barSize={25}>
                    {MOCK_FHC_RESULT.esg_emissions.dq_grade_dist.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.grade.includes('C級') ? '#F59E0B' : '#10B981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 🛡️ G4：治理稽核 (Governance Assurance) */}
      {activeTab === 'G4_GOVERNANCE' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="md:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">證據覆蓋與健康度</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">應封存 vs 已封存覆蓋率</p>
                  <p className="text-3xl font-black text-emerald-600">{MOCK_FHC_RESULT.governance_assurance.evidence_coverage}</p>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] text-slate-500 font-bold mb-1">審核放行平均時間 (PENDING ➔ VALID)</p>
                  <p className="text-lg font-black text-slate-800">{MOCK_FHC_RESULT.governance_assurance.pending_to_valid_days} 天</p>
                </div>
              </div>
            </div>
            
            <div className="bg-teal-50 p-6 rounded-2xl border border-teal-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-teal-800 mb-1">資料庫 Schema 異動警示</p>
                <p className="text-sm font-bold text-teal-700">無底層結構篡改</p>
              </div>
              <div className="text-3xl font-black text-teal-600">{MOCK_FHC_RESULT.governance_assurance.schema_drift_alerts}</div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800">例外放行與系統日誌 (Exception Log)</h3>
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: sys_state_versions</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold">
                    <tr>
                      <th className="px-3 py-2 rounded-l-lg">時間</th>
                      <th className="px-3 py-2">操作/事件 (Action)</th>
                      <th className="px-3 py-2">執行者</th>
                      <th className="px-3 py-2 rounded-r-lg">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_FHC_RESULT.governance_assurance.recent_logs.map(log => (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-3 py-3 font-mono text-slate-500 text-[10px]">{log.date}</td>
                        <td className="px-3 py-3 font-bold text-slate-700">{log.action}</td>
                        <td className="px-3 py-3 text-slate-500">{log.operator}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${log.status === 'VALID' || log.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow hover:bg-slate-50">開啟 Evidence Explorer (全局搜索)</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
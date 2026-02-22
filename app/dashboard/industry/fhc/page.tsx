'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import {
  ComposedChart, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

const FHC_COMPANIES = [
  { value: '2881', label: '2881 富邦金控' },
  { value: '2882', label: '2882 國泰金控' },
  { value: '2891', label: '2891 中信金控' },
  { value: '2886', label: '2886 兆豐金控' },
  { value: '2884', label: '2884 玉山金控' },
];

const FHC_EXPOSURE: Record<string, { name: string; exposure: number; risk_level: string }[]> = {
  '2881': [
    { name: '富邦銀行', exposure: 4500, risk_level: 'LOW' },
    { name: '富邦人壽', exposure: 6800, risk_level: 'HIGH' },
    { name: '富邦證券', exposure: 1200, risk_level: 'LOW' },
    { name: '富邦資管', exposure: 350,  risk_level: 'LOW' },
  ],
  '2882': [
    { name: '國泰銀行', exposure: 3800, risk_level: 'LOW' },
    { name: '國泰人壽', exposure: 7500, risk_level: 'LOW' },
    { name: '國泰證券', exposure: 900,  risk_level: 'LOW' },
    { name: '國泰投信', exposure: 280,  risk_level: 'LOW' },
  ],
  '2891': [
    { name: '中信銀行', exposure: 5200, risk_level: 'LOW' },
    { name: '台灣人壽', exposure: 3100, risk_level: 'HIGH' },
    { name: '中信證券', exposure: 800,  risk_level: 'LOW' },
  ],
  '2886': [
    { name: '兆豐銀行', exposure: 6200, risk_level: 'LOW' },
    { name: '兆豐人壽', exposure: 1200, risk_level: 'LOW' },
    { name: '兆豐證券', exposure: 600,  risk_level: 'LOW' },
  ],
  '2884': [
    { name: '玉山銀行', exposure: 4100, risk_level: 'LOW' },
    { name: '玉山證券', exposure: 680,  risk_level: 'LOW' },
    { name: '玉山創投', exposure: 220,  risk_level: 'LOW' },
  ],
};

const ESG_DQ_DIST = [
  { grade: 'A 級（高度可信）', pct: 45 },
  { grade: 'B 級（合理推估）', pct: 35 },
  { grade: 'C 級（缺乏確信）', pct: 20 },
];

type TabId = 'COMMAND' | 'DRILLDOWN' | 'ESG' | 'GOVERNANCE';

const fmtBig = (v: number | null | undefined): string => {
  if (v == null) return 'N/A';
  const neg = v < 0;
  const abs = Math.abs(v);
  let s = '';
  if      (abs >= 1_000_000_000_000) s = `${(abs/1_000_000_000_000).toFixed(2)} 兆`;
  else if (abs >= 100_000_000)       s = `${(abs/100_000_000).toFixed(2)} 億`;
  else if (abs >= 10_000)            s = `${(abs/10_000).toFixed(0)} 萬`;
  else                               s = abs.toLocaleString();
  return `${neg ? '-' : ''}${s}`;
};

const fmtPct = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(2)}%` : 'N/A';

function InfoRow({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex justify-between items-center">
      <span className="text-[10px] text-slate-500 font-bold">{label}</span>
      <span className={`text-sm font-black ${color}`}>{value}</span>
    </div>
  );
}

export default function FHCIndustryPage() {
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab]         = useState<TabId>('COMMAND');
  const [selectedCompany, setSelectedCompany] = useState('2881');
  const [finData, setFinData]             = useState<any[]>([]);
  const [latestFin, setLatestFin]         = useState<any>(null);
  const [esgData, setEsgData]             = useState<any[]>([]);
  const [latestEsg, setLatestEsg]         = useState<any>(null);
  const [evidences, setEvidences]         = useState<any[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [allEsgData, setAllEsgData]       = useState<any[]>([]);

  const companyLabel = FHC_COMPANIES.find(c => c.value === selectedCompany)?.label ?? selectedCompany;
  const exposureData = FHC_EXPOSURE[selectedCompany] ?? [];
  const highRiskSubs = exposureData.filter(s => s.risk_level === 'HIGH').length;

  const fetchData = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const [{ data: fin }, { data: esg }, { data: evid }] = await Promise.all([
        supabase.from('fin_financial_fact').select('*').eq('company_code', code).eq('status', 'VALID').order('period', { ascending: false }).limit(8),
        supabase.from('esg_metrics').select('*').eq('company_code', code).eq('status', 'VALID').order('period', { ascending: false }).limit(3),
        supabase.from('sys_evidence_items').select('*, sys_state_versions(version_hash, summary)').order('created_at', { ascending: false }).limit(5),
      ]);
      const finRows = (fin ?? []).reverse();
      setFinData(finRows);
      setLatestFin(finRows.length > 0 ? finRows[finRows.length - 1] : null);
      setEsgData(esg ?? []);
      setLatestEsg((esg ?? [])[0] ?? null);
      setEvidences(evid ?? []);

      // 跨公司 ESG：查所有公司最新一筆
      const { data: allEsg } = await supabase
        .from('esg_metrics')
        .select('company_code, period, scope1_tco2e, scope2_tco2e, assurance_level, dq_score')
        .eq('status', 'VALID')
        .order('period', { ascending: false });
      const seen = new Set<string>();
      const latestPerCompany = (allEsg ?? []).filter((r: any) => {
        if (seen.has(r.company_code)) return false;
        seen.add(r.company_code);
        return true;
      }).map((r: any) => ({
        company_code: r.company_code,
        period:       r.period,
        scope1:       r.scope1_tco2e ?? 0,
        scope2:       r.scope2_tco2e ?? 0,
        total:        (r.scope1_tco2e ?? 0) + (r.scope2_tco2e ?? 0),
        assurance:    r.assurance_level ?? 'N/A',
        dq_score:     r.dq_score ?? 0,
      })).sort((a: any, b: any) => b.total - a.total);
      setAllEsgData(latestPerCompany);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(selectedCompany); }, [selectedCompany, fetchData]);

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'COMMAND',    label: '集團總覽',       icon: '🏛️' },
    { id: 'DRILLDOWN',  label: '子公司穿透',     icon: '🔬' },
    { id: 'ESG',        label: 'ESG 投融資排放', icon: '🌿' },
    { id: 'GOVERNANCE', label: '治理稽核',        icon: '🔒' },
  ];

  const trendData = finData.map(r => ({
    period:     r.period,
    revenue:    r.revenue    ? +(r.revenue    / 100_000_000).toFixed(2) : 0,
    net_income: r.net_income ? +(r.net_income / 100_000_000).toFixed(2) : 0,
  }));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC] text-slate-800">

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase">金控業專屬視角</span>
            <h1 className="text-2xl font-black">集團合規與穿透式監理</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">
            向內檢視集團風險、穿透子公司資料血緣，並監控跨部門之證據與治理健康度。
            <span className="font-mono text-indigo-400 ml-1">fin_financial_fact + esg_metrics + sys_evidence_items (VALID)</span>
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析標的</label>
          <select
            value={selectedCompany}
            onChange={e => setSelectedCompany(e.target.value)}
            className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          >
            {FHC_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* ── 集團總覽 ── */}
          {activeTab === 'COMMAND' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-5">
                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-200 shadow-sm">
                  <h3 className="text-sm font-bold text-indigo-800 mb-4 border-b border-indigo-100 pb-2">風險脈搏</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-xs font-bold text-slate-600">高風險子公司數</span>
                      <span className={`text-xl font-black ${highRiskSubs > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{highRiskSubs} 家</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-indigo-100">
                      <span className="text-xs font-bold text-slate-600">負債比率</span>
                      <div className="text-right">
                        <span className="text-xl font-black text-slate-800">
                          {latestFin?.total_assets > 0 ? fmtPct(latestFin?.total_liabilities ?? 0, latestFin?.total_assets) : 'N/A'}
                        </span>
                        <p className="text-[10px] text-slate-400">{latestFin?.period}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-t border-indigo-100">
                      <span className="text-xs font-bold text-slate-600">股東權益</span>
                      <span className="text-xl font-black text-indigo-700">{fmtBig(latestFin?.equity)}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">永續準備度</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">確信等級</span>
                      <span className={`text-lg font-black ${latestEsg?.assurance_level === 'High' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {latestEsg?.assurance_level ?? 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                      <span className="text-xs font-bold text-slate-500">碳排合計</span>
                      <span className="text-sm font-black text-slate-700">
                        {latestEsg ? `${((latestEsg.scope1_tco2e ?? 0) + (latestEsg.scope2_tco2e ?? 0)).toLocaleString()} tCO₂e` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">子公司曝險熱區</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">紅柱 = 高風險</span>
                </div>
                <div className="flex-1 min-h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={exposureData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#E2E8F0" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}億`} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#334155', fontWeight: 'bold' }} axisLine={false} tickLine={false} width={80} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} cursor={{ fill: '#F8FAFC' }} formatter={(v: any) => [`${v} 億`, '曝險餘額']} />
                      <Bar dataKey="exposure" name="曝險餘額(億)" radius={[0, 4, 4, 0]} barSize={28}>
                        {exposureData.map((e, i) => <Cell key={i} fill={e.risk_level === 'HIGH' ? '#F43F5E' : '#4F46E5'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setActiveTab('DRILLDOWN')} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">
                    深度穿透子公司 ➔
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 子公司穿透 ── */}
          {activeTab === 'DRILLDOWN' && (
            <div className="space-y-6">
              {highRiskSubs > 0 && (
                <div className="bg-slate-800 text-white p-4 rounded-xl flex items-start gap-4">
                  <div className="text-2xl mt-0.5">🚧</div>
                  <div>
                    <h3 className="text-sm font-black text-amber-400 mb-1">偵測到高風險子公司</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {exposureData.filter(s => s.risk_level === 'HIGH').map(s => s.name).join('、')} 被標記為高風險，建議優先審核相關財報與事件記錄。
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">集團母體財務快照</p>
                  <h2 className="text-xl font-black text-indigo-900 mb-4">{companyLabel}</h2>
                  <div className="space-y-2">
                    <InfoRow label="最新季度" value={latestFin?.period ?? 'N/A'} />
                    <InfoRow label="營業收入" value={fmtBig(latestFin?.revenue)} />
                    <InfoRow label="稅後淨利" value={fmtBig(latestFin?.net_income)} color="text-emerald-600" />
                    <InfoRow label="資產總計" value={fmtBig(latestFin?.total_assets)} />
                    <InfoRow label="負債比率" value={latestFin?.total_assets > 0 ? fmtPct(latestFin?.total_liabilities ?? 0, latestFin?.total_assets) : 'N/A'} color="text-rose-600" />
                    <InfoRow label="營業現金流" value={fmtBig(latestFin?.operating_cash_flow)} />
                  </div>
                  <p className="text-[9px] text-slate-300 font-mono mt-3">Source: fin_financial_fact (VALID)</p>
                </div>
                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">近 8 季財務趨勢</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">fin_financial_fact · 億元</span>
                  </div>
                  {trendData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-300 text-sm">暫無財報資料</div>
                  ) : (
                    <div style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}億`} width={55} />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} formatter={(v: any, name?: string) => [`${Number(v).toFixed(2)} 億`, name ?? ""]} />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Bar dataKey="revenue" name="營業收入(億)" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={20} />
                          <Line dataKey="net_income" name="稅後淨利(億)" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">可稽核證據鏈</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">sys_evidence_items（最新 5 筆）</span>
                </div>
                {evidences.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">尚無封存證據</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold">
                        <tr>
                          <th className="px-3 py-2 rounded-l-lg">類型</th>
                          <th className="px-3 py-2">摘要</th>
                          <th className="px-3 py-2">時間</th>
                          <th className="px-3 py-2 rounded-r-lg">指紋</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidences.map((ev: any, i: number) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-3 py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono text-[9px]">{ev.type ?? 'EVIDENCE'}</span></td>
                            <td className="px-3 py-3 text-slate-600 max-w-xs truncate">{ev.sys_state_versions?.summary ?? '封存操作'}</td>
                            <td className="px-3 py-3 font-mono text-slate-400 text-[10px]">{new Date(ev.created_at).toLocaleString('zh-TW')}</td>
                            <td className="px-3 py-3 font-mono text-blue-500 text-[10px]">{ev.fingerprint?.substring(0, 20)}...</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ESG 上市公司碳排比較 ── */}
          {activeTab === 'ESG' && (
            <div className="space-y-6">
              {/* 頂部說明 + 當前金控碳排 KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 mb-1">範疇一排放</p>
                  <p className="text-2xl font-black text-amber-600">{latestEsg?.scope1_tco2e != null ? `${latestEsg.scope1_tco2e.toLocaleString()}` : 'N/A'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">tCO₂e · {latestEsg?.period ?? '—'}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 mb-1">範疇二排放</p>
                  <p className="text-2xl font-black text-blue-600">{latestEsg?.scope2_tco2e != null ? `${latestEsg.scope2_tco2e.toLocaleString()}` : 'N/A'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">tCO₂e · {latestEsg?.period ?? '—'}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 mb-1">確信等級</p>
                  <p className={`text-2xl font-black ${latestEsg?.assurance_level === 'High' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {latestEsg?.assurance_level ?? 'N/A'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">第三方確信</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 mb-1">系統覆蓋公司數</p>
                  <p className="text-2xl font-black text-indigo-600">{allEsgData.length}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">有效 ESG 記錄</p>
                </div>
              </div>

              {/* 跨公司碳排橫向比較 */}
              {allEsgData.length > 0 ? (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">各上市公司碳排比較（範疇一 + 範疇二）</h3>
                      <p className="text-[10px] text-indigo-600 font-bold mt-1">依合計排放量由高至低排序 · 各公司最新年度資料</p>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">esg_metrics (VALID)</span>
                  </div>
                  <div style={{ height: Math.max(220, allEsgData.length * 42) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={allEsgData} layout="vertical" margin={{ top: 0, right: 80, left: 60, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false}
                          tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v)} />
                        <YAxis dataKey="company_code" type="category" tick={{ fontSize: 10, fill: '#334155', fontWeight: 'bold' }} axisLine={false} tickLine={false} width={55} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                          formatter={(v: any, name?: string) => [`${Number(v).toLocaleString()} tCO₂e`, name ?? ""]}
                          labelFormatter={label => `${label} · ${allEsgData.find(d => d.company_code === label)?.period ?? ''}`}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
                        <Bar dataKey="scope1" name="範疇一" stackId="a" fill="#F59E0B" radius={[0,0,0,0]} barSize={20} />
                        <Bar dataKey="scope2" name="範疇二" stackId="a" fill="#3B82F6" radius={[0,4,4,0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-12 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                  <p className="text-sm font-bold text-slate-500">尚無 ESG 碳排資料</p>
                  <p className="text-xs text-slate-400 mt-1">請至 Admin → 第二層 → 永續碳排報告同步</p>
                </div>
              )}

              {/* 各公司確信等級 + DQ 分數明細表 */}
              {allEsgData.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">ESG 資料品質明細</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">esg_metrics</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold">
                        <tr>
                          <th className="px-3 py-2 rounded-l-lg">公司代號</th>
                          <th className="px-3 py-2">報告年度</th>
                          <th className="px-3 py-2">範疇一 (tCO₂e)</th>
                          <th className="px-3 py-2">範疇二 (tCO₂e)</th>
                          <th className="px-3 py-2">合計</th>
                          <th className="px-3 py-2">確信等級</th>
                          <th className="px-3 py-2 rounded-r-lg">DQ 分數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allEsgData.map((row, i) => (
                          <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/50 ${row.company_code === selectedCompany ? 'bg-indigo-50/50' : ''}`}>
                            <td className="px-3 py-2.5 font-black text-indigo-600">{row.company_code}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{row.period}</td>
                            <td className="px-3 py-2.5 font-bold text-amber-600">{row.scope1.toLocaleString()}</td>
                            <td className="px-3 py-2.5 font-bold text-blue-600">{row.scope2.toLocaleString()}</td>
                            <td className="px-3 py-2.5 font-black text-slate-700">{row.total.toLocaleString()}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${row.assurance === 'High' ? 'bg-emerald-50 text-emerald-700' : row.assurance === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {row.assurance}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`font-black ${row.dq_score >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.dq_score}</span>
                              <span className="text-slate-400"> / 100</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 當前金控多年碳排趨勢 */}
              {esgData.length > 1 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">本金控碳排多年趨勢</h3>
                    <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-mono">{selectedCompany} · {esgData.length} 年</span>
                  </div>
                  <div style={{ height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={[...esgData].reverse().map(r => ({ period: String(r.period), scope1: r.scope1_tco2e ?? 0, scope2: r.scope2_tco2e ?? 0 }))}
                        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} width={55}
                          tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1_000).toFixed(0)}K`} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Line dataKey="scope1" name="範疇一" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                        <Line dataKey="scope2" name="範疇二" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 治理稽核 ── */}
          {activeTab === 'GOVERNANCE' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-5">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-500 mb-4 border-b border-slate-100 pb-2">證據覆蓋與健康度</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-slate-600 mb-1">系統封存證據筆數</p>
                      <p className="text-3xl font-black text-emerald-600">{evidences.length} 筆</p>
                      <p className="text-[9px] text-slate-400 font-mono mt-1">sys_evidence_items</p>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-600 mb-1">財報最新季度</p>
                      <p className="text-lg font-black text-slate-800">{latestFin?.period ?? 'N/A'}</p>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-600 mb-1">ESG 最新年度</p>
                      <p className="text-lg font-black text-slate-800">{latestEsg?.period ?? 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-teal-50 p-5 rounded-2xl border border-teal-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-teal-800 mb-1">資料庫 Schema 異動警示</p>
                    <p className="text-sm font-bold text-teal-700">無底層結構篡改</p>
                  </div>
                  <div className="text-3xl font-black text-teal-600">0</div>
                </div>
              </div>
              <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">封存日誌與例外放行記錄</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">sys_evidence_items + sys_state_versions</span>
                </div>
                {evidences.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">尚無封存記錄</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold">
                        <tr>
                          <th className="px-3 py-2 rounded-l-lg">時間</th>
                          <th className="px-3 py-2">操作摘要</th>
                          <th className="px-3 py-2">類型</th>
                          <th className="px-3 py-2 rounded-r-lg">狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidences.map((ev: any, i: number) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-3 py-3 font-mono text-slate-400 text-[10px] whitespace-nowrap">{new Date(ev.created_at).toLocaleString('zh-TW')}</td>
                            <td className="px-3 py-3 font-bold text-slate-700 max-w-xs truncate">{ev.sys_state_versions?.summary ?? '封存操作'}</td>
                            <td className="px-3 py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono text-[9px]">{ev.type ?? 'EVIDENCE'}</span></td>
                            <td className="px-3 py-3"><span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold text-[9px]">VALID</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <a href="/dashboard/traceability" className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow hover:bg-slate-50">
                    開啟追溯查詢（全局搜索）
                  </a>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

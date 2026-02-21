'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import {
  ComposedChart, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

// ── 金控業專用公司清單（金融集團） ─────────────────────
const FHC_COMPANIES = [
  { value: '2881', label: '2881 富邦金控' },
  { value: '2882', label: '2882 國泰金控' },
  { value: '2891', label: '2891 中信金控' },
  { value: '2886', label: '2886 兆豐金控' },
  { value: '2884', label: '2884 玉山金控' },
];

// ── 靜態模擬資料（依選中金控切換） ───────────────────────
const FHC_MOCK: Record<string, any> = {
  '2881': {
    meta: { subject: '2881 富邦金控 (集團母體)', period: '2024 年度', scope: '合併報表', currency: 'TWD' },
    command_center: {
      risk_pulse: { high_risk_subs: 1, open_issues: 3, data_gap_rate: '12%' },
      esg_readiness: { assurance_coverage: '85%', estimation_ratio_avg: '22%' },
      exposure_hotspots: [
        { name: '富邦銀行', exposure: 4500, risk_level: 'LOW' },
        { name: '富邦人壽', exposure: 6800, risk_level: 'HIGH' },
        { name: '富邦證券', exposure: 1200, risk_level: 'LOW' },
        { name: '富邦資管', exposure: 350, risk_level: 'LOW' },
      ]
    },
    subsidiary_drilldown: {
      selected_sub: '富邦人壽',
      snapshot: { revenue: '4,500億', net_income: '350億', debt_ratio: '88%' },
      financial_trend: [
        { period: '23Q1', revenue: 1050, net_income: 80 }, { period: '23Q2', revenue: 1120, net_income: 85 },
        { period: '23Q3', revenue: 1080, net_income: 70 }, { period: '23Q4', revenue: 1200, net_income: 95 },
        { period: '24Q1', revenue: 1150, net_income: 88 }, { period: '24Q2', revenue: 1250, net_income: 92 },
        { period: '24Q3', revenue: 1300, net_income: 105 }, { period: '24Q4', revenue: 1400, net_income: 110 },
      ],
      gap_report: { missing_sources: ['L1_EVENTS_API'], blocked_reason: '尚未介接重大事件資料庫，事件時間軸模組暫時停用。' },
      evidences: [
        { id: 'EVD-9921', type: 'FIN_SEAL', hash: 'a7f8b9e4...2c1', date: '2024-11-01', operator: 'System' },
        { id: 'EVD-9922', type: 'ESG_SEAL', hash: 'c3d4e5f6...8f9', date: '2024-11-05', operator: 'System' },
      ]
    },
    esg_emissions: {
      financed_emissions_total: '2,450,000', methodology: 'PCAF (Global)',
      dq_grade_dist: [
        { grade: 'A級 (高度可信)', pct: 40 }, { grade: 'B級 (合理推估)', pct: 35 }, { grade: 'C級 (缺乏確信)', pct: 25 }
      ]
    },
    governance_assurance: {
      evidence_coverage: '98.5%', pending_to_valid_days: 2.4, schema_drift_alerts: 0,
      recent_logs: [
        { id: 'SYS-001', action: '執行 P_FIN_REPORT_VERSION_SEAL', operator: 'System', status: 'VALID', date: '2024-11-10 09:15' },
        { id: 'SYS-002', action: '執行 P_ESG_REPORT_VERSION_SEAL', operator: 'System', status: 'VALID', date: '2024-11-11 14:22' },
        { id: 'SYS-003', action: '例外放行 (Risk Acceptance) 申請', operator: 'CAE', status: 'APPROVED', date: '2024-11-12 10:05' },
      ]
    }
  },
  '2882': {
    meta: { subject: '2882 國泰金控 (集團母體)', period: '2024 年度', scope: '合併報表', currency: 'TWD' },
    command_center: {
      risk_pulse: { high_risk_subs: 0, open_issues: 1, data_gap_rate: '8%' },
      esg_readiness: { assurance_coverage: '92%', estimation_ratio_avg: '18%' },
      exposure_hotspots: [
        { name: '國泰銀行', exposure: 3800, risk_level: 'LOW' },
        { name: '國泰人壽', exposure: 7500, risk_level: 'LOW' },
        { name: '國泰證券', exposure: 900, risk_level: 'LOW' },
        { name: '國泰投信', exposure: 280, risk_level: 'LOW' },
      ]
    },
    subsidiary_drilldown: {
      selected_sub: '國泰人壽',
      snapshot: { revenue: '5,200億', net_income: '420億', debt_ratio: '86%' },
      financial_trend: [
        { period: '23Q1', revenue: 1200, net_income: 95 }, { period: '23Q2', revenue: 1280, net_income: 100 },
        { period: '23Q3', revenue: 1250, net_income: 98 }, { period: '23Q4', revenue: 1380, net_income: 110 },
        { period: '24Q1', revenue: 1320, net_income: 105 }, { period: '24Q2', revenue: 1410, net_income: 108 },
        { period: '24Q3', revenue: 1480, net_income: 115 }, { period: '24Q4', revenue: 1560, net_income: 122 },
      ],
      gap_report: null,
      evidences: [
        { id: 'EVD-8801', type: 'FIN_SEAL', hash: 'b1c2d3e4...5f6', date: '2024-11-03', operator: 'System' },
      ]
    },
    esg_emissions: {
      financed_emissions_total: '3,120,000', methodology: 'PCAF (Global)',
      dq_grade_dist: [
        { grade: 'A級 (高度可信)', pct: 55 }, { grade: 'B級 (合理推估)', pct: 30 }, { grade: 'C級 (缺乏確信)', pct: 15 }
      ]
    },
    governance_assurance: {
      evidence_coverage: '99.1%', pending_to_valid_days: 1.8, schema_drift_alerts: 0,
      recent_logs: [
        { id: 'SYS-011', action: '執行 P_FIN_REPORT_VERSION_SEAL', operator: 'System', status: 'VALID', date: '2024-11-08 10:30' },
        { id: 'SYS-012', action: '執行 P_ESG_REPORT_VERSION_SEAL', operator: 'System', status: 'VALID', date: '2024-11-09 15:00' },
      ]
    }
  }
};

// 預設值（找不到時用 2881）
const getMock = (code: string) => FHC_MOCK[code] || FHC_MOCK['2881'];

type TabId = 'G1_COMMAND' | 'G2_DRILLDOWN' | 'G3_ESG' | 'G4_GOVERNANCE';

export default function FHCIndustryPage() {
  const { user, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('G1_COMMAND');
  const [selectedCompany, setSelectedCompany] = useState('2881');

  const mock = getMock(selectedCompany);
  const { meta, command_center, subsidiary_drilldown, esg_emissions, governance_assurance } = mock;

  const TABS: { id: TabId; label: string }[] = [
    { id: 'G1_COMMAND', label: 'G1 集團總覽 (Command Center)' },
    { id: 'G2_DRILLDOWN', label: 'G2 子公司穿透 (Drill-down)' },
    { id: 'G3_ESG', label: 'G3 ESG 與投融資排放' },
    { id: 'G4_GOVERNANCE', label: 'G4 治理稽核 (Governance)' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC] text-slate-800">

      {/* ── Header ─────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase">金控業專屬視角</span>
            <h1 className="text-2xl font-black">集團合規與穿透式監理</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">
            向內檢視集團風險、穿透子公司資料血緣，並監控跨部門之證據與治理健康度。
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析標的</label>
            <select
              value={selectedCompany}
              onChange={e => setSelectedCompany(e.target.value)}
              className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              {FHC_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <span className="text-[9px] text-slate-400 font-bold tracking-wider">{meta.scope} | {meta.period}</span>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── G1: Command Center ─────────────────────────── */}
      {activeTab === 'G1_COMMAND' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-200 shadow-sm">
              <h3 className="text-sm font-bold text-indigo-800 mb-4 border-b border-indigo-100 pb-2">風險脈搏 (Risk Pulse)</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600">高風險子公司數</span>
                  <span className={`text-xl font-black ${command_center.risk_pulse.high_risk_subs > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {command_center.risk_pulse.high_risk_subs} 家
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600">重大事件 Open 件數</span>
                  <span className={`text-xl font-black ${command_center.risk_pulse.open_issues > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {command_center.risk_pulse.open_issues} 件
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-indigo-100">
                  <span className="text-xs font-bold text-slate-600">全局資料缺口率</span>
                  <span className="text-xl font-black text-indigo-700">{command_center.risk_pulse.data_gap_rate}</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 border-b border-slate-100 pb-2">永續準備度 (ESG Readiness)</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">第三方確信覆蓋率</span>
                  <span className="text-lg font-black text-emerald-600">{command_center.esg_readiness.assurance_coverage}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">碳排估算比例 (平均)</span>
                  <span className="text-lg font-black text-slate-700">{command_center.esg_readiness.estimation_ratio_avg}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800">子公司曝險熱區 (Exposure Hotspots)</h3>
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: fin_financial_fact (VALID)</span>
              </div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={command_center.exposure_hotspots} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#E2E8F0" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#334155', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} cursor={{ fill: '#F8FAFC' }} />
                    <Bar dataKey="exposure" name="曝險餘額 (億)" radius={[0, 4, 4, 0]} barSize={35}>
                      {command_center.exposure_hotspots.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.risk_level === 'HIGH' ? '#F43F5E' : '#4F46E5'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">紅柱代表偵測到高風險異常（財務惡化或重大裁罰）</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setActiveTab('G2_DRILLDOWN')} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">
                深度穿透高風險子公司 ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── G2: Drill-down ─────────────────────────────── */}
      {activeTab === 'G2_DRILLDOWN' && (
        <div>
          {subsidiary_drilldown.gap_report && (
            <div className="mb-6 bg-slate-800 text-white p-4 rounded-xl flex items-start gap-4">
              <div className="text-2xl mt-1">🚧</div>
              <div>
                <h3 className="text-sm font-black text-amber-400 mb-1">防篡改引擎攔截：偵測到資料缺口</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  缺乏第一級資料源{' '}
                  <code className="bg-slate-700 px-1 py-0.5 rounded text-rose-300">
                    [{subsidiary_drilldown.gap_report.missing_sources.join(', ')}]
                  </code>
                  。{subsidiary_drilldown.gap_report.blocked_reason}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-sm font-bold text-slate-500 mb-2">當前檢視子公司</p>
              <h2 className="text-2xl font-black text-indigo-900 mb-4">{subsidiary_drilldown.selected_sub}</h2>
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-[10px] text-slate-500 font-bold mb-1">總營收 / 淨利</p>
                  <p className="text-base font-black text-slate-800">
                    {subsidiary_drilldown.snapshot.revenue} /{' '}
                    <span className="text-emerald-600">{subsidiary_drilldown.snapshot.net_income}</span>
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-[10px] text-slate-500 font-bold mb-1">負債比 (Debt Ratio)</p>
                  <p className="text-base font-black text-rose-600">{subsidiary_drilldown.snapshot.debt_ratio}</p>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800">近 8 季財務趨勢</h3>
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: DER_FIN_SNAPSHOT</span>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <ComposedChart data={subsidiary_drilldown.financial_trend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                    <Bar yAxisId="left" dataKey="revenue" name="營收(億)" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={25} />
                    <Line yAxisId="left" type="monotone" dataKey="net_income" name="淨利(億)" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Evidence Panel */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">可稽核證據鏈 (Evidence Panel)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2 rounded-l-lg">證據 ID</th>
                    <th className="px-3 py-2">類型</th>
                    <th className="px-3 py-2">生成日期</th>
                    <th className="px-3 py-2">核准人</th>
                    <th className="px-3 py-2 rounded-r-lg">指紋 Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {subsidiary_drilldown.evidences.map((ev: any) => (
                    <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-3 font-bold text-slate-700">{ev.id}</td>
                      <td className="px-3 py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono text-[9px]">{ev.type}</span></td>
                      <td className="px-3 py-3 text-slate-500">{ev.date}</td>
                      <td className="px-3 py-3 text-slate-500">{ev.operator}</td>
                      <td className="px-3 py-3 font-mono text-blue-600 cursor-pointer hover:underline">{ev.hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── G3: ESG ────────────────────────────────────── */}
      {activeTab === 'G3_ESG' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-bold text-slate-500 mb-4 border-b border-slate-100 pb-2">投融資碳排 (Financed Emissions)</h3>
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-400 mb-1">集團總計碳排</p>
              <h2 className="text-3xl font-black text-slate-800">
                {esg_emissions.financed_emissions_total}{' '}
                <span className="text-sm font-medium text-slate-500">tCO2e</span>
              </h2>
              <p className="text-[10px] text-slate-400 mt-2">方法學: {esg_emissions.methodology}</p>
            </div>
            <button className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">
              產出監理輸出包 (Disclosure Pack)
            </button>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
              <h3 className="text-sm font-bold text-slate-800">ESG 資料品質分級分佈</h3>
              <span className="text-[9px] text-slate-400 font-mono">橘色代表缺乏第三方確信</span>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={esg_emissions.dq_grade_dist} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#E2E8F0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="grade" type="category" tick={{ fontSize: 10, fill: '#334155', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="pct" name="佔比" radius={[0, 4, 4, 0]} barSize={25}>
                    {esg_emissions.dq_grade_dist.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.grade.includes('C級') ? '#F59E0B' : '#10B981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── G4: Governance ─────────────────────────────── */}
      {activeTab === 'G4_GOVERNANCE' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-500 mb-4 border-b border-slate-100 pb-2">證據覆蓋與健康度</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1">應封存 vs 已封存覆蓋率</p>
                  <p className="text-3xl font-black text-emerald-600">{governance_assurance.evidence_coverage}</p>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] text-slate-500 font-bold mb-1">審核放行平均時間 (PENDING ➔ VALID)</p>
                  <p className="text-lg font-black text-slate-800">{governance_assurance.pending_to_valid_days} 天</p>
                </div>
              </div>
            </div>
            <div className="bg-teal-50 p-6 rounded-2xl border border-teal-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-teal-800 mb-1">資料庫 Schema 異動警示</p>
                <p className="text-sm font-bold text-teal-700">無底層結構篡改</p>
              </div>
              <div className="text-3xl font-black text-teal-600">{governance_assurance.schema_drift_alerts}</div>
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
                      <th className="px-3 py-2">操作/事件</th>
                      <th className="px-3 py-2">執行者</th>
                      <th className="px-3 py-2 rounded-r-lg">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {governance_assurance.recent_logs.map((log: any) => (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-3 py-3 font-mono text-slate-500 text-[10px]">{log.date}</td>
                        <td className="px-3 py-3 font-bold text-slate-700">{log.action}</td>
                        <td className="px-3 py-3 text-slate-500">{log.operator}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[9px] border ${
                            log.status === 'VALID' || log.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
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
              <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow hover:bg-slate-50">
                開啟 Evidence Explorer (全局搜索)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

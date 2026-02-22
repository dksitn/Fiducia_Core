'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import {
  ComposedChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

const ALL_COMPANIES = [
  { value: '2330', label: '2330 台積電' },
  { value: '2317', label: '2317 鴻海' },
  { value: '2454', label: '2454 聯發科' },
  { value: '2881', label: '2881 富邦金' },
  { value: '2882', label: '2882 國泰金' },
  { value: '2891', label: '2891 中信金' },
  { value: '1301', label: '1301 台塑' },
  { value: '2002', label: '2002 中鋼' },
  { value: '1216', label: '1216 統一' },
  { value: '2308', label: '2308 台達電' },
];

type TabId = 'RESEARCH' | 'TECH_ANALYSIS' | 'DECISION' | 'COMPLIANCE' | 'PEDIGREE';

const CandlestickShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? '#ef4444' : '#22c55e';
  const actualHeight = Math.max(height || 1, 1);
  const pixelPerValue = actualHeight / Math.max(high - low, 0.001);
  const topWickY    = y;
  const bottomWickY = y + actualHeight;
  const openY  = y + (high - open)  * pixelPerValue;
  const closeY = y + (high - close) * pixelPerValue;
  const bodyTop    = Math.min(openY, closeY);
  const bodyHeight = Math.max(1, Math.abs(closeY - openY));
  const centerX = x + width / 2;
  return (
    <g>
      <line x1={centerX} y1={topWickY} x2={centerX} y2={bottomWickY} stroke={color} strokeWidth={1.5} />
      <rect x={x} y={bodyTop} width={width} height={bodyHeight} fill={color} stroke={color} />
    </g>
  );
};

const fmtBig = (v: number | null | undefined) => {
  if (v == null) return 'N/A';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000_000) return `${(v/1_000_000_000_000).toFixed(2)} 兆`;
  if (abs >= 100_000_000)       return `${(v/100_000_000).toFixed(2)} 億`;
  if (abs >= 10_000)            return `${(v/10_000).toFixed(0)} 萬`;
  return v.toLocaleString();
};

function MetricBox({ label, value, sub, warn = false, note }:
  { label: string; value: string; sub?: string; warn?: boolean; note?: string }) {
  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
      <p className="text-xs text-slate-500 font-bold mb-1">{label}</p>
      <p className={`text-2xl font-black ${warn ? 'text-rose-600' : 'text-emerald-600'}`}>{value}</p>
      {note && <p className="text-[10px] text-slate-400 mt-1">{note}</p>}
      {sub  && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function SecuritiesIndustryPage() {
  const { isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab]             = useState<TabId>('RESEARCH');
  const [selectedCompany, setSelectedCompany] = useState('2330');

  const [finData, setFinData]               = useState<any[]>([]);
  const [mktData, setMktData]               = useState<any[]>([]);
  const [latestMkt, setLatestMkt]           = useState<any>(null);
  const [esgData, setEsgData]               = useState<any>(null);
  const [eventsData, setEventsData]         = useState<any[]>([]);
  const [trendChartData, setTrendChartData] = useState<any[]>([]);
  const [targetKLine, setTargetKLine]       = useState<any[]>([]);
  const [benchmarkKLine, setBenchmarkKLine] = useState<any[]>([]);
  const [evidenceItems, setEvidenceItems]   = useState<any[]>([]);
  const [isLoading, setIsLoading]           = useState(true);

  const fetchData = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const [fin, mkt, esg, evts, evid] = await Promise.all([
        supabase.from('fin_financial_fact')
          .select('*').eq('company_code', code).eq('status', 'VALID')
          .order('period', { ascending: false }).limit(12),
        supabase.from('mkt_daily_series')
          .select('trade_date, open, high, low, close, volume')
          .eq('company_code', code).eq('status', 'VALID')
          .order('trade_date', { ascending: false }).limit(5),
        supabase.from('esg_metrics')
          .select('*').eq('company_code', code).eq('status', 'VALID')
          .order('period', { ascending: false }).limit(1),
        supabase.from('mkt_material_events')
          .select('*').eq('company_code', code)
          .order('event_date', { ascending: false }).limit(10),
        supabase.from('sys_evidence_items')
          .select('id, fingerprint, sha256, status, storage_path, created_at, state_version_id, sys_state_versions(summary)')
          .eq('status', 'VALID')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setFinData(fin.data ?? []);
      setMktData(mkt.data ?? []);
      setLatestMkt((mkt.data ?? [])[0] ?? null);
      setEsgData(((esg.data ?? [])[0]) ?? null);
      setEventsData(evts.data ?? []);
      setEvidenceItems(evid.data ?? []);

      try {
        const res = await fetch(`/api/charts/market-trend?companyCode=${code}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            const { targetData, benchmarkData } = json.data;
            if (targetData?.length && benchmarkData?.length) {
              const baseTgt = targetData[0].close;
              const baseBnk = benchmarkData[0].close;
              setTrendChartData(
                targetData.map((t: any, i: number) => {
                  const b = benchmarkData[i] ?? benchmarkData[benchmarkData.length - 1];
                  return {
                    date:            t.trade_date.substring(5),
                    targetReturn:    +((t.close - baseTgt) / baseTgt * 100).toFixed(2),
                    benchmarkReturn: +((b.close - baseBnk) / baseBnk * 100).toFixed(2),
                  };
                })
              );
              const mapK = (arr: any[]) => arr.map(d => ({ ...d, date: d.trade_date.substring(5), klineRange: [d.low, d.high] }));
              setTargetKLine(mapK(targetData));
              setBenchmarkKLine(mapK(benchmarkData));
            }
          }
        }
      } catch { /* 技術分析資料未就緒 */ }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(selectedCompany); }, [selectedCompany, fetchData]);

  const latestFin = finData[0]                   ?? null;
  const prevFin   = finData[1]                   ?? null;
  const oldestFin = finData[finData.length - 1]  ?? null;

  const missingFields: string[] = [];
  if (!latestFin?.revenue)             missingFields.push('revenue');
  if (!latestFin?.net_income)          missingFields.push('net_income');
  if (!latestFin?.operating_cash_flow) missingFields.push('operating_cash_flow');
  if (!latestFin?.total_assets)        missingFields.push('total_assets');
  if (!latestMkt?.close)               missingFields.push('market_price');

  const isGapDetected       = missingFields.length > 0;
  const isHistoryIncomplete = !isGapDetected && finData.length < 12;

  let cfo_ni = 0, debt_ratio = 0, revenue_growth = 0, cagr = 0;
  let hasControversy = false, actionSignal = 'N/A', rationale = '';

  if (!isGapDetected && latestFin) {
    cfo_ni        = latestFin.operating_cash_flow / latestFin.net_income;
    debt_ratio    = (latestFin.total_liabilities ?? 0) / latestFin.total_assets;
    if (prevFin?.revenue > 0)
      revenue_growth = ((latestFin.revenue - prevFin.revenue) / prevFin.revenue) * 100;
    if (finData.length >= 4 && oldestFin?.revenue > 0)
      cagr = (Math.pow(latestFin.revenue / oldestFin.revenue, 1 / (finData.length / 4)) - 1) * 100;
    hasControversy = eventsData.some(e => e.severity === 'HIGH' || e.event_type === 'PENALTY');

    if (debt_ratio > 0.7 || hasControversy) {
      actionSignal = '減碼 (Reduce)';
      rationale = hasControversy
        ? '偵測到重大裁罰或爭議事件，觸發內部合規政策，建議立即執行減碼。'
        : `財務槓桿過高 (負債比 ${(debt_ratio * 100).toFixed(1)}%)，流動性下檔風險劇增，建議降低曝險部位。`;
    } else if (cfo_ni < 0.8 || revenue_growth < 0) {
      actionSignal = '觀望 (Hold)';
      rationale = `營收動能放緩或盈餘品質偏弱。CFO/NI 轉換率 ${cfo_ni.toFixed(2)} 低於 0.8 門檻，建議暫緩加碼觀察下季財報。`;
    } else {
      actionSignal = '買進 (Buy)';
      rationale = `基於 ${finData.length} 季已驗證財務事實，基本面強健。CFO/NI ${cfo_ni.toFixed(2)}，槓桿安全 (${(debt_ratio * 100).toFixed(1)}%)，CAGR ${cagr.toFixed(1)}%，無重大 ESG 爭議。`;
    }
  }

  const quarterChartData = [...finData].reverse().map(d => ({
    period:  d.period,
    revenue: +(d.revenue / 100_000_000).toFixed(1),
  }));

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'RESEARCH',      label: '基本面研究',    icon: '📊' },
    { id: 'TECH_ANALYSIS', label: '技術分析',       icon: '📈' },
    { id: 'DECISION',      label: '投資決策引擎',   icon: '🎯' },
    { id: 'COMPLIANCE',    label: '法遵風控',        icon: '🔒' },
    { id: 'PEDIGREE',      label: '資料血緣與品質', icon: '🔬' },
  ];

  const signalColor = actionSignal.includes('買進') ? 'emerald' : actionSignal.includes('觀望') ? 'amber' : 'rose';

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC]">

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest">證券業專屬視角</span>
            <h1 className="text-2xl font-black text-slate-800">投資分析</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">
            基於三年期 (12 季) 財務事實 + 市場行情，遵循「研究 ➔ 決策 ➔ 風控 ➔ 溯源」標準流程。
          </p>
          <p className="text-[10px] font-mono text-slate-300 mt-1">
            fin_financial_fact · mkt_daily_series · esg_metrics · mkt_material_events · sys_evidence_items
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析標的</label>
            <select
              value={selectedCompany}
              onChange={e => setSelectedCompany(e.target.value)}
              className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              {ALL_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            市價：{latestMkt?.close ? `${latestMkt.close} 元` : '未同步'}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
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
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* Gap 攔截 */}
          {isGapDetected && activeTab !== 'PEDIGREE' && (
            <div className="mb-6 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border-l-4 border-rose-500 flex items-start gap-5">
              <div className="text-4xl mt-1">🚧</div>
              <div>
                <h3 className="text-base font-black text-rose-400 mb-2">防篡改引擎攔截 · 資料缺口偵測</h3>
                <p className="text-sm text-slate-300 font-medium leading-relaxed mb-3">缺乏基礎資料源，不滿足 3 年期分析要件。</p>
                <div className="bg-black/50 border border-slate-700 p-3 rounded-lg inline-block">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Missing Fields:</p>
                  <p className="text-xs text-rose-300 font-mono">[{missingFields.join(', ')}]</p>
                </div>
              </div>
            </div>
          )}

          {isHistoryIncomplete && !isGapDetected && activeTab === 'RESEARCH' && (
            <div className="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-4 shadow-sm">
              <div className="text-2xl mt-0.5">⚠️</div>
              <div>
                <h3 className="text-sm font-black mb-1 text-amber-900">歷史資料未達三年 (12 季) 標準</h3>
                <p className="text-xs font-medium leading-relaxed text-amber-800">
                  目前僅 <strong>{finData.length} 季</strong> VALID 財報，系統拒絕進行任何推估或假造。
                </p>
              </div>
            </div>
          )}

          {/* ══ 基本面研究 ══════════════════════════════════════ */}
          {activeTab === 'RESEARCH' && !isGapDetected && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 min-w-0">
                <MetricBox label="最新季度營收" value={fmtBig(latestFin?.revenue)} sub={latestFin?.period} />
                <MetricBox label="稅後淨利" value={fmtBig(latestFin?.net_income)} warn={(latestFin?.net_income ?? 0) < 0} />
                <MetricBox label="負債比率" value={latestFin?.total_assets > 0 ? `${(debt_ratio * 100).toFixed(1)}%` : 'N/A'} warn={debt_ratio > 0.7} note="警戒 > 70%" />
                <MetricBox label="CFO / NI" value={cfo_ni.toFixed(2)} warn={cfo_ni < 0.8} note="健康 > 0.8" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">季度財務趨勢（營業收入）</h3>
                      <p className="text-[10px] text-indigo-600 font-bold mt-1">共 {finData.length} 季 VALID 快照</p>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">fin_financial_fact</span>
                  </div>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={quarterChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}億`} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                          formatter={(v: any) => [`${v} 億`, '營業收入']} />
                        <Bar dataKey="revenue" name="營業收入(億)" fill="#C7D2FE" radius={[3,3,0,0]} barSize={24} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                  <h3 className="text-sm font-bold text-slate-500 tracking-widest border-b border-slate-100 pb-2">複合成長率 (CAGR)</h3>
                  <div className={`p-4 rounded-xl border ${finData.length >= 4 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'} flex items-end justify-between`}>
                    <span className="text-xs font-bold text-slate-500">基於 {finData.length} 季</span>
                    <span className={`text-3xl font-black ${finData.length >= 4 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {finData.length >= 4 ? `${cagr.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2">ESG 概況</p>
                    <div className="space-y-2">
                      <div className="bg-slate-50 p-2 rounded border border-slate-100 flex justify-between">
                        <span className="text-[10px] text-slate-500 font-bold">確信等級</span>
                        <span className={`text-xs font-black ${esgData?.assurance_level === 'High' ? 'text-emerald-600' : 'text-amber-600'}`}>{esgData?.assurance_level ?? 'N/A'}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-100 flex justify-between">
                        <span className="text-[10px] text-slate-500 font-bold">碳排合計</span>
                        <span className="text-xs font-black text-slate-700">
                          {esgData ? `${((esgData.scope1_tco2e ?? 0) + (esgData.scope2_tco2e ?? 0)).toLocaleString()} tCO₂e` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ 技術分析 ════════════════════════════════════════ */}
          {activeTab === 'TECH_ANALYSIS' && !isGapDetected && (
            <div className="space-y-6">
              {trendChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white py-20">
                  <span className="text-4xl mb-3 opacity-40">📈</span>
                  <p className="text-sm font-bold text-slate-600">技術分析資料尚未同步</p>
                  <p className="text-xs text-slate-400 mt-1">請至 Admin → 第一層 → 每日市場行情 同步</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[
                      { title: '大盤指數 (TAIEX)', data: benchmarkKLine },
                      { title: `個股 K 線（${selectedCompany}）`, data: targetKLine },
                    ].map(chart => (
                      <div key={chart.title} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                          <h3 className="text-sm font-bold text-slate-800">{chart.title}</h3>
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">mkt_daily_series</span>
                        </div>
                        <div style={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chart.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} minTickGap={30} axisLine={false} tickLine={false} />
                              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                              <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                                formatter={(val: any, name: any, props: any) => {
                                  if (name === 'K線') return [`開:${props.payload.open} 收:${props.payload.close} 高:${props.payload.high} 低:${props.payload.low}`, 'OHLC'];
                                  return [val, name];
                                }} />
                              <Bar dataKey="klineRange" name="K線" shape={<CandlestickShape />} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">個股 vs 大盤 相對報酬走勢</h3>
                        <p className="text-[10px] text-indigo-600 font-bold mt-1">標準化比較（基準值 = 0%）</p>
                      </div>
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-mono">mkt_daily_series · Normalized</span>
                    </div>
                    <div style={{ height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} minTickGap={30} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                            formatter={(v: any) => [`${Number(v || 0).toFixed(2)}%`, '累積報酬率']} />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="targetReturn"    name="個股報酬"        stroke="#4F46E5" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="benchmarkReturn" name="大盤基準 (TAIEX)" stroke="#94A3B8" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                      <h3 className="text-sm font-bold text-slate-800">近期行情快照</h3>
                      <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">mkt_daily_series（最新 5 日）</span>
                    </div>
                    {mktData.length === 0 ? (
                      <p className="text-xs text-slate-400">行情資料未同步</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold">
                            <tr>
                              <th className="px-3 py-2 rounded-l-lg">交易日</th>
                              <th className="px-3 py-2">開盤</th>
                              <th className="px-3 py-2">最高</th>
                              <th className="px-3 py-2">最低</th>
                              <th className="px-3 py-2 rounded-r-lg">收盤</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mktData.map((row: any, i: number) => {
                              const isUp = row.close >= row.open;
                              return (
                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                                  <td className="px-3 py-2.5 font-mono text-slate-500">{row.trade_date}</td>
                                  <td className="px-3 py-2.5 font-bold text-slate-700">{row.open}</td>
                                  <td className="px-3 py-2.5 font-bold text-emerald-600">{row.high}</td>
                                  <td className="px-3 py-2.5 font-bold text-rose-600">{row.low}</td>
                                  <td className={`px-3 py-2.5 font-black ${isUp ? 'text-red-500' : 'text-green-600'}`}>{row.close}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ 投資決策引擎 ════════════════════════════════════ */}
          {activeTab === 'DECISION' && !isGapDetected && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`md:col-span-1 p-6 rounded-2xl shadow-sm flex flex-col justify-between border bg-${signalColor}-50 border-${signalColor}-200`}>
                <div>
                  <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> 系統建議操作
                  </p>
                  <h2 className="text-4xl font-black text-slate-900 mb-4">{actionSignal}</h2>
                  <div className="bg-white/70 p-4 rounded-xl border border-white shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200/50 pb-1">決策依據</p>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">{rationale}</p>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-200/50 text-right">
                  <span className="text-[9px] bg-white/60 text-slate-600 px-2 py-1 rounded font-mono">Engine: P_SEC_DECISION</span>
                </div>
              </div>

              <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">核心驅動因子</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">fin_financial_fact (VALID)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <MetricBox label="CFO / NI"  value={cfo_ni.toFixed(2)} warn={cfo_ni < 0.8} note="健康門檻 > 0.8" />
                    <MetricBox label="負債比率"  value={`${(debt_ratio * 100).toFixed(1)}%`} warn={debt_ratio > 0.7} note="警戒 > 70%" />
                    <MetricBox label="季度 YoY"  value={prevFin ? `${revenue_growth > 0 ? '+' : ''}${revenue_growth.toFixed(1)}%` : 'N/A'} warn={revenue_growth < 0} note="季度比較" />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">最新市場行情</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">mkt_daily_series</span>
                  </div>
                  {latestMkt ? (
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: '收盤', value: latestMkt.close },
                        { label: '開盤', value: latestMkt.open  },
                        { label: '最高', value: latestMkt.high  },
                        { label: '最低', value: latestMkt.low   },
                      ].map(item => (
                        <div key={item.label} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">{item.label}</p>
                          <p className="text-lg font-black text-slate-800">{item.value ?? 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-bold">行情資料尚未同步</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ 法遵風控 ════════════════════════════════════════ */}
          {activeTab === 'COMPLIANCE' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-4 min-w-0">
                <div className={`p-6 rounded-2xl border shadow-sm flex items-center gap-4 ${hasControversy ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="text-3xl">{hasControversy ? '⚠️' : '✅'}</div>
                  <div>
                    <p className={`text-xs font-bold ${hasControversy ? 'text-rose-800' : 'text-emerald-800'}`}>重大裁罰 / 爭議監控</p>
                    <p className={`text-xl font-black ${hasControversy ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {hasControversy ? '觸發限制' : '安全 (CLEAR)'}
                    </p>
                  </div>
                </div>
                {esgData && (
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-500 mb-3 border-b border-slate-100 pb-2">ESG 風控快照</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center gap-2"><span className="text-slate-500 shrink-0">確信等級</span><span className={`font-black ${esgData.assurance_level === 'High' ? 'text-emerald-600' : 'text-amber-600'}`}>{esgData.assurance_level}</span></div>
                      <div className="flex justify-between items-center gap-2"><span className="text-slate-500 shrink-0">DQ 分數</span><span className="font-black text-slate-700">{esgData.dq_score ?? 'N/A'} / 100</span></div>
                      <div className="flex justify-between items-center gap-2"><span className="text-slate-500 shrink-0">範疇一</span><span className="font-black text-slate-700">{esgData.scope1_tco2e?.toLocaleString() ?? 'N/A'} tCO₂e</span></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">監理公告與重大事件日誌</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">mkt_material_events</span>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                  {eventsData.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">近期無重大裁罰或爭議事件。</p>
                  ) : eventsData.map((ev, i) => (
                    <div key={i} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex gap-4 items-start">
                      <div className="w-24 shrink-0 text-center">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold block mb-1 ${ev.severity === 'HIGH' || ev.event_type === 'PENALTY' ? 'bg-rose-200 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
                          {ev.event_type}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">{ev.event_date}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700 mb-1">{ev.description || ev.headline || '—'}</p>
                        <p className="text-[9px] text-slate-400 font-mono">Status: {ev.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ 資料血緣與品質 ══════════════════════════════════ */}
          {activeTab === 'PEDIGREE' && (
            <div className="space-y-6">

              {/* 快照卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 財務報表快照 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-800">📊 財務報表快照</h3>
                    <span className={`text-[10px] px-2 py-1 rounded font-black border ${latestFin ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {latestFin ? 'VALID' : 'PENDING'}
                    </span>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    {[
                      { label: '快照識別碼',  value: `FIN_${selectedCompany}_${latestFin?.period ?? '—'}`, mono: true },
                      { label: '最新期間',    value: latestFin?.period ?? 'N/A', mono: true },
                      { label: 'DQ 品質分數', value: `${latestFin?.dq_score ?? 'N/A'} / 100`, highlight: true, score: latestFin?.dq_score },
                      { label: '資料來源',    value: 'TWSE OpenAPI (t187ap14_L + t187ap03_L)', mono: true },
                      { label: '封存引擎',    value: 'P_FIN_REPORT_VERSION_SEAL', mono: true },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-slate-50 gap-4">
                        <span className="text-slate-500 font-bold shrink-0">{row.label}</span>
                        <span className={`text-right truncate ${row.mono ? 'font-mono text-slate-700' : ''} ${row.highlight ? ((row.score ?? 0) >= 90 ? 'font-black text-emerald-600' : 'font-black text-amber-600') : ''}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2">
                      <p className="text-slate-400 font-bold mb-2">原始資料源</p>
                      <div className="flex flex-wrap gap-1.5">
                        {['SRC_TWSE_OPENAPI_INC', 'SRC_TWSE_OPENAPI_BAL', 'SRC_MOPS_FS'].map(tag => (
                          <span key={tag} className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded font-mono font-bold">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ESG 永續報告快照 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-800">🌱 永續報告快照</h3>
                    <span className={`text-[10px] px-2 py-1 rounded font-black border ${esgData ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {esgData ? 'VALID' : 'PENDING'}
                    </span>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    {[
                      { label: '快照識別碼',  value: `ESG_${selectedCompany}_${esgData?.period ?? '—'}`, mono: true },
                      { label: '最新年度',    value: esgData?.period ?? 'N/A', mono: true },
                      { label: 'DQ 品質分數', value: `${esgData?.dq_score ?? 'N/A'} / 100`, highlight: true, score: esgData?.dq_score },
                      { label: '確信等級',    value: esgData?.assurance_level ?? 'N/A', mono: false },
                      { label: '資料來源',    value: esgData?.data_source === 'TWSE_OPENAPI' ? 'TWSE t187ap15_L' : '行業基準估算', mono: true },
                      { label: '封存引擎',    value: 'P_ESG_REPORT_VERSION_SEAL', mono: true },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-slate-50 gap-4">
                        <span className="text-slate-500 font-bold shrink-0">{row.label}</span>
                        <span className={`text-right truncate ${row.mono ? 'font-mono text-slate-700' : ''} ${row.highlight ? ((row.score ?? 0) >= 90 ? 'font-black text-emerald-600' : 'font-black text-amber-600') : ''}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2">
                      <p className="text-slate-400 font-bold mb-2">原始資料源</p>
                      <div className="flex flex-wrap gap-1.5">
                        {['SRC_SUS_REPORT_PDF', 'SRC_ESG_SCORE', 'SRC_FINANCED_EMISSIONS'].map(tag => (
                          <span key={tag} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-mono font-bold">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Immutable Chain */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">🔗 不可篡改存證追溯 (Immutable Chain)</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: sys_evidence_items</span>
                </div>
                {evidenceItems.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">尚無封存存證記錄。請執行同步與治理放行後再查看。</p>
                ) : (
                  <div className="space-y-3">
                    {evidenceItems.map((item, i) => {
                      const summary = (item.sys_state_versions as any)?.summary ?? '—';
                      const sha     = (item.sha256 ?? item.fingerprint ?? '').substring(0, 16);
                      const path    = item.storage_path
                        ? item.storage_path.split('/').pop()?.substring(0, 36) + '...'
                        : '—';
                      return (
                        <div key={item.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-xs font-mono text-slate-600 truncate">{path}</p>
                              <span className="text-[10px] px-2 py-0.5 rounded font-black bg-emerald-100 text-emerald-700 shrink-0">{item.status}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mb-1">{summary}</p>
                            <p className="text-[10px] font-mono text-slate-300">SHA: {sha}...</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
}

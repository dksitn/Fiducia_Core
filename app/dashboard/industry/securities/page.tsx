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

// ── K 線圖（台股：漲紅跌綠）────────────────────────────────────
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

// ── 格式化 ─────────────────────────────────────────────────────
const fmtBig = (v: number | null | undefined) => {
  if (v == null) return 'N/A';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000_000) return `${(v/1_000_000_000_000).toFixed(2)} 兆`;
  if (abs >= 100_000_000)       return `${(v/100_000_000).toFixed(2)} 億`;
  if (abs >= 10_000)            return `${(v/10_000).toFixed(0)} 萬`;
  return v.toLocaleString();
};

const fmtK = (v: number | null | undefined) => {
  if (v == null) return 'N/A';
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v/100_000_000).toFixed(2)} 億`;
  if (abs >= 10_000)      return `${(v/10_000).toFixed(1)} 萬`;
  return `${v.toLocaleString()} 千元`;
};

// ── 子元件 ─────────────────────────────────────────────────────
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

function DataRow({ label, value, mono = false }:
  { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xs font-bold p-2 rounded border bg-slate-50 text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

// ── 主元件 ─────────────────────────────────────────────────────
export default function SecuritiesIndustryPage() {
  const { isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab]             = useState<TabId>('RESEARCH');
  const [selectedCompany, setSelectedCompany] = useState('2330');

  // 資料狀態
  const [finData, setFinData]               = useState<any[]>([]);
  const [monthlyData, setMonthlyData]       = useState<any[]>([]);  // fin_monthly_revenue
  const [latestMonthly, setLatestMonthly]   = useState<any>(null);
  const [mktData, setMktData]               = useState<any[]>([]);  // 最新 5 筆
  const [latestMkt, setLatestMkt]           = useState<any>(null);
  const [esgData, setEsgData]               = useState<any>(null);
  const [eventsData, setEventsData]         = useState<any[]>([]);
  const [trendChartData, setTrendChartData] = useState<any[]>([]);
  const [targetKLine, setTargetKLine]       = useState<any[]>([]);
  const [benchmarkKLine, setBenchmarkKLine] = useState<any[]>([]);
  const [isLoading, setIsLoading]           = useState(true);

  const fetchData = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const [fin, monthly, mkt, esg, evts] = await Promise.all([
        supabase.from('fin_financial_fact')
          .select('*').eq('company_code', code).eq('status', 'VALID')
          .order('period', { ascending: false }).limit(12),
        supabase.from('fin_monthly_revenue')
          .select('*').eq('company_code', code).eq('status', 'VALID')
          .order('period', { ascending: false }).limit(24),
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
      ]);

      const finRows     = fin.data     ?? [];
      const monthlyRows = monthly.data ?? [];
      const mktRows     = mkt.data     ?? [];

      setFinData(finRows);
      setMonthlyData([...monthlyRows].reverse());    // 升序給圖表
      setLatestMonthly(monthlyRows[0] ?? null);
      setMktData(mktRows);
      setLatestMkt(mktRows[0] ?? null);
      setEsgData((esg.data ?? [])[0] ?? null);
      setEventsData(evts.data ?? []);

      // 技術分析：呼叫 market-trend API
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

  // ── 衍生計算 ─────────────────────────────────────────────────
  const latestFin  = finData[0]                    ?? null;
  const prevFin    = finData[1]                    ?? null;
  const oldestFin  = finData[finData.length - 1]  ?? null;

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

  // 圖表資料
  const quarterChartData = [...finData].reverse().map(d => ({
    period:  d.period,
    revenue: +(d.revenue / 100_000_000).toFixed(1),
    margin:  d.revenue > 0 ? +((d.net_income / d.revenue) * 100).toFixed(1) : 0,
  }));

  const monthlyChartData = monthlyData.map(d => ({
    period:  d.period,           // e.g. 2025M01
    revenue: d.revenue ?? 0,     // 千元
    mom:     d.mom_pct ?? 0,
    yoy:     d.yoy_pct ?? 0,
  }));

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'RESEARCH',      label: '基本面研究',   icon: '📊' },
    { id: 'TECH_ANALYSIS', label: '技術分析',      icon: '📈' },
    { id: 'DECISION',      label: '投資決策引擎',  icon: '🎯' },
    { id: 'COMPLIANCE',    label: '法遵風控',       icon: '🔒' },
    { id: 'PEDIGREE',      label: '資料血緣溯源',  icon: '🔬' },
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
            基於三年期 (12 季) 財務事實 + 月營收趨勢 + 市場行情，遵循「研究 ➔ 決策 ➔ 風控 ➔ 溯源」標準流程。
          </p>
          <p className="text-[10px] font-mono text-slate-300 mt-1">
            fin_financial_fact · fin_monthly_revenue · mkt_daily_series · esg_metrics · mkt_material_events
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
          <div className="flex gap-3 text-[10px] font-bold text-slate-400">
            <span>市價：{latestMkt?.close ? `${latestMkt.close} 元` : '未同步'}</span>
            {latestMonthly && (
              <span>月營收：{fmtK(latestMonthly.revenue)}（{latestMonthly.period}）</span>
            )}
          </div>
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
          {/* Gap 攔截提示 */}
          {isGapDetected && activeTab !== 'PEDIGREE' && (
            <div className="mb-6 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border-l-4 border-rose-500 flex items-start gap-5">
              <div className="text-4xl mt-1">🚧</div>
              <div>
                <h3 className="text-base font-black text-rose-400 mb-2">防篡改引擎攔截 · 資料缺口偵測</h3>
                <p className="text-sm text-slate-300 font-medium leading-relaxed mb-3">
                  缺乏基礎資料源，不滿足 3 年期分析要件。
                </p>
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
              {/* 上方 KPI */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 min-w-0">
                <MetricBox label="最新季度營收" value={fmtBig(latestFin?.revenue)} sub={latestFin?.period} />
                <MetricBox label="稅後淨利" value={fmtBig(latestFin?.net_income)}
                  warn={(latestFin?.net_income ?? 0) < 0} />
                <MetricBox label="負債比率" value={latestFin?.total_assets > 0 ? `${(debt_ratio * 100).toFixed(1)}%` : 'N/A'}
                  warn={debt_ratio > 0.7} note="警戒 > 70%" />
                <MetricBox label="CFO / NI" value={cfo_ni.toFixed(2)} warn={cfo_ni < 0.8} note="健康 > 0.8" />
              </div>

              {/* 季度趨勢 + CAGR */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">季度財務趨勢（營收 vs 淨利率）</h3>
                      <p className="text-[10px] text-indigo-600 font-bold mt-1">共 {finData.length} 季 VALID 快照</p>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">fin_financial_fact</span>
                  </div>
                  {/* 營業收入長條圖 */}
                  <div style={{ height: 160 }}>
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
                  {/* 淨利率折線圖 */}
                  <div style={{ height: 120 }} className="mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={quarterChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="period" hide />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                          formatter={(v: any) => [`${v}%`, '淨利率']} />
                        <Line type="monotone" dataKey="margin" name="淨利率(%)" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 3, fill: '#4F46E5' }} />
                        <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                      </LineChart>
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

              {/* 月營收趨勢 */}
              {monthlyChartData.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">月營收趨勢（MoM / YoY）</h3>
                      <p className="text-[10px] text-indigo-600 font-bold mt-1">共 {monthlyChartData.length} 個月 · 單位：千元</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {latestMonthly && (
                        <div className="text-right">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded ${(latestMonthly.yoy_pct ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            YoY {(latestMonthly.yoy_pct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(latestMonthly.yoy_pct ?? 0).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">fin_monthly_revenue</span>
                    </div>
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthlyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} minTickGap={20} />
                        <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} width={60}
                          tickFormatter={v => v >= 100_000_000 ? `${(v/100_000_000).toFixed(1)}億` : v >= 10_000 ? `${(v/10_000).toFixed(0)}萬` : String(v)} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
                        <Bar yAxisId="left" dataKey="revenue" name="月營收(千元)" fill="#C7D2FE" radius={[3,3,0,0]} barSize={16} />
                        <Line yAxisId="right" type="monotone" dataKey="yoy" name="年增率(%)" stroke="#10B981" strokeWidth={2} dot={false} />
                        <ReferenceLine yAxisId="right" y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ 技術分析 ════════════════════════════════════════ */}
          {activeTab === 'TECH_ANALYSIS' && !isGapDetected && (
            <div className="space-y-6">
              {trendChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white py-20">
                  <span className="text-4xl mb-3 opacity-40">📈</span>
                  <p className="text-sm font-bold text-slate-600">技術分析資料尚未同步</p>
                  <p className="text-xs text-slate-400 mt-1">請至 Admin → 第一層 → 每日市場行情 同步，或執行 seed_market.mjs 寫入歷史 K 線資料</p>
                </div>
              ) : (
                <>
                  {/* K 線圖 */}
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
                              <RechartsTooltip
                                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11px' }}
                                formatter={(val: any, name: any, props: any) => {
                                  if (name === 'K線') return [`開:${props.payload.open} 收:${props.payload.close} 高:${props.payload.high} 低:${props.payload.low}`, 'OHLC'];
                                  return [val, name];
                                }}
                              />
                              <Bar dataKey="klineRange" name="K線" shape={<CandlestickShape />} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 相對報酬 */}
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
                          <Line type="monotone" dataKey="targetReturn"    name="個股報酬"       stroke="#4F46E5" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="benchmarkReturn" name="大盤基準 (TAIEX)" stroke="#94A3B8" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 最新 5 日行情 */}
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
              <div className={`md:col-span-1 p-6 rounded-2xl shadow-sm flex flex-col justify-between border
                bg-${signalColor}-50 border-${signalColor}-200`}
              >
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
                    <MetricBox label="CFO / NI" value={cfo_ni.toFixed(2)} warn={cfo_ni < 0.8} note="健康門檻 > 0.8" />
                    <MetricBox label="負債比率" value={`${(debt_ratio * 100).toFixed(1)}%`} warn={debt_ratio > 0.7} note="警戒 > 70%" />
                    <MetricBox label="季度 YoY" value={prevFin ? `${revenue_growth > 0 ? '+' : ''}${revenue_growth.toFixed(1)}%` : 'N/A'} warn={revenue_growth < 0} note="季度比較" />
                  </div>
                </div>

                {/* 月營收 KPI */}
                {latestMonthly && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                      <h3 className="text-sm font-bold text-slate-800">月營收訊號</h3>
                      <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">fin_monthly_revenue · {latestMonthly.period}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <MetricBox label="當月營收" value={fmtK(latestMonthly.revenue)} />
                      <MetricBox label="月增率 MoM" value={`${(latestMonthly.mom_pct ?? 0) >= 0 ? '+' : ''}${(latestMonthly.mom_pct ?? 0).toFixed(1)}%`} warn={(latestMonthly.mom_pct ?? 0) < 0} />
                      <MetricBox label="年增率 YoY" value={`${(latestMonthly.yoy_pct ?? 0) >= 0 ? '+' : ''}${(latestMonthly.yoy_pct ?? 0).toFixed(1)}%`} warn={(latestMonthly.yoy_pct ?? 0) < 0} />
                    </div>
                  </div>
                )}

                {/* 市場行情 */}
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
                      <div className="flex justify-between items-center gap-2"><span className="text-slate-500 shrink-0">確信等級</span><span className={`font-black text-right ${esgData.assurance_level === 'High' ? 'text-emerald-600' : 'text-amber-600'}`}>{esgData.assurance_level}</span></div>
                      <div className="flex justify-between items-center gap-2"><span className="text-slate-500 shrink-0">DQ 分數</span><span className="font-black text-slate-700 text-right">{esgData.dq_score ?? 'N/A'} / 100</span></div>
                      <div className="flex justify-between items-center gap-2"><span className="text-slate-500 shrink-0">範疇一</span><span className="font-black text-slate-700 text-right">{esgData.scope1_tco2e?.toLocaleString() ?? 'N/A'} tCO₂e</span></div>
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

          {/* ══ 資料血緣溯源 ════════════════════════════════════ */}
          {activeTab === 'PEDIGREE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 財務季報 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">📊 季度財報</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${finData.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {finData.length >= 12 ? 'VALID (3 YR)' : `VALID (${finData.length}季)`}
                  </span>
                </div>
                <div className="space-y-3">
                  <DataRow label="最新期間" value={latestFin?.period ?? 'N/A'} mono />
                  <DataRow label="已取得期數" value={finData.length > 0 ? `共 ${finData.length} 期` : '查無放行數據'} />
                  <DataRow label="DQ 品質分數" value={`${latestFin?.dq_score ?? 'N/A'} / 100`} mono />
                  <DataRow label="資料來源" value="TWSE t187ap14_L + t187ap03_L" mono />
                </div>
              </div>

              {/* 月營收 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">📅 月營收</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${latestMonthly ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {latestMonthly ? `VALID (${monthlyData.length}月)` : 'PENDING'}
                  </span>
                </div>
                <div className="space-y-3">
                  <DataRow label="最新月份" value={latestMonthly?.period ?? 'N/A'} mono />
                  <DataRow label="累計營收" value={latestMonthly?.cumulative_rev != null ? fmtK(latestMonthly.cumulative_rev) : 'N/A'} />
                  <DataRow label="DQ 品質分數" value={`${latestMonthly?.dq_score ?? 'N/A'} / 100`} mono />
                  <DataRow label="資料來源" value="TWSE t187ap05_L" mono />
                </div>
              </div>

              {/* 市場行情 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">📈 市場行情</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${latestMkt ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {latestMkt ? 'VALID' : 'PENDING'}
                  </span>
                </div>
                <div className="space-y-3">
                  <DataRow label="最新交易日" value={latestMkt?.trade_date ?? 'N/A'} mono />
                  <DataRow label="收盤價" value={latestMkt?.close ? `${latestMkt.close} 元` : 'N/A'} />
                  <DataRow label="成交量" value={latestMkt?.volume != null ? latestMkt.volume.toLocaleString() : 'N/A'} />
                  <DataRow label="資料來源" value="Yahoo Finance / TWSE STOCK_DAY_ALL" mono />
                </div>
              </div>

              {/* ESG */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">🌱 ESG 永續</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${esgData ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {esgData ? 'VALID' : 'PENDING'}
                  </span>
                </div>
                <div className="space-y-3">
                  <DataRow label="最新年度" value={`${esgData?.period ?? 'N/A'}`} mono />
                  <DataRow label="範疇一碳排" value={esgData?.scope1_tco2e != null ? `${esgData.scope1_tco2e.toLocaleString()} tCO₂e` : 'N/A'} />
                  <DataRow label="DQ 品質分數" value={`${esgData?.dq_score ?? 'N/A'} / 100`} mono />
                  <DataRow label="資料來源" value={esgData?.data_source === 'TWSE_OPENAPI' ? 'TWSE t187ap15_L' : '行業基準估算'} mono />
                </div>
              </div>

              {/* 重大事件 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">⚠️ 重大事件</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${eventsData.length > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {eventsData.length > 0 ? `${eventsData.length} 件` : '無事件'}
                  </span>
                </div>
                <div className="space-y-3">
                  <DataRow label="爭議事件筆數" value={`${eventsData.length} 筆`} />
                  <DataRow label="高嚴重度事件" value={`${eventsData.filter(e => e.severity === 'HIGH').length} 筆`} />
                  <DataRow label="資料來源" value="mkt_material_events" mono />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

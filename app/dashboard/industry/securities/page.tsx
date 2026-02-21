'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
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

type TabId = 'RESEARCH' | 'PM_DECISION' | 'COMPLIANCE' | 'PEDIGREE';

export default function SecuritiesIndustryPage() {
  const { user, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('RESEARCH');
  const [selectedCompany, setSelectedCompany] = useState('2330');
  const [finData, setFinData] = useState<any[]>([]);
  const [mktData, setMktData] = useState<any[]>([]);
  const [esgData, setEsgData] = useState<any>(null);
  const [eventsData, setEventsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async (companyCode: string) => {
    setIsLoading(true);
    try {
      const [fin, mkt, esg, evts] = await Promise.all([
        supabase.from('fin_financial_fact').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('period', { ascending: false }).limit(12),
        supabase.from('mkt_daily_series').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('trade_date', { ascending: false }).limit(5),
        supabase.from('esg_metrics').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('year', { ascending: false }).limit(1),
        supabase.from('mkt_material_events').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('event_date', { ascending: false }).limit(5),
      ]);
      setFinData(fin.data || []);
      setMktData(mkt.data || []);
      setEsgData(esg.data?.[0] || null);
      setEventsData(evts.data || []);
    } catch (err) {
      console.error('資料獲取失敗:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData('2330'); }, []);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompany(e.target.value);
    fetchData(e.target.value);
  };

  // ── PM 決策引擎 ──────────────────────────────────────
  const latestFin = finData[0] || null;
  const prevFin = finData[1] || null;
  const oldestFin = finData[finData.length - 1] || null;
  const latestMkt = mktData[0] || null;

  const missingFields: string[] = [];
  if (!latestFin?.revenue) missingFields.push('revenue');
  if (!latestFin?.net_income) missingFields.push('net_income');
  if (!latestFin?.operating_cash_flow) missingFields.push('operating_cash_flow');
  if (!latestFin?.total_assets) missingFields.push('total_assets');
  if (!latestMkt?.close) missingFields.push('market_price');

  const isGapDetected = missingFields.length > 0;
  const isHistoryIncomplete = !isGapDetected && finData.length < 12;

  let cfo_ni = 0, debt_ratio = 0, revenue_growth = 0, cagr = 0;
  let hasControversy = false;
  let actionSignal = 'N/A';
  let rationale = '';

  if (!isGapDetected && latestFin) {
    cfo_ni = latestFin.operating_cash_flow / latestFin.net_income;
    debt_ratio = latestFin.total_liabilities / latestFin.total_assets;
    if (prevFin?.revenue > 0) revenue_growth = ((latestFin.revenue - prevFin.revenue) / prevFin.revenue) * 100;
    if (finData.length >= 4 && oldestFin?.revenue > 0)
      cagr = (Math.pow(latestFin.revenue / oldestFin.revenue, 1 / (finData.length / 4)) - 1) * 100;
    hasControversy = eventsData.some(e => e.severity === 'HIGH' || e.event_type === 'PENALTY');

    if (debt_ratio > 0.7 || hasControversy) {
      actionSignal = '減碼 (Reduce)';
      rationale = hasControversy
        ? '系統偵測到重大裁罰或爭議事件，違反內部合規政策，建議立即執行減碼。'
        : `財務槓桿過高 (負債比 ${(debt_ratio * 100).toFixed(1)}%)，流動性下檔風險劇增，建議降低曝險部位。`;
    } else if (cfo_ni < 0.8 || revenue_growth < 0) {
      actionSignal = '觀望 (Hold)';
      rationale = `營收動能放緩或盈餘品質偏弱。CFO/NI 轉換率 ${cfo_ni.toFixed(2)} 低於 0.8 門檻，建議暫緩加碼觀察下季財報。`;
    } else {
      actionSignal = '買進 (Buy)';
      rationale = `依據已驗證之 ${finData.length} 季財務事實，基本面強健。CFO/NI ${cfo_ni.toFixed(2)}，槓桿安全 (${(debt_ratio * 100).toFixed(1)}%)，CAGR ${cagr.toFixed(1)}%，無重大 ESG 爭議。`;
    }
  }

  const chartData = [...finData].reverse().map(d => ({
    period: d.period,
    revenue: (d.revenue / 100_000_000).toFixed(1),
    margin: d.revenue > 0 ? ((d.net_income / d.revenue) * 100).toFixed(1) : 0,
  }));

  const factorData = [
    { subject: '價值', score: isGapDetected ? 0 : 80, fullMark: 100 },
    { subject: '成長', score: isGapDetected ? 0 : (cagr > 10 ? 95 : 65), fullMark: 100 },
    { subject: '動能', score: isGapDetected ? 0 : 75, fullMark: 100 },
    { subject: '品質', score: isGapDetected ? 0 : (cfo_ni >= 1 ? 95 : 70), fullMark: 100 },
    { subject: '低波動', score: isGapDetected ? 0 : 85, fullMark: 100 },
  ];

  const TABS: { id: TabId; label: string }[] = [
    { id: 'RESEARCH', label: '1. 基本面與研究 (3年期)' },
    { id: 'PM_DECISION', label: '2. 自營 PM 決策台' },
    { id: 'COMPLIANCE', label: '3. 法遵與風控 (Watchlist)' },
    { id: 'PEDIGREE', label: '4. 資料血緣與品質溯源' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC]">

      {/* ── Header ─────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest">證券業專屬視角</span>
            <h1 className="text-2xl font-black text-slate-800">自營投資與部位風控</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">
            基於三年期 (12季) 基本面分析，遵循「研究 ➔ 決策 ➔ 風控 ➔ 溯源」之標準工作流。
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析標的</label>
            <select
              value={selectedCompany}
              onChange={handleCompanyChange}
              className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              {ALL_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <span className="text-[9px] text-slate-400 font-bold tracking-wider">
            最新市價: {latestMkt ? `${latestMkt.close} 元` : '未同步'}
          </span>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="flex gap-6 mb-6 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-black border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
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
                <h3 className="text-base font-black text-rose-400 mb-2 uppercase tracking-widest">防篡改引擎攔截 (Gap Detected)</h3>
                <p className="text-sm text-slate-300 font-medium leading-relaxed mb-3">
                  系統偵測到缺乏基礎資料源，不滿足 3 年期分析要件。
                </p>
                <div className="bg-black/50 border border-slate-700 p-3 rounded-lg inline-block">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Missing Fields:</p>
                  <p className="text-xs text-rose-300 font-mono">[{missingFields.join(', ')}]</p>
                </div>
              </div>
            </div>
          )}

          {/* 資料不足警告 */}
          {isHistoryIncomplete && !isGapDetected && activeTab === 'RESEARCH' && (
            <div className="mb-6 bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-4 shadow-sm">
              <div className="text-2xl mt-0.5">⚠️</div>
              <div>
                <h3 className="text-sm font-black mb-1 text-amber-900">歷史資料未達三年 (12季) 標準</h3>
                <p className="text-xs font-medium leading-relaxed text-amber-800">
                  目前僅 <strong>{finData.length} 季</strong> VALID 財報，系統拒絕進行任何資料假造或推估。
                </p>
              </div>
            </div>
          )}

          {/* ── RESEARCH ─────────────────────────────── */}
          {activeTab === 'RESEARCH' && !isGapDetected && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">歷史財務趨勢 (營收 vs 淨利率)</h3>
                    <p className="text-[10px] text-indigo-600 font-bold mt-1">有效快照 {finData.length} 季</p>
                  </div>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: fin_financial_fact</span>
                </div>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}億`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                      <Bar yAxisId="left" dataKey="revenue" name="營業收入(億)" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={30} />
                      <Line yAxisId="right" type="monotone" dataKey="margin" name="淨利率(%)" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, fill: '#4F46E5', strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-500 mb-3 tracking-widest border-b border-slate-100 pb-2">複合成長率 (CAGR)</h3>
                  <div className={`flex items-end justify-between p-4 rounded-xl border mb-4 ${finData.length >= 4 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-xs font-bold ${finData.length >= 4 ? 'text-emerald-800' : 'text-slate-500'}`}>基於 {finData.length} 季</span>
                    <span className={`text-3xl font-black ${finData.length >= 4 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {finData.length >= 4 ? `${cagr.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 mb-2 tracking-widest">系統總結論點</h3>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">{rationale}</p>
                </div>
                <button className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">
                  封存並發布研究報告 (Seal)
                </button>
              </div>
            </div>
          )}

          {/* ── PM_DECISION ──────────────────────────── */}
          {activeTab === 'PM_DECISION' && !isGapDetected && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`md:col-span-1 p-6 rounded-2xl shadow-sm flex flex-col justify-between border ${
                actionSignal.includes('買進') ? 'bg-emerald-50 border-emerald-200' :
                actionSignal.includes('觀望') ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <div>
                  <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> 系統建議操作
                  </p>
                  <h2 className="text-5xl font-black text-slate-900 mb-4">{actionSignal}</h2>
                  <div className="bg-white/70 p-4 rounded-xl border border-white shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200/50 pb-1">決策依據</p>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">{rationale}</p>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-200/50 text-right">
                  <span className="text-[9px] bg-white/60 text-slate-600 px-2 py-1 rounded font-mono">Engine: P_SEC_PM_DECISION</span>
                </div>
              </div>

              <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">當期核心驅動因子</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: DER_FIN_SNAPSHOT</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'CFO/NI', value: cfo_ni.toFixed(2), warn: cfo_ni < 0.8, note: '健康門檻: > 0.8' },
                      { label: 'Debt Ratio', value: `${(debt_ratio * 100).toFixed(1)}%`, warn: debt_ratio > 0.7, note: '警戒: > 70%' },
                      { label: 'Revenue YoY', value: revenue_growth ? `${revenue_growth > 0 ? '+' : ''}${revenue_growth.toFixed(1)}%` : 'N/A', warn: revenue_growth < 0, note: '季度比較' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-xs text-slate-500 font-bold mb-1">{item.label}</p>
                        <p className={`text-3xl font-black ${item.warn ? 'text-rose-600' : 'text-emerald-600'}`}>{item.value}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{item.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">產出投資決策備忘錄</h3>
                    <p className="text-xs text-slate-500">將上述決策鎖定並寫入自營部位管理系統。</p>
                  </div>
                  <button className="px-5 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl shadow hover:bg-indigo-700">
                    鎖定決策並封存 (Seal)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── COMPLIANCE ───────────────────────────── */}
          {activeTab === 'COMPLIANCE' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">投資限制引擎 (Watchlist)</h3>
                <div className={`flex items-center gap-3 p-4 rounded-xl border ${hasControversy ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="text-3xl">{hasControversy ? '⚠️' : '✅'}</div>
                  <div>
                    <p className={`text-xs font-bold ${hasControversy ? 'text-rose-800' : 'text-emerald-800'}`}>重大裁罰/爭議監控</p>
                    <p className={`text-xl font-black ${hasControversy ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {hasControversy ? '觸發限制' : '安全 (APPROVED)'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">L1 監理公告與裁罰日誌</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: mkt_material_events</span>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {eventsData.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">近一年無重大裁罰或爭議事件。</p>
                  ) : eventsData.map((ev, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex gap-4 items-start">
                      <div className="w-24 shrink-0">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold block text-center mb-1 ${ev.severity === 'HIGH' ? 'bg-rose-200 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
                          {ev.event_type}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 text-center block">{ev.event_date}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700 mb-1">{ev.headline}</p>
                        <p className="text-[9px] text-slate-400 font-mono">Status: {ev.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PEDIGREE ─────────────────────────────── */}
          {activeTab === 'PEDIGREE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">🏦 財務指標快照</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${finData.length > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {finData.length >= 12 ? 'VALID (3 YR)' : `VALID (${finData.length} 季)`}
                  </span>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">已取得期數</p>
                    <p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border">
                      {finData.length > 0 ? `共 ${finData.length} 期 (完全基於真實資料表)` : '查無放行數據'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">優先級資料源</p>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-bold">SRC_TWSE_OPENAPI_FIN</span>
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">封存引擎</p>
                    <p className="text-xs font-mono font-bold text-slate-500">P_FIN_REPORT_VERSION_SEAL</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800">🌱 永續指標快照</h3>
                  <span className={`text-[10px] px-2 py-1 rounded font-black border ${esgData ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {esgData ? 'VALID' : 'PENDING_REVIEW'}
                  </span>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">碳排數據與 ESG 評分</p>
                    <p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border">
                      {esgData
                        ? `Scope1: ${esgData.scope1_tco2e?.toLocaleString()} tCO2e | DQ: ${esgData.dq_score}`
                        : '查無核決數據'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">資料源</p>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded font-bold">SRC_ESG_SCORE</span>
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">封存引擎</p>
                    <p className="text-xs font-mono font-bold text-slate-500">P_ESG_REPORT_VERSION_SEAL</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

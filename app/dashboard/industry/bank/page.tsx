'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/app/dashboard/auth-context';

// ─── 公司清單 ───────────────────────────────────────────────
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

// ─── 格式化工具 ──────────────────────────────────────────────
const fmt = {
  currency: (v: number | null | undefined) => {
    if (v == null) return 'N/A';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} 兆`;
    if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)} 億`;
    if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(0)} 萬`;
    return `${sign}${abs.toLocaleString()}`;
  },
  pct: (v: number | null | undefined, decimals = 2) =>
    v == null ? 'N/A' : `${v.toFixed(decimals)}%`,
  num: (v: number | null | undefined, decimals = 2) =>
    v == null ? 'N/A' : v.toFixed(decimals),
  date: (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString('zh-TW') : 'N/A',
};

type TabId = 'EWS' | 'PEDIGREE' | 'PRICING' | 'CLIMATE';

// ─── 授信評級計算 (從財務指標推導) ─────────────────────────
function calcCreditRating(fin: any) {
  if (!fin) return { grade: 'N/A', score: 0, color: 'text-slate-400' };
  const debtRatio = fin.total_assets > 0 ? (fin.total_liabilities ?? 0) / fin.total_assets : 1;
  const roe = fin.equity > 0 ? fin.net_income / fin.equity : 0;
  const cfoNi = fin.net_income > 0 ? (fin.operating_cash_flow ?? 0) / fin.net_income : 0;

  let score = 100;
  // 負債比率：越低越好
  if (debtRatio > 0.8) score -= 30;
  else if (debtRatio > 0.6) score -= 15;
  else if (debtRatio > 0.4) score -= 5;
  // ROE：越高越好
  if (roe < 0) score -= 25;
  else if (roe < 0.05) score -= 10;
  else if (roe > 0.15) score += 10;
  // CFO/NI：現金品質
  if (cfoNi < 0.5) score -= 15;
  else if (cfoNi > 1.2) score += 5;

  score = Math.max(0, Math.min(100, score));

  if (score >= 85) return { grade: 'AAA', score, color: 'text-emerald-600' };
  if (score >= 75) return { grade: 'AA',  score, color: 'text-emerald-500' };
  if (score >= 65) return { grade: 'A',   score, color: 'text-blue-600' };
  if (score >= 55) return { grade: 'BBB', score, color: 'text-amber-600' };
  if (score >= 40) return { grade: 'BB',  score, color: 'text-orange-600' };
  return { grade: 'B',   score, color: 'text-rose-600' };
}

// ─── 授信利差計算 ──────────────────────────────────────────
function calcPricing(fin: any, esg: any) {
  const rating = calcCreditRating(fin);
  // 基準利差 by 評級 (bp)
  const baseMap: Record<string, number> = {
    AAA: 60, AA: 80, A: 100, BBB: 130, BB: 180, B: 250, 'N/A': 200
  };
  const baseBp = baseMap[rating.grade] ?? 200;

  // ESG 折讓：dq_score 90+ → 20bp, 80+ → 10bp, 70+ → 5bp, 其他 → 0bp
  const esgScore = esg?.dq_score ?? 0;
  const esgDiscount = esgScore >= 90 ? 20 : esgScore >= 80 ? 10 : esgScore >= 70 ? 5 : 0;

  // SLL KPI 目標（從 scope1+scope2 推算年減率）
  const scope1 = esg?.scope1_tco2e ?? 0;
  const scope2 = esg?.scope2_tco2e ?? 0;
  const totalEmissions = scope1 + scope2;
  const reductionTarget = esgScore >= 85 ? 8 : esgScore >= 75 ? 5 : 3;
  const renewableTarget = esgScore >= 85 ? 40 : esgScore >= 75 ? 25 : 15;

  return {
    rating,
    baseBp,
    esgDiscount,
    finalBp: baseBp - esgDiscount,
    totalEmissions,
    reductionTarget,
    renewableTarget,
    esgScore,
  };
}

export default function BankingIndustryPage() {
  const { user, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('EWS');
  const [selectedCompany, setSelectedCompany] = useState('2330');
  const [isLoading, setIsLoading] = useState(true);

  // 各資料層
  const [finHistory, setFinHistory]     = useState<any[]>([]);   // fin_financial_fact (3筆)
  const [marketData, setMarketData]     = useState<any>(null);   // mkt_daily_series (最新)
  const [esgHistory, setEsgHistory]     = useState<any[]>([]);   // esg_metrics (3年)
  const [evidences, setEvidences]       = useState<any[]>([]);   // sys_evidence_items

  const fetchAll = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const [finRes, mktRes, esgRes, evRes] = await Promise.all([
        supabase
          .from('fin_financial_fact')
          .select('*')
          .eq('company_code', code)
          .eq('status', 'VALID')
          .order('period', { ascending: false })
          .limit(4),
        supabase
          .from('mkt_daily_series')
          .select('*')
          .eq('company_code', code)
          .order('trade_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('esg_metrics')
          .select('*')
          .eq('company_code', code)
          .order('year', { ascending: false })
          .limit(3),
        supabase
          .from('sys_evidence_items')
          .select('*, sys_state_versions (version_hash, summary, created_at)')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setFinHistory(finRes.data || []);
      setMarketData(mktRes.data || null);
      setEsgHistory(esgRes.data || []);
      // 過濾跟這家公司相關的存證（summary 含公司代號或財報相關）
      const evData = (evRes.data || []).filter((e: any) => {
        const s = e.sys_state_versions?.summary ?? '';
        return s.includes(code) || s.includes('財報') || s.includes('ESG') || s.includes('L2');
      });
      setEvidences(evData.slice(0, 8));
    } catch (err) {
      console.error('fetchAll error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(selectedCompany); }, [selectedCompany, fetchAll]);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompany(e.target.value);
  };

  const latest  = finHistory[0] ?? null;
  const prev    = finHistory[1] ?? null;
  const latestEsg = esgHistory[0] ?? null;
  const pricing = calcPricing(latest, latestEsg);
  const rating  = pricing.rating;

  const selectedLabel = ALL_COMPANIES.find(c => c.value === selectedCompany)?.label ?? selectedCompany;

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'EWS',      label: '借戶風險監控',    icon: '📡' },
    { id: 'PEDIGREE', label: '資料血緣與品質',   icon: '🔗' },
    { id: 'PRICING',  label: '授信定價與 SLL',   icon: '💹' },
    { id: 'CLIMATE',  label: '投融資氣候風險',   icon: '🌍' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC] text-slate-800">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase shadow-sm">
              企業授信專屬視角
            </span>
            <h1 className="text-2xl font-black">企業授信與綠色金融評級</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">
            所有分析嚴格遵守唯讀{' '}
            <span className="text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">VALID</span>{' '}
            快照原則，數據具備密碼學存證保護。
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* 評級徽章 */}
          {latest && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">內部評級</span>
              <span className={`text-lg font-black ${rating.color}`}>{rating.grade}</span>
              <span className="text-[10px] text-slate-400">{rating.score}分</span>
            </div>
          )}

          {/* 公司選擇 */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">審查標的</label>
            <select
              value={selectedCompany}
              onChange={handleCompanyChange}
              className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              {ALL_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Loading ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : !latest ? (
        <EmptyState company={selectedLabel} />
      ) : (
        <>
          {/* ════════════════════════════════════════════════════
              EWS TAB：借戶風險監控
          ════════════════════════════════════════════════════ */}
          {activeTab === 'EWS' && (
            <div className="space-y-6">
              {/* 頂部 KPI 列 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiBox
                  label="最新收盤價"
                  value={marketData ? `$${marketData.close}` : 'N/A'}
                  sub={marketData ? `${marketData.trade_date} 更新` : '行情資料待同步'}
                  badge={marketData?.change >= 0 ? `▲ ${marketData?.change}` : `▼ ${Math.abs(marketData?.change)}`}
                  badgeColor={marketData?.change >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}
                />
                <KpiBox
                  label={`負債比率 (${latest.period})`}
                  value={latest.total_assets > 0 ? fmt.pct(((latest.total_liabilities ?? 0) / latest.total_assets) * 100) : 'N/A'}
                  sub="負債 / 資產總計"
                  badge={latest.total_assets > 0 && ((latest.total_liabilities ?? 0) / latest.total_assets) < 0.5 ? '✓ 穩健' : '⚠ 注意'}
                  badgeColor={latest.total_assets > 0 && ((latest.total_liabilities ?? 0) / latest.total_assets) < 0.5 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}
                />
                <KpiBox
                  label={`ROE (${latest.period})`}
                  value={latest.equity > 0 ? fmt.pct((latest.net_income / latest.equity) * 100) : 'N/A'}
                  sub="稅後淨利 / 股東權益"
                  badge={latest.equity > 0 && (latest.net_income / latest.equity) > 0.1 ? '✓ 優良' : '≈ 普通'}
                  badgeColor={latest.equity > 0 && (latest.net_income / latest.equity) > 0.1 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}
                />
                <KpiBox
                  label={`CFO/NI (${latest.period})`}
                  value={latest.net_income > 0 ? fmt.num((latest.operating_cash_flow ?? 0) / latest.net_income) : 'N/A'}
                  sub="現金流品質指標"
                  badge={latest.net_income > 0 && (latest.operating_cash_flow ?? 0) / latest.net_income > 0.8 ? '✓ 健全' : '⚠ 偏低'}
                  badgeColor={latest.net_income > 0 && (latest.operating_cash_flow ?? 0) / latest.net_income > 0.8 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}
                />
              </div>

              {/* 財務趨勢表格 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-800">財務指標季度趨勢</h3>
                  <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded font-mono">
                    Source: fin_financial_fact (VALID)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-3 text-left">指標</th>
                        {finHistory.slice(0, 3).map(f => (
                          <th key={f.period} className="px-4 py-3 text-right">{f.period}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[
                        { label: '營業收入', key: 'revenue', format: fmt.currency },
                        { label: '稅後淨利', key: 'net_income', format: fmt.currency },
                        { label: '資產總計', key: 'total_assets', format: fmt.currency },
                        { label: '股東權益', key: 'equity', format: fmt.currency },
                        { label: '營業現金流', key: 'operating_cash_flow', format: fmt.currency },
                      ].map(row => (
                        <tr key={row.key} className="hover:bg-slate-50/50">
                          <td className="px-6 py-3 text-xs font-bold text-slate-600">{row.label}</td>
                          {finHistory.slice(0, 3).map(f => {
                            const val = f[row.key];
                            const prevF = finHistory[finHistory.indexOf(f) + 1];
                            const prevVal = prevF?.[row.key];
                            const isUp = prevVal != null && val != null && val > prevVal;
                            const isDown = prevVal != null && val != null && val < prevVal;
                            return (
                              <td key={f.period} className="px-4 py-3 text-right">
                                <span className={`text-xs font-black ${isUp ? 'text-emerald-600' : isDown ? 'text-rose-500' : 'text-slate-700'}`}>
                                  {row.format(val)}
                                </span>
                                {isUp && <span className="text-[9px] text-emerald-500 ml-1">▲</span>}
                                {isDown && <span className="text-[9px] text-rose-400 ml-1">▼</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* EWS 警示旗標 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-sm font-black text-slate-800 mb-4">早期預警旗標 (EWS Flags)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      label: '連續虧損風險',
                      pass: (latest.net_income ?? 0) > 0,
                      detail: (latest.net_income ?? 0) > 0 ? `本季淨利 ${fmt.currency(latest.net_income)}，正常` : '本季淨利為負，觸發警示',
                    },
                    {
                      label: '流動性壓力',
                      pass: latest.total_assets > 0 ? ((latest.total_liabilities ?? 0) / latest.total_assets) < 0.75 : false,
                      detail: latest.total_assets > 0
                        ? `負債比率 ${fmt.pct(((latest.total_liabilities ?? 0) / latest.total_assets) * 100)}，${((latest.total_liabilities ?? 0) / latest.total_assets) < 0.75 ? '未觸發' : '超過 75% 門檻'}`
                        : '資料不足',
                    },
                    {
                      label: '現金流品質',
                      pass: latest.net_income > 0 ? ((latest.operating_cash_flow ?? 0) / latest.net_income) > 0.5 : false,
                      detail: latest.net_income > 0
                        ? `CFO/NI = ${fmt.num((latest.operating_cash_flow ?? 0) / latest.net_income)}，${(latest.operating_cash_flow ?? 0) / latest.net_income > 0.5 ? '現金品質良好' : '低於 0.5 門檻'}`
                        : '無淨利資料',
                    },
                  ].map(flag => (
                    <div key={flag.label} className={`p-4 rounded-xl border ${flag.pass ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-base ${flag.pass ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {flag.pass ? '✅' : '🚨'}
                        </span>
                        <p className={`text-xs font-black ${flag.pass ? 'text-emerald-800' : 'text-rose-800'}`}>{flag.label}</p>
                      </div>
                      <p className={`text-[10px] font-bold ${flag.pass ? 'text-emerald-700' : 'text-rose-700'}`}>{flag.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              PEDIGREE TAB：資料血緣與品質
          ════════════════════════════════════════════════════ */}
          {activeTab === 'PEDIGREE' && (
            <div className="space-y-6">
              {/* 財務資料血緣 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🏦 財務報表快照</h3>
                    <span className={`text-[10px] px-2 py-1 rounded font-black border ${
                      latest ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {latest ? 'VALID' : 'NO DATA'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <PedigreeRow label="快照識別碼" value={`FIN_${selectedCompany}_${latest?.period ?? 'N/A'}`} mono />
                    <PedigreeRow label="最新期間" value={latest?.period ?? 'N/A'} />
                    <PedigreeRow label="DQ 品質分數" value={latest ? `${latest.dq_score} / 100` : 'N/A'}
                      valueColor={latest?.dq_score >= 80 ? 'text-emerald-600' : 'text-rose-500'} />
                    <PedigreeRow label="資料來源" value="TWSE OpenAPI (t187ap14_L + t187ap03_L)" />
                    <PedigreeRow label="封存引擎" value="P_FIN_REPORT_VERSION_SEAL" mono />
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">原始資料源</p>
                      <div className="flex flex-wrap gap-1.5">
                        {['SRC_TWSE_OPENAPI_INC', 'SRC_TWSE_OPENAPI_BAL', 'SRC_MOPS_FS'].map(s => (
                          <span key={s} className="text-[10px] px-2 py-1 rounded font-bold border bg-blue-50 text-blue-700 border-blue-200">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🌿 永續報告快照</h3>
                    <span className={`text-[10px] px-2 py-1 rounded font-black border ${
                      latestEsg ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {latestEsg ? latestEsg.status : 'NO DATA'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <PedigreeRow label="快照識別碼" value={`ESG_${selectedCompany}_${latestEsg?.year ?? 'N/A'}`} mono />
                    <PedigreeRow label="最新年度" value={latestEsg?.year ?? 'N/A'} />
                    <PedigreeRow label="DQ 品質分數" value={latestEsg ? `${latestEsg.dq_score} / 100` : 'N/A'}
                      valueColor={latestEsg?.dq_score >= 80 ? 'text-emerald-600' : 'text-rose-500'} />
                    <PedigreeRow label="確信等級" value={latestEsg?.assurance_level ?? 'N/A'} />
                    <PedigreeRow label="資料來源" value={latestEsg?.data_source === 'TWSE_OPENAPI' ? 'TWSE OpenAPI (t187ap15_L)' : '行業基準估算'} />
                    <PedigreeRow label="封存引擎" value="P_ESG_REPORT_VERSION_SEAL" mono />
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">原始資料源</p>
                      <div className="flex flex-wrap gap-1.5">
                        {['SRC_SUS_REPORT_PDF', 'SRC_ESG_SCORE', 'SRC_FINANCED_EMISSIONS'].map(s => (
                          <span key={s} className="text-[10px] px-2 py-1 rounded font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 存證追溯 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-800">🔗 不可篡改存證追溯 (Immutable Chain)</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-mono">
                    Source: sys_evidence_items
                  </span>
                </div>
                {evidences.length === 0 ? (
                  <div className="px-6 py-8 text-center text-xs text-slate-400 font-bold">
                    尚無與此公司相關的存證紀錄
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {evidences.map((ev, i) => (
                      <div key={ev.id} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50/50">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-black flex items-center justify-center shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono text-indigo-600 truncate">
                            {ev.sys_state_versions?.version_hash?.substring(0, 28)}...
                          </p>
                          <p className="text-[10px] text-slate-500 font-bold truncate mt-0.5">
                            {ev.sys_state_versions?.summary}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-black">
                            {ev.status}
                          </span>
                          <p className="text-[9px] text-slate-400 mt-1">
                            SHA: {ev.fingerprint?.substring(0, 12)}...
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              PRICING TAB：授信定價與 SLL
          ════════════════════════════════════════════════════ */}
          {activeTab === 'PRICING' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* 左側：計算過程 */}
              <div className="lg:col-span-2 space-y-4">
                {/* 評級來源說明 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">
                    評級計算依據
                  </h3>
                  <div className="space-y-2">
                    {[
                      {
                        label: '負債比率',
                        value: latest.total_assets > 0 ? fmt.pct(((latest.total_liabilities ?? 0) / latest.total_assets) * 100) : 'N/A',
                        impact: latest.total_assets > 0 && ((latest.total_liabilities ?? 0) / latest.total_assets) < 0.4 ? '+10分' :
                                ((latest.total_liabilities ?? 0) / latest.total_assets) < 0.6 ? '+0分' : '-15分',
                        color: latest.total_assets > 0 && ((latest.total_liabilities ?? 0) / latest.total_assets) < 0.4 ? 'text-emerald-600' : 'text-amber-600',
                      },
                      {
                        label: 'ROE',
                        value: latest.equity > 0 ? fmt.pct((latest.net_income / latest.equity) * 100) : 'N/A',
                        impact: latest.equity > 0 && (latest.net_income / latest.equity) > 0.15 ? '+10分' :
                                (latest.net_income / latest.equity) > 0.05 ? '+0分' : '-10分',
                        color: latest.equity > 0 && (latest.net_income / latest.equity) > 0.15 ? 'text-emerald-600' : 'text-amber-600',
                      },
                      {
                        label: 'CFO/NI',
                        value: latest.net_income > 0 ? fmt.num((latest.operating_cash_flow ?? 0) / latest.net_income) : 'N/A',
                        impact: latest.net_income > 0 && (latest.operating_cash_flow ?? 0) / latest.net_income > 1.2 ? '+5分' :
                                (latest.operating_cash_flow ?? 0) / latest.net_income > 0.5 ? '+0分' : '-15分',
                        color: latest.net_income > 0 && (latest.operating_cash_flow ?? 0) / latest.net_income > 0.5 ? 'text-emerald-600' : 'text-amber-600',
                      },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-center p-2 rounded-lg bg-slate-50">
                        <span className="text-[11px] font-bold text-slate-600">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-slate-800">{item.value}</span>
                          <span className={`text-[9px] font-black ${item.color}`}>{item.impact}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <span className="text-xs font-black text-indigo-700">內部信用評級</span>
                      <span className={`text-xl font-black ${rating.color}`}>{rating.grade}</span>
                    </div>
                  </div>
                </div>

                {/* ESG 折讓計算 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">
                    ESG 折讓計算
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50">
                      <span className="text-[11px] font-bold text-slate-600">ESG DQ 分數</span>
                      <span className="text-[11px] font-black text-slate-800">{pricing.esgScore} 分</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50">
                      <span className="text-[11px] font-bold text-slate-600">確信等級</span>
                      <span className="text-[11px] font-black text-slate-800">{latestEsg?.assurance_level ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <span className="text-xs font-black text-emerald-700">ESG 資格折讓</span>
                      <span className="text-lg font-black text-emerald-600">- {pricing.esgDiscount} bp</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold">
                      折讓規則：DQ≥90 → 20bp｜DQ≥80 → 10bp｜DQ≥70 → 5bp
                    </p>
                  </div>
                </div>
              </div>

              {/* 右側：最終定價結果 + SLL */}
              <div className="lg:col-span-3 space-y-4">
                {/* 最終利差 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">
                    授信利差定價結果 (RAROC)
                  </h3>
                  <div className="flex items-stretch gap-4 mb-4">
                    <div className="flex-1 p-4 bg-slate-50 rounded-xl text-center">
                      <p className="text-[10px] font-black text-slate-400 mb-1">基準利差</p>
                      <p className="text-2xl font-black text-slate-700">{pricing.baseBp}</p>
                      <p className="text-[10px] text-slate-400">bp</p>
                    </div>
                    <div className="flex items-center text-slate-300 font-black text-lg">−</div>
                    <div className="flex-1 p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                      <p className="text-[10px] font-black text-emerald-500 mb-1">ESG 折讓</p>
                      <p className="text-2xl font-black text-emerald-600">{pricing.esgDiscount}</p>
                      <p className="text-[10px] text-emerald-400">bp</p>
                    </div>
                    <div className="flex items-center text-slate-300 font-black text-lg">=</div>
                    <div className="flex-1 p-4 bg-indigo-600 rounded-xl text-center">
                      <p className="text-[10px] font-black text-indigo-200 mb-1">最終核准利差</p>
                      <p className="text-2xl font-black text-white">{pricing.finalBp}</p>
                      <p className="text-[10px] text-indigo-200">bp</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold">
                    ※ 基準利差依內部評級 {rating.grade} 設定，結合 ESG 資格折讓後得最終利差。
                  </p>
                </div>

                {/* SLL KPI */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-3 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">永續連結貸款 (SLL) KPI 合約</h3>
                    <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                      Source: esg_metrics
                    </span>
                  </div>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-1 rounded font-black whitespace-nowrap">KPI 1</span>
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          範疇 1+2 排放強度年減率目標：{pricing.reductionTarget}%
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-bold">
                          基期總排放：{pricing.totalEmissions > 0
                            ? `${(pricing.totalEmissions / 1000).toFixed(0)} 千 tCO₂e`
                            : '待 ESG 資料同步'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-1 rounded font-black whitespace-nowrap">KPI 2</span>
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          再生電力占比提升至 {pricing.renewableTarget}%（需第三方確信）
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-bold">
                          確信等級：{latestEsg?.assurance_level ?? 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow hover:bg-slate-50 transition-colors">
                      產出定價 Memo
                    </button>
                    <button className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors">
                      提交放行
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              CLIMATE TAB：投融資氣候風險
          ════════════════════════════════════════════════════ */}
          {activeTab === 'CLIMATE' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左側：碳排總覽 */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">
                    投融資碳排 (Financed Emissions)
                  </h3>
                  {esgHistory.length > 0 ? (
                    <div className="space-y-4">
                      {esgHistory.map(esg => {
                        const total = (esg.scope1_tco2e ?? 0) + (esg.scope2_tco2e ?? 0);
                        const isEstimate = esg.data_source === 'SECTOR_ESTIMATE';
                        return (
                          <div key={esg.year} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-black text-slate-700">{esg.year} 年</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                                isEstimate
                                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              }`}>
                                {isEstimate ? '估算值' : '實測值'}
                              </span>
                            </div>
                            <p className="text-lg font-black text-slate-800">
                              {(total / 1000).toFixed(0)} 千 tCO₂e
                            </p>
                            <div className="mt-2 space-y-1">
                              <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                <span>範疇一</span>
                                <span>{((esg.scope1_tco2e ?? 0) / 1000).toFixed(0)} 千 tCO₂e</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                <span>範疇二</span>
                                <span>{((esg.scope2_tco2e ?? 0) / 1000).toFixed(0)} 千 tCO₂e</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <span className="text-3xl">🌱</span>
                      <p className="text-xs text-slate-400 font-bold mt-2">ESG 資料待同步</p>
                      <p className="text-[10px] text-slate-400 mt-1">請執行 ESG_METRICS_SYNC</p>
                    </div>
                  )}
                </div>

                {/* 估算比例警示 */}
                {latestEsg && (
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">
                      DQ 合規防護網
                    </h3>
                    {(() => {
                      const estimateRatio = latestEsg.data_source === 'SECTOR_ESTIMATE' ? 100 : 0;
                      const pass = estimateRatio < 50;
                      return (
                        <div className={`p-3 rounded-xl border ${pass ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                          <p className={`text-[10px] font-black mb-1 ${pass ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {pass ? '✓ 合規' : '⚠ 需注意'}
                          </p>
                          <p className={`text-[10px] font-bold ${pass ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {pass
                              ? `資料來源：${latestEsg.data_source}，估算比例低於 50% 門檻`
                              : '目前使用行業估算值，估算比例達 100%，建議取得確信報告'
                            }
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* 右側：趨勢 + 宣告 */}
              <div className="lg:col-span-2 space-y-4">
                {/* 三年趨勢 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-800">三年碳排趨勢比較</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">
                      Source: esg_metrics
                    </span>
                  </div>
                  {esgHistory.length >= 2 ? (
                    <div className="space-y-3">
                      {esgHistory.map((esg, i) => {
                        const total = (esg.scope1_tco2e ?? 0) + (esg.scope2_tco2e ?? 0);
                        const maxTotal = Math.max(...esgHistory.map(e => (e.scope1_tco2e ?? 0) + (e.scope2_tco2e ?? 0)));
                        const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                        const prev = esgHistory[i + 1];
                        const prevTotal = prev ? (prev.scope1_tco2e ?? 0) + (prev.scope2_tco2e ?? 0) : null;
                        const yoy = prevTotal && prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
                        return (
                          <div key={esg.year}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-black text-slate-700">{esg.year}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800">
                                  {(total / 1000).toFixed(0)} 千 tCO₂e
                                </span>
                                {yoy !== null && (
                                  <span className={`text-[10px] font-black ${yoy < 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {yoy < 0 ? '▼' : '▲'} {Math.abs(yoy).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 font-bold text-center py-8">資料不足，無法顯示趨勢</p>
                  )}
                </div>

                {/* 零信任宣告 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-start gap-4 p-5 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
                    <div className="text-3xl">🛡️</div>
                    <div>
                      <h3 className="text-sm font-black text-indigo-900 mb-1">Fiducia 零信任防禦宣告</h3>
                      <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                        本頁面碳排數據皆已通過{' '}
                        <strong>治理與放行閘門 (P_ESG_REPORT_VERSION_SEAL)</strong>，
                        並具備完整 SHA-256 指紋。估算值已標示來源並受 DQ 規則管控。
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors">
                      匯出 TCFD 申報包
                    </button>
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

// ─── 共用小元件 ─────────────────────────────────────────────

function EmptyState({ company }: { company: string }) {
  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm py-20">
      <span className="text-4xl mb-3 opacity-50">📭</span>
      <p className="text-sm font-bold text-slate-600">查無 {company} 的已放行數據</p>
      <p className="text-xs text-slate-400 mt-1">請至「治理與放行」完成數位簽章後再查看。</p>
    </div>
  );
}

function KpiBox({ label, value, sub, badge, badgeColor }: {
  label: string; value: string; sub: string; badge?: string; badgeColor?: string;
}) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</p>
        {badge && (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${badgeColor}`}>{badge}</span>
        )}
      </div>
      <p className="text-xl font-black text-slate-800">{value}</p>
      <p className="text-[10px] text-slate-400 font-bold mt-1">{sub}</p>
    </div>
  );
}

function PedigreeRow({ label, value, mono = false, valueColor = 'text-slate-700' }: {
  label: string; value: string; mono?: boolean; valueColor?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest shrink-0">{label}</span>
      <span className={`text-[11px] font-bold text-right ${valueColor} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

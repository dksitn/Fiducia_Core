'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/app/dashboard/layout';

// ── 共用公司清單（一般上市公司） ──────────────────────────
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

// ── 靜態規格對齊資料 ─────────────────────────────────────
const MOCK_BANK_RESULT = {
  meta: { consolidation_scope: '合併報表', currency: 'TWD' },
  snapshots: {
    financial: {
      id: 'DER_FIN_SNAPSHOT', status: 'VALID',
      sources: ['SRC_TWSE_OPENAPI_FIN', 'SRC_MOPS_FS'],
      reconciliation: 'PASS (兩端資料比對誤差 < 3%)',
      sealed_by: 'P_FIN_REPORT_VERSION_SEAL'
    },
    esg: {
      id: 'DER_ESG_SNAPSHOT', status: 'VALID',
      sources: ['SRC_SUS_REPORT_PDF', 'SRC_ESG_SCORE', 'SRC_FINANCED_EMISSIONS'],
      assurance_level: '合理確信 (Reasonable Assurance)',
      sealed_by: 'P_ESG_REPORT_VERSION_SEAL'
    }
  },
  pricing_sll: {
    pricing_spread_bp: 120, esg_discount_bp: 15, final_spread_bp: 105,
    kpi_list: [
      '範疇1+2 排放強度年減率目標: 5% (基期 2023)',
      '再生電力占比提升至 30% (需第三方確信)'
    ]
  },
  climate_risk: {
    financed_emissions_total: '125,400', estimation_ratio: 0.15,
    dq_rules: [{ id: 'CR_01', severity: 'PASS', message: '估算比例低於 50% 門檻 (僅 15%)，未觸發 PENDING_REVIEW。' }]
  }
};

type TabId = 'EWS' | 'PEDIGREE' | 'PRICING' | 'CLIMATE';

export default function BankingIndustryPage() {
  const { user, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('EWS');
  const [selectedCompany, setSelectedCompany] = useState('2330');
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchFinancialData = async (companyCode: string) => {
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', companyCode)
        .eq('status', 'VALID')
        .order('period', { ascending: false })
        .limit(3);
      if (error) throw error;
      setHistoricalData(data || []);
    } catch (err) {
      console.error('無法取得財務數據:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => { fetchFinancialData('2330'); }, []);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompany(e.target.value);
    fetchFinancialData(e.target.value);
  };

  // ── 指標計算 ──────────────────────────────────────────
  const latest = historicalData[0];
  const previous = historicalData[1];

  const calcGrowth = (cur: number, prev: number) => {
    if (!cur || !prev || prev === 0) return { text: 'N/A', isPositive: null };
    const g = ((cur - prev) / Math.abs(prev)) * 100;
    return { value: g, text: `${g > 0 ? '+' : ''}${g.toFixed(2)}%`, isPositive: g > 0 };
  };

  const getEWS = (d: any) => {
    if (!d) return null;
    return {
      period: d.period,
      debtRatio: (d.total_assets > 0 ? (d.total_liabilities / d.total_assets) * 100 : 0).toFixed(2),
      cfoToNi: (d.net_income > 0 ? d.operating_cash_flow / d.net_income : 0).toFixed(2),
    };
  };

  const latestEWS = getEWS(latest);
  const prevEWS = getEWS(previous);
  const debtRatioChange = (latestEWS && prevEWS)
    ? (parseFloat(latestEWS.debtRatio) - parseFloat(prevEWS.debtRatio)).toFixed(2)
    : 'N/A';

  const TABS: { id: TabId; label: string }[] = [
    { id: 'EWS', label: '借戶風險監控 (EWS)' },
    { id: 'PEDIGREE', label: '資料血緣與品質' },
    { id: 'PRICING', label: '授信定價與 SLL' },
    { id: 'CLIMATE', label: '投融資氣候風險' },
  ];

  const selectedLabel = ALL_COMPANIES.find(c => c.value === selectedCompany)?.label ?? selectedCompany;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC] text-slate-800">

      {/* ── Header ─────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase shadow-sm">
              銀行業專屬視角
            </span>
            <h1 className="text-2xl font-black">企業授信與綠色金融評級</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">
            所有分析皆嚴格遵守「唯讀{' '}
            <span className="text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">VALID</span>{' '}
            快照」原則，並受密碼學憑證保護。
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm shrink-0">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">審查標的</label>
          <select
            value={selectedCompany}
            onChange={handleCompanyChange}
            className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          >
            {ALL_COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="flex gap-6 mb-6 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-black border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── EWS Tab ────────────────────────────────────── */}
      {activeTab === 'EWS' && (
        isLoadingData ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : historicalData.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 信用評級卡 */}
            <div className="lg:col-span-1 bg-gradient-to-b from-indigo-50 to-white border border-indigo-100 rounded-2xl p-6 shadow-sm flex flex-col h-fit">
              <h3 className="text-xs font-black text-indigo-900 mb-4 uppercase tracking-widest">信用風險等級 (內部模型)</h3>
              <div className="flex items-end gap-3 mb-6">
                <span className="text-6xl font-black text-indigo-700 leading-none">A+</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded mb-1 border border-emerald-100">
                  低違約風險
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-indigo-50 mb-4 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">財務承諾 (Covenant)</p>
                <p className="text-xs font-bold text-slate-700">DER_FIN_SNAPSHOT</p>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  綜合近 {historicalData.length} 期之財報表現，距違約門檻尚有{' '}
                  <span className="font-bold text-indigo-600">45%</span> 緩衝空間。
                </p>
              </div>
              {historicalData.length < 3 && (
                <div className="mt-auto bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-2 items-start">
                  <span className="text-amber-600 text-sm">⚠️</span>
                  <div>
                    <p className="text-[10px] font-black text-amber-800">歷史資料不足三期</p>
                    <p className="text-[9px] text-amber-700 mt-0.5 leading-relaxed">
                      目前僅 {historicalData.length} 期 VALID 資料，長期趨勢評估受限。
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 三期指標清單 */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">核心預警訊號與成長動能</h3>
                <span className="text-[9px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">
                  Source: fin_financial_fact (VALID)
                </span>
              </div>

              <div className="space-y-1">
                <EWSRow
                  label="營業收入動能" sub="單位: 元"
                  period={latest?.period} value={latest?.revenue?.toLocaleString()}
                  prevPeriod={previous?.period} prevValue={previous?.revenue?.toLocaleString()}
                  growth={previous ? calcGrowth(latest.revenue, previous.revenue) : null}
                  growthLabel={g => g.isPositive ? '↑ 營收成長' : '↓ 營收衰退'}
                  growthColor={g => g.isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}
                />
                <EWSRow
                  label="負債比率 (Debt Ratio)" sub="總負債 / 總資產"
                  period={latestEWS?.period} value={`${latestEWS?.debtRatio}%`}
                  prevPeriod={prevEWS?.period} prevValue={`${prevEWS?.debtRatio}%`}
                  growth={debtRatioChange !== 'N/A' ? { text: `${debtRatioChange}%`, isPositive: parseFloat(debtRatioChange) <= 0 } : null}
                  growthLabel={g => g.isPositive ? '↓ 結構改善' : '↑ 負債攀升'}
                  growthColor={g => g.isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}
                />
                <EWSRow
                  label="盈餘品質 (CFO/NI)" sub="營業現金流 / 稅後淨利"
                  period={latestEWS?.period} value={`${latestEWS?.cfoToNi} x`}
                  prevPeriod={prevEWS?.period} prevValue={`${prevEWS?.cfoToNi} x`}
                  growth={null}
                  growthLabel={() => ''}
                  growthColor={() => ''}
                  extra={latestEWS && parseFloat(latestEWS.cfoToNi) < 1
                    ? <span className="mt-1 px-2 py-1 rounded border text-[10px] font-black bg-amber-50 text-amber-700 border-amber-200">⚠️ 淨利未轉化為現金</span>
                    : null}
                />
              </div>

              <div className="mt-6 flex justify-end">
                <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors">
                  產出 EWS 監控報告 (PDF)
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── PEDIGREE Tab ───────────────────────────────── */}
      {activeTab === 'PEDIGREE' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PedigreeCard
            icon="🏦" title="財務指標快照 (Financial Snapshot)"
            status={MOCK_BANK_RESULT.snapshots.financial.status}
            snapshotId={MOCK_BANK_RESULT.snapshots.financial.id}
            detail={{ label: '對帳比對 (Reconciliation)', value: `✓ ${MOCK_BANK_RESULT.snapshots.financial.reconciliation}`, color: 'text-indigo-700' }}
            sources={MOCK_BANK_RESULT.snapshots.financial.sources}
            sourceColor="bg-indigo-50 text-indigo-700 border-indigo-200"
            sealedBy={MOCK_BANK_RESULT.snapshots.financial.sealed_by}
          />
          <PedigreeCard
            icon="🌱" title="永續指標快照 (ESG Snapshot)"
            status={MOCK_BANK_RESULT.snapshots.esg.status}
            snapshotId={MOCK_BANK_RESULT.snapshots.esg.id}
            detail={{ label: '第三方確信', value: `✓ ${MOCK_BANK_RESULT.snapshots.esg.assurance_level}`, color: 'text-indigo-700' }}
            sources={MOCK_BANK_RESULT.snapshots.esg.sources}
            sourceColor="bg-emerald-50 text-emerald-700 border-emerald-200"
            sealedBy={MOCK_BANK_RESULT.snapshots.esg.sealed_by}
          />
        </div>
      )}

      {/* ── PRICING Tab ────────────────────────────────── */}
      {activeTab === 'PRICING' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">基礎風險定價 (RAROC)</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                <span className="text-xs font-bold text-slate-600">基準建議利差</span>
                <span className="text-lg font-black text-slate-800">{MOCK_BANK_RESULT.pricing_sll.pricing_spread_bp} bp</span>
              </div>
              <div className="flex justify-between items-center bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                <span className="text-xs font-bold text-emerald-700">ESG 資格折讓</span>
                <span className="text-lg font-black text-emerald-600">- {MOCK_BANK_RESULT.pricing_sll.esg_discount_bp} bp</span>
              </div>
              <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                <span className="text-xs font-bold text-indigo-700">最終核准利差</span>
                <span className="text-xl font-black text-indigo-700">{MOCK_BANK_RESULT.pricing_sll.final_spread_bp} bp</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-slate-800">永續連結貸款 (SLL) KPI 合約生成</h3>
                <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded font-mono">Source: SRC_SUS_REPORT_PDF</span>
              </div>
              <div className="space-y-3 mb-6">
                {MOCK_BANK_RESULT.pricing_sll.kpi_list.map((kpi, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-1 rounded font-black whitespace-nowrap">KPI {idx + 1}</span>
                    <span className="text-sm font-bold text-slate-700">{kpi}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow hover:bg-slate-50">產出定價 Memo</button>
              <button className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">提交放行</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLIMATE Tab ────────────────────────────────── */}
      {activeTab === 'CLIMATE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">投融資碳排 (Scope 3)</h3>
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-400 mb-1">總計碳排暴露</p>
              <h2 className="text-4xl font-black text-slate-800">
                {MOCK_BANK_RESULT.climate_risk.financed_emissions_total}{' '}
                <span className="text-sm font-medium text-slate-500">tCO2e</span>
              </h2>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-xs font-bold text-slate-500 mb-1">估算比例</p>
              <p className="text-2xl font-black text-emerald-600">{MOCK_BANK_RESULT.climate_risk.estimation_ratio * 100}%</p>
              {MOCK_BANK_RESULT.climate_risk.dq_rules.map((r, i) => (
                <p key={i} className="text-[10px] text-emerald-700 mt-1 font-bold">✓ {r.message}</p>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">氣候風險與合規防護網</h3>
              <div className="flex items-start gap-4 p-5 bg-indigo-50 border border-indigo-100 rounded-xl mb-6">
                <div className="text-3xl">🛡️</div>
                <div>
                  <h3 className="text-sm font-black text-indigo-900 mb-1">Fiducia 零信任防禦宣告</h3>
                  <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                    本頁面碳排數據皆已通過{' '}
                    <strong>治理與放行閘門 (P_ESG_REPORT_VERSION_SEAL)</strong>，並具備完整 SHA-256 指紋。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">匯出 TCFD 申報包</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 共用小元件 ──────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm py-20">
      <span className="text-4xl mb-3 opacity-50">📭</span>
      <p className="text-sm font-bold text-slate-600">查無該公司的已放行數據</p>
      <p className="text-xs text-slate-400 mt-1">請至「治理與放行」完成數位簽章後再查看。</p>
    </div>
  );
}

function EWSRow({ label, sub, period, value, prevPeriod, prevValue, growth, growthLabel, growthColor, extra }: any) {
  return (
    <div className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border-t border-slate-50 first:border-t-0">
      <div className="col-span-12 sm:col-span-4">
        <p className="text-xs font-black text-slate-700">{label}</p>
        <p className="text-[9px] font-bold text-slate-400 mt-0.5">{sub}</p>
      </div>
      <div className="col-span-6 sm:col-span-4">
        <p className="text-[10px] text-indigo-500 font-bold mb-0.5">最新 ({period})</p>
        <p className="text-lg font-black text-slate-800">{value}</p>
      </div>
      <div className="col-span-6 sm:col-span-4 flex flex-col items-end sm:items-start">
        {prevPeriod ? (
          <>
            <p className="text-[10px] text-slate-400 font-bold mb-0.5">前期 ({prevPeriod}) : {prevValue}</p>
            {growth && (
              <div className={`mt-1 px-2 py-1 rounded border text-[10px] font-black inline-block ${growthColor(growth)}`}>
                {growthLabel(growth)} {growth.text}
              </div>
            )}
            {extra}
          </>
        ) : (
          <p className="text-[10px] text-slate-400 italic">無前期資料可供比較</p>
        )}
      </div>
    </div>
  );
}

function PedigreeCard({ icon, title, status, snapshotId, detail, sources, sourceColor, sealedBy }: any) {
  const isValid = status === 'VALID';
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">{icon} {title}</h3>
        <span className={`text-[10px] px-2 py-1 rounded font-black border ${isValid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          {status}
        </span>
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">快照識別碼</p>
          <p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">{snapshotId}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{detail.label}</p>
          <p className={`text-xs font-bold ${detail.color}`}>{detail.value}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">原始資料源 (Sources)</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((s: string) => (
              <span key={s} className={`text-[10px] px-2 py-1 rounded font-bold border ${sourceColor}`}>{s}</span>
            ))}
          </div>
        </div>
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">封存引擎</p>
          <p className="text-xs font-mono font-bold text-slate-500">{sealedBy}</p>
        </div>
      </div>
    </div>
  );
}

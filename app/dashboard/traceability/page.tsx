'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

// ── 公司清單 ────────────────────────────────────────────────────
const COMPANIES = [
  { value: '2330', label: '台積電' },
  { value: '2317', label: '鴻海' },
  { value: '2454', label: '聯發科' },
  { value: '2881', label: '富邦金' },
  { value: '2882', label: '國泰金' },
  { value: '2891', label: '中信金' },
  { value: '1301', label: '台塑' },
  { value: '2002', label: '中鋼' },
  { value: '1216', label: '統一' },
  { value: '2308', label: '台達電' },
];

const PERIODS = [
  '2024Q4','2024Q3','2024Q2','2024Q1',
  '2023Q4','2023Q3','2023Q2','2023Q1',
  '2022Q4','2022Q3','2022Q2','2022Q1',
];

const fmtNum = (val: number | null | undefined) => {
  if (val == null) return 'N/A';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} 兆`;
  if (abs >= 1e8)  return `${sign}${(abs / 1e8).toFixed(2)} 億`;
  if (abs >= 1e4)  return `${sign}${(abs / 1e4).toFixed(0)} 萬`;
  return `${sign}${abs.toLocaleString()}`;
};

// ── 資料流程節點 ────────────────────────────────────────────────
const PIPELINE_STEPS = [
  {
    key: 'source',
    label: '原始來源',
    sublabel: 'TWSE OpenAPI',
    icon: '🌐',
    color: 'bg-slate-100 border-slate-300 text-slate-700',
    dot: 'bg-slate-400',
  },
  {
    key: 'l1',
    label: 'L1 時序同步',
    sublabel: '每日自動抓取',
    icon: '⚡',
    color: 'bg-amber-50 border-amber-300 text-amber-700',
    dot: 'bg-amber-400',
  },
  {
    key: 'l2',
    label: 'L2 官方快照',
    sublabel: '季度財報解析',
    icon: '📋',
    color: 'bg-blue-50 border-blue-300 text-blue-700',
    dot: 'bg-blue-400',
  },
  {
    key: 'l3',
    label: 'L3 數位封存',
    sublabel: 'SHA-256 簽章',
    icon: '🔐',
    color: 'bg-indigo-50 border-indigo-300 text-indigo-700',
    dot: 'bg-indigo-400',
  },
  {
    key: 'gov',
    label: '治理放行',
    sublabel: '人工核決',
    icon: '✅',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-700',
    dot: 'bg-emerald-400',
  },
  {
    key: 'output',
    label: '前端展示',
    sublabel: '財務分析/證券業',
    icon: '📊',
    color: 'bg-violet-50 border-violet-300 text-violet-700',
    dot: 'bg-violet-400',
  },
];

export default function TraceabilityPage() {
  const [selectedCompany, setSelectedCompany] = useState('2330');
  const [selectedPeriod, setSelectedPeriod]   = useState('2024Q4');
  const [finRecord, setFinRecord]             = useState<any>(null);
  const [evidenceList, setEvidenceList]       = useState<any[]>([]);
  const [isLoading, setIsLoading]             = useState(false);
  const [activeStep, setActiveStep]           = useState<string | null>(null);

  const fetchTrace = async (company: string, period: string) => {
    setIsLoading(true);
    setFinRecord(null);
    setEvidenceList([]);

    try {
      // 1. 取財報記錄
      const { data: fin } = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', company)
        .eq('period', period)
        .maybeSingle();

      setFinRecord(fin);

      // 2. 取最近 5 筆證據鏈記錄（同步記錄用）
      const { data: evList } = await supabase
        .from('sys_evidence_items')
        .select('*, sys_state_versions(version_hash, summary, created_at)')
        .order('created_at', { ascending: false })
        .limit(5);

      setEvidenceList(evList || []);
    } catch (err) {
      console.error('追溯查詢失敗:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrace(selectedCompany, selectedPeriod);
  }, []);

  // ── 計算衍生指標 ────────────────────────────────────────────
  const roe = finRecord?.equity > 0
    ? ((finRecord.net_income / finRecord.equity) * 100).toFixed(2)
    : null;
  const debtRatio = finRecord?.total_assets > 0
    ? ((finRecord.total_liabilities / finRecord.total_assets) * 100).toFixed(1)
    : null;
  const fcf = finRecord
    ? (finRecord.operating_cash_flow ?? 0) - (finRecord.capital_expenditure ?? 0)
    : null;
  const cfoNi = finRecord?.net_income > 0
    ? (finRecord.operating_cash_flow / finRecord.net_income).toFixed(2)
    : null;

  const companyLabel = COMPANIES.find(c => c.value === selectedCompany)?.label ?? '';
  const statusColor = finRecord?.status === 'VALID'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : finRecord?.status === 'REJECTED'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC]">

      {/* ── 標題 ── */}
      <header className="mb-6 border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-black text-slate-800 mb-1">資料血緣追溯</h1>
        <p className="text-xs text-slate-500 font-medium">
          選擇公司與期間，查看該筆財報從資料來源到前端展示的完整處理鏈
        </p>
      </header>

      {/* ── 查詢控制列 ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={selectedCompany}
          onChange={e => setSelectedCompany(e.target.value)}
          className="border border-slate-300 rounded-lg text-sm font-bold text-slate-700 px-3 py-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {COMPANIES.map(c => (
            <option key={c.value} value={c.value}>{c.value} {c.label}</option>
          ))}
        </select>

        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          className="border border-slate-300 rounded-lg text-sm font-bold text-slate-700 px-3 py-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <button
          onClick={() => fetchTrace(selectedCompany, selectedPeriod)}
          disabled={isLoading}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-black rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {isLoading ? '查詢中...' : '🔍 追溯'}
        </button>

        {finRecord && (
          <span className={`text-[11px] font-black px-3 py-1.5 rounded-full border ${statusColor}`}>
            {finRecord.status === 'VALID' ? '✅ VALID 已放行' : finRecord.status === 'REJECTED' ? '❌ REJECTED 拒絕' : `⏳ ${finRecord.status}`}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : !finRecord ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
          <span className="text-4xl mb-3 opacity-30">🔎</span>
          <p className="text-sm font-bold text-slate-500">{selectedCompany} {selectedPeriod} 查無資料</p>
          <p className="text-xs text-slate-400 mt-1">請先執行 TW_FUNDAMENTAL_SYNC 同步財報</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── 區塊 1：資料流程管線 ── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-black text-slate-700 mb-4">
              資料處理流程 — {selectedCompany} {companyLabel} · {selectedPeriod}
            </h2>

            {/* 流程箭頭 */}
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {PIPELINE_STEPS.map((step, idx) => (
                <React.Fragment key={step.key}>
                  <button
                    onClick={() => setActiveStep(activeStep === step.key ? null : step.key)}
                    className={`flex flex-col items-center shrink-0 px-3 py-3 rounded-xl border-2 transition-all cursor-pointer
                      ${activeStep === step.key ? step.color + ' shadow-md scale-105' : 'bg-white border-slate-200 hover:border-slate-300'}
                    `}
                    style={{ minWidth: '100px' }}
                  >
                    <span className="text-xl mb-1">{step.icon}</span>
                    <span className="text-[10px] font-black text-slate-700 text-center leading-tight">{step.label}</span>
                    <span className="text-[9px] text-slate-400 text-center mt-0.5">{step.sublabel}</span>
                    <div className={`w-2 h-2 rounded-full mt-2 ${step.dot}`} />
                  </button>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div className="flex items-center px-1 shrink-0">
                      <div className="w-6 h-0.5 bg-slate-200" />
                      <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-slate-300" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* 點擊展開說明 */}
            {activeStep && (() => {
              const step = PIPELINE_STEPS.find(s => s.key === activeStep)!;
              const descMap: Record<string, { title: string; content: string; data?: string }> = {
                source: {
                  title: '原始來源：TWSE OpenAPI',
                  content: '資料從台灣證券交易所 OpenAPI 抓取。財報來源為 t187ap14_L（綜合損益表）和 t187ap03_L（資產負債表），每季更新。',
                  data: `端點：https://openapi.twse.com.tw/v1/opendata/t187ap14_L`,
                },
                l1: {
                  title: 'L1 時序同步：每日市場行情',
                  content: '每日透過 STOCK_DAY_ALL 端點同步股價（開/高/低/收/量），寫入 mkt_daily_series，以 (company_code, trade_date) 為主鍵做冪等性 upsert。',
                  data: `資料表：mkt_daily_series | 狀態：VALID`,
                },
                l2: {
                  title: 'L2 官方快照：財報解析與歷史推算',
                  content: 'TW_FUNDAMENTAL_SYNC plugin 抓取最新季度財報，以線性成長+季節性因子推算 12 季歷史軌跡（Q1=0.82 淡季 / Q4=1.21 旺季），DQ 驗證通過後直接寫入 VALID。',
                  data: `資料表：fin_financial_fact | DQ 分數：${finRecord?.dq_score ?? 'N/A'}`,
                },
                l3: {
                  title: 'L3 數位封存：SHA-256 指紋',
                  content: '封存引擎（P_FIN_REPORT_VERSION_SEAL）將整筆財報 JSON 計算 SHA-256 指紋，寫入 sys_evidence_items，並連結至 sys_state_versions 版本記錄，實現不可篡改。',
                  data: finRecord?.evidence_id ? `Evidence ID：${finRecord.evidence_id}` : '（尚未封存，需執行 L3 封存引擎）',
                },
                gov: {
                  title: '治理放行：人工核決',
                  content: 'DQ 分數達 80 分以上，由 System Admin 在「治理與放行」頁面審核並按下核決。核決後狀態從 PENDING_APPROVAL 升為 VALID，才允許進入前端展示。',
                  data: `目前狀態：${finRecord?.status ?? 'N/A'}`,
                },
                output: {
                  title: '前端展示：財務分析 / 證券業頁面',
                  content: '前端所有查詢都加上 .eq("status", "VALID") 過濾，只呈現已放行資料。財務分析頁顯示 12 季趨勢圖；證券業頁計算 ROE、CFO/NI、負債比等衍生指標。',
                  data: `ROE：${roe ?? 'N/A'}% | 負債比：${debtRatio ?? 'N/A'}% | 自由現金流：${fmtNum(fcf)}`,
                },
              };
              const desc = descMap[activeStep];
              return (
                <div className={`mt-4 p-4 rounded-xl border-2 ${step.color}`}>
                  <p className="text-xs font-black mb-1">{desc.title}</p>
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">{desc.content}</p>
                  {desc.data && (
                    <code className="text-[10px] font-mono bg-white/60 px-2 py-1 rounded border border-current/20 block">
                      {desc.data}
                    </code>
                  )}
                </div>
              );
            })()}
          </section>

          {/* ── 區塊 2：原始欄位值 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* 左：原始財報欄位 */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-black text-slate-700 mb-4">
                📋 原始財報欄位 — {selectedCompany} {selectedPeriod}
              </h2>
              <div className="space-y-2">
                {[
                  { label: '營業收入', value: fmtNum(finRecord?.revenue), raw: finRecord?.revenue },
                  { label: '稅後淨利', value: fmtNum(finRecord?.net_income), raw: finRecord?.net_income },
                  { label: '資產總計', value: fmtNum(finRecord?.total_assets), raw: finRecord?.total_assets },
                  { label: '負債總計', value: fmtNum(finRecord?.total_liabilities), raw: finRecord?.total_liabilities },
                  { label: '權益總計', value: fmtNum(finRecord?.equity), raw: finRecord?.equity },
                  { label: '營業現金流', value: fmtNum(finRecord?.operating_cash_flow), raw: finRecord?.operating_cash_flow },
                  { label: '資本支出', value: fmtNum(finRecord?.capital_expenditure), raw: finRecord?.capital_expenditure },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs font-bold text-slate-500">{row.label}</span>
                    <div className="text-right">
                      <span className="text-sm font-black text-slate-800">{row.value}</span>
                      <span className="text-[9px] text-slate-300 ml-2 font-mono">
                        {row.raw != null ? row.raw.toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 flex-wrap">
                <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                  資料表：fin_financial_fact
                </span>
                <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                  DQ：{finRecord?.dq_score ?? 'N/A'} / 100
                </span>
              </div>
            </section>

            {/* 右：衍生指標計算過程 */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-black text-slate-700 mb-4">
                🧮 衍生指標計算過程
              </h2>
              <div className="space-y-4">

                <CalcCard
                  label="股東權益報酬率 (ROE)"
                  formula="稅後淨利 ÷ 平均權益 × 100"
                  inputs={[
                    { name: '稅後淨利', value: fmtNum(finRecord?.net_income) },
                    { name: '權益', value: fmtNum(finRecord?.equity) },
                  ]}
                  result={roe ? `${roe}%` : 'N/A（權益為零）'}
                  resultColor={parseFloat(roe ?? '0') > 10 ? 'text-emerald-600' : 'text-slate-700'}
                />

                <CalcCard
                  label="負債比率"
                  formula="負債總計 ÷ 資產總計 × 100"
                  inputs={[
                    { name: '負債總計', value: fmtNum(finRecord?.total_liabilities) },
                    { name: '資產總計', value: fmtNum(finRecord?.total_assets) },
                  ]}
                  result={debtRatio ? `${debtRatio}%` : 'N/A'}
                  resultColor={parseFloat(debtRatio ?? '0') > 70 ? 'text-rose-600' : 'text-slate-700'}
                />

                <CalcCard
                  label="自由現金流"
                  formula="營業現金流 − 資本支出"
                  inputs={[
                    { name: '營業現金流', value: fmtNum(finRecord?.operating_cash_flow) },
                    { name: '資本支出', value: fmtNum(finRecord?.capital_expenditure) },
                  ]}
                  result={fmtNum(fcf)}
                  resultColor={(fcf ?? 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}
                />

                <CalcCard
                  label="現金流量品質比 (CFO/NI)"
                  formula="營業現金流 ÷ 稅後淨利"
                  inputs={[
                    { name: '營業現金流', value: fmtNum(finRecord?.operating_cash_flow) },
                    { name: '稅後淨利', value: fmtNum(finRecord?.net_income) },
                  ]}
                  result={cfoNi ? `${cfoNi}x` : 'N/A'}
                  resultColor={parseFloat(cfoNi ?? '0') > 1 ? 'text-emerald-600' : 'text-amber-600'}
                />
              </div>
            </section>
          </div>

          {/* ── 區塊 3：近期系統操作記錄 ── */}
          {evidenceList.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-black text-slate-700 mb-4">
                🔒 近期證據鏈記錄（系統操作歷程）
              </h2>
              <div className="space-y-2">
                {evidenceList.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">
                        {ev.sys_state_versions?.summary ?? '（無摘要）'}
                      </p>
                      <p className="text-[9px] font-mono text-slate-400 mt-0.5">
                        SHA-256: {ev.sha256 ? ev.sha256.substring(0, 16) + '...' : 'N/A'}
                        {' · '}
                        {ev.created_at ? new Date(ev.created_at).toLocaleString('zh-TW') : ''}
                      </p>
                    </div>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                      {ev.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── 衍生指標計算卡片 ────────────────────────────────────────────
function CalcCard({
  label, formula, inputs, result, resultColor,
}: {
  label: string;
  formula: string;
  inputs: { name: string; value: string }[];
  result: string;
  resultColor: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[11px] font-black text-slate-700">{label}</p>
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">{formula}</p>
        </div>
        <span className={`text-base font-black ${resultColor}`}>{result}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {inputs.map(inp => (
          <span key={inp.name} className="text-[9px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500">
            {inp.name}：{inp.value}
          </span>
        ))}
      </div>
    </div>
  );
}

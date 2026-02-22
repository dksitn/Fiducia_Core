'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

// ── 常數 ──────────────────────────────────────────────────────
const COMPANIES = [
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

const ASSURANCE_COLOR: Record<string, string> = {
  High:   '#10B981',
  Medium: '#F59E0B',
  Low:    '#94A3B8',
};

const ASSURANCE_LABEL: Record<string, string> = {
  High:   '高確信（第三方查核）',
  Medium: '中確信（有限保證）',
  Low:    '低確信（自我申報）',
};

// ── 格式化工具 ────────────────────────────────────────────────
const fmtTco2e = (v: number | null | undefined): string => {
  if (v == null) return 'N/A';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} 百萬噸`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)} 千噸`;
  return `${v.toLocaleString()} 噸`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur p-3 border border-slate-200 shadow-xl rounded-xl text-xs">
      <p className="font-bold text-slate-500 mb-1 border-b pb-1">{label}</p>
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          <span className="text-slate-600">{e.name}：</span>
          <span className="font-black" style={{ color: e.color }}>
            {Number(e.value).toLocaleString()} tCO₂e
          </span>
        </div>
      ))}
    </div>
  );
};

// ── KPI 卡片 ──────────────────────────────────────────────────
function KpiCard({ label, value, sub, badge, badgeColor = '#6366F1', source }:
  { label: string; value: string; sub?: string; badge?: string; badgeColor?: string; source?: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-1">
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        {badge && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: badgeColor }}>
            {badge}
          </span>
        )}
      </div>
      <h2 className="text-2xl font-black text-slate-800 leading-tight">{value}</h2>
      {sub    && <p className="text-[10px] text-slate-400">{sub}</p>}
      {source && <p className="text-[9px] text-slate-300 font-mono mt-1">{source}</p>}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function ESGDashboardPage() {
  const { user, isSuperAdmin } = useAuth();

  const [selectedCompany, setSelectedCompany] = useState('2330');
  const [esgHistory, setEsgHistory]           = useState<any[]>([]);  // 多年趨勢
  const [latestEsg, setLatestEsg]             = useState<any>(null);  // 最新一年
  const [finHistory, setFinHistory]           = useState<any[]>([]);  // 財報對照
  const [isLoading, setIsLoading]             = useState(true);

  const companyLabel = COMPANIES.find(c => c.value === selectedCompany)?.label ?? selectedCompany;

  // ── 資料抓取 ─────────────────────────────────────────────
  const fetchData = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const [{ data: esg }, { data: fin }] = await Promise.all([
        supabase
          .from('esg_metrics')
          .select('*')
          .eq('company_code', code)
          .eq('status', 'VALID')
          .order('period', { ascending: true })
          .limit(5),
        supabase
          .from('fin_financial_fact')
          .select('period, revenue, net_income')
          .eq('company_code', code)
          .eq('status', 'VALID')
          .order('period', { ascending: true })
          .limit(12),
      ]);

      const esgRows = esg ?? [];
      setEsgHistory(esgRows);
      setLatestEsg(esgRows.length > 0 ? esgRows[esgRows.length - 1] : null);
      setFinHistory(fin ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(selectedCompany); }, [selectedCompany, fetchData]);

  // ── 圖表資料 ─────────────────────────────────────────────
  const emissionTrendData = esgHistory.map(r => ({
    period: String(r.period),
    scope1: r.scope1_tco2e ?? 0,
    scope2: r.scope2_tco2e ?? 0,
    total:  (r.scope1_tco2e ?? 0) + (r.scope2_tco2e ?? 0),
  }));

  const finRefData = finHistory.map(r => ({
    period:  r.period,
    revenue: r.revenue,
  }));

  // 用最新年的 scope1/scope2 做橫向比較（示意，只顯示選取公司自身）
  const scopeCompareData = latestEsg ? [
    { name: '範疇一', value: latestEsg.scope1_tco2e ?? 0, fill: '#F59E0B' },
    { name: '範疇二', value: latestEsg.scope2_tco2e ?? 0, fill: '#3B82F6' },
  ] : [];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* 頁首 */}
      <header className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">ESG / 永續儀表板</h1>
          <p className="text-xs font-bold text-slate-500">
            碳排放量與確信等級 · 數據皆通過 DQ 檢驗並具{' '}
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">VALID</span>{' '}
            狀態 · 單位：tCO₂e
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 企業下拉選單 — 與 Finance 頁面相同設計 */}
          <select
            value={selectedCompany}
            onChange={e => setSelectedCompany(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 min-w-[160px]"
          >
            {COMPANIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            {isSuperAdmin ? '✅ System Admin' : '👁️ 唯讀'}
          </span>
        </div>
      </header>

      {/* KPI 卡片 */}
      {isLoading ? (
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <KpiCard
              label="範疇一排放（直接）"
              value={fmtTco2e(latestEsg?.scope1_tco2e)}
              sub={`${latestEsg?.period ?? ''} 年度`}
              badge="年度實際值"
              badgeColor="#F59E0B"
              source="esg_metrics"
            />
            <KpiCard
              label="範疇二排放（間接）"
              value={fmtTco2e(latestEsg?.scope2_tco2e)}
              sub={`${latestEsg?.period ?? ''} 年度`}
              badge="年度實際值"
              badgeColor="#3B82F6"
              source="esg_metrics"
            />
            <KpiCard
              label="碳排合計"
              value={fmtTco2e(latestEsg ? (latestEsg.scope1_tco2e ?? 0) + (latestEsg.scope2_tco2e ?? 0) : null)}
              sub="範疇一＋範疇二"
              badge="年度"
              badgeColor="#6366F1"
              source="esg_metrics"
            />
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-1">
              <p className="text-xs font-bold text-slate-500">確信等級</p>
              {latestEsg ? (
                <>
                  <h2 className="text-xl font-black leading-tight" style={{ color: ASSURANCE_COLOR[latestEsg.assurance_level] ?? '#94A3B8' }}>
                    {latestEsg.assurance_level ?? 'N/A'}
                  </h2>
                  <p className="text-[10px] text-slate-400">{ASSURANCE_LABEL[latestEsg.assurance_level] ?? '未知'}</p>
                  <p className="text-[9px] text-slate-300 font-mono mt-1">esg_metrics</p>
                </>
              ) : (
                <h2 className="text-xl font-black text-slate-300">N/A</h2>
              )}
            </div>
          </div>

          {/* 圖表區 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

            {/* 碳排趨勢折線圖 */}
            <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-700">碳排放趨勢（年度）</h3>
                <p className="text-xs text-slate-400">來源：esg_metrics（tCO₂e）</p>
              </div>
              {emissionTrendData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">暫無年度 ESG 資料</div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={emissionTrendData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748B' }}
                        axisLine={false} tickLine={false} width={60}
                        tickFormatter={v => {
                          if (Math.abs(v) >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`;
                          if (Math.abs(v) >= 1_000)     return `${(v/1_000).toFixed(0)}K`;
                          return String(v);
                        }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="scope1" name="範疇一" stroke="#F59E0B" strokeWidth={2.5}
                        dot={{ r: 4, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }} />
                      <Line type="monotone" dataKey="scope2" name="範疇二" stroke="#3B82F6" strokeWidth={2.5}
                        dot={{ r: 4, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 範疇一 vs 範疇二 長條比較 */}
            <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-700">排放結構（最新年度）</h3>
                <p className="text-xs text-slate-400">{latestEsg?.period ?? ''} · 範疇一 vs 範疇二</p>
              </div>
              {scopeCompareData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">暫無資料</div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scopeCompareData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748B' }}
                        axisLine={false} tickLine={false} width={60}
                        tickFormatter={v => {
                          if (Math.abs(v) >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`;
                          if (Math.abs(v) >= 1_000)     return `${(v/1_000).toFixed(0)}K`;
                          return String(v);
                        }}
                      />
                      <Tooltip
                        cursor={{ fill: '#F1F5F9' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                        formatter={(v: any) => [`${Number(v).toLocaleString()} tCO₂e`]}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={80}>
                        {scopeCompareData.map((entry, i) => (
                          <rect key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 財報營收趨勢（對照參考） */}
            <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
              <div className="mb-3">
                <h3 className="text-sm font-bold text-slate-700">營收趨勢（財報對照）</h3>
                <p className="text-xs text-slate-400">來源：fin_financial_fact（元）· 用於對照排放強度</p>
              </div>
              {finRefData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">暫無財報資料</div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={finRefData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748B' }}
                        axisLine={false} tickLine={false} width={60}
                        tickFormatter={v => {
                          const abs = Math.abs(v);
                          if (abs >= 1_000_000_000_000) return `${(v/1_000_000_000_000).toFixed(1)}兆`;
                          if (abs >= 100_000_000)       return `${(v/100_000_000).toFixed(0)}億`;
                          return `${(v/10_000).toFixed(0)}萬`;
                        }}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                        formatter={(v: any) => {
                          const abs = Math.abs(Number(v));
                          const s = abs >= 100_000_000 ? `${(Number(v)/100_000_000).toFixed(2)} 億元` : `${Number(v).toLocaleString()} 元`;
                          return [s, '營收'];
                        }}
                      />
                      <Line type="monotone" dataKey="revenue" name="營業收入" stroke="#6366F1" strokeWidth={2.5}
                        dot={{ r: 3, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 揭露說明 */}
            <div className="h-80 border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
              <h3 className="text-sm font-bold text-slate-700 mb-2">揭露說明與限制</h3>
              <p className="text-xs text-slate-400 mb-3 border-b border-slate-100 pb-2">避免誤用：跨產業 / 口徑差異</p>
              <ul className="text-xs text-slate-600 space-y-2.5 font-medium flex-1">
                {[
                  '資料來源：TWSE t187ap15_L · 無官方資料時使用行業基準估算',
                  '確信等級：High（第三方查核） / Medium（有限保證） / Low（自我申報）',
                  '範疇一：公司直接排放（鍋爐、車輛、製程）',
                  '範疇二：外購電力間接排放',
                  '同業比較需鎖定相近產業規模，石化 / 鋼鐵業排放量級差異極大',
                  '若欄位定義或年度制度變更 → 版本待審並阻擋放行',
                ].map((txt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block mt-1 shrink-0" />
                    {txt}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 資料來源 footer */}
          <div className="flex gap-4 text-[10px] text-slate-400 font-mono">
            <span>ESG：esg_metrics（TWSE t187ap15_L）</span>
            <span>財報對照：fin_financial_fact（TWSE t187ap14_L + t187ap03_L）</span>
          </div>
        </>
      )}
    </div>
  );
}

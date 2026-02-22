'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

// ── 千元格式化（資料庫與 API 均為千元單位）
const fmtK = (val: number | null | undefined): string => {
  if (val == null) return 'N/A';
  const neg = val < 0;
  const abs = Math.abs(val);
  let s = '';
  if      (abs >= 100_000_000) s = `${(abs / 100_000_000).toFixed(2)} 億`;
  else if (abs >= 10_000)      s = `${(abs / 10_000).toFixed(0)} 萬`;
  else                         s = abs.toLocaleString();
  return `${neg ? '-' : ''}${s} 千元`;
};

const fmtPct = (v: number | null | undefined) =>
  v == null ? 'N/A' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`;

// ── Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur p-3 border border-slate-200 shadow-xl rounded-xl text-xs">
      <p className="font-bold text-slate-500 mb-1 border-b border-slate-100 pb-1">{label}</p>
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          <span className="text-slate-600 font-bold">{e.name}：</span>
          <span className="font-black" style={{ color: e.color }}>{fmtK(e.value)}</span>
        </div>
      ))}
    </div>
  );
};

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

export default function FinanceDashboardPage() {
  const { user, isSuperAdmin } = useAuth();
  const [selectedCompany, setSelectedCompany] = useState('2330');

  // 月營收資料（fin_monthly_revenue）
  const [monthlyData, setMonthlyData]   = useState<any[]>([]);
  const [latestMonth, setLatestMonth]   = useState<any>(null);

  // 季度資料（fin_financial_fact）
  const [quarterData, setQuarterData]   = useState<any[]>([]);
  const [latestQuarter, setLatestQuarter] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const [monthRes, quarterRes] = await Promise.all([
        // 月營收：最近 36 筆，按 period 排序
        supabase
          .from('fin_monthly_revenue')
          .select('*')
          .eq('company_code', code)
          .eq('status', 'VALID')
          .order('period', { ascending: true })
          .limit(36),
        // 季度財報：最近 12 季
        supabase
          .from('fin_financial_fact')
          .select('*')
          .eq('company_code', code)
          .eq('status', 'VALID')
          .order('period', { ascending: true })
          .limit(12),
      ]);

      // ── 月營收處理
      const mData = monthRes.data ?? [];
      setMonthlyData(mData.map(r => ({
        period:  r.period,
        revenue: r.revenue,
        yoy:     r.yoy_pct,
      })));
      setLatestMonth(mData.length > 0 ? mData[mData.length - 1] : null);

      // ── 季度財報處理
      const qData = quarterRes.data ?? [];
      setQuarterData(qData.map(r => ({
        period:    r.period,
        netIncome: r.net_income,
        ocf:       r.operating_cash_flow,
      })));

      if (qData.length > 0) {
        const q = qData[qData.length - 1];
        const roe = q.equity > 0
          ? ((q.net_income / q.equity) * 100).toFixed(2)
          : null;
        const fcf = (q.operating_cash_flow ?? 0) - (q.capital_expenditure ?? 0);
        setLatestQuarter({ ...q, roe, fcf });
      } else {
        setLatestQuarter(null);
      }
    } catch (err) {
      console.error('資料取得失敗:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll('2330'); }, [fetchAll]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompany(e.target.value);
    fetchAll(e.target.value);
  };

  const displayRole = isSuperAdmin ? 'System Admin' : user ? '已登入' : '訪客模式';
  const noData = !isLoading && monthlyData.length === 0 && quarterData.length === 0;

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* ── Header ── */}
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">財務分析儀表板</h1>
          <p className="text-xs font-bold text-slate-500">
            本頁聚焦「獲利 × 現金 × 風險」。數據皆已通過 DQ 檢驗並具備{' '}
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">VALID</span> 狀態。
            <span className="ml-2 text-slate-400">單位：千元（新台幣）</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">檢視標的：</label>
            <select value={selectedCompany} onChange={handleChange}
              className="border border-slate-300 rounded-lg text-sm font-bold text-slate-700 px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <span className="px-3 py-1.5 rounded-lg text-xs font-black shadow-sm bg-indigo-50 border border-indigo-200 text-indigo-700">
            角色：{displayRole}
          </span>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : noData ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white p-12">
          <span className="text-5xl mb-4 opacity-40">📭</span>
          <p className="text-lg font-bold text-slate-700">查無已放行的財務數據</p>
          <p className="text-sm text-slate-500 mt-2 text-center max-w-md">
            請至 Admin 執行月營收同步與官方財報同步，再於「治理與放行」核准。
          </p>
        </div>
      ) : (
        <>
          {/* ── 五大 KPI ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {/* 最新月營收 */}
            <KpiCard
              label={`月營收 (${latestMonth?.period ?? '—'})`}
              value={latestMonth ? fmtK(latestMonth.revenue) : 'N/A'}
              sub={latestMonth ? `年增 ${fmtPct(latestMonth.yoy_pct)}` : ''}
              subColor={latestMonth?.yoy_pct >= 0 ? 'text-emerald-600' : 'text-rose-500'}
              badge="月度實際值"
              source="t187ap05_L"
            />
            {/* 最新月累計營收 */}
            <KpiCard
              label={`累計營收 (${latestMonth?.period ?? '—'})`}
              value={latestMonth ? fmtK(latestMonth.cumulative_rev) : 'N/A'}
              sub="當年度累計"
              subColor="text-slate-500"
              badge="月度實際值"
              source="t187ap05_L"
            />
            {/* 最新季淨利 */}
            <KpiCard
              label={`稅後淨利 (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter ? fmtK(latestQuarter.net_income) : 'N/A'}
              sub="季度財報"
              subColor="text-slate-500"
              badge="季度"
              source="t187ap14_L"
            />
            {/* ROE */}
            <KpiCard
              label={`ROE (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter?.roe != null ? `${latestQuarter.roe}%` : 'N/A'}
              sub="股東權益報酬率"
              subColor="text-slate-500"
              badge="季度"
              source="fin_financial_fact"
            />
            {/* 自由現金流 */}
            <KpiCard
              label={`自由現金流 (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter ? fmtK(latestQuarter.fcf) : 'N/A'}
              sub="OCF - CapEx"
              subColor={latestQuarter?.fcf < 0 ? 'text-rose-500' : 'text-slate-500'}
              badge="季度"
              source="fin_financial_fact"
            />
          </div>

          {/* ── 圖表區 ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[350px]">
            {/* 月營收趨勢 */}
            <ChartCard
              title="月營收趨勢"
              subtitle={monthlyData.length > 0
                ? `${monthlyData[0].period} ～ ${monthlyData[monthlyData.length-1].period}（${monthlyData.length} 個月）`
                : '暫無月度資料'}
              source="來源：TWSE t187ap05_L（月度實際值，千元）"
            >
              <LineChart data={monthlyData} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} dy={8}
                  tickFormatter={v => v.replace('M', '/')} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 100_000 ? `${(v/100_000).toFixed(0)}億` : `${(v/10_000).toFixed(0)}萬`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" name="月營收" stroke="#3B82F6" strokeWidth={3}
                  dot={{ r: 3, fill: '#fff', strokeWidth: 2, stroke: '#3B82F6' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ChartCard>

            {/* 季度淨利趨勢 */}
            <ChartCard
              title="稅後淨利趨勢（季度）"
              subtitle={quarterData.length > 0
                ? `${quarterData[0].period} ～ ${quarterData[quarterData.length-1].period}（${quarterData.length} 季）`
                : '暫無季度資料'}
              source="來源：TWSE t187ap14_L（季度財報，千元）"
            >
              <LineChart data={quarterData} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 100_000 ? `${(v/100_000).toFixed(0)}億` : `${(v/10_000).toFixed(0)}萬`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#E2E8F0" strokeWidth={1} />
                <Line type="monotone" dataKey="netIncome" name="稅後淨利" stroke="#10B981" strokeWidth={3}
                  dot={{ r: 3, fill: '#fff', strokeWidth: 2, stroke: '#10B981' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ChartCard>
          </div>

          {/* ── 資料來源說明 ── */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
              月營收：fin_monthly_revenue（TWSE t187ap05_L）
            </span>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
              季度財報：fin_financial_fact（TWSE t187ap14_L + t187ap03_L）
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── KPI 卡片
function KpiCard({ label, value, sub, subColor, badge, source }: {
  label: string; value: string; sub: string; subColor: string; badge: string; source: string;
}) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold text-slate-500 truncate">{label}</p>
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 shrink-0 ml-1">{badge}</span>
      </div>
      <h2 className="text-xl font-black text-slate-800 truncate leading-tight" title={value}>{value}</h2>
      <p className={`text-[10px] font-bold mt-1.5 ${subColor}`}>{sub}</p>
      <p className="text-[9px] text-slate-300 mt-1 font-mono truncate">{source}</p>
    </div>
  );
}

// ── 圖表卡片
function ChartCard({ title, subtitle, source, children }: {
  title: string; subtitle: string; source: string; children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-6 flex flex-col hover:border-indigo-100 transition-colors">
      <div className="mb-4">
        <h3 className="text-base font-black text-slate-700">{title}</h3>
        <p className="text-xs font-bold text-slate-400 mt-0.5">{subtitle}</p>
        <p className="text-[9px] text-slate-300 mt-1 font-mono">{source}</p>
      </div>
      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

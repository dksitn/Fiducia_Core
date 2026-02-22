'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

// 季度資料（fin_financial_fact）單位：元
const fmtYuan = (val: number | null | undefined): string => {
  if (val == null) return 'N/A';
  const neg = val < 0;
  const abs = Math.abs(val);
  let s = '';
  if      (abs >= 1_000_000_000_000) s = `${(abs / 1_000_000_000_000).toFixed(2)} 兆`;
  else if (abs >= 100_000_000)       s = `${(abs / 100_000_000).toFixed(2)} 億`;
  else if (abs >= 10_000)            s = `${(abs / 10_000).toFixed(0)} 萬`;
  else                               s = abs.toLocaleString();
  return `${neg ? '-' : ''}${s}`;
};

const fmtPct = (v: number | null | undefined) =>
  v == null ? 'N/A' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur p-3 border border-slate-200 shadow-xl rounded-xl text-xs">
      <p className="font-bold text-slate-500 mb-1 border-b border-slate-100 pb-1">{label}</p>
      {payload.map((e: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          <span className="text-slate-600 font-bold">{e.name}：</span>
          <span className="font-black" style={{ color: e.color }}>{fmtYuan(e.value)}</span>
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

  const [quarterData, setQuarterData]     = useState<any[]>([]);
  const [latestQuarter, setLatestQuarter] = useState<any>(null);
  const [isLoading, setIsLoading]         = useState(true);

  const fetchAll = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const quarterRes = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', code)
        .eq('status', 'VALID')
        .order('period', { ascending: true })
        .limit(12);

      const qData = quarterRes.data ?? [];

      setQuarterData(qData.map(r => ({
        period:    r.period,
        revenue:   r.revenue,
        netIncome: r.net_income,
      })));

      if (qData.length > 0) {
        const q    = qData[qData.length - 1];
        const prev = qData[qData.length - 2] ?? null;
        const roe  = q.equity > 0 ? ((q.net_income / q.equity) * 100).toFixed(2) : null;
        const fcf  = (q.operating_cash_flow ?? 0) - (q.capital_expenditure ?? 0);
        const yoy_revenue = prev?.revenue > 0
          ? (((q.revenue - prev.revenue) / prev.revenue) * 100).toFixed(2)
          : null;
        setLatestQuarter({ ...q, roe, fcf, yoy_revenue });
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
  const noData = !isLoading && quarterData.length === 0;

  const yAxisFmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000_000) return `${(v/1_000_000_000_000).toFixed(1)}兆`;
    if (abs >= 100_000_000)       return `${(v/100_000_000).toFixed(0)}億`;
    return `${(v/10_000).toFixed(0)}萬`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col bg-[#F8FAFC]">

      {/* Header */}
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">財務分析儀表板</h1>
          <p className="text-xs font-bold text-slate-500">
            本頁聚焦「獲利 × 現金 × 風險」。數據皆已通過 DQ 檢驗並具備{' '}
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">VALID</span> 狀態。
            <span className="ml-2 text-slate-400">單位：元（新台幣）</span>
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
            請至 Admin 執行官方財報同步，再於「治理與放行」核准。
          </p>
        </div>
      ) : (
        <>
          {/* KPI 卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label={`季度營收 (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter ? fmtYuan(latestQuarter.revenue) : 'N/A'}
              sub={latestQuarter?.yoy_revenue != null ? `季增 ${fmtPct(Number(latestQuarter.yoy_revenue))}` : '季度比較'}
              subColor={Number(latestQuarter?.yoy_revenue) >= 0 ? 'text-emerald-600' : 'text-rose-500'}
              badge="季度"
              source="t187ap14_L"
            />
            <KpiCard
              label={`稅後淨利 (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter ? fmtYuan(latestQuarter.net_income) : 'N/A'}
              sub="季度財報"
              subColor="text-slate-500"
              badge="季度"
              source="t187ap14_L"
            />
            <KpiCard
              label={`ROE (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter?.roe != null ? `${latestQuarter.roe}%` : 'N/A'}
              sub="股東權益報酬率"
              subColor="text-slate-500"
              badge="季度"
              source="fin_financial_fact"
            />
            <KpiCard
              label={`自由現金流 (${latestQuarter?.period ?? '—'})`}
              value={latestQuarter ? fmtYuan(latestQuarter.fcf) : 'N/A'}
              sub="OCF - CapEx"
              subColor={latestQuarter?.fcf < 0 ? 'text-rose-500' : 'text-slate-500'}
              badge="季度"
              source="fin_financial_fact"
            />
          </div>

          {/* 圖表區 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[350px]">
            <ChartCard
              title="季度營收趨勢"
              subtitle={quarterData.length > 0
                ? `${quarterData[0].period} ～ ${quarterData[quarterData.length-1].period}（${quarterData.length} 季）`
                : '暫無季度資料'}
              source="來源：TWSE t187ap14_L（季度財報，元）"
            >
              <LineChart data={quarterData} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={yAxisFmt} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" name="季度營收" stroke="#3B82F6" strokeWidth={3}
                  dot={{ r: 3, fill: '#fff', strokeWidth: 2, stroke: '#3B82F6' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ChartCard>

            <ChartCard
              title="稅後淨利趨勢（季度）"
              subtitle={quarterData.length > 0
                ? `${quarterData[0].period} ～ ${quarterData[quarterData.length-1].period}（${quarterData.length} 季）`
                : '暫無季度資料'}
              source="來源：TWSE t187ap14_L（季度財報，元）"
            >
              <LineChart data={quarterData} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={yAxisFmt} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#E2E8F0" strokeWidth={1} />
                <Line type="monotone" dataKey="netIncome" name="稅後淨利" stroke="#10B981" strokeWidth={3}
                  dot={{ r: 3, fill: '#fff', strokeWidth: 2, stroke: '#10B981' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ChartCard>
          </div>

          {/* 資料來源說明 */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
              季度財報：fin_financial_fact（TWSE t187ap14_L + t187ap03_L）
            </span>
          </div>
        </>
      )}
    </div>
  );
}

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

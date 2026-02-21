'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../layout';

// 單位換算說明：
// DB 存的是「元」(TWSE 千元原始值 × 1000)
// 850,000 元 → 顯示 0.085 億 (模擬資料規模較小)
// 換算：value / 100,000,000 = 億

const formatYi = (val: number) => {
  if (val >= 100_000_000) return `${(val / 100_000_000).toFixed(1)}億`;
  if (val >= 10_000) return `${(val / 10_000).toFixed(0)}萬`;
  return val.toLocaleString();
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg">
        <p className="text-xs font-bold text-slate-500 mb-1">{label}</p>
        <p className="text-sm font-black text-indigo-600">
          {formatYi(Number(payload[0].value))}
        </p>
      </div>
    );
  }
  return null;
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
  const [chartData, setChartData] = useState<any[]>([]);
  const [latestKPI, setLatestKPI] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataUnit, setDataUnit] = useState<'元' | '千元' | '億'>('元');

  const fetchFinancialData = async (companyCode: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', companyCode)
        .eq('status', 'VALID')
        .order('period', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        // 自動偵測資料規模決定顯示單位
        const maxRevenue = Math.max(...data.map(d => d.revenue || 0));
        const detectedUnit = maxRevenue >= 1_000_000_000 ? '億' : maxRevenue >= 1_000_000 ? '百萬' : '元';
        setDataUnit(detectedUnit as any);

        setChartData(data.map(item => ({
          period: item.period,
          revenue: item.revenue,
          netIncome: item.net_income
        })));

        const latest = data[data.length - 1];
        const roe = latest.equity > 0
          ? ((latest.net_income / latest.equity) * 100).toFixed(2)
          : 'N/A';
        const fcf = (latest.operating_cash_flow || 0) - (latest.capital_expenditure || 0);

        setLatestKPI({
          period: latest.period,
          revenue: latest.revenue,
          netIncome: latest.net_income,
          roe,
          fcf,
          equity: latest.equity,
          totalAssets: latest.total_assets,
        });
      } else {
        setChartData([]);
        setLatestKPI(null);
      }
    } catch (err) {
      console.error('無法取得財務數據:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialData('2330');
  }, []);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedCompany(val);
    fetchFinancialData(val);
  };

  const displayRole = isSuperAdmin ? 'System Admin' : user ? '已登入' : '訪客模式';

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">財務分析儀表板</h1>
          <p className="text-xs font-bold text-slate-500">
            本頁聚焦「獲利 × 現金 × 風險」。數據皆已通過 DQ 檢驗並具備{' '}
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">VALID</span> 狀態。
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">檢視標的：</label>
            <select
              value={selectedCompany}
              onChange={handleCompanyChange}
              className="border border-slate-300 rounded-lg text-sm font-bold text-slate-700 px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {COMPANIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
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
      ) : chartData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm">
          <span className="text-4xl mb-3 opacity-50">📭</span>
          <p className="text-sm font-bold text-slate-600">查無已放行的財務數據</p>
          <p className="text-xs text-slate-400 mt-1">
            請至「治理與放行」完成數位簽章後再回來查看。
          </p>
        </div>
      ) : (
        <>
          {/* 四大 KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label={`營收 (${latestKPI?.period})`}
              value={formatYi(latestKPI?.revenue)}
              note="↑ 趨勢：經核決放行"
              noteColor="text-emerald-600"
            />
            <KpiCard
              label={`稅後淨利 (${latestKPI?.period})`}
              value={formatYi(latestKPI?.netIncome)}
              note="↑ 趨勢：經核決放行"
              noteColor="text-emerald-600"
            />
            <KpiCard
              label={`ROE (${latestKPI?.period})`}
              value={latestKPI?.roe === 'N/A' ? 'N/A' : `${latestKPI?.roe}%`}
              note="效率：資本報酬指標"
              noteColor="text-emerald-600"
            />
            <KpiCard
              label={`自由現金流 (${latestKPI?.period})`}
              value={formatYi(latestKPI?.fcf)}
              note="現金：營運現金流 - 資本支出"
              noteColor="text-slate-400"
            />
          </div>

          {/* 資料說明 badge */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
              資料單位：{dataUnit}（DB 實際儲存值，TWSE 原始千元 × 1000）
            </span>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
              ⚠️ 現為模擬資料，規模非真實市值
            </span>
          </div>

          {/* 趨勢圖 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[300px]">
            <ChartCard title="營業收入趨勢" subtitle="季度趨勢 (財報)">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => formatYi(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3}
                  dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ChartCard>

            <ChartCard title="稅後淨利趨勢" subtitle="季度趨勢 (財報)">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => formatYi(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="netIncome" stroke="#10B981" strokeWidth={3}
                  dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ── 小元件 ──────────────────────────────────
function KpiCard({ label, value, note, noteColor }: { label: string; value: string; note: string; noteColor: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <p className="text-xs font-bold text-slate-500 mb-1">{label}</p>
      <h2 className="text-2xl font-black text-slate-800 truncate">{value}</h2>
      <p className={`text-[10px] font-bold mt-2 ${noteColor}`}>{note}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="flex-1 w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

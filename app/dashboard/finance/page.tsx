'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/app/dashboard/auth-context';

// ── 1. 生產級：智慧貨幣格式化 (支援 兆、億、萬 與 負數) ──────────────
const formatCurrency = (val: number | null | undefined) => {
  if (val === null || val === undefined) return 'N/A';
  
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  let formatted = '';

  if (absVal >= 1_000_000_000_000) {
    formatted = `${(absVal / 1_000_000_000_000).toFixed(2)} 兆`;
  } else if (absVal >= 100_000_000) {
    formatted = `${(absVal / 100_000_000).toFixed(2)} 億`;
  } else if (absVal >= 10_000) {
    formatted = `${(absVal / 10_000).toFixed(0)} 萬`;
  } else {
    formatted = absVal.toLocaleString();
  }

  return isNegative ? `-$${formatted}` : `$${formatted}`;
};

// ── 2. 優化版：圖表懸浮提示框 (Tooltip) ──────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-200 shadow-xl rounded-xl">
        <p className="text-xs font-bold text-slate-500 mb-2 border-b border-slate-100 pb-1">{label} 季度表現</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-3 mt-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-sm font-bold text-slate-700">{entry.name === 'revenue' ? '營業收入' : '稅後淨利'}:</span>
            <span className="text-sm font-black" style={{ color: entry.color }}>
              {formatCurrency(Number(entry.value))}
            </span>
          </div>
        ))}
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

  const fetchFinancialData = async (companyCode: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', companyCode)
        .eq('status', 'VALID') // 🌟 核心防線：只抓已放行資料
        .order('period', { ascending: true }); // 確保時間軸由舊到新排列

      if (error) throw error;

      if (data && data.length > 0) {
        setChartData(data.map(item => ({
          period: item.period,
          revenue: item.revenue,
          netIncome: item.net_income
        })));

        const latest = data[data.length - 1]; // 取出最新一季
        
        // 防禦性計算 ROE 與 自由現金流
        const roe = (latest.equity && latest.equity > 0)
          ? ((latest.net_income / latest.equity) * 100).toFixed(2)
          : 'N/A';
        const fcf = (latest.operating_cash_flow ?? 0) - (latest.capital_expenditure ?? 0);

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
              className="border border-slate-300 rounded-lg text-sm font-bold text-slate-700 px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm p-12">
          <span className="text-5xl mb-4 opacity-40">📭</span>
          <p className="text-lg font-bold text-slate-700">查無已放行的財務數據</p>
          <p className="text-sm text-slate-500 mt-2 text-center max-w-md">
            目前資料庫中沒有狀態為 <strong>VALID</strong> 的 {selectedCompany} 數據。<br/>
            請確保資料爬蟲已執行，並於「治理與放行」核准該批資料。
          </p>
        </div>
      ) : (
        <>
          {/* ── 四大 KPI ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard
              label={`營收 (${latestKPI?.period})`}
              value={formatCurrency(latestKPI?.revenue)}
              note="↑ 趨勢：經核決放行"
              noteColor="text-emerald-600"
            />
            <KpiCard
              label={`稅後淨利 (${latestKPI?.period})`}
              value={formatCurrency(latestKPI?.netIncome)}
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
              value={formatCurrency(latestKPI?.fcf)}
              note="現金：營運現金流 - 資本支出"
              noteColor={latestKPI?.fcf < 0 ? "text-rose-500" : "text-slate-500"}
            />
          </div>

          <div className="mb-4 flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
              數據來源：L2 財務聚合層 (fin_financial_fact)
            </span>
          </div>

          {/* ── 三年趨勢圖 (動態讀取多季資料) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[350px]">
            <ChartCard title="營業收入趨勢 (三年季度)" subtitle={`共有 ${chartData.length} 季資料`}>
              <LineChart data={chartData} margin={{ top: 15, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => formatCurrency(v).replace('$', '')} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" name="revenue" stroke="#3B82F6" strokeWidth={4}
                  dot={{ r: 5, fill: '#fff', strokeWidth: 2, stroke: '#3B82F6' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ChartCard>

            <ChartCard title="稅後淨利趨勢 (三年季度)" subtitle={`共有 ${chartData.length} 季資料`}>
              <LineChart data={chartData} margin={{ top: 15, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => formatCurrency(v).replace('$', '')} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="netIncome" name="netIncome" stroke="#10B981" strokeWidth={4}
                  dot={{ r: 5, fill: '#fff', strokeWidth: 2, stroke: '#10B981' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ── 共用小元件 ──────────────────────────────────
function KpiCard({ label, value, note, noteColor }: { label: string; value: string; note: string; noteColor: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-bold text-slate-500 mb-1">{label}</p>
      <h2 className="text-2xl font-black text-slate-800 truncate" title={value}>{value}</h2>
      <p className={`text-[10px] font-bold mt-2 ${noteColor}`}>{note}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-6 flex flex-col hover:border-indigo-100 transition-colors">
      <div className="mb-6">
        <h3 className="text-base font-black text-slate-700">{title}</h3>
        <p className="text-xs font-bold text-slate-400 mt-1">{subtitle}</p>
      </div>
      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
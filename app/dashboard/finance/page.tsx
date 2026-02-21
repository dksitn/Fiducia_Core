'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Custom Tooltip 組件
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg">
        <p className="text-xs font-bold text-slate-500 mb-1">{label}</p>
        <p className="text-sm font-black text-indigo-600">
          數值: {Number(payload[0].value).toLocaleString()} 千元
        </p>
      </div>
    );
  }
  return null;
};

export default function FinanceDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState('2330'); 
  
  // 🌟 真實圖表與 KPI 數據 State
  const [chartData, setChartData] = useState<any[]>([]);
  const [latestKPI, setLatestKPI] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 核心：只抓取「已放行 (VALID)」的完整財務數據
  const fetchFinancialData = async (companyCode: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', companyCode)
        .eq('status', 'VALID') // 絕對卡控點
        .order('period', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        // 1. 處理圖表數據
        const formattedChartData = data.map(item => ({
          period: item.period,
          revenue: item.revenue,
          netIncome: item.net_income
        }));
        setChartData(formattedChartData);

        // 2. 計算最新一季的 KPI (ROE 與 自由現金流)
        const latest = data[data.length - 1]; // 取最後一筆 (最新季)
        const roe = latest.equity > 0 ? ((latest.net_income / latest.equity) * 100).toFixed(2) : 'N/A';
        const freeCashFlow = latest.operating_cash_flow - latest.capital_expenditure;

        setLatestKPI({
          period: latest.period,
          revenue: latest.revenue,
          netIncome: latest.net_income,
          roe: roe,
          fcf: freeCashFlow
        });
      } else {
        setChartData([]);
        setLatestKPI(null);
      }
    } catch (err) {
      console.error("無法取得財務數據:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data: roleData } = await supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id);
        if (roleData && roleData.length > 0) setRole(roleData[0].role);
      }
      await fetchFinancialData('2330');
    };
    init();
  }, []);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCompany = e.target.value;
    setSelectedCompany(newCompany);
    fetchFinancialData(newCompany);
  };

  const displayRole = (role === 'superadmin' || user?.email === 'e10090903@gmail.com') ? 'System Admin' : (role ? role : '訪客模式');

  return (
    <div className="p-8 animate-fade-in-up max-w-7xl mx-auto min-h-screen flex flex-col bg-[#F8FAFC]">
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1">財務分析儀表板 (真實連線版)</h1>
          <p className="text-xs font-bold text-slate-500">
            本頁聚焦「獲利 × 現金 × 風險」。數據皆已通過 DQ 檢驗並具備 <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">VALID</span> 狀態。
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
              <option value="2330">2330 台積電</option>
              <option value="2317">2317 鴻海</option>
              <option value="2454">2454 聯發科</option>
            </select>
          </div>
          <span className="px-3 py-1.5 rounded-lg text-xs font-black shadow-sm bg-indigo-50 border border-indigo-200 text-indigo-700">
            角色 : {user ? displayRole : '未登入'}
          </span>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm">
          <span className="text-4xl mb-3 opacity-50">📭</span>
          <p className="text-sm font-bold text-slate-600">查無已放行的財務數據</p>
          <p className="text-xs text-slate-400 mt-1">請確認該公司的財報是否已於「治理核決樞紐」完成數位簽章放行。</p>
        </div>
      ) : (
        <>
          {/* 🌟 滿血復活：四大 KPI 指標卡 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-500 mb-1">營收 (最新季 {latestKPI?.period})</p>
              <h2 className="text-3xl font-black text-slate-800">{(latestKPI?.revenue / 100000).toFixed(0)} <span className="text-sm">億</span></h2>
              <p className="text-[10px] font-bold text-emerald-600 mt-2">↑ 趨勢：經核決放行</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-500 mb-1">稅後淨利 (最新季 {latestKPI?.period})</p>
              <h2 className="text-3xl font-black text-slate-800">{(latestKPI?.netIncome / 100000).toFixed(0)} <span className="text-sm">億</span></h2>
              <p className="text-[10px] font-bold text-emerald-600 mt-2">↑ 趨勢：經核決放行</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-500 mb-1">ROE (最新季 {latestKPI?.period})</p>
              <h2 className="text-3xl font-black text-slate-800">{latestKPI?.roe} <span className="text-sm">%</span></h2>
              <p className="text-[10px] font-bold text-emerald-600 mt-2">↑ 效率：資本報酬指標</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-500 mb-1">自由現金流 (最新季 {latestKPI?.period})</p>
              <h2 className="text-3xl font-black text-slate-800">{(latestKPI?.fcf / 100000).toFixed(0)} <span className="text-sm">億</span></h2>
              <p className="text-[10px] font-bold text-slate-400 mt-2">現金：營運現金流 - 資本支出</p>
            </div>
          </div>

          {/* 🌟 歷史趨勢折線圖 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[300px]">
            <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700">營業收入趨勢</h3>
                <p className="text-xs text-slate-400">季度趨勢 (財報)</p>
              </div>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/100000).toFixed(0)}億`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-5 flex flex-col">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700">稅後淨利趨勢</h3>
                <p className="text-xs text-slate-400">季度趨勢 (財報)</p>
              </div>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/100000).toFixed(0)}億`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="netIncome" stroke="#10B981" strokeWidth={3} dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
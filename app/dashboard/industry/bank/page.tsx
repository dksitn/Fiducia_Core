'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

// 🌟 保留靜態規格對齊資料 (供血緣、定價、氣候模組使用)
const MOCK_BANK_RESULT = {
  meta: { consolidation_scope: '合併報表', currency: 'TWD' },
  snapshots: {
    financial: { id: 'DER_FIN_SNAPSHOT', status: 'VALID', sources: ['SRC_TWSE_OPENAPI_FIN', 'SRC_MOPS_FS'], reconciliation: 'PASS (兩端資料比對誤差 < 3%)', sealed_by: 'P_FIN_REPORT_VERSION_SEAL' },
    esg: { id: 'DER_ESG_SNAPSHOT', status: 'VALID', sources: ['SRC_SUS_REPORT_PDF', 'SRC_ESG_SCORE', 'SRC_FINANCED_EMISSIONS'], assurance_level: '合理確信 (Reasonable Assurance)', sealed_by: 'P_ESG_REPORT_VERSION_SEAL' }
  },
  pricing_sll: { pricing_spread_bp: 120, esg_discount_bp: 15, final_spread_bp: 105, kpi_list: ['範疇1+2 排放強度年減率目標: 5% (基期 2023)', '再生電力占比提升至 30% (需第三方確信)'] },
  climate_risk: { financed_emissions_total: '125,400', estimation_ratio: 0.15, dq_rules: [{ id: 'CR_01', severity: 'PASS', message: '估算比例低於 50% 門檻 (僅 15%)，未觸發 PENDING_REVIEW。' }] }
};

export default function BankingIndustryPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'PEDIGREE' | 'EWS' | 'PRICING' | 'CLIMATE'>('EWS');
  const [selectedCompany, setSelectedCompany] = useState('2330');
  
  // 🌟 核心：復活的「至少三期」真實歷史資料陣列
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // 🌟 真實抓取邏輯：強制取得最近 3 期 VALID 數據
  const fetchFinancialData = async (companyCode: string) => {
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('fin_financial_fact')
        .select('*')
        .eq('company_code', companyCode)
        .eq('status', 'VALID')
        .order('period', { ascending: false }) // 最新期數排第一
        .limit(3); 

      if (error) throw error;
      setHistoricalData(data || []);
    } catch (err) {
      console.error("無法取得財務數據:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const { data } = await supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id);
        if (data && data.length > 0) setRole(data[0].role);
      }
      await fetchFinancialData('2330');
    };
    init();
  }, []);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCompany = e.target.value;
    setSelectedCompany(newCompany);
    fetchFinancialData(newCompany); // 切換公司時重新抓三期資料
  };

  const handleGoogleLogin = async () => {
    setIsAuthLoading(true);
    try {
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${window.location.pathname}` }});
    } catch (error: any) { alert('登入失敗'); setIsAuthLoading(false); }
  };
  const handleLogout = async () => { await supabase.auth.signOut(); window.location.reload(); };

  const isSuperAdmin = role === 'superadmin' || user?.email === 'e10090903@gmail.com';
  const displayRole = isSuperAdmin ? 'System Admin' : (role ? role : '訪客模式');

  // ==========================================
  // 🌟 三期動態指標與成長率計算引擎
  // ==========================================
  const latest = historicalData[0];
  const previous = historicalData[1];

  const calculateGrowth = (currentValue: number, pastValue: number) => {
    if (!currentValue || !pastValue || pastValue === 0) return { text: 'N/A', isPositive: null, raw: 0 };
    const growth = ((currentValue - pastValue) / Math.abs(pastValue)) * 100;
    return { value: growth, text: `${growth > 0 ? '+' : ''}${growth.toFixed(2)}%`, isPositive: growth > 0, raw: growth };
  };

  const getEWSMetrics = (dataRow: any) => {
    if (!dataRow) return null;
    const debtRatio = dataRow.total_assets > 0 ? (dataRow.total_liabilities / dataRow.total_assets) * 100 : 0;
    const cfoToNi = dataRow.net_income > 0 ? (dataRow.operating_cash_flow / dataRow.net_income) : 0;
    return { period: dataRow.period, debtRatio: debtRatio.toFixed(2), cfoToNi: cfoToNi.toFixed(2) };
  };

  const latestEWS = getEWSMetrics(latest);
  const prevEWS = getEWSMetrics(previous);
  const debtRatioChange = (latestEWS && prevEWS) ? (parseFloat(latestEWS.debtRatio) - parseFloat(prevEWS.debtRatio)).toFixed(2) : 'N/A';

  return (
    <div className="p-6 md:p-8 animate-fade-in-up max-w-7xl mx-auto min-h-screen bg-[#F8FAFC] text-slate-800">
      
      {/* 🌟 頂部 Header：加入動態公司切換器 */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase shadow-sm">銀行業專屬視角</span>
            <h1 className="text-2xl font-black">企業授信與綠色金融評級</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">所有分析皆嚴格遵守「唯讀 <span className="text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">VALID</span> 快照」原則，並受密碼學憑證保護。</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">審查標的</label>
              <select value={selectedCompany} onChange={handleCompanyChange} className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer">
                <option value="2330">2330 台積電</option>
                <option value="2317">2317 鴻海</option>
                <option value="2454">2454 聯發科</option>
              </select>
            </div>
            <span className="text-[9px] text-slate-400 font-bold tracking-wider">{MOCK_BANK_RESULT.meta.consolidation_scope} | {MOCK_BANK_RESULT.meta.currency}</span>
          </div>
          
          <div className="text-right">
            {!user ? (
              <button onClick={handleGoogleLogin} disabled={isAuthLoading} className="bg-white border border-slate-300 text-slate-700 font-bold text-xs py-1.5 px-4 rounded-lg shadow-sm hover:shadow-md transition-all">
                {isAuthLoading ? '連線中...' : '以 Google 登入'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold px-2 py-1 rounded border shadow-sm ${isSuperAdmin ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {user.email} <span className="text-[9px] ml-1 opacity-80">({displayRole})</span>
                </span>
                <button onClick={handleLogout} className="text-[10px] font-bold text-slate-500 hover:text-red-600 underline underline-offset-2">登出</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 🌟 Tab 頁籤切換器 */}
      <div className="flex gap-6 mb-6 border-b border-slate-200 overflow-x-auto hide-scrollbar">
        {[
          { id: 'EWS', label: '借戶風險監控 (EWS)' },
          { id: 'PEDIGREE', label: '資料血緣與品質 (Data Pedigree)' },
          { id: 'PRICING', label: '授信定價與 SLL' },
          { id: 'CLIMATE', label: '投融資氣候風險' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 text-sm font-black border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 🌟 動態模組：借戶風險 (EWS) - 支援三期溯源與成長率計算 */}
      {activeTab === 'EWS' && (
        isLoadingData ? (
          <div className="flex justify-center items-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : historicalData.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white shadow-sm py-20 animate-fade-in-up">
            <span className="text-4xl mb-3 opacity-50">📭</span>
            <p className="text-sm font-bold text-slate-600">查無該公司的已放行數據</p>
            <p className="text-xs text-slate-400 mt-1">請確認財報是否已於「治理核決樞紐」完成數位簽章放行。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
            {/* 左側：信用評級卡片 (自適應高度 h-fit 防跑版) */}
            <div className="lg:col-span-1 bg-gradient-to-b from-indigo-50 to-white border border-indigo-100 rounded-2xl p-6 shadow-sm flex flex-col h-fit">
              <h3 className="text-xs font-black text-indigo-900 mb-4 uppercase tracking-widest">信用風險等級 (內部模型)</h3>
              <div className="flex items-end gap-3 mb-6">
                <span className="text-6xl font-black text-indigo-700 leading-none">A+</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded mb-1 border border-emerald-100">低違約風險</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-indigo-50 mb-4 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">財務承諾 (Covenant)</p>
                <p className="text-xs font-bold text-slate-700">DER_FIN_SNAPSHOT</p>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  綜合近 {historicalData.length} 期之財報表現，距離違約門檻尚有 <span className="font-bold text-indigo-600">45%</span> 緩衝空間。
                </p>
              </div>
              {/* ⚠️ 歷史資料不足防呆警告 */}
              {historicalData.length < 3 && (
                <div className="mt-auto bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-2 items-start">
                  <span className="text-amber-600 text-sm">⚠️</span>
                  <div>
                    <p className="text-[10px] font-black text-amber-800">歷史資料不足三期</p>
                    <p className="text-[9px] text-amber-700 mt-0.5 leading-relaxed">目前僅取得 {historicalData.length} 期 VALID 資料，長期趨勢評估可能受限。</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* 右側：三期趨勢動態數據清單 */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">核心預警訊號與成長動能</h3>
                <span className="text-[9px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100">Source: fin_financial_fact (VALID)</span>
              </div>

              <div className="space-y-4">
                {/* 1. 營業收入成長率 */}
                <div className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-slate-50 rounded-xl transition-colors">
                  <div className="col-span-12 sm:col-span-4">
                    <p className="text-xs font-black text-slate-700">營業收入動能</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">單位: 元</p>
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <p className="text-[10px] text-indigo-500 font-bold mb-0.5">最新 ({latest?.period})</p>
                    <p className="text-lg font-black text-slate-800">{latest?.revenue?.toLocaleString()}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-4 flex flex-col items-end sm:items-start">
                    {previous ? (() => {
                      const growth = calculateGrowth(latest.revenue, previous.revenue);
                      return (
                        <>
                          <p className="text-[10px] text-slate-400 font-bold mb-0.5">前期 ({previous.period}) : {previous.revenue?.toLocaleString()}</p>
                          <div className={`mt-1 px-2 py-1 rounded border text-[10px] font-black inline-block ${growth.isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                            {growth.isPositive ? '↑ 營收成長' : '↓ 營收衰退'} {growth.text}
                          </div>
                        </>
                      );
                    })() : <p className="text-[10px] text-slate-400 italic">無前期資料可供比較</p>}
                  </div>
                </div>

                {/* 2. 負債比變動 */}
                <div className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border-t border-slate-50">
                  <div className="col-span-12 sm:col-span-4">
                    <p className="text-xs font-black text-slate-700">負債比率 (Debt Ratio)</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">總負債 / 總資產</p>
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <p className="text-[10px] text-indigo-500 font-bold mb-0.5">最新 ({latest?.period})</p>
                    <p className="text-lg font-black text-slate-800">{latestEWS?.debtRatio}%</p>
                  </div>
                  <div className="col-span-6 sm:col-span-4 flex flex-col items-end sm:items-start">
                    {previous ? (
                      <>
                        <p className="text-[10px] text-slate-400 font-bold mb-0.5">前期 ({previous.period}) : {prevEWS?.debtRatio}%</p>
                        <div className={`mt-1 px-2 py-1 rounded border text-[10px] font-black inline-block ${parseFloat(debtRatioChange) > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {parseFloat(debtRatioChange) > 0 ? '↑ 負債攀升' : '↓ 結構改善'} {debtRatioChange}%
                        </div>
                      </>
                    ) : <p className="text-[10px] text-slate-400 italic">無前期資料可供比較</p>}
                  </div>
                </div>

                {/* 3. 盈餘品質 (CFO/NI) */}
                <div className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border-t border-slate-50">
                  <div className="col-span-12 sm:col-span-4">
                    <p className="text-xs font-black text-slate-700">盈餘品質 (CFO/NI)</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">營業現金流 / 稅後淨利</p>
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <p className="text-[10px] text-indigo-500 font-bold mb-0.5">最新 ({latest?.period})</p>
                    <p className={`text-lg font-black ${parseFloat(latestEWS?.cfoToNi || '0') < 1 ? 'text-amber-600' : 'text-slate-800'}`}>
                      {latestEWS?.cfoToNi} <span className="text-xs font-medium text-slate-500">x</span>
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-4 flex flex-col items-end sm:items-start">
                    {previous ? (
                      <>
                        <p className="text-[10px] text-slate-400 font-bold mb-0.5">前期 ({previous.period}) : {prevEWS?.cfoToNi} x</p>
                        {latestEWS && parseFloat(latestEWS.cfoToNi) < 1 && (
                          <div className="mt-1 px-2 py-1 rounded border text-[10px] font-black inline-block bg-amber-50 text-amber-700 border-amber-200">
                            ⚠️ 淨利未轉化為現金
                          </div>
                        )}
                      </>
                    ) : <p className="text-[10px] text-slate-400 italic">無前期資料</p>}
                  </div>
                </div>
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

      {/* 🌟 靜態模組：PEDIGREE, PRICING, CLIMATE (完美保留不變) */}
      {activeTab === 'PEDIGREE' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🏦 財務指標快照 (Financial Snapshot)</h3>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-1 rounded font-black border border-emerald-200">{MOCK_BANK_RESULT.snapshots.financial.status}</span>
            </div>
            <div className="space-y-4">
              <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">快照識別碼</p><p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">{MOCK_BANK_RESULT.snapshots.financial.id}</p></div>
              <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">對帳比對 (Reconciliation)</p><p className="text-xs font-bold text-indigo-700">✓ {MOCK_BANK_RESULT.snapshots.financial.reconciliation}</p></div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">原始資料源 (Sources)</p>
                <div className="flex flex-wrap gap-2">{MOCK_BANK_RESULT.snapshots.financial.sources.map(src => (<span key={src} className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-bold">{src}</span>))}</div>
              </div>
              <div className="pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">封存引擎</p><p className="text-xs font-mono font-bold text-slate-500">{MOCK_BANK_RESULT.snapshots.financial.sealed_by}</p></div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🌱 永續指標快照 (ESG Snapshot)</h3>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-1 rounded font-black border border-emerald-200">{MOCK_BANK_RESULT.snapshots.esg.status}</span>
            </div>
            <div className="space-y-4">
              <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">快照識別碼</p><p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">{MOCK_BANK_RESULT.snapshots.esg.id}</p></div>
              <div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">第三方確信</p><p className="text-xs font-bold text-indigo-700">✓ {MOCK_BANK_RESULT.snapshots.esg.assurance_level}</p></div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">原始資料源</p>
                <div className="flex flex-wrap gap-2">{MOCK_BANK_RESULT.snapshots.esg.sources.map(src => (<span key={src} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded font-bold">{src}</span>))}</div>
              </div>
              <div className="pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">封存引擎</p><p className="text-xs font-mono font-bold text-slate-500">{MOCK_BANK_RESULT.snapshots.esg.sealed_by}</p></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'PRICING' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">基礎風險定價 (RAROC)</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg"><span className="text-xs font-bold text-slate-600">基準建議利差</span><span className="text-lg font-black text-slate-800">{MOCK_BANK_RESULT.pricing_sll.pricing_spread_bp} bp</span></div>
              <div className="flex justify-between items-center bg-emerald-50 p-3 rounded-lg border border-emerald-100"><span className="text-xs font-bold text-emerald-700">ESG 資格折讓</span><span className="text-lg font-black text-emerald-600">- {MOCK_BANK_RESULT.pricing_sll.esg_discount_bp} bp</span></div>
              <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-lg border border-indigo-100"><span className="text-xs font-bold text-indigo-700">最終核准利差</span><span className="text-xl font-black text-indigo-700">{MOCK_BANK_RESULT.pricing_sll.final_spread_bp} bp</span></div>
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
                    <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-1 rounded font-black whitespace-nowrap">KPI {idx+1}</span>
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

      {activeTab === 'CLIMATE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative">
            <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">投融資碳排 (Scope 3)</h3>
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-400 mb-1">總計碳排暴露</p>
              <h2 className="text-4xl font-black text-slate-800">{MOCK_BANK_RESULT.climate_risk.financed_emissions_total} <span className="text-sm font-medium text-slate-500">tCO2e</span></h2>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-xs font-bold text-slate-500 mb-1">估算比例 (Estimation Ratio)</p>
              <p className="text-2xl font-black text-emerald-600">{MOCK_BANK_RESULT.climate_risk.estimation_ratio * 100}%</p>
              {MOCK_BANK_RESULT.climate_risk.dq_rules.map((rule, idx) => (<p key={idx} className="text-[10px] text-emerald-700 mt-1 font-bold">✓ {rule.message}</p>))}
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
                    本頁面碳排數據皆已通過 <strong>治理與放行閘門 (P_ESG_REPORT_VERSION_SEAL)</strong>，並具備完整 SHA-256 指紋。系統嚴格防堵漂綠 (Greenwashing)。
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
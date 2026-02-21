'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { 
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';

export default function SecuritiesIndustryPage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'RESEARCH' | 'PM_DECISION' | 'COMPLIANCE' | 'PEDIGREE'>('RESEARCH');
  const [selectedCompany, setSelectedCompany] = useState('2330');
  
  const [finData, setFinData] = useState<any[]>([]);
  const [mktData, setMktData] = useState<any[]>([]);
  const [esgData, setEsgData] = useState<any>(null);
  const [eventsData, setEventsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 取得真實資料
  const fetchData = async (companyCode: string) => {
    setIsLoading(true);
    try {
      const { data: fin } = await supabase.from('fin_financial_fact').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('period', { ascending: false }).limit(12);
      setFinData(fin || []);
      
      const { data: mkt } = await supabase.from('mkt_daily_series').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('trade_date', { ascending: false }).limit(5);
      setMktData(mkt || []);
      
      const { data: esg } = await supabase.from('esg_metrics').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('period', { ascending: false }).limit(1);
      setEsgData(esg?.[0] || null);
      
      const { data: evts } = await supabase.from('mkt_material_events').select('*').eq('company_code', companyCode).eq('status', 'VALID').order('event_date', { ascending: false }).limit(5);
      setEventsData(evts || []);
    } catch (err) {
      console.error('資料獲取失敗:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted && session?.user) {
        setUser(session.user);
        supabase.from('sys_role_grants').select('role').eq('grantee_user_id', session.user.id).then(({ data }) => {
          if (isMounted) setRole(data?.[0]?.role || null);
        });
      }
      if (isMounted) fetchData('2330');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        if (session?.user) { setUser(session.user); } else { setUser(null); setRole(null); }
        setIsAuthLoading(false);
      }
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompany(e.target.value);
    fetchData(e.target.value);
  };

  const handleGoogleLogin = async () => {
    setIsAuthLoading(true);
    try { await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${window.location.pathname}` } }); } 
    catch (error: any) { alert('登入失敗'); setIsAuthLoading(false); }
  };
  
  const handleLogout = async () => { 
    await supabase.auth.signOut(); 
    window.location.reload(); 
  };

  const isSuperAdmin = role === 'superadmin' || user?.email === 'e10090903@gmail.com';
  const displayRole = isSuperAdmin ? '投資經理 (PM)' : (role ? role : '訪客模式');

  // ==========================================
  // P_SEC_PM_DECISION_ENGINE 動態運算核心
  // ==========================================
  const latestFin = finData[0] || null;
  const prevFin = finData[1] || null;
  const oldestFin = finData[finData.length - 1] || null;
  const latestMkt = mktData[0] || null;

  const missingFields = [];
  if (!latestFin?.revenue) missingFields.push('revenue');
  if (!latestFin?.net_income) missingFields.push('net_income');
  if (!latestFin?.operating_cash_flow) missingFields.push('operating_cash_flow');
  if (!latestFin?.total_assets) missingFields.push('total_assets');
  if (!latestMkt?.close) missingFields.push('market_price (close)');

  const isGapDetected = missingFields.length > 0;
  const isHistoryIncomplete = !isGapDetected && finData.length < 12;

  let cfo_ni = 0, debt_ratio = 0, revenue_growth = 0, cagr = 0;
  let hasControversy = false;
  let actionSignal = 'N/A';
  let rationale = '';

  if (!isGapDetected && latestFin) {
    cfo_ni = latestFin.operating_cash_flow / latestFin.net_income;
    debt_ratio = latestFin.total_liabilities / latestFin.total_assets;
    
    if (prevFin?.revenue && prevFin.revenue > 0) {
      revenue_growth = ((latestFin.revenue - prevFin.revenue) / prevFin.revenue) * 100;
    }
    
    if (finData.length >= 4 && oldestFin?.revenue > 0) {
      cagr = ((Math.pow(latestFin.revenue / oldestFin.revenue, 1 / (finData.length / 4))) - 1) * 100;
    }

    hasControversy = eventsData.some(e => e.severity === 'HIGH' || e.event_type === 'PENALTY');

    if (debt_ratio > 0.7 || hasControversy) {
      actionSignal = '減碼 (Reduce)';
      rationale = hasControversy 
        ? '系統偵測到 L1 資料源中包含重大裁罰或爭議事件，違反內部合規政策，建議立即執行減碼。' 
        : `財務槓桿過高 (最新一期負債比達 ${(debt_ratio*100).toFixed(1)}%)，流動性下檔風險劇增，建議降低曝險部位。`;
    } else if (cfo_ni < 0.8 || (prevFin && revenue_growth < 0)) {
      actionSignal = '觀望 (Hold)';
      rationale = `營收動能放緩或盈餘品質偏弱。最新一期 CFO/NI 轉換率為 ${cfo_ni.toFixed(2)} (低於 0.8 門檻)，顯示獲利未能有效轉化為營運現金流，建議暫緩加碼並觀察下季財報。`;
    } else {
      actionSignal = '買進 (Buy)';
      rationale = `依據已驗證之 ${finData.length} 季財務事實，基本面呈現強健態勢。營運現金流量足以完全覆蓋淨利 (CFO/NI 達 ${cfo_ni.toFixed(2)})，且財務槓桿處於安全水位 (${(debt_ratio*100).toFixed(1)}%)。綜合近期複合成長率 (CAGR) 達 ${cagr.toFixed(1)}%，且無重大 ESG 爭議，具備長期投資加碼價值。`;
    }
  }

  const chartData = [...finData].reverse().map(d => ({
    period: d.period,
    revenue: (d.revenue / 100000000).toFixed(0),
    margin: ((d.net_income / d.revenue) * 100).toFixed(1)
  }));

  const factorData = [
    { subject: '價值', score: isGapDetected ? 0 : 80, fullMark: 100 }, 
    { subject: '成長', score: isGapDetected ? 0 : (finData.length >=4 && cagr > 10 ? 95 : 65), fullMark: 100 },
    { subject: '動能', score: isGapDetected ? 0 : 75, fullMark: 100 },
    { subject: '品質', score: isGapDetected ? 0 : (cfo_ni >= 1 ? 95 : 70), fullMark: 100 },
    { subject: '低波動', score: isGapDetected ? 0 : 85, fullMark: 100 },
  ];

  return (
    <div className="p-6 md:p-8 animate-fade-in-up max-w-7xl mx-auto min-h-screen bg-[#F8FAFC]">
      
      {/* 🌟 Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 border-b border-slate-200 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold tracking-widest">證券業專屬視角</span>
            <h1 className="text-2xl font-black text-slate-800">自營投資與部位風控</h1>
          </div>
          <p className="text-xs font-bold text-slate-500">基於三年期 (12季) 基本面分析，遵循「研究 ➔ 決策 ➔ 風控 ➔ 溯源」之標準工作流。</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析標的</label>
              <select value={selectedCompany} onChange={handleCompanyChange} className="text-sm font-black text-slate-700 bg-transparent focus:outline-none cursor-pointer">
                <option value="2330">2330 台積電</option>
                <option value="2317">2317 鴻海</option>
                <option value="2454">2454 聯發科</option>
              </select>
            </div>
            <span className="text-[9px] text-slate-400 font-bold tracking-wider">最新市價: {latestMkt ? `${latestMkt.close} 元` : '未同步'}</span>
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

      {/* 🌟 Tab 頁籤 */}
      <div className="flex gap-6 mb-6 border-b border-slate-200 overflow-x-auto hide-scrollbar">
        {[
          { id: 'RESEARCH', label: '1. 基本面與研究 (3年期)' },
          { id: 'PM_DECISION', label: '2. 自營 PM 決策台' },
          { id: 'COMPLIANCE', label: '3. 法遵與風控 (Watchlist)' },
          { id: 'PEDIGREE', label: '4. 資料血緣與品質溯源' }
        ].map(tab => (
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

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      ) : (
        <>
          {/* 防呆攔截 (Gap Report) */}
          {isGapDetected && activeTab !== 'PEDIGREE' && (
            <div className="mb-6 bg-slate-900 text-white p-6 rounded-2xl shadow-xl border-l-4 border-rose-500 flex items-start gap-5 animate-pulse">
              <div className="text-4xl mt-1">🚧</div>
              <div>
                <h3 className="text-base font-black text-rose-400 mb-2 tracking-widest uppercase">防篡改引擎攔截 (Gap Detected)</h3>
                <p className="text-sm text-slate-300 font-medium leading-relaxed mb-3">
                  系統偵測到該實體缺乏基礎資料源，不滿足 3 年期分析要件。引擎已主動停止產出虛假風控數字。
                </p>
                <div className="bg-black/50 border border-slate-700 p-3 rounded-lg inline-block">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Missing Core Fields:</p>
                  <p className="text-xs text-rose-300 font-mono">[{missingFields.join(', ')}]</p>
                </div>
              </div>
            </div>
          )}

          {/* 歷史資料不足警告 */}
          {isHistoryIncomplete && !isGapDetected && activeTab === 'RESEARCH' && (
            <div className="mb-6 bg-amber-50 text-amber-900 p-4 rounded-xl border border-amber-200 flex items-start gap-4 shadow-sm">
              <div className="text-2xl mt-0.5">⚠️</div>
              <div>
                <h3 className="text-sm font-black mb-1">歷史資料未達三年 (12季) 標準</h3>
                <p className="text-xs font-medium leading-relaxed">
                  資料庫內目前僅存有 <strong>{finData.length} 季</strong> 狀態為 VALID 之財報。依據證券業合規標準，圖表與 CAGR 將僅基於現有真實數據渲染，<strong>系統拒絕進行任何歷史資料假造或推估</strong>。
                </p>
              </div>
            </div>
          )}

          {/* ==========================================
              模組 1：基本面研究
          ========================================== */}
          {activeTab === 'RESEARCH' && !isGapDetected && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">歷史財務趨勢 (營收 vs 淨利率)</h3>
                      <p className="text-[10px] text-indigo-600 font-bold mt-1">分析基礎：有效快照 {finData.length} 季</p>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: fin_financial_fact</span>
                  </div>
                  
                  <div style={{ width: '100%', height: 280 }} className="mb-6">
                    <ResponsiveContainer>
                      <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="period" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}億`} />
                        <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#64748B'}} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }} />
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                        <Bar yAxisId="left" dataKey="revenue" name="營業收入(億)" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={30} />
                        <Line yAxisId="right" type="monotone" dataKey="margin" name="淨利率(%)" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, fill: '#4F46E5', strokeWidth: 2 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-500 mb-3 tracking-widest border-b border-slate-100 pb-2">複合成長率 (CAGR)</h3>
                  <div className={`flex items-end justify-between p-4 rounded-xl border mb-4 ${finData.length >= 4 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-xs font-bold ${finData.length >= 4 ? 'text-emerald-800' : 'text-slate-500'}`}>基於 {finData.length} 季換算</span>
                    <span className={`text-3xl font-black ${finData.length >= 4 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {finData.length >= 4 ? `${cagr.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-500 mb-2 tracking-widest">系統總結論點 (Key Thesis)</h3>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {rationale}
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <button className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700">封存並發布研究報告 (Seal)</button>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              模組 2：PM 決策台
          ========================================== */}
          {activeTab === 'PM_DECISION' && !isGapDetected && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
              <div className={`md:col-span-1 p-6 rounded-2xl shadow-sm flex flex-col justify-between border
                ${actionSignal.includes('買進') ? 'bg-emerald-50 border-emerald-200' : actionSignal.includes('觀望') ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}
              `}>
                <div>
                  <p className="text-sm font-bold text-slate-700 mb-2 tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span> 系統建議操作
                  </p>
                  <h2 className="text-5xl font-black text-slate-900 mb-4">{actionSignal}</h2>
                  <p className="text-xs font-bold text-slate-600 bg-white inline-block px-3 py-1.5 rounded-lg border shadow-sm mb-6">
                    投資分型: 價值成長型 (GARP)
                  </p>
                  
                  <div className="bg-white/70 p-4 rounded-xl border border-white shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200/50 pb-1">AI 決策依據分析</p>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">{rationale}</p>
                  </div>
                </div>
                <div className="mt-8 pt-4 border-t border-slate-200/50 text-right">
                  <span className="text-[9px] bg-white/60 text-slate-600 px-2 py-1 rounded font-mono font-bold">Engine: P_SEC_PM_DECISION</span>
                </div>
              </div>

              <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                    <h3 className="text-sm font-bold text-slate-800">當期核心驅動因子 (Latest Drivers)</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: DER_FIN_SNAPSHOT</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-bold mb-1">現金流品質 (CFO/NI)</p>
                      <p className={`text-3xl font-black ${cfo_ni < 0.8 ? 'text-rose-600' : 'text-emerald-600'}`}>{cfo_ni.toFixed(2)}</p>
                      <p className="text-[10px] text-slate-400 mt-1">健康門檻: &gt; 0.8</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-bold mb-1">槓桿比率 (Debt Ratio)</p>
                      <p className={`text-3xl font-black ${debt_ratio > 0.7 ? 'text-rose-600' : 'text-slate-800'}`}>{(debt_ratio * 100).toFixed(1)}%</p>
                      <p className="text-[10px] text-slate-400 mt-1">警戒門檻: &gt; 70%</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-bold mb-1">當期營收成長 (YoY)</p>
                      <p className={`text-3xl font-black ${revenue_growth < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {revenue_growth ? (revenue_growth > 0 ? '+' : '') + revenue_growth.toFixed(1) + '%' : 'N/A'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">需與去年同期比較</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">產出投資決策備忘錄</h3>
                    <p className="text-xs text-slate-500">將上述決策與因子鎖定，並寫入自營部位管理系統。</p>
                  </div>
                  <button className="px-5 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl shadow hover:bg-indigo-700 transition">鎖定決策並封存 (Seal)</button>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              模組 3：法遵與風控
          ========================================== */}
          {activeTab === 'COMPLIANCE' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
              <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <h3 className="text-sm font-bold text-slate-500 mb-4 tracking-widest border-b border-slate-100 pb-2">投資限制引擎 (Watchlist)</h3>
                <div className={`flex items-center gap-3 p-4 rounded-xl border ${hasControversy ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="text-3xl">{hasControversy ? '⚠️' : '✅'}</div>
                  <div>
                    <p className={`text-xs font-bold ${hasControversy ? 'text-rose-800' : 'text-emerald-800'}`}>重大裁罰/爭議監控</p>
                    <p className={`text-xl font-black ${hasControversy ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {hasControversy ? '觸發限制' : '安全 (APPROVED)'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">L1 監理公告與裁罰日誌</h3>
                  <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Source: mkt_material_events</span>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {eventsData.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">近一年無重大裁罰或爭議事件。</p>
                  ) : (
                    eventsData.map((ev, idx) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex gap-4 items-start">
                        <div className="w-24 shrink-0">
                          <span className={`text-[10px] px-2 py-1 rounded font-bold block text-center mb-1 ${ev.severity === 'HIGH' || ev.event_type === 'PENALTY' ? 'bg-rose-200 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
                            {ev.event_type}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 text-center block">{ev.event_date}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-700 mb-1">{ev.headline}</p>
                          <p className="text-[9px] text-slate-400 font-mono">Status: {ev.status}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              模組 4：資料血緣與品質溯源
          ========================================== */}
          {activeTab === 'PEDIGREE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in-up">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🏦 財務指標快照</h3>
                  {finData.length >= 12 ? <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-1 rounded font-black border border-emerald-200">VALID (3 YR)</span> : <span className="bg-amber-50 text-amber-700 text-[10px] px-2 py-1 rounded font-black border border-amber-200">VALID ({finData.length} 季)</span>}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">已取得期數</p>
                    <p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                      {finData.length > 0 ? `共 ${finData.length} 期 (完全基於真實資料表)` : '查無放行數據'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">優先級資料源 (Sources)</p>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-bold">SRC_TWSE_OPENAPI_FIN</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">🌱 永續指標快照</h3>
                  {esgData ? <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-1 rounded font-black border border-emerald-200">VALID</span> : <span className="bg-amber-50 text-amber-700 text-[10px] px-2 py-1 rounded font-black border border-amber-200">PENDING_REVIEW</span>}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">碳排數據與 ESG 評分</p>
                    <p className="text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                      {esgData ? `${esgData.carbon_emission.toLocaleString()} tCO2e | Score: ${esgData.esg_score || 'N/A'}` : '查無核決數據'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">資料源 (Sources)</p>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded font-bold">SRC_ESG_SCORE</span>
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
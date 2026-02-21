// app/reports/page.tsx
import Link from 'next/link';
import ReportSealClient from '@/components/ReportSealClient';
import { supabase } from '@/utils/supabase';

export default async function FinancialReportPage() {
  let fetchedRealData: any = null;

  try {
    const { data, error } = await supabase
      .from('fin_financial_fact')
      .select('*')
      .eq('company_code', '2330')
      .single();
      
    if (data && !error) {
      fetchedRealData = {
        company_code: data.company_code,
        period: data.period || "2025-Q3",
        metrics: { revenue: data.revenue, netIncome: data.net_income },
        generated_at: new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn("⚠️ 尚未建立或無法讀取 fin_financial_fact 表格");
  }

  if (!fetchedRealData) {
    fetchedRealData = {
      company_code: "2330",
      period: "2025-Q3",
      metrics: { revenue: 750000000, netIncome: 300000000 },
      generated_at: new Date().toISOString(),
      note: "目前顯示為系統預設值 (因尚未連接真實 DB)"
    };
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto bg-[#F8FAFC] min-h-screen">
      
      {/* 🌟 [修復] 補上與首頁完全一致的點擊導覽列 */}
      <nav className="flex justify-between items-center mb-10 pb-4 border-b border-slate-200">
        <Link href="/" className="text-3xl font-black tracking-tighter flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="bg-slate-900 text-white px-3 py-1 rounded-lg shadow-sm">FIDUCIA</span>
          <span className="text-slate-800 uppercase">Core</span>
        </Link>
        <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-800 underline underline-offset-4 transition-colors">
          返回大廳 ↩
        </Link>
      </nav>

      <h1 className="text-2xl font-bold mb-6 text-slate-800 flex items-center gap-2">
        🏛️ 合規報表中心 (真實數據模式)
      </h1>
      
      <div className="bg-white shadow-sm rounded-xl p-6 mb-6 border border-slate-200">
        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-black text-slate-700">2025 Q3 綜合損益表</h2>
          <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs rounded-full font-bold">草稿狀態</span>
        </div>
        
        <pre className="bg-slate-900 text-emerald-400 p-5 rounded-lg text-sm overflow-auto mb-6 shadow-inner font-mono">
          {JSON.stringify(fetchedRealData, null, 2)}
        </pre>
        
        <ReportSealClient realReportData={fetchedRealData} />
      </div>
    </div>
  );
}
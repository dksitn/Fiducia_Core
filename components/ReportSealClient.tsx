'use client';
import { useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function ReportSealClient({ realReportData }: { realReportData: any }) {
  const [isSealing, setIsSealing] = useState(false);

  const handleSealReport = async () => {
    setIsSealing(true);
    try {
      // 1. 取得當前登入者 session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('🔒 請先登入才能執行封存。');

      // 2. 呼叫核心封存引擎 API
      const res = await fetch('/api/plugins/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId: 'P_FIN_REPORT_VERSION_SEAL',
          userId: session.user.id,
          input: {
            // 嚴格對齊 sealEngines.ts 預期的參數，並兼容不同的取值命名 (company_code 或 company)
            companyId: realReportData.company_code || realReportData.company || '2330',
            period: realReportData.period || '2024-Q4',
            reportScope: 'quarterly',
            statementSet: 'full_fs',
            sourceSystem: 'internal_erp',
            payload: realReportData // 原始業務數據整包傳入給核心算 Hash
          }
        })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '封存失敗');
      
      alert(`✅ 真實財報已成功寫入不可篡改金庫！\nHash: ${result.version_hash || result.fingerprint || '請查看系統列表'}`);
      
    } catch (err: any) {
      console.error("封存過程發生錯誤:", err);
      alert(err.message);
    } finally {
      setIsSealing(false);
    }
  };

  return (
    <div className="mt-4 flex justify-end bg-gray-50 -mx-6 -mb-6 p-4 rounded-b-lg border-t border-slate-200">
      <button 
        onClick={handleSealReport} 
        disabled={isSealing}
        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg shadow-sm font-bold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isSealing ? '🔄 正在加密封存中...' : '🔒 產生並封存真實合規報告'}
      </button>
    </div>
  );
}
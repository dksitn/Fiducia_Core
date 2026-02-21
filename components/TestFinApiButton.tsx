'use client';
import { useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function TestFinApiButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTestAPI = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      // 1. 取得目前登入者的 UID (配合我們的 RLS 安全規則)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("請先登入系統！");

      // 2. 模擬 ERP 系統打過來的假財報數據 (Payload)
      const mockPayload = {
        companyCode: "2330",
        period: "2024-Q4",
        userId: session.user.id, // 傳入 UID 讓後端寫入 created_by
        metrics: {
          revenue: 2500000000,
          netIncome: 850000000,
          eps: 32.5,
          currency: "TWD",
          source: "ERP_TEST_MOCK"
        }
      };

      // 3. 呼叫我們剛建好的嚴謹架構 L2 API
      const res = await fetch('/api/v1/fin/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockPayload)
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error?.message || "API 呼叫失敗");
      
      setResult(`✅ 成功！\n資料庫 ID: ${data.data.id}\n狀態: ${data.data.status}`);
      
    } catch (err: any) {
      setResult(`❌ 失敗: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mt-4">
      <h3 className="text-sm font-bold text-slate-800 mb-2">L2 API 串接測試區</h3>
      <button 
        onClick={handleTestAPI}
        disabled={isLoading}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? '發送中...' : '🚀 模擬外部系統發送 L2 財報'}
      </button>
      
      {result && (
        <pre className="mt-3 p-3 bg-slate-900 text-emerald-400 text-xs rounded-lg overflow-auto">
          {result}
        </pre>
      )}
    </div>
  );
}
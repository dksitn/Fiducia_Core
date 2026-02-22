'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from './auth-context'; // ✅ 確保路徑正確

// ── 1. 獨立 Sidebar 元件 (確保能讀取 useAuth) ──
function Sidebar() {
  const pathname = usePathname();
  // ✅ 這裡會從 AuthProvider 取得統一狀態
  const { user, isSuperAdmin, handleLogout, role } = useAuth();

  const getLinkClass = (path: string) => {
    const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
    return `block px-4 py-2.5 text-sm font-bold rounded-lg transition-colors ${
      isActive 
        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' 
        : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
    }`;
  };

  const displayRole = isSuperAdmin ? 'System Admin' : role ?? '訪客 (唯讀)';

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm shrink-0 z-20">
      <div className="p-6 border-b border-slate-100">
        <h1 className="text-2xl font-black tracking-tighter italic">
          FIDUCIA <span className="text-indigo-600">Core</span>
        </h1>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto space-y-1">
        <div className="pb-4">
          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">系統管理 (ADMIN)</p>
          <Link href="/dashboard/admin" className={getLinkClass('/dashboard/admin')}>⚙️ 底層控制台</Link>
        </div>

        <div className="pb-4">
          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">治理流程 (GOVERNANCE)</p>
          <Link href="/dashboard/governance" className={getLinkClass('/dashboard/governance')}>🔒 治理與放行</Link>
          <Link href="/dashboard/traceability" className={getLinkClass('/dashboard/traceability')}>🔍 追溯查詢</Link>
        </div>

        <div className="pb-4">
          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">資料維度 (ANALYSIS)</p>
          <Link href="/dashboard/finance" className={getLinkClass('/dashboard/finance')}>📊 財務分析</Link>
          <Link href="/dashboard/esg" className={getLinkClass('/dashboard/esg')}>🌱 ESG / 永續</Link>
        </div>

        <div className="pb-4">
          <p className="px-4 text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">產業垂直視覺化</p>
          <Link href="/dashboard/industry/bank" className={getLinkClass('/dashboard/industry/bank')}>🏦 銀行業 (企業授信)</Link>
          {/* 🚀 補上漏掉的金控組合 */}
          <Link href="/dashboard/industry/fhc" className={getLinkClass('/dashboard/industry/fhc')}>🏢 金融業 (金控組合)</Link>
          <Link href="/dashboard/industry/securities" className={getLinkClass('/dashboard/industry/securities')}>📈 證券業 (投資分析)</Link>
        </div>
      </nav>

      {/* 底部登入狀態區 */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
        {user ? (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-500 truncate" title={user.email}>{user.email}</p>
            <p className={`text-[10px] font-black ${isSuperAdmin ? 'text-rose-600' : 'text-indigo-600'}`}>
              {displayRole}
            </p>
            <button 
              onClick={handleLogout} 
              className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors"
            >
              登出系統
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400 italic">尚未登入系統</p>
        )}
      </div>
    </aside>
  );
}

// ── 2. 主佈局元件 ──
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider> 
      <div className="flex h-screen bg-[#F8FAFC] font-sans text-slate-800 overflow-hidden">
        {/* ✅ Sidebar 必須在 Provider 內才能抓到狀態 */}
        <Sidebar />
        
        <main className="flex-1 overflow-y-auto relative bg-[#F8FAFC]">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
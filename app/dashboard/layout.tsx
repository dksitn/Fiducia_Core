// app/dashboard/layout.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from './auth-context'; // ✅ 統一使用這個

// ── 內部元件：為了能使用 useAuth，側邊欄必須抽出來 ──
function Sidebar() {
  const pathname = usePathname();
  const { user, isSuperAdmin, isAuthLoading, handleGoogleLogin, handleLogout, role } = useAuth();

  const getLinkClass = (path: string) => {
    const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
    return `block px-4 py-2.5 text-sm font-bold rounded-lg transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
    }`;
  };

  const displayRole = isSuperAdmin ? 'System Admin' : role ?? '訪客 (唯讀)';

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm shrink-0">
      <div className="p-6 border-b border-slate-100">
        <h1 className="text-2xl font-black tracking-tighter">FIDUCIA <span className="text-indigo-600">Core</span></h1>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto space-y-6">
        {/* ...你的所有 Link 導航區塊... */}
      </nav>

      {/* 底部登入區：側邊欄維持簡單的登出按鈕 */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
        {user && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 truncate">{user.email}</p>
            <p className={`text-[10px] font-black ${isSuperAdmin ? 'text-rose-600' : 'text-indigo-600'}`}>{displayRole}</p>
            <button onClick={handleLogout} className="text-xs font-bold text-slate-500 hover:text-red-600">登出</button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider> {/* ✅ 所有的狀態都在這裡統一管理 */}
      <div className="flex h-screen bg-[#F8FAFC] font-sans text-slate-800 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative bg-[#F8FAFC]">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
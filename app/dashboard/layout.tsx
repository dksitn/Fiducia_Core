'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '@/utils/supabase';

// ─────────────────────────────────────────────
// Auth Context：讓所有子頁面都能讀取登入狀態
// 用法：const { user, isSuperAdmin, isAuthLoading } = useAuth();
// ─────────────────────────────────────────────
interface AuthContextType {
  user: any;
  role: string | null;
  isSuperAdmin: boolean;
  isAuthLoading: boolean;
  handleGoogleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isSuperAdmin: false,
  isAuthLoading: false,
  handleGoogleLogin: async () => {},
  handleLogout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ─────────────────────────────────────────────
// Layout 主體
// ─────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const isSuperAdmin = role === 'superadmin' || user?.email === 'e10090903@gmail.com';

  // 初始化：取得 session + role
  useEffect(() => {
    let isMounted = true;

    const loadAuth = async (sessionUser: any) => {
      if (!sessionUser) {
        if (isMounted) { setUser(null); setRole(null); setIsAuthLoading(false); }
        return;
      }
      setUser(sessionUser);
      const { data } = await supabase
        .from('sys_role_grants')
        .select('role')
        .eq('grantee_user_id', sessionUser.id)
        .maybeSingle();
      if (isMounted) {
        setRole(data?.role ?? null);
        setIsAuthLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) loadAuth(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) loadAuth(session?.user ?? null);
    });

    return () => { isMounted = false; subscription.unsubscribe(); };
  }, []);

  const handleGoogleLogin = async () => {
    setIsAuthLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard/admin`,
        queryParams: { prompt: 'select_account' }
      }
    });
  };

  const handleLogout = async () => {
    setIsAuthLoading(true);
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/dashboard';
  };

  // 側邊欄 active link 樣式
  const getLinkClass = (path: string) => {
    const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
    return `block px-4 py-2.5 text-sm font-bold rounded-lg transition-colors ${
      isActive
        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
        : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
    }`;
  };

  const displayRole = isSuperAdmin
    ? 'System Admin'
    : role ?? '訪客 (唯讀)';

  return (
    <AuthContext.Provider value={{ user, role, isSuperAdmin, isAuthLoading, handleGoogleLogin, handleLogout }}>
      <div className="flex h-screen bg-[#F8FAFC] font-sans text-slate-800 overflow-hidden">

        {/* ─── 左側 Sidebar ─── */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm shrink-0">

          {/* Logo */}
          <div className="p-6 border-b border-slate-100">
            <h1 className="text-2xl font-black tracking-tighter">
              FIDUCIA <span className="text-indigo-600">Core</span>
            </h1>
            <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">
              Data Governance Platform
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto">

            {/* 管理層 (Admin) */}
            <div className="mb-6">
              <p className="px-4 text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">
                系統管理 (Admin)
              </p>
              <div className="space-y-1">
                <Link href="/dashboard/admin" className={getLinkClass('/dashboard/admin')}>
                  ⚙️ 底層控制台
                </Link>
              </div>
            </div>

            {/* 核心治理 */}
            <div className="mb-6">
              <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                核心治理底座 (Core)
              </p>
              <div className="space-y-1">
                <Link href="/dashboard" className={getLinkClass('/dashboard')}>總覽</Link>
                <Link href="/dashboard/finance" className={getLinkClass('/dashboard/finance')}>財務分析</Link>
                <Link href="/dashboard/esg" className={getLinkClass('/dashboard/esg')}>ESG / 永續</Link>
                <Link href="/dashboard/governance" className={getLinkClass('/dashboard/governance')}>
                  治理與放行 (核決樞紐)
                </Link>
                <Link href="/dashboard/traceability" className={getLinkClass('/dashboard/traceability')}>
                  追溯查詢
                </Link>
              </div>
            </div>

            {/* 產業垂直 */}
            <div>
              <p className="px-4 text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">
                產業決策視覺化 (Verticals)
              </p>
              <div className="space-y-1">
                <Link href="/dashboard/industry/bank" className={getLinkClass('/dashboard/industry/bank')}>
                  🏦 銀行業 (企金授信)
                </Link>
                <Link href="/dashboard/industry/securities" className={getLinkClass('/dashboard/industry/securities')}>
                  📈 證券業 (自營風控)
                </Link>
                <Link href="/dashboard/industry/fhc" className={getLinkClass('/dashboard/industry/fhc')}>
                  🏛️ 金控業 (集團合規)
                </Link>
              </div>
            </div>
          </nav>

          {/* 底部：登入狀態 */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
            {isAuthLoading ? (
              <div className="flex items-center gap-2 px-1">
                <div className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                <span className="text-xs text-slate-400 font-bold">驗證中...</span>
              </div>
            ) : user ? (
              <div className="space-y-2">
                {/* 身份資訊 */}
                <div className="px-1">
                  <p className="text-[10px] font-black text-slate-400 truncate">{user.email}</p>
                  <p className={`text-[10px] font-black mt-0.5 ${isSuperAdmin ? 'text-rose-600' : 'text-indigo-600'}`}>
                    {displayRole}
                  </p>
                </div>
                {/* 登出按鈕 */}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  登出
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow-sm hover:shadow-md transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google 登入
              </button>
            )}
          </div>
        </aside>

        {/* ─── 主內容區 ─── */}
        <main className="flex-1 overflow-y-auto relative bg-[#F8FAFC]">
          {children}
        </main>

      </div>
    </AuthContext.Provider>
  );
}

// app/dashboard/auth-context.ts
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

export const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const isSuperAdmin = role === 'superadmin' || user?.email === 'e10090903@gmail.com';

  useEffect(() => {
    let isMounted = true;
    const loadAuth = async (sessionUser: any) => {
      if (!sessionUser) {
        if (isMounted) { setUser(null); setRole(null); setIsAuthLoading(false); }
        return;
      }
      if (isMounted) setUser(sessionUser);
      const { data } = await supabase.from('sys_role_grants').select('role').eq('grantee_user_id', sessionUser.id).maybeSingle();
      if (isMounted) { setRole(data?.role ?? null); setIsAuthLoading(false); }
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
      options: { redirectTo: `${window.location.origin}/dashboard/admin`, queryParams: { prompt: 'select_account' } }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear(); sessionStorage.clear();
    window.location.href = '/dashboard';
  };

  return (
    <AuthContext.Provider value={{ user, role, isSuperAdmin, isAuthLoading, handleGoogleLogin, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) return { user: null, role: null, isSuperAdmin: false, isAuthLoading: true, handleGoogleLogin: () => {}, handleLogout: () => {} };
  return context;
};
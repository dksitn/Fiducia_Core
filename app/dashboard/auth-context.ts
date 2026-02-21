'use client';
import { createContext, useContext } from 'react';

// ✅ 實作防禦性編程：給予安全的預設空殼 (Safe Default Object)
export const AuthContext = createContext<any>({
  user: null,
  role: null,
  isSuperAdmin: false,
  isAuthLoading: true, // 預設為載入中，避免畫面閃爍
  handleGoogleLogin: async () => {},
  handleLogout: async () => {},
});

export const useAuth = () => useContext(AuthContext);
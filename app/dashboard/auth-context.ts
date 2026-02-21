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

export const useAuth = () => {
  const context = useContext(AuthContext);
  
  // 🛡️ 絕對防禦：如果拿不到 Context (例如在 Next.js 預渲染期間)，就回傳一個安全的空殼
  if (!context) {
    return {
      user: null,
      role: null,
      isSuperAdmin: false,
      isAuthLoading: true, // 保持載入狀態，避免畫面提早噴錯
      handleGoogleLogin: async () => {},
      handleLogout: async () => {},
    };
  }
  
  return context;
};
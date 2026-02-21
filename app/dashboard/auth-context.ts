'use client';

import { createContext, useContext } from 'react';

// 單純定義 Context 殼，不包含任何邏輯，避免與 Layout 綁死
export const AuthContext = createContext<any>(null);

// 匯出 Hook 供所有子頁面 (如 bank/page.tsx) 乾淨地引用
export const useAuth = () => useContext(AuthContext);
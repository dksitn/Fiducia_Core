'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // 登入成功後，把使用者導向回我們的治理控制台首頁
          redirectTo: `${window.location.origin}/`,
          // 強制出現 Google 帳號選擇畫面，方便測試不同角色的帳號切換
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
      
    } catch (error: any) {
      alert('登入失敗: ' + error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 border border-gray-100 text-center">
        {/* 平台 Logo 與標語 */}
        <h1 className="text-3xl font-black tracking-tighter mb-2 flex items-center justify-center gap-2">
          <span className="bg-blue-600 text-white px-3 py-1 rounded-lg">FIDUCIA</span>
          <span className="text-gray-800 uppercase">Core</span>
        </h1>
        <p className="text-sm text-gray-500 font-bold mb-10">金融級治理底座・合規放行閘門</p>
        
        {/* 純 SSO 登入區塊 */}
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-400 font-bold tracking-widest uppercase mb-2">
            Enterprise Single Sign-On
          </p>
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-700 font-bold text-sm py-3.5 px-4 rounded-xl hover:bg-gray-50 hover:border-blue-300 transition-all shadow-sm hover:shadow disabled:opacity-50"
          >
            {/* Google Logo SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {isLoading ? '安全連線中...' : '使用 Google Workspace 登入'}
          </button>
          
          <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
            系統已停用本機密碼登入。<br/>
            請使用經授權的企業 Google 帳號進行身分驗證。
          </p>
        </div>
      </div>
    </div>
  );
}
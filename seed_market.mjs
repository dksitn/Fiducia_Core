// seed_market.mjs
import yf from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 🌟 R9 核心升級：手動指定讀取 .env.local 檔案
dotenv.config({ path: '.env.local' });

const yahooFinance = typeof yf === 'function' ? new yf() : yf;

// 從環境變數安全地讀取金鑰
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// 防呆機制：如果忘記設定環境變數，提早報錯
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ 錯誤：找不到 Supabase 環境變數，請確認 .env.local 檔案是否存在且包含 URL 與 SERVICE_ROLE_KEY。");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ... 下方的 COMPANIES 與 fetchAndUpload 函數保持不變 ...
const COMPANIES = {
// ... (略) ...
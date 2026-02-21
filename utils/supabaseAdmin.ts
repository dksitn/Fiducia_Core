import { createClient } from '@supabase/supabase-js';

// 這個 Client 具備跳過 RLS 的權限，僅能在伺服器端使用
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
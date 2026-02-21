// utils/plugins/canonicalize.ts

/**
 * 將 JSON 物件進行決定性排序 (Deterministic Canonicalization)
 * 確保相同的資料，無論 Key 的順序如何，都會產出完全一樣的字串
 */
export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(obj).sort();
  const sortedObj: string[] = [];
  for (const key of keys) {
    if (obj[key] !== undefined) {
      // 遞迴處理巢狀結構
      sortedObj.push(`${JSON.stringify(key)}:${canonicalize(obj[key])}`);
    }
  }
  return `{${sortedObj.join(',')}}`;
}

/**
 * 產生 SHA-256 數位指紋 (使用 Web Crypto API 或 Node crypto)
 * 這裡使用 Node.js 原生的 crypto，因為我們在 Next.js 後端 (Route Handler) 執行
 */
import crypto from 'crypto';

export async function generateSHA256(dataString: string): Promise<string> {
  // 使用 Node.js 的 crypto 模組來計算 SHA-256，最穩定且支援度最高
  return crypto.createHash('sha256').update(dataString).digest('hex');
}
const crypto = require('crypto');

const secret = 'super-secret-financial-key-2026';
const payload = JSON.stringify({
  repo: "core-banking-v2",
  commit_hash: "abcd" + Date.now().toString().substring(8), // 每次產生不一樣的 commit 避免被冪等性擋下
  branch: "main",
  author: "Alice"
});

const timestamp = Date.now().toString();
// 產生正確的 HMAC 簽章
const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

fetch('http://localhost:3000/api/escrow/commit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Fiducia-Timestamp': timestamp,
    'X-Fiducia-Signature': signature
  },
  body: payload
}).then(res => res.json()).then(console.log);
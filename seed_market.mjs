import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const COMPANIES = {'2330':'2330.TW','2317':'2317.TW','2454':'2454.TW','2881':'2881.TW','2882':'2882.TW','2891':'2891.TW','1301':'1301.TW','2002':'2002.TW','1216':'1216.TW','2308':'2308.TW','TAIEX':'^TWII'};
const p1 = Math.floor(Date.now()/1000) - 365*24*3600;
const p2 = Math.floor(Date.now()/1000);
async function fetch_yahoo(ticker) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${p1}&period2=${p2}`,{headers:{'User-Agent':'Mozilla/5.0'}});
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if(!res) throw new Error('no result');
  const ts = res.timestamp??[], q = res.indicators?.quote?.[0]??{};
  return ts.map((t,i)=>({trade_date:new Date(t*1000).toISOString().split('T')[0],open:q.open?.[i]?+q.open[i].toFixed(2):null,high:q.high?.[i]?+q.high[i].toFixed(2):null,low:q.low?.[i]?+q.low[i].toFixed(2):null,close:q.close?.[i]?+q.close[i].toFixed(2):null,volume:q.volume?.[i]??0})).filter(r=>r.close);
}
let total=0,failed=[];
for(const [code,ticker] of Object.entries(COMPANIES)){
  process.stdout.write(`[${code}]...`);
  try{
    const rows=await fetch_yahoo(ticker);
    if(!rows.length) throw new Error('empty');
    const recs=rows.map(r=>({company_code:code,...r,status:'VALID',dq_score:100,source_ref:'YAHOO_FINANCE'}));
    await supabase.from('mkt_daily_series').delete().eq('company_code',code);
    for(let i=0;i<recs.length;i+=100){const{error}=await supabase.from('mkt_daily_series').insert(recs.slice(i,i+100));if(error)throw error;}
    total+=recs.length; console.log(`OK ${recs.length}`);
  }catch(e){console.log(`FAIL:${e.message}`);failed.push(code);}
}
console.log('Total:',total,'Failed:',failed.join(','));

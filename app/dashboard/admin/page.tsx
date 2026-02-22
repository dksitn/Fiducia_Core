'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import * as XLSX from 'xlsx';
import DownloadReportButton from '@/components/DownloadReportButton';
// ✅ 統一從 dashboard/auth-context 引用狀態
import { useAuth } from '@/app/dashboard/auth-context';

const ALLOWED_PLUGINS = [
  'L1_MARKET_DAILY_SYNC', 'L1_MATERIAL_EVENTS_SYNC', 'L1_INDUSTRY_SYNC',
  'L1_INSIDER_HOLDINGS_SYNC', 'L1_DIVIDENDS_SYNC', 'TW_FUNDAMENTAL_SYNC',
  'ESG_METRICS_SYNC', 'P_FIN_REPORT_VERSION_SEAL', 'P_ESG_REPORT_VERSION_SEAL',
  'P_SEC_PM_DECISION_ENGINE', 'CVE_TRACK', 'DB_SCHEMA_DRIFT'
  // ✅ P_SEC_RESEARCH_REPORT_ENGINE 已移除
  // ✅ P_SEC_COMPLIANCE_RESTRICTION_ENGINE 已移除
];

const getPluginUIInfo = (pluginId: string) => {
  switch (pluginId) {
    case 'CVE_TRACK': return { icon: '🛡️', title: '系統安全掃描', desc: '掃描底層套件漏洞', btnText: '執行掃描', themeColor: '#E11D48' };
    case 'DB_SCHEMA_DRIFT': return { icon: '💾', title: '資料庫防篡改', desc: '對核心 Schema 快照', btnText: '擷取快照', themeColor: '#0284C7' };
    case 'P_FIN_REPORT_VERSION_SEAL': return { icon: '🏦', title: 'L3: 財報引擎與封存', desc: '計算 DQ 並版本封存', btnText: '執行封存', themeColor: '#4F46E5' };
    case 'P_ESG_REPORT_VERSION_SEAL': return { icon: '🌿', title: 'L3: 永續引擎與封存', desc: '驗證 SLL 並上鏈封存', btnText: '執行封存', themeColor: '#059669' };
    case 'TW_FUNDAMENTAL_SYNC': return { icon: '🏛️', title: 'L2: 官方財報同步', desc: '寫入近三期財報快照', btnText: '執行抓取', themeColor: '#475569' };
    case 'TW_MONTHLY_REVENUE_SYNC': return { icon: '📅', title: 'L2: 月營收同步', desc: 't187ap05_L 最新月份實際值', btnText: '執行同步', themeColor: '#0369A1' };
    case 'ESG_METRICS_SYNC': return { icon: '🌱', title: 'L2: 永續報告同步', desc: '寫入三年碳排與確信', btnText: '執行同步', themeColor: '#16A34A' };
    case 'L1_MARKET_DAILY_SYNC': return { icon: '📈', title: 'L1: 市場行情', desc: '時序同步 (T~T-2)', btnText: '同步行情', themeColor: '#D97706' };
    case 'L1_MATERIAL_EVENTS_SYNC': return { icon: '📢', title: 'L1: 重大事件', desc: '不可變附加重大裁罰', btnText: '同步事件', themeColor: '#DC2626' };
    case 'L1_INDUSTRY_SYNC': return { icon: '🏭', title: 'L1: 產業分類', desc: 'SCD 緩慢變動維度', btnText: '同步產業', themeColor: '#0891B2' };
    case 'L1_INSIDER_HOLDINGS_SYNC': return { icon: '🕵️', title: 'L1: 董監持股', desc: 'Append-Only 籌碼變動', btnText: '同步籌碼', themeColor: '#7C3AED' };
    case 'L1_DIVIDENDS_SYNC': return { icon: '💰', title: 'L1: 股利與除權息', desc: 'Append-Only 公司行動', btnText: '同步股利', themeColor: '#D946EF' };
    case 'P_SEC_PM_DECISION_ENGINE': return { icon: '📊', title: 'SEC: PM決策', desc: '計算風控與觸發 Gap', btnText: '執行運算', themeColor: '#2563EB' };
    // ✅ P_SEC_RESEARCH_REPORT_ENGINE 已移除
    // ✅ P_SEC_COMPLIANCE_RESTRICTION_ENGINE 已移除
    default: return { icon: '⚡', title: '任務', desc: '自定義腳本', btnText: '執行任務', themeColor: '#1E293B' };
  }
};

const getPluginIdFromSummary = (summary: string) => {
  if (!summary) return null;
  if (summary.includes('市場行情')) return 'L1_MARKET_DAILY_SYNC';
  if (summary.includes('重大訊息')) return 'L1_MATERIAL_EVENTS_SYNC';
  if (summary.includes('財報版本') || summary.includes('L3 封存') || summary.includes('財務指標')) return 'P_FIN_REPORT_VERSION_SEAL';
  if (summary.includes('永續') || summary.includes('ESG')) return 'ESG_METRICS_SYNC';
  if (summary.includes('財報三表') || summary.includes('L2 快照') || summary.includes('12季')) return 'TW_FUNDAMENTAL_SYNC';
  if (summary.includes('月營收')) return 'TW_MONTHLY_REVENUE_SYNC';
  if (summary.includes('PM 決策') || summary.includes('自營')) return 'P_SEC_PM_DECISION_ENGINE';
  if (summary.includes('供應鏈')) return 'CVE_TRACK';
  return null;
};

export default function AdminPage() {
  // ✅ 1. 從 Layout/AuthContext 取得全域狀態與登入函式
  const { user, isSuperAdmin, handleGoogleLogin, handleLogout } = useAuth();

  const [isRunningPlugin, setIsRunningPlugin] = useState<string | null>(null);
  const [evidences, setEvidences] = useState<any[]>([]);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pdfReportData, setPdfReportData] = useState<any>(null);
  const [isFetchingPdfData, setIsFetchingPdfData] = useState<string | null>(null);

  const fetchEvidences = async () => {
    try {
      const { data, error } = await supabase
        .from('sys_evidence_items')
        .select('*, sys_state_versions (version_hash, summary)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEvidences(data || []);
    } catch (err: any) {
      console.error('❌ [獲取證據失敗]:', err.message);
      setEvidences([]);
    }
  };

  const fetchPlugins = async () => {
    try {
      const { data } = await supabase.from('m01_plugin_registry').select('*').eq('is_enabled', true);
      const mockPlugins = [
        { id: 905, plugin_id: 'CVE_TRACK' }, { id: 906, plugin_id: 'DB_SCHEMA_DRIFT' },
        { id: 903, plugin_id: 'P_FIN_REPORT_VERSION_SEAL' }, { id: 904, plugin_id: 'P_ESG_REPORT_VERSION_SEAL' },
        { id: 901, plugin_id: 'TW_FUNDAMENTAL_SYNC' }, { id: 907, plugin_id: 'TW_MONTHLY_REVENUE_SYNC' },
        { id: 101, plugin_id: 'L1_MARKET_DAILY_SYNC' },
        { id: 102, plugin_id: 'L1_MATERIAL_EVENTS_SYNC' }, { id: 103, plugin_id: 'L1_INDUSTRY_SYNC' },
        { id: 104, plugin_id: 'L1_INSIDER_HOLDINGS_SYNC' }, { id: 105, plugin_id: 'L1_DIVIDENDS_SYNC' },
        { id: 902, plugin_id: 'ESG_METRICS_SYNC' }, { id: 911, plugin_id: 'P_SEC_PM_DECISION_ENGINE' },
        // ✅ id:912 P_SEC_RESEARCH_REPORT_ENGINE 已移除
        // ✅ id:913 P_SEC_COMPLIANCE_RESTRICTION_ENGINE 已移除
      ];
      const merged = [...(data || [])];
      mockPlugins.forEach(mp => { if (!merged.find(p => p.plugin_id === mp.plugin_id)) merged.push(mp); });
      setPlugins(merged);
    } catch (err: any) {
      console.error('❌ [獲取外掛失敗]:', err.message);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchEvidences(), fetchPlugins()]);
      setIsInitializing(false);
    };
    init();
  }, []);

  // ── 執行 Plugin（僅 superadmin）
  const handleRunPlugin = async (pluginId: string) => {
    if (!user || !isSuperAdmin) return alert('需要 System Admin 權限才能執行引擎');
    setIsRunningPlugin(pluginId);
    try {
      const res = await fetch('/api/plugins/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, userId: user.id })
      });
      if (!res.ok) throw new Error('任務執行失敗，請檢查後端引擎。');
      alert('🛡️ 任務執行完成！報告已自動加上數位指紋並封存。');
      fetchEvidences();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsRunningPlugin(null);
    }
  };

  // ── 核決資料（僅 superadmin）
  const handleApproveData = async (evidence: any) => {
    if (!isSuperAdmin) return alert('權限不足，需為 System Admin 才能核決入庫。');
    if (!confirm('確定要將此批 API 抓取的草稿資料 (DRAFT) 核決放行至正式資料庫 (VALID) 嗎？')) return;
    try {
      await supabase.from('fin_financial_fact').update({ status: 'VALID' }).eq('status', 'DRAFT');
      await supabase.from('fin_monthly_revenue').update({ status: 'VALID' }).eq('status', 'DRAFT');
      await supabase.from('esg_metrics').update({ status: 'VALID' }).eq('status', 'DRAFT');
      await supabase.from('mkt_daily_series').update({ status: 'VALID' }).eq('status', 'DRAFT');
      alert('✅ 核決成功！所有 L1/L2 數據皆已正式進入 Supabase 金庫 (VALID 狀態)。');
      fetchEvidences();
    } catch (err: any) {
      alert('❌ 核決失敗：' + err.message);
    }
  };

  // ── 下載 API Excel
  const handleDownloadApiExcel = async (storagePath: string, hash: string) => {
    if (!user) return alert('🔒 請先登入後再下載。');
    try {
      const { data, error } = await supabase.storage.from('governance').download(storagePath);
      if (error) throw error;
      const text = await data.text();
      const jsonData = JSON.parse(text);
      let exportData: any[] = [];
      if (jsonData.findings && Array.isArray(jsonData.findings)) {
        exportData = jsonData.findings.map((f: any) => {
          const raw = f.raw_data || {};
          return { '識別碼': f.id || raw.company_code, '同步狀態': f.status, 'DQ品質分數': f.dq_score || 'N/A', '系統判定異常': f.issues || 'PASS', ...raw };
        });
      } else {
        exportData = [{ '原始資料': JSON.stringify(jsonData) }];
      }
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "API_Raw_Data");
      XLSX.writeFile(wb, `API_Data_${hash.substring(0, 10)}.xlsx`);
    } catch (err: any) {
      alert('❌ 下載失敗：' + err.message);
    }
  };

  // ── 下載 Audit Excel
  const handleDownloadExcel = async (storagePath: string, hash: string, type: string) => {
    if (!user) return alert('🔒 請先登入後再下載。');
    try {
      const { data, error } = await supabase.storage.from('governance').download(storagePath);
      if (error) throw error;
      if (type === 'QUALITY_SUMMARY') {
        const url = window.URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = storagePath.split('/').pop() || `evidence_${hash}`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); return;
      }
      const text = await data.text();
      const jsonData = JSON.parse(text);
      let exportData: any[] = [];
      if (type === 'SOURCE_CODE_ESCROW') {
        const scan = jsonData.security_scan || {};
        const findings = scan.findings || [];
        exportData = findings.length > 0
          ? findings.map((f: any) => ({ '傳輸時間': new Date(jsonData.timestamp).toLocaleString('zh-TW'), '風險總評': scan.risk_level, '弱點編號': f.id, '弱點描述': f.desc, '放行狀態': jsonData.gate_status || 'APPROVED' }))
          : [{ '風險總評': 'CLEAN (無弱點)', '放行狀態': 'APPROVED' }];
      } else {
        const findings = jsonData.findings || jsonData.audit_report?.findings || [];
        exportData = findings.length > 0
          ? findings.map((f: any) => ({ '治理版本 (State Hash)': hash, '掃描工具': jsonData.source_plugin || 'Unknown', '識別碼': f.id, '嚴重性': f.severity, '詳細描述': f.desc }))
          : [{ '訊息': '掃描完成，未發現異常。' }];
      }
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Audit_Report");
      XLSX.writeFile(wb, `Fiducia_Audit_${hash.substring(0, 10)}.xlsx`);
    } catch (err: any) {
      alert('❌ 下載失敗：' + err.message);
    }
  };

  // ── 準備 PDF
  const handlePreparePdf = async (storagePath: string, evidenceId: string) => {
    setIsFetchingPdfData(evidenceId);
    try {
      const { data, error } = await supabase.storage.from('governance').download(storagePath);
      if (error) throw error;
      const text = await data.text();
      let parsedData = JSON.parse(text);
      if (parsedData.source_plugin === 'TW_FUNDAMENTAL_SYNC' || parsedData.source_plugin === 'TW_FINANCIAL_SYNC') {
        const { data: finData } = await supabase.from('fin_financial_fact').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (finData) {
          parsedData.business_data = { company_code: finData.company_code, period: finData.period, metrics: { revenue: finData.revenue, netIncome: finData.net_income } };
        }
      }
      setPdfReportData(parsedData);
    } catch (err: any) {
      alert('❌ 擷取報告資料失敗：' + err.message);
    } finally {
      setIsFetchingPdfData(null);
    }
  };

  const archivedEvidences = evidences.filter(e => e.status !== 'PENDING_REVIEW' && e.status !== 'PENDING');
  const visiblePlugins = plugins.filter(p => ALLOWED_PLUGINS.includes(p.plugin_id));

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in-up">

      {/* ── ✅ 2. 統一化 Header (移除原本的黃色區塊，改為右上角按鈕) ── */}
      <header className="mb-8 border-b border-slate-200 pb-6 shrink-0 flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black tracking-tighter">
              <span className="bg-slate-900 text-white px-2 py-1 rounded shadow-sm">FIDUCIA</span>{' '}
              <span className="text-slate-800 uppercase">Core</span>
            </h1>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
              v1.8.0 (Securities Ready)
            </span>
          </div>
          <p className="text-xs font-bold text-slate-500">金融級治理底座 · 零信任資料管線 (L1 ~ L3)</p>
        </div>

        {/* 右上角統一狀態區 */}
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-black shadow-sm border ${
            isSuperAdmin ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            角色：{isSuperAdmin ? 'System Admin' : user ? '已登入' : '訪客模式'}
          </span>

          {user ? (
            <button
              onClick={handleLogout}
              className="px-4 py-1.5 text-xs font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
            >
              登出
            </button>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google 登入
            </button>
          )}
        </div>
      </header>

      {/* ── Plugin 控制台（分層 + 行業標記 + API 說明）── */}
      <div className="mb-8 w-full bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="mb-5 flex justify-between items-end border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              ⚙️ 零信任資料管線 (L1 → L2 → L3)
            </h3>
            <p className="text-[10px] text-slate-500 mt-1">
              L1 時序事件同步 → L2 財報/永續快照 → L3 封存簽章 → 行業分析引擎
            </p>
          </div>
          {!isSuperAdmin && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
              🔒 執行功能需 System Admin 權限
            </span>
          )}
        </div>

        {(() => {
          // ── Plugin 完整定義（含行業標記 + API 資料說明）────────────
          const PIPELINE_GROUPS: {
            layer: string;
            layerLabel: string;
            color: string;
            bgColor: string;
            borderColor: string;
            plugins: {
              pluginId: string;
              icon: string;
              title: string;
              btnText: string;
              themeColor: string;
              industry: string;
              apiSource: string;
              dataDesc: string;
            }[];
          }[] = [
            {
              layer: '第一層', layerLabel: '第一層：時序同步（每日自動抓取）',
              color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
              plugins: [
                {
                  pluginId: 'L1_MARKET_DAILY_SYNC', icon: '📈', title: '每日市場行情',
                  btnText: '同步行情', themeColor: '#D97706',
                  industry: '全行業通用',
                  apiSource: '證交所 STOCK_DAY_ALL',
                  dataDesc: '10 家企業每日開盤/最高/最低/收盤價、成交量、成交值，寫入市場行情序列表'
                },
                {
                  pluginId: 'L1_MATERIAL_EVENTS_SYNC', icon: '📢', title: '重大訊息與裁罰',
                  btnText: '同步事件', themeColor: '#DC2626',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap06_L',
                  dataDesc: '上市公司重大訊息公告、主管機關裁罰、法遵異動紀錄（只增不改）'
                },
                {
                  pluginId: 'L1_INDUSTRY_SYNC', icon: '🏭', title: '產業分類維度',
                  btnText: '同步產業', themeColor: '#0891B2',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap03_L',
                  dataDesc: '行業別、子產業別，採緩慢變動維度設計，歷史分類可追溯'
                },
                {
                  pluginId: 'L1_INSIDER_HOLDINGS_SYNC', icon: '🕵️', title: '董監事持股異動',
                  btnText: '同步籌碼', themeColor: '#7C3AED',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap07_L',
                  dataDesc: '董監事持股增減股數、異動後持股比例、異動日期（只增不改）'
                },
                {
                  pluginId: 'L1_DIVIDENDS_SYNC', icon: '💰', title: '股利與除權息',
                  btnText: '同步股利', themeColor: '#D946EF',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap08_L',
                  dataDesc: '現金股利、股票股利每股金額、除息交易日、現金股利發放日（只增不改）'
                },
              ]
            },
            {
              layer: '第二層', layerLabel: '第二層：官方財報與永續快照（季度/年度抓取）',
              color: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-200',
              plugins: [
                {
                  pluginId: 'TW_FUNDAMENTAL_SYNC', icon: '🏛️', title: '官方財務報表同步',
                  btnText: '執行抓取', themeColor: '#475569',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap14_L（綜合損益表）＋ t187ap03_L（資產負債表）',
                  dataDesc: '營業收入、本期淨利、資產總計、負債總計、權益總計，推算 12 季歷史軌跡，寫入財務事實表（草稿待審）'
                },
                {
                  pluginId: 'TW_MONTHLY_REVENUE_SYNC', icon: '📅', title: '月營收同步',
                  btnText: '執行同步', themeColor: '#0369A1',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap05_L（月營收報表）',
                  dataDesc: '當月營收、上月營收、去年同月、月增率、年增率、累計營收（千元），最新月份實際值，寫入月營收表（草稿待審）'
                },
                {
                  pluginId: 'ESG_METRICS_SYNC', icon: '🌱', title: '永續碳排報告同步',
                  btnText: '執行同步', themeColor: '#16A34A',
                  industry: '全行業通用',
                  apiSource: '證交所 t187ap15_L（無資料時改用行業基準估算）',
                  dataDesc: '範疇一直接排放、範疇二間接排放（噸二氧化碳當量）、確信等級，三年軌跡，寫入永續指標表（草稿待審）'
                },
              ]
            },
            {
              layer: '第三層', layerLabel: '第三層：數位簽章封存（治理放行後執行）',
              color: 'text-indigo-700', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200',
              plugins: [
                {
                  pluginId: 'P_FIN_REPORT_VERSION_SEAL', icon: '🏦', title: '財務報表封存',
                  btnText: '執行封存', themeColor: '#4F46E5',
                  industry: '全行業通用',
                  apiSource: '資料庫 財務事實表（草稿狀態）',
                  dataDesc: '資料品質分數驗證（需達 80 分）→ 計算 SHA-256 數位指紋 → 狀態升為正式有效 → 寫入不可篡改證據鏈'
                },
                {
                  pluginId: 'P_ESG_REPORT_VERSION_SEAL', icon: '🌿', title: '永續報告封存',
                  btnText: '執行封存', themeColor: '#059669',
                  industry: '全行業通用',
                  apiSource: '資料庫 永續指標表（草稿狀態）',
                  dataDesc: '資料品質分數驗證（需達 80 分）→ 計算 SHA-256 數位指紋 → 狀態升為正式有效 → 永續連結貸款條件上鏈存證'
                },
              ]
            },
            {
              layer: '行業引擎', layerLabel: '行業引擎：證券業自營部門（自營風控專用）',
              color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200',
              plugins: [
                {
                  pluginId: 'P_SEC_PM_DECISION_ENGINE', icon: '📊', title: '自營部門投資決策引擎',
                  btnText: '執行運算', themeColor: '#2563EB',
                  industry: '證券業自營部門專用',
                  apiSource: '資料庫 財務事實表＋市場行情表（正式有效資料）',
                  dataDesc: '讀取已放行財報計算現金流量品質比（現金流量／淨利）、負債比率、營收季增率，輸出買進／觀望／減碼操作建議'
                },
              ]
            },
            {
              layer: '系統防禦', layerLabel: '系統防禦：基礎設施安全掃描',
              color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200',
              plugins: [
                {
                  pluginId: 'CVE_TRACK', icon: '🛡️', title: '軟體供應鏈弱點掃描',
                  btnText: '執行掃描', themeColor: '#E11D48',
                  industry: '系統基礎設施',
                  apiSource: 'Google 開源弱點資料庫（osv.dev）',
                  dataDesc: '掃描 Next.js 套件已知資安漏洞清單、嚴重等級、公告日期，結果寫入不可篡改證據鏈'
                },
                {
                  pluginId: 'DB_SCHEMA_DRIFT', icon: '💾', title: '資料庫結構防篡改快照',
                  btnText: '擷取快照', themeColor: '#0284C7',
                  industry: '系統基礎設施',
                  apiSource: '資料庫內部查詢（資訊結構表）',
                  dataDesc: '拍下所有資料表的欄位名稱與型態快照，日後可與當前結構比對，偵測未授權的資料庫結構變更'
                },
              ]
            },
          ];

          const PluginCard = ({ p }: { p: typeof PIPELINE_GROUPS[0]['plugins'][0] }) => {
            const isRunning = isRunningPlugin === p.pluginId;
            const canRun = isSuperAdmin && !isRunning && isRunningPlugin === null;
            const found = visiblePlugins.find(vp => vp.plugin_id === p.pluginId);
            if (!found) return null;
            return (
              <div className="flex flex-col justify-between p-3 bg-white rounded-xl border border-slate-200 gap-2 min-w-0 shadow-sm">
                <div className="flex gap-2 items-start">
                  <div className="text-lg mt-0.5 shrink-0">{p.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <p className="font-black text-[11px] text-slate-800 leading-tight">{p.title}</p>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                        p.industry === '證券業自營部門專用' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        p.industry === '系統基礎設施' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                        'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>{p.industry}</span>
                    </div>
                    <p className="text-[9px] text-indigo-600 font-bold leading-snug mb-1">
                      API: {p.apiSource}
                    </p>
                    <p className="text-[9px] text-slate-500 leading-snug font-medium line-clamp-2">
                      {p.dataDesc}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => canRun && handleRunPlugin(p.pluginId)}
                  disabled={!canRun}
                  style={{
                    backgroundColor: !isSuperAdmin ? '#e2e8f0' : isRunning ? '#cbd5e1' : p.themeColor,
                    color: !isSuperAdmin ? '#94a3b8' : isRunning ? '#475569' : '#ffffff'
                  }}
                  className={`px-3 py-1.5 text-[9px] font-black rounded-lg transition-all shadow-sm w-full border border-transparent
                    ${canRun ? 'hover:brightness-110 cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                  title={!isSuperAdmin ? '需要 System Admin 權限' : undefined}
                >
                  {isRunning ? '⏳ 執行中...' : !isSuperAdmin ? '🔒 ' + p.btnText : p.btnText}
                </button>
              </div>
            );
          };

          return (
            <div className="space-y-5">
              {PIPELINE_GROUPS.map(group => (
                <div key={group.layer}>
                  {/* 層級標頭 */}
                  <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${group.borderColor}`}>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${group.bgColor} ${group.color} border ${group.borderColor}`}>
                      {group.layer}
                    </span>
                    <span className={`text-xs font-black ${group.color}`}>{group.layerLabel}</span>
                  </div>
                  {/* Plugin 卡片 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {group.plugins.map(p => <PluginCard key={p.pluginId} p={p} />)}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* PDF 浮動視窗 */}
      {pdfReportData && (
        <div className="fixed bottom-6 right-6 z-50 bg-white p-5 rounded-xl shadow-2xl border border-slate-200 animate-fade-in-up">
          <div className="flex justify-between items-start mb-3">
            <h4 className="font-black text-sm text-slate-800">📄 報表已生成</h4>
            <button onClick={() => setPdfReportData(null)} className="text-slate-400 hover:text-slate-600 font-bold">✖</button>
          </div>
          <DownloadReportButton reportData={pdfReportData} />
        </div>
      )}

      {/* ── ✅ 4. 保留完整的治理表格 ── */}
      <div className="space-y-3 pb-16">
        <div className="flex items-end justify-between px-1 mb-2">
          <h2 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            🏛️ 治理存證追溯 (Audit Trail)
          </h2>
          {!user && (
            <span className="text-[10px] text-slate-400 font-bold">登入後可使用核決與下載功能</span>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">治理版本 Hash</th>
                  <th className="px-3 py-2">證據 / 決策摘要</th>
                  <th className="px-3 py-2">核決權限 / 操作</th>
                  <th className="px-3 py-2">狀態</th>
                  <th className="px-3 py-2 text-right">不可篡改驗證</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedEvidences.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-400 font-bold">
                      尚無存證紀錄
                    </td>
                  </tr>
                ) : (
                  archivedEvidences.map((ev) => {
                    const pluginToRun = getPluginIdFromSummary(ev.sys_state_versions?.summary);
                    return (
                      <tr key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-2 font-mono text-[10px] text-indigo-600 font-bold">
                          {ev.sys_state_versions?.version_hash?.substring(0, 20)}...
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-[10px] text-slate-700 font-bold max-w-[200px] truncate" title={ev.sys_state_versions?.summary}>
                            {ev.sys_state_versions?.summary}
                          </p>
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-slate-500 font-bold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Admin</span>

                            {/* 核決按鈕：僅 superadmin 可用 */}
                            <button
                              onClick={() => user && isSuperAdmin && handleApproveData(ev)}
                              disabled={!isSuperAdmin || ev.status === 'VALID'}
                              className={`px-2 py-1 text-[10px] font-bold rounded transition-colors shadow-sm ${
                                ev.status === 'VALID'
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : isSuperAdmin
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              }`}
                              title={!isSuperAdmin ? '需要 Admin 權限' : undefined}
                            >
                              {ev.status === 'VALID' ? '✅ 已入庫' : '✓ 核決'}
                            </button>

                            {/* 重跑按鈕：僅 VALID 以外狀態 + superadmin 才顯示 */}
                            {pluginToRun && ev.status !== 'VALID' && isSuperAdmin && (
                              <button
                                onClick={() => handleRunPlugin(pluginToRun)}
                                disabled={isRunningPlugin !== null}
                                className="px-2 py-1 border text-[10px] font-bold rounded transition-colors shadow-sm bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50"
                              >
                                {isRunningPlugin === pluginToRun ? '⏳...' : '🔄 執行'}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 text-[9px] font-black rounded border ${
                            ev.status === 'VALID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            ev.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>{ev.status}</span>
                        </td>

                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 下載按鈕：需登入 */}
                            {ev.type === 'DIAGNOSTIC_REPORT' && (
                              <button
                                onClick={() => user ? handleDownloadApiExcel(ev.storage_path, ev.sys_state_versions?.version_hash) : alert('請先登入')}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${user ? 'text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-600 hover:text-white' : 'text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed'}`}
                              >
                                📥 API 數據
                              </button>
                            )}
                            {ev.type === 'DIAGNOSTIC_REPORT' && (
                              <button
                                onClick={() => user ? handlePreparePdf(ev.storage_path, ev.id) : alert('請先登入')}
                                disabled={isFetchingPdfData === ev.id}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors disabled:opacity-50 ${user ? 'text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white' : 'text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed'}`}
                              >
                                {isFetchingPdfData === ev.id ? '讀取...' : '📄 PDF'}
                              </button>
                            )}
                            <button
                              onClick={() => user ? handleDownloadExcel(ev.storage_path, ev.sys_state_versions?.version_hash, ev.type) : alert('請先登入')}
                              className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${user ? 'text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white' : 'text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed'}`}
                            >
                              📊 Audit Report
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
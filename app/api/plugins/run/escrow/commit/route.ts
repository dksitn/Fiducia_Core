import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

// 💡 匯入你剛寫好的密碼學工具與業務引擎
import { canonicalize, generateSHA256 } from '@/utils/plugins/canonicalize';
import { runFinReportVersionSeal, runEsgReportVersionSeal } from '@/utils/plugins/sealEngines';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { pluginId, userId, input = {} } = await request.json();
    console.log(`[Plugin Runner] 啟動外掛任務 ${pluginId}，操作員: ${userId}`);

    let version_hash = '';
    let summary = '';
    let storagePath = '';
    let auditReport: any = {};

    // ==========================================
    // 💡 [Rule 2] 策略模式：業務模組執行區
    // ==========================================
    if (pluginId === 'CVE_TRACK') {
      const targetPackage = "next";
      const osvRes = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: { name: targetPackage, ecosystem: "npm" } })
      });
      if (!osvRes.ok) throw new Error('無法連線至 OSV 弱點資料庫');
      const osvData = await osvRes.json();
      const findings = (osvData.vulns || []).slice(0, 10).map((vuln: any) => ({
        id: vuln.id,
        severity: vuln.database_specific?.severity || 'UNKNOWN',
        desc: vuln.summary || (vuln.details ? vuln.details.substring(0, 100) + '...' : '無詳細描述'),
        published_at: vuln.published
      }));

      auditReport = {
        target_asset: `npm package: ${targetPackage}`,
        source_plugin: "Google OSV API",
        executed_at: new Date().toISOString(),
        operator_uid: userId,
        risk_level: findings.length > 0 ? "HIGH" : "CLEAN",
        total_vulnerabilities: findings.length,
        findings: findings
      };
      version_hash = `scan-${targetPackage}-${Date.now()}`;
      summary = `[真實情資] 軟體供應鏈掃描: ${targetPackage}`;
      storagePath = `plugin_results/osv_${targetPackage}_${Date.now()}.json`;

    } else if (pluginId === 'DB_SCHEMA_DRIFT') {
      const { data: schemaSnapshot, error: rpcError } = await supabaseAdmin.rpc('get_schema_snapshot');
      if (rpcError) throw new Error(`無法擷取 Schema: ${rpcError.message}`);

      auditReport = {
        target_asset: "PostgreSQL [public] schema",
        source_plugin: "DB_SCHEMA_DRIFT",
        executed_at: new Date().toISOString(),
        operator_uid: userId,
        risk_level: "INFO",
        total_vulnerabilities: schemaSnapshot.length,
        findings: schemaSnapshot.map((col: any) => ({
          id: `${col.table_name}.${col.column_name}`,
          severity: 'INFO', 
          desc: `資料型態: ${col.data_type} ${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`
        }))
      };
      version_hash = `schema-drift-${Date.now()}`;
      summary = `[內部防禦] DB Schema 結構快照 (總欄位數: ${schemaSnapshot.length})`;
      storagePath = `plugin_results/schema_drift_${Date.now()}.json`;

    } else if (pluginId === 'P_FIN_REPORT_VERSION_SEAL') {
      // 🌟 [呼叫笨蛋引擎] 獲取乾淨的 JSON 報表
      const result = await runFinReportVersionSeal(input, userId);
      auditReport = result.auditReport;
      
      const companyId = input?.companyId || 'UNKNOWN';
      version_hash = `fin-seal-${companyId}-${Date.now()}`;
      summary = auditReport.summary;
      storagePath = `plugin_results/fin_seal_${companyId}_${Date.now()}.json`;

    } else if (pluginId === 'P_ESG_REPORT_VERSION_SEAL') {
      // 🌟 [呼叫笨蛋引擎] 獲取乾淨的 ESG 報表
      const result = await runEsgReportVersionSeal(input, userId);
      auditReport = result.auditReport;
      
      const orgId = input?.orgId || 'UNKNOWN';
      version_hash = `esg-seal-${orgId}-${Date.now()}`;
      summary = auditReport.summary;
      storagePath = `plugin_results/esg_seal_${orgId}_${Date.now()}.json`;

    } else {
      throw new Error(`未知的插件 ID: ${pluginId}`);
    }

    // ==========================================
    // 💡 [Rule 1] 不可篡改循環 (強制正規化與 Hash)
    // ==========================================
    
    // 1. JSON 正規化
    const canonicalReportString = canonicalize(auditReport);
    // 2. 🛡️ 加上 await 呼叫你的非同步 SHA-256 函式
    const actualFingerprint = await generateSHA256(canonicalReportString);

    // 3. 建立治理版本 (sys_state_versions)
    const { data: version, error: verError } = await supabaseAdmin.from('sys_state_versions').insert({
      version_hash: version_hash,
      author_user_id: userId,
      summary: summary
    }).select().single();
    if (verError) throw verError;

    // 4. 將正規化後的字串上傳至 Storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('governance')
      .upload(storagePath, canonicalReportString, { contentType: 'application/json' });
    if (storageError) throw storageError;

    // 5. 紀錄證據條目 (sys_evidence_items)
    const { error: itemError } = await supabaseAdmin.from('sys_evidence_items').insert({
      state_version_id: version.id,
      type: 'DIAGNOSTIC_REPORT',
      status: 'VALID',
      fingerprint: actualFingerprint, 
      storage_path: storagePath,
      created_by_user_id: userId
    });
    if (itemError) throw itemError;

    return NextResponse.json({ 
      success: true, 
      version_hash: version.version_hash,
      fingerprint: actualFingerprint,
      auditReport: auditReport 
    });

  } catch (err: any) {
    console.error('CRITICAL PLUGIN ERROR:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
// utils/plugins/sealEngines.ts
// ⚠️ [架構合約遵守]：無 Supabase 連線、無 Hash 計算。絕對純粹。

export async function runFinReportVersionSeal(input: any, userId: string) {
  // 1. 解析前端傳來的業務參數
  const { companyId, period, reportScope, statementSet, sourceSystem, sourceRef, payload } = input;
  
  // 2. 業務防呆與邏輯驗證 (Business Validation)
  if (!companyId || !period || !payload) {
    throw new Error("[業務邏輯錯誤] 缺少必要的財務報表參數 (companyId, period, payload)。");
  }

  // 3. 可以在這裡處理複雜的領域邏輯 (例如：從 payload 中計算某些財務指標)
  // const calculatedEps = payload.metrics.netIncome / payload.metrics.shares; ...

  // 4. 單一職責：回傳一份「乾淨且結構化」的 JSON，雙手奉上給治理核心去算指紋與寫 DB
  return {
    auditReport: {
      target_asset: `Financial Report: ${companyId} - ${period}`,
      source_plugin: "P_FIN_REPORT_VERSION_SEAL",
      executed_at: new Date().toISOString(),
      operator_uid: userId,
      risk_level: "INFO",
      summary: `財務報表快照封存請求 (${companyId} ${period})`,
      // 將所有需要被「不可篡改保護」的業務數據與原始 payload 集中打包
      business_data: {
        company_id: companyId,
        period: period,
        report_scope: reportScope,
        statement_set: statementSet,
        source_system: sourceSystem,
        source_ref: sourceRef,
        payload_json: payload // 原始報表數據
      }
    }
  };
}

export async function runEsgReportVersionSeal(input: any, userId: string) {
  // 邏輯同上，純粹處理 ESG 領域的參數與資料結構驗證
  const { orgId, period, reportScope, frameworkTags = [], payload } = input;
  
  if (!orgId || !payload) {
    throw new Error("[業務邏輯錯誤] 缺少必要的 ESG 報告參數。");
  }

  return {
    auditReport: {
      target_asset: `ESG Report: ${orgId} - ${period}`,
      source_plugin: "P_ESG_REPORT_VERSION_SEAL",
      executed_at: new Date().toISOString(),
      operator_uid: userId,
      risk_level: "INFO",
      summary: `永續報告(ESG)快照封存請求 (${orgId} ${period})`,
      business_data: {
        org_id: orgId,
        period: period,
        report_scope: reportScope,
        framework_tags: frameworkTags,
        payload_json: payload
      }
    }
  };
}
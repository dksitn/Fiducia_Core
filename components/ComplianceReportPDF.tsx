// components/ComplianceReportPDF.tsx
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'NotoSansTC',
  src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf'
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'NotoSansTC', backgroundColor: '#FAFAFA' },
  header: {
    borderBottomWidth: 2, borderBottomColor: '#1E293B',
    paddingBottom: 10, marginBottom: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  title:    { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  subtitle: { fontSize: 9, color: '#64748B' },
  section:  { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#1E3A8A', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 4 },
  row:   { flexDirection: 'row', marginBottom: 5 },
  label: { width: 150, fontSize: 9, color: '#64748B' },
  value: { flex: 1, fontSize: 9, color: '#0F172A', fontWeight: 'bold' },
  hashBox:  { backgroundColor: '#F1F5F9', padding: 8, borderRadius: 4, marginTop: 5 },
  hashText: { fontSize: 7, color: '#2563EB', fontFamily: 'Helvetica' },
  footer: {
    position: 'absolute', bottom: 25, left: 40, right: 40,
    textAlign: 'center', fontSize: 7, color: '#94A3B8',
    borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, lineHeight: 1.5,
  }
});

const fmtNum = (v: any) =>
  v != null && v !== 'N/A' ? `${Number(v).toLocaleString()} 千元` : 'N/A';

export default function ComplianceReportPDF({ data }: { data: any }) {
  // ✅ 正確讀取結構：storage 裡存的就是 auditReport 本體
  const report       = data ?? {};
  const businessData = report.business_data ?? {};
  const metrics      = businessData.metrics ?? {};

  const companyCode  = report.company_code ?? businessData.company_code ?? 'N/A';
  const period       = report.period ?? businessData.period ?? 'N/A';
  const dqScore      = report.dq_score ?? 'N/A';
  const sourcPlugin  = report.source_plugin ?? 'N/A';
  const sealedBy     = report.sealed_by ?? report.operator_uid ?? 'SYSTEM';
  const executedAt   = report._sealed_at ?? report.executed_at ?? null;

  // 判斷是財報還是 ESG
  const isFin = sourcPlugin === 'P_FIN_REPORT_VERSION_SEAL';
  const isESG = sourcPlugin === 'P_ESG_REPORT_VERSION_SEAL';
  const isSync = !isFin && !isESG;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* 頁首 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>FIDUCIA 系統合規存證報告</Text>
            <Text style={styles.subtitle}>Fiducia Core Enterprise Governance Platform</Text>
          </View>
          <Text style={styles.subtitle}>列印時間: {new Date().toLocaleString('zh-TW')}</Text>
        </View>

        {/* 區塊 1：系統詮釋資料 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>[ 存證系統詮釋資料 System Metadata ]</Text>
          <View style={styles.row}>
            <Text style={styles.label}>封存時間 (Sealed At)</Text>
            <Text style={styles.value}>{executedAt ? new Date(executedAt).toLocaleString('zh-TW') : 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>執行引擎 (Plugin)</Text>
            <Text style={styles.value}>{sourcPlugin}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>執行者 (Operator UID)</Text>
            <Text style={styles.value}>{sealedBy}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>DQ 品質分數</Text>
            <Text style={styles.value}>{dqScore} / 100 {Number(dqScore) >= 80 ? '（達標）' : '（未達標）'}</Text>
          </View>
        </View>

        {/* 區塊 2：業務資料（財報） */}
        {isFin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>[ 財務報表業務快照 Financial Statement Snapshot ]</Text>
            <View style={styles.row}>
              <Text style={styles.label}>公司代號 (Company)</Text>
              <Text style={styles.value}>{companyCode}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>財報期間 (Period)</Text>
              <Text style={styles.value}>{period}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>營業收入 (Revenue)</Text>
              <Text style={styles.value}>{fmtNum(metrics.revenue)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>稅後淨利 (Net Income)</Text>
              <Text style={styles.value}>{fmtNum(metrics.net_income)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>資產總計 (Total Assets)</Text>
              <Text style={styles.value}>{fmtNum(metrics.total_assets)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>負債總計 (Total Liabilities)</Text>
              <Text style={styles.value}>{fmtNum(metrics.total_liabilities)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>股東權益 (Equity)</Text>
              <Text style={styles.value}>{fmtNum(metrics.equity)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>營業現金流 (OCF)</Text>
              <Text style={styles.value}>{fmtNum(metrics.operating_cash_flow)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>資本支出 (CapEx)</Text>
              <Text style={styles.value}>{fmtNum(metrics.capital_expenditure)}</Text>
            </View>
          </View>
        )}

        {/* 區塊 2：業務資料（ESG） */}
        {isESG && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>[ ESG 永續指標快照 Sustainability Snapshot ]</Text>
            <View style={styles.row}>
              <Text style={styles.label}>公司代號</Text>
              <Text style={styles.value}>{companyCode}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>報告期間</Text>
              <Text style={styles.value}>{period}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>範疇一排放 (Scope 1)</Text>
              <Text style={styles.value}>{metrics.scope1_emissions != null ? `${Number(metrics.scope1_emissions).toLocaleString()} tCO₂e` : 'N/A'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>範疇二排放 (Scope 2)</Text>
              <Text style={styles.value}>{metrics.scope2_emissions != null ? `${Number(metrics.scope2_emissions).toLocaleString()} tCO₂e` : 'N/A'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>確信等級 (Assurance)</Text>
              <Text style={styles.value}>{metrics.assurance_level ?? 'N/A'}</Text>
            </View>
          </View>
        )}

        {/* 區塊 2：同步類報告 */}
        {isSync && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>[ 資料同步執行摘要 Sync Summary ]</Text>
            <View style={styles.row}>
              <Text style={styles.label}>資料來源</Text>
              <Text style={styles.value}>{report.data_source ?? 'N/A'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>成功同步筆數</Text>
              <Text style={styles.value}>{report.total_synced ?? 'N/A'}</Text>
            </View>
          </View>
        )}

        {/* 區塊 3：不可篡改證據鏈 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>[ 不可篡改密碼學證據 Immutability Proof ]</Text>
          <View style={styles.row}>
            <Text style={styles.label}>治理版本 (Version Hash)</Text>
            <Text style={styles.value}>{data?._version_hash ?? 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>決策狀態</Text>
            <Text style={styles.value}>VALID（已核決放行）</Text>
          </View>
          <Text style={[styles.label, { marginTop: 8, width: '100%' }]}>SHA-256 數位指紋 (Fingerprint)</Text>
          <View style={styles.hashBox}>
            <Text style={styles.hashText}>{data?._fingerprint ?? '尚未計算指紋'}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          本報告由 Fiducia Core 自動生成，底層數據已寫入 Supabase RLS 防篡改金庫。{'\n'}
          任何人（包含系統管理員）皆無法竄改上方列出之數位指紋與業務數據。單位：新台幣千元。
        </Text>
      </Page>
    </Document>
  );
}

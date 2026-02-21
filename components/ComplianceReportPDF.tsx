// components/ComplianceReportPDF.tsx
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

// 🌟 註冊繁體中文字體 (從遠端 CDN 載入，解決中文亂碼問題)
Font.register({
  family: 'NotoSansTC',
  src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf'
});

// 🎨 定義企業級 PDF 的視覺樣式
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'NotoSansTC',
    backgroundColor: '#FAFAFA',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#1E293B',
    paddingBottom: 10,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 10,
    color: '#64748B',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E3A8A', // 改用深藍色凸顯區塊標題
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    width: 130, // 稍微加寬 Label 空間，避免字被擠壓
    fontSize: 10,
    color: '#64748B',
  },
  value: {
    flex: 1,
    fontSize: 10,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  hashBox: {
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 4,
    marginTop: 5,
  },
  hashText: {
    fontSize: 8,
    color: '#2563EB', // 藍色凸顯 Hash
    fontFamily: 'Helvetica', // Hash 通常是英數，用系統字體即可
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#94A3B8',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    lineHeight: 1.5,
  }
});

// 📄 PDF 內容元件
export default function ComplianceReportPDF({ data }: { data: any }) {
  // 由於資料結構可能因外掛不同而異，我們做一些安全取值 (Optional Chaining)
  const auditReport = data?.audit_report || data?.payload_json || data?.payload || {};
  const businessData = auditReport?.business_data || auditReport?.payload || {};
  const metrics = businessData?.metrics || {};

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* 頁首 */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>FIDUCIA 系統合規存證報告</Text>
            <Text style={styles.subtitle}>Fiducia Core Enterprise Governance</Text>
          </View>
          <Text style={styles.subtitle}>列印時間: {new Date().toLocaleString('zh-TW')}</Text>
        </View>

        {/* 區塊 1：系統存證詮釋資料 (Metadata) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>[ 存證系統詮釋資料 System Metadata ]</Text>
          <View style={styles.row}>
            <Text style={styles.label}>存證時間 (Timestamp)</Text>
            <Text style={styles.value}>{new Date(data?.created_at || Date.now()).toLocaleString('zh-TW')}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>報告類型 (Type)</Text>
            <Text style={styles.value}>{data?.type || 'DIAGNOSTIC_REPORT'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>執行者 (Operator UID)</Text>
            <Text style={styles.value}>{data?.created_by_user_id || auditReport?.operator_uid || 'SYSTEM'}</Text>
          </View>
        </View>

        {/* 區塊 2：業務資料快照 (Business Snapshot) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>[ 業務資料快照 Business Snapshot ]</Text>
          <View style={styles.row}>
            <Text style={styles.label}>公司代碼 (Company)</Text>
            <Text style={styles.value}>{businessData?.company_code || businessData?.companyId || 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>財報期間 (Period)</Text>
            <Text style={styles.value}>{businessData?.period || 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>營業收入 (Revenue)</Text>
            <Text style={styles.value}>
              {metrics?.revenue ? `$ ${Number(metrics.revenue).toLocaleString()}` : 'N/A'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>稅後淨利 (Net Income)</Text>
            <Text style={styles.value}>
              {metrics?.netIncome ? `$ ${Number(metrics.netIncome).toLocaleString()}` : 'N/A'}
            </Text>
          </View>
        </View>

        {/* 區塊 3：不可篡改證據鏈 (Immutability Proof) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>[ 不可篡改密碼學證據 Immutability Proof ]</Text>
          <View style={styles.row}>
            <Text style={styles.label}>治理版本 (Version Hash)</Text>
            <Text style={styles.value}>{data?.version_hash || 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>決策狀態 (Status)</Text>
            <Text style={styles.value}>{data?.status || 'VALID'}</Text>
          </View>
          
          <Text style={[styles.label, { marginTop: 10, width: '100%' }]}>正規化數位指紋 (SHA-256 Fingerprint)</Text>
          <View style={styles.hashBox}>
            <Text style={styles.hashText}>{data?.fingerprint || '尚未計算指紋'}</Text>
          </View>
        </View>

        {/* 頁尾宣告 */}
        <Text style={styles.footer}>
          本報告由 Fiducia Core 自動生成，底層數據已寫入 Supabase RLS 防篡改金庫。{'\n'}
          任何人（包含系統管理員）皆無法竄改上方列出之數位指紋與業務數據。
        </Text>

      </Page>
    </Document>
  );
}
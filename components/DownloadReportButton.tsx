'use client';
import { PDFDownloadLink } from '@react-pdf/renderer';
import ComplianceReportPDF from './ComplianceReportPDF'; 

export default function DownloadReportButton({ reportData }: { reportData: any }) {
  if (!reportData) return null;

  return (
    <div className="flex flex-col items-center justify-center pt-2">
      <PDFDownloadLink
        document={<ComplianceReportPDF data={reportData} />}
        fileName={`Fiducia_Audit_${reportData.version_hash || Date.now()}.pdf`}
        className="bg-rose-600 text-white px-5 py-2.5 rounded-lg shadow-md font-bold hover:bg-rose-700 transition-all flex items-center gap-2"
      >
        {({ loading }) => (
          loading ? '⏳ 正在排版 PDF 文件...' : '⬇️ 點擊下載 PDF 實體報表'
        )}
      </PDFDownloadLink>
      <p className="text-[10px] text-slate-400 mt-2 font-mono">
        Hash: {reportData.fingerprint || reportData.version_hash || 'N/A'}
      </p>
    </div>
  );
}
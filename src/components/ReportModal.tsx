import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { Printer, Download, X, ShieldCheck } from 'lucide-react';

interface ReportModalProps {
  applicationId: string | null;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ applicationId, onClose }) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (applicationId) {
      loadReport(applicationId);
    }
  }, [applicationId]);

  const loadReport = async (id: string) => {
    try {
      setLoading(true);
      const data = await api.getReport(id);
      setReport(data);
    } catch (e) {
      console.error('Failed to load report', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AICTE_Validation_Report_${report.application?.applicationNumber?.replace(/\//g, '_') || 'app'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!applicationId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Modal Controls Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-semibold">AICTE Statutory Validation Scrutiny Report</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadJson}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1.5 border border-slate-700"
            >
              <Download className="w-3.5 h-3.5" /> Export Machine JSON
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white text-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div className="p-8 overflow-y-auto space-y-6 text-slate-900 font-sans text-xs print:p-0">
          {loading || !report ? (
            <div className="py-12 text-center text-slate-400">Loading statutory report summary...</div>
          ) : (
            <>
              {/* Official Letterhead */}
              <div className="text-center pb-4 border-b-2 border-[#0f294a] space-y-1">
                <div className="text-base font-bold tracking-tight text-[#0f294a] uppercase">
                  All India Council for Technical Education
                </div>
                <div className="text-xs font-semibold text-slate-700">
                  (A Statutory Body of the Government of India) · Regulation Bureau
                </div>
                <div className="text-[11px] text-slate-500">
                  Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070
                </div>
                <div className="text-xs font-bold text-amber-800 bg-amber-50 py-1 px-4 rounded-full inline-block mt-2 border border-amber-200">
                  TECHNICAL SCRUTINY & REGULATORY COMPLIANCE AUDIT REPORT
                </div>
              </div>

              {/* Application & Institution Summary */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <div><strong>Application Number:</strong> {report.application?.applicationNumber}</div>
                  <div><strong>Institution Name:</strong> {report.institution?.name}</div>
                  <div><strong>AICTE Permanent ID:</strong> {report.institution?.permanentId}</div>
                  <div><strong>Academic Year:</strong> {report.application?.academicYear}</div>
                </div>
                <div className="space-y-1">
                  <div><strong>Application Category:</strong> {report.application?.category}</div>
                  <div><strong>Current Scrutiny Status:</strong> {report.application?.status}</div>
                  <div><strong>Compliance Score:</strong> <span className="font-bold tabular-nums">{report.validationRun?.overallComplianceScore || 'N/A'}%</span></div>
                  <div><strong>Generated At:</strong> {report.metadata?.generatedAt?.slice(0, 19).replace('T', ' ')} UTC</div>
                </div>
              </div>

              {/* Document Inventory Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  1. Statutory Document Inventory & Forensic Digests
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2">Document Title</th>
                        <th className="p-2">Category</th>
                        <th className="p-2">Extracted PID</th>
                        <th className="p-2">Validity</th>
                        <th className="p-2">Confidence</th>
                        <th className="p-2">SHA-256 Digest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {report.documentInventory?.map((doc: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2 font-sans font-medium text-slate-900">{doc.title}</td>
                          <td className="p-2 font-sans text-slate-600">{doc.type}</td>
                          <td className="p-2">{doc.extractedPID || '—'}</td>
                          <td className="p-2">{doc.expiryDate || 'PERPETUAL'}</td>
                          <td className="p-2 font-sans">{(doc.extractionConfidence * 100).toFixed(0)}% ({doc.extractionMethod})</td>
                          <td className="p-2 text-slate-500 truncate max-w-[120px]">{doc.sha256}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rule Validation Findings Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  2. Rule-by-Rule Scrutiny Findings & Reviewer Observations
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2">Rule ID</th>
                        <th className="p-2">Severity</th>
                        <th className="p-2">Observed Finding</th>
                        <th className="p-2">Decision Status</th>
                        <th className="p-2">Reviewer Remarks / Justification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.ruleFindings?.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-emerald-700">
                            All statutory rules validated compliant without non-conformities.
                          </td>
                        </tr>
                      ) : (
                        report.ruleFindings?.map((fnd: any, i: number) => (
                          <tr key={i}>
                            <td className="p-2 font-mono font-medium">{fnd.ruleId}</td>
                            <td className="p-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  fnd.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {fnd.severity}
                              </span>
                            </td>
                            <td className="p-2 max-w-xs">{fnd.observedEvidence}</td>
                            <td className="p-2 font-medium">{fnd.status}</td>
                            <td className="p-2 text-slate-600 italic">
                              {fnd.reviewerNotes || fnd.overrideReason || 'Pending scrutiny review'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* External Issuing Authority Ledger */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  3. External Issuing-Authority Verification Ledger
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2">Issuing Authority Source</th>
                        <th className="p-2">Reference No.</th>
                        <th className="p-2">Result</th>
                        <th className="p-2">Observations</th>
                        <th className="p-2">Classification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.externalVerifications?.map((v: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2 font-medium">{v.sourceName}</td>
                          <td className="p-2 font-mono">{v.referenceNumber}</td>
                          <td className="p-2 font-semibold text-slate-800">{v.result}</td>
                          <td className="p-2">{v.observations}</td>
                          <td className="p-2 text-amber-800 font-semibold text-[10px]">{v.simulationDisclaimer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Legal Disclaimer */}
              <div className="p-3 bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-500 leading-relaxed">
                <strong>STATUTORY NOTICE:</strong> {report.metadata?.legalDisclaimer}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

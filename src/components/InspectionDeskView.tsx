import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import {
  Application,
  DocumentRecord,
  FdrInstrument,
  FindingStatus,
  Institution,
  User,
  ValidationFinding,
  VerificationAttempt,
  VerificationSource,
} from '../types/index.ts';
import {
  Search,
  CheckCircle2,
  AlertOctagon,
  FileText,
  ShieldCheck,
  Send,
  Building,
  QrCode,
  AlertTriangle,
  FileCheck,
  ArrowRight,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Lock,
  Layers,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface InspectionDeskViewProps {
  currentUser: User | null;
  initialApplicationId?: string | null;
  onOpenReportModal: (appId: string) => void;
}

export const InspectionDeskView: React.FC<InspectionDeskViewProps> = ({
  currentUser,
  initialApplicationId,
  onOpenReportModal,
}) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>(initialApplicationId || 'app-1');

  const [application, setApplication] = useState<Application | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [verifications, setVerifications] = useState<VerificationAttempt[]>([]);
  const [fdrInstruments, setFdrInstruments] = useState<FdrInstrument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [selectedFindingId, setSelectedFindingId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Reviewer Action Modal/Form State
  const [actionReason, setActionReason] = useState('');
  const [actionPending, setActionPending] = useState(false);

  // Verification State
  const [verifying, setVerifying] = useState(false);

  // Concurrency & Approval Command Feedback (Scenarios 5, 8, 10)
  const [approvalFeedback, setApprovalFeedback] = useState<{
    type: 'SUCCESS' | 'ERROR' | 'CONFLICT' | 'UNAUTHORIZED';
    message: string;
    correlationId?: string;
  } | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    if (selectedAppId) {
      loadApplicationData(selectedAppId);
    }
  }, [selectedAppId]);

  const loadQueue = async () => {
    try {
      const res = await api.getApplications();
      setApplications(res.applications);
      if (!selectedAppId && res.applications.length > 0) {
        setSelectedAppId(res.applications[0].id);
      }
    } catch (err) {
      console.error('Failed to load queue', err);
    }
  };

  const loadApplicationData = async (id: string) => {
    try {
      setLoading(true);
      setApprovalFeedback(null);
      const res = await api.getApplicationById(id);
      setApplication(res.application);
      setInstitution(res.institution || null);
      setDocuments(res.documents);
      setFindings(res.findings);
      setVerifications(res.verifications);
      setFdrInstruments(res.fdrInstruments || []);

      if (res.documents.length > 0 && !selectedDocId) {
        setSelectedDocId(res.documents[0].id);
      }
      if (res.findings.length > 0) {
        setSelectedFindingId(res.findings[0].id);
      }
    } catch (err) {
      console.error('Failed to load application data', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedDoc = documents.find((d) => d.id === selectedDocId) || documents[0];
  const selectedFinding = findings.find((f) => f.id === selectedFindingId) || findings[0];

  const handleUpdateFindingStatus = async (status: FindingStatus) => {
    if (!selectedFinding) return;
    if ((status === 'RESOLVED' || status === 'FALSE_POSITIVE') && !actionReason.trim()) {
      alert('Mandatory Requirement: Please provide a detailed scrutiny reason / override justification.');
      return;
    }

    try {
      setActionPending(true);
      await api.updateFinding(selectedFinding.id, {
        status,
        reviewerNotes: actionReason || `Status marked as ${status} by ${currentUser?.name}`,
        overrideReason: status === 'RESOLVED' || status === 'FALSE_POSITIVE' ? actionReason : undefined,
      });
      setActionReason('');
      loadApplicationData(selectedAppId);
    } catch (err: any) {
      alert('Failed to update finding: ' + err.message);
    } finally {
      setActionPending(false);
    }
  };

  // SCENARIO 6: BANK API VERIFICATION (WITH TIMEOUT SIMULATION)
  const handleTriggerBankVerification = async (simulateMode?: 'TIMEOUT' | 'SUCCESS') => {
    if (!selectedDoc || !application) return;
    try {
      setVerifying(true);
      await api.verifyDocument(application.id, selectedDoc.id, 'BANK_DIRECT_API', simulateMode);
      loadApplicationData(application.id);
    } catch (err: any) {
      alert('Bank verification failed: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  // SCENARIOS 5, 8, 10: APPROVAL COMMAND EXECUTION
  const handleExecuteApproval = async (mode: 'NORMAL' | 'SIMULATE_CONFLICT' | 'SIMULATE_DB_FAILURE') => {
    if (!application) return;
    try {
      setApproving(true);
      setApprovalFeedback(null);

      // In simulate conflict mode, pass a stale version
      const expectedVersion =
        mode === 'SIMULATE_CONFLICT' ? (application.version || 1) - 1 : (application.version || 1);

      const idempotencyKey = `idem-${application.id}-${Date.now()}`;
      const simulateDbFailure = mode === 'SIMULATE_DB_FAILURE';

      const res = await api.submitApproval(application.id, {
        expectedVersion,
        idempotencyKey,
        approvalReason: 'Official statutory approval granted under Approval Process Handbook Chapter I',
        simulateDbFailure,
      });

      setApprovalFeedback({
        type: 'SUCCESS',
        message: res.message,
        correlationId: res.correlationId,
      });
      loadApplicationData(application.id);
      loadQueue();
    } catch (err: any) {
      if (err.status === 403) {
        setApprovalFeedback({
          type: 'UNAUTHORIZED',
          message: err.message,
          correlationId: err.data?.correlationId,
        });
      } else if (err.status === 409) {
        setApprovalFeedback({
          type: 'CONFLICT',
          message: err.message,
          correlationId: err.data?.correlationId,
        });
      } else {
        setApprovalFeedback({
          type: 'ERROR',
          message: err.message,
          correlationId: err.data?.correlationId,
        });
      }
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wider">
              Reviewer Scrutiny Workspace
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              Active Officer: <strong>{currentUser?.name}</strong> ({currentUser?.role} -{' '}
              {currentUser?.canApproveApplications ? 'Authorized Approver' : 'Scrutiny Only / No Approval Authority'})
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#0f294a] mt-1">
            Split-Screen Evidence & Document Verification Desk
          </h1>
        </div>

        {/* Application Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600">Application:</label>
          <select
            value={selectedAppId}
            onChange={(e) => {
              setSelectedAppId(e.target.value);
              setSelectedDocId('');
              setSelectedFindingId('');
            }}
            className="text-xs font-semibold p-2 border border-slate-300 rounded bg-white text-slate-800 focus:border-[#0f294a]"
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.applicationNumber} · {app.institutionName.slice(0, 24)}... (v{app.version || 1} - {app.status})
              </option>
            ))}
          </select>
          <button
            onClick={() => onOpenReportModal(selectedAppId)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded"
          >
            Report View
          </button>
        </div>
      </div>

      {/* Approval Command Feedback Banner (Scenarios 5, 8, 10) */}
      {approvalFeedback && (
        <div
          className={`p-4 rounded-lg border text-xs flex items-start justify-between gap-3 ${
            approvalFeedback.type === 'SUCCESS'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : approvalFeedback.type === 'UNAUTHORIZED'
              ? 'bg-red-50 border-red-300 text-red-950'
              : approvalFeedback.type === 'CONFLICT'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-red-50 border-red-300 text-red-950'
          }`}
        >
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-2">
              {approvalFeedback.type === 'SUCCESS' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {approvalFeedback.type === 'UNAUTHORIZED' && <Lock className="w-4 h-4 text-red-600" />}
              {approvalFeedback.type === 'CONFLICT' && <Clock className="w-4 h-4 text-amber-600" />}
              {approvalFeedback.type === 'ERROR' && <AlertOctagon className="w-4 h-4 text-red-600" />}
              <span>
                {approvalFeedback.type === 'SUCCESS' && 'Approval Transaction Successfully Committed'}
                {approvalFeedback.type === 'UNAUTHORIZED' && 'Security Authorization Denied (HTTP 403)'}
                {approvalFeedback.type === 'CONFLICT' && 'Optimistic Concurrency Conflict Detected (HTTP 409)'}
                {approvalFeedback.type === 'ERROR' && 'Database Transaction Rolled Back (HTTP 500)'}
              </span>
            </div>
            <p className="leading-relaxed">{approvalFeedback.message}</p>
            {approvalFeedback.correlationId && (
              <div className="font-mono text-[10px] text-slate-500">
                Audit Correlation ID: {approvalFeedback.correlationId}
              </div>
            )}
          </div>
          <button
            onClick={() => setApprovalFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Split-Screen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane (5 Columns): Document & Evidence Inspector */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-[780px]">
          {/* Header */}
          <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold truncate max-w-[220px]">
                {selectedDoc?.title || 'No Document Selected'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Version v{selectedDoc?.version || 1}</span>
          </div>

          {/* Document Pills */}
          <div className="p-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px]">
            {documents.map((doc) => {
              const isSelected = doc.id === selectedDoc?.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors font-medium ${
                    isSelected
                      ? 'bg-white text-[#0f294a] shadow-xs border border-slate-200 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {doc.documentType.replace(/_/g, ' ')} (v{doc.version})
                </button>
              );
            })}
          </div>

          {/* Transcript Viewer */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50 text-xs">
            {/* Authenticity Status Card */}
            {selectedDoc?.authenticityStatus && (
              <div className="bg-white p-3 rounded border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Authenticity Assessment</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">
                    {selectedDoc.authenticityStatus.replace(/_/g, ' ')}
                  </div>
                </div>
                <span className="text-[10px] bg-slate-100 font-mono px-2 py-0.5 rounded text-slate-600">
                  {selectedDoc.isSimulated ? 'SIMULATED DATA' : 'OFFICIAL'}
                </span>
              </div>
            )}

            {/* Suspicious Indicators Alert (Scenario 1) */}
            {selectedDoc?.extractedFields.suspiciousIndicators &&
              selectedDoc.extractedFields.suspiciousIndicators.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3.5 rounded text-red-950 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-red-700">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Suspicious Indicators Detected (Scenario 1)</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-1">
                    {selectedDoc.extractedFields.suspiciousIndicators.map((ind, i) => (
                      <li key={i}>{ind}</li>
                    ))}
                  </ul>
                  <div className="text-[10px] text-red-800 font-medium pt-1">
                    Authenticity assessment set to: <code>INDEPENDENT_VERIFICATION_REQUIRED</code>. Automatic approval disabled.
                  </div>
                </div>
              )}

            {/* OCR Transcript */}
            <div className="bg-white p-4 rounded border border-slate-200 space-y-2 font-mono text-[11px] text-slate-800 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 font-sans">
                <span className="font-semibold text-xs text-slate-900">Extracted Transcript</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Confidence: {((selectedDoc?.extractedFields.extractionConfidence || 0.95) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="p-3 bg-amber-50/30 border border-amber-200/60 rounded text-slate-900 leading-relaxed whitespace-pre-wrap">
                {selectedDoc?.extractedFields.rawTextPreview || 'No OCR transcript available.'}
              </div>
            </div>

            {/* Bank FDR Details if applicable */}
            {selectedDoc?.extractedFields.financialAmount && (
              <div className="bg-white p-3.5 rounded border border-slate-200 space-y-2">
                <div className="font-semibold text-xs text-slate-900">Financial Instrument Attributes</div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                  <div>Bank: <strong>{selectedDoc.extractedFields.bankName || 'State Bank of India'}</strong></div>
                  <div>FDR Number: <strong>{selectedDoc.extractedFields.fdrNumber || '—'}</strong></div>
                  <div>Amount: <strong className="tabular-nums font-mono">INR {selectedDoc.extractedFields.financialAmount.toLocaleString()}</strong></div>
                  <div>Maturity: <strong className="font-mono">{selectedDoc.extractedFields.expiryDate || '—'}</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane (7 Columns): Scrutiny Findings, Bank Verification & Approval Concurrency */}
        <div className="lg:col-span-7 space-y-6">
          {/* Findings List */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Regulatory Scrutiny Findings ({findings.length})</h2>
                <p className="text-xs text-slate-500">Inspect evidence and record committee determinations</p>
              </div>
            </div>

            <div className="space-y-2">
              {findings.map((fnd) => {
                const isSelected = fnd.id === selectedFinding?.id;
                const isCritical = fnd.severity === 'CRITICAL';
                return (
                  <button
                    key={fnd.id}
                    onClick={() => setSelectedFindingId(fnd.id)}
                    className={`w-full text-left p-3 rounded border text-xs transition-colors flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-[#0f294a] bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          isCritical ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                        }`}>
                          {fnd.severity}
                        </span>
                        <span className="font-semibold text-slate-900">{fnd.ruleTitle}</span>
                      </div>
                      <div className="text-slate-600 text-[11px] mt-1 line-clamp-1">
                        {fnd.observedEvidence}
                      </div>
                    </div>
                    <span className="text-[10px] font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">
                      {fnd.status.replace(/_/g, ' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Finding Override / Resolution Form */}
          {selectedFinding && (
            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500 font-mono">{selectedFinding.ruleId} · {selectedFinding.ruleVersion}</div>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">{selectedFinding.ruleTitle}</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border">
                  {selectedFinding.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="text-xs text-slate-800">
                <strong>Observed Evidence:</strong> {selectedFinding.observedEvidence}
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-slate-900">
                  Scrutiny Decision Rationale:
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter mandatory justification for overriding or resolving this finding..."
                  rows={2}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleUpdateFindingStatus('CONFIRMED_DISCREPANCY')}
                    disabled={actionPending}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
                  >
                    Confirm Discrepancy
                  </button>
                  <button
                    onClick={() => handleUpdateFindingStatus('RESOLVED')}
                    disabled={actionPending}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded"
                  >
                    Resolve with Justification
                  </button>
                  <button
                    onClick={() => handleUpdateFindingStatus('ADDITIONAL_EVIDENCE_REQUIRED')}
                    disabled={actionPending}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded"
                  >
                    Request Additional Evidence
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SCENARIO 6: BANK DIRECT API VERIFICATION PANEL */}
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Bank Direct API Verification Adapter</h3>
                <p className="text-xs text-slate-500">
                  Direct inquiry to Core Banking Registry with connection timeouts, bounded retries, and circuit breaker
                </p>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">
                BANK DIRECT API
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleTriggerBankVerification('SUCCESS')}
                disabled={verifying}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Verify Core Banking Ledger (Normal)
              </button>
              <button
                onClick={() => handleTriggerBankVerification('TIMEOUT')}
                disabled={verifying}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white rounded flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" /> Test Bank API Timeout (Scenario 6)
              </button>
            </div>

            {/* Verification Results */}
            <div className="space-y-2 pt-2">
              {verifications.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3 rounded border border-slate-200 bg-slate-50 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{ver.sourceName}</span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      {ver.simulationDisclaimer}
                    </span>
                  </div>
                  <div className="text-slate-700 text-[11px]">{ver.observations}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>Result: <strong>{ver.result}</strong></span>
                    {ver.retryCount !== undefined && <span>Retries: {ver.retryCount}/{ver.maxRetries || 3}</span>}
                    {ver.correlationId && <span>CID: {ver.correlationId}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SCENARIOS 5, 8, 10: CONCURRENCY & APPROVAL COMMAND WORKSPACE */}
          <div className="bg-slate-900 text-white p-6 rounded-lg shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Statutory Approval & Concurrency Engine</h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Server-side authorization, optimistic concurrency control (OCC), and transaction rollback safeguards
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Current App State:</span>
                <div className="font-bold text-amber-400 font-mono text-sm">
                  v{application?.version || 1} · {application?.status}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Authorized Approval (Normal) */}
              <button
                onClick={() => handleExecuteApproval('NORMAL')}
                disabled={approving}
                className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold text-left transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="text-emerald-200 text-[10px] uppercase font-semibold">Authorized Action</div>
                  <div className="mt-1">Commit Approval (OCC v{application?.version || 1})</div>
                </div>
                <div className="text-[10px] text-emerald-100 mt-2">
                  Verifies preconditions & increments OCC version
                </div>
              </button>

              {/* Scenario 8: Test Concurrency Conflict */}
              <button
                onClick={() => handleExecuteApproval('SIMULATE_CONFLICT')}
                disabled={approving}
                className="p-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded text-xs font-bold text-left transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="text-amber-400 text-[10px] uppercase font-semibold">Test Scenario 8</div>
                  <div className="mt-1">Simulate Concurrency Collision (HTTP 409)</div>
                </div>
                <div className="text-[10px] text-slate-400 mt-2">
                  Sends stale version to test atomic conflict rejection
                </div>
              </button>

              {/* Scenario 10: Test Database Failure Rollback */}
              <button
                onClick={() => handleExecuteApproval('SIMULATE_DB_FAILURE')}
                disabled={approving}
                className="p-3 bg-slate-800 hover:bg-slate-700 text-red-300 border border-red-500/30 rounded text-xs font-bold text-left transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="text-red-400 text-[10px] uppercase font-semibold">Test Scenario 10</div>
                  <div className="mt-1">Simulate Database Transaction Abort (HTTP 500)</div>
                </div>
                <div className="text-[10px] text-slate-400 mt-2">
                  Ensures no false success & verifies rollback
                </div>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 flex items-center justify-between">
              <span>
                To test <strong>Scenario 5 (Unauthorized Officer Denial)</strong>: use "Switch Role" in the top bar to switch to <em>Aditya Verma (Junior Trainee Reviewer)</em> or an Institution user, then click Commit Approval.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

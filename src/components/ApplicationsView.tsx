import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import {
  Application,
  ApplicationCategory,
  ApplicationStatus,
  DocumentRecord,
  DocumentVersionRecord,
  FdrInstrument,
  Institution,
  User,
  ValidationFinding,
  ValidationRun,
  VerificationAttempt,
} from '../types/index.ts';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Download,
  Eye,
  Trash2,
  ExternalLink,
  History,
  FileSpreadsheet,
  AlertOctagon,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';

interface ApplicationsViewProps {
  currentUser: User | null;
  initialFilterStatus?: string;
  selectedApplicationId?: string | null;
  onSelectApplication: (id: string | null) => void;
  onOpenInspectionDesk: (id: string) => void;
  onOpenReportModal: (appId: string) => void;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  currentUser,
  initialFilterStatus,
  selectedApplicationId,
  onSelectApplication,
  onOpenInspectionDesk,
  onOpenReportModal,
}) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilterStatus || '');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Selected Application Detail State
  const [detailApp, setDetailApp] = useState<Application | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [verifications, setVerifications] = useState<VerificationAttempt[]>([]);
  const [validationRun, setValidationRun] = useState<ValidationRun | null>(null);
  const [fdrInstruments, setFdrInstruments] = useState<FdrInstrument[]>([]);
  const [documentVersions, setDocumentVersions] = useState<DocumentVersionRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [targetReplaceDoc, setTargetReplaceDoc] = useState<DocumentRecord | null>(null);

  // Upload/Replace Form State
  const [uploadType, setUploadType] = useState('FIRE_NOC');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replacementReason, setReplacementReason] = useState('');
  const [replaceAmount, setReplaceAmount] = useState('3500000');
  const [replaceExpiry, setReplaceExpiry] = useState('2029-05-14');

  // Rule Ambiguity Resolution state (Scenario 7)
  const [showResolveRuleModal, setShowResolveRuleModal] = useState(false);
  const [ruleRationale, setRuleRationale] = useState('');
  const [selectedRuleResolution, setSelectedRuleResolution] = useState('RULE-FACULTY-RATIO-05');

  // New Application Form State
  const [newCategory, setNewCategory] = useState<ApplicationCategory>('Extension of Approval');
  const [newIntake, setNewIntake] = useState('600');
  const [newProgramme, setNewProgramme] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    loadApplications();
  }, [statusFilter, categoryFilter, search]);

  useEffect(() => {
    if (selectedApplicationId) {
      loadApplicationDetail(selectedApplicationId);
    } else {
      setDetailApp(null);
    }
  }, [selectedApplicationId]);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const res = await api.getApplications({
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
      });
      setApplications(res.applications);
    } catch (err) {
      console.error('Failed to load applications', err);
    } finally {
      setLoading(false);
    }
  };

  const loadApplicationDetail = async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await api.getApplicationById(id);
      setDetailApp(res.application);
      setInstitution(res.institution || null);
      setDocuments(res.documents);
      setFindings(res.findings);
      setVerifications(res.verifications);
      setValidationRun(res.validationRun || null);
      setFdrInstruments(res.fdrInstruments || []);

      const versionsRes = await api.getDocumentVersions(id);
      setDocumentVersions(versionsRes.documentVersions || []);
    } catch (err) {
      console.error('Failed to load application detail', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createApplication({
        category: newCategory,
        proposedIntake: newIntake ? parseInt(newIntake, 10) : undefined,
        proposedProgramme: newProgramme || undefined,
        notes: newNotes,
        academicYear: '2026-2027',
      });
      setShowCreateModal(false);
      loadApplications();
      onSelectApplication(res.application.id);
    } catch (err) {
      alert('Failed to create application: ' + err);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailApp || !uploadFile) return;

    try {
      setUploading(true);
      await api.uploadDocument(detailApp.id, uploadFile, uploadType);
      setShowUploadModal(false);
      setUploadFile(null);
      loadApplicationDetail(detailApp.id);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // SCENARIO 9: REPLACE DOCUMENT VERSION
  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailApp || !targetReplaceDoc || !uploadFile) return;

    try {
      setUploading(true);
      await api.replaceDocument(detailApp.id, targetReplaceDoc.id, uploadFile, {
        replacementReason: replacementReason || 'Uploaded corrected certificate with renewed amount and validity',
        financialAmount: replaceAmount ? parseFloat(replaceAmount) : undefined,
        expiryDate: replaceExpiry || undefined,
      });
      setShowReplaceModal(false);
      setUploadFile(null);
      setTargetReplaceDoc(null);
      setReplacementReason('');
      loadApplicationDetail(detailApp.id);
      loadApplications();
    } catch (err: any) {
      alert('Document replacement failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // SCENARIO 7: RESOLVE RULE AMBIGUITY
  const handleResolveRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailApp) return;

    try {
      await api.resolveAmbiguousRule(detailApp.id, {
        selectedRuleId: selectedRuleResolution,
        resolutionRationale: ruleRationale || 'Approved by Regional Scrutiny Committee under Chapter II Norms',
      });
      setShowResolveRuleModal(false);
      setRuleRationale('');
      loadApplicationDetail(detailApp.id);
      loadApplications();
    } catch (err: any) {
      alert('Rule resolution failed: ' + err.message);
    }
  };

  const handleRunValidation = async () => {
    if (!detailApp) return;
    try {
      setLoadingDetail(true);
      const res = await api.runValidation(detailApp.id, 'DETERMINISTIC');
      setValidationRun(res.validationRun);
      setFindings(res.findings);
      loadApplicationDetail(detailApp.id);
      loadApplications();
    } catch (err: any) {
      alert('Validation run failed: ' + err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded font-medium">Draft</span>;
      case 'SUBMITTED':
        return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-medium">Submitted</span>;
      case 'VALIDATION_IN_PROGRESS':
        return <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded font-medium">Validating</span>;
      case 'DEFICIENCIES_FOUND':
        return <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded font-medium">Deficiencies Found</span>;
      case 'DUPLICATE_CONFLICT_REVIEW':
        return <span className="bg-purple-100 text-purple-900 text-xs px-2 py-0.5 rounded font-bold">Duplicate Conflict Review</span>;
      case 'EXPIRING_TODAY':
        return <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded font-bold animate-pulse">Expires Today</span>;
      case 'VERIFICATION_PENDING':
        return <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-medium">Verification Pending</span>;
      case 'UNDER_HUMAN_REVIEW':
        return <span className="bg-teal-100 text-teal-800 text-xs px-2 py-0.5 rounded font-medium">Under Review</span>;
      case 'CLARIFICATION_REQUESTED':
        return <span className="bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded font-medium">Clarification Sought</span>;
      case 'REVIEW_COMPLETED':
        return <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-medium">Review Completed</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded">{status}</span>;
    }
  };

  // If viewing application detail
  if (detailApp) {
    const criticalCount = findings.filter((f) => f.severity === 'CRITICAL' && (f.status === 'OPEN' || f.status === 'CONFIRMED_DISCREPANCY')).length;
    const majorCount = findings.filter((f) => f.severity === 'MAJOR' && (f.status === 'OPEN' || f.status === 'CONFIRMED_DISCREPANCY')).length;
    const shortfallFinding = findings.find((f) => f.ruleId === 'RULE-FINANCIAL-SHORTFALL-06' && f.financialShortfall);
    const primaryFdr = fdrInstruments[0];

    return (
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSelectApplication(null)}
            className="text-xs font-semibold text-[#0f294a] hover:underline flex items-center gap-1.5"
          >
            &larr; Back to Applications List
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVersionsModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5 text-blue-700" /> Version History ({documentVersions.length})
            </button>
            <button
              onClick={() => onOpenReportModal(detailApp.id)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Printable Report
            </button>
            <button
              onClick={() => onOpenInspectionDesk(detailApp.id)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0f294a] hover:bg-[#163a66] rounded flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" /> Open Reviewer Scrutiny Desk
            </button>
          </div>
        </div>

        {/* Application Header Card with Concurrency Version */}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-slate-900">{detailApp.applicationNumber}</span>
                {getStatusBadge(detailApp.status)}
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Version {detailApp.version || 1} (OCC)
                </span>
              </div>
              <h2 className="text-base font-semibold text-slate-800 mt-1">{detailApp.institutionName}</h2>
              <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span>Category: <strong>{detailApp.category}</strong></span>
                <span>Permanent ID: <strong>{institution?.permanentId || '1-109283741'}</strong></span>
                <span>Proposed Intake: <strong>{detailApp.proposedIntake} seats</strong></span>
              </div>
            </div>

            {/* Compliance Index & Reassess Action */}
            <div className="text-right shrink-0 bg-slate-50 border border-slate-200 p-3 rounded-lg">
              <div className="text-xs text-slate-500 font-medium">Compliance Index</div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  (validationRun?.overallComplianceScore || 0) >= 80
                    ? 'text-emerald-700'
                    : (validationRun?.overallComplianceScore || 0) >= 60
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}
              >
                {validationRun ? `${validationRun.overallComplianceScore}%` : 'Not Executed'}
              </div>
              <button
                onClick={handleRunValidation}
                disabled={loadingDetail}
                className="mt-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center justify-end gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingDetail ? 'animate-spin' : ''}`} /> Re-evaluate Rules
              </button>
            </div>
          </div>

          {/* Separate Independent Status Indicators (Section 13) */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-400">Document Processing</div>
              <div className="font-semibold text-slate-800 mt-0.5">SHA-256 Hashed & OCR'd</div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-400">Authenticity Verification</div>
              <div className={`font-semibold mt-0.5 ${
                primaryFdr?.authenticityStatus === 'VERIFIED'
                  ? 'text-emerald-700'
                  : primaryFdr?.authenticityStatus === 'INDEPENDENT_VERIFICATION_REQUIRED'
                  ? 'text-red-700'
                  : 'text-amber-700'
              }`}>
                {primaryFdr?.authenticityStatus?.replace(/_/g, ' ') || 'Pending Bank API'}
              </div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-400">Financial Sufficiency</div>
              <div className={`font-semibold mt-0.5 ${shortfallFinding ? 'text-red-700' : 'text-emerald-700'}`}>
                {shortfallFinding ? 'Deficit Shortfall' : 'Statutory Corpus Met'}
              </div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-400">Rule Resolution</div>
              <div className={`font-semibold mt-0.5 ${
                detailApp.ruleResolutionStatus === 'HUMAN_REVIEW_REQUIRED' ? 'text-purple-700' : 'text-slate-800'
              }`}>
                {detailApp.ruleResolutionStatus?.replace(/_/g, ' ') || 'Resolved'}
              </div>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <div className="text-slate-400">Workflow Scrutiny</div>
              <div className="font-semibold text-slate-800 mt-0.5">{detailApp.status.replace(/_/g, ' ')}</div>
            </div>
          </div>
        </div>

        {/* SCENARIO 2: DUPLICATE CONFLICT BANNER */}
        {detailApp.status === 'DUPLICATE_CONFLICT_REVIEW' && (
          <div className="bg-purple-50 border-2 border-purple-300 p-5 rounded-lg text-purple-950 space-y-2">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-purple-700 shrink-0" />
              <h3 className="text-sm font-bold">
                Duplicate Financial Instrument Conflict Hold Active
              </h3>
            </div>
            <p className="text-xs text-purple-900 leading-relaxed">
              The FDR instrument pledged in this application matches an instrument simultaneously pledged in another active institution's submission. Automatic statutory approval is suspended at the database service level until the cross-institutional conflict is resolved.
            </p>
          </div>
        )}

        {/* SCENARIO 3: SAME-DAY EXPIRY ALERT */}
        {detailApp.status === 'EXPIRING_TODAY' && (
          <div className="bg-red-50 border-2 border-red-400 p-5 rounded-lg text-red-950 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-red-600 shrink-0" />
              <h3 className="text-sm font-bold">
                Urgent Action Required: Financial Instrument Matures Today (2026-10-21)
              </h3>
            </div>
            <p className="text-xs text-red-900 leading-relaxed">
              Statutory Fixed Deposit Receipt reaches maturity at 23:59:59 UTC today. An idempotent escalation task has been generated for the regional scrutiny committee. Pledged funds must be rolled over with joint endorsement.
            </p>
          </div>
        )}

        {/* SCENARIO 4: FINANCIAL AMOUNT COMPARISON CARD */}
        {shortfallFinding && shortfallFinding.financialShortfall && (
          <div className="bg-amber-50 border border-amber-300 p-5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-amber-700" />
                <h3 className="text-sm font-bold text-amber-950">
                  Financial Endowment Shortfall Verification Card
                </h3>
              </div>
              <span className="text-[10px] bg-red-600 text-white font-bold px-2 py-0.5 rounded">
                CRITICAL SHORTFALL
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
              <div className="bg-white p-3 rounded border border-amber-200">
                <div className="text-slate-500 font-medium">Statutory Required Corpus</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {shortfallFinding.financialShortfall.currency} {shortfallFinding.financialShortfall.requiredAmount.toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-3 rounded border border-amber-200">
                <div className="text-slate-500 font-medium">Verified FDR Renewal Amount</div>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {shortfallFinding.financialShortfall.currency} {shortfallFinding.financialShortfall.verifiedAmount.toLocaleString()}
                </div>
              </div>
              <div className="bg-red-100/60 p-3 rounded border border-red-300">
                <div className="text-red-700 font-bold">Calculated Shortfall Deficit</div>
                <div className="text-base font-extrabold text-red-700 mt-1 tabular-nums">
                  {shortfallFinding.financialShortfall.currency} {shortfallFinding.financialShortfall.shortfall.toLocaleString()}
                </div>
              </div>
            </div>

            <p className="text-xs text-amber-900">
              Precise decimal calculation: <code>shortfall = max(0, required - verified)</code>. Automatic approval is blocked until a replacement FDR is uploaded.
            </p>
          </div>
        )}

        {/* SCENARIO 7: RULE AMBIGUITY / ABSTENTION CALLOUT */}
        {detailApp.ruleResolutionStatus === 'HUMAN_REVIEW_REQUIRED' && (
          <div className="bg-purple-50 border border-purple-200 p-5 rounded-lg text-purple-950 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-purple-700 shrink-0" />
                <h3 className="text-sm font-bold">
                  Rule Resolution Abstention — Human Determination Required
                </h3>
              </div>
              <button
                onClick={() => setShowResolveRuleModal(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-purple-700 hover:bg-purple-800 text-white rounded"
              >
                Resolve Rule Mapping
              </button>
            </div>
            <p className="text-xs text-purple-900 leading-relaxed">
              {detailApp.unresolvedRuleReason}
            </p>
            <div className="text-[11px] text-purple-800 font-mono">
              Preserved Candidate Rules: {(detailApp.candidateRules || []).join(' vs ')}
            </div>
          </div>
        )}

        {/* Document Inventory with Replace Action (Scenario 9) */}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Statutory Documents & Financial Instruments</h3>
              <p className="text-xs text-slate-500">
                Replace any defective upload with a new immutable version without overwriting historical audit records.
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0f294a] hover:bg-[#163a66] rounded flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Upload Document
            </button>
          </div>

          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{doc.title}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.2 rounded font-mono">
                          v{doc.version}
                        </span>
                        {doc.authenticityStatus && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            doc.authenticityStatus === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : doc.authenticityStatus === 'INDEPENDENT_VERIFICATION_REQUIRED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {doc.authenticityStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {doc.documentType} · {(doc.fileSizeBytes / 1024).toFixed(1)} KB · Uploaded {doc.uploadedAt.slice(0, 10)}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Replace with corrected document */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTargetReplaceDoc(doc);
                        setShowReplaceModal(true);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Replace Version
                    </button>
                  </div>
                </div>

                {/* Extracted Details & SHA-256 */}
                <div className="bg-white p-3 rounded border border-slate-200 text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  {doc.extractedFields.financialAmount && (
                    <div>FDR Amount: <strong className="tabular-nums font-mono">INR {doc.extractedFields.financialAmount.toLocaleString()}</strong></div>
                  )}
                  {doc.extractedFields.fdrNumber && (
                    <div>FDR Number: <strong className="font-mono">{doc.extractedFields.fdrNumber}</strong></div>
                  )}
                  {doc.extractedFields.expiryDate && (
                    <div>Maturity / Expiry: <strong className="font-mono">{doc.extractedFields.expiryDate}</strong></div>
                  )}
                  <div>Extraction Method: <strong>{doc.extractedFields.extractionMethod}</strong> (Confidence: {((doc.extractedFields.extractionConfidence || 0.95) * 100).toFixed(0)}%)</div>
                  <div className="sm:col-span-2 text-slate-400 font-mono text-[10px] break-all">
                    SHA-256: {doc.sha256Hash}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Validation Findings Table */}
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Traceable Rule Findings ({findings.length})</h3>
              <p className="text-xs text-slate-500">Every finding is linked to an exact rule version and physical document proof</p>
            </div>
          </div>

          <div className="space-y-3">
            {findings.map((fnd) => (
              <div
                key={fnd.id}
                className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                  fnd.severity === 'CRITICAL'
                    ? 'border-red-200 bg-red-50/40'
                    : fnd.severity === 'MAJOR'
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      fnd.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                    }`}>
                      {fnd.severity}
                    </span>
                    <span className="font-semibold text-slate-900">{fnd.ruleTitle}</span>
                    <span className="font-mono text-[10px] text-slate-400">{fnd.ruleId} · {fnd.ruleVersion}</span>
                  </div>
                  <span className="text-[10px] font-medium bg-white px-2 py-0.5 rounded border border-slate-200">
                    {fnd.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="text-slate-800">
                  <strong>Observed Evidence:</strong> {fnd.observedEvidence}
                </div>

                {fnd.expectedValue && (
                  <div className="text-slate-600 text-[11px]">
                    <strong>Statutory Rule Requirement:</strong> {fnd.expectedValue}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal: Replace Document Version (Scenario 9) */}
        {showReplaceModal && targetReplaceDoc && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Replace Document with New Version</h3>
                  <p className="text-xs text-slate-500">
                    Target: {targetReplaceDoc.title} (Currently v{targetReplaceDoc.version} &rarr; will create v{targetReplaceDoc.version + 1})
                  </p>
                </div>
                <button onClick={() => setShowReplaceModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                  &times;
                </button>
              </div>

              <form onSubmit={handleReplaceSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Select Corrected File (PDF, PNG, JPEG)</label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    required
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-slate-600 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Replacement Reason (Recorded in Audit Trail)</label>
                  <textarea
                    value={replacementReason}
                    onChange={(e) => setReplacementReason(e.target.value)}
                    placeholder="e.g., Deposited shortfall balance and uploaded renewed FDR receipt with 5-year rollover."
                    rows={2}
                    className="w-full p-2 border border-slate-300 rounded"
                    required
                  />
                </div>

                {targetReplaceDoc.documentType === 'FDR_OR_ENDOWMENT' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded border border-slate-200">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Renewed Amount (INR)</label>
                      <input
                        type="number"
                        value={replaceAmount}
                        onChange={(e) => setReplaceAmount(e.target.value)}
                        className="w-full p-1.5 border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">New Maturity Date</label>
                      <input
                        type="date"
                        value={replaceExpiry}
                        onChange={(e) => setReplaceExpiry(e.target.value)}
                        className="w-full p-1.5 border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowReplaceModal(false)}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !uploadFile}
                    className="px-4 py-1.5 bg-[#0f294a] text-white font-semibold rounded hover:bg-[#163a66] disabled:opacity-50"
                  >
                    {uploading ? 'Processing Reassessment...' : 'Commit Version Replacement'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Document Version History (Scenario 9) */}
        {showVersionsModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full border border-slate-200 p-6 space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 shrink-0">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Immutable Document Version History</h3>
                  <p className="text-xs text-slate-500">Every replacement retains historical file digests and timestamps</p>
                </div>
                <button onClick={() => setShowVersionsModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                  &times;
                </button>
              </div>

              <div className="overflow-y-auto space-y-3 flex-1 text-xs">
                {documentVersions.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">No version records available.</div>
                ) : (
                  documentVersions.map((v) => (
                    <div
                      key={v.id}
                      className={`p-3.5 rounded border ${
                        v.isActive ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-slate-50 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{v.originalFilename}</span>
                          <span className="text-[10px] bg-slate-200 text-slate-800 font-bold px-1.5 py-0.2 rounded font-mono">
                            v{v.versionNumber}
                          </span>
                          {v.isActive ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                              ACTIVE VERSION
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                              SUPERSEDED
                            </span>
                          )}
                        </div>
                        <span className="text-slate-500 text-[11px]">{v.uploadedAt.slice(0, 19).replace('T', ' ')}</span>
                      </div>

                      {v.replacementReason && (
                        <div className="text-slate-700 text-[11px] mt-1">
                          <strong>Replacement Reason:</strong> {v.replacementReason}
                        </div>
                      )}

                      <div className="font-mono text-[10px] text-slate-400 mt-1 break-all">
                        SHA-256: {v.sha256Hash}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-200 text-right shrink-0">
                <button
                  onClick={() => setShowVersionsModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Rule Ambiguity Resolution (Scenario 7) */}
        {showResolveRuleModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">Resolve Regulatory Rule Ambiguity</h3>
                <button onClick={() => setShowResolveRuleModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                  &times;
                </button>
              </div>

              <form onSubmit={handleResolveRuleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Applicable Regulatory Standard</label>
                  <select
                    value={selectedRuleResolution}
                    onChange={(e) => setSelectedRuleResolution(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded font-medium"
                  >
                    <option value="RULE-FACULTY-RATIO-05">AICTE Cadre Norms Chapter II (1:20 Ratio)</option>
                    <option value="RULE-SPECIALIZED-ARCH-STUDIO-NORMS-v2">Specialized Studio Norms (Design Standards)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Administrative Rationale & Authority Reference</label>
                  <textarea
                    value={ruleRationale}
                    onChange={(e) => setRuleRationale(e.target.value)}
                    placeholder="e.g. Scrutiny committee resolution under Approval Handbook Clause 4.2; computational studio qualifies under Chapter II."
                    rows={3}
                    className="w-full p-2 border border-slate-300 rounded"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowResolveRuleModal(false)}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#0f294a] text-white font-semibold rounded hover:bg-[#163a66]"
                  >
                    Commit Resolution
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Application List View
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f294a]">Regulatory Applications</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage institutional approval applications, statutory filings, and deficiency resolution.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0f294a] hover:bg-[#163a66] rounded-md transition-colors flex items-center gap-1.5 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> New Approval Application
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by application number or institution name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs bg-transparent border-0 focus:ring-0 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-1.5 border border-slate-200 rounded text-slate-700 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="DEFICIENCIES_FOUND">Deficiencies Found</option>
            <option value="DUPLICATE_CONFLICT_REVIEW">Duplicate Conflict Review</option>
            <option value="EXPIRING_TODAY">Expiring Today</option>
            <option value="VERIFICATION_PENDING">Verification Pending</option>
            <option value="UNDER_HUMAN_REVIEW">Under Human Review</option>
            <option value="REVIEW_COMPLETED">Review Completed</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="p-1.5 border border-slate-200 rounded text-slate-700 bg-white"
          >
            <option value="">All Categories</option>
            <option value="Extension of Approval">Extension of Approval</option>
            <option value="New Programme or Course">New Programme or Course</option>
            <option value="Approved Intake Change">Approved Intake Change</option>
            <option value="Faculty Information Update">Faculty Information Update</option>
            <option value="Infrastructure Information Update">Infrastructure Information Update</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="py-3 px-4">Application No.</th>
              <th className="py-3 px-4">Institution Name</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Intake</th>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {applications.map((app) => (
              <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-4 font-mono font-semibold text-[#0f294a]">
                  {app.applicationNumber}
                </td>
                <td className="py-3 px-4 text-slate-900 font-medium max-w-xs truncate">
                  {app.institutionName}
                </td>
                <td className="py-3 px-4 text-slate-600">{app.category}</td>
                <td className="py-3 px-4">{getStatusBadge(app.status)}</td>
                <td className="py-3 px-4 tabular-nums text-slate-700">{app.proposedIntake || '—'}</td>
                <td className="py-3 px-4 font-mono text-slate-500">v{app.version || 1}</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => onSelectApplication(app.id)}
                    className="font-semibold text-blue-700 hover:text-blue-900 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    Inspect &rarr;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Initiate Approval Application</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateApplication} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ApplicationCategory)}
                  className="w-full p-2 border border-slate-300 rounded font-medium"
                >
                  <option value="Extension of Approval">Extension of Approval</option>
                  <option value="New Programme or Course">New Programme or Course</option>
                  <option value="Approved Intake Change">Approved Intake Change</option>
                  <option value="Faculty Information Update">Faculty Information Update</option>
                  <option value="Infrastructure Information Update">Infrastructure Information Update</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Proposed Intake</label>
                <input
                  type="number"
                  value={newIntake}
                  onChange={(e) => setNewIntake(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0f294a] text-white font-semibold rounded"
                >
                  Create Application Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

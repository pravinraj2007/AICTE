import React, { useState, useEffect } from 'react';
import {
  Award,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Building,
  HelpCircle,
  ExternalLink,
  Layers,
  FileText,
  Search,
  Lock,
} from 'lucide-react';
import { FdrInstrument, User, Application, ValidationFinding } from '../types/index.ts';
import { api } from '../services/api.ts';
import { StatusBadge } from './common/StatusBadge.tsx';

interface FdrVerificationViewProps {
  currentUser: User | null;
  onOpenApplication?: (appId: string) => void;
}

export const FdrVerificationView: React.FC<FdrVerificationViewProps> = ({
  currentUser,
  onOpenApplication,
}) => {
  const [fdrInstruments, setFdrInstruments] = useState<FdrInstrument[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [validationFindings, setValidationFindings] = useState<ValidationFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [simulatedMode, setSimulatedMode] = useState<'TIMEOUT' | 'SUCCESS'>('TIMEOUT');
  const [feedback, setFeedback] = useState<{ type: 'SUCCESS' | 'ERROR'; message: string } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const appsRes = await api.getApplications();
      setApplications(appsRes.applications);

      // Fetch all application records to aggregate all FDR instruments
      const allInstruments: FdrInstrument[] = [];
      const allFindings: ValidationFinding[] = [];
      for (const a of appsRes.applications) {
        try {
          const detail = await api.getApplicationById(a.id);
          allFindings.push(...detail.findings);
          if (detail.fdrInstruments && detail.fdrInstruments.length > 0) {
            allInstruments.push(...detail.fdrInstruments);
          }
        } catch (e) {
          // ignore
        }
      }
      setFdrInstruments(allInstruments);
      setValidationFindings(allFindings);
    } catch (err) {
      console.error('Failed to load FDR instruments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTriggerBankVerification = async (docId: string, appId: string) => {
    try {
      setVerifyingDocId(docId);
      setFeedback(null);
      const res = await api.verifyDocument(appId, docId, 'BANK_DIRECT_API', simulatedMode);

      setFeedback({
        type: res.verification.result === 'VERIFIED_IN_SIMULATION' ? 'SUCCESS' : 'ERROR',
        message: `${res.verification.result}: ${res.verification.observations} (Disclaimer: ${res.verification.simulationDisclaimer})`,
      });
      loadData();
    } catch (err: any) {
      setFeedback({
        type: 'ERROR',
        message: err.message || 'Bank direct verification failed',
      });
    } finally {
      setVerifyingDocId(null);
    }
  };

  // Mask sensitive account / FDR number for security
  const maskInstrumentNumber = (num: string) => {
    if (!num || num.length < 5) return '••••••';
    const prefix = num.slice(0, 3);
    const suffix = num.slice(-3);
    return `${prefix}••••${suffix}`;
  };

  const filteredInstruments = fdrInstruments.filter((inst) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      inst.bankName.toLowerCase().includes(q) ||
      inst.holderName.toLowerCase().includes(q) ||
      inst.fdrNumberNormalized.toLowerCase().includes(q)
    );
  });
  const instrumentGroups = new Map<string, FdrInstrument[]>();
  for (const instrument of fdrInstruments) {
    const group = instrumentGroups.get(instrument.fdrNumberNormalized) || [];
    group.push(instrument);
    instrumentGroups.set(instrument.fdrNumberNormalized, group);
  }
  const duplicateGroups = Array.from(instrumentGroups.values()).filter((group) => group.length > 1);
  const duplicateInstrumentIds = new Set(duplicateGroups.flatMap((group) => group.map((item) => item.id)));
  const firstDuplicateGroup = duplicateGroups[0];
  const firstShortfall = validationFindings.find(
    (finding) => finding.financialShortfall && finding.financialShortfall.shortfall > 0
  );
  const expiringToday = fdrInstruments.filter((instrument) => instrument.isExpiringToday);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded uppercase tracking-wider border border-teal-200">
              Statutory Financial Endowment Desk
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              Active Officer: <strong>{currentUser?.name}</strong> ({currentUser?.role})
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#15345b] mt-1">
            FDR & Financial Instrument Verification Workspace
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-institution duplicate instrument collision checks, same-day maturity monitoring, and exact decimal shortfall verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Workspace</span>
          </button>
        </div>
      </div>

      {/* Interactive Verification Notice / Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-lg border text-xs flex items-start justify-between gap-3 ${
            feedback.type === 'SUCCESS'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div>
            <div className="font-bold">
              {feedback.type === 'SUCCESS'
                ? 'Bank Direct Verification Responded'
                : 'Verification API Boundary Failure'}
            </div>
            <p className="mt-0.5 leading-relaxed">{feedback.message}</p>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* CRITICAL SECURITY CARDS: 4 Specialized Safeguards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Safeguard 1: Duplicate FDR Prevention Across Different Filenames */}
        <div className="bg-white border-l-4 border-l-rose-600 border border-slate-200 rounded-lg p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Duplicate Instrument Check</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">RULE-08</span>
          </div>
          <div className="text-lg font-bold text-slate-900">
            {duplicateGroups.length} Active Collision{duplicateGroups.length === 1 ? '' : 's'}
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {firstDuplicateGroup
              ? `A repeated normalized instrument reference is present in ${firstDuplicateGroup.length} loaded records. Review linked applications; matching hashes or identifiers are not proof of fraud.`
              : 'No repeated normalized instrument references were found in the currently loaded records.'}
          </p>
          <div className="text-[10px] font-semibold text-rose-700 bg-rose-50 p-1.5 rounded">
            Status: DUPLICATE_CONFLICT_REVIEW (Approval Blocked)
          </div>
        </div>

        {/* Safeguard 2: Same-Day Expiry Escalation */}
        <div className="bg-white border-l-4 border-l-amber-600 border border-slate-200 rounded-lg p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Same-Day Expiry Alert</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">RULE-07</span>
          </div>
          <div className="text-lg font-bold text-slate-900">
            {expiringToday.length} Instrument{expiringToday.length === 1 ? '' : 's'} Flagged Today
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {expiringToday.length > 0
              ? expiringToday.map((instrument) => {
                  const institutionName = applications.find((item) => item.id === instrument.applicationId)?.institutionName || 'Institution unavailable';
                  return `${institutionName}: maturity ${instrument.maturityDate}.`;
                }).join(' ' )
              : 'No loaded financial instruments are currently flagged as maturing today.'}
          </p>
          <div className="text-[10px] font-semibold text-amber-800 bg-amber-50 p-1.5 rounded">
            Status: EXPIRING_TODAY (Rollover Mandatory)
          </div>
        </div>

        {/* Safeguard 3: Financial Shortfall Exact Math */}
        <div className="bg-white border-l-4 border-l-[#15345b] border border-slate-200 rounded-lg p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#15345b] uppercase tracking-wider flex items-center gap-1">
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Endowment Shortfall</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">RULE-06</span>
          </div>
          <div className="text-lg font-bold text-slate-900">
            {firstShortfall
              ? `${firstShortfall.financialShortfall?.currency} ${firstShortfall.financialShortfall?.shortfall.toLocaleString()} Deficit`
              : 'No loaded shortfall finding'}
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {firstShortfall?.financialShortfall
              ? `Finding ${firstShortfall.ruleId}: required ${firstShortfall.financialShortfall.currency} ${firstShortfall.financialShortfall.requiredAmount.toLocaleString()}, recorded amount ${firstShortfall.financialShortfall.verifiedAmount.toLocaleString()}.`
              : 'Shortfall figures are shown only when present in loaded validation findings.'}
          </p>
          <div className="text-[10px] font-semibold text-slate-700 bg-slate-100 p-1.5 rounded">
            Deficit: max(0, required - verified)
          </div>
        </div>

        {/* Safeguard 4: Bank Verification Simulation & Circuit Breaker */}
        <div className="bg-white border-l-4 border-l-[#0f8b8d] border border-slate-200 rounded-lg p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#0f8b8d] uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Simulated Bank Direct API</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">API Gateway</span>
          </div>
          <div className="text-xs font-semibold text-slate-800">
            Provider status: <span className="font-mono text-amber-700">Simulation only</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            No live bank connection is configured. The controls below exercise simulated success and timeout responses only.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <select
              value={simulatedMode}
              onChange={(e) => setSimulatedMode(e.target.value as any)}
              className="text-[10px] p-1 border border-slate-300 rounded bg-white text-slate-700"
            >
              <option value="TIMEOUT">Simulate Gateway Timeout (3 retries)</option>
              <option value="SUCCESS">Simulate Bank Direct Match</option>
            </select>
          </div>
        </div>
      </div>

      {/* Instruments Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Active Endowment Deposit Records Across Submissions
            </h3>
            <span className="text-[11px] text-slate-500">
              Cross-checked against normalized central repository
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by bank or normalized FDR..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded bg-white focus:border-[#15345b] focus:outline-hidden"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Application No.</th>
                <th className="py-2.5 px-4">Bank Name & Branch</th>
                <th className="py-2.5 px-4">FDR Ref (Masked)</th>
                <th className="py-2.5 px-4">Normalized Identity</th>
                <th className="py-2.5 px-4">Pledged Amount</th>
                <th className="py-2.5 px-4">Maturity Date</th>
                <th className="py-2.5 px-4">Verification Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredInstruments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No matching FDR records found in current active submissions.
                  </td>
                </tr>
              ) : (
                filteredInstruments.map((inst) => {
                  const isCollision = duplicateInstrumentIds.has(inst.id);
                  const isExpiringToday = inst.isExpiringToday;
                  const app = applications.find((a) => a.id === inst.applicationId);

                  return (
                    <tr
                      key={inst.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCollision
                          ? 'bg-rose-50/40'
                          : isExpiringToday
                          ? 'bg-amber-50/40'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{app?.applicationNumber || inst.applicationId}</span>
                          {isCollision && (
                            <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1 py-0.2 rounded uppercase">
                              Conflict
                            </span>
                          )}
                          {isExpiringToday && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded uppercase">
                              Expires Today
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal truncate max-w-[180px]">
                          {inst.holderName}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{inst.bankName}</div>
                        <div className="text-[10px] text-slate-500">{inst.bankIdentifier || 'Central Clearing'}</div>
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-slate-700">
                        {maskInstrumentNumber(inst.fdrNumberNormalized)}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-[#15345b]">
                        {inst.fdrNumberNormalized}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                        {inst.currency} {inst.amount.toLocaleString()}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`font-mono text-xs ${
                            isExpiringToday ? 'font-bold text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          {inst.maturityDate}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <StatusBadge status={inst.authenticityStatus} />
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          {inst.authenticityStatus === 'VERIFIED'
                            ? 'Simulated Verification'
                            : inst.authenticityStatus}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          disabled={verifyingDocId === inst.documentId}
                          onClick={() => handleTriggerBankVerification(inst.documentId, inst.applicationId)}
                          className="px-2.5 py-1 text-xs font-semibold bg-[#0f8b8d] hover:bg-[#0c7274] text-white rounded transition-colors disabled:opacity-50"
                        >
                          {verifyingDocId === inst.documentId ? 'Verifying...' : 'Verify Bank API'}
                        </button>
                        {onOpenApplication && (
                          <button
                            onClick={() => onOpenApplication(inst.applicationId)}
                            className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded hover:bg-slate-100 transition-colors"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regulatory Context Notice */}
      <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-slate-800">
            Statutory AICTE Financial Endowment Regulation (APH 2026-27)
          </div>
          <p className="leading-relaxed">
            All technical institutions must maintain joint fixed deposit receipts pledged in the name of
            "Regional Officer, AICTE and Chairman/Secretary of the Trust/Society". An FDR pledged for one institution
            cannot be reused for another campus or another program. Every bank verification attempt via direct integration
            is recorded in immutable audit logs.
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  History,
  AlertTriangle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { AuditEvent, EscalationTask, User } from '../types/index.ts';
import { api } from '../services/api.ts';

interface AuditLogViewProps {
  currentUser: User | null;
  onOpenApplication?: (appId: string) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  currentUser,
  onOpenApplication,
}) => {
  const [activeTab, setActiveTab] = useState<'AUDIT_LOGS' | 'ESCALATION_QUEUE'>('AUDIT_LOGS');
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [escalations, setEscalations] = useState<EscalationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch escalations from API
      const escRes = await api.getEscalations();
      setEscalations(escRes.escalations || []);

      // Fetch audit logs across applications
      const appsRes = await api.getApplications();
      const allLogs: AuditEvent[] = [];
      for (const a of appsRes.applications) {
        try {
          const res = await api.getAuditHistory(a.id);
          if (res.auditLogs) {
            allLogs.push(...res.auditLogs);
          }
        } catch (e) {
          // ignore
        }
      }

      // Sort logs descending by timestamp
      allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAuditLogs(allLogs);
    } catch (err) {
      console.error('Failed to load audit history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolveEscalation = async (escId: string) => {
    try {
      await api.updateEscalation(escId, {
        status: 'RESOLVED',
        resolutionReason: `Resolved by ${currentUser?.name || 'Authorized Officer'}`,
      });
      loadData();
    } catch (err) {
      console.error('Failed to resolve escalation', err);
    }
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchQuery =
      !searchQuery.trim() ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.correlationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchAction = actionFilter === 'ALL' || log.action === actionFilter;

    return matchQuery && matchAction;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 bg-slate-200 px-2 py-0.5 rounded uppercase tracking-wider">
              Governance & Oversight Bureau
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              Active Officer: <strong>{currentUser?.name}</strong> ({currentUser?.role})
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#15345b] mt-1">
            Statutory Audit Trail & Escalations Desk
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable tracking of regulatory state transitions, optimistic lock commits, and urgent compliance alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented Tab Controls */}
          <div className="p-1 bg-slate-200/80 rounded-lg flex items-center gap-1 text-xs">
            <button
              onClick={() => setActiveTab('AUDIT_LOGS')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'AUDIT_LOGS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit Trail ({auditLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('ESCALATION_QUEUE')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'ESCALATION_QUEUE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Escalations Queue</span>
              {escalations.filter((e) => e.status === 'OPEN').length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded text-[10px]">
                  {escalations.filter((e) => e.status === 'OPEN').length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* TAB 1: AUDIT LOGS */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by CID, Actor, or Action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded focus:border-[#15345b] focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs text-slate-500 font-medium">Filter Action:</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="text-xs p-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:border-[#15345b]"
              >
                <option value="ALL">All Recorded Actions</option>
                <option value="APPLICATION_APPROVAL_COMMITTED">Approval Committed</option>
                <option value="APPROVAL_TRANSACTION_FAILED">Approval Transaction Failed</option>
                <option value="SECURITY_UNAUTHORIZED_APPROVAL_ATTEMPT">Unauthorized Approval Denied</option>
                <option value="ESCALATION_TASK_CREATED">Escalation Task Created</option>
                <option value="DOCUMENT_REPLACED_VERSIONED">Document Version Replaced</option>
              </select>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-4">Timestamp (UTC)</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Target Entity</th>
                    <th className="py-2.5 px-4">Correlation ID</th>
                    <th className="py-2.5 px-4">Event Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        No matching audit events found.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const isSecurityViolation =
                        log.action === 'SECURITY_UNAUTHORIZED_APPROVAL_ATTEMPT';
                      const isFailure =
                        log.action === 'APPROVAL_TRANSACTION_FAILED';
                      const isSuccessCommit =
                        log.action === 'APPLICATION_APPROVAL_COMMITTED';

                      return (
                        <tr
                          key={log.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isSecurityViolation
                              ? 'bg-rose-50/40'
                              : isFailure
                              ? 'bg-amber-50/40'
                              : isSuccessCommit
                              ? 'bg-emerald-50/30'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{log.actorName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Role: {log.actorRole}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`font-mono text-[11px] font-bold ${
                                isSecurityViolation
                                  ? 'text-rose-700'
                                  : isFailure
                                  ? 'text-amber-700'
                                  : isSuccessCommit
                                  ? 'text-emerald-700'
                                  : 'text-slate-800'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            {log.targetEntity}: {log.targetId}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            {log.correlationId}
                          </td>

                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate text-[11px]">
                            {JSON.stringify(log.details)}
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
      )}

      {/* TAB 2: ESCALATIONS QUEUE */}
      {activeTab === 'ESCALATION_QUEUE' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {escalations.map((esc) => {
              const isUrgent = esc.priority === 'URGENT';
              const isHigh = esc.priority === 'HIGH';

              return (
                <div
                  key={esc.id}
                  className={`bg-white border rounded-lg p-5 shadow-xs space-y-3 ${
                    isUrgent
                      ? 'border-l-4 border-l-rose-600 border-slate-200'
                      : isHigh
                      ? 'border-l-4 border-l-amber-600 border-slate-200'
                      : 'border-l-4 border-l-blue-600 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        isUrgent
                          ? 'bg-rose-100 text-rose-800'
                          : isHigh
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {esc.priority} Priority · {esc.escalationType}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{esc.id}</span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{esc.reason}</h3>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                      <span>Target: <strong>{esc.applicationId}</strong></span>
                      <span>·</span>
                      <span>Assigned Role: <strong>{esc.assignedRole}</strong></span>
                      <span>·</span>
                      <span>Deadline: <strong>{new Date(esc.deadline).toLocaleDateString()}</strong></span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      Status: <strong className="text-slate-800">{esc.status}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      {onOpenApplication && (
                        <button
                          onClick={() => onOpenApplication(esc.applicationId)}
                          className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                        >
                          Inspect Application
                        </button>
                      )}
                      {esc.status === 'OPEN' && (
                        <button
                          onClick={() => handleResolveEscalation(esc.id)}
                          className="px-3 py-1 text-xs font-semibold bg-[#0f8b8d] hover:bg-[#0c7274] text-white rounded transition-colors"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import {
  AuditEvent,
  DocumentChecklistItem,
  EscalationTask,
  FindingSeverity,
  User,
  ValidationRuleConfig,
} from '../types/index.ts';
import {
  Sliders,
  Shield,
  FileCheck,
  History,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  Filter,
  Search,
  Clock,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface AdminRulesViewProps {
  currentUser: User | null;
}

export const AdminRulesView: React.FC<AdminRulesViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'RULES' | 'CHECKLIST' | 'ESCALATIONS' | 'AUDIT'>('RULES');
  const [rules, setRules] = useState<ValidationRuleConfig[]>([]);
  const [checklists, setChecklists] = useState<DocumentChecklistItem[]>([]);
  const [escalations, setEscalations] = useState<EscalationTask[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters for Audit Log
  const [auditRoleFilter, setAuditRoleFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab, auditRoleFilter, auditActionFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'RULES') {
        const res = await api.getRules();
        setRules(res.rules);
      } else if (activeTab === 'CHECKLIST') {
        const res = await api.getChecklists();
        setChecklists(res.checklists);
      } else if (activeTab === 'ESCALATIONS') {
        const res = await api.getEscalations();
        setEscalations(res.escalations);
      } else if (activeTab === 'AUDIT') {
        const res = await api.getAuditLogs({
          actorRole: auditRoleFilter || undefined,
          action: auditActionFilter || undefined,
        });
        setAuditLogs(res.auditLogs);
      }
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    try {
      await api.updateRule(ruleId, { enabled: !currentEnabled });
      loadData();
    } catch (err: any) {
      alert('Failed to update rule: ' + err.message);
    }
  };

  const handleChangeSeverity = async (ruleId: string, severity: FindingSeverity) => {
    try {
      await api.updateRule(ruleId, { severity });
      loadData();
    } catch (err: any) {
      alert('Failed to update severity: ' + err.message);
    }
  };

  const handleResolveEscalation = async (taskId: string) => {
    const reason = prompt('Enter resolution note for this escalation task:');
    if (!reason) return;

    try {
      await api.updateEscalation(taskId, {
        status: 'RESOLVED',
        resolutionReason: reason,
      });
      loadData();
    } catch (err: any) {
      alert('Failed to resolve escalation: ' + err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Admin Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f294a]">
            Regulation Bureau Configuration, Escalations & Audit
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure validation rules, monitor statutory escalations, and inspect immutable audit event trails.
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
          <button
            onClick={() => setActiveTab('RULES')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'RULES' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Validation Rules
          </button>
          <button
            onClick={() => setActiveTab('CHECKLIST')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'CHECKLIST' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Document Checklist
          </button>
          <button
            onClick={() => setActiveTab('ESCALATIONS')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'ESCALATIONS' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Escalation Tasks ({escalations.filter((e) => e.status === 'OPEN').length})
          </button>
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'AUDIT' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Audit Trail Logs
          </button>
        </div>
      </div>

      {/* 1. Validation Rules Management */}
      {activeTab === 'RULES' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs text-xs text-slate-600">
            <strong>Administrator Rule Engine Governance:</strong> Deterministic rules are executed in sandbox order. Each finding captures the exact rule version ID (e.g. <code>v2026.1</code>) so validations remain legally reproducible across appeals.
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Rule ID & Version</th>
                  <th className="py-3 px-4">Name & Description</th>
                  <th className="py-3 px-4">Severity Tier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                      <div>{rule.id}</div>
                      <div className="text-[10px] text-slate-400">{rule.version}</div>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-semibold text-slate-900">{rule.name}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{rule.description}</div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={rule.severity}
                        onChange={(e) => handleChangeSeverity(rule.id, e.target.value as FindingSeverity)}
                        className={`text-xs font-semibold p-1 rounded border ${
                          rule.severity === 'CRITICAL'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : rule.severity === 'MAJOR'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="MAJOR">MAJOR</option>
                        <option value="MODERATE">MODERATE</option>
                        <option value="MINOR">MINOR</option>
                        <option value="INFORMATIONAL">INFORMATIONAL</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggleRule(rule.id, rule.enabled)}
                        className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                          rule.enabled
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Document Checklist Configurator */}
      {activeTab === 'CHECKLIST' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs text-xs text-slate-600">
            <strong>Checklist Mandatory Rules:</strong> Applications cannot proceed to technical committee review until all statutory mandatory items are satisfied.
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Checklist ID</th>
                  <th className="py-3 px-4">Document Type</th>
                  <th className="py-3 px-4">Label & Statutory Requirement</th>
                  <th className="py-3 px-4">Applicable Categories</th>
                  <th className="py-3 px-4 text-right">Requirement Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checklists.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-600">{item.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{item.documentType}</td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-semibold text-slate-800">{item.label}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{item.description}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-[11px]">
                      {item.applicableCategories.join(', ')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-xs px-2 py-0.5 bg-slate-100 rounded border">
                        {item.mandatory ? 'Mandatory' : 'Optional'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Escalations Management (Scenarios 2, 3, 7) */}
      {activeTab === 'ESCALATIONS' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs text-xs text-slate-600">
            <strong>Statutory Escalations Queue:</strong> Real-time background tasks generated for same-day expiring instruments, duplicate cross-institution conflicts, and ambiguous rule abstentions.
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Task ID</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Application</th>
                  <th className="py-3 px-4">Deadline (UTC)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {escalations.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{task.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {task.escalationType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          task.priority === 'URGENT'
                            ? 'bg-red-600 text-white'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{task.applicationId}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {task.deadline.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          task.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {task.status === 'OPEN' ? (
                        <button
                          onClick={() => handleResolveEscalation(task.id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-[#0f294a] hover:bg-[#163a66] text-white rounded"
                        >
                          Resolve Task
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Comprehensive Audit Trail Logs */}
      {activeTab === 'AUDIT' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-slate-700">Filter Trail:</span>
              <select
                value={auditRoleFilter}
                onChange={(e) => setAuditRoleFilter(e.target.value)}
                className="p-1.5 border border-slate-200 rounded text-slate-700 bg-white"
              >
                <option value="">All Roles</option>
                <option value="INSTITUTION">Institution User</option>
                <option value="REVIEWER">Regulatory Reviewer</option>
                <option value="ADMIN">Administrator</option>
              </select>

              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="p-1.5 border border-slate-200 rounded text-slate-700 bg-white"
              >
                <option value="">All Actions</option>
                <option value="SECURITY_UNAUTHORIZED_APPROVAL_ATTEMPT">Unauthorized Approval Denials</option>
                <option value="APPLICATION_APPROVAL_COMMITTED">Approved State Transitions</option>
                <option value="APPROVAL_TRANSACTION_FAILED">Database Rollbacks</option>
                <option value="DOCUMENT_VERSION_REPLACED">Document Version Replacements</option>
                <option value="BANK_VERIFICATION_TIMEOUT">Bank API Timeouts</option>
                <option value="RULE_AMBIGUITY_RESOLVED">Rule Ambiguity Resolutions</option>
              </select>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              Showing {auditLogs.length} logged events
            </span>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Correlation ID</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {log.timestamp.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-4 font-sans font-medium text-slate-900">
                      <div>{log.actorName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{log.actorRole}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded font-semibold ${
                        log.action.includes('UNAUTHORIZED') || log.action.includes('FAILED')
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {log.targetEntity}: {log.targetId}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {log.correlationId}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600 max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * API Service Client for AICTE Intelligent Regulatory Validation Platform
 * Enhanced with Financial Verification, Document Versioning, and Concurrency Controls.
 */

import {
  User,
  Institution,
  Application,
  DocumentRecord,
  DocumentVersionRecord,
  FdrInstrument,
  ValidationFinding,
  ValidationRun,
  VerificationAttempt,
  ReviewerActionRecord,
  EscalationTask,
  ApprovalCommandRecord,
  AuditEvent,
  ValidationRuleConfig,
  DocumentChecklistItem,
  DashboardMetrics,
  VerificationSource,
} from '../types/index.ts';

const BASE_URL = '/api/v1';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
    (err as any).status = res.status;
    (err as any).data = errorData;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  async getMe(): Promise<{ user: User; availableRoles: string[] }> {
    return fetchJson(`${BASE_URL}/auth/me`);
  },

  async switchUser(userId: string): Promise<{ success: boolean; user: User }> {
    return fetchJson(`${BASE_URL}/auth/switch-user`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async getUsers(): Promise<{ users: User[] }> {
    return fetchJson(`${BASE_URL}/auth/users`);
  },

  // Institutions
  async getInstitutions(): Promise<{ institutions: Institution[] }> {
    return fetchJson(`${BASE_URL}/institutions`);
  },

  async getInstitutionById(id: string): Promise<{ institution: Institution }> {
    return fetchJson(`${BASE_URL}/institutions/${id}`);
  },

  // Applications
  async getApplications(params?: {
    status?: string;
    category?: string;
    institutionId?: string;
    search?: string;
    reviewerId?: string;
  }): Promise<{ applications: Application[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.institutionId) query.set('institutionId', params.institutionId);
    if (params?.search) query.set('search', params.search);
    if (params?.reviewerId) query.set('reviewerId', params.reviewerId);

    return fetchJson(`${BASE_URL}/applications?${query.toString()}`);
  },

  async getApplicationById(id: string): Promise<{
    application: Application;
    institution?: Institution;
    documents: DocumentRecord[];
    findings: ValidationFinding[];
    verifications: VerificationAttempt[];
    reviewerActions: ReviewerActionRecord[];
    validationRun?: ValidationRun;
    fdrInstruments?: FdrInstrument[];
    escalationTasks?: EscalationTask[];
  }> {
    return fetchJson(`${BASE_URL}/applications/${id}`);
  },

  async createApplication(data: {
    category: string;
    proposedIntake?: number;
    proposedProgramme?: string;
    notes?: string;
    academicYear?: string;
  }): Promise<{ success: boolean; application: Application }> {
    return fetchJson(`${BASE_URL}/applications`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async submitApplication(id: string): Promise<{
    success: boolean;
    application: Application;
    validationRun: ValidationRun;
    findings: ValidationFinding[];
  }> {
    return fetchJson(`${BASE_URL}/applications/${id}/submit`, {
      method: 'POST',
    });
  },

  // Concurrency & Approval (Scenarios 5, 8, 10)
  async submitApproval(
    applicationId: string,
    data: {
      expectedVersion?: number;
      idempotencyKey?: string;
      approvalReason?: string;
      simulateDbFailure?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    application: Application;
    command: ApprovalCommandRecord;
    correlationId: string;
  }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/approval`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Resolve Rule Ambiguity (Scenario 7)
  async resolveAmbiguousRule(
    applicationId: string,
    data: { selectedRuleId: string; resolutionRationale: string }
  ): Promise<{
    success: boolean;
    application: Application;
    validationRun: ValidationRun;
    findings: ValidationFinding[];
  }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/resolve-rule`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Documents & Versioning (Scenario 9)
  async uploadDocument(
    applicationId: string,
    file: File,
    documentType: string,
    title?: string,
    fdrDetails?: { financialAmount?: number; fdrNumber?: string; bankName?: string }
  ): Promise<{ success: boolean; document: DocumentRecord }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    if (title) formData.append('title', title);
    if (fdrDetails?.financialAmount) formData.append('financialAmount', String(fdrDetails.financialAmount));
    if (fdrDetails?.fdrNumber) formData.append('fdrNumber', fdrDetails.fdrNumber);
    if (fdrDetails?.bankName) formData.append('bankName', fdrDetails.bankName);

    const res = await fetch(`${BASE_URL}/applications/${applicationId}/documents`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload document');
    }

    return res.json();
  },

  async replaceDocument(
    applicationId: string,
    documentId: string,
    file: File,
    data?: {
      replacementReason?: string;
      financialAmount?: number;
      fdrNumber?: string;
      expiryDate?: string;
    }
  ): Promise<{
    success: boolean;
    document: DocumentRecord;
    newVersion: DocumentVersionRecord;
    validationRun: ValidationRun;
    findings: ValidationFinding[];
  }> {
    const formData = new FormData();
    formData.append('file', file);
    if (data?.replacementReason) formData.append('replacementReason', data.replacementReason);
    if (data?.financialAmount) formData.append('financialAmount', String(data.financialAmount));
    if (data?.fdrNumber) formData.append('fdrNumber', data.fdrNumber);
    if (data?.expiryDate) formData.append('expiryDate', data.expiryDate);

    const res = await fetch(`${BASE_URL}/applications/${applicationId}/documents/${documentId}/replace`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to replace document version');
    }

    return res.json();
  },

  async getDocumentVersions(applicationId: string): Promise<{ documentVersions: DocumentVersionRecord[]; total: number }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/document-versions`);
  },

  async getAuditHistory(applicationId: string): Promise<{ auditLogs: AuditEvent[]; total: number }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/audit-history`);
  },

  async deleteDocument(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${BASE_URL}/documents/${id}`, {
      method: 'DELETE',
    });
  },

  // Validation
  async runValidation(
    applicationId: string,
    executionType: 'DETERMINISTIC' | 'AI_AUGMENTED' = 'DETERMINISTIC'
  ): Promise<{ success: boolean; validationRun: ValidationRun; findings: ValidationFinding[] }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ executionType }),
    });
  },

  async reassessApplication(applicationId: string): Promise<{ success: boolean; validationRun: ValidationRun; findings: ValidationFinding[] }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/reassess`, {
      method: 'POST',
    });
  },

  async getAnomalies(applicationId: string): Promise<{ anomalies: any[]; count: number }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/anomalies`);
  },

  // Reviewer & Findings
  async updateFinding(
    id: string,
    data: {
      status?: string;
      reviewerNotes?: string;
      overrideReason?: string;
    }
  ): Promise<{ success: boolean; finding: ValidationFinding; action: ReviewerActionRecord }> {
    return fetchJson(`${BASE_URL}/findings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Issuing Authority & Bank Verification (Scenario 6)
  async verifyDocument(
    applicationId: string,
    documentId: string,
    sourceType: VerificationSource,
    simulateMode?: 'TIMEOUT' | 'CONNECTION_FAILURE' | 'RATE_LIMITED' | 'SUCCESS'
  ): Promise<{ success: boolean; verification: VerificationAttempt }> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/verify-document`, {
      method: 'POST',
      body: JSON.stringify({ documentId, sourceType, simulateMode }),
    });
  },

  async verifyDocumentById(
    documentId: string,
    data: { sourceType: VerificationSource; simulateMode?: string; applicationId?: string }
  ): Promise<{ success: boolean; verification: VerificationAttempt }> {
    return fetchJson(`${BASE_URL}/documents/${documentId}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Escalations (Scenarios 2, 3)
  async getEscalations(): Promise<{ escalations: EscalationTask[]; total: number }> {
    return fetchJson(`${BASE_URL}/admin/escalations`);
  },

  async updateEscalation(
    id: string,
    data: { status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; resolutionReason?: string }
  ): Promise<{ success: boolean; escalation: EscalationTask }> {
    return fetchJson(`${BASE_URL}/admin/escalations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Admin
  async getRules(): Promise<{ rules: ValidationRuleConfig[] }> {
    return fetchJson(`${BASE_URL}/admin/rules`);
  },

  async updateRule(
    id: string,
    data: { enabled?: boolean; severity?: string; parameters?: any }
  ): Promise<{ success: boolean; rule: ValidationRuleConfig }> {
    return fetchJson(`${BASE_URL}/admin/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async getChecklists(): Promise<{ checklists: DocumentChecklistItem[] }> {
    return fetchJson(`${BASE_URL}/admin/checklists`);
  },

  async getAuditLogs(params?: { actorRole?: string; action?: string; limit?: number }): Promise<{
    auditLogs: AuditEvent[];
    total: number;
  }> {
    const q = new URLSearchParams();
    if (params?.actorRole) q.set('actorRole', params.actorRole);
    if (params?.action) q.set('action', params.action);
    if (params?.limit) q.set('limit', String(params.limit));
    return fetchJson(`${BASE_URL}/admin/audit-logs?${q.toString()}`);
  },

  // Dashboard
  async getDashboardMetrics(): Promise<{ metrics: DashboardMetrics }> {
    return fetchJson(`${BASE_URL}/dashboard/metrics`);
  },

  // Report
  async getReport(applicationId: string): Promise<any> {
    return fetchJson(`${BASE_URL}/applications/${applicationId}/report`);
  },
};

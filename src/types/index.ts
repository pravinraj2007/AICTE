/**
 * AICTE Intelligent Regulatory Validation Platform - Core Domain Models & Schemas
 * Role: Institution User, Regulatory Reviewer, Administrator
 * Enhanced with Financial Instrument Verification, Document Versioning,
 * Adversarial Anomaly Detection, and Concurrency/Transaction Safety.
 */

export type UserRole = 'INSTITUTION' | 'REVIEWER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  institutionId?: string; // Present if role is INSTITUTION
  designation?: string;
  department?: string;
  canApproveApplications?: boolean; // Server-side authorization flag
  createdAt: string;
}

export interface Institution {
  id: string;
  permanentId: string; // AICTE PID, e.g. "1-109283741"
  name: string;
  state: string;
  district: string;
  address: string;
  category: 'Technical' | 'Management' | 'Pharmacy' | 'Architecture' | 'Applied Arts';
  establishmentYear: number;
  accreditationStatus: 'NAAC A++' | 'NAAC A+' | 'NBA Accredited' | 'Not Accredited';
  currentApprovedIntake: number;
  facultyCount: number;
  contactEmail: string;
  isSynthetic: boolean;
}

export type ApplicationCategory =
  | 'Extension of Approval'
  | 'New Programme or Course'
  | 'Approved Intake Change'
  | 'Institution Information Update'
  | 'Faculty Information Update'
  | 'Infrastructure Information Update'
  | 'Other Approval-Related Changes';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VALIDATION_IN_PROGRESS'
  | 'DEFICIENCIES_FOUND'
  | 'VERIFICATION_PENDING'
  | 'UNDER_HUMAN_REVIEW'
  | 'CLARIFICATION_REQUESTED'
  | 'REVIEW_COMPLETED'
  | 'DUPLICATE_CONFLICT_REVIEW'
  | 'EXPIRING_TODAY';

export type RuleResolutionStatus = 'RESOLVED' | 'HUMAN_REVIEW_REQUIRED';

export interface Application {
  id: string;
  version: number; // Monotonically increasing version for Optimistic Concurrency Control
  applicationNumber: string; // e.g. "AICTE/2026-27/APP-8492"
  institutionId: string;
  institutionName: string;
  category: ApplicationCategory;
  academicYear: string; // e.g. "2026-2027"
  status: ApplicationStatus;
  proposedIntake?: number;
  proposedProgramme?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  assignedReviewerId?: string;
  assignedReviewerName?: string;
  isSynthetic: boolean;
  notes?: string;

  // Rule resolution & abstention tracking
  ruleResolutionStatus?: RuleResolutionStatus;
  unresolvedRuleReason?: string;
  candidateRules?: string[];

  // Approval state
  approvedAt?: string;
  approvedBy?: string;
}

export type DocumentType =
  | 'LAND_DOC'
  | 'BUILDING_PLAN'
  | 'FIRE_NOC'
  | 'OCCUPANCY_CERT'
  | 'POLLUTION_NOC'
  | 'AFFILIATION_LETTER'
  | 'AICTE_PREVIOUS_EOA'
  | 'FACULTY_LIST'
  | 'FDR_OR_ENDOWMENT'
  | 'INFRASTRUCTURE_PHOTO'
  | 'OTHER_EVIDENCE';

export interface ExtractedFields {
  institutionName?: string;
  institutionIdentifier?: string; // AICTE PID
  registrationNumber?: string;
  issuingAuthority?: string;
  issueDate?: string;
  expiryDate?: string;
  accreditationDetails?: string;
  programmeName?: string;
  approvedOrProposedIntake?: number;
  facultyIdentifiers?: string[];
  nocReferenceNumber?: string;
  qrCodePayload?: string;
  relevantPageNumber?: number;
  rawTextPreview?: string;
  extractionConfidence?: number; // 0 to 1, only when provided by the extraction engine
  extractionMethod: 'NONE' | 'DIGITAL_TEXT' | 'PDF_TEXT_EXTRACTION' | 'TESSERACT_OCR' | 'GEMINI_ASSISTED' | 'GEMINI_DOCUMENT_ANALYSIS' | 'HYBRID' | 'HYBRID_EXTRACTION';

  // Financial & FDR specific fields
  bankName?: string;
  fdrNumber?: string;
  accountReference?: string;
  holderName?: string;
  financialAmount?: number;
  currency?: string;
  maturityDate?: string;
  pdfProducer?: string;
  pdfModificationTimestamp?: string;
  suspiciousIndicators?: string[];
}

export interface GeminiDocumentAnalysisResult {
  documentType: DocumentType | 'UNKNOWN';
  institutionName: string | null;
  certificateNumber: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  missingFields: string[];
  inconsistencies: string[];
  warnings: string[];
  summary: string;
}

export interface GeminiDocumentAnalysis {
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  model?: string;
  analyzedAt?: string;
  errorCode?: string;
  inputTextTruncated?: boolean;
  result?: GeminiDocumentAnalysisResult;
}

export interface DocumentRecord {
  id: string;
  applicationId: string;
  documentType: DocumentType;
  title: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Hash: string;
  storageKey: string;
  uploadedAt: string;
  uploadedBy: string;
  version: number;
  extractedFields: ExtractedFields;
  processingStatus: 'PENDING' | 'PROCESSED' | 'FAILED' | 'MANUAL_REVIEW_REQUIRED';
  fieldEvidence?: Record<string, Array<{ page: number; text: string }>>;
  processingPages?: Array<{ page: number; method: string; status: string }>;
  geminiAnalysis?: GeminiDocumentAnalysis;
  pageCount: number;
  hasQrCode: boolean;
  isSimulated: boolean;
  authenticityStatus?: 'VERIFIED' | 'INDEPENDENT_VERIFICATION_REQUIRED' | 'MISMATCH_DETECTED' | 'PENDING' | 'SOURCE_UNAVAILABLE' | 'MANUAL_REVIEW_REQUIRED';
}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  applicationId: string;
  versionNumber: number;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Hash: string;
  storageKey: string;
  uploadedAt: string;
  uploadedBy: string;
  replacementReason?: string;
  isActive: boolean;
  extractedFields: ExtractedFields;
  processingStatus?: 'PENDING' | 'PROCESSED' | 'FAILED' | 'MANUAL_REVIEW_REQUIRED';
  fieldEvidence?: Record<string, Array<{ page: number; text: string }>>;
  processingPages?: Array<{ page: number; method: string; status: string }>;
  geminiAnalysis?: GeminiDocumentAnalysis;
}

export interface FdrInstrument {
  id: string;
  documentId: string;
  applicationId: string;
  institutionId: string;
  bankName: string;
  bankIdentifier?: string; // IFSC / Routing
  fdrNumberNormalized: string;
  accountOrInstrumentRef?: string;
  holderName: string;
  amount: number;
  currency: string;
  issueDate: string;
  maturityDate: string;
  isExpiringToday: boolean;
  authenticityStatus: 'VERIFIED' | 'INDEPENDENT_VERIFICATION_REQUIRED' | 'MISMATCH_DETECTED' | 'PENDING' | 'SOURCE_UNAVAILABLE' | 'MANUAL_REVIEW_REQUIRED';
  suspiciousIndicators?: string[];
  digitalSignatureVerified?: boolean;
  conflictingApplicationIds?: string[];
  createdAt: string;
}

export type FindingSeverity = 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR' | 'INFORMATIONAL';

export type FindingStatus =
  | 'OPEN'
  | 'CONFIRMED_DISCREPANCY'
  | 'RESOLVED'
  | 'INCONCLUSIVE'
  | 'FALSE_POSITIVE'
  | 'ADDITIONAL_EVIDENCE_REQUIRED'
  | 'ESCALATED_FOR_INSPECTION'
  | 'REASSESSMENT_REQUIRED';

export interface ValidationFinding {
  id: string;
  validationRunId: string;
  applicationId: string;
  ruleId: string;
  ruleVersion: string;
  ruleTitle: string;
  ruleDescription: string;
  severity: FindingSeverity;
  status: FindingStatus;
  affectedDocumentIds: string[];
  relevantPageOrField: string;
  observedEvidence: string;
  expectedValue?: string;
  observedValue?: string;
  explanation: string;
  recommendedAction: string;
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  overrideReason?: string;
  createdAt: string;

  // Financial shortfall metadata
  financialShortfall?: {
    requiredAmount: number;
    verifiedAmount: number;
    shortfall: number;
    currency: string;
  };
}

export interface ValidationRun {
  id: string;
  applicationId: string;
  startedAt: string;
  completedAt: string;
  ruleVersionsApplied: Record<string, string>;
  findingsSummary: {
    critical: number;
    major: number;
    moderate: number;
    minor: number;
    informational: number;
    total: number;
  };
  overallComplianceScore: number; // 0-100 based on findings
  executionType: 'DETERMINISTIC' | 'AI_AUGMENTED';
}

export type VerificationSource =
  | 'STATE_DTE'
  | 'AFFILIATING_UNIVERSITY'
  | 'FIRE_SAFETY_DIRECTORATE'
  | 'TOWN_PLANNING_AUTHORITY'
  | 'NATIONAL_BOARD_ACCREDITATION'
  | 'DIGITAL_SIGNATURE_REGISTRY'
  | 'BANK_DIRECT_API';

export type VerificationResult =
  | 'VERIFIED_BY_AUTHORIZED_SOURCE'
  | 'MISMATCH_DETECTED'
  | 'EXPIRED'
  | 'PENDING'
  | 'SOURCE_UNAVAILABLE'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'UNSUPPORTED_VERIFICATION_METHOD'
  | 'VERIFIED_IN_SIMULATION';

export interface VerificationAttempt {
  id: string;
  applicationId: string;
  documentId: string;
  sourceType: VerificationSource;
  sourceName: string;
  requestedAt: string;
  respondedAt: string;
  referenceNumber: string;
  comparedFields: Record<string, { expected: string; sourceReturned: string; match: boolean }>;
  result: VerificationResult;
  isSimulated: boolean;
  simulationDisclaimer: string; // Always "SIMULATED — NOT OFFICIAL VERIFICATION"
  observations: string;

  // Circuit breaker & retry details
  retryCount?: number;
  maxRetries?: number;
  errorCategory?: 'TIMEOUT' | 'CONNECTION_FAILURE' | 'RATE_LIMITED' | 'INVALID_RESPONSE' | 'SOURCE_UNAVAILABLE';
  correlationId?: string;
}

export interface ReviewerActionRecord {
  id: string;
  applicationId: string;
  findingId?: string;
  reviewerId: string;
  reviewerName: string;
  actionType:
    | 'STATUS_CHANGE'
    | 'FINDING_OVERRIDE'
    | 'CLARIFICATION_REQUESTED'
    | 'REVIEW_COMPLETED'
    | 'ADDITIONAL_EVIDENCE_REQUESTED'
    | 'ESCALATION_RECOMMENDED'
    | 'APPROVAL_GRANTED'
    | 'APPROVAL_DENIED';
  previousState?: string;
  newState?: string;
  reason: string;
  timestamp: string;
  applicationVersion?: number;
}

export interface EscalationTask {
  id: string;
  applicationId: string;
  instrumentId?: string;
  escalationType:
    | 'SAME_DAY_EXPIRY'
    | 'FINANCIAL_SHORTFALL'
    | 'DUPLICATE_INSTRUMENT_CONFLICT'
    | 'INDEPENDENT_VERIFICATION_REQUIRED'
    | 'UNRESOLVED_RULE_ABSTENTION';
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  assignedRole: 'REVIEWER' | 'ADMIN';
  deadline: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  reason: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ApprovalCommandRecord {
  id: string;
  idempotencyKey: string;
  applicationId: string;
  expectedVersion: number;
  officerId: string;
  officerName: string;
  officerRole: UserRole;
  status: 'EXECUTING' | 'COMMITTED' | 'FAILED' | 'RECONCILED';
  reconciliationDetails?: string;
  createdAt: string;
  committedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  correlationId: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetEntity: 'APPLICATION' | 'DOCUMENT' | 'VALIDATION' | 'RULE' | 'VERIFICATION' | 'USER' | 'REPORT' | 'SECURITY';
  targetId: string;
  correlationId: string;
  details: Record<string, any>;
  ipAddress?: string;
}

export interface ValidationRuleConfig {
  id: string;
  version: string;
  name: string;
  description: string;
  category: ApplicationCategory[];
  severity: FindingSeverity;
  enabled: boolean;
  evidenceRequirements: string[];
  explanationTemplate: string;
  recommendedAction: string;
  parameters: Record<string, any>;
}

export interface DocumentChecklistItem {
  id: string;
  documentType: DocumentType;
  label: string;
  description: string;
  mandatory: boolean;
  applicableCategories: ApplicationCategory[];
}

export interface DashboardMetrics {
  totalApplications: number;
  institutionCount: number;
  applicationsByStatus: Record<ApplicationStatus, number>;
  applicationsByCategory: Record<ApplicationCategory, number>;
  openFindingsCount: number;
  findingsBySeverity: Record<FindingSeverity, number>;
  verificationOutcomes: Record<VerificationResult, number>;
  pendingVerifications: number;
  applicationsRequiringReview: number;
  completedValidations: number;
  averageComplianceScore: number | null;
  syntheticDataNotice: string;
  potentialAnomaliesCount: number;
  openEscalationsCount?: number;
  duplicateConflictCount?: number;
}

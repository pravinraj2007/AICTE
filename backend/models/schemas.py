"""
Pydantic v2 schemas and models for AICTE Regulatory Validation Platform.
Supports Financial Safeguards, Concurrency Control (OCC), Adversarial Tampering Detection,
and Document Versioning.
"""

from typing import Optional, List, Dict, Any, Literal
from datetime import datetime

try:
    from pydantic import BaseModel, Field
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False
    class BaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def model_dump(self):
            return self.__dict__
        def dict(self):
            return self.__dict__

UserRole = Literal['INSTITUTION', 'REVIEWER', 'ADMIN']

ApplicationCategory = Literal[
    'Extension of Approval',
    'New Programme or Course',
    'Approved Intake Change',
    'Institution Information Update',
    'Faculty Information Update',
    'Infrastructure Information Update',
    'Other Approval-Related Changes'
]

ApplicationStatus = Literal[
    'DRAFT',
    'SUBMITTED',
    'VALIDATION_IN_PROGRESS',
    'DEFICIENCIES_FOUND',
    'VERIFICATION_PENDING',
    'UNDER_HUMAN_REVIEW',
    'CLARIFICATION_REQUESTED',
    'REVIEW_COMPLETED',
    'DUPLICATE_CONFLICT_REVIEW',
    'EXPIRING_TODAY'
]

DocumentType = Literal[
    'LAND_DOC',
    'BUILDING_PLAN',
    'FIRE_NOC',
    'OCCUPANCY_CERT',
    'POLLUTION_NOC',
    'AFFILIATION_LETTER',
    'AICTE_PREVIOUS_EOA',
    'FACULTY_LIST',
    'FDR_OR_ENDOWMENT',
    'INFRASTRUCTURE_PHOTO',
    'OTHER_EVIDENCE'
]

FindingSeverity = Literal['CRITICAL', 'MAJOR', 'MODERATE', 'MINOR', 'INFORMATIONAL']

FindingStatus = Literal[
    'OPEN',
    'CONFIRMED_DISCREPANCY',
    'RESOLVED',
    'INCONCLUSIVE',
    'FALSE_POSITIVE',
    'ADDITIONAL_EVIDENCE_REQUIRED',
    'ESCALATED_FOR_INSPECTION',
    'REASSESSMENT_REQUIRED'
]

VerificationSource = Literal[
    'STATE_DTE',
    'AFFILIATING_UNIVERSITY',
    'FIRE_SAFETY_DIRECTORATE',
    'TOWN_PLANNING_AUTHORITY',
    'NATIONAL_BOARD_ACCREDITATION',
    'DIGITAL_SIGNATURE_REGISTRY',
    'BANK_DIRECT_API'
]

VerificationResult = Literal[
    'VERIFIED_BY_AUTHORIZED_SOURCE',
    'MISMATCH_DETECTED',
    'EXPIRED',
    'PENDING',
    'SOURCE_UNAVAILABLE',
    'MANUAL_REVIEW_REQUIRED',
    'UNSUPPORTED_VERIFICATION_METHOD',
    'VERIFIED_IN_SIMULATION'
]

class UserBase(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    institutionId: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    canApproveApplications: bool = False
    canOverrideFindings: bool = False
    createdAt: Optional[str] = None

class InstitutionModel(BaseModel):
    id: str
    permanentId: str
    name: str
    state: str
    district: str
    address: str
    category: str
    establishmentYear: int
    accreditationStatus: str
    currentApprovedIntake: int
    facultyCount: int
    contactEmail: str
    isSynthetic: bool = True

class ExtractedFieldsSchema(BaseModel):
    institutionName: Optional[str] = None
    institutionIdentifier: Optional[str] = None
    registrationNumber: Optional[str] = None
    issuingAuthority: Optional[str] = None
    issueDate: Optional[str] = None
    expiryDate: Optional[str] = None
    accreditationDetails: Optional[str] = None
    programmeName: Optional[str] = None
    approvedOrProposedIntake: Optional[int] = None
    facultyIdentifiers: Optional[List[str]] = None
    nocReferenceNumber: Optional[str] = None
    qrCodePayload: Optional[str] = None
    relevantPageNumber: Optional[int] = 1
    rawTextPreview: Optional[str] = None
    extractionConfidence: float = 0.95
    extractionMethod: str = 'DIGITAL_TEXT'
    # Financial & FDR fields
    bankName: Optional[str] = None
    fdrNumber: Optional[str] = None
    accountReference: Optional[str] = None
    holderName: Optional[str] = None
    financialAmount: Optional[float] = None
    currency: Optional[str] = 'INR'
    maturityDate: Optional[str] = None
    pdfProducer: Optional[str] = None
    pdfModificationTimestamp: Optional[str] = None
    suspiciousIndicators: Optional[List[str]] = None

class DocumentModel(BaseModel):
    id: str
    applicationId: str
    documentType: DocumentType
    title: str
    filename: str
    originalFilename: str
    mimeType: str
    fileSizeBytes: int
    sha256Hash: str
    storageKey: str
    uploadedAt: str
    uploadedBy: str
    version: int = 1
    extractedFields: ExtractedFieldsSchema
    processingStatus: str = 'PROCESSED'
    pageCount: int = 1
    hasQrCode: bool = False
    isSimulated: bool = True
    authenticityStatus: Optional[str] = 'VERIFIED'

class DocumentVersionModel(BaseModel):
    id: str
    documentId: str
    applicationId: str
    versionNumber: int
    filename: str
    originalFilename: str
    mimeType: str
    fileSizeBytes: int
    sha256Hash: str
    storageKey: str
    uploadedAt: str
    uploadedBy: str
    replacementReason: Optional[str] = None
    isActive: bool = True
    extractedFields: ExtractedFieldsSchema

class FdrInstrumentModel(BaseModel):
    id: str
    documentId: str
    applicationId: str
    institutionId: str
    bankName: str
    bankIdentifier: Optional[str] = None
    fdrNumberNormalized: str
    accountOrInstrumentRef: Optional[str] = None
    holderName: str
    amount: float
    currency: str = 'INR'
    issueDate: str
    maturityDate: str
    isExpiringToday: bool = False
    authenticityStatus: str = 'VERIFIED'
    suspiciousIndicators: Optional[List[str]] = None
    digitalSignatureVerified: Optional[bool] = True
    conflictingApplicationIds: Optional[List[str]] = None
    createdAt: str

class ApplicationModel(BaseModel):
    id: str
    version: int = 1
    applicationNumber: str
    institutionId: str
    institutionName: str
    category: ApplicationCategory
    academicYear: str = '2026-2027'
    status: ApplicationStatus = 'DRAFT'
    proposedIntake: Optional[int] = None
    proposedProgramme: Optional[str] = None
    createdAt: str
    updatedAt: str
    submittedAt: Optional[str] = None
    assignedReviewerId: Optional[str] = None
    assignedReviewerName: Optional[str] = None
    isSynthetic: bool = True
    notes: Optional[str] = None
    ruleResolutionStatus: Optional[str] = 'CLEAR'
    unresolvedRuleReason: Optional[str] = None
    candidateRules: Optional[List[str]] = None
    approvedAt: Optional[str] = None
    approvedBy: Optional[str] = None
    financialShortfall: Optional[Dict[str, Any]] = None

class ValidationFindingModel(BaseModel):
    id: str
    validationRunId: str
    applicationId: str
    ruleId: str
    ruleVersion: str
    ruleTitle: str
    ruleDescription: str
    severity: FindingSeverity
    status: FindingStatus = 'OPEN'
    affectedDocumentIds: List[str] = []
    relevantPageOrField: str
    observedEvidence: str
    expectedValue: Optional[str] = None
    observedValue: Optional[str] = None
    explanation: str
    recommendedAction: str
    reviewerNotes: Optional[str] = None
    reviewedBy: Optional[str] = None
    reviewedAt: Optional[str] = None
    overrideReason: Optional[str] = None
    createdAt: str
    financialShortfall: Optional[Dict[str, Any]] = None

class ValidationRunModel(BaseModel):
    id: str
    applicationId: str
    startedAt: str
    completedAt: str
    ruleVersionsApplied: Dict[str, str]
    findingsSummary: Dict[str, int]
    overallComplianceScore: int
    executionType: str = 'DETERMINISTIC'

class VerificationAttemptModel(BaseModel):
    id: str
    applicationId: str
    documentId: str
    sourceType: VerificationSource
    sourceName: str
    requestedAt: str
    respondedAt: str
    referenceNumber: str
    comparedFields: Dict[str, Any]
    result: VerificationResult
    isSimulated: bool = True
    simulationDisclaimer: str = 'SIMULATED — NOT OFFICIAL VERIFICATION'
    observations: str
    retryCount: Optional[int] = 0
    maxRetries: Optional[int] = 3
    errorCategory: Optional[str] = None
    correlationId: Optional[str] = None

class ReviewerActionModel(BaseModel):
    id: str
    applicationId: str
    findingId: Optional[str] = None
    reviewerId: str
    reviewerName: str
    actionType: str
    previousState: Optional[str] = None
    newState: Optional[str] = None
    reason: str
    timestamp: str
    applicationVersion: Optional[int] = None

class EscalationTaskModel(BaseModel):
    id: str
    applicationId: str
    instrumentId: Optional[str] = None
    escalationType: str
    priority: str = 'HIGH'
    assignedRole: UserRole = 'REVIEWER'
    deadline: str
    status: str = 'OPEN'
    reason: str
    createdAt: str
    resolvedAt: Optional[str] = None
    resolvedBy: Optional[str] = None

class ApprovalCommandModel(BaseModel):
    id: str
    idempotencyKey: str
    applicationId: str
    expectedVersion: int
    officerId: str
    officerName: str
    officerRole: str
    status: str  # 'COMMITTED' | 'FAILED'
    errorCode: Optional[str] = None
    errorMessage: Optional[str] = None
    createdAt: str
    committedAt: Optional[str] = None
    correlationId: str

class AuditEventModel(BaseModel):
    id: str
    timestamp: str
    actorId: str
    actorName: str
    actorRole: UserRole
    action: str
    targetEntity: str
    targetId: str
    correlationId: str
    details: Dict[str, Any]
    ipAddress: Optional[str] = None

class ApprovalRequestSchema(BaseModel):
    expectedVersion: int
    idempotencyKey: str
    approvalReason: Optional[str] = None
    simulateDbFailure: Optional[bool] = False

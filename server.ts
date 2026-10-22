/**
 * AICTE Intelligent Regulatory Validation Platform - Server Entry Point
 * Enhanced with Financial Safeguards, Concurrency Control, Idempotency,
 * Versioned Document Replacements, and Adversarial Anomaly Protections.
 */

import './server/loadEnv.ts';
import express, { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, PersistenceConflictError } from './server/db.ts';
import { ruleEngine, normalizeInstrumentNumber } from './server/ruleEngine.ts';
import { anomalyDetector } from './server/anomalyDetector.ts';
import { verificationAdapters } from './server/verificationAdapters.ts';
import { analyzeExtractedDocument, geminiService } from './server/geminiService.ts';
import {
  AuthenticationError,
  getDemoUser,
  getOidcUser,
  hasOidcConfiguration,
  isDemoAuthEnabled,
  isProductionEnvironment,
  setDemoSession,
} from './server/auth.ts';
import {
  ApplicationStatus,
  DocumentType,
  FindingStatus,
  User,
  VerificationSource,
  ApprovalCommandRecord,
  DocumentVersionRecord,
  DocumentRecord,
  ExtractedFields,
  FdrInstrument,
  GeminiDocumentAnalysis,
} from './src/types/index.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = isProductionEnvironment;
const userContext = new AsyncLocalStorage<User>();
let writeQueue = Promise.resolve();
const currentUser = new Proxy({} as User, {
  get: (_target, property: keyof User) => userContext.getStore()?.[property],
});

async function acquireWriteLock(): Promise<() => void> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Ensure private upload directory exists
const uploadDir = path.resolve(
  process.env.DOCUMENT_STORAGE_PATH ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'documents')
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const randomKey = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${randomKey}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes[extension] === file.mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Disallowed file format. Only PDF, PNG, and JPEG files are supported.'));
    }
  },
});

interface DocumentExtractionResult {
  processingStatus: 'PROCESSED' | 'FAILED' | 'MANUAL_REVIEW_REQUIRED';
  pageCount: number;
  extractionMethod: 'NONE' | 'PDF_TEXT_EXTRACTION' | 'TESSERACT_OCR' | 'HYBRID_EXTRACTION';
  rawTextPreview?: string | null;
  fields: {
    institutionName?: string;
    registrationNumber?: string;
    issueDate?: string;
    expiryDate?: string;
    bankName?: string;
    fdrNumber?: string;
    holderName?: string;
    financialAmount?: number;
    currency?: string;
  };
  extractionConfidence?: number | null;
  rawText: string;
  fieldEvidence: Record<string, Array<{ page: number; text: string }>>;
  pages: Array<{ page: number; text: string; method: string; status: string }>;
}

class DocumentProcessorError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode: string
  ) {
    super(message);
    this.name = 'DocumentProcessorError';
  }
}

type UploadedDocumentFile = Pick<Express.Multer.File, 'path' | 'originalname' | 'mimetype'>;

async function extractUploadedDocument(file: UploadedDocumentFile): Promise<DocumentExtractionResult> {
  const form = new FormData();
  const fileBytes = fs.readFileSync(file.path);
  form.append(
    'file',
    new Blob([new Uint8Array(fileBytes)], { type: file.mimetype }),
    path.basename(file.originalname)
  );

  const headers: Record<string, string> = {};
  if (process.env.DOCUMENT_PROCESSOR_TOKEN) {
    headers['x-document-processor-token'] = process.env.DOCUMENT_PROCESSOR_TOKEN;
  }

  let response: globalThis.Response;
  try {
    response = await fetch(
      `${process.env.DOCUMENT_PROCESSOR_URL || 'http://127.0.0.1:8000'}/api/v1/documents/extract`,
      {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(30_000),
      }
    );
  } catch {
    throw new DocumentProcessorError(
      'Document processor is unavailable. Start the FastAPI service and retry.',
      503,
      'DOCUMENT_PROCESSOR_UNAVAILABLE'
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail;
    throw new DocumentProcessorError(
      typeof detail?.message === 'string' ? detail.message : 'Document processing failed.',
      response.status,
      typeof detail?.code === 'string' ? detail.code : 'DOCUMENT_PROCESSING_FAILED'
    );
  }

  return payload as DocumentExtractionResult;
}

const validateUploadSignature = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    next();
    return;
  }

  const header = Buffer.alloc(8);
  const fileDescriptor = fs.openSync(req.file.path, 'r');
  let bytesRead: number;
  try {
    bytesRead = fs.readSync(fileDescriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fileDescriptor);
  }

  const signature = header.subarray(0, bytesRead);
  const valid =
    (req.file.mimetype === 'application/pdf' && signature.subarray(0, 5).toString() === '%PDF-') ||
    (req.file.mimetype === 'image/png' && signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (req.file.mimetype === 'image/jpeg' && signature.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));

  if (!valid) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'File contents do not match the supported document type.' });
    return;
  }

  next();
};

// Request logger with correlation ID
app.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${crypto.randomBytes(4).toString('hex')}`;
  res.setHeader('X-Correlation-ID', correlationId);
  (req as any).correlationId = correlationId;
  if (req.path.startsWith('/api')) {
    console.log(`[API ${req.method}] ${req.path} (CID: ${correlationId})`);
  }
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.get('/ready', async (_req: Request, res: Response) => {
  const geminiConfigured = geminiService.isAvailable();
  const production = isProduction();
  const oidcConfigured =
    hasOidcConfiguration() &&
    Boolean(process.env.OIDC_SUBJECT_USER_MAP && process.env.OIDC_SUBJECT_USER_MAP !== '{}');
  const processorUrl = process.env.DOCUMENT_PROCESSOR_URL || 'http://127.0.0.1:8000';
  let processorReachable = false;
  try {
    const processorHealth = await fetch(`${processorUrl}/health`, { signal: AbortSignal.timeout(1500) });
    processorReachable = processorHealth.ok;
  } catch {
    processorReachable = false;
  }
  const ready = processorReachable && (!production || oidcConfigured);
  res.status(ready ? 200 : 503).json({
    ready,
    checks: {
      authentication: {
        configured: oidcConfigured,
        mode: oidcConfigured ? 'oidc' : isDemoAuthEnabled(_req) ? 'local_demo_opt_in' : 'unavailable',
      },
      documentProcessor: { configured: true, reachable: processorReachable },
      gemini: {
        configured: geminiConfigured,
        providerEnabled: geminiConfigured,
        errorCode: geminiConfigured ? null : 'GEMINI_NOT_CONFIGURED',
        integration: 'document_upload_analysis',
        providerAvailability: 'not_checked',
      },
    },
  });
});

function userCanAccessApplication(user: User, applicationId: string): boolean {
  if (user.role !== 'INSTITUTION') return true;
  const application = db.applications.find((candidate) => candidate.id === applicationId);
  return Boolean(application && application.institutionId === user.institutionId);
}

function authorizeApiRequest(req: Request, user: User): { status: number; code: string; error: string } | undefined {
  const route = req.originalUrl.split('?')[0];
  const appMatch = route.match(/\/applications\/([^/]+)/);
  const documentMatch = route.match(/\/documents\/([^/]+)/);
  const findingMatch = route.match(/\/findings\/([^/]+)/);
  let applicationId = appMatch?.[1];

  if (!applicationId && documentMatch) {
    applicationId = db.documents.find((document) => document.id === documentMatch[1])?.applicationId;
  }
  if (!applicationId && findingMatch) {
    applicationId = db.validationFindings.find((finding) => finding.id === findingMatch[1])?.applicationId;
  }

  if (applicationId && !userCanAccessApplication(user, applicationId)) {
    return { status: 404, code: 'RESOURCE_NOT_FOUND', error: 'Resource not found.' };
  }

  const isReviewer = user.role === 'REVIEWER' || user.role === 'ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isInstitutionOwner = user.role === 'INSTITUTION' && Boolean(applicationId);
  const roleDenied = (): { status: number; code: string; error: string } => ({
    status: 403,
    code: 'FORBIDDEN',
    error: 'This identity is not authorized to perform this action.',
  });

  if (route.startsWith('/api/v1/admin/')) return isAdmin ? undefined : roleDenied();
  if (route === '/api/v1/dashboard/metrics') return isReviewer ? undefined : roleDenied();
  if (route === '/api/v1/auth/users') return isAdmin || isDemoAuthEnabled(req) ? undefined : roleDenied();

  if (route === '/api/v1/institutions' && user.role === 'INSTITUTION' && !user.institutionId) {
    return roleDenied();
  }

  if (req.method === 'POST' && route === '/api/v1/applications') {
    return user.role === 'INSTITUTION' && user.institutionId ? undefined : roleDenied();
  }

  if (req.method === 'POST' && /\/applications\/[^/]+\/(submit|documents)$/.test(route)) {
    return isInstitutionOwner ? undefined : roleDenied();
  }

  if (req.method === 'POST' && /\/applications\/[^/]+\/documents\/[^/]+\/replace$/.test(route)) {
    return isInstitutionOwner ? undefined : roleDenied();
  }

  if (req.method === 'DELETE' && route.startsWith('/api/v1/documents/')) {
    return isInstitutionOwner || isAdmin ? undefined : roleDenied();
  }

  if (req.method === 'POST' && route.endsWith('/approval')) {
    return isReviewer && user.canApproveApplications === true ? undefined : roleDenied();
  }

  if (
    (req.method === 'PATCH' && route.startsWith('/api/v1/findings/')) ||
    (req.method === 'POST' &&
      (route.endsWith('/resolve-rule') ||
        route.endsWith('/validate') ||
        route.endsWith('/reassess') ||
        route.endsWith('/verify-document') ||
        /\/documents\/[^/]+\/verify$/.test(route) ||
        /\/documents\/[^/]+\/gemini-analysis\/retry$/.test(route))) ||
    (req.method === 'PATCH' && route.startsWith('/api/v1/admin/escalations/'))
  ) {
    return isReviewer || (user.role === 'INSTITUTION' && route.includes('/gemini-analysis/retry') && isInstitutionOwner)
      ? undefined
      : roleDenied();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && !isReviewer) return roleDenied();
  return undefined;
}

app.use('/api/v1', async (req: Request, res: Response, next: NextFunction) => {
  const route = req.originalUrl.split('?')[0];
  if (route === '/api/v1/auth/login' || route === '/api/v1/auth/switch-user') {
    next();
    return;
  }

  if (route === '/api/v1/auth/me' && isDemoAuthEnabled(req) && !req.headers.authorization && !getDemoUser(req, db.users)) {
    res.json({
      user: null,
      availableRoles: ['INSTITUTION', 'REVIEWER', 'ADMIN'],
      demoRoleSwitchEnabled: true,
    });
    return;
  }

  if (route === '/api/v1/auth/users' && isDemoAuthEnabled(req) && !req.headers.authorization) {
    next();
    return;
  }

  try {
    const demoUser = getDemoUser(req, db.users);
    const authorization = req.headers.authorization;
    let user: User;
    if (demoUser) {
      user = demoUser;
    } else if (authorization?.startsWith('Bearer ')) {
      user = await getOidcUser(authorization.slice('Bearer '.length));
    } else if (isDemoAuthEnabled(req)) {
      throw new AuthenticationError(
        'Select a demo identity using the local development role switcher.',
        401,
        'DEMO_SESSION_REQUIRED'
      );
    } else if (!hasOidcConfiguration()) {
      throw new AuthenticationError(
        'Trusted OIDC authentication is not configured.',
        503,
        'OIDC_NOT_CONFIGURED'
      );
    } else {
      throw new AuthenticationError('A valid bearer token is required.', 401, 'TOKEN_REQUIRED');
    }

    const denial = authorizeApiRequest(req, user);
    if (denial) {
      res.status(denial.status).json({ error: denial.error, code: denial.code });
      return;
    }

    const writeState = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    const reportExport = req.method === 'GET' && route.endsWith('/report');
    const releaseWrite = writeState || reportExport ? await acquireWriteLock() : undefined;
    let lockReleased = false;
    const releaseLock = () => {
      if (!lockReleased && releaseWrite) {
        lockReleased = true;
        releaseWrite();
      }
    };
    if (releaseWrite) {
      res.once('finish', releaseLock);
      res.once('close', releaseLock);
    }
    const before = writeState || reportExport ? db.snapshot() : undefined;
    const originalJson = res.json.bind(res);
    let persisted = false;
    res.json = ((body: unknown) => {
      if (before && !persisted) {
        persisted = true;
        try {
          const expectedVersions: Record<string, number> = {};
          for (const previousApplication of before.applications) {
            const currentApplication = db.applications.find(
              (application) => application.id === previousApplication.id
            );
            if (
              currentApplication &&
              JSON.stringify(previousApplication) !== JSON.stringify(currentApplication)
            ) {
              expectedVersions[previousApplication.id] = previousApplication.version;
            }
          }
          db.persist(expectedVersions);
        } catch (error) {
          db.restore(before);
          if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          if (error instanceof PersistenceConflictError) {
            res.statusCode = 409;
            return originalJson({
              error: 'The application was concurrently updated; refresh before retrying.',
              code: 'APPLICATION_CONCURRENCY_CONFLICT',
            });
          }
          res.statusCode = 500;
          return originalJson({
            error: 'The operation was not committed because durable storage failed.',
            code: 'PERSISTENCE_FAILED',
          });
        }
      }
      return originalJson(body);
    }) as Response['json'];

    userContext.run(user, () => next());
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    res.status(503).json({ error: 'Authentication could not be verified.', code: 'AUTHENTICATION_UNAVAILABLE' });
  }
});

// ==========================================
// 1. AUTH & USER ENDPOINTS
// ==========================================

app.get('/api/v1/auth/me', (_req: Request, res: Response) => {
  res.json({
    user: userContext.getStore(),
    availableRoles: isDemoAuthEnabled(_req) ? ['INSTITUTION', 'REVIEWER', 'ADMIN'] : [],
    demoRoleSwitchEnabled: isDemoAuthEnabled(_req),
  });
});

app.post('/api/v1/auth/login', (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Email-only login has been disabled. Use a trusted OIDC bearer token.',
    code: 'PASSWORD_AUTH_NOT_CONFIGURED',
  });
});

app.post('/api/v1/auth/switch-user', (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!isDemoAuthEnabled(req)) {
    res.status(403).json({ error: 'Demo role switching is disabled.', code: 'DEMO_AUTH_DISABLED' });
    return;
  }
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const before = db.snapshot();
  try {
    res.setHeader('Set-Cookie', setDemoSession(req, user.id));
    db.logAuditEvent(user, 'DEMO_ROLE_SWITCHED', 'USER', user.id, {
      newRole: user.role,
      canApprove: user.canApproveApplications,
    });
    db.persist();
    res.json({ success: true, user });
  } catch {
    db.restore(before);
    res.status(500).json({ error: 'Demo session could not be persisted.', code: 'PERSISTENCE_FAILED' });
  }
});

app.get('/api/v1/auth/users', (req: Request, res: Response) => {
  if (!isDemoAuthEnabled(req) && currentUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Administrator permission is required.', code: 'FORBIDDEN' });
    return;
  }
  res.json({ users: db.users });
});

// ==========================================
// 2. INSTITUTIONS
// ==========================================

app.get('/api/v1/institutions', (_req: Request, res: Response) => {
  const institutions =
    currentUser.role === 'INSTITUTION'
      ? db.institutions.filter((institution) => institution.id === currentUser.institutionId)
      : db.institutions;
  res.json({ institutions });
});

app.get('/api/v1/institutions/:id', (req: Request, res: Response) => {
  if (currentUser.role === 'INSTITUTION' && req.params.id !== currentUser.institutionId) {
    res.status(404).json({ error: 'Institution not found' });
    return;
  }
  const inst = db.institutions.find((i) => i.id === req.params.id);
  if (!inst) {
    res.status(404).json({ error: 'Institution not found' });
    return;
  }
  res.json({ institution: inst });
});

// ==========================================
// 3. APPLICATIONS & CONCURRENCY
// ==========================================

app.get('/api/v1/applications', (req: Request, res: Response) => {
  const { status, category, institutionId, search, reviewerId } = req.query;

  let list = [...db.applications];

  if (currentUser.role === 'INSTITUTION') {
    list = list.filter((a) => a.institutionId === currentUser.institutionId);
  }

  if (institutionId) {
    list = list.filter((a) => a.institutionId === institutionId);
  }
  if (status) {
    list = list.filter((a) => a.status === status);
  }
  if (category) {
    list = list.filter((a) => a.category === category);
  }
  if (reviewerId) {
    list = list.filter((a) => a.assignedReviewerId === reviewerId);
  }
  if (search) {
    const q = (search as string).toLowerCase();
    list = list.filter(
      (a) =>
        a.applicationNumber.toLowerCase().includes(q) ||
        a.institutionName.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json({ applications: list, total: list.length });
});

app.get('/api/v1/applications/:id', (req: Request, res: Response) => {
  const appRecord = db.applications.find((a) => a.id === req.params.id);
  if (!appRecord) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const institution = db.institutions.find((i) => i.id === appRecord.institutionId);
  const docs = db.documents.filter((d) => d.applicationId === appRecord.id);
  const findings = db.validationFindings.filter((f) => f.applicationId === appRecord.id);
  const verifications = db.verificationAttempts.filter((v) => v.applicationId === appRecord.id);
  const actions = db.reviewerActions.filter((r) => r.applicationId === appRecord.id);
  const validationRun = db.validationRuns.find((r) => r.applicationId === appRecord.id);
  const fdrs = db.fdrInstruments.filter((f) => f.applicationId === appRecord.id);
  const escalations = db.escalationTasks.filter((e) => e.applicationId === appRecord.id);

  res.json({
    application: appRecord,
    institution,
    documents: docs,
    findings,
    verifications,
    reviewerActions: actions,
    validationRun,
    fdrInstruments: fdrs,
    escalationTasks: escalations,
  });
});

app.post('/api/v1/applications', (req: Request, res: Response) => {
  const { category, proposedIntake, proposedProgramme, notes, academicYear } = req.body;

  const instId = currentUser.institutionId;
  const inst = db.institutions.find((i) => i.id === instId);
  if (!inst) {
    res.status(403).json({ error: 'The authenticated institution has no configured institution record.' });
    return;
  }

  const appNumber = `AICTE/2026-27/APP-${8500 + db.applications.length + 1}`;
  const now = new Date().toISOString();

  const newApp = {
    id: `app-${Date.now()}`,
    version: 1, // Start with version 1
    applicationNumber: appNumber,
    institutionId: inst.id,
    institutionName: inst.name,
    category: category || 'Extension of Approval',
    academicYear: academicYear || '2026-2027',
    status: 'DRAFT' as ApplicationStatus,
    proposedIntake: proposedIntake ? parseInt(proposedIntake, 10) : inst.currentApprovedIntake,
    proposedProgramme: proposedProgramme || undefined,
    createdAt: now,
    updatedAt: now,
    isSynthetic: true,
    ruleResolutionStatus: 'RESOLVED' as const,
    notes: notes || 'Created via Institution Portal',
  };

  db.applications.unshift(newApp);
  db.logAuditEvent(currentUser, 'APPLICATION_CREATED', 'APPLICATION', newApp.id, {
    applicationNumber: appNumber,
    category: newApp.category,
  });

  res.status(201).json({ success: true, application: newApp });
});

app.post('/api/v1/applications/:id/submit', (req: Request, res: Response) => {
  const appRecord = db.applications.find((a) => a.id === req.params.id);
  if (!appRecord) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  if (
    appRecord.status !== 'DRAFT' &&
    appRecord.status !== 'DEFICIENCIES_FOUND' &&
    appRecord.status !== 'DUPLICATE_CONFLICT_REVIEW'
  ) {
    res.status(400).json({ error: `Cannot submit application in status: ${appRecord.status}` });
    return;
  }

  const now = new Date().toISOString();
  appRecord.status = 'VALIDATION_IN_PROGRESS';
  appRecord.submittedAt = now;
  appRecord.updatedAt = now;
  appRecord.version += 1; // Monotonic increment

  db.logAuditEvent(currentUser, 'APPLICATION_SUBMITTED', 'APPLICATION', appRecord.id, {
    applicationNumber: appRecord.applicationNumber,
    version: appRecord.version,
  });

  const validationResult = ruleEngine.runValidation(appRecord.id, 'DETERMINISTIC');

  res.json({
    success: true,
    application: appRecord,
    validationRun: validationResult.run,
    findings: validationResult.findings,
  });
});

// SCENARIO 5 & SCENARIO 8 & SCENARIO 10: APPROVAL COMMAND WITH AUTHORIZATION & OCC
app.post('/api/v1/applications/:id/approval', (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId || `corr-${crypto.randomBytes(4).toString('hex')}`;
  const { expectedVersion, idempotencyKey, approvalReason, simulateDbFailure } = req.body;

  const appRecord = db.applications.find((a) => a.id === req.params.id);
  if (!appRecord) {
    res.status(404).json({ error: 'Application not found', correlationId });
    return;
  }

  // Idempotency check: if this command was already committed, return the committed result
  if (idempotencyKey) {
    const existingCmd = db.approvalCommands.find(
      (c) => c.idempotencyKey === idempotencyKey && c.status === 'COMMITTED'
    );
    if (existingCmd) {
      res.json({
        success: true,
        message: 'Approval command previously committed (Idempotent response)',
        application: appRecord,
        command: existingCmd,
        correlationId,
      });
      return;
    }
  }

  // 1. SCENARIO 5: Server-side Authorization Check
  if (!currentUser.canApproveApplications || (currentUser.role !== 'REVIEWER' && currentUser.role !== 'ADMIN')) {
    db.logAuditEvent(
      currentUser,
      'SECURITY_UNAUTHORIZED_APPROVAL_ATTEMPT',
      'SECURITY',
      appRecord.id,
      {
        attemptedAction: 'APPROVE_APPLICATION',
        userRole: currentUser.role,
        designation: currentUser.designation,
        reason: 'User lacks statutory approval authority or appropriate role assignment',
        correlationId,
      }
    );

    res.status(403).json({
      error: 'HTTP 403 Forbidden: Officer does not possess statutory approval authority for this application.',
      correlationId,
    });
    return;
  }

  // 2. SCENARIO 8: Optimistic Concurrency Control (OCC) Check
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    res.status(400).json({ error: 'A valid expected application version is required.', correlationId });
    return;
  }
  if (appRecord.version !== expectedVersion) {
    res.status(409).json({
      error: `HTTP 409 Conflict: Application state has been updated concurrently by another officer. Expected version ${expectedVersion}, but current database version is ${appRecord.version}. Please refresh and inspect recent scrutiny notes.`,
      currentVersion: appRecord.version,
      expectedVersion,
      correlationId,
    });
    return;
  }

  // 3. Status and Prerequisites Check
  if (!db.validationRuns.some((run) => run.applicationId === appRecord.id)) {
    res.status(400).json({
      error: 'Cannot approve: Application must complete deterministic validation before approval.',
      correlationId,
    });
    return;
  }

  if (appRecord.status === 'DUPLICATE_CONFLICT_REVIEW') {
    res.status(400).json({
      error: 'Cannot approve: Application is held under DUPLICATE_CONFLICT_REVIEW. Instrument conflict must be resolved first.',
      correlationId,
    });
    return;
  }

  if (appRecord.status === 'EXPIRING_TODAY') {
    res.status(400).json({
      error: 'Cannot approve: Pledged financial instrument expires today. Rollover certificate required before approval.',
      correlationId,
    });
    return;
  }

  // Check blocking findings (CRITICAL or MAJOR that are OPEN or CONFIRMED_DISCREPANCY)
  const blockingFindings = db.validationFindings.filter(
    (f) =>
      f.applicationId === appRecord.id &&
      (f.severity === 'CRITICAL' || f.severity === 'MAJOR') &&
      (f.status === 'OPEN' || f.status === 'CONFIRMED_DISCREPANCY' || f.status === 'REASSESSMENT_REQUIRED')
  );

  if (blockingFindings.length > 0) {
    res.status(400).json({
      error: `Cannot approve: Application has ${blockingFindings.length} unresolved blocking findings (${blockingFindings.map((b) => b.ruleId).join(', ')}).`,
      blockingFindings,
      correlationId,
    });
    return;
  }

  // 4. SCENARIO 10: Database Transaction Failure Simulation
  if (simulateDbFailure || req.headers['x-simulate-db-failure'] === 'true') {
    const failedCmd: ApprovalCommandRecord = {
      id: `cmd-${Date.now()}`,
      idempotencyKey: idempotencyKey || `idem-${Date.now()}`,
      applicationId: appRecord.id,
      expectedVersion,
      officerId: currentUser.id,
      officerName: currentUser.name,
      officerRole: currentUser.role,
      status: 'FAILED',
      errorCode: 'DB_TRANSACTION_ABORTED',
      errorMessage: 'Simulated MongoDB write conflict / network partition during state commit',
      createdAt: new Date().toISOString(),
      correlationId,
    };
    db.approvalCommands.push(failedCmd);

    db.logAuditEvent(currentUser, 'APPROVAL_TRANSACTION_FAILED', 'APPLICATION', appRecord.id, {
      errorCode: 'DB_TRANSACTION_ABORTED',
      correlationId,
    });

    res.status(500).json({
      error: 'HTTP 500 Internal Error: Database transaction failed during approval commit. No state changes were persisted. Please retry using the same idempotency key.',
      status: 'UNCOMMITTED',
      correlationId,
    });
    return;
  }

  // 5. Successful Atomic Transition
  const previousState = appRecord.status;
  appRecord.status = 'REVIEW_COMPLETED';
  appRecord.version += 1; // Monotonic OCC increment
  appRecord.approvedAt = new Date().toISOString();
  appRecord.approvedBy = currentUser.name;
  appRecord.updatedAt = appRecord.approvedAt;

  const cmd: ApprovalCommandRecord = {
    id: `cmd-${Date.now()}`,
    idempotencyKey: idempotencyKey || `idem-${Date.now()}`,
    applicationId: appRecord.id,
    expectedVersion,
    officerId: currentUser.id,
    officerName: currentUser.name,
    officerRole: currentUser.role,
    status: 'COMMITTED',
    createdAt: new Date().toISOString(),
    committedAt: appRecord.approvedAt,
    correlationId,
  };
  db.approvalCommands.push(cmd);

  db.reviewerActions.unshift({
    id: `act-${Date.now()}`,
    applicationId: appRecord.id,
    reviewerId: currentUser.id,
    reviewerName: currentUser.name,
    actionType: 'APPROVAL_GRANTED',
    previousState,
    newState: 'REVIEW_COMPLETED',
    reason: approvalReason || 'Statutory review completed and approval granted by authorized officer',
    timestamp: appRecord.approvedAt,
    applicationVersion: appRecord.version,
  });

  db.logAuditEvent(currentUser, 'APPLICATION_APPROVAL_COMMITTED', 'APPLICATION', appRecord.id, {
    applicationVersion: appRecord.version,
    previousState,
    approvalReason,
    correlationId,
  });

  res.json({
    success: true,
    message: 'Application statutory approval successfully committed.',
    application: appRecord,
    command: cmd,
    correlationId,
  });
});

// SCENARIO 7: RESOLVE UNCERTAIN / AMBIGUOUS REGULATORY RULE
app.post('/api/v1/applications/:id/resolve-rule', (req: Request, res: Response) => {
  const { selectedRuleId, resolutionRationale } = req.body;
  const appRecord = db.applications.find((a) => a.id === req.params.id);
  if (!appRecord) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  if (currentUser.role !== 'REVIEWER' && currentUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Only authorized reviewers or administrators may resolve ambiguous rules.' });
    return;
  }

  appRecord.ruleResolutionStatus = 'RESOLVED';
  appRecord.notes = `${appRecord.notes || ''} [Rule Ambiguity Resolved by ${currentUser.name}: ${resolutionRationale}]`;
  appRecord.version += 1;
  appRecord.updatedAt = new Date().toISOString();

  // Remove the ambiguity finding
  db.validationFindings = db.validationFindings.filter(
    (f) => !(f.applicationId === appRecord.id && f.ruleId === 'RULE-AMBIGUITY-ABSTENTION')
  );

  db.logAuditEvent(currentUser, 'RULE_AMBIGUITY_RESOLVED', 'APPLICATION', appRecord.id, {
    selectedRuleId,
    resolutionRationale,
    newStatus: appRecord.ruleResolutionStatus,
  });

  // Re-run validation with resolved rule
  const validationResult = ruleEngine.runValidation(appRecord.id, 'DETERMINISTIC');

  res.json({
    success: true,
    application: appRecord,
    validationRun: validationResult.run,
    findings: validationResult.findings,
  });
});

// ==========================================
// 4. DOCUMENTS & VERSIONING (SCENARIO 9)
// ==========================================

// SCENARIO 9: DOCUMENT REPLACEMENT WITH IMMUTABLE VERSIONING
app.post(
  '/api/v1/applications/:id/documents/:docId/replace',
  upload.single('file'),
  validateUploadSignature,
  async (req: Request, res: Response) => {
    try {
      const appRecord = db.applications.find((a) => a.id === req.params.id);
      if (!appRecord) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      const existingDoc = db.documents.find((d) => d.id === req.params.docId);
      if (!existingDoc) {
        res.status(404).json({ error: 'Existing document to replace not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Replacement file required' });
        return;
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const newSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      let extraction: DocumentExtractionResult;
      try {
        extraction = await extractUploadedDocument(req.file);
      } catch (error) {
        fs.unlinkSync(req.file.path);
        if (error instanceof DocumentProcessorError) {
          res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
          return;
        }
        throw error;
      }
      const geminiAnalysis = await analyzeExtractedDocument(
        extraction,
        existingDoc.documentType,
        req.file.mimetype
      );
      const replacementReason = req.body.replacementReason || 'Corrected document uploaded by institution';
      const extractedFields: ExtractedFields = {
        ...extraction.fields,
        ...(extraction.fields.expiryDate ? { maturityDate: extraction.fields.expiryDate } : {}),
        rawTextPreview: extraction.rawTextPreview || undefined,
        extractionMethod: extraction.extractionMethod,
        ...(typeof extraction.extractionConfidence === 'number'
          ? { extractionConfidence: extraction.extractionConfidence }
          : {}),
      };

      // 1. Mark existing version record as inactive
      const oldVersionNumber = existingDoc.version;
      const existingVersionRecord = db.documentVersions.find(
        (v) => v.documentId === existingDoc.id && v.versionNumber === oldVersionNumber
      );
      if (existingVersionRecord) {
        existingVersionRecord.isActive = false;
        (existingVersionRecord as any).supersededByVersion = oldVersionNumber + 1;
      }

      // 2. Increment version and update DocumentRecord
      existingDoc.version += 1;
      existingDoc.filename = req.file.filename;
      existingDoc.originalFilename = req.file.originalname;
      existingDoc.fileSizeBytes = req.file.size;
      existingDoc.sha256Hash = newSha256;
      existingDoc.storageKey = req.file.path;
      existingDoc.uploadedAt = new Date().toISOString();
      existingDoc.uploadedBy = currentUser.id;
      existingDoc.extractedFields = extractedFields;
      existingDoc.processingStatus = extraction.processingStatus;
      existingDoc.geminiAnalysis = geminiAnalysis;
      existingDoc.pageCount = extraction.pageCount;
      existingDoc.fieldEvidence = extraction.fieldEvidence;
      existingDoc.processingPages = extraction.pages.map(({ page, method, status }) => ({ page, method, status }));
      existingDoc.isSimulated = false;

      // 3. Create new DocumentVersionRecord
      const newVersionRecord: DocumentVersionRecord = {
        id: `ver-${existingDoc.id}-v${existingDoc.version}`,
        documentId: existingDoc.id,
        applicationId: appRecord.id,
        versionNumber: existingDoc.version,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        sha256Hash: newSha256,
        storageKey: req.file.path,
        uploadedAt: existingDoc.uploadedAt,
        uploadedBy: currentUser.id,
        replacementReason,
        isActive: true,
        extractedFields: { ...existingDoc.extractedFields },
        processingStatus: existingDoc.processingStatus,
        geminiAnalysis: existingDoc.geminiAnalysis,
        fieldEvidence: existingDoc.fieldEvidence,
        processingPages: existingDoc.processingPages,
      };
      db.documentVersions.push(newVersionRecord);

      // 4. Synchronize FDR instrument if this is an FDR
      const fdrInst = db.fdrInstruments.find((f) => f.documentId === existingDoc.id);
      if (fdrInst) {
        const { bankName, fdrNumber, holderName, financialAmount, currency, issueDate, maturityDate } =
          existingDoc.extractedFields;
        if (
          bankName &&
          fdrNumber &&
          holderName &&
          typeof financialAmount === 'number' &&
          currency &&
          issueDate &&
          maturityDate
        ) {
          fdrInst.bankName = bankName;
          fdrInst.fdrNumberNormalized = normalizeInstrumentNumber(fdrNumber);
          fdrInst.holderName = holderName;
          fdrInst.amount = financialAmount;
          fdrInst.currency = currency;
          fdrInst.issueDate = issueDate;
          fdrInst.maturityDate = maturityDate;
          fdrInst.isExpiringToday = maturityDate.slice(0, 10) === new Date().toISOString().slice(0, 10);
        } else {
          db.fdrInstruments.splice(db.fdrInstruments.indexOf(fdrInst), 1);
        }
      }

      // 5. Mark affected findings for this document as REASSESSMENT_REQUIRED
      for (const fnd of db.validationFindings) {
        if (fnd.applicationId === appRecord.id && fnd.affectedDocumentIds.includes(existingDoc.id)) {
          fnd.status = 'REASSESSMENT_REQUIRED';
        }
      }

      // 6. Monotonically increment application version and re-run validation
      appRecord.version += 1;
      appRecord.updatedAt = new Date().toISOString();

      db.logAuditEvent(currentUser, 'DOCUMENT_VERSION_REPLACED', 'DOCUMENT', existingDoc.id, {
        documentTitle: existingDoc.title,
        oldVersion: oldVersionNumber,
        newVersion: existingDoc.version,
        newSha256,
        replacementReason,
        geminiAnalysisStatus: geminiAnalysis.status,
      });

      // Automatically re-run validation rules
      const valResult = ruleEngine.runValidation(appRecord.id, 'DETERMINISTIC');

      res.json({
        success: true,
        message: 'Document successfully replaced with new immutable version. Affected checks reassessed.',
        document: existingDoc,
        newVersion: newVersionRecord,
        validationRun: valResult.run,
        findings: valResult.findings,
      });
    } catch (err: any) {
      console.error('Document replacement failed.');
      res.status(500).json({ error: 'Failed to replace document.' });
    }
  }
);

app.post('/api/v1/documents/:id/gemini-analysis/retry', async (req: Request, res: Response) => {
  const docRecord = db.documents.find((document) => document.id === req.params.id);
  if (!docRecord) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  if (
    docRecord.mimeType !== 'application/pdf' ||
    docRecord.isSimulated ||
    docRecord.processingStatus !== 'PROCESSED'
  ) {
    res.status(400).json({
      error: 'Gemini analysis retry requires a successfully extracted, stored PDF document.',
    });
    return;
  }

  const startingVersion = docRecord.version;
  const startingSha256 = docRecord.sha256Hash;
  try {
    if (!fs.existsSync(docRecord.storageKey)) {
      res.status(410).json({ error: 'The stored document is unavailable for re-analysis.' });
      return;
    }
    const bytes = fs.readFileSync(docRecord.storageKey);
    const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== startingSha256) {
      res.status(409).json({ error: 'The stored document has changed; analysis was not started.' });
      return;
    }

    docRecord.geminiAnalysis = { status: 'PENDING' };
    const extraction = await extractUploadedDocument({
      path: docRecord.storageKey,
      originalname: docRecord.originalFilename,
      mimetype: docRecord.mimeType,
    });
    const analysis = await analyzeExtractedDocument(
      extraction,
      docRecord.documentType,
      docRecord.mimeType
    );
    if (docRecord.version !== startingVersion || docRecord.sha256Hash !== startingSha256) {
      res.status(409).json({
        error: 'The document version changed during analysis. Retry on the current version.',
      });
      return;
    }

    docRecord.geminiAnalysis = analysis;
    const versionRecord = db.documentVersions.find(
      (version) =>
        version.documentId === docRecord.id &&
        version.versionNumber === startingVersion
    );
    if (versionRecord) {
      versionRecord.geminiAnalysis = analysis;
    }
    db.logAuditEvent(currentUser, 'GEMINI_DOCUMENT_ANALYSIS', 'DOCUMENT', docRecord.id, {
      version: startingVersion,
      status: analysis.status,
      errorCode: analysis.errorCode,
    });
    res.json({ success: true, geminiAnalysis: analysis });
  } catch {
    const analysis: GeminiDocumentAnalysis = {
      status: 'FAILED',
      errorCode: 'GEMINI_RETRY_FAILED',
    };
    if (docRecord.version === startingVersion && docRecord.sha256Hash === startingSha256) {
      docRecord.geminiAnalysis = analysis;
      const versionRecord = db.documentVersions.find(
        (version) =>
          version.documentId === docRecord.id &&
          version.versionNumber === startingVersion
      );
      if (versionRecord) {
        versionRecord.geminiAnalysis = analysis;
      }
      db.logAuditEvent(currentUser, 'GEMINI_DOCUMENT_ANALYSIS', 'DOCUMENT', docRecord.id, {
        version: startingVersion,
        status: analysis.status,
        errorCode: analysis.errorCode,
      });
    }
    res.status(503).json({
      error: 'Document analysis could not be retried. Native PDF extraction remains unchanged.',
      geminiAnalysis: analysis,
    });
  }
});

app.get('/api/v1/applications/:id/document-versions', (req: Request, res: Response) => {
  const versions = db.documentVersions.filter((v) => v.applicationId === req.params.id);
  res.json({ documentVersions: versions, total: versions.length });
});

app.get('/api/v1/applications/:id/audit-history', (req: Request, res: Response) => {
  const logs = db.auditEvents.filter((a) => a.targetId === req.params.id || a.details?.applicationId === req.params.id);
  res.json({ auditLogs: logs, total: logs.length });
});

app.post(
  '/api/v1/applications/:id/documents',
  upload.single('file'),
  validateUploadSignature,
  async (req: Request, res: Response) => {
    try {
      const appRecord = db.applications.find((a) => a.id === req.params.id);
      if (!appRecord) {
        res.status(404).json({ error: 'Application not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No document file provided' });
        return;
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      let extraction: DocumentExtractionResult;
      try {
        extraction = await extractUploadedDocument(req.file);
      } catch (error) {
        fs.unlinkSync(req.file.path);
        if (error instanceof DocumentProcessorError) {
          res.status(error.statusCode).json({ error: error.message, code: error.errorCode });
          return;
        }
        throw error;
      }

      const documentType = (req.body.documentType as DocumentType) || 'OTHER_EVIDENCE';
      const geminiAnalysis = await analyzeExtractedDocument(
        extraction,
        documentType,
        req.file.mimetype
      );
      const title = req.body.title || req.file.originalname;
      const extractedFields: ExtractedFields = {
        ...extraction.fields,
        ...(extraction.fields.expiryDate ? { maturityDate: extraction.fields.expiryDate } : {}),
        rawTextPreview: extraction.rawTextPreview || undefined,
        extractionMethod: extraction.extractionMethod,
        ...(typeof extraction.extractionConfidence === 'number'
          ? { extractionConfidence: extraction.extractionConfidence }
          : {}),
      };

      const docRecord: DocumentRecord = {
        id: `doc-${crypto.randomUUID()}`,
        applicationId: appRecord.id,
        documentType,
        title,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        sha256Hash,
        storageKey: req.file.path,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser.id,
        version: 1,
        extractedFields,
        processingStatus: extraction.processingStatus,
        geminiAnalysis,
        pageCount: extraction.pageCount,
        hasQrCode: false,
        isSimulated: false,
        fieldEvidence: extraction.fieldEvidence,
        processingPages: extraction.pages.map(({ page, method, status }) => ({ page, method, status })),
        authenticityStatus: 'PENDING',
      };

      db.documents.push(docRecord);

      // Create version 1 record
      db.documentVersions.push({
        id: `ver-${docRecord.id}-v1`,
        documentId: docRecord.id,
        applicationId: appRecord.id,
        versionNumber: 1,
        filename: docRecord.filename,
        originalFilename: docRecord.originalFilename,
        mimeType: docRecord.mimeType,
        fileSizeBytes: docRecord.fileSizeBytes,
        sha256Hash: docRecord.sha256Hash,
        storageKey: docRecord.storageKey,
        uploadedAt: docRecord.uploadedAt,
        uploadedBy: currentUser.id,
        isActive: true,
        extractedFields: { ...docRecord.extractedFields },
        processingStatus: docRecord.processingStatus,
        geminiAnalysis: docRecord.geminiAnalysis,
        fieldEvidence: docRecord.fieldEvidence,
        processingPages: docRecord.processingPages,
      });

      // If document is FDR, register in fdrInstruments
      const { bankName, fdrNumber, holderName, financialAmount, currency, issueDate, maturityDate } =
        docRecord.extractedFields;
      if (
        documentType === 'FDR_OR_ENDOWMENT' &&
        bankName &&
        fdrNumber &&
        holderName &&
        typeof financialAmount === 'number' &&
        currency &&
        issueDate &&
        maturityDate
      ) {
        const fdrInst: FdrInstrument = {
          id: `fdr-${Date.now()}`,
          documentId: docRecord.id,
          applicationId: appRecord.id,
          institutionId: appRecord.institutionId,
          bankName,
          fdrNumberNormalized: normalizeInstrumentNumber(fdrNumber),
          holderName,
          amount: financialAmount,
          currency,
          issueDate,
          maturityDate,
          isExpiringToday: maturityDate.slice(0, 10) === new Date().toISOString().slice(0, 10),
          authenticityStatus: 'PENDING',
          createdAt: new Date().toISOString(),
        };
        db.fdrInstruments.push(fdrInst);
      }

      appRecord.version += 1;
      appRecord.updatedAt = new Date().toISOString();

      db.logAuditEvent(currentUser, 'DOCUMENT_UPLOAD', 'DOCUMENT', docRecord.id, {
        filename: req.file.originalname,
        sha256: sha256Hash,
        documentType,
        geminiAnalysisStatus: geminiAnalysis.status,
      });

      res.status(201).json({ success: true, document: docRecord });
    } catch (err: any) {
      console.error('Document upload failed.');
      res.status(500).json({ error: 'Failed to save document upload.' });
    }
  }
);

app.delete('/api/v1/documents/:id', (req: Request, res: Response) => {
  const index = db.documents.findIndex((d) => d.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const doc = db.documents[index];
  db.documents.splice(index, 1);

  // Remove corresponding FDR instrument if exists
  db.fdrInstruments = db.fdrInstruments.filter((f) => f.documentId !== doc.id);

  db.logAuditEvent(currentUser, 'DOCUMENT_DELETED', 'DOCUMENT', req.params.id, {
    title: doc.title,
  });

  res.json({ success: true, message: 'Document removed' });
});

// ==========================================
// 5. VALIDATION & REASSESSMENT
// ==========================================

app.post('/api/v1/applications/:id/validate', (req: Request, res: Response) => {
  try {
    const { executionType } = req.body;
    const result = ruleEngine.runValidation(req.params.id, executionType || 'DETERMINISTIC');
    res.json({ success: true, validationRun: result.run, findings: result.findings });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/v1/applications/:id/reassess', (req: Request, res: Response) => {
  try {
    const result = ruleEngine.runValidation(req.params.id, 'DETERMINISTIC');
    res.json({ success: true, validationRun: result.run, findings: result.findings });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/v1/applications/:id/findings', (req: Request, res: Response) => {
  const findings = db.validationFindings.filter((f) => f.applicationId === req.params.id);
  res.json({ findings, total: findings.length });
});

app.get('/api/v1/applications/:id/anomalies', (req: Request, res: Response) => {
  const docs = db.documents.filter((d) => d.applicationId === req.params.id);
  const anomalies = anomalyDetector.detectAnomalies(docs);
  res.json({ anomalies, count: anomalies.length });
});

// ==========================================
// 6. FINDINGS & REVIEWER ACTIONS
// ==========================================

app.patch('/api/v1/findings/:id', (req: Request, res: Response) => {
  const { status, reviewerNotes, overrideReason } = req.body;
  const finding = db.validationFindings.find((f) => f.id === req.params.id);
  if (!finding) {
    res.status(404).json({ error: 'Finding not found' });
    return;
  }

  const previousStatus = finding.status;
  if (status) finding.status = status as FindingStatus;
  if (reviewerNotes !== undefined) finding.reviewerNotes = reviewerNotes;
  if (overrideReason !== undefined) finding.overrideReason = overrideReason;

  finding.reviewedBy = currentUser.name;
  finding.reviewedAt = new Date().toISOString();

  const actionRecord = {
    id: `act-${Date.now()}`,
    applicationId: finding.applicationId,
    findingId: finding.id,
    reviewerId: currentUser.id,
    reviewerName: currentUser.name,
    actionType: 'FINDING_OVERRIDE' as const,
    previousState: previousStatus,
    newState: status,
    reason: overrideReason || reviewerNotes || 'Finding status updated by reviewer',
    timestamp: new Date().toISOString(),
  };
  db.reviewerActions.unshift(actionRecord);

  db.logAuditEvent(currentUser, 'FINDING_STATUS_UPDATE', 'APPLICATION', finding.applicationId, {
    findingId: finding.id,
    previousStatus,
    newStatus: status,
    overrideReason,
  });

  res.json({ success: true, finding, action: actionRecord });
});

// ==========================================
// 7. VERIFICATION ADAPTERS & BANK API (SCENARIO 6)
// ==========================================

app.post('/api/v1/documents/:document_id/verify', async (req: Request, res: Response) => {
  try {
    const { sourceType, simulateMode, applicationId } = req.body;
    const doc = db.documents.find((d) => d.id === req.params.document_id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const appId = applicationId || doc.applicationId;
    let attempt;

    if (sourceType === 'BANK_DIRECT_API' || doc.documentType === 'FDR_OR_ENDOWMENT') {
      attempt = await verificationAdapters.verifyBankFdr(appId, doc.id, simulateMode);
    } else {
      attempt = await verificationAdapters.verifyDocument(appId, doc.id, sourceType as VerificationSource);
    }

    res.json({ success: true, verification: attempt });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/v1/documents/:document_id/verification', (req: Request, res: Response) => {
  const attempts = db.verificationAttempts.filter((v) => v.documentId === req.params.document_id);
  res.json({ verifications: attempts });
});

app.post('/api/v1/applications/:id/verify-document', async (req: Request, res: Response) => {
  try {
    const { documentId, sourceType, simulateMode } = req.body;
    let attempt;
    if (sourceType === 'BANK_DIRECT_API') {
      attempt = await verificationAdapters.verifyBankFdr(req.params.id, documentId, simulateMode);
    } else {
      attempt = await verificationAdapters.verifyDocument(req.params.id, documentId, sourceType as VerificationSource);
    }
    res.json({ success: true, verification: attempt });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 8. ESCALATIONS & ADMIN (SCENARIOS 2, 3, 7)
// ==========================================

app.get('/api/v1/admin/escalations', (_req: Request, res: Response) => {
  res.json({ escalations: db.escalationTasks, total: db.escalationTasks.length });
});

app.patch('/api/v1/admin/escalations/:escalation_id', (req: Request, res: Response) => {
  const task = db.escalationTasks.find((e) => e.id === req.params.escalation_id);
  if (!task) {
    res.status(404).json({ error: 'Escalation task not found' });
    return;
  }

  const { status, resolutionReason } = req.body;
  if (status) task.status = status;
  if (status === 'RESOLVED') {
    task.resolvedAt = new Date().toISOString();
    task.resolvedBy = currentUser.name;
  }

  db.logAuditEvent(currentUser, 'ESCALATION_UPDATED', 'APPLICATION', task.applicationId, {
    escalationId: task.id,
    newStatus: status,
    resolutionReason,
  });

  res.json({ success: true, escalation: task });
});

app.get('/api/v1/admin/rules', (_req: Request, res: Response) => {
  res.json({ rules: db.rules });
});

app.patch('/api/v1/admin/rules/:id', (req: Request, res: Response) => {
  const rule = db.rules.find((r) => r.id === req.params.id);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }

  if (req.body.enabled !== undefined) rule.enabled = req.body.enabled;
  if (req.body.severity) rule.severity = req.body.severity;
  if (req.body.parameters) rule.parameters = { ...rule.parameters, ...req.body.parameters };

  db.logAuditEvent(currentUser, 'RULE_CONFIG_UPDATED', 'RULE', rule.id, {
    ruleName: rule.name,
    enabled: rule.enabled,
  });

  res.json({ success: true, rule });
});

app.get('/api/v1/admin/checklists', (_req: Request, res: Response) => {
  res.json({ checklists: db.checklists });
});

app.get('/api/v1/admin/audit-logs', (req: Request, res: Response) => {
  const { actorRole, action, limit } = req.query;
  let logs = [...db.auditEvents];

  if (actorRole) {
    logs = logs.filter((l) => l.actorRole === actorRole);
  }
  if (action) {
    logs = logs.filter((l) => l.action === action);
  }

  const max = limit ? parseInt(limit as string, 10) : 50;
  res.json({ auditLogs: logs.slice(0, max), total: logs.length });
});

app.get('/api/v1/dashboard/metrics', (_req: Request, res: Response) => {
  const metrics = db.getDashboardMetrics();
  metrics.potentialAnomaliesCount = db.applications.reduce(
    (total, application) =>
      total + anomalyDetector.detectAnomalies(db.documents.filter((doc) => doc.applicationId === application.id)).length,
    0
  );
  res.json({ metrics });
});

// ==========================================
// 9. AUDIT REPORT EXPORT
// ==========================================

app.get('/api/v1/applications/:id/report', (req: Request, res: Response) => {
  const appRecord = db.applications.find((a) => a.id === req.params.id);
  if (!appRecord) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const institution = db.institutions.find((i) => i.id === appRecord.institutionId);
  const docs = db.documents.filter((d) => d.applicationId === appRecord.id);
  const findings = db.validationFindings.filter((f) => f.applicationId === appRecord.id);
  const verifications = db.verificationAttempts.filter((v) => v.applicationId === appRecord.id);
  const actions = db.reviewerActions.filter((r) => r.applicationId === appRecord.id);
  const validationRun = db.validationRuns.find((r) => r.applicationId === appRecord.id);
  const fdrs = db.fdrInstruments.filter((f) => f.applicationId === appRecord.id);

  const reportPayload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      platform: 'AICTE Intelligent Regulatory Validation Platform (AI-IRVP)',
      reportVersion: '2.0-FINANCIAL-FORENSICS',
      legalDisclaimer:
        'PROTOTYPE VALIDATION REPORT — Generated for evaluation and decision support. Final statutory regulatory approval requires authorized committee scrutiny in accordance with AICTE Approval Process Handbook.',
    },
    application: appRecord,
    institution,
    validationRun,
    financialInstruments: fdrs,
    documentInventory: docs.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.documentType,
      sha256: d.sha256Hash,
      fileSizeBytes: d.fileSizeBytes,
      pageCount: d.pageCount,
      version: d.version,
      authenticityStatus: d.authenticityStatus || 'PENDING',
      extractedPID: d.extractedFields.institutionIdentifier,
      extractedFDR: d.extractedFields.fdrNumber,
      financialAmount: d.extractedFields.financialAmount,
      expiryDate: d.extractedFields.expiryDate,
      extractionConfidence: d.extractedFields.extractionConfidence,
      extractionMethod: d.extractedFields.extractionMethod,
      processingStatus: d.processingStatus,
      isSimulated: d.isSimulated,
      fieldEvidence: d.fieldEvidence,
    })),
    ruleFindings: findings.map((f) => ({
      ruleId: f.ruleId,
      ruleVersion: f.ruleVersion,
      ruleTitle: f.ruleTitle,
      severity: f.severity,
      status: f.status,
      observedEvidence: f.observedEvidence,
      expectedValue: f.expectedValue,
      observedValue: f.observedValue,
      explanation: f.explanation,
      financialShortfall: f.financialShortfall,
      reviewerNotes: f.reviewerNotes,
      overrideReason: f.overrideReason,
      reviewedBy: f.reviewedBy,
    })),
    externalVerifications: verifications,
    reviewerScrutinyHistory: actions,
  };

  db.logAuditEvent(currentUser, 'REPORT_EXPORTED', 'REPORT', appRecord.id, {
    format: 'JSON',
  });

  res.json(reportPayload);
});

// ==========================================
// VITE MIDDLEWARE & SERVER STARTUP
// ==========================================

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/v1/applications/') && req.path.includes('/documents')) {
    if (err instanceof multer.MulterError) {
      res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AICTE Regulatory Platform server running on http://0.0.0.0:${PORT}`);
  });
}

export { app };

if (process.env.AICTE_TEST_MODE !== 'true') {
  startServer().catch((err) => {
    console.error('Server startup error:', err);
    process.exit(1);
  });
}

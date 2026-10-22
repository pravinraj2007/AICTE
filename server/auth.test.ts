import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { exportJWK, SignJWT } from 'jose';

const databaseDirectory = mkdtempSync(path.join(os.tmpdir(), 'aicte-auth-'));
process.env.AICTE_TEST_MODE = 'true';
process.env.AICTE_DATABASE_PATH = path.join(databaseDirectory, 'platform.sqlite');
process.env.OIDC_ISSUER = 'http://127.0.0.1';
process.env.OIDC_AUDIENCE = 'aicte-test';
process.env.AICTE_DEMO_ROLE_SWITCH_ENABLED = 'false';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = 'aicte-test-key';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

const jwksServer = createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ keys: [publicJwk] }));
});

let app: (typeof import('../server.ts'))['app'];
let db: (typeof import('./db.ts'))['db'];
let baseUrl: string;
let server: ReturnType<typeof import('node:http').createServer>;

before(async () => {
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const jwksAddress = jwksServer.address();
  assert.ok(jwksAddress && typeof jwksAddress !== 'string');
  process.env.OIDC_JWKS_URL = `http://127.0.0.1:${jwksAddress.port}/jwks`;
  process.env.OIDC_ISSUER = 'http://127.0.0.1';

  const serverModule = await import('../server.ts');
  const databaseModule = await import('./db.ts');
  app = serverModule.app;
  db = databaseModule.db;
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  db?.close();
  rmSync(databaseDirectory, { recursive: true, force: true });
});

const subjects = {
  'inst-one': {
    id: 'external-inst-one',
    email: 'one@example.invalid',
    name: 'Institution One',
    role: 'INSTITUTION',
    institutionId: 'inst-1',
    canApproveApplications: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  'inst-two': {
    id: 'external-inst-two',
    email: 'two@example.invalid',
    name: 'Institution Two',
    role: 'INSTITUTION',
    institutionId: 'inst-2',
    canApproveApplications: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  'junior-reviewer': {
    id: 'external-reviewer',
    email: 'reviewer@example.invalid',
    name: 'Junior Reviewer',
    role: 'REVIEWER',
    canApproveApplications: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  approver: {
    id: 'external-approver',
    email: 'approver@example.invalid',
    name: 'Statutory Approver',
    role: 'REVIEWER',
    canApproveApplications: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
};
process.env.OIDC_SUBJECT_USER_MAP = JSON.stringify(subjects);

async function token(subject: string, extraClaims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT(extraClaims)
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(process.env.OIDC_ISSUER!)
    .setAudience(process.env.OIDC_AUDIENCE!)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

async function request(pathname: string, options: RequestInit = {}, subject?: string) {
  const headers = new Headers(options.headers);
  if (subject) headers.set('authorization', `Bearer ${await token(subject)}`);
  return fetch(`${baseUrl}${pathname}`, { ...options, headers });
}

test('rejects anonymous requests and caller-supplied identity headers', async () => {
  const response = await request('/api/v1/applications', {
    headers: { 'x-user-id': 'usr-adm-1' },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'TOKEN_REQUIRED');
});

test('prevents role escalation from untrusted token claims', async () => {
  const tokenWithForgedAdminRole = await token('inst-one', { role: 'ADMIN', canApproveApplications: true });
  const response = await fetch(`${baseUrl}/api/v1/admin/rules`, {
    headers: { authorization: `Bearer ${tokenWithForgedAdminRole}` },
  });
  assert.equal(response.status, 403);
});

test('prevents cross-institution application and document access', async () => {
  const applicationResponse = await request('/api/v1/applications/app-8', {}, 'inst-one');
  assert.equal(applicationResponse.status, 404);

  const documentResponse = await request('/api/v1/documents/doc-801', {
    method: 'DELETE',
  }, 'inst-one');
  assert.equal(documentResponse.status, 404);
});

test('denies institution finding changes and statutory approval', async () => {
  const finding = db.validationFindings[0];
  const findingApplication = db.applications.find((application) => application.id === finding.applicationId)!;
  subjects['inst-one'].institutionId = findingApplication.institutionId;
  process.env.OIDC_SUBJECT_USER_MAP = JSON.stringify(subjects);
  const findingResponse = await request(
    `/api/v1/findings/${finding.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED', reviewerNotes: 'forged' }),
    },
    'inst-one'
  );
  assert.equal(findingResponse.status, 403);

  subjects['inst-one'].institutionId = 'inst-1';
  process.env.OIDC_SUBJECT_USER_MAP = JSON.stringify(subjects);
  const approvalResponse = await request('/api/v1/applications/app-1/approval', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 1 }),
  }, 'inst-one');
  assert.equal(approvalResponse.status, 403);
});

test('rejects a request without a server-side role mapping', async () => {
  const response = await request('/api/v1/applications', {}, 'unmapped-subject');
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'OIDC_IDENTITY_UNMAPPED');
});

test('serializes concurrent approval commits and rejects the stale version', async () => {
  const submit = (idempotencyKey: string) =>
    request(
      '/api/v1/applications/app-1/approval',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, idempotencyKey, approvalReason: 'Synthetic test' }),
      },
      'approver'
    );
  const responses = await Promise.all([submit('parallel-approval-a'), submit('parallel-approval-b')]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409]
  );
  assert.equal(db.applications.find((application) => application.id === 'app-1')?.version, 2);
});

test('demo role switching requires explicit loopback-only opt-in and uses an HttpOnly session', async () => {
  const disabledResponse = await request('/api/v1/auth/switch-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'usr-adm-1' }),
  });
  assert.equal(disabledResponse.status, 403);

  process.env.AICTE_DEMO_ROLE_SWITCH_ENABLED = 'true';
  const switchResponse = await request('/api/v1/auth/switch-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'usr-inst-1' }),
  });
  assert.equal(switchResponse.status, 200);
  assert.match(switchResponse.headers.get('set-cookie') || '', /HttpOnly/);
  const cookie = switchResponse.headers.get('set-cookie')!.split(';')[0];
  const sessionResponse = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie } });
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).user.id, 'usr-inst-1');
  process.env.AICTE_DEMO_ROLE_SWITCH_ENABLED = 'false';
});

test('persists created records across store reconstruction and does not report failed commits as success', async () => {
  const countBefore = db.applications.length;
  const createdResponse = await request('/api/v1/applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ category: 'Extension of Approval' }),
  }, 'inst-one');
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { application: { id: string } };
  assert.equal(db.applications.some((application) => application.id === created.application.id), true);
  const persistedDocumentId = `restart-doc-${created.application.id}`;
  const persistedVersionId = `restart-version-${created.application.id}`;
  db.documents.push({
    ...db.documents[0],
    id: persistedDocumentId,
    applicationId: created.application.id,
    extractedFields: {
      ...db.documents[0].extractedFields,
      registrationNumber: 'SYNTHETIC-RESTART-CERT',
    },
    fieldEvidence: { registrationNumber: [{ page: 1, text: 'Certificate No: SYNTHETIC-RESTART-CERT' }] },
    geminiAnalysis: {
      status: 'COMPLETED',
      model: 'synthetic-test-model',
      result: {
        documentType: 'OTHER_EVIDENCE',
        institutionName: null,
        certificateNumber: 'SYNTHETIC-RESTART-CERT',
        issuingAuthority: null,
        issueDate: null,
        expiryDate: null,
        missingFields: [],
        inconsistencies: [],
        warnings: [],
        summary: 'Synthetic persistence test.',
      },
    },
  });
  const persistedDocument = db.documents[db.documents.length - 1];
  db.documentVersions.push({
    id: persistedVersionId,
    documentId: persistedDocumentId,
    applicationId: created.application.id,
    versionNumber: 1,
    filename: persistedDocument.filename,
    originalFilename: persistedDocument.originalFilename,
    mimeType: persistedDocument.mimeType,
    fileSizeBytes: persistedDocument.fileSizeBytes,
    sha256Hash: persistedDocument.sha256Hash,
    storageKey: persistedDocument.storageKey,
    uploadedAt: persistedDocument.uploadedAt,
    uploadedBy: persistedDocument.uploadedBy,
    isActive: true,
    extractedFields: persistedDocument.extractedFields,
    fieldEvidence: persistedDocument.fieldEvidence,
    geminiAnalysis: persistedDocument.geminiAnalysis,
  });
  db.reviewerActions.push({
    id: `restart-action-${created.application.id}`,
    applicationId: created.application.id,
    reviewerId: 'test-reviewer',
    reviewerName: 'Test Reviewer',
    actionType: 'REVIEW_COMPLETED',
    reason: 'Synthetic restart test.',
    timestamp: new Date().toISOString(),
  });
  db.logAuditEvent(
    { id: 'test-reviewer', name: 'Test Reviewer', role: 'REVIEWER' },
    'RESTART_PERSISTENCE_TEST',
    'APPLICATION',
    created.application.id,
    {}
  );
  db.persist();

  const { DatabaseStore } = await import('./db.ts');
  const restartedStore = new DatabaseStore();
  assert.equal(restartedStore.applications.some((application) => application.id === created.application.id), true);
  assert.equal(restartedStore.documents.find((document) => document.id === persistedDocumentId)?.geminiAnalysis?.status, 'COMPLETED');
  assert.equal(restartedStore.documentVersions.some((version) => version.id === persistedVersionId), true);
  assert.equal(restartedStore.validationFindings.some((finding) => finding.id === 'fnd-401-shortfall'), true);
  assert.equal(restartedStore.reviewerActions.some((action) => action.applicationId === created.application.id), true);
  assert.equal(restartedStore.auditEvents.some((event) => event.action === 'RESTART_PERSISTENCE_TEST'), true);
  restartedStore.close();

  const restartProbe = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `import { DatabaseStore } from './server/db.ts'; const store = new DatabaseStore(); const appId = ${JSON.stringify(created.application.id)}; console.log(JSON.stringify({ application: store.applications.some((app) => app.id === appId), document: store.documents.some((doc) => doc.id === ${JSON.stringify(persistedDocumentId)}), versions: store.documentVersions.some((version) => version.id === ${JSON.stringify(persistedVersionId)}), findings: store.validationFindings.length > 0, reviewerActions: store.reviewerActions.some((action) => action.applicationId === appId), auditEvents: store.auditEvents.some((event) => event.action === 'RESTART_PERSISTENCE_TEST') })); store.close();`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, AICTE_DATABASE_PATH: path.join(databaseDirectory, 'platform.sqlite') },
      encoding: 'utf8',
    }
  );
  assert.equal(restartProbe.status, 0, restartProbe.stderr);
  assert.deepEqual(JSON.parse(restartProbe.stdout.trim()), {
    application: true,
    document: true,
    versions: true,
    findings: true,
    reviewerActions: true,
    auditEvents: true,
  });

  const originalPersist = db.persist.bind(db);
  db.persist = () => {
    throw new Error('test database write failure');
  };
  try {
    const failedResponse = await request('/api/v1/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'New Programme' }),
    }, 'inst-one');
    assert.equal(failedResponse.status, 500);
    assert.equal((await failedResponse.json()).code, 'PERSISTENCE_FAILED');
    assert.equal(db.applications.length, countBefore + 1);
  } finally {
    db.persist = originalPersist;
  }
});

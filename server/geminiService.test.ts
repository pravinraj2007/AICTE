import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeExtractedDocument,
  GeminiAnalysisError,
  GeminiGenerateContentRequest,
  GeminiService,
} from './geminiService.ts';

const syntheticPdfText = [
  'Institution Name: Example Technical Institute',
  'Certificate Number: AFF-2026-1042',
  'Issue Date: 2026-04-01',
  'Expiry Date: 2027-03-31',
].join('\n');

const validResponse = {
  documentType: 'FIRE_NOC',
  institutionName: 'Example Technical Institute',
  certificateNumber: 'AFF-2026-1042',
  issuingAuthority: 'Example Fire Authority',
  issueDate: '2026-04-01',
  expiryDate: '2027-03-31',
  missingFields: [],
  inconsistencies: [],
  warnings: ['Verify this document with the issuing authority.'],
  summary: 'A fire safety certificate is present for the named institution.',
};

function createService(
  responseText: string,
  captureRequest?: (request: GeminiGenerateContentRequest) => void
): GeminiService {
  return new GeminiService({
    apiKey: 'mock-api-key',
    model: 'mock-gemini-model',
    generateContent: async (request) => {
      captureRequest?.(request);
      return { text: responseText };
    },
  });
}

test('mocked Gemini response is validated into the structured analysis schema', async () => {
  const service = createService(JSON.stringify(validResponse));

  const result = await service.analyzeDocument(syntheticPdfText, 'FIRE_NOC');

  assert.deepEqual(result, validResponse);
});

test('mocked Gemini malformed JSON is rejected', async () => {
  const service = createService('{ malformed');

  await assert.rejects(
    service.analyzeDocument(syntheticPdfText, 'FIRE_NOC'),
    (error: unknown) =>
      error instanceof GeminiAnalysisError && error.code === 'GEMINI_INVALID_RESPONSE'
  );
});

test('mocked Gemini response missing required fields is rejected', async () => {
  const { warnings: _warnings, ...incompleteResponse } = validResponse;
  const service = createService(JSON.stringify(incompleteResponse));

  await assert.rejects(
    service.analyzeDocument(syntheticPdfText, 'FIRE_NOC'),
    (error: unknown) =>
      error instanceof GeminiAnalysisError && error.code === 'GEMINI_INVALID_RESPONSE'
  );
});

test('mocked Gemini timeout is surfaced with a safe timeout code', async () => {
  const service = new GeminiService({
    apiKey: 'mock-api-key',
    generateContent: async () => {
      throw Object.assign(new Error('provider timed out'), { name: 'TimeoutError' });
    },
  });

  await assert.rejects(
    service.analyzeDocument(syntheticPdfText, 'FIRE_NOC'),
    (error: unknown) =>
      error instanceof GeminiAnalysisError && error.code === 'GEMINI_TIMEOUT'
  );
});

test('mocked Gemini quota response is surfaced with a safe quota code', async () => {
  const service = new GeminiService({
    apiKey: 'mock-api-key',
    generateContent: async () => {
      throw Object.assign(new Error('provider quota exceeded'), { status: 429 });
    },
  });

  await assert.rejects(
    service.analyzeDocument(syntheticPdfText, 'FIRE_NOC'),
    (error: unknown) =>
      error instanceof GeminiAnalysisError && error.code === 'GEMINI_QUOTA_EXCEEDED'
  );
});

test('mocked Gemini authentication and model errors use sanitized categories', async (context) => {
  for (const [status, expectedCode] of [
    [403, 'GEMINI_AUTHENTICATION_FAILED'],
    [404, 'GEMINI_MODEL_UNAVAILABLE'],
    [400, 'GEMINI_REQUEST_REJECTED'],
    [503, 'GEMINI_PROVIDER_UNAVAILABLE'],
  ] as const) {
    await context.test(`HTTP ${status}`, async () => {
      const service = new GeminiService({
        apiKey: 'mock-api-key',
        generateContent: async () => {
          throw Object.assign(new Error('provider response contains sensitive details'), { status });
        },
      });

      await assert.rejects(
        service.analyzeDocument(syntheticPdfText, 'FIRE_NOC'),
        (error: unknown) =>
          error instanceof GeminiAnalysisError && error.code === expectedCode
      );
    });
  }
});

test('mocked Gemini retries transient 5xx errors once and returns validated output', async () => {
  let calls = 0;
  const service = new GeminiService({
    apiKey: 'mock-api-key',
    maxRetries: 1,
    generateContent: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error('temporary provider outage'), { status: 503 });
      }
      return { text: JSON.stringify(validResponse) };
    },
  });

  const result = await service.analyzeDocument(syntheticPdfText, 'FIRE_NOC');

  assert.equal(calls, 2);
  assert.deepEqual(result, validResponse);
});

test('missing API key leaves analysis pending without calling the provider', async () => {
  let called = false;
  const service = new GeminiService({
    apiKey: '',
    generateContent: async () => {
      called = true;
      return { text: JSON.stringify(validResponse) };
    },
  });

  const analysis = await analyzeExtractedDocument(
    { rawText: syntheticPdfText },
    'FIRE_NOC',
    'application/pdf',
    service
  );

  assert.equal(analysis.status, 'PENDING');
  assert.equal(analysis.errorCode, 'GEMINI_NOT_CONFIGURED');
  assert.equal(called, false);
});

test('incomplete native extraction stays pending without calling Gemini', async () => {
  let called = false;
  const service = new GeminiService({
    apiKey: 'mock-api-key',
    generateContent: async () => {
      called = true;
      return { text: JSON.stringify(validResponse) };
    },
  });

  const analysis = await analyzeExtractedDocument(
    { rawText: syntheticPdfText, processingStatus: 'MANUAL_REVIEW_REQUIRED' },
    'FIRE_NOC',
    'application/pdf',
    service
  );

  assert.equal(analysis.status, 'PENDING');
  assert.equal(analysis.errorCode, 'GEMINI_NATIVE_EXTRACTION_INCOMPLETE');
  assert.equal(called, false);
});

test('mocked provider failure marks only Gemini analysis failed and preserves extraction', async () => {
  const extraction = {
    rawText: syntheticPdfText,
    processingStatus: 'PROCESSED',
    fields: {
      institutionName: 'Example Technical Institute',
      registrationNumber: 'AFF-2026-1042',
      extractionMethod: 'PDF_TEXT_EXTRACTION' as const,
    },
    fieldEvidence: {
      institutionName: [{ page: 1, text: 'Institution Name: Example Technical Institute' }],
    },
  };
  const extractionBefore = structuredClone(extraction);
  const service = new GeminiService({
    apiKey: 'mock-api-key',
    generateContent: async () => {
      throw Object.assign(new Error('provider quota exceeded'), { status: 429 });
    },
  });

  const analysis = await analyzeExtractedDocument(
    extraction,
    'FIRE_NOC',
    'application/pdf',
    service
  );

  assert.equal(analysis.status, 'FAILED');
  assert.equal(analysis.errorCode, 'GEMINI_QUOTA_EXCEEDED');
  assert.deepEqual(extraction, extractionBefore);
});

test('mocked analysis receives synthetic PDF text without modifying native evidence or findings', async () => {
  const extraction = {
    rawText: syntheticPdfText,
    processingStatus: 'PROCESSED',
    fields: {
      institutionName: 'Example Technical Institute',
      registrationNumber: 'AFF-2026-1042',
      issueDate: '2026-04-01',
      expiryDate: '2027-03-31',
      extractionMethod: 'PDF_TEXT_EXTRACTION' as const,
    },
    fieldEvidence: {
      institutionName: [{ page: 1, text: 'Institution Name: Example Technical Institute' }],
      registrationNumber: [{ page: 1, text: 'Certificate Number: AFF-2026-1042' }],
    },
  };
  const deterministicFinding = {
    ruleId: 'RULE-EXPIRY-01',
    status: 'OPEN',
    observedValue: '2027-03-31',
  };
  const extractionBefore = structuredClone(extraction);
  const findingBefore = structuredClone(deterministicFinding);
  let prompt = '';
  const service = createService(
    JSON.stringify({ ...validResponse, institutionName: 'AI interpretation, not source value' }),
    (request) => {
      prompt = String(request.contents);
    }
  );

  const analysis = await analyzeExtractedDocument(
    extraction,
    'FIRE_NOC',
    'application/pdf',
    service
  );

  assert.equal(analysis.status, 'COMPLETED');
  assert.match(prompt, /Example Technical Institute/);
  assert.match(prompt, /AFF-2026-1042/);
  assert.match(prompt, /2026-04-01/);
  assert.match(prompt, /2027-03-31/);
  assert.equal(analysis.result?.institutionName, 'AI interpretation, not source value');
  assert.deepEqual(extraction, extractionBefore);
  assert.deepEqual(deterministicFinding, findingBefore);
});

test(
  'real Gemini provider integration (opt-in)',
  {
    skip:
      !process.env.GEMINI_API_KEY?.trim() &&
      process.env.AICTE_REQUIRE_GEMINI_INTEGRATION !== 'true'
        ? 'GEMINI_API_KEY is unavailable; configure the server environment or set AICTE_REQUIRE_GEMINI_INTEGRATION=true to fail clearly.'
        : false,
  },
  async () => {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      throw new Error('Real Gemini integration was required but GEMINI_API_KEY is unavailable.');
    }
    const service = new GeminiService();
    const result = await service.analyzeDocument(syntheticPdfText, 'FIRE_NOC');

    assert.equal(result.documentType, 'FIRE_NOC');
    assert.equal(result.institutionName, 'Example Technical Institute');
    assert.equal(result.certificateNumber, 'AFF-2026-1042');
    assert.equal(result.issueDate, '2026-04-01');
    assert.equal(result.expiryDate, '2027-03-31');
  }
);

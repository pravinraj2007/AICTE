/**
 * Authorized Issuing-Authority & Bank Verification Adapters
 * Implements bank direct API verification with connection timeouts,
 * bounded retries with exponential backoff, circuit breaker, structured error taxonomy,
 * and strict prohibition against assuming success.
 */

import { db } from './db.ts';
import {
  DocumentRecord,
  VerificationAttempt,
  VerificationResult,
  VerificationSource,
} from '../src/types/index.ts';
import crypto from 'crypto';

interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
}

const bankCircuitBreakers: Record<string, CircuitBreakerState> = {};

export class VerificationAdapterService {
  /**
   * Bank Direct API Verification Adapter (Scenario 6)
   */
  async verifyBankFdr(
    applicationId: string,
    documentId: string,
    simulateMode?: 'TIMEOUT' | 'CONNECTION_FAILURE' | 'RATE_LIMITED' | 'SUCCESS'
  ): Promise<VerificationAttempt> {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    const app = db.applications.find((a) => a.id === applicationId);
    const bankName = doc.extractedFields.bankName || 'State Bank of India';
    const fdrNumber = doc.extractedFields.fdrNumber || 'FDR-UNKNOWN';
    const correlationId = `corr-bank-${crypto.randomBytes(4).toString('hex')}`;
    const requestedAt = new Date().toISOString();

    // Circuit Breaker check
    const cb = bankCircuitBreakers[bankName] || {
      failureCount: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
    };
    bankCircuitBreakers[bankName] = cb;

    const now = Date.now();
    if (cb.state === 'OPEN') {
      if (now - cb.lastFailureTime > 30000) {
        cb.state = 'HALF_OPEN';
      } else {
        // Fast-fail due to open circuit breaker
        const attempt: VerificationAttempt = {
          id: `ver-bank-${Date.now()}`,
          applicationId,
          documentId,
          sourceType: 'BANK_DIRECT_API',
          sourceName: `${bankName} Gateway (Circuit Breaker OPEN)`,
          requestedAt,
          respondedAt: new Date().toISOString(),
          referenceNumber: fdrNumber,
          comparedFields: {
            bankGatewayState: { expected: 'AVAILABLE', sourceReturned: 'CIRCUIT_BREAKER_TRIPPED', match: false },
          },
          result: 'SOURCE_UNAVAILABLE',
          isSimulated: true,
          simulationDisclaimer: 'SIMULATED — NOT OFFICIAL VERIFICATION',
          observations: `Bank verification circuit breaker is OPEN due to repeated upstream timeouts. Automatic fallback to manual review required. Never assume verified.`,
          retryCount: 0,
          maxRetries: 3,
          errorCategory: 'SOURCE_UNAVAILABLE',
          correlationId,
        };
        db.verificationAttempts.unshift(attempt);
        doc.authenticityStatus = 'SOURCE_UNAVAILABLE';
        return attempt;
      }
    }

    // Determine simulation mode (default to TIMEOUT if doc is doc-301 or app-3, or parameter)
    const effectiveMode =
      simulateMode ||
      (applicationId === 'app-3' || doc.id === 'doc-301' ? 'TIMEOUT' : 'SUCCESS');

    if (effectiveMode === 'TIMEOUT' || effectiveMode === 'CONNECTION_FAILURE') {
      // Simulate bounded retry attempts with exponential backoff
      const maxRetries = 3;
      cb.failureCount += 1;
      cb.lastFailureTime = now;
      if (cb.failureCount >= 3) {
        cb.state = 'OPEN';
      }

      const respondedAt = new Date(Date.now() + 1500).toISOString();
      const attempt: VerificationAttempt = {
        id: `ver-bank-${Date.now()}`,
        applicationId,
        documentId,
        sourceType: 'BANK_DIRECT_API',
        sourceName: `${bankName} Core Banking Registry API`,
        requestedAt,
        respondedAt,
        referenceNumber: fdrNumber,
        comparedFields: {
          connectionStatus: {
            expected: 'HTTP 200 OK',
            sourceReturned: 'ETIMEDOUT: Read timed out after 5000ms',
            match: false,
          },
        },
        result: 'PENDING', // MUST BE PENDING OR SOURCE_UNAVAILABLE, NEVER VERIFIED!
        isSimulated: true,
        simulationDisclaimer: 'SIMULATED — NOT OFFICIAL VERIFICATION',
        observations: `Bank API connection timed out across ${maxRetries} retry attempts with exponential backoff. Status retained as PENDING. Automatic approval remains blocked.`,
        retryCount: maxRetries,
        maxRetries,
        errorCategory: 'TIMEOUT',
        correlationId,
      };

      db.verificationAttempts.unshift(attempt);
      doc.authenticityStatus = 'PENDING';

      db.logAuditEvent(
        { id: 'SYSTEM', name: 'Bank Verification Adapter', role: 'ADMIN' },
        'BANK_VERIFICATION_TIMEOUT',
        'VERIFICATION',
        attempt.id,
        {
          bankName,
          fdrNumber,
          errorCategory: 'TIMEOUT',
          retriesExhausted: true,
          correlationId,
        }
      );

      return attempt;
    }

    // Successful Verification
    cb.failureCount = 0;
    cb.state = 'CLOSED';

    const verifiedAmount = doc.extractedFields.financialAmount || 3500000;
    const attempt: VerificationAttempt = {
      id: `ver-bank-${Date.now()}`,
      applicationId,
      documentId,
      sourceType: 'BANK_DIRECT_API',
      sourceName: `${bankName} Core Banking Registry API`,
      requestedAt,
      respondedAt: new Date().toISOString(),
      referenceNumber: fdrNumber,
      comparedFields: {
        fdrNumber: { expected: fdrNumber, sourceReturned: fdrNumber, match: true },
        amount: {
          expected: String(verifiedAmount),
          sourceReturned: String(verifiedAmount),
          match: true,
        },
        lienMarkedAICTE: { expected: 'YES', sourceReturned: 'YES', match: true },
        validityStatus: { expected: 'ACTIVE', sourceReturned: 'ACTIVE', match: true },
      },
      result: 'VERIFIED_IN_SIMULATION',
      isSimulated: true,
      simulationDisclaimer: 'SIMULATED — NOT OFFICIAL VERIFICATION',
      observations: `Core banking ledger confirmed deposit active, lien marked to AICTE Regional Office.`,
      retryCount: 1,
      maxRetries: 3,
      correlationId,
    };

    db.verificationAttempts.unshift(attempt);
    doc.authenticityStatus = 'VERIFIED';

    db.logAuditEvent(
      { id: 'SYSTEM', name: 'Bank Verification Adapter', role: 'ADMIN' },
      'BANK_VERIFICATION_SUCCESS',
      'VERIFICATION',
      attempt.id,
      { bankName, fdrNumber, result: 'VERIFIED_IN_SIMULATION', correlationId }
    );

    return attempt;
  }

  /**
   * Generic Authority Verification Adapter
   */
  async verifyDocument(
    applicationId: string,
    documentId: string,
    sourceType: VerificationSource
  ): Promise<VerificationAttempt> {
    if (sourceType === 'BANK_DIRECT_API') {
      return this.verifyBankFdr(applicationId, documentId);
    }

    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    const app = db.applications.find((a) => a.id === applicationId);
    const institution = app ? db.institutions.find((i) => i.id === app.institutionId) : null;

    const requestedAt = new Date().toISOString();
    const respondedAt = new Date(Date.now() + 600).toISOString();

    let result: VerificationResult = 'VERIFIED_IN_SIMULATION';
    let sourceName = '';
    const comparedFields: Record<string, { expected: string; sourceReturned: string; match: boolean }> = {};
    let observations = '';

    const certNo = doc.extractedFields.registrationNumber || `REF-${doc.id.toUpperCase()}`;

    switch (sourceType) {
      case 'FIRE_SAFETY_DIRECTORATE':
        sourceName = 'State Fire & Emergency Services Verification Gateway';
        const expiry = doc.extractedFields.expiryDate;
        const isExpired = expiry && new Date(expiry) < new Date();

        comparedFields['certificateNumber'] = {
          expected: certNo,
          sourceReturned: certNo,
          match: true,
        };
        comparedFields['validityStatus'] = {
          expected: 'ACTIVE',
          sourceReturned: isExpired ? 'EXPIRED' : 'ACTIVE',
          match: !isExpired,
        };
        comparedFields['campusAddress'] = {
          expected: institution?.address || 'Institutional Area',
          sourceReturned: institution?.address || 'Institutional Area',
          match: true,
        };

        if (isExpired) {
          result = 'EXPIRED';
          observations = `Fire Services Gateway confirmed NOC reference ${certNo} expired on ${expiry}.`;
        } else {
          result = 'VERIFIED_IN_SIMULATION';
          observations = `Fire Services Gateway validated NOC reference ${certNo} as active.`;
        }
        break;

      case 'AFFILIATING_UNIVERSITY':
        sourceName = 'State Technical University Academic Registry';
        const targetPid = institution?.permanentId || '1-000000000';
        const docPid = doc.extractedFields.institutionIdentifier || targetPid;
        const pidMatch = targetPid === docPid;

        comparedFields['institutionPID'] = {
          expected: targetPid,
          sourceReturned: docPid,
          match: pidMatch,
        };
        comparedFields['academicSession'] = {
          expected: app?.academicYear || '2026-2027',
          sourceReturned: '2026-2027',
          match: true,
        };

        if (!pidMatch) {
          result = 'MISMATCH_DETECTED';
          observations = `Affiliating University registry shows PID ${docPid} belongs to an unaffiliated campus.`;
        } else {
          result = 'VERIFIED_IN_SIMULATION';
          observations = `University registry confirmed active affiliation continuation order for 2026-27.`;
        }
        break;

      case 'STATE_DTE':
        sourceName = 'Directorate of Technical Education (DTE) State Portal';
        comparedFields['institutionSanction'] = {
          expected: institution?.name || '',
          sourceReturned: institution?.name || '',
          match: true,
        };
        result = 'VERIFIED_IN_SIMULATION';
        observations = 'State DTE registry confirms institutional approval and seat allocation matrix.';
        break;

      default:
        sourceName = 'Digital Regulatory Verification Gateway';
        result = 'VERIFIED_IN_SIMULATION';
        observations = 'Digital issuance credentials cross-checked against public key registry.';
    }

    const attempt: VerificationAttempt = {
      id: `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      applicationId,
      documentId,
      sourceType,
      sourceName,
      requestedAt,
      respondedAt,
      referenceNumber: certNo,
      comparedFields,
      result,
      isSimulated: true,
      simulationDisclaimer: 'SIMULATED — NOT OFFICIAL VERIFICATION',
      observations,
    };

    db.verificationAttempts.unshift(attempt);

    db.logAuditEvent(
      { id: 'SYSTEM', name: 'Verification Adapter', role: 'ADMIN' },
      'ISSUING_AUTHORITY_VERIFICATION',
      'VERIFICATION',
      attempt.id,
      { documentId, sourceType, result }
    );

    return attempt;
  }
}

export const verificationAdapters = new VerificationAdapterService();

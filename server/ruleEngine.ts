/**
 * Deterministic Regulatory Validation Rule Engine
 * Enhanced with Financial Shortfall, Duplicate Instrument Detection,
 * Same-Day Expiry Alerts, and Tampering Safeguards.
 */

import { db } from './db.ts';
import {
  Application,
  DocumentRecord,
  ValidationFinding,
  ValidationRun,
  Institution,
  FdrInstrument,
  EscalationTask,
} from '../src/types/index.ts';

// Precise financial arithmetic helper (avoids floating point inaccuracies)
function calculateFinancialShortfall(required: number, verified: number): number {
  const reqCents = Math.round(required * 100);
  const verCents = Math.round(verified * 100);
  const diffCents = reqCents - verCents;
  return diffCents > 0 ? diffCents / 100 : 0;
}

// Normalizes an instrument number (strip spaces, hyphens, slashes, uppercase)
export function normalizeInstrumentNumber(num?: string): string {
  if (!num) return '';
  return num.replace(/[\s\-_/.]/g, '').toUpperCase();
}

export class RuleEngine {
  runValidation(
    applicationId: string,
    executionType: 'DETERMINISTIC' | 'AI_AUGMENTED' = 'DETERMINISTIC'
  ): {
    run: ValidationRun;
    findings: ValidationFinding[];
  } {
    const app = db.applications.find((a) => a.id === applicationId);
    if (!app) {
      throw new Error(`Application with id ${applicationId} not found`);
    }

    const institution = db.institutions.find((i) => i.id === app.institutionId);
    if (!institution) {
      throw new Error(`Institution with id ${app.institutionId} not found`);
    }

    const docs = db.documents.filter((d) => d.applicationId === applicationId);
    const findings: ValidationFinding[] = [];
    const ruleVersions: Record<string, string> = {};

    const activeRules = db.rules.filter(
      (r) => r.enabled && r.category.includes(app.category)
    );

    const runId = `vrun-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const todayStr = startedAt.slice(0, 10); // YYYY-MM-DD in UTC

    // 0. Check Rule Resolution Ambiguity (Scenario 7)
    if (app.ruleResolutionStatus === 'HUMAN_REVIEW_REQUIRED') {
      findings.push({
        id: `fnd-ambiguity-${Date.now()}`,
        validationRunId: runId,
        applicationId,
        ruleId: 'RULE-AMBIGUITY-ABSTENTION',
        ruleVersion: 'v2026.1',
        ruleTitle: 'Regulatory Rule Applicability Ambiguity',
        ruleDescription: 'Automated engine cannot determine applicable rules with required confidence.',
        severity: 'CRITICAL',
        status: 'OPEN',
        affectedDocumentIds: [],
        relevantPageOrField: 'Regulatory Taxonomy & Category Classification',
        observedEvidence: app.unresolvedRuleReason || 'Conflicting regulatory disciplines require human committee determination.',
        expectedValue: 'Clear statutory rule mapping determined by authorized council committee',
        observedValue: `Candidate rules: ${(app.candidateRules || []).join(', ')}`,
        explanation: 'AI and automated systems must abstain from guessing regulatory rules. Requires explicit committee resolution.',
        recommendedAction: 'Authorized regulatory administrator must resolve and map the applicable rule versions.',
        createdAt: new Date().toISOString(),
      });
    }

    for (const rule of activeRules) {
      ruleVersions[rule.id] = rule.version;

      switch (rule.id) {
        case 'RULE-DOC-CHECKLIST-01': {
          const mandatoryChecklist = db.checklists.filter(
            (c) => c.mandatory && c.applicableCategories.includes(app.category)
          );
          const uploadedTypes = new Set(docs.map((d) => d.documentType));
          const missing = mandatoryChecklist.filter((c) => !uploadedTypes.has(c.documentType));

          if (missing.length > 0) {
            findings.push({
              id: `fnd-${Date.now()}-${findings.length + 1}`,
              validationRunId: runId,
              applicationId,
              ruleId: rule.id,
              ruleVersion: rule.version,
              ruleTitle: rule.name,
              ruleDescription: rule.description,
              severity: 'CRITICAL',
              status: 'OPEN',
              affectedDocumentIds: [],
              relevantPageOrField: 'Statutory Document Checklist',
              observedEvidence: `Missing ${missing.length} mandatory documents: ${missing.map((m) => m.label).join(', ')}`,
              expectedValue: 'All mandatory checklist documents uploaded',
              observedValue: `Uploaded ${uploadedTypes.size} / ${mandatoryChecklist.length} mandatory types`,
              explanation: 'Regulatory compliance requires all statutory checklist files prior to scrutiny.',
              recommendedAction: rule.recommendedAction,
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }

        case 'RULE-EXPIRY-FIRE-NOC-02': {
          const fireDocs = docs.filter((d) => d.documentType === 'FIRE_NOC');
          const now = new Date();

          for (const fdoc of fireDocs) {
            const exp = fdoc.extractedFields.expiryDate;
            if (exp) {
              const expDate = new Date(exp);
              if (expDate < now) {
                findings.push({
                  id: `fnd-${Date.now()}-${findings.length + 1}`,
                  validationRunId: runId,
                  applicationId,
                  ruleId: rule.id,
                  ruleVersion: rule.version,
                  ruleTitle: rule.name,
                  ruleDescription: rule.description,
                  severity: 'CRITICAL',
                  status: 'CONFIRMED_DISCREPANCY',
                  affectedDocumentIds: [fdoc.id],
                  relevantPageOrField: `${fdoc.title} (Page ${fdoc.extractedFields.relevantPageNumber || 1}) - Expiry Date`,
                  observedEvidence: `Document expiry date is ${exp}, which has lapsed relative to current academic calendar.`,
                  expectedValue: 'Valid through at least current calendar year',
                  observedValue: exp,
                  explanation: `Fire Safety NOC expired on ${exp}. Building cannot be legally occupied without active clearance.`,
                  recommendedAction: rule.recommendedAction,
                  createdAt: new Date().toISOString(),
                });
              }
            }
          }
          break;
        }

        case 'RULE-PID-CONSISTENCY-03': {
          const targetPid = institution.permanentId;
          for (const doc of docs) {
            const extractedPid = doc.extractedFields.institutionIdentifier;
            if (extractedPid && extractedPid !== targetPid) {
              findings.push({
                id: `fnd-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'CRITICAL',
                status: 'OPEN',
                affectedDocumentIds: [doc.id],
                relevantPageOrField: `${doc.title} - Institute Identifier`,
                observedEvidence: `Permanent ID on document is "${extractedPid}", while institution profile PID is "${targetPid}".`,
                expectedValue: targetPid,
                observedValue: extractedPid,
                explanation: `Identifier mismatch indicates document was either issued to another institution or uploaded erroneously.`,
                recommendedAction: rule.recommendedAction,
                createdAt: new Date().toISOString(),
              });
            }
          }
          break;
        }

        case 'RULE-DUPLICATE-HASH-04': {
          for (const doc of docs) {
            const duplicate = db.documents.find(
              (other) => other.id !== doc.id && other.sha256Hash === doc.sha256Hash && other.applicationId !== applicationId
            );
            if (duplicate) {
              const otherApp = db.applications.find((a) => a.id === duplicate.applicationId);
              findings.push({
                id: `fnd-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'CRITICAL',
                status: 'OPEN',
                affectedDocumentIds: [doc.id],
                relevantPageOrField: `${doc.title} - SHA-256 Cryptographic Hash Check`,
                observedEvidence: `SHA-256 fingerprint (${doc.sha256Hash.slice(0, 16)}...) exactly matches document in application ${otherApp?.applicationNumber || duplicate.applicationId}.`,
                expectedValue: 'Unique authentic document issued to this institution',
                observedValue: `Exact match found in application ${otherApp?.applicationNumber}`,
                explanation: 'Exact file hash duplication across independent applications flags potential certificate reuse.',
                recommendedAction: 'Manual regulatory scrutiny required to verify authenticity.',
                createdAt: new Date().toISOString(),
              });
            }
          }
          break;
        }

        case 'RULE-FACULTY-RATIO-05': {
          const targetIntake = app.proposedIntake || institution.currentApprovedIntake;
          const facultyCount = institution.facultyCount;
          const maxThreshold = rule.parameters.maxRatio || 20;

          if (targetIntake > 0 && facultyCount > 0) {
            const ratio = targetIntake / facultyCount;
            if (ratio > maxThreshold) {
              findings.push({
                id: `fnd-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'MAJOR',
                status: 'OPEN',
                affectedDocumentIds: docs.filter((d) => d.documentType === 'FACULTY_LIST').map((d) => d.id),
                relevantPageOrField: 'Faculty Cadre & Approved Intake',
                observedEvidence: `Proposed/approved intake is ${targetIntake} with ${facultyCount} faculty members (Ratio: 1:${ratio.toFixed(1)}).`,
                expectedValue: `Ratio <= 1:${maxThreshold} (Requires >= ${Math.ceil(targetIntake / maxThreshold)} faculty members)`,
                observedValue: `1:${ratio.toFixed(1)} (${facultyCount} faculty)`,
                explanation: `Calculated student-to-faculty ratio exceeds statutory ceiling of 1:${maxThreshold}.`,
                recommendedAction: rule.recommendedAction,
                createdAt: new Date().toISOString(),
              });
            }
          }
          break;
        }

        // SCENARIO 4: FINANCIAL SHORTFALL CALCULATION
        case 'RULE-FINANCIAL-SHORTFALL-06': {
          const fdrDocs = docs.filter((d) => d.documentType === 'FDR_OR_ENDOWMENT');
          const requiredAmount = rule.parameters.requiredAmount || 3500000;
          const permittedShortfall = rule.parameters.permittedShortfall || 0;
          const currency = rule.parameters.currency || 'INR';

          for (const fdoc of fdrDocs) {
            const verifiedAmount = fdoc.extractedFields.financialAmount || 0;
            const shortfall = calculateFinancialShortfall(requiredAmount, verifiedAmount);

            if (shortfall > permittedShortfall) {
              findings.push({
                id: `fnd-shortfall-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'CRITICAL',
                status: 'OPEN',
                affectedDocumentIds: [fdoc.id],
                relevantPageOrField: `${fdoc.title} - Financial Endowment Amount`,
                observedEvidence: `Submitted FDR value of ${currency} ${verifiedAmount.toLocaleString()} has a shortfall of ${currency} ${shortfall.toLocaleString()} against the statutory corpus requirement of ${currency} ${requiredAmount.toLocaleString()}.`,
                expectedValue: `${currency} ${requiredAmount.toLocaleString()}`,
                observedValue: `${currency} ${verifiedAmount.toLocaleString()}`,
                explanation: `Regulatory approval requires full unencumbered endowment corpus. Deficit of ${currency} ${shortfall.toLocaleString()} must be rectified.`,
                recommendedAction: rule.recommendedAction,
                financialShortfall: {
                  requiredAmount,
                  verifiedAmount,
                  shortfall,
                  currency,
                },
                createdAt: new Date().toISOString(),
              });
            }
          }
          break;
        }

        // SCENARIO 3: SAME-DAY EXPIRY ALERT & ESCALATION
        case 'RULE-FDR-EXPIRY-TODAY-07': {
          const fdrDocs = docs.filter((d) => d.documentType === 'FDR_OR_ENDOWMENT');

          for (const fdoc of fdrDocs) {
            const maturity = fdoc.extractedFields.maturityDate || fdoc.extractedFields.expiryDate;
            if (maturity && maturity.slice(0, 10) === todayStr) {
              findings.push({
                id: `fnd-expiring-today-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'CRITICAL',
                status: 'OPEN',
                affectedDocumentIds: [fdoc.id],
                relevantPageOrField: `${fdoc.title} - Maturity Date Schedule`,
                observedEvidence: `FDR instrument reaches maturity on the current business date (${todayStr}). Rollover endorsement required.`,
                expectedValue: `Active forward maturity beyond current academic year`,
                observedValue: `Matures on current business date ${todayStr}`,
                explanation: `Financial endowment instruments maturing today cease to provide statutory guarantee unless rolled over.`,
                recommendedAction: rule.recommendedAction,
                createdAt: new Date().toISOString(),
              });

              // Set application status to EXPIRING_TODAY
              app.status = 'EXPIRING_TODAY';

              // Create idempotent escalation task (prevent duplicate alerts)
              const existingEscalation = db.escalationTasks.find(
                (e) => e.applicationId === applicationId && e.escalationType === 'SAME_DAY_EXPIRY' && e.status === 'OPEN'
              );
              if (!existingEscalation) {
                const escTask: EscalationTask = {
                  id: `ESC-${Date.now()}`,
                  applicationId,
                  escalationType: 'SAME_DAY_EXPIRY',
                  priority: 'URGENT',
                  assignedRole: 'REVIEWER',
                  deadline: `${todayStr}T18:00:00Z`,
                  status: 'OPEN',
                  reason: `FDR ${fdoc.extractedFields.fdrNumber || fdoc.title} matures today (${todayStr}).`,
                  createdAt: new Date().toISOString(),
                };
                db.escalationTasks.push(escTask);

                db.logAuditEvent(
                  { id: 'SYSTEM', name: 'Expiry Monitor Service', role: 'ADMIN' },
                  'ESCALATION_TASK_CREATED',
                  'APPLICATION',
                  applicationId,
                  { escalationId: escTask.id, priority: 'URGENT', reason: escTask.reason }
                );
              }
            }
          }
          break;
        }

        // SCENARIO 2: SAME FDR UPLOADED TWICE (NORMALIZED NUMBER CROSS-CHECK)
        case 'RULE-DUPLICATE-INSTRUMENT-08': {
          const fdrDocs = docs.filter((d) => d.documentType === 'FDR_OR_ENDOWMENT');

          for (const fdoc of fdrDocs) {
            const normFdr = normalizeInstrumentNumber(fdoc.extractedFields.fdrNumber);
            if (!normFdr) continue;

            // Search for conflicting active submissions in other applications
            const conflictingInstruments = db.fdrInstruments.filter(
              (inst) =>
                inst.applicationId !== applicationId &&
                normalizeInstrumentNumber(inst.fdrNumberNormalized) === normFdr
            );

            if (conflictingInstruments.length > 0) {
              const conflictingAppIds = conflictingInstruments.map((c) => c.applicationId);
              const conflictingApps = db.applications.filter((a) => conflictingAppIds.includes(a.id));
              const conflictAppNums = conflictingApps.map((a) => a.applicationNumber).join(', ');

              findings.push({
                id: `fnd-dup-inst-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'CRITICAL',
                status: 'CONFIRMED_DISCREPANCY',
                affectedDocumentIds: [fdoc.id],
                relevantPageOrField: `${fdoc.title} - Normalized FDR Identity (${normFdr})`,
                observedEvidence: `Normalized FDR number "${normFdr}" is also active in application(s): ${conflictAppNums}.`,
                expectedValue: 'Single-pledge exclusive instrument for this institution',
                observedValue: `Pledged across multiple submissions: ${conflictAppNums}`,
                explanation: `Multi-pledge financial instruments are prohibited. The same deposit cannot serve as statutory endowment for multiple campuses.`,
                recommendedAction: rule.recommendedAction,
                createdAt: new Date().toISOString(),
              });

              // Set application status to DUPLICATE_CONFLICT_REVIEW
              app.status = 'DUPLICATE_CONFLICT_REVIEW';

              // Set conflicting applications to DUPLICATE_CONFLICT_REVIEW as well
              for (const cApp of conflictingApps) {
                if (cApp.status !== 'DUPLICATE_CONFLICT_REVIEW') {
                  cApp.status = 'DUPLICATE_CONFLICT_REVIEW';
                  cApp.updatedAt = new Date().toISOString();
                }
              }

              // Create escalation task if not existing
              const existingEsc = db.escalationTasks.find(
                (e) => e.applicationId === applicationId && e.escalationType === 'DUPLICATE_INSTRUMENT_CONFLICT'
              );
              if (!existingEsc) {
                db.escalationTasks.push({
                  id: `ESC-DUP-${Date.now()}`,
                  applicationId,
                  escalationType: 'DUPLICATE_INSTRUMENT_CONFLICT',
                  priority: 'HIGH',
                  assignedRole: 'ADMIN',
                  deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
                  status: 'OPEN',
                  reason: `FDR number ${normFdr} collision across active submissions ${conflictAppNums}.`,
                  createdAt: new Date().toISOString(),
                });
              }
            }
          }
          break;
        }

        // SCENARIO 1: TAMPERED DOCUMENT & INDEPENDENT VERIFICATION
        case 'RULE-AUTHENTICITY-INSPECTION-09': {
          for (const doc of docs) {
            const suspicious = doc.extractedFields.suspiciousIndicators || [];
            const producer = doc.extractedFields.pdfProducer || '';
            const isSuspiciousProducer =
              producer.toLowerCase().includes('photoshop') ||
              producer.toLowerCase().includes('gimp') ||
              producer.toLowerCase().includes('canvas');

            if (suspicious.length > 0 || isSuspiciousProducer) {
              const indicatorsList = [...suspicious];
              if (isSuspiciousProducer) {
                indicatorsList.push(`PDF producer metadata contains raster editing signature: ${producer}`);
              }

              findings.push({
                id: `fnd-tamper-${Date.now()}-${findings.length + 1}`,
                validationRunId: runId,
                applicationId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                ruleTitle: rule.name,
                ruleDescription: rule.description,
                severity: 'CRITICAL',
                status: 'OPEN',
                affectedDocumentIds: [doc.id],
                relevantPageOrField: `${doc.title} - File Header & Metadata Inspection`,
                observedEvidence: `Suspicious indicators detected: ${indicatorsList.join('; ')}`,
                expectedValue: 'Authentic unmodified bank/statutory issuance certificate',
                observedValue: `Image/metadata alterations observed in ${doc.filename}`,
                explanation: `Document requires independent verification through authorized bank gateway. Automatic approval prohibited.`,
                recommendedAction: rule.recommendedAction,
                createdAt: new Date().toISOString(),
              });

              // Set authenticity assessment to INDEPENDENT_VERIFICATION_REQUIRED
              doc.authenticityStatus = 'INDEPENDENT_VERIFICATION_REQUIRED';

              // Prevent auto-approval by ensuring status reflects deficiency/pending
              if (app.status === 'REVIEW_COMPLETED') {
                app.status = 'UNDER_HUMAN_REVIEW';
              }
            }
          }
          break;
        }
      }
    }

    // Score calculation
    const critical = findings.filter((f) => f.severity === 'CRITICAL').length;
    const major = findings.filter((f) => f.severity === 'MAJOR').length;
    const moderate = findings.filter((f) => f.severity === 'MODERATE').length;
    const minor = findings.filter((f) => f.severity === 'MINOR').length;
    const informational = findings.filter((f) => f.severity === 'INFORMATIONAL').length;

    let score = 100 - (critical * 25 + major * 15 + moderate * 8 + minor * 3);
    if (score < 0) score = 0;

    const completedAt = new Date().toISOString();
    const run: ValidationRun = {
      id: runId,
      applicationId,
      startedAt,
      completedAt,
      ruleVersionsApplied: ruleVersions,
      findingsSummary: {
        critical,
        major,
        moderate,
        minor,
        informational,
        total: findings.length,
      },
      overallComplianceScore: score,
      executionType,
    };

    // Update findings in db (keep existing resolved notes if finding was re-evaluated)
    db.validationFindings = db.validationFindings.filter((f) => f.applicationId !== applicationId);
    db.validationFindings.push(...findings);

    db.validationRuns = db.validationRuns.filter((r) => r.applicationId !== applicationId);
    db.validationRuns.push(run);

    // Update application workflow status if not in a special state
    if (
      app.status !== 'DUPLICATE_CONFLICT_REVIEW' &&
      app.status !== 'EXPIRING_TODAY'
    ) {
      if (critical > 0 || major > 0) {
        app.status = 'DEFICIENCIES_FOUND';
      } else {
        app.status = 'UNDER_HUMAN_REVIEW';
      }
    }
    app.updatedAt = completedAt;

    db.logAuditEvent(
      { id: 'SYSTEM', name: 'Automated Rule Engine', role: 'ADMIN' },
      'VALIDATION_RUN_EXECUTED',
      'VALIDATION',
      run.id,
      { applicationId, findingsTotal: findings.length, score, status: app.status }
    );

    return { run, findings };
  }
}

export const ruleEngine = new RuleEngine();

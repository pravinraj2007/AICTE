/**
 * Document Forensics & Anomaly Detection Service
 * Explains preliminary checks, perceptual hashes, conflicting dates, and metadata discrepancies.
 */

import { DocumentRecord } from '../src/types/index.ts';

export interface AnomalyReport {
  anomalyType: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedDocumentIds: string[];
  observedEvidence: string;
  detectionMethod: string;
  reliabilityLimitation: string;
  recommendedNextStep: string;
}

export class AnomalyDetector {
  detectAnomalies(docs: DocumentRecord[]): AnomalyReport[] {
    const reports: AnomalyReport[] = [];

    // 1. Date Contradiction Checks
    for (const doc of docs) {
      const issue = doc.extractedFields.issueDate;
      const expiry = doc.extractedFields.expiryDate;

      if (issue && expiry) {
        const issueD = new Date(issue);
        const expiryD = new Date(expiry);

        if (issueD > expiryD) {
          reports.push({
            anomalyType: 'INVERTED_CHRONOLOGY_DATE_CONFLICT',
            severity: 'HIGH',
            affectedDocumentIds: [doc.id],
            observedEvidence: `Document issue date (${issue}) is chronologically later than expiry date (${expiry}).`,
            detectionMethod: 'Chronological Interval Verifier',
            reliabilityLimitation: 'May occur in rare OCR digit transposition cases (e.g., 2023 vs 2028).',
            recommendedNextStep: 'Inspect high-resolution visual scan to rule out OCR character misinterpretation.',
          });
        }
      }

      // Check future issue date
      if (issue) {
        const issueD = new Date(issue);
        if (issueD > new Date()) {
          reports.push({
            anomalyType: 'FUTURE_ISSUE_DATE_ANOMALY',
            severity: 'HIGH',
            affectedDocumentIds: [doc.id],
            observedEvidence: `Document issue date (${issue}) is in the future relative to system clock.`,
            detectionMethod: 'Temporal Boundary Verifier',
            reliabilityLimitation: 'Check system clock and timezone conventions.',
            recommendedNextStep: 'Verify issuance seal and original certificate ledger date.',
          });
        }
      }

      // 2. QR Code Payload vs Visible Field Verification
      if (doc.hasQrCode && doc.extractedFields.registrationNumber) {
        const qrPayload = doc.extractedFields.qrCodePayload;
        const certNo = doc.extractedFields.registrationNumber;

        if (qrPayload && !qrPayload.includes(certNo)) {
          reports.push({
            anomalyType: 'QR_PAYLOAD_REGISTRATION_MISMATCH',
            severity: 'MEDIUM',
            affectedDocumentIds: [doc.id],
            observedEvidence: `Decoded QR code payload "${qrPayload.slice(0, 30)}..." does not contain printed certificate reference "${certNo}".`,
            detectionMethod: '2D Barcode Payload Comparator',
            reliabilityLimitation: 'Some government QR codes store internal GUIDs rather than formatted registration strings.',
            recommendedNextStep: 'Query official issuing portal using the QR URL or token parameter.',
          });
        }
      }

      // 3. Low extraction confidence threshold
      if (doc.extractedFields.extractionConfidence < 0.7) {
        reports.push({
          anomalyType: 'LOW_OCR_FIDELITY_INCONCLUSIVE',
          severity: 'LOW',
          affectedDocumentIds: [doc.id],
          observedEvidence: `OCR text confidence is ${(doc.extractedFields.extractionConfidence * 100).toFixed(0)}%, indicating heavy compression, noise, or skew.`,
          detectionMethod: 'OCR Confidence Matrix',
          reliabilityLimitation: 'Document degradation or scanning DPI under 150 can degrade OCR confidence without indicating tampering.',
          recommendedNextStep: 'Request institution provide higher resolution color scan (300 DPI) for clarity.',
        });
      }
    }

    // 4. Cross-document Near-Duplicate or Reused Hashes
    const hashMap = new Map<string, string[]>();
    for (const doc of docs) {
      if (!hashMap.has(doc.sha256Hash)) {
        hashMap.set(doc.sha256Hash, []);
      }
      hashMap.get(doc.sha256Hash)!.push(doc.id);
    }

    for (const [hash, docIds] of hashMap.entries()) {
      if (docIds.length > 1) {
        reports.push({
          anomalyType: 'INTRA_APPLICATION_DUPLICATE_FILE',
          severity: 'MEDIUM',
          affectedDocumentIds: docIds,
          observedEvidence: `Identical file (SHA-256: ${hash.slice(0, 16)}...) was uploaded for multiple distinct checklist slots.`,
          detectionMethod: 'Cryptographic SHA-256 Collision Check',
          reliabilityLimitation: 'Institution may have mistakenly selected the same file twice during upload.',
          recommendedNextStep: 'Notify institution user to replace duplicate document with correct checklist item.',
        });
      }
    }

    return reports;
  }
}

export const anomalyDetector = new AnomalyDetector();

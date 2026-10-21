"""
Comprehensive Automated Test Suite for AICTE Regulatory Validation Platform.
Covers:
1. Duplicate FDR prevention across different filenames & paths
2. Atomic Optimistic Concurrency Control (OCC) for concurrent approvals
3. Transactional safety & database failure rollbacks (no false success)
4. Server-side authorization enforcement (HTTP 403)
5. Tampered document detection & blocking of auto-approval
6. Same-day expiry escalation
7. Exact integer-cents financial shortfall calculation
8. Bank API timeout & circuit breaker handling
9. Regulatory rule ambiguity & abstention
10. Immutable document version replacement & reassessment
"""

import unittest
from datetime import datetime
from backend.main import (
    store,
    normalize_instrument_number,
    calculate_financial_shortfall,
    check_duplicate_fdr_instrument,
    run_application_validation,
    submit_approval,
    replace_document,
    verify_document,
    circuit_breaker
)
from backend.models.schemas import ApprovalRequestSchema

class TestAicteRegulatoryValidation(unittest.TestCase):
    def setUp(self):
        store.reset()
        circuit_breaker.consecutive_failures = 0
        circuit_breaker.state = "CLOSED"

    # ==============================================================
    # 1. DUPLICATE FDR PREVENTION ACROSS DIFFERENT FILENAMES
    # ==============================================================
    def test_duplicate_fdr_prevention_across_different_filenames(self):
        """
        Security Requirement 1: Detecting duplicate files via hash is NOT enough.
        The system must identify the same instrument uploaded under DIFFERENT filenames.
        - app-2 has 'delhi_fd_receipt.pdf' with FDR 'SBI-FDR-991024'
        - app-8 has 'bangalore_fixed_deposit_scan.pdf' with FDR 'sbi / fdr / 991024'
        Filenames, uploaders, and hashes are completely different, but normalized identity matches.
        """
        # 1. Normalization verification
        norm1 = normalize_instrument_number("SBI-FDR-991024")
        norm2 = normalize_instrument_number("sbi / fdr / 991024")
        norm3 = normalize_instrument_number("SBI.FDR.991024")
        self.assertEqual(norm1, "SBIFDR991024")
        self.assertEqual(norm2, "SBIFDR991024")
        self.assertEqual(norm3, "SBIFDR991024")

        # 2. Check collision across different applications and different filenames
        conflict = check_duplicate_fdr_instrument("app-8", norm2, "State Bank of India")
        self.assertIsNotNone(conflict)
        self.assertEqual(conflict["applicationId"], "app-2")
        self.assertNotEqual(conflict["rawFilename"], "bangalore_fixed_deposit_scan.pdf")

        # 3. Validation run sets status to DUPLICATE_CONFLICT_REVIEW
        res = run_application_validation("app-8")
        app_8 = store.applications["app-8"]
        app_2 = store.applications["app-2"]

        self.assertEqual(app_8["status"], "DUPLICATE_CONFLICT_REVIEW")
        self.assertEqual(app_2["status"], "DUPLICATE_CONFLICT_REVIEW")

        dup_finding = next((f for f in res["findings"] if f["ruleId"] == "RULE-DUPLICATE-INSTRUMENT-08"), None)
        self.assertIsNotNone(dup_finding)
        self.assertEqual(dup_finding["severity"], "CRITICAL")
        self.assertEqual(dup_finding["status"], "CONFIRMED_DISCREPANCY")

        # 4. Attempting to approve an application with duplicate conflict must be blocked
        req = ApprovalRequestSchema(
            expectedVersion=app_8["version"],
            idempotencyKey="idem-test-dup",
            approvalReason="Attempting approval despite conflict"
        )
        with self.assertRaises(Exception) as ctx:
            submit_approval("app-8", req, x_user_id="usr-reviewer-1")
        self.assertIn("DUPLICATE_CONFLICT_REVIEW", str(ctx.exception))

    # ==============================================================
    # 2. CONCURRENT APPROVALS & OPTIMISTIC CONCURRENCY CONTROL (OCC)
    # ==============================================================
    def test_concurrent_approvals_with_optimistic_concurrency_control(self):
        """
        Security Requirement 2: The backend must use atomic state transitions or
        equivalent concurrency control, not just disable the approval button in UI.
        Two officers attempting concurrent approvals with expectedVersion=1:
        Officer 1 succeeds (v1 -> v2, status REVIEW_COMPLETED).
        Officer 2 (stale v1) is atomically rejected with HTTP 409 Conflict.
        """
        app = store.applications["app-1"]
        self.assertEqual(app["version"], 1)
        self.assertEqual(app["status"], "UNDER_HUMAN_REVIEW")

        # Officer 1 submits approval with expectedVersion=1
        req1 = ApprovalRequestSchema(
            expectedVersion=1,
            idempotencyKey="idem-concurrent-1",
            approvalReason="Statutory approval granted by Officer 1"
        )
        res1 = submit_approval("app-1", req1, x_user_id="usr-reviewer-1")

        self.assertTrue(res1["success"])
        self.assertEqual(res1["application"]["version"], 2)
        self.assertEqual(res1["application"]["status"], "REVIEW_COMPLETED")

        # Officer 2 attempts concurrent approval using stale expectedVersion=1
        req2 = ApprovalRequestSchema(
            expectedVersion=1,
            idempotencyKey="idem-concurrent-2",
            approvalReason="Officer 2 approving concurrently"
        )
        with self.assertRaises(Exception) as ctx:
            submit_approval("app-1", req2, x_user_id="usr-admin-1")

        err_msg = str(ctx.exception)
        self.assertIn("409", err_msg)
        self.assertIn("Expected version 1, but current database version is 2", err_msg)

    # ==============================================================
    # 3. DATABASE TRANSACTION FAILURE ROLLBACK (NO FALSE SUCCESS)
    # ==============================================================
    def test_database_failure_rollback_and_uncommitted_state(self):
        """
        Security Requirement 3: The UI and backend must never show success
        until the backend confirms the approval outcome. If a DB write fails,
        the transaction is rolled back, status is UNCOMMITTED, and app state is untouched.
        """
        app = store.applications["app-1"]
        initial_version = app["version"]
        initial_status = app["status"]

        req = ApprovalRequestSchema(
            expectedVersion=initial_version,
            idempotencyKey="idem-db-fail",
            approvalReason="Testing simulated database failure",
            simulateDbFailure=True
        )

        with self.assertRaises(Exception) as ctx:
            submit_approval("app-1", req, x_user_id="usr-reviewer-1")

        err_msg = str(ctx.exception)
        self.assertIn("500", err_msg)
        self.assertIn("UNCOMMITTED", err_msg)

        # Verify application record was NOT modified
        self.assertEqual(app["version"], initial_version)
        self.assertEqual(app["status"], initial_status)

        # Verify failed command record was audited
        failed_cmd = store.approval_commands.get("idem-db-fail")
        self.assertIsNotNone(failed_cmd)
        self.assertEqual(failed_cmd["status"], "FAILED")
        self.assertEqual(failed_cmd["errorCode"], "DB_TRANSACTION_ABORTED")

    # ==============================================================
    # 4. UNAUTHORIZED OFFICER APPROVAL ATTEMPT (HTTP 403)
    # ==============================================================
    def test_unauthorized_officer_approval_rejected(self):
        """
        Scenario 5: An officer without statutory approval authority (canApproveApplications=False)
        must receive HTTP 403 Forbidden. Application state remains unchanged and audit event is logged.
        """
        app = store.applications["app-1"]
        initial_status = app["status"]

        req = ApprovalRequestSchema(
            expectedVersion=app["version"],
            idempotencyKey="idem-unauthorized",
            approvalReason="Assistant reviewer attempting approval"
        )

        with self.assertRaises(Exception) as ctx:
            submit_approval("app-1", req, x_user_id="usr-reviewer-2")

        err_msg = str(ctx.exception)
        self.assertIn("403", err_msg)
        self.assertIn("does not possess statutory approval authority", err_msg)

        self.assertEqual(app["status"], initial_status)

        # Audit event logged
        security_event = next(
            (e for e in store.audit_events if e["action"] == "SECURITY_UNAUTHORIZED_APPROVAL_ATTEMPT"),
            None
        )
        self.assertIsNotNone(security_event)

    # ==============================================================
    # 5. TAMPERED DOCUMENT DETECTION & NO AUTO-APPROVAL
    # ==============================================================
    def test_tampered_document_flags_verification_and_blocks_approval(self):
        """
        Scenario 1: Document with anomalous font metrics / producer is flagged
        for INDEPENDENT_VERIFICATION_REQUIRED and blocks auto-approval.
        """
        res = run_application_validation("app-3")
        tamper_finding = next((f for f in res["findings"] if f["ruleId"] == "RULE-AUTHENTICITY-INSPECTION-09"), None)
        self.assertIsNotNone(tamper_finding)
        self.assertEqual(tamper_finding["severity"], "CRITICAL")
        self.assertEqual(tamper_finding["status"], "OPEN")

        req = ApprovalRequestSchema(
            expectedVersion=store.applications["app-3"]["version"],
            idempotencyKey="idem-tamper",
            approvalReason="Attempting approval on tampered doc"
        )
        with self.assertRaises(Exception) as ctx:
            submit_approval("app-3", req, x_user_id="usr-reviewer-1")
        self.assertIn("unresolved blocking findings", str(ctx.exception))

    # ==============================================================
    # 6. SAME-DAY EXPIRING FDR ESCALATION
    # ==============================================================
    def test_same_day_expiry_escalation_and_approval_block(self):
        """
        Scenario 3: FDR expiring today sets status to EXPIRING_TODAY,
        creates an urgent escalation task, and blocks approval.
        """
        run_application_validation("app-5")
        app_5 = store.applications["app-5"]
        self.assertEqual(app_5["status"], "EXPIRING_TODAY")

        esc = next((e for e in store.escalation_tasks if e["applicationId"] == "app-5" and e["escalationType"] == "SAME_DAY_EXPIRY"), None)
        self.assertIsNotNone(esc)
        self.assertEqual(esc["priority"], "URGENT")

        req = ApprovalRequestSchema(
            expectedVersion=app_5["version"],
            idempotencyKey="idem-expiring",
            approvalReason="Approving expiring document"
        )
        with self.assertRaises(Exception) as ctx:
            submit_approval("app-5", req, x_user_id="usr-reviewer-1")
        self.assertIn("Pledged financial instrument expires today", str(ctx.exception))

    # ==============================================================
    # 7. EXACT FINANCIAL SHORTFALL CALCULATION
    # ==============================================================
    def test_financial_shortfall_calculation(self):
        """
        Scenario 4: Statutory requirement of INR 3,500,000 with submitted INR 2,800,000
        calculates exact deficit of INR 700,000 using integer cents without IEEE-754 drift.
        """
        shortfall = calculate_financial_shortfall(3500000.0, 2800000.0)
        self.assertEqual(shortfall, 700000.0)

        shortfall_exact = calculate_financial_shortfall(100.10, 99.05)
        self.assertEqual(shortfall_exact, 1.05)

        run_application_validation("app-4")
        app_4 = store.applications["app-4"]
        self.assertIsNotNone(app_4.get("financialShortfall"))
        self.assertEqual(app_4["financialShortfall"]["shortfall"], 700000.0)

    # ==============================================================
    # 8. BANK VERIFICATION TIMEOUT & CIRCUIT BREAKER
    # ==============================================================
    def test_bank_verification_timeout_and_circuit_breaker(self):
        """
        Scenario 6: Simulated bank verification timeout triggers 3 bounded retries,
        transitions circuit breaker to OPEN, returns SOURCE_UNAVAILABLE, never marks VERIFIED.
        """
        res = verify_document("doc-fdr-delhi", simulate_mode="TIMEOUT")
        self.assertEqual(res["result"], "SOURCE_UNAVAILABLE")
        self.assertEqual(res["status"], "PENDING")
        self.assertEqual(res["retryCount"], 3)
        self.assertIn("SIMULATED — NOT OFFICIAL VERIFICATION", res["simulationDisclaimer"])
        self.assertNotEqual(res["status"], "VERIFIED")

    # ==============================================================
    # 9. RULE AMBIGUITY & ABSTENTION
    # ==============================================================
    def test_rule_ambiguity_sets_human_review_required(self):
        """
        Scenario 7: When rules conflict or are ambiguous, system sets
        ruleResolutionStatus='HUMAN_REVIEW_REQUIRED' and preserves candidates.
        """
        app_6 = store.applications["app-6"]
        self.assertEqual(app_6["ruleResolutionStatus"], "HUMAN_REVIEW_REQUIRED")
        self.assertEqual(len(app_6["candidateRules"]), 2)

    # ==============================================================
    # 10. IMMUTABLE DOCUMENT REPLACEMENT & REASSESSMENT TRIGGER
    # ==============================================================
    def test_document_replacement_preserves_version_and_triggers_reassessment(self):
        """
        Scenario 9: Replaced document archives old version in immutable history,
        increments document version, marks dependent findings REASSESSMENT_REQUIRED,
        and increments application OCC version.
        """
        # Run validation first so findings exist
        run_application_validation("app-8")

        initial_app_ver = store.applications["app-8"]["version"]
        res = replace_document(
            application_id="app-8",
            document_id="doc-fdr-bangalore",
            replacement_reason="Uploaded corrected bank endowment receipt with fresh IFSC stamp",
            x_user_id="usr-reviewer-1"
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["document"]["version"], 2)
        self.assertEqual(res["previousVersion"]["versionNumber"], 1)
        self.assertEqual(res["applicationVersion"], initial_app_ver + 1)

        # Check that previous findings on this document transitioned to REASSESSMENT_REQUIRED
        doc_findings = [f for f in store.validation_findings if "doc-fdr-bangalore" in f.get("affectedDocumentIds", [])]
        for f in doc_findings:
            self.assertEqual(f["status"], "REASSESSMENT_REQUIRED")

if __name__ == "__main__":
    unittest.main()

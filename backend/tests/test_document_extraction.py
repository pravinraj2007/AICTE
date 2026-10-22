import os
import unittest
from unittest.mock import patch

import pymupdf
from fastapi.testclient import TestClient

from backend.document_extraction import DocumentExtractionError, extract_document
from backend.main import app


def make_synthetic_pdf() -> bytes:
    document = pymupdf.open()
    page = document.new_page()
    for index, line in enumerate(
        (
            "Institution Name: Example Technical Institute",
            "Certificate Number: AFF-2026-1042",
            "Issue Date: 2026-04-01",
            "Expiry Date: 2027-03-31",
        )
    ):
        page.insert_text((72, 72 + index * 24), line)
    content = document.tobytes()
    document.close()
    return content


class TestDocumentExtraction(unittest.TestCase):
    def test_extracts_values_and_page_evidence_from_real_pdf_text(self):
        result = extract_document(make_synthetic_pdf(), "known-certificate.pdf", "application/pdf")

        self.assertEqual(result["processingStatus"], "PROCESSED")
        self.assertEqual(result["pageCount"], 1)
        self.assertEqual(result["extractionMethod"], "PDF_TEXT_EXTRACTION")
        self.assertEqual(result["fields"]["institutionName"], "Example Technical Institute")
        self.assertEqual(result["fields"]["registrationNumber"], "AFF-2026-1042")
        self.assertEqual(result["fields"]["issueDate"], "2026-04-01")
        self.assertEqual(result["fields"]["expiryDate"], "2027-03-31")
        self.assertIn("Institution Name: Example Technical Institute", result["rawText"])
        self.assertIn("Certificate Number: AFF-2026-1042", result["rawText"])
        self.assertIn("Issue Date: 2026-04-01", result["rawText"])
        self.assertIn("Expiry Date: 2027-03-31", result["rawText"])
        self.assertEqual(result["fieldEvidence"]["registrationNumber"][0]["page"], 1)
        self.assertIn("AFF-2026-1042", result["fieldEvidence"]["registrationNumber"][0]["text"])
        self.assertIsNone(result["extractionConfidence"])

    def test_rejects_invalid_pdf_signature(self):
        with self.assertRaises(DocumentExtractionError) as error:
            extract_document(b"not a pdf", "forged.pdf", "application/pdf")

        self.assertEqual(error.exception.code, "INVALID_PDF")

    def test_scanned_pdf_without_tesseract_requires_manual_review(self):
        document = pymupdf.open()
        document.new_page()
        content = document.tobytes()
        document.close()

        with patch("backend.document_extraction._tesseract_available", return_value=False):
            result = extract_document(content, "scanned.pdf", "application/pdf")

        self.assertEqual(result["processingStatus"], "MANUAL_REVIEW_REQUIRED")
        self.assertEqual(result["pages"][0]["status"], "OCR_UNAVAILABLE")
        self.assertEqual(result["fields"], {})
        self.assertIsNone(result["extractionConfidence"])

    def test_internal_api_requires_configured_token_outside_development(self):
        client = TestClient(app)
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "development", "DOCUMENT_PROCESSOR_TOKEN": "test-service-token"},
        ):
            response = client.post(
                "/api/v1/documents/extract",
                files={"file": ("known.pdf", make_synthetic_pdf(), "application/pdf")},
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["code"], "INVALID_SERVICE_CREDENTIAL")

    def test_internal_api_returns_actual_extraction_with_valid_token(self):
        client = TestClient(app)
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "development", "DOCUMENT_PROCESSOR_TOKEN": "test-service-token"},
        ):
            response = client.post(
                "/api/v1/documents/extract",
                headers={"x-document-processor-token": "test-service-token"},
                files={"file": ("known.pdf", make_synthetic_pdf(), "application/pdf")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["fields"]["institutionName"], "Example Technical Institute")
        self.assertEqual(response.json()["fields"]["registrationNumber"], "AFF-2026-1042")
        self.assertIn("Issue Date: 2026-04-01", response.json()["rawText"])

    def test_production_api_fails_closed_without_authentication(self):
        client = TestClient(app)
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            response = client.get("/api/v1/applications")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["detail"]["code"],
            "AUTHENTICATION_NOT_CONFIGURED",
        )


if __name__ == "__main__":
    unittest.main()

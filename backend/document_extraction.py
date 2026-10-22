"""Evidence-preserving extraction for supported regulatory documents."""

from __future__ import annotations

import io
import re
import shutil
from datetime import datetime
from typing import Any

import pymupdf
from PIL import Image
import pytesseract
from pytesseract import Output

MAX_DOCUMENT_PAGES = 50
MAX_OCR_PAGES = 10
MAX_OCR_PIXELS = 20_000_000
MIN_USEFUL_TEXT_LENGTH = 12


class DocumentExtractionError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _tesseract_available() -> bool:
    executable = pytesseract.pytesseract.tesseract_cmd
    return bool(shutil.which(executable))


def _ocr_image(image: Image.Image) -> tuple[str, float | None]:
    if image.width * image.height > MAX_OCR_PIXELS:
        raise DocumentExtractionError("OCR_IMAGE_TOO_LARGE", "Image exceeds the OCR pixel limit.")
    data = pytesseract.image_to_data(image, output_type=Output.DICT)
    words = [word.strip() for word in data["text"] if word and word.strip()]
    confidences = []
    for confidence in data["conf"]:
        try:
            parsed = float(confidence)
        except (TypeError, ValueError):
            continue
        if parsed >= 0:
            confidences.append(parsed)
    confidence = sum(confidences) / len(confidences) / 100 if confidences else None
    return " ".join(words), confidence


def _normalize_date(value: str) -> str | None:
    value = value.strip().rstrip(".,;")
    for date_format in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(value, date_format).date().isoformat()
        except ValueError:
            continue
    return None


def _extract_fields(pages: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    fields: dict[str, Any] = {}
    evidence: dict[str, list[dict[str, Any]]] = {}
    patterns = {
        "institutionName": r"^\s*(?:institution|institute|college)\s+name\s*[:\-]\s*(.+?)\s*$",
        "registrationNumber": r"^\s*(?:certificate|registration|approval|reference|ref)\s*(?:number|no\.?|#)\s*[:\-]\s*([A-Z0-9][A-Z0-9/_.-]*)\s*$",
        "issueDate": r"^\s*(?:issue|issued|date of issue)\s*(?:date)?\s*[:\-]\s*(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\s*$",
        "expiryDate": r"^\s*(?:expiry|expiration|valid until|validity up to|maturity)\s*(?:date)?\s*[:\-]\s*(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\s*$",
        "fdrNumber": r"^\s*(?:FDR|deposit receipt)\s*(?:number|no\.?|#)\s*[:\-]\s*([A-Z0-9][A-Z0-9/_.-]*)\s*$",
        "bankName": r"^\s*bank\s+name\s*[:\-]\s*(.+?)\s*$",
        "holderName": r"^\s*(?:account holder|holder)\s+name\s*[:\-]\s*(.+?)\s*$",
        "financialAmount": r"^\s*(?:financial\s+)?amount\s*[:\-]\s*(?:(INR|USD|EUR|GBP|CAD|AUD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*$",
        "currency": r"^\s*currency\s*[:\-]\s*(INR|USD|EUR|GBP|CAD|AUD)\s*$",
    }

    for page in pages:
        for line in page["text"].splitlines():
            for field, pattern in patterns.items():
                match = re.match(pattern, line, re.IGNORECASE)
                if not match:
                    continue
                if field == "financialAmount":
                    currency, amount = match.groups()
                    try:
                        value = float(amount.replace(",", ""))
                    except ValueError:
                        continue
                    if currency:
                        fields.setdefault("currency", currency)
                else:
                    value = match.group(1).strip()
                if field in {"issueDate", "expiryDate"}:
                    value = _normalize_date(value)
                    if value is None:
                        continue
                if field not in fields:
                    fields[field] = value
                evidence.setdefault(field, []).append(
                    {"page": page["page"], "text": _normalize_text(line)}
                )

    return fields, evidence


def extract_document(data: bytes, filename: str, mime_type: str) -> dict[str, Any]:
    """Extract text only when supported by document content; never invent field values."""
    if not data:
        raise DocumentExtractionError("EMPTY_FILE", "The uploaded document is empty.")

    pages: list[dict[str, Any]] = []
    extraction_methods: set[str] = set()
    confidences: list[float] = []
    needs_manual_review = False
    tesseract_available = _tesseract_available()

    if mime_type == "application/pdf":
        if not data.startswith(b"%PDF-"):
            raise DocumentExtractionError("INVALID_PDF", "File contents are not a valid PDF.")
        try:
            document = pymupdf.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise DocumentExtractionError("INVALID_PDF", "The PDF could not be opened.") from exc
        with document:
            if document.needs_pass:
                raise DocumentExtractionError("ENCRYPTED_PDF", "Password-protected PDFs are not supported.")
            if not 1 <= document.page_count <= MAX_DOCUMENT_PAGES:
                raise DocumentExtractionError("PAGE_LIMIT_EXCEEDED", "PDF page count is outside the supported limit.")
            for page_index, page in enumerate(document):
                text = page.get_text("text")
                method = "PDF_TEXT_EXTRACTION"
                status = "EXTRACTED"
                confidence = None
                if len(re.sub(r"\s", "", text)) < MIN_USEFUL_TEXT_LENGTH:
                    if not tesseract_available:
                        status = "OCR_UNAVAILABLE"
                        needs_manual_review = True
                    elif page_index >= MAX_OCR_PAGES:
                        status = "OCR_PAGE_LIMIT_EXCEEDED"
                        needs_manual_review = True
                    elif page.rect.width * page.rect.height * (150 / 72) ** 2 > MAX_OCR_PIXELS:
                        status = "OCR_IMAGE_TOO_LARGE"
                        needs_manual_review = True
                    else:
                        pixmap = page.get_pixmap(dpi=150, alpha=False)
                        if pixmap.width * pixmap.height > MAX_OCR_PIXELS:
                            status = "OCR_IMAGE_TOO_LARGE"
                            needs_manual_review = True
                        else:
                            image = Image.open(io.BytesIO(pixmap.tobytes("png")))
                            try:
                                text, confidence = _ocr_image(image)
                                method = "TESSERACT_OCR"
                                status = "EXTRACTED" if text.strip() else "UNREADABLE"
                                if confidence is not None:
                                    confidences.append(confidence)
                            except (pytesseract.TesseractError, pytesseract.TesseractNotFoundError):
                                status = "OCR_FAILED"
                                needs_manual_review = True
                            if status != "EXTRACTED":
                                needs_manual_review = True
                else:
                    extraction_methods.add(method)
                if method == "TESSERACT_OCR" and status == "EXTRACTED":
                    extraction_methods.add(method)
                pages.append({"page": page_index + 1, "text": text, "method": method, "status": status})
    elif mime_type in {"image/png", "image/jpeg"}:
        expected = b"\x89PNG\r\n\x1a\n" if mime_type == "image/png" else b"\xff\xd8\xff"
        if not data.startswith(expected):
            raise DocumentExtractionError("INVALID_IMAGE", "File contents do not match the declared image type.")
        try:
            image = Image.open(io.BytesIO(data))
            image.verify()
            image = Image.open(io.BytesIO(data))
        except Exception as exc:
            raise DocumentExtractionError("INVALID_IMAGE", "The uploaded image could not be decoded.") from exc
        if not tesseract_available:
            pages.append({"page": 1, "text": "", "method": "TESSERACT_OCR", "status": "OCR_UNAVAILABLE"})
            needs_manual_review = True
        else:
            try:
                text, confidence = _ocr_image(image)
                pages.append(
                    {
                        "page": 1,
                        "text": text,
                        "method": "TESSERACT_OCR",
                        "status": "EXTRACTED" if text.strip() else "UNREADABLE",
                    }
                )
                extraction_methods.add("TESSERACT_OCR")
                if confidence is not None:
                    confidences.append(confidence)
                if not text.strip():
                    needs_manual_review = True
            except (pytesseract.TesseractError, pytesseract.TesseractNotFoundError):
                pages.append({"page": 1, "text": "", "method": "TESSERACT_OCR", "status": "OCR_FAILED"})
                needs_manual_review = True
    else:
        raise DocumentExtractionError("UNSUPPORTED_FILE_TYPE", "Only PDF, PNG, and JPEG documents are supported.")

    extracted_text = "\n".join(page["text"] for page in pages if page["text"].strip())
    fields, evidence = _extract_fields(pages)
    if len(extraction_methods) > 1:
        method = "HYBRID_EXTRACTION"
    elif extraction_methods:
        method = next(iter(extraction_methods))
    else:
        method = "NONE"

    status = "MANUAL_REVIEW_REQUIRED" if needs_manual_review else ("PROCESSED" if extracted_text else "FAILED")
    return {
        "filename": filename,
        "processingStatus": status,
        "pageCount": len(pages),
        "extractionMethod": method,
        "rawText": extracted_text,
        "rawTextPreview": extracted_text[:500] or None,
        "fields": fields,
        "fieldEvidence": evidence,
        "pages": pages,
        "extractionConfidence": sum(confidences) / len(confidences) if confidences else None,
    }

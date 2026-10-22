# AICTE Intelligent Regulatory Validation Platform (AI-IRVP)

> **Organization:** All India Council for Technical Education (AICTE)  
> **Department:** Regulation Bureau  
> **Category:** Software  
> **Theme:** Smart Regulatory Compliance, Document Forensics & Automated Validation

---

## 1. Executive Summary & Purpose

The **AICTE Intelligent Regulatory Validation Platform** is a full-stack, automated compliance verification and document forensics prototype designed to streamline technical education approval cycles (such as Extension of Approval, New Programmes, Intake Changes, and Infrastructure Updates).

The platform enforces:
- **Strict separation** between deterministic validation rules and probabilistic AI analysis.
- **Traceable validation findings** linked to exact rule versions and physical document evidence.
- **Explainable document forensics** (SHA-256 duplicate collision detection, chronological date coherence, 2D QR payload cross-checks).
- **Issuing-authority adapters** (State DTE, University, and Fire Services) with explicit simulation disclaimers.
- **Human-in-the-loop reviewer workspaces** requiring mandatory rationale for overrides or resolving discrepancies.
- **Full audit trail** capturing every upload, validation run, rule edit, and reviewer action with correlation IDs.

---

## 2. System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │          React + TypeScript Frontend         │
                  │   (Portals: Institution / Reviewer / Admin)  │
                  └──────────────────────┬───────────────────────┘
                                         │ REST API (/api/v1/*)
                  ┌──────────────────────▼───────────────────────┐
                  │            API & Integration Layer           │
                  │  (Node.js/Express in Dev + FastAPI Backend)  │
                  └──────┬───────────────┬────────────────┬──────┘
                         │               │                │
       ┌─────────────────▼─────┐ ┌───────▼────────┐ ┌─────▼──────────────────┐
       │ Deterministic Rule    │ │ Document       │ │ Issuing Authority      │
       │ Engine (v2026.1)      │ │ Forensics &    │ │ Adapters (Simulated)   │
       │ - Checklist checks    │ │ OCR Pipeline   │ │ - State DTE            │
       │ - Expiry validation   │ │ - SHA-256 hash │ │ - Affiliating Univ     │
       │ - PID consistency     │ │ - QR payload   │ │ - Fire Safety Bureau   │
       │ - Faculty Cadre ratio │ │ - Chronology   │ │ - NBA Accreditation    │
       └───────────────────────┘ └────────────────┘ └────────────────────────┘
```

---

## 3. Quick Start (Live Environment)

In this Google AI Studio environment, the application runs on **Port 3000** with the Express full-stack API server proxying Vite:

```bash
# Start development server
npm run dev
```

Open the application at `http://localhost:3000`.

## Evidence-based document processing (prototype)

Document upload uses the FastAPI service for extraction. Start both services in separate terminals:

```powershell
# Terminal 1: repository root
npm run dev

# Terminal 2: repository root
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --env-file backend\.env
```

The upload route extracts embedded PDF text with PyMuPDF and records page-level extraction status and source-line evidence. For PDFs with extracted text, the Express server separately sends up to 40,000 characters to Gemini when `GEMINI_API_KEY` is configured. The provider key and `GEMINI_MODEL` are server-side only; document text is sent to Google for analysis, so only use documents approved for that processing. Gemini output is labeled as an AI interpretation, stored separately from native fields and deterministic findings, and is never treated as source evidence or an official regulatory decision. If the key is missing, extraction still succeeds and Gemini is marked pending; provider/validation failures are marked failed. Transient provider 5xx responses receive one bounded retry by default (`GEMINI_MAX_RETRIES`, maximum 2). PDF documents with pending/failed analysis can be retried from the document detail card, which re-extracts the unchanged stored file after verifying its SHA-256. The full extracted text is not returned in the document record.

The Gemini analysis is bounded to 40,000 characters; the UI discloses when input text was truncated. Gemini results do not contain page evidence: only the native extractor's source lines and page numbers are evidence. Scanned PDF pages and PNG/JPEG images require the Tesseract executable in addition to the Python package; install Tesseract for Windows, add its executable to `PATH`, restart the terminal, and verify `tesseract --version`. If OCR is unavailable, unreadable, or over configured limits, the document is marked for manual review rather than receiving guessed values.

For local configuration, copy `.env.example` to `.env` at the repository root and `backend\.env.example` to `backend\.env`. Express loads the root `.env` relative to `server.ts` before constructing the Gemini service, regardless of the shell's working directory. FastAPI does not use Gemini credentials; it loads its separate `backend\.env` only when started with Uvicorn's `--env-file backend\.env` option. The Express `/ready` diagnostic reports only Gemini `configured`, `providerEnabled`, and a sanitized `errorCode`; it does not make a provider request, so `providerAvailability` remains `not_checked` until an analysis call. In development, the internal extraction endpoint accepts loopback calls without a service token. If you configure `DOCUMENT_PROCESSOR_TOKEN`, set the same value for both services; use a new secret, never a value copied from an example file. For a deployment attempt, configure the same random token in the Node and FastAPI environments. The API now verifies OIDC bearer tokens and fails closed when trusted identity is unavailable. `/ready` reports authentication configuration without exposing credentials. A real OIDC provider, account provisioning, and browser sign-in integration are not configured by this repository; do not expose the prototype to real institution records or use the demo role switcher as authentication.

If the local environment files do not exist, create them without overwriting existing secrets. Configure the Gemini key only in the root `.env` or the server process environment; never put it in frontend/Vite variables, commit it, or paste it into chat. The root `.env.example` contains an empty key placeholder and `.env` is ignored by Git.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

Run the available checks with:

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests -v
npm run test:security
npm run test:gemini
npm run lint
npm run build
```

`npm run test:security` exercises Express authorization and persistence boundaries. `npm run test:gemini` runs mocked response/schema, malformed response, timeout, quota, missing-key, and source-preservation tests. If `GEMINI_API_KEY` is present in the test process or root `.env`, it also makes a real provider request and may incur usage charges. When a live check is required, use PowerShell:

```powershell
$env:AICTE_REQUIRE_GEMINI_INTEGRATION = "true"
npm run test:gemini
Remove-Item Env:\AICTE_REQUIRE_GEMINI_INTEGRATION
```

If the key is missing, the real test is skipped with an explicit reason by default and fails clearly when `AICTE_REQUIRE_GEMINI_INTEGRATION=true`. The key is never printed by the test. Mocked test success is not evidence of a real provider request.

## Trusted authentication and shared persistence

The application APIs now reject anonymous requests. Express and FastAPI validate signed OIDC bearer tokens against configured issuer, audience, and JWKS endpoints. Application roles and institution ownership come only from the server-side `OIDC_SUBJECT_USER_MAP`; role claims in a token are ignored. Configure the same `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`, and subject map in the root `.env` and `backend\.env`. The map is JSON keyed by the provider's immutable `sub` claim; each value includes `id`, `email`, `name`, `role`, `createdAt`, and `canApproveApplications`, plus `institutionId` for institution roles. Keep role assignment configuration server-side.

The React API client accepts a short-lived access token from an existing trusted host integration set on `window.__AICTE_OIDC_ACCESS_TOKEN__` before the application loads. This repository does **not** include an OIDC sign-in/callback or account-provisioning UI; an identity provider and host integration are required to make interactive production sign-in available. Email-only login is disabled. Do not place tokens in local storage.

The synthetic role switcher is disabled by default and only works for loopback requests when `AICTE_DEMO_ROLE_SWITCH_ENABLED=true` is explicitly set in both service environments. It issues a short-lived HttpOnly, SameSite cookie signed by the running Express process. Never enable this mode in production; the local demo cookie is not an OIDC identity.

Both services use the same SQLite database file, defaulting to repository-root `data\aicte.sqlite` (or the same absolute `AICTE_DATABASE_PATH` in both processes). The schema is initialized automatically. SQLite WAL, a transactionally committed service snapshot, a record projection with primary-key constraints/indexes, and compare-and-swap application versions are used for durability. Express document binaries are stored under `data\documents` by default; preserve both `data\aicte.sqlite*` and `data\documents` when backing up or deploying. Docker Compose mounts one named data volume into both containers. The FastAPI extraction endpoint remains service-token/loopback protected and returns extraction results to Express, which persists the document, native evidence, Gemini analysis, version, and findings together with application state.

This is an incremental prototype store, not a production database deployment: data is stored as JSON service snapshots plus indexed projections, SQLite is intended for a single host/shared local volume, and encryption-at-rest, managed backups, multi-host failover, and an OIDC provisioning/administration workflow are not implemented. Configure the same absolute database path for both services if overriding the default. A demo role session is ephemeral across server restarts.

Run the security/persistence tests with:

```powershell
npm run test:security
backend\.venv\Scripts\python.exe -m pytest backend\tests -v
```

### Demonstration Users & Roles
For local-only demonstration, explicitly enable the role switcher as described above, then use the **"Switch Role"** button to test:
1. **Dr. Rajesh Sharma** (`principal@dits-delhi.edu.in`) — **Institution User** (Delhi Institute of Technology & Science).
2. **Prof. Ananya Rao** (`director@bce-bangalore.edu.in`) — **Institution User** (Bangalore College of Engineering).
3. **Dr. Vikram Deshmukh** (`dean@pat-pune.ac.in`) — **Institution User** (Pune Academy of Technology).
4. **Dr. Sunil K. Mehta** (`reviewer.mehta@aicte-india.org`) — **Regulatory Reviewer** (Northern Region Scrutiny Officer).
5. **Dr. Priya Nair** (`reviewer.nair@aicte-india.org`) — **Regulatory Reviewer** (Southern Region Joint Director).
6. **Shri R. C. Verma** (`admin.verma@aicte-india.org`) — **Chief Administrator** (Regulation Bureau).

---

## 4. Local Development with Python FastAPI & SQLite

To run the Python FastAPI backend locally:

### Windows PowerShell Setup Instructions

```powershell
# From the repository root, initialize each service environment without overwriting secrets.
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }

# Start FastAPI in one terminal; it uses the shared repository-root SQLite file.
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --env-file backend\.env

# Start Express/Vite in a second terminal.
npm run dev

# Backend test suite
backend\.venv\Scripts\python.exe -m pytest backend\tests -v
```

For a local synthetic demo only, set `AICTE_DEMO_ROLE_SWITCH_ENABLED=true` in both environment files and restart both services. For trusted API access, configure the same OIDC issuer, audience, JWKS URL, and subject-to-role map in both environments. Do not reuse the demo mode in any shared or production environment.

---

## 5. Docker Deployment

Docker deployment is currently **not verified and not ready**: Docker is unavailable in the development environment, and this repository does not contain the `Dockerfile` or `Dockerfile.backend` referenced by Compose. The Compose shared-volume configuration must be validated after deployable images are supplied.

```bash
# Build and run with Docker Compose
docker-compose up --build
```

---

## 6. Regulatory Disclaimer

**PROTOTYPE ONLY:** This software system is a functional technical prototype created for evaluation, research, and testing. It does not constitute official regulatory approval or endorsement by the All India Council for Technical Education (AICTE). Real statutory approvals require authorized scrutiny committee decisions in compliance with the prevailing AICTE Approval Process Handbook.

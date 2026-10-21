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

### Demonstration Users & Roles
Use the **"Switch Role"** button in the top right to instantly test:
1. **Dr. Rajesh Sharma** (`principal@dits-delhi.edu.in`) — **Institution User** (Delhi Institute of Technology & Science).
2. **Prof. Ananya Rao** (`director@bce-bangalore.edu.in`) — **Institution User** (Bangalore College of Engineering).
3. **Dr. Vikram Deshmukh** (`dean@pat-pune.ac.in`) — **Institution User** (Pune Academy of Technology).
4. **Dr. Sunil K. Mehta** (`reviewer.mehta@aicte-india.org`) — **Regulatory Reviewer** (Northern Region Scrutiny Officer).
5. **Dr. Priya Nair** (`reviewer.nair@aicte-india.org`) — **Regulatory Reviewer** (Southern Region Joint Director).
6. **Shri R. C. Verma** (`admin.verma@aicte-india.org`) — **Chief Administrator** (Regulation Bureau).

---

## 4. Local Development with Python FastAPI & MongoDB

To run the Python FastAPI backend locally:

### Windows PowerShell Setup Instructions

```powershell
# 1. Clone repository and navigate to backend
cd backend

# 2. Create Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Configure environment variables
Copy-Item .env.example .env

# 5. Start MongoDB Community Edition (if running locally on mongodb://localhost:27017)
# mongod --dbpath C:\data\db

# 6. Run automated pytest test suite
pytest tests/ -v

# 7. Start FastAPI Uvicorn Server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 5. Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build
```

---

## 6. Regulatory Disclaimer

**PROTOTYPE ONLY:** This software system is a functional technical prototype created for evaluation, research, and testing. It does not constitute official regulatory approval or endorsement by the All India Council for Technical Education (AICTE). Real statutory approvals require authorized scrutiny committee decisions in compliance with the prevailing AICTE Approval Process Handbook.

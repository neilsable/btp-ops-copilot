# SAP BTP Ops Copilot

SAP BTP Ops Copilot is a local-first MVP that converts SAP BTP-style platform logs into a decision-grade incident brief.

This project demonstrates how raw operational telemetry can be transformed into executive-ready insights for faster incident response and governance.

---

## Objectives

- Ingest SAP BTP-style logs and extract operational signals
- Identify severity, confidence, and likely root cause
- Generate executive-ready summaries and recommended actions
- Enable fast copy/export for leadership communication
- Remain fully free, local, and dependency-light

---

## What the Project Does

### 1. Log Ingestion
Parses log lines and extracts:
- Errors, warnings, timeouts
- HTTP 5xx responses
- Error rate
- Service and region hints

### 2. Incident Analysis
Generates:
- Severity (Low / Medium / High)
- Confidence level
- Executive one-liner
- Root cause hypothesis
- Recommended actions
- Business impact
- SAP BTP-native next steps

---

## Architecture

- Frontend: Next.js (App Router)
- API Routes:
  - /api/ingest
  - /api/analyze
- No external services
- No paid APIs

## Architecture

![SAP BTP Ops Copilot Architecture](docs/architecture.png)

---

## How to Run Locally

Install dependencies:
npm install

powershell
Copy code

Start the app:
npm run dev

Open in browser:
btp-ops-copilot-x7px.vercel.app

---

## Demo Flow

1. Upload a log file or paste log text
2. Logs are ingested and parsed
3. Click Generate
4. View executive-ready incident brief
5. Copy or export for sharing

---
## Screenshots

### Log Ingestion & Telemetry
![Dashboard](./docs:screenshots:dashboard.png)

### Generated Incident Brief
![Analysis](./docs:screenshots:analysis.png)

---
## Security Notice

Do not upload sensitive production data.
Remove secrets and PII before using logs.

---

## Author

Project created by 
**Neil Sable**.

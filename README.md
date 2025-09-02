# SelfCert Portal

Self-hosted certificate self‑service portal for issuing and managing user (client) certificates under internal Root / Intermediate CAs. Designed for Azure environments (Key Vault, Table Storage, Entra ID) but runs locally with zero external dependencies.

## ✨ Key Features

- Issue end‑entity certificates (Generate key pair server‑side or sign a user supplied CSR)
- Import existing self‑signed Root CAs (or generate new ones)
- Download certificate PEM or certificate+root bundle
- SAN (DNS / IP / email) extraction & display
- Automatic private key one‑time download & post‑issue security reminder
- Revoke certificates (idempotent) with download disabling
- Audit log (issue / revoke / root create / import) with filtering & pagination
- Root CA detail introspection (validity, SANs, key size, SHA‑256 fingerprint)
- OpenAPI 3 spec + Swagger UI (`/api/docs`)
- Accessibility improvements (focus traps, ARIA dialogs, keyboard navigation, toasts)
- Basic in‑memory rate limiting for issue/revoke
- Local JSON persistence fallback (no Azure account required for dev)

## 🏗 Architecture Overview

| Layer | Tech | Notes |
|-------|------|------|
| Frontend | React + Vite + Tailwind | SPA served separately (or behind App Gateway) |
| Backend | Node.js + Express + TypeScript | REST API + OpenAPI spec |
| PKI | node‑forge | Key & cert generation / signing |
| Secrets | Azure Key Vault (prod) / in‑memory (dev) | Stores private keys (root + issued when server generates) |
| Metadata | Azure Table Storage (prod) / JSON files (dev) | Tracks roots and issued certs |
| Auth | Entra ID (JWT Bearer) or dev fallback | Optional until TENANT_ID + API_AUDIENCE configured |

## 📂 Repository Structure

```
backend/    # Express API, services, OpenAPI spec
frontend/   # React SPA (Vite)
infra/      # Terraform (draft) for Azure resources
```

## 🚀 Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- (Optional) Azure subscription if you want to test Key Vault / Tables

### 1. Install Dependencies
```pwsh
cd backend; npm install
cd ../frontend; npm install
```

### 2. Run Backend (Dev Mode)
```pwsh
cd backend
npm run dev
```
API listens on `http://localhost:8080`.

### 3. Run Frontend
```pwsh
cd frontend
npm run dev
```
Frontend dev server (default Vite port, e.g. `http://localhost:5173`). It proxies `/api/*` if configured or you access API directly.

### 4. Open Swagger UI
Visit `http://localhost:8080/api/docs` for interactive API docs.

### 5. Demo Auth (No Entra Config)
When Entra is not configured the backend injects a demo user. You can simulate admin with headers:
```
Authorization: (omit)
x-demo-user: alice@example.com
x-demo-admin: true
```
In the SPA preview mode exposes admin sections without real login until you wire MSAL + consent.

## 🔐 Environment Variables (Backend)

| Variable | Purpose | Example |
|----------|---------|---------|
| PORT | API port | 8080 |
| TENANT_ID | Entra tenant for JWT validation | 00000000-0000-0000-0000-000000000000 |
| API_AUDIENCE | Expected aud (client/app ID) | api://selfcert-api |
| ADMIN_GROUP_IDS | Comma list of Entra group object IDs granting admin | id1,id2 |
| KEY_VAULT_URI | Azure Key Vault URI (enables real secret storage) | https://mykv.vault.azure.net/ |
| ROOTCAS_TABLE_NAME | Azure Table for Root CA metadata | RootCAs |
| CERTS_TABLE_NAME | Azure Table for issued certs (if implemented) | Certs |
| ISSUE_RATE_LIMIT_WINDOW_MS | Rate limit window | 3600000 |
| ISSUE_RATE_LIMIT_MAX | Max issues / window | 10 |
| REVOKE_RATE_LIMIT_WINDOW_MS | Rate limit window for revoke | 900000 |
| REVOKE_RATE_LIMIT_MAX | Max revokes / window | 5 |

If Key Vault / Tables vars are absent the service uses in‑memory + JSON persistence (`backend/data`).

### Frontend Environment Variables
Copy `frontend/.env.local.example` to `frontend/.env.local` and fill in real values. Only variables prefixed with `VITE_` are exposed to the browser.

| Variable | Purpose | Example |
|----------|---------|---------|
| VITE_TENANT_ID | Entra tenant (enables real login) | 00000000-0000-0000-0000-000000000000 |
| VITE_CLIENT_ID | Frontend SPA app (client) ID | 11111111-1111-1111-1111-111111111111 |
| VITE_API_SCOPE | Requested scope(s) / resource | api://your-api-app-id/.default |
| VITE_APP_NAME | Display name in UI | SelfCert Portal |

Backend sample file: `backend/.env.example`
Frontend sample file: `frontend/.env.local.example`

Never commit real `.env` or `.env.local` files; they are ignored via `.gitignore`.

## 🧪 Scripts

Backend:
| Script | Description |
|--------|-------------|
| `npm run dev` | Watch & run API (tsx) |
| `npm run build` | TypeScript build to `dist/` |
| `npm start` | Run compiled server |
| `npm run seed` | Seed sample roots & certs (if script implemented) |
| `npm run smoke` | Basic smoke test (issue/revoke) |

Frontend:
| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Type check + production build |
| `npm run preview` | Preview built assets |

## 🔑 PKI Behavior
- Root CA create: Generates 2048‑bit RSA self‑signed CA (5 year validity)
- Root CA import: Validates self‑signed CA, key match, basicConstraints cA=true
- End‑entity issue (generate): Returns private key once; key NOT stored after returning (only cert kept)
- End‑entity issue (CSR): Uses provided public key & requested SANs; private key never seen by server
- SANs supported: DNS, IP, email (displayed as normalized tags)
- Revocation: Marks record (no CRL/OCSP yet) — downloads disabled post revoke

## 📝 Audit Events
| Action | Description |
|--------|-------------|
| `rootca.create` | Generated a new root CA |
| `rootca.import` | Imported existing root CA |
| `cert.issue` | Issued end‑entity certificate |
| `cert.revoke` | Revoked certificate |

## 🧾 OpenAPI
The spec is served at `/api/docs.json` and rendered via Swagger UI at `/api/docs`. Schemas include: Certificate, RootCA, IssueCertificateResponse, IssueCertificateFromCSRResponse, RevokeCertificateResponse.

## 🛡 Security Notes (Current State)
Implemented:
- Bearer JWT validation (when Entra vars set)
- Rate limiting (in‑memory)
- Input validation (basic length & pattern checks)
- One‑time private key delivery

Planned / Recommended:
- Persistent rate limiting store (Redis / Table)
- CRL or OCSP distribution for revoked certs
- Key rotation & automated root rollover plan
- Stronger schema validation (e.g. Zod / JOI)
- CSP / security headers (Helmet)
- Integration tests & e2e security tests

## 🛠 Development Tips
- Use the CSR issuance path for integrating hardware tokens or external key managers.
- Ensure you capture and store the downloaded private key securely; it cannot be retrieved later.
- Adjust issuance validity/backdating by including `validDays` / `backdateDays` in request bodies.

## 🗺 Roadmap (Indicative)
- [ ] Enforce auth by default (remove preview mode)
- [ ] Intermediate CA support (sign imported CSR with existing root)
- [ ] CRL publication endpoint
- [ ] Optional OCSP responder stub
- [ ] UI persistence for filters via query params
- [ ] Test suite (unit + integration) & GitHub Actions CI
- [ ] Terraform completion (ACI, App Gateway, identities)
- [ ] Hard multi-tenant partitioning / scoping

## 🏗 Terraform (Draft)
Initial definitions live under `infra/terraform` (resource group, VNet, KV, ACR placeholder). Still to add: container groups, App Gateway, identities, storage resources, and automated app registrations.

## 🤝 Contributing
PRs and issues welcome. Please open an issue describing proposed changes before large contributions.

## 📄 License
Add a license of your choice (e.g. MIT) here before public release.

---

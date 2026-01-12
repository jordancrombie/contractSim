# ContractSim Project Plan

**Project:** ContractSim - Conditional Payment Coordination Service
**Status:** Phase 1 In Progress
**Last Updated:** 2026-01-11
**Decisions:** All 31 questions resolved ✅
**Repository:** https://github.com/jordancrombie/contractSim

---

## Overview

ContractSim enables conditional payments between parties based on agreed-upon conditions and external events. It integrates with the existing BSIM ecosystem (WSIM, BSIM, TransferSim) to provide escrow and settlement capabilities.

### Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Authentication** | WSIM Proxy | All mobile calls through WSIM; ContractSim trusts S2S auth |
| **User Identity** | `walletId` format | Consistent with TransferSim patterns (e.g., "WLLT-ABC123") |
| **Escrow Model** | User Account Hold | Reuses BSIM hold patterns, with proper "escrow" labeling |
| **Settlement** | Via TransferSim | All settlements route through TransferSim for consistency |
| **MVP Scope** | $100 max, templates + custom, admin dispute resolution |

See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) for full decision log.

---

## Architecture Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   mwsim     │────▶│    WSIM     │────▶│ ContractSim │
│  (Mobile)   │     │  (Proxy)    │     │(Coordinator)│
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐            ┌─────────────┐
             │    BSIM     │           │ TransferSim │            │   Oracles   │
             │  (Escrow)   │           │(Settlement) │            │  (Events)   │
             └─────────────┘           └─────────────┘            └─────────────┘
```

**Flow:**
1. User creates contract via mwsim → WSIM → ContractSim
2. ContractSim requests escrow holds from BSIM
3. Oracle reports condition outcome
4. ContractSim triggers settlement via TransferSim
5. WSIM sends push notifications to users

---

## Phase 1: Core Infrastructure

**Goal:** Basic wager flow between two users, test oracle, escrow holds

### ContractSim Tasks

| Task | Description | Dependencies | Status |
|------|-------------|--------------|--------|
| 1.1 | Project scaffolding (Express, Prisma, TypeScript) | None | **Complete** |
| 1.2 | Database schema (contracts, parties, conditions, escrows) | 1.1 | **Complete** |
| 1.3 | Contract CRUD API (`POST/GET /contracts`) | 1.2 | **Complete** |
| 1.4 | Contract state machine implementation | 1.2 | **Complete** |
| 1.5 | WSIM authentication middleware (S2S API key) | 1.1 | **Complete** |
| 1.6 | BSIM escrow integration (hold/release calls) | 1.3, BSIM-1.x | **Complete** |
| 1.7 | Test Oracle service (5-min game cycle) | 1.2 | **Complete** |
| 1.8 | Webhook receivers (BSIM, TransferSim) | 1.4 | **Complete** |
| 1.9 | Settlement trigger (calls TransferSim) | 1.4, TSIM-1.x | **Complete** |
| 1.10 | Audit logging (all state changes) | 1.3 | **Complete** |
| 1.11 | Idempotency key support | 1.3 | **Complete** |
| 1.12 | OpenAPI spec (docs/openapi.yaml) | 1.3 | Not Started |
| 1.13 | AsyncAPI spec for webhooks (docs/asyncapi.yaml) | 1.8 | Not Started |

### BSIM Team Dependencies

| Task | Description | ContractSim Needs | Status |
|------|-------------|-------------------|--------|
| BSIM-1.1 | Create `escrow_holds` table | Schema from proposal | **Complete** |
| BSIM-1.2 | `POST /api/escrow/hold` endpoint | Create escrow hold | **Complete** |
| BSIM-1.3 | `POST /api/escrow/:id/release` endpoint | Release to TransferSim | **Complete** |
| BSIM-1.4 | `POST /api/escrow/:id/return` endpoint | Return on cancel/expire | **Complete** |
| BSIM-1.5 | Balance calculation update (show escrowed) | Available balance reduction | **Complete** |
| BSIM-1.6 | Escrow transaction types in history | `ESCROW_HOLD`, `ESCROW_RELEASE`, `ESCROW_RETURN` | **Complete** |
| BSIM-1.7 | Webhook to ContractSim on escrow events | `escrow.held`, `escrow.expired` | **Complete** |

### WSIM Team Dependencies

| Task | Description | ContractSim Needs | Status |
|------|-------------|-------------------|--------|
| WSIM-1.1 | Contract proxy endpoints | `POST/GET /api/mobile/contracts` | **Complete** |
| WSIM-1.2 | Profile lookup for ContractSim | `GET /api/internal/contracts/profile/:walletId` | **Complete** |
| WSIM-1.3 | Alias resolution for counterparty | Resolve @alias to walletId | **Complete** |
| WSIM-1.4 | Webhook handler for contract events | `POST /api/webhooks/contractsim` | **Complete** |
| WSIM-1.5 | Contract notification templates | 8 notification types | **Complete** |

### TransferSim Team Dependencies

| Task | Description | ContractSim Needs | Status |
|------|-------------|-------------------|--------|
| TSIM-1.1 | Add `CONTRACT_SETTLEMENT` transfer type | New enum value | **Complete** |
| TSIM-1.2 | Settlement endpoint (`POST /api/v1/settlements`) | Accept contract metadata, idempotency | **Complete** |
| TSIM-1.3 | Webhook to ContractSim on settlement complete | `settlement.completed`/`settlement.failed` events | **Complete** |

### Phase 1 Deliverables

- [ ] ContractSim service running locally
- [ ] Can create a contract between two test users
- [ ] Escrow holds created in BSIM
- [ ] Test Oracle generates events every 5 minutes
- [ ] Settlement executes via TransferSim
- [ ] All operations have audit logs
- [ ] OpenAPI + AsyncAPI specs complete

---

## Phase 2: Multi-Bank & Full Settlement

**Goal:** Cross-bank wagers, complete settlement flow, contract history

### ContractSim Tasks

| Task | Description | Dependencies | Status |
|------|-------------|--------------|--------|
| 2.1 | Multi-bank escrow coordination | Phase 1 complete | Not Started |
| 2.2 | Settlement via TransferSim (cross-bank) | TSIM-1.x | Not Started |
| 2.3 | Winner/loser notification flow | WSIM webhooks | Not Started |
| 2.4 | Contract history/archive | 2.1 | Not Started |
| 2.5 | Contract cancellation API | 2.1 | Not Started |
| 2.6 | Funding timeout handling | 2.1 | Not Started |
| 2.7 | Partial funding scenarios | 2.1 | Not Started |

### Phase 2 Deliverables

- [ ] Cross-bank contracts work (User A at BSIM, User B at NewBank)
- [ ] Full settlement flow tested end-to-end
- [ ] Contract history viewable in mwsim
- [ ] Timeout/cancellation scenarios handled

---

## Phase 3: Oracle Integration

**Goal:** Real external data sources, event browsing

### ContractSim Tasks

| Task | Description | Dependencies | Status |
|------|-------------|--------------|--------|
| 3.1 | Oracle registry and management | Phase 2 complete | Not Started |
| 3.2 | Sports API oracle integration | External API | Not Started |
| 3.3 | Oracle event query API | 3.1 | Not Started |
| 3.4 | Event browser backend | 3.3 | Not Started |
| 3.5 | Multiple oracle support per contract | 3.1 | Not Started |

### WSIM/mwsim Dependencies

| Task | Description | Status |
|------|-------------|--------|
| WSIM-3.1 | Event browser UI in mwsim | Not Started |
| WSIM-3.2 | Contract creation with event selection | Not Started |

### Phase 3 Deliverables

- [ ] At least one real oracle integrated (sports or similar)
- [ ] Users can browse upcoming events
- [ ] Contracts can reference real external events

---

## Phase 4: Disputes & Production Readiness

**Goal:** Dispute handling, admin tools, production hardening

### ContractSim Tasks

| Task | Description | Dependencies | Status |
|------|-------------|--------------|--------|
| 4.1 | Dispute submission API | Phase 3 complete | Not Started |
| 4.2 | Admin resolution interface | 4.1 | Not Started |
| 4.3 | Dispute evidence storage | 4.1 | Not Started |
| 4.4 | Partial settlement support | 4.2 | Not Started |
| 4.5 | Rate limiting | 4.1 | Not Started |
| 4.6 | Metrics/monitoring | 4.1 | Not Started |
| 4.7 | Load testing | 4.1 | Not Started |

### Phase 4 Deliverables

- [ ] Users can dispute outcomes
- [ ] Admin panel for resolution
- [ ] Production-ready performance
- [ ] Monitoring and alerting in place

---

## Documentation Deliverables

| Document | Location | Phase |
|----------|----------|-------|
| OpenAPI Spec | `docs/openapi.yaml` | 1 |
| AsyncAPI Spec | `docs/asyncapi.yaml` | 1 |
| Contract Flow Diagram | `docs/FLOW_CONTRACT_LIFECYCLE.md` | 1 |
| Settlement Flow | `docs/FLOW_SETTLEMENT.md` | 2 |
| Oracle Integration Guide | `docs/ORACLE_INTEGRATION.md` | 3 |
| BSIM Integration Guide | `docs/INTEGRATION_BSIM.md` | 1 |
| WSIM Integration Guide | `docs/INTEGRATION_WSIM.md` | 1 |

---

## Decisions Finalized (2026-01-11)

All 31 questions from [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) have been resolved. Key decisions:

| Area | Decision |
|------|----------|
| **Auth** | WSIM Proxy - all mobile calls through WSIM |
| **User ID** | `walletId` format (e.g., "WLLT-ABC123") |
| **Profile Data** | ContractSim calls WSIM internal profile API |
| **Alias Resolution** | WSIM resolves before calling ContractSim |
| **Push Notifications** | ContractSim webhooks → WSIM sends push |
| **Escrow Model** | User Account Hold with "escrow" labeling |
| **Escrow Schema** | New `EscrowHold` model (not PendingTransaction) |
| **Hold Expiry** | Auto-return to user + notify ContractSim |
| **Settlement** | All via TransferSim (same-bank and cross-bank) |
| **Transfer Type** | New `CONTRACT_SETTLEMENT` type |
| **Webhooks** | At-least-once with idempotency keys |
| **Funding Timeout** | 48 hours default |
| **Currency** | CAD only for MVP |
| **Max Value** | $100 for MVP |

---

## Integration Configuration (Development)

### BSIM ↔ ContractSim

**BSIM Escrow API credentials for ContractSim team:**

| Variable | Value | Used By |
|----------|-------|---------|
| `BSIM_ESCROW_API_KEY` | `99c33341e8817841833a6140027b83542f81e5d509b55d03d2fe7a2be212e72a` | ContractSim → BSIM |
| `BSIM_ESCROW_URL` | `https://dev.banksim.ca/api/escrow` | ContractSim → BSIM |
| `BSIM_WEBHOOK_SECRET` | `831b2e41c25cd9f87f80f2b9f186cc9a8d349a9a2690aac0d6d4b5ab636e458a` | BSIM → ContractSim |
| `BSIM_WEBHOOK_URL` | `https://contract-dev.banksim.ca/webhooks/bsim` | BSIM → ContractSim |

**ContractSim must send:**
- Header: `X-API-Key: <BSIM_ESCROW_API_KEY>` on all escrow API calls

**ContractSim must verify:**
- Incoming webhooks from BSIM signed with `X-BSIM-Signature` header (HMAC-SHA256 of body using `BSIM_WEBHOOK_SECRET`)

---

### WSIM ↔ ContractSim

**WSIM Environment Variables (add to WSIM .env / pipeline):**

| Variable | Dev Value | Prod Value | Description |
|----------|-----------|------------|-------------|
| `CONTRACTSIM_API_URL` | `https://contract-dev.banksim.ca` | `https://contract.banksim.ca` | ContractSim service URL |
| `CONTRACTSIM_API_KEY` | `wsim-contractsim-dev-key-2026` | `wsim-contractsim-prod-a8f3e2c91d7b4e6a5c3f1d8e9b2a7c4d` | API key for WSIM → ContractSim calls |
| `CONTRACTSIM_WEBHOOK_SECRET` | `contractsim-webhook-secret-dev-2026` | `contractsim-webhook-prod-7b2f4e8d1a9c3f6e5d8b2a7c4e1f9d3b` | HMAC secret for ContractSim → WSIM webhooks |

**Status:** Added to WSIM pipeline-dev.yaml and pipeline-prod.yaml (2026-01-11)

**ContractSim Environment Variables (for WSIM integration):**

| Variable | Dev Value | Description |
|----------|-----------|-------------|
| `WSIM_API_KEY` | `wsim-contractsim-dev-key-2026` | Must match WSIM's `CONTRACTSIM_API_KEY` |
| `WSIM_WEBHOOK_URL` | `https://wsim-dev.banksim.ca/api/webhooks/contractsim` | WSIM webhook endpoint |
| `WSIM_WEBHOOK_SECRET` | `contractsim-webhook-secret-dev-2026` | Must match WSIM's `CONTRACTSIM_WEBHOOK_SECRET` |
| `WSIM_PROFILE_URL` | `https://wsim-dev.banksim.ca/api/internal/contracts/profile` | Profile lookup endpoint |

**WSIM Authentication:**
- ContractSim → WSIM profile API: Header `X-Internal-Api-Key: <INTERNAL_API_SECRET>` (WSIM's existing internal API key)
- WSIM → ContractSim API: Header `X-API-Key: <CONTRACTSIM_API_KEY>` + `X-Wallet-Id: <user_wallet_id>`

**WSIM Webhook Verification:**
- ContractSim must sign webhooks with `X-Webhook-Signature: sha256=<hmac>` using `WSIM_WEBHOOK_SECRET`
- WSIM verifies signature before processing

**WSIM Database Changes:** None required. Uses existing tables:
- `WalletUser` - for profile lookup by walletId
- `BsimEnrollment` - for alias resolution
- `MobileDevice` - for push notifications
- `NotificationLog` - for idempotency

**WSIM Code Changes:** Complete (branch `transferSim-support`)
- New routes: `/api/mobile/contracts/*`, `/api/internal/contracts/profile/:walletId`
- New webhook: `/api/webhooks/contractsim`
- New notification types: 8 contract event types

---

### DNS Entries Required

```
127.0.0.1 contract-dev.banksim.ca
127.0.0.1 wsim-dev.banksim.ca
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| BSIM escrow API delays | Blocks Phase 1 | Early coordination, mock endpoints |
| TransferSim settlement changes | Blocks settlement | Define interface early |
| Oracle reliability | Bad UX | Test oracle as fallback |
| Scope creep | Delays | Strict MVP boundaries |

---

## Communication

### File-Based Collaboration

All teams can access specs and plans at:
```
/Users/jcrombie/ai/contractSim/
├── LOCAL_DEPLOYMENT_PLANS/
│   ├── PROJECT_PLAN.md          ← This file
│   ├── OPEN_QUESTIONS.md        ← Decision log
│   └── PROPOSAL_CONTRACTSIM.md  ← Original proposal
└── docs/
    ├── openapi.yaml             ← API spec (coming)
    ├── asyncapi.yaml            ← Webhook spec (coming)
    └── FLOW_*.md                ← Flow diagrams (coming)
```

### Status Updates

Update task status in this file as work progresses. Use:
- `Not Started` - Work not begun
- `In Progress` - Actively working
- `Blocked` - Waiting on dependency
- `Complete` - Done and verified

---

## Next Steps

1. **Database Setup** - See Database Actions below
2. **Integration Testing** - Test with BSIM/WSIM/TransferSim
3. **OpenAPI/AsyncAPI Specs** - Document APIs
4. **CI/CD Pipeline** - Buildkite configuration in `.buildkite/`

---

## Database Actions (For Deployment Team)

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL server
psql -U postgres

# Create database
CREATE DATABASE contractsim;

# Create user (if needed)
CREATE USER contractsim_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE contractsim TO contractsim_user;

# Exit
\q
```

### 2. Set Environment Variables

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Update with actual values:

```env
# Database
DATABASE_URL="postgresql://contractsim_user:your_secure_password_here@localhost:5432/contractsim?schema=public"

# Server
PORT=3003
NODE_ENV=development

# Service Authentication (S2S API Keys) - coordinate with other teams
WSIM_API_KEY=<get_from_wsim_team>
BSIM_API_KEY=99c33341e8817841833a6140027b83542f81e5d509b55d03d2fe7a2be212e72a
TRANSFERSIM_API_KEY=<get_from_transfersim_team>

# External Service URLs
WSIM_URL=https://wsim-dev.banksim.ca
BSIM_URL=https://dev.banksim.ca
TRANSFERSIM_URL=https://transfer-dev.banksim.ca

# Contract Defaults
DEFAULT_FUNDING_TIMEOUT_HOURS=48
MAX_CONTRACT_VALUE=100.00
DEFAULT_CURRENCY=CAD
```

### 3. Run Prisma Migrations

```bash
# Generate Prisma client
npm run prisma:generate

# Create initial migration
npx prisma migrate dev --name init

# For production/staging deployment
npm run prisma:deploy
```

### 4. Verify Database Schema

After migration, verify tables exist:

```bash
npx prisma studio
```

Expected tables:
- `Contract`
- `ContractParty`
- `Condition`
- `ContractOutcome`
- `Dispute`
- `Oracle`
- `OracleEvent`
- `AuditLog`
- `WebhookDelivery`
- `IdempotencyKey`

### 5. DNS Configuration

Add to local `/etc/hosts` or DNS:

```
127.0.0.1 contract-dev.banksim.ca
```

### 6. Start the Service

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

### 7. Verify Health

```bash
curl http://localhost:3003/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "contractsim",
  "timestamp": "2026-01-11T..."
}
```

---

## Development Deployment Notes (2026-01-11)

This section documents all changes made during the initial dev environment deployment. Use this as a guide for production deployment.

### Issues Encountered and Fixes

#### 1. Container Entry Point Mismatch

**Problem:** Container crashed with `Cannot find module '/app/dist/index.js'`

**Root Cause:** `docker-compose.yml` command specified `node dist/index.js` but actual entry point is `dist/server.js`

**Fix:** Updated `docker-compose.yml`:
```yaml
command: >
  sh -c "
    echo 'Waiting for database...' &&
    npx prisma generate &&
    npx prisma migrate deploy &&
    node dist/server.js    # Changed from index.js
  "
```

#### 2. Port Configuration Mismatch

**Problem:** Dockerfile exposed port 3003 but docker-compose used port 3020

**Fix:** Updated `Dockerfile`:
```dockerfile
EXPOSE 3020
HEALTHCHECK ... CMD wget ... http://localhost:3020/health
```

#### 3. Route Path Mismatch (404 Error)

**Problem:** WSIM calls `/contracts` but ContractSim routes were at `/api/v1/contracts`

**Fix:** Added route alias in `src/server.ts`:
```typescript
// API v1
app.use('/api/v1/contracts', contractRoutes);

// Alias routes for WSIM compatibility
app.use('/contracts', contractRoutes);
```

#### 4. Missing Database Migrations

**Problem:** Tables didn't exist because no Prisma migrations were created

**Fix:** Created `prisma/migrations/20260111000000_init/migration.sql` with full schema

#### 5. API Key Authentication Failure (401 Error)

**Problem:** WSIM's API key was rejected because `WSIM_API_KEY` wasn't set in ContractSim

**Fix:** Added API keys to `docker-compose.dev.yml`:
```yaml
environment:
  WSIM_API_KEY: wsim-contractsim-dev-key-2026
  BSIM_API_KEY: 99c33341e8817841833a6140027b83542f81e5d509b55d03d2fe7a2be212e72a
  TRANSFERSIM_API_KEY: transfersim-contractsim-dev-key-2026
```

### Files Modified for Dev Deployment

| File | Changes |
|------|---------|
| `Dockerfile` | Port 3003→3020, healthcheck updated |
| `docker-compose.yml` | Entry point `index.js`→`server.js` |
| `docker-compose.dev.yml` | Added API keys, fixed service URLs |
| `src/server.ts` | Added `/contracts` route alias |
| `prisma/migrations/` | Created initial migration |

### BSIM Changes Required

| File | Changes |
|------|---------|
| `nginx/nginx.dev.conf` | Added server block for `contract-dev.banksim.ca` |
| `backend/prisma/schema.prisma` | Added EscrowHold model, EscrowStatus enum |
| `backend/src/routes/escrowRoutes.ts` | New escrow API endpoints |
| `backend/src/services/EscrowService.ts` | Escrow business logic |
| `backend/docker-compose.dev.yml` | Added ContractSim env vars |

### WSIM Changes Required

| File | Changes |
|------|---------|
| `.buildkite/pipeline-dev.yaml` | Added CONTRACTSIM_* env vars to backend |
| `.buildkite/pipeline-prod.yaml` | Added CONTRACTSIM_* env vars to backend |

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] Generate production API keys (use secure random values, not dev keys)
- [ ] Create ContractSim database in production RDS
- [ ] Add `contract.banksim.ca` DNS entry
- [ ] Add nginx server block for `contract.banksim.ca` in production

### ContractSim Production Environment Variables

| Variable | Production Value | Notes |
|----------|------------------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | `3020` | |
| `DATABASE_URL` | `postgresql://...@bsim-db.xxx.rds.amazonaws.com:5432/contractsim` | Use RDS URL |
| `WSIM_API_KEY` | `wsim-contractsim-prod-a8f3e2c91d7b4e6a5c3f1d8e9b2a7c4d` | Must match WSIM's CONTRACTSIM_API_KEY |
| `BSIM_API_KEY` | (generate secure key) | Coordinate with BSIM team |
| `TRANSFERSIM_API_KEY` | (generate secure key) | Coordinate with TransferSim team |
| `WSIM_URL` | `https://wsim.banksim.ca` | |
| `BSIM_URL` | `https://banksim.ca` | |
| `TRANSFERSIM_URL` | `https://transfer.banksim.ca` | |

### WSIM Production Config (Already Added)

```
CONTRACTSIM_API_URL=https://contract.banksim.ca
CONTRACTSIM_API_KEY=wsim-contractsim-prod-a8f3e2c91d7b4e6a5c3f1d8e9b2a7c4d
CONTRACTSIM_WEBHOOK_SECRET=contractsim-webhook-prod-7b2f4e8d1a9c3f6e5d8b2a7c4e1f9d3b
```

### Deployment Steps

1. **Create ECR repository** (if not exists):
   ```bash
   aws ecr create-repository --repository-name bsim/contractsim --region ca-central-1
   ```

2. **Build and push image**:
   ```bash
   cd /path/to/contractSim
   docker build --no-cache --platform linux/amd64 \
     -t 301868770392.dkr.ecr.ca-central-1.amazonaws.com/bsim/contractsim:latest .
   aws ecr get-login-password --region ca-central-1 | docker login --username AWS --password-stdin 301868770392.dkr.ecr.ca-central-1.amazonaws.com
   docker push 301868770392.dkr.ecr.ca-central-1.amazonaws.com/bsim/contractsim:latest
   ```

3. **Create database** (via ECS one-off task):
   ```sql
   CREATE DATABASE contractsim;
   ```

4. **Run migrations** (via SSM or ECS task):
   ```bash
   npx prisma migrate deploy
   ```

5. **Deploy container via SSM**:
   ```bash
   aws ssm send-command \
     --instance-ids "i-0d45924915c774799" \
     --document-name "AWS-RunShellScript" \
     --parameters 'commands=[
       "cd /opt/bsim",
       "docker pull 301868770392.dkr.ecr.ca-central-1.amazonaws.com/bsim/contractsim:latest",
       "docker run -d --name bsim-contractsim --network bsim_default -p 3020:3020 -e NODE_ENV=production -e PORT=3020 -e DATABASE_URL=... -e WSIM_API_KEY=... ... 301868770392.dkr.ecr.ca-central-1.amazonaws.com/bsim/contractsim:latest"
     ]' \
     --region ca-central-1
   ```

6. **Verify deployment**:
   ```bash
   curl https://contract.banksim.ca/health
   ```

### Post-Deployment

- [ ] Verify health endpoint returns OK
- [ ] Test from WSIM mobile app - contracts list should load
- [ ] Create test contract to verify full flow
- [ ] Monitor logs for errors

---

*Plan created: 2026-01-11*
*Last updated: 2026-01-12*

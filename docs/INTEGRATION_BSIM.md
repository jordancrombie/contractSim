# BSIM Integration Guide

**Status:** Draft
**Last Updated:** 2026-01-11

This document outlines what BSIM needs to implement to support ContractSim escrow functionality.

---

## Overview

ContractSim requires BSIM to:
1. Hold funds in escrow when contracts are funded
2. Release funds to TransferSim for settlement
3. Return funds when contracts are cancelled/expired
4. Display escrow transactions in user history

## Key Decisions

| Decision | Choice |
|----------|--------|
| Escrow Model | User Account Hold (not sub-account) |
| Labeling | Display as "Escrow" not "Pending" |
| Settlement | Via TransferSim (not direct transfer) |

---

## Required Endpoints

### 1. Create Escrow Hold

```http
POST /api/escrow/hold
Authorization: Bearer {contractsim_api_key}
Content-Type: application/json

{
  "user_id": "user_123",
  "account_id": "account_456",
  "amount": 50.00,
  "currency": "CAD",
  "contract_id": "contract_abc123",
  "contract_service": "contractsim",
  "hold_type": "escrow",
  "expires_at": "2026-02-10T00:00:00Z",
  "description": "Escrow for: Superbowl 2026 Bet"
}
```

**Response:**
```json
{
  "escrow_id": "escrow_xyz789",
  "status": "held",
  "amount": 50.00,
  "available_balance": 450.00,
  "escrowed_balance": 50.00,
  "created_at": "2026-01-11T12:10:00Z"
}
```

**Notes:**
- Must reduce `available_balance` immediately
- Must be visible as "Escrow" in transaction history
- Must include `contract_id` for traceability

---

### 2. Release Escrow (Settlement)

```http
POST /api/escrow/{escrow_id}/release
Authorization: Bearer {contractsim_api_key}
Content-Type: application/json

{
  "release_type": "settlement",
  "transfer_reference": "transfer_xyz789",
  "contract_id": "contract_abc123",
  "reason": "contract_settlement"
}
```

**Response:**
```json
{
  "escrow_id": "escrow_xyz789",
  "status": "released",
  "released_at": "2026-02-10T03:05:00Z",
  "transfer_reference": "transfer_xyz789"
}
```

**Notes:**
- Called AFTER TransferSim confirms settlement
- Escrow funds become the source for the transfer
- Transaction history shows "Escrow Released - Settlement"

---

### 3. Return Escrow (Cancel/Expire)

```http
POST /api/escrow/{escrow_id}/return
Authorization: Bearer {contractsim_api_key}
Content-Type: application/json

{
  "reason": "contract_cancelled",
  "contract_id": "contract_abc123"
}
```

**Response:**
```json
{
  "escrow_id": "escrow_xyz789",
  "status": "returned",
  "returned_at": "2026-01-12T10:00:00Z",
  "available_balance": 500.00
}
```

**Notes:**
- Funds return to `available_balance`
- Transaction history shows "Escrow Returned - Contract Cancelled"

---

### 4. Get Escrow Status

```http
GET /api/escrow/{escrow_id}
Authorization: Bearer {contractsim_api_key}
```

**Response:**
```json
{
  "escrow_id": "escrow_xyz789",
  "status": "held",
  "amount": 50.00,
  "currency": "CAD",
  "contract_id": "contract_abc123",
  "user_id": "user_123",
  "account_id": "account_456",
  "created_at": "2026-01-11T12:10:00Z",
  "expires_at": "2026-02-10T00:00:00Z"
}
```

---

## Database Schema (Proposed)

```sql
CREATE TABLE escrow_holds (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  account_id UUID NOT NULL REFERENCES accounts(id),

  contract_id VARCHAR(100) NOT NULL,
  contract_service VARCHAR(50) NOT NULL DEFAULT 'contractsim',

  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'CAD',

  status VARCHAR(20) NOT NULL DEFAULT 'held',
  -- Values: 'pending', 'held', 'released', 'returned', 'expired'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,

  release_type VARCHAR(20),
  transfer_reference VARCHAR(100),

  description TEXT,

  UNIQUE (contract_id, user_id)
);
```

---

## Transaction History Display

New transaction types for statement display:

| Type | Display | Example |
|------|---------|---------|
| `ESCROW_HOLD` | "Escrow Hold - {description}" | "Escrow Hold - Superbowl 2026 Bet" |
| `ESCROW_RELEASE` | "Escrow Released - Settlement" | "Escrow Released - Settlement" |
| `ESCROW_RETURN` | "Escrow Returned - {reason}" | "Escrow Returned - Contract Cancelled" |

---

## Webhooks to ContractSim

BSIM should send webhooks for:

### escrow.held
```json
{
  "event_id": "evt_123",
  "event_type": "escrow.held",
  "timestamp": "2026-01-11T12:10:00Z",
  "data": {
    "escrow_id": "escrow_xyz789",
    "contract_id": "contract_abc123",
    "user_id": "user_123",
    "amount": 50.00
  }
}
```

### escrow.expired
```json
{
  "event_id": "evt_456",
  "event_type": "escrow.expired",
  "timestamp": "2026-02-10T00:01:00Z",
  "data": {
    "escrow_id": "escrow_xyz789",
    "contract_id": "contract_abc123",
    "user_id": "user_123"
  }
}
```

**Webhook URL:** `https://contract.banksim.ca/webhooks/bsim`

---

## Authentication

ContractSim will authenticate using service-to-service API key:

```
X-API-Key: {contractsim_service_key}
```

Key will be provisioned during deployment setup.

---

## Open Questions for BSIM Team

1. Should escrow holds have a minimum/maximum amount?
2. What's the max escrow duration allowed?
3. Should expired escrows auto-return or require explicit action?
4. Do you need additional fields in the webhook payload?

---

## Timeline

| Task | Target |
|------|--------|
| Schema finalized | Phase 1 |
| Hold endpoint | Phase 1 |
| Release/Return endpoints | Phase 1 |
| Transaction history types | Phase 1 |
| Webhooks | Phase 1 |

---

*Document created: 2026-01-11*

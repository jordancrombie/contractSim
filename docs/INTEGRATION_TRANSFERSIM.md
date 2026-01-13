# TransferSim Integration Guide

**Status:** Draft
**Last Updated:** 2026-01-11

This document outlines what TransferSim needs to implement to support ContractSim settlements.

---

## Overview

TransferSim handles the **settlement transfer** when a contract resolves. ContractSim calls TransferSim to move funds from the loser to the winner, even if they're at different banks.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Settlement Routing | All settlements via TransferSim (including same-bank) |
| Transfer Type | New `CONTRACT_SETTLEMENT` type |
| Notification | TransferSim webhooks to ContractSim (not WSIM) |

---

## Settlement Flow

```
ContractSim                    TransferSim                    BSIM
     │                              │                           │
     │  1. POST /settlements        │                           │
     ├─────────────────────────────>│                           │
     │                              │                           │
     │                              │  2. Debit loser           │
     │                              ├──────────────────────────>│
     │                              │<─────── OK ───────────────┤
     │                              │                           │
     │                              │  3. Credit winner         │
     │                              ├──────────────────────────>│
     │                              │<─────── OK ───────────────┤
     │                              │                           │
     │  4. Settlement complete      │                           │
     │<─────────────────────────────┤                           │
     │                              │                           │
     │  5. Release escrows          │                           │
     ├──────────────────────────────────────────────────────────>
```

---

## Required Endpoint

### Create Settlement

```http
POST /api/v1/settlements
Authorization: X-API-Key: {contractsim_key}
Idempotency-Key: {uuid}
Content-Type: application/json

{
  "contract_id": "contract_abc123",
  "settlement_type": "winner_payout",

  "from": {
    "wallet_id": "WLLT-ABC123",
    "bank_id": "bsim",
    "escrow_id": "escrow_loser_123"
  },

  "to": {
    "wallet_id": "WLLT-XYZ789",
    "bank_id": "newbank"
  },

  "amount": 100.00,
  "currency": "CAD",

  "metadata": {
    "contract_title": "Superbowl 2026 Bet",
    "original_stake": 50.00,
    "winnings": 50.00,
    "loser_display_name": "John",
    "winner_display_name": "Jane"
  }
}
```

**Response:**
```json
{
  "settlement_id": "settlement_xyz789",
  "transfer_id": "transfer_abc123",
  "status": "completed",
  "amount": 100.00,
  "from_wallet_id": "WLLT-ABC123",
  "to_wallet_id": "WLLT-XYZ789",
  "completed_at": "2026-02-10T03:05:00Z"
}
```

---

## Transfer Type

Add new transfer type enum:

```typescript
type TransferType =
  | 'P2P'
  | 'MERCHANT'
  | 'REFUND'
  | 'CONTRACT_SETTLEMENT';  // New
```

Benefits:
- Clear filtering in transaction history
- Distinct UI treatment in mwsim
- Contract-specific reporting

---

## Transfer Metadata Schema

Extend Transfer model with contract metadata:

```typescript
interface SettlementMetadata {
  contract_id: string;
  contract_title: string;
  settlement_type: 'winner_payout' | 'refund' | 'partial' | 'dispute_resolution';
  original_stake: number;
  winnings: number;
  loser_display_name?: string;
  winner_display_name?: string;
}
```

---

## Profile Images

For settlement transfers, map parties as:

| Role | Transfer Role | Profile Image |
|------|---------------|---------------|
| Loser | Sender | Loser's profile |
| Winner | Recipient | Winner's profile |

This matches user expectations in transaction history:
- Winner sees: "Received from John - Contract Settlement"
- Loser sees: "Sent to Jane - Contract Settlement"

---

## Webhook to ContractSim

After settlement completes, send webhook:

**Endpoint:** `POST https://contract.banksim.ca/webhooks/transfersim`

**Authentication:** HMAC-SHA256 signature via `X-Webhook-Signature` header

```http
POST /webhooks/transfersim
Content-Type: application/json
X-Webhook-Signature: {hmac_sha256_hex}
```

The signature is computed as:
```javascript
const signature = crypto
  .createHmac('sha256', process.env.CONTRACTSIM_WEBHOOK_SECRET)
  .update(JSON.stringify(body))
  .digest('hex');
```

**Payload:**
```json
{
  "event_id": "evt_123",
  "event_type": "settlement.completed",
  "timestamp": "2026-02-10T03:05:00Z",
  "data": {
    "settlement_id": "settlement_xyz789",
    "transfer_id": "transfer_abc123",
    "contract_id": "contract_abc123",
    "status": "completed",
    "amount": 100.00,
    "from_wallet_id": "WLLT-ABC123",
    "to_wallet_id": "WLLT-XYZ789"
  }
}
```

**Failed settlement:**
```json
{
  "event_type": "settlement.failed",
  "data": {
    "settlement_id": "settlement_xyz789",
    "contract_id": "contract_abc123",
    "status": "failed",
    "error": "insufficient_funds",
    "error_message": "Escrow hold not found or expired"
  }
}
```

---

## Error Handling

| Error | Code | Description |
|-------|------|-------------|
| `ESCROW_NOT_FOUND` | 404 | Escrow ID doesn't exist |
| `ESCROW_EXPIRED` | 410 | Escrow already expired |
| `INSUFFICIENT_FUNDS` | 402 | Escrow amount doesn't match |
| `BANK_UNAVAILABLE` | 503 | Target bank not reachable |
| `DUPLICATE_SETTLEMENT` | 409 | Settlement already processed (idempotency) |

On failure, ContractSim will handle retry/compensation logic.

---

## Idempotency

Settlement requests MUST be idempotent. Use `Idempotency-Key` header:

- If same key sent twice, return cached result
- Key should be `{contract_id}_{settlement_attempt}`
- Store idempotency keys for at least 24 hours

---

## Alternative: Extend Existing Transfer Endpoint

If a separate `/settlements` endpoint is too much, extend `/transfers`:

```http
POST /api/v1/transfers
{
  "type": "CONTRACT_SETTLEMENT",
  "contract_id": "contract_abc123",
  "from_wallet_id": "WLLT-ABC123",
  "to_wallet_id": "WLLT-XYZ789",
  "amount": 100.00,
  "metadata": { ... }
}
```

Either approach works - team preference.

---

## Authentication

ContractSim authenticates using service-to-service API key:

```
X-API-Key: {contractsim_service_key}
```

Key will be provisioned during deployment setup.

---

## Open Questions for TransferSim Team

1. Separate `/settlements` endpoint or extend `/transfers`?
2. Should settlement have different rate limits than P2P?
3. Batch settlements needed? (multiple contracts settling at once)
4. Do you need additional fields in the request?

---

## Timeline

| Task | Target |
|------|--------|
| Transfer type added | Phase 1 |
| Settlement endpoint | Phase 1 |
| Metadata schema | Phase 1 |
| Webhook to ContractSim | Phase 1 |
| Profile image handling | Phase 2 |

---

*Document created: 2026-01-11*

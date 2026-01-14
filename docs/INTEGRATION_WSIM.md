# WSIM Integration Guide

**Status:** Draft
**Last Updated:** 2026-01-14

This document outlines what WSIM needs to implement to support ContractSim.

---

## Overview

WSIM acts as the **proxy layer** between mwsim (mobile) and ContractSim. WSIM is responsible for:
1. Proxying contract API calls from mobile
2. Enriching requests with user profile data
3. Resolving counterparty aliases
4. Handling push notifications for contract events

## Key Decisions

| Decision | Choice |
|----------|--------|
| Auth Model | WSIM Proxy (mobile never calls ContractSim directly) |
| User Identity | `walletId` format (e.g., "WLLT-ABC123") |
| Notifications | ContractSim sends webhooks, WSIM sends push |

---

## Required Proxy Endpoints

WSIM exposes these endpoints to mwsim, then proxies to ContractSim:

### 1. Create Contract

```http
POST /api/mobile/contracts
Authorization: Bearer {user_jwt}
Content-Type: application/json

{
  "type": "wager",
  "counterparty_alias": "@jane",
  "title": "Superbowl 2026 Bet",
  "event": {
    "oracle": "test_oracle",
    "event_id": "test_game_001",
    "my_prediction": "team_a_wins"
  },
  "my_stake": 50.00,
  "their_stake": 50.00,
  "expires_in_hours": 24
}
```

**WSIM Processing:**
1. Validate user JWT
2. Resolve `@jane` to `walletId` via alias lookup
3. Fetch user profile (display_name, bank_id)
4. Call ContractSim with enriched data
5. Return response to mobile

**To ContractSim:**
```json
{
  "type": "wager",
  "title": "Superbowl 2026 Bet",
  "parties": [
    {
      "wallet_id": "WLLT-ABC123",
      "bank_id": "bsim",
      "display_name": "John",
      "role": "creator",
      "stake": { "amount": 50.00, "currency": "CAD" }
    },
    {
      "wallet_id": "WLLT-XYZ789",
      "bank_id": "bsim",
      "display_name": "Jane",
      "role": "counterparty",
      "stake": { "amount": 50.00, "currency": "CAD" }
    }
  ],
  "conditions": [...],
  "expires_at": "2026-01-12T12:00:00Z"
}
```

---

### 2. List User's Contracts

```http
GET /api/mobile/contracts
Authorization: Bearer {user_jwt}
Query: ?status=active,proposed
```

**WSIM Processing:**
1. Get user's `walletId` from JWT
2. Call ContractSim `GET /contracts?wallet_id={walletId}&status=...`
3. Return contracts to mobile

---

### 3. Get Contract Details

```http
GET /api/mobile/contracts/{contract_id}
Authorization: Bearer {user_jwt}
```

---

### 4. Accept Contract

```http
POST /api/mobile/contracts/{contract_id}/accept
Authorization: Bearer {user_jwt}

{
  "consent": true
}
```

**WSIM Processing:**
1. Verify user is the counterparty
2. Record consent timestamp
3. Call ContractSim accept endpoint

---

### 5. Fund Contract

```http
POST /api/mobile/contracts/{contract_id}/fund
Authorization: Bearer {user_jwt}

{
  "account_id": "account_456"
}
```

**WSIM Processing:**
1. Verify user has BSIM enrollment for this account
2. Look up user's `bsimUserId` from enrollment record
3. Call ContractSim fund endpoint with account details
4. ContractSim orchestrates escrow creation with BSIM

**WSIM → ContractSim Request:**
```http
POST /api/v1/contracts/{contract_id}/fund
X-API-Key: {wsim_api_key}
X-Wallet-Id: {user_wallet_id}

{
  "account_id": "account_456",
  "bsim_user_id": "{bsimUserId from enrollment}"
}
```

**Flow:**
```
mwsim → WSIM → ContractSim → BSIM → webhook → ContractSim
```

1. WSIM proxies the fund request to ContractSim
2. ContractSim calls BSIM escrow API to create hold
3. BSIM creates escrow and sends `escrow.held` webhook to ContractSim
4. ContractSim records funding, transitions to ACTIVE when all funded

**Note:** WSIM does NOT call BSIM directly for escrow. ContractSim is the coordinator.

---

### 6. Cancel Contract

```http
POST /api/mobile/contracts/{contract_id}/cancel
Authorization: Bearer {user_jwt}
```

---

## Profile Lookup API

ContractSim may need to fetch profile data. Expose internal endpoint:

```http
GET /api/internal/profile/{walletId}
Authorization: X-Service-Key: {contractsim_key}
```

**Response:**
```json
{
  "walletId": "WLLT-ABC123",
  "displayName": "John Smith",
  "profileImageUrl": "https://...",
  "initials": "JS",
  "initialsColor": "#4A90D9"
}
```

---

## Webhook Handler

ContractSim sends webhooks to WSIM for notification events:

**Endpoint:** `POST /webhooks/contractsim`

### Event Types

| Event | Notification Text |
|-------|-------------------|
| `contract.proposed` | "You have a new contract invitation from {name}" |
| `contract.accepted` | "{name} accepted your contract" |
| `contract.funded` | "Contract '{title}' is now active" |
| `contract.outcome` | "Contract result: You {won/lost}!" |
| `contract.settled` | "${amount} has been transferred to your account" |
| `contract.disputed` | "{name} disputed the contract outcome" |
| `contract.expired` | "Contract '{title}' expired - funds returned" |
| `contract.cancelled` | "Contract '{title}' was cancelled" |

### Webhook Payload

```json
{
  "event_id": "evt_abc123",
  "event_type": "contract.proposed",
  "timestamp": "2026-01-11T12:00:00Z",
  "data": {
    "contract_id": "contract_abc123",
    "title": "Superbowl 2026 Bet",
    "creator": {
      "wallet_id": "WLLT-ABC123",
      "display_name": "John"
    },
    "recipient": {
      "wallet_id": "WLLT-XYZ789"
    }
  }
}
```

**WSIM Processing:**
1. Validate webhook signature
2. Look up recipient's device tokens
3. Send push notification via APNs/FCM

---

## Alias Resolution

WSIM already has alias resolution for P2P transfers. ContractSim uses the same pattern:

```
Input: "@jane"
Output: {
  "walletId": "WLLT-XYZ789",
  "bankId": "bsim",
  "displayName": "Jane Doe"
}
```

If alias not found, return error before calling ContractSim.

---

## Authentication to ContractSim

WSIM authenticates to ContractSim using service-to-service API key:

```
X-API-Key: {wsim_service_key}
X-Wallet-Id: {user_wallet_id}
```

The `X-Wallet-Id` header identifies which user is making the request.

---

## Mobile UI Screens (mwsim)

WSIM/mwsim will need these screens:

| Screen | Description |
|--------|-------------|
| Contracts List | Show active, proposed, history |
| Contract Detail | View contract status, parties, outcome |
| Create Contract | Select event, counterparty, stakes |
| Accept Contract | Review and consent flow |
| Event Browser | Browse upcoming oracle events |

---

## Open Questions for WSIM Team

1. Where should Contracts tab live in mwsim navigation?
2. How to handle deep links from push notifications?
3. Should contract creation have a confirmation step?
4. Do we need a "Pending" badge for proposed contracts?

---

## Timeline

| Task | Target |
|------|--------|
| Proxy endpoints | Phase 1 |
| Profile lookup API | Phase 1 |
| Webhook handler | Phase 1 |
| Push notifications | Phase 1 |
| mwsim UI screens | Phase 1-2 |

---

*Document created: 2026-01-11*

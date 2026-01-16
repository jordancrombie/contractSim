# ContractSim Architecture Flows

This document describes the key data flows and state transitions in ContractSim.

## Table of Contents
- [Contract State Machine](#contract-state-machine)
- [Funding Flow](#funding-flow)
- [Flexible Funding Rules](#flexible-funding-rules)
- [Settlement/Payout Flow](#settlementpayout-flow)

---

## Contract State Machine

```
                              ┌─────────────┐
                              │   DRAFT     │
                              │ (optional)  │
                              └──────┬──────┘
                                     │ propose
                                     ▼
                              ┌─────────────┐
                    ┌────────►│  PROPOSED   │◄────────┐
                    │         └──────┬──────┘         │
                    │                │                │
             cancel │      all       │         cancel │
                    │    parties     │                │
                    │    accept      │                │
                    │                ▼                │
                    │         ┌─────────────┐        │
                    │         │   FUNDING   │────────┘
                    │         └──────┬──────┘
                    │                │ all parties
                    │                │ funded
                    │                ▼
               ┌────┴────┐    ┌─────────────┐
               │CANCELLED│    │   ACTIVE    │
               └─────────┘    └──────┬──────┘
                                     │ oracle event
                                     │ resolves
                                     ▼
                              ┌─────────────┐
                              │  SETTLING   │
                              └──────┬──────┘
                                     │ payouts
                                     │ complete
                                     ▼
                              ┌─────────────┐
                              │   SETTLED   │
                              └─────────────┘
```

**States:**
- **DRAFT**: Initial state for contracts being built (optional)
- **PROPOSED**: Contract sent to counterparty for review
- **FUNDING**: All parties accepted, awaiting escrow funds
- **ACTIVE**: Fully funded, waiting for oracle event
- **SETTLING**: Oracle resolved, payouts in progress
- **SETTLED**: All payouts complete
- **CANCELLED**: Contract terminated before funding
- **EXPIRED**: Funding deadline passed (not shown)
- **DISPUTED**: Under manual review (not shown)

---

## Funding Flow

### Wager Funding (Creator Pre-Funds)

```
┌──────────┐      ┌──────────┐      ┌──────────────┐      ┌──────────┐
│  MWSIM   │      │   WSIM   │      │ ContractSim  │      │   BSIM   │
│ (Mobile) │      │  (API)   │      │   (This)     │      │ (Bank)   │
└────┬─────┘      └────┬─────┘      └──────┬───────┘      └────┬─────┘
     │                 │                   │                   │
     │ 1. Create Wager │                   │                   │
     │ (w/ fund=true)  │                   │                   │
     ├────────────────►│                   │                   │
     │                 │ 2. POST /contracts│                   │
     │                 │ (type=WAGER)      │                   │
     │                 ├──────────────────►│                   │
     │                 │                   │                   │
     │                 │ 3. Contract created│                  │
     │                 │ (status=PROPOSED) │                   │
     │                 │◄──────────────────┤                   │
     │                 │                   │                   │
     │                 │ 4. POST /contracts│                   │
     │                 │ /:id/fund         │                   │
     │                 ├──────────────────►│                   │
     │                 │                   │ 5. POST /escrow   │
     │                 │                   │ (create hold)     │
     │                 │                   ├──────────────────►│
     │                 │                   │                   │
     │                 │                   │ 6. 201 Created    │
     │                 │                   │ (hold_id)         │
     │                 │                   │◄──────────────────┤
     │                 │ 7. 202 Accepted   │                   │
     │                 │◄──────────────────┤                   │
     │ 8. Pending      │                   │                   │
     │◄────────────────┤                   │                   │
     │                 │                   │                   │
     │                 │                   │ 9. Webhook        │
     │                 │                   │ (escrow.held)     │
     │                 │                   │◄──────────────────┤
     │                 │                   │                   │
     │                 │                   │ [Record funding]  │
     │                 │                   │                   │
     │                 │ 10. Webhook       │                   │
     │                 │ (contract.funded) │                   │
     │                 │◄──────────────────┤                   │
     │ 11. Update UI   │                   │                   │
     │◄────────────────┤                   │                   │
     │                 │                   │                   │
```

### Counterparty Accepts and Funds

```
┌──────────┐      ┌──────────┐      ┌──────────────┐      ┌──────────┐
│  MWSIM   │      │   WSIM   │      │ ContractSim  │      │   BSIM   │
│(Counter) │      │  (API)   │      │   (This)     │      │ (Bank)   │
└────┬─────┘      └────┬─────┘      └──────┬───────┘      └────┬─────┘
     │                 │                   │                   │
     │ 1. Accept Wager │                   │                   │
     ├────────────────►│                   │                   │
     │                 │ 2. POST /contracts│                   │
     │                 │ /:id/accept       │                   │
     │                 ├──────────────────►│                   │
     │                 │                   │                   │
     │                 │                   │ [All parties      │
     │                 │                   │  accepted →       │
     │                 │                   │  status=FUNDING]  │
     │                 │                   │                   │
     │                 │ 3. 200 OK         │                   │
     │                 │◄──────────────────┤                   │
     │ 4. Show fund btn│                   │                   │
     │◄────────────────┤                   │                   │
     │                 │                   │                   │
     │ 5. Fund Wager   │                   │                   │
     ├────────────────►│                   │                   │
     │                 │ 6. POST /contracts│                   │
     │                 │ /:id/fund         │                   │
     │                 ├──────────────────►│                   │
     │                 │                   │ 7. POST /escrow   │
     │                 │                   ├──────────────────►│
     │                 │                   │                   │
     │                 │                   │ 8. 201 Created    │
     │                 │                   │◄──────────────────┤
     │                 │ 9. 202 Accepted   │                   │
     │                 │◄──────────────────┤                   │
     │                 │                   │                   │
     │                 │                   │ 10. Webhook       │
     │                 │                   │ (escrow.held)     │
     │                 │                   │◄──────────────────┤
     │                 │                   │                   │
     │                 │                   │ [All funded →     │
     │                 │                   │  status=ACTIVE]   │
     │                 │                   │                   │
     │                 │ 11. Webhook       │                   │
     │                 │ (contract.active) │                   │
     │                 │◄──────────────────┤                   │
     │ 12. Game on!    │                   │                   │
     │◄────────────────┤                   │                   │
```

---

## Flexible Funding Rules

Different contract types have different funding rules:

### WAGER Contracts

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WAGER FUNDING RULES                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Contract Status    Creator Can Fund?    Counterparty Can Fund?    │
│  ───────────────    ─────────────────    ──────────────────────    │
│  PROPOSED           ✓ YES                ✗ NO (must accept first)  │
│  FUNDING            ✓ YES                ✓ YES                     │
│                                                                     │
│  Rationale: Creator shows "skin in the game" by funding upfront,   │
│  demonstrating commitment to the wager before counterparty accepts.│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ESCROW / MILESTONE / CUSTOM Contracts

```
┌─────────────────────────────────────────────────────────────────────┐
│              ESCROW / MILESTONE / CUSTOM FUNDING RULES             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Contract Status    Any Party Can Fund?                            │
│  ───────────────    ──────────────────                             │
│  PROPOSED           ✗ NO (all must accept first)                   │
│  FUNDING            ✓ YES                                          │
│                                                                     │
│  Rationale: Traditional escrow requires mutual agreement before    │
│  any funds are committed to ensure both parties are aligned.       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Funding Validation Logic

```
validateFundingAllowed(contract, party):
    │
    ├── status == FUNDING?
    │   └── YES → ✓ Allow (standard flow)
    │
    ├── type == WAGER && status == PROPOSED?
    │   ├── role == CREATOR?
    │   │   └── YES → ✓ Allow (creator pre-funds)
    │   └── role == COUNTERPARTY?
    │       └── NO → ✗ Reject ("must accept first")
    │
    └── else
        └── ✗ Reject ("cannot fund in {status} status")
```

---

## Settlement/Payout Flow

```
┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌─────────────┐   ┌──────────┐
│  Oracle  │   │ ContractSim  │   │   BSIM   │   │ TransferSim │   │   WSIM   │
│ Service  │   │   (This)     │   │ (Bank)   │   │ (Payments)  │   │  (API)   │
└────┬─────┘   └──────┬───────┘   └────┬─────┘   └──────┬──────┘   └────┬─────┘
     │                │                │                │                │
     │ 1. Event       │                │                │                │
     │ (game result)  │                │                │                │
     ├───────────────►│                │                │                │
     │                │                │                │                │
     │                │ [Evaluate      │                │                │
     │                │  conditions]   │                │                │
     │                │                │                │                │
     │                │ [Determine     │                │                │
     │                │  winner]       │                │                │
     │                │                │                │                │
     │                │ [status →      │                │                │
     │                │  SETTLING]     │                │                │
     │                │                │                │                │
     │                │ 2. Release     │                │                │
     │                │ escrow (loser) │                │                │
     │                ├───────────────►│                │                │
     │                │                │                │                │
     │                │ 3. 200 OK      │                │                │
     │                │◄───────────────┤                │                │
     │                │                │                │                │
     │                │ 4. POST /transfers              │                │
     │                │ (winner payout)│                │                │
     │                ├───────────────────────────────►│                │
     │                │                │                │                │
     │                │ 5. 202 Accepted│                │                │
     │                │◄───────────────────────────────┤                │
     │                │                │                │                │
     │                │                │                │                │
     │                │ 6. Webhook     │                │                │
     │                │ (transfer.completed)            │                │
     │                │◄───────────────────────────────┤                │
     │                │                │                │                │
     │                │ [status →      │                │                │
     │                │  SETTLED]      │                │                │
     │                │                │                │                │
     │                │ 7. Webhook     │                │                │
     │                │ (contract.settled)              │                │
     │                ├───────────────────────────────────────────────►│
     │                │                │                │                │
```

### Settlement Types

| Type | Description |
|------|-------------|
| `WINNER_TAKES_ALL` | Winner receives entire pot minus fees |
| `PROPORTIONAL` | Pot split based on condition outcomes |
| `CUSTOM` | Settlement logic defined in contract |

---

## Service Communication Summary

| From | To | Auth Method | Purpose |
|------|----|-------------|---------|
| WSIM | ContractSim | `X-API-Key` header | Create/manage contracts |
| ContractSim | BSIM | `X-API-Key` (BSIM_ESCROW_API_KEY) | Create escrow holds |
| BSIM | ContractSim | HMAC `X-BSIM-Signature` | Escrow confirmations |
| ContractSim | TransferSim | `X-API-Key` | Initiate payouts |
| TransferSim | ContractSim | HMAC `X-Webhook-Signature` | Transfer confirmations |
| ContractSim | WSIM | HMAC `X-Webhook-Signature` | Contract status updates |

---

## Related Documentation

- [INTEGRATION_WSIM.md](./INTEGRATION_WSIM.md) - WSIM integration details
- [INTEGRATION_BSIM.md](./INTEGRATION_BSIM.md) - BSIM escrow integration
- [INTEGRATION_TRANSFERSIM.md](./INTEGRATION_TRANSFERSIM.md) - TransferSim payout integration
- [OpenAPI Spec](./openapi.yaml) - REST API specification
- [AsyncAPI Spec](./asyncapi.yaml) - Webhook specifications

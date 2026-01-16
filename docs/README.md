# ContractSim Documentation

This directory contains technical documentation for ContractSim.

## API Specifications

| Document | Description | Status |
|----------|-------------|--------|
| [openapi.yaml](openapi.yaml) | OpenAPI 3.1 spec for REST endpoints | Planned |
| [asyncapi.yaml](asyncapi.yaml) | AsyncAPI 3.0 spec for webhooks/events | Planned |

## Flow Diagrams

| Document | Description | Status |
|----------|-------------|--------|
| [Architecture Flows](ARCHITECTURE_FLOWS.md) | State machine, funding flows, settlement flows | Complete |

## Integration Guides

| Document | Description | Status |
|----------|-------------|--------|
| [BSIM Integration](INTEGRATION_BSIM.md) | Escrow API requirements for BSIM | Planned |
| [WSIM Integration](INTEGRATION_WSIM.md) | Proxy and notification requirements | Planned |
| [TransferSim Integration](INTEGRATION_TRANSFERSIM.md) | Settlement transfer requirements | Planned |
| [Oracle Integration](ORACLE_INTEGRATION.md) | How to build an oracle | Planned |

## Quick Reference

### Contract States

```
DRAFT → PROPOSED → FUNDING → ACTIVE → SETTLING → SETTLED
                      ↓         ↓          ↓
                  CANCELLED  EXPIRED   DISPUTED
```

### Key Endpoints (Preview)

```
POST   /api/v1/contracts              Create contract
GET    /api/v1/contracts/:id          Get contract
POST   /api/v1/contracts/:id/accept   Accept contract
POST   /api/v1/contracts/:id/fund     Confirm funding
POST   /api/v1/contracts/:id/cancel   Cancel contract
POST   /api/v1/contracts/:id/dispute  Dispute outcome

GET    /api/v1/oracles                List oracles
GET    /api/v1/oracles/:id/events     Get oracle events

POST   /webhooks/oracle               Oracle outcome webhook
POST   /webhooks/bsim                 BSIM escrow webhook
POST   /webhooks/transfersim          Settlement webhook
```

### Service URLs (Planned)

| Environment | URL |
|-------------|-----|
| Production | https://contract.banksim.ca |
| Development | https://contract-dev.banksim.ca |

## Related Documentation

- [BSIM Docs](../../bsim/docs/README.md) - Core banking documentation
- [Project Plan](../LOCAL_DEPLOYMENT_PLANS/PROJECT_PLAN.md) - Development plan
- [Open Questions](../LOCAL_DEPLOYMENT_PLANS/OPEN_QUESTIONS.md) - Decision log

---

*Documentation structure created: 2026-01-11*

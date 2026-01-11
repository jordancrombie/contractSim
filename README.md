# ContractSim

**Conditional Payment Coordination Service**

ContractSim enables conditional payments between parties based on agreed-upon conditions and external events. Think of it as "smart contracts for traditional payment rails" - allowing users to create binding financial agreements that automatically settle when conditions are met.

## Use Cases

- **Wagers**: Two friends bet $50 on a football game - funds held until game outcome is reported
- **Escrow Payments**: Buyer pays seller when package delivery is confirmed
- **Property Transactions**: Payment released when house title transfer is recorded
- **Milestone Payments**: Freelance payments released upon milestone completion

## Architecture

ContractSim is part of the BSIM Banking Simulation Ecosystem and coordinates between:

- **WSIM** (Wallet Backend) - Contract UI/UX flows, user consent, push notifications
- **BSIM** (Bank) - Escrow account management, fund holds, transfers
- **TransferSim** (P2P Network) - Cross-bank settlement transfers
- **Oracles** - External data sources that report condition outcomes (sports APIs, delivery tracking, etc.)

```
                              WALLET LAYER
                    ┌─────────────────────────────┐
                    │          mwsim              │
                    │     (Mobile Wallet)         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │           WSIM              │
                    │    (Wallet Backend)         │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              │         ┌──────────┴──────────┐         │
              │         │    ContractSim      │         │
              │         │   (Coordinator)     │         │
              │         └──────────┬──────────┘         │
              │                    │                    │
       Oracle │                    │                    │ Escrow
       Layer  │                    │                    │ Layer
              │                    │                    │
        ┌─────┴─────┐       ┌──────┴──────┐      ┌──────┴──────┐
        │  Sports   │       │    BSIM     │      │   NewBank   │
        │   API     │       │   (Bank)    │      │   (Bank)    │
        │ (Oracle)  │       └─────────────┘      └─────────────┘
        └───────────┘
```

## Core Concepts

- **Contract**: A binding agreement between parties with stakes, conditions, and outcomes
- **Condition**: A testable statement evaluated as TRUE, FALSE, or PENDING
- **Oracle**: A trusted external service that reports on real-world events
- **Escrow**: Funds held by the bank until contract settlement
- **Settlement**: Distribution of escrowed funds based on condition outcomes

## Contract Lifecycle

```
DRAFT → PROPOSED → FUNDING → ACTIVE → SETTLING → SETTLED
                      ↓         ↓          ↓
                  CANCELLED  EXPIRED   DISPUTED
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Backend | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT (S2S), OAuth 2.0 (OpenBanking) |
| Container | Docker |

## Repository

GitHub: https://github.com/jordancrombie/contractSim

## Related Services

- [BSIM](https://github.com/jordancrombie/bsim) - Core banking API
- [mwsim](https://github.com/jordancrombie/mwsim) - Mobile wallet app
- [TransferSim](https://github.com/jordancrombie/transferSim) - P2P transfer network

## Status

**In Development** - See `LOCAL_DEPLOYMENT_PLANS/PROPOSAL_CONTRACTSIM.md` for detailed specifications and team feedback.

## License

Proprietary

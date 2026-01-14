# Changelog

All notable changes to ContractSim will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.4] - 2026-01-14

### Changed
- Fund endpoint (`/contracts/:id/fund`) now allows WSIM to initiate funding
  - Previously restricted to BSIM only, now accepts WSIM proxy requests
  - WSIM sends `account_id` and `bsim_user_id` in request body
  - ContractSim calls BSIM escrow API to create hold
  - Returns 202 Accepted; funding confirmed via BSIM webhook
- Added `BSIM_ESCROW_API_KEY` environment variable for outbound BSIM calls
  - Separates inbound auth (BSIM calling us) from outbound auth (us calling BSIM)
  - Production key provided by BSIM team

### Fixed
- Resolved 403 error when WSIM tried to fund contracts
- BsimClient now uses correct API key for escrow operations

## [1.0.3] - 2026-01-14

### Fixed
- Documentation clarification in INTEGRATION_WSIM.md for the funding flow
  - Correct flow: WSIM → ContractSim → BSIM (create escrow) → BSIM webhook → ContractSim
  - WSIM proxies fund request to ContractSim with account details
  - ContractSim orchestrates escrow creation with BSIM
  - BSIM sends webhook to ContractSim when escrow is held

## [1.0.2] - 2026-01-13

### Changed
- List contracts endpoint now includes `parties` array with `wallet_id`, `display_name`, and `role`
  - Enables WSIM to determine counterparty info and user's role without fetching each contract individually
- TransferSim webhook authentication changed from X-API-Key to HMAC signature
  - Now uses `X-Webhook-Signature` header with HMAC-SHA256
  - Requires `TRANSFERSIM_WEBHOOK_SECRET` environment variable
  - More secure - proves payload integrity and sender authenticity

### Added
- Database deployment runbook (`docs/DATABASE_DEPLOYMENT.md`)

## [1.0.1] - 2026-01-11

### Fixed
- API responses now return lowercase enum values for compatibility with mobile clients
  - `status`: `draft`, `proposed`, `funding`, `active`, `settling`, `settled`, `expired`, `cancelled`, `disputed`
  - `type`: `wager`, `escrow`, `milestone`, `custom`
  - `role`: `creator`, `counterparty`
  - `escrow_type`: `full`, `partial`, `none`
  - `settlement_type`: `winner_takes_all`, `proportional`, `custom`
  - `predicate.operator`: `equals`, `not_equals`, `greater_than`, `less_than`, `contains`, `in`
  - `conditions[].status`: `pending`, `resolved`, `disputed`

### Added
- OpenAPI 3.0 specification (`docs/openapi.yaml`)
- AsyncAPI 2.6 specification for webhooks (`docs/asyncapi.yaml`)

## [1.0.0] - 2026-01-11

### Added
- Initial release of ContractSim
- Contract CRUD API with state machine (DRAFT → PROPOSED → FUNDING → ACTIVE → SETTLING → SETTLED)
- WSIM S2S authentication middleware
- BSIM escrow client integration
- TransferSim settlement client integration
- Test Oracle service with 5-minute game cycles
- Webhook endpoints for BSIM and TransferSim callbacks
- Webhook service for sending notifications to WSIM
- Idempotency key support for all state-changing operations
- Audit logging for contract events
- Prisma ORM with PostgreSQL
- Docker support with Dockerfile
- Buildkite CI/CD pipeline for development environment

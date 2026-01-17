# Changelog

All notable changes to ContractSim will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.2] - 2026-01-17

### Fixed
- **CRITICAL: Condition predicate comparison now normalizes strings**
  - Bug: Oracle result uses `team_a`/`team_b` format (lowercase, underscore)
  - WSIM sends predicateValue as `Team A`/`Team B` format (title case, space)
  - Exact string comparison always returned false → ALL contracts gave win to counterparty
  - Now normalizes both values (lowercase, spaces→underscores) before comparing
  - This was causing incorrect settlement outcomes for all wager contracts

## [1.6.1] - 2026-01-17

### Fixed
- **Graceful shutdown handlers added**
  - Server now handles SIGTERM/SIGINT signals properly
  - Stops TestOracleService and ContractExpirationService intervals
  - Disconnects Prisma client to release database connections
  - 30-second timeout prevents hanging on shutdown
  - Prevents connection leaks and potential memory issues on restart

- **Prisma singleton pattern now works in all environments**
  - Previously only cached instance in non-production (development)
  - Production could create multiple PrismaClient instances
  - Now uses global cache consistently across all environments

- **Interval services now have mutex protection**
  - TestOracleService.tick() and ContractExpirationService.checkExpiredContracts()
  - Prevents overlapping executions if processing takes longer than interval (60s)
  - Logs skip message when previous execution still running

### Changed
- Database connection pool can now be configured via DATABASE_URL query params
  - `?connection_limit=10&pool_timeout=30` in DATABASE_URL

## [1.6.0] - 2026-01-17

### Added
- **Outbound webhooks now signed with HMAC**
  - WebhookService adds `X-Webhook-Signature` header to all outbound webhooks
  - Uses `WSIM_WEBHOOK_SECRET` env var for signing webhooks to WSIM
  - WSIM can now verify webhook authenticity using HMAC-SHA256
  - Bug: Webhooks were sent without signature, causing WSIM to reject them

## [1.5.5] - 2026-01-16

### Fixed
- **Fix `toFixed is not a function` error in settlement webhook handler**
  - Bug: `data.amount` from TransferSim webhook is a string, not a number
  - Calling `.toFixed(2)` on a string throws TypeError
  - Now converts to number first: `Number(data.amount).toFixed(2)`

## [1.5.4] - 2026-01-16

### Fixed
- **BSIM webhook handler now stores `bsimUserId` when escrow is held**
  - Bug: `handleEscrowHeld` received `user_id` from BSIM but wasn't storing it
  - Settlement failed with "missing BSIM user ID" because field was never populated
  - Now stores `bsimUserId` in ContractParty record when funding is confirmed

## [1.5.3] - 2026-01-16

### Added
- **BSIM user ID now stored on ContractParty for settlements**
  - TransferSim API requires `user_id` for both `from` and `to` parties
  - `bsimUserId` is captured during funding (from WSIM's `bsim_user_id` field)
  - Stored in new `bsimUserId` column on `ContractParty` table
  - Passed to TransferSim in settlement requests

### Changed
- `TransferSimClient.createSettlement()` now requires `userId` in both `from` and `to` objects
- `SettlementService` validates both parties have `bsimUserId` before attempting settlement

## [1.5.2] - 2026-01-16

### Fixed
- **Settlement now triggers when contract becomes ACTIVE with already-resolved conditions**
  - Race condition: Oracle event could complete before contract funded (FUNDING → ACTIVE)
  - Settlement check only ran on condition resolution, missing already-resolved contracts
  - Now calls `checkAndSettle()` after ACTIVE transition in both:
    - `ContractService.recordFunding()`
    - `webhookRoutes.handleEscrowHeld()`

## [1.5.1] - 2026-01-16

### Fixed
- **Webhook signature verification now handles `sha256=` prefix** (GitHub-style signatures)
  - TransferSim sends `sha256=<hex>` (71 chars), ContractSim expected raw `<hex>` (64 chars)
  - Now strips `sha256=` prefix before comparison
  - Added length check before `timingSafeEqual` to prevent `RangeError`

### Changed
- **Settlement escrow flow corrected for cross-bank scenarios**
  - Loser's escrow: Now handled by TransferSim (calls BSIM `/release` → credits winner)
  - Winner's escrow: Now uses `/return` instead of `/release` (stake returned to them)
  - Previously both escrows used `/release` which was incorrect for cross-bank settlements

## [1.5.0] - 2026-01-16

### Added
- **ContractExpirationService** - Automatic contract expiration with BSIM escrow return
  - Runs every minute to check for contracts past their `fundingDeadline`
  - Returns escrows to BSIM via `POST /api/escrow/:id/return` for any funded parties
  - Transitions contracts from PROPOSED/FUNDING to EXPIRED
  - Sends `contract.expired` webhook to both parties with their `refund_amount`
  - Includes `forceExpire(contractId)` method for admin use on stuck contracts

### Fixed
- **WAGER contracts now correctly set opposite outcome mappings for parties**
  - Creator: `outcomeIfTrue=WINNER`, `outcomeIfFalse=LOSER` (bets condition is true)
  - Counterparty: `outcomeIfTrue=LOSER`, `outcomeIfFalse=WINNER` (bets condition is false)
  - Bug: Both parties had identical mappings, causing all settlements to take refund path

## [1.4.0] - 2026-01-16

### Changed
- **WSIM webhook notification routing overhaul** per agreed spec with WSIM team
  - `contract.accepted`: Now includes `recipient_wallet_id` at root level (creator's wallet)
  - `contract.funded`: Now sends to OTHER party (not funder) with `funded_by` and `contract_status`
  - `contract.cancelled`: Now includes `cancelled_by` with actor details
  - `contract.outcome`: Now sends 2 webhooks (winner gets "won", loser gets "lost") with `opponent` field
  - `contract.settled`: Now sends 2 webhooks to both parties with different `outcome` and `amount` values

### Added
- `contract.expired` webhook: Sends 2 webhooks (one per party) with `refund_amount`
- `contract.disputed` webhook: Sends to other party with `disputed_by` and `reason`
- Settlement completion now triggers `contract.settled` webhook to WSIM
- Contract expiration now triggers `contract.expired` webhook to WSIM

### Fixed
- `notifyContractCancelled` now called when contract is cancelled
- Settlement webhook handler now notifies WSIM (was TODO)
- Escrow expiration handler now notifies both parties

## [1.3.0] - 2026-01-16

### Fixed
- **WSIM webhook notifications now sent for contract lifecycle events**
  - `contract.proposed`: Counterparty notified when invited to a contract
  - `contract.accepted`: Creator notified when counterparty accepts
  - `contract.funded`: All parties notified when contract becomes active
  - Bug: Webhook methods existed but were never called from ContractService
- Fixed `contract.proposed` webhook payload format to match WSIM expectations
  - Changed `recipient.wallet_id` (nested) to `recipient_wallet_id` (root level)
- Fixed WSIM webhook URL missing `/api` prefix
  - Changed `/webhooks/contractsim` to `/api/webhooks/contractsim`

### Changed
- Dev environment `BSIM_WEBHOOK_SECRET` updated to match BSIM's configured secret

### Added
- Architecture flow diagrams documentation (`docs/ARCHITECTURE_FLOWS.md`)

## [1.2.2] - 2026-01-16

### Fixed
- Wager creator funding now works in PROPOSED state
  - Bug: Controller had duplicate status validation that wasn't updated with flexible logic
  - Controller's `initiateFunding` now uses same flexible funding rules as service layer

## [1.2.1] - 2026-01-16

### Added
- Version number now included in health check responses (`/health` and `/health/ready`)
  - Reads version directly from package.json to ensure consistency
  - Enables easy verification of deployed version

## [1.2.0] - 2026-01-15

### Added
- Flexible funding logic per contract type
  - WAGER contracts: Creator can fund immediately in PROPOSED state (before counterparty accepts)
    - Shows "skin in the game" to counterparty
    - Counterparty must still accept before they can fund
  - ESCROW, MILESTONE, CUSTOM: All parties must accept before anyone can fund (existing behavior)
  - Architecture designed for future flexibility (e.g., crowdfunding goals with multiple contributors)

### Changed
- Extracted `validateFundingAllowed()` method for funding rules per contract type and party role

## [1.1.1] - 2026-01-15

### Fixed
- BSIM webhook authentication now uses HMAC signature (`X-BSIM-Signature` header)
  - Previously expected `X-API-Key` header, but BSIM implemented HMAC (like TransferSim)
  - Added `BSIM_WEBHOOK_SECRET` environment variable for webhook signature verification
  - Updated INTEGRATION_BSIM.md with clear webhook authentication documentation

### Changed
- `verifyWebhookSignature` middleware now accepts options object for configurable header name
  - Allows different services to use different signature header names
  - BSIM: `X-BSIM-Signature`, TransferSim: `X-Webhook-Signature`

## [1.1.0] - 2026-01-14

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

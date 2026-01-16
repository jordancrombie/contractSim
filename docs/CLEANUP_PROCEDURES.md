# ContractSim Cleanup Procedures

This document describes how to clean up orphaned data between ContractSim and BSIM escrow systems.

## Overview

ContractSim creates escrow holds in BSIM when users fund contracts. If contracts are deleted without properly releasing escrows, funds can become locked in user accounts. This guide covers how to identify and clean up such orphaned data.

## Prerequisites

- SSH access to the dev machine (192.168.1.96) or SSM access to production EC2
- Database access to both `contractsim` and `bsim` databases

## Development Environment

All commands below use SSH to the dev machine. The databases are accessed via the `bsim-db` container.

### Step 1: Identify Orphaned Escrows

Find escrows in BSIM that reference contracts no longer in ContractSim:

```bash
# Get all HELD escrows from BSIM
ssh 192.168.1.96 "/Applications/Docker.app/Contents/Resources/bin/docker exec bsim-db psql -U bsim -d bsim -c \"
SELECT id, contract_id, \\\"userId\\\", amount, status, created_at
FROM escrow_holds
WHERE status = 'HELD'
ORDER BY created_at;\""

# Cross-reference with ContractSim to find orphans
ssh 192.168.1.96 "/Applications/Docker.app/Contents/Resources/bin/docker exec bsim-db psql -U bsim -d contractsim -c \"
SELECT id, title, status
FROM \\\"Contract\\\"
WHERE id IN ('<contract_id_1>', '<contract_id_2>');\""
```

### Step 2: Return Orphaned Escrows in BSIM

For orphaned escrows (contracts deleted from ContractSim), return funds to users:

```sql
-- Run against BSIM database
BEGIN;

-- Step 1: Calculate total escrow amount per account
-- (Run this query first to get the amounts)
SELECT "accountId", SUM(amount) as total
FROM escrow_holds
WHERE status = 'HELD'
  AND contract_id IN ('<orphaned_contract_id_1>', '<orphaned_contract_id_2>')
GROUP BY "accountId";

-- Step 2: Update account balances (add back escrowed amounts)
UPDATE accounts
SET balance = balance + <total_amount>,
    "updatedAt" = NOW()
WHERE id = '<account_id>';

-- Step 3: Mark escrows as RETURNED
UPDATE escrow_holds
SET status = 'RETURNED',
    released_at = NOW(),
    updated_at = NOW(),
    release_type = 'expired_cleanup'
WHERE status = 'HELD'
  AND contract_id IN ('<orphaned_contract_id_1>', '<orphaned_contract_id_2>');

COMMIT;
```

### Step 3: Delete Old Contracts from ContractSim

Delete finalized contracts (SETTLED, EXPIRED, CANCELLED, DISPUTED) that are no longer needed:

```sql
-- Run against ContractSim database
BEGIN;

-- Delete related data first (foreign key constraints)
DELETE FROM "AuditLog" WHERE "contractId" IN (
  SELECT id FROM "Contract" WHERE status IN ('SETTLED', 'EXPIRED', 'CANCELLED', 'DISPUTED')
);

DELETE FROM "ContractOutcome" WHERE "contractId" IN (
  SELECT id FROM "Contract" WHERE status IN ('SETTLED', 'EXPIRED', 'CANCELLED', 'DISPUTED')
);

DELETE FROM "Condition" WHERE "contractId" IN (
  SELECT id FROM "Contract" WHERE status IN ('SETTLED', 'EXPIRED', 'CANCELLED', 'DISPUTED')
);

DELETE FROM "ContractParty" WHERE "contractId" IN (
  SELECT id FROM "Contract" WHERE status IN ('SETTLED', 'EXPIRED', 'CANCELLED', 'DISPUTED')
);

DELETE FROM "Contract" WHERE status IN ('SETTLED', 'EXPIRED', 'CANCELLED', 'DISPUTED');

COMMIT;
```

### Step 4: Clean Up Incomplete Contracts

For contracts stuck in PROPOSED or FUNDING status without escrows:

```sql
-- First verify no escrows exist for these contracts
-- Run against BSIM database
SELECT contract_id, COUNT(*) as escrow_count
FROM escrow_holds
WHERE contract_id IN ('<contract_id>')
GROUP BY contract_id;

-- If no escrows, safe to delete from ContractSim
BEGIN;

DELETE FROM "AuditLog" WHERE "contractId" = '<contract_id>';
DELETE FROM "ContractOutcome" WHERE "contractId" = '<contract_id>';
DELETE FROM "Condition" WHERE "contractId" = '<contract_id>';
DELETE FROM "ContractParty" WHERE "contractId" = '<contract_id>';
DELETE FROM "Contract" WHERE id = '<contract_id>';

COMMIT;
```

## Verification Queries

### Check Remaining HELD Escrows

```bash
ssh 192.168.1.96 "/Applications/Docker.app/Contents/Resources/bin/docker exec bsim-db psql -U bsim -d bsim -c \"
SELECT id, contract_id, amount, status
FROM escrow_holds
WHERE status = 'HELD';\""
```

### Check Remaining Contracts

```bash
ssh 192.168.1.96 "/Applications/Docker.app/Contents/Resources/bin/docker exec bsim-db psql -U bsim -d contractsim -c \"
SELECT id, title, status, \\\"createdAt\\\"
FROM \\\"Contract\\\"
ORDER BY \\\"createdAt\\\";\""
```

### Verify Account Balances

```bash
ssh 192.168.1.96 "/Applications/Docker.app/Contents/Resources/bin/docker exec bsim-db psql -U bsim -d bsim -c \"
SELECT id, balance
FROM accounts
WHERE id IN ('<account_id_1>', '<account_id_2>');\""
```

## Production Environment

For production, use SSM commands instead of SSH:

```bash
aws ssm send-command \
  --instance-ids "i-0d45924915c774799" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker run --rm --network bsim_default postgres:15-alpine psql \"postgresql://bsimadmin:<password>@bsim-db.cb80gi4u4k7g.ca-central-1.rds.amazonaws.com:5432/<database>\" -c \"<SQL_QUERY>;\""]}' \
  --region ca-central-1
```

## Prevention

To avoid orphaned escrows in the future:

1. **Always return escrows before deleting contracts** - Use the `/api/escrow/:id/return` endpoint
2. **ContractSim expiry timer** - Ensure the contract expiry job calls BSIM's return API
3. **Check escrows before manual deletion** - Query BSIM escrow_holds before deleting contracts

## Related Documentation

- [BSIM Escrow API](INTEGRATION_BSIM.md) - Escrow hold/release/return endpoints
- [Database Deployment](DATABASE_DEPLOYMENT.md) - Database access procedures

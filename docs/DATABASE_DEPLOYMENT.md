# ContractSim Database Deployment Guide

This guide covers database setup and migration for ContractSim across environments.

## Prerequisites

- Access to execute `docker exec` commands on the EC2 host
- PostgreSQL container running (`bsim-db` in dev, `postgres` in production)
- ContractSim container running or able to be started

## Environment Overview

| Environment | DB Container | Database Name | Network |
|-------------|--------------|---------------|---------|
| Development | `bsim-db` | `contractsim` | `bsim_bsim-network` |
| Production | `postgres` | `contractsim` | `bsim_bsim-network` |

---

## 1. Initial Database Setup (First-Time Only)

### Step 1.1: Create the Database

```bash
# Development (bsim-db container)
docker exec bsim-db psql -U bsim -c "CREATE DATABASE contractsim;"

# Production (postgres container - adjust user as needed)
docker exec postgres psql -U bsim -c "CREATE DATABASE contractsim;"
```

### Step 1.2: Verify Database Created

```bash
# List databases - contractsim should appear
docker exec bsim-db psql -U bsim -c "\l" | grep contractsim
```

Expected output:
```
 contractsim | bsim | UTF8 | ...
```

---

## 2. Run Database Migrations

Migrations create the schema tables. Run this after initial setup and after each deployment with schema changes.

### Option A: Via Docker Compose (Recommended for Dev)

```bash
# From the contractSim directory
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm contractsim npx prisma migrate deploy
```

### Option B: Via Running Container (Production)

```bash
# Execute migration inside the running container
docker exec contractsim npx prisma migrate deploy

# Or for dev container
docker exec contractsim-dev npx prisma migrate deploy
```

### Option C: Build and Run Migration Container

```bash
# If container isn't running, build and run migration only
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm contractsim sh -c "npx prisma generate && npx prisma migrate deploy"
```

---

## 3. Verify Migration Success

### Step 3.1: Check Tables Exist (10 tables expected)

```bash
# Connect to database and list tables
docker exec bsim-db psql -U bsim -d contractsim -c "\dt"
```

Expected tables:
```
 Schema |      Name        | Type  | Owner
--------+------------------+-------+-------
 public | AuditLog         | table | bsim
 public | Condition        | table | bsim
 public | Contract         | table | bsim
 public | ContractOutcome  | table | bsim
 public | ContractParty    | table | bsim
 public | Dispute          | table | bsim
 public | IdempotencyKey   | table | bsim
 public | Oracle           | table | bsim
 public | OracleEvent      | table | bsim
 public | WebhookDelivery  | table | bsim
 public | _prisma_migrations | table | bsim
```

### Step 3.2: Check Migration History

```bash
docker exec bsim-db psql -U bsim -d contractsim -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

---

## 4. Health Check After Deployment

### Step 4.1: Container Health

```bash
# Check container is running
docker ps | grep contractsim

# Check container logs for errors
docker logs contractsim-dev --tail 50
```

### Step 4.2: API Health Check

```bash
# From inside the container
docker exec contractsim-dev wget -q -O- http://localhost:3020/health

# Expected response:
# {"status":"healthy","service":"contractsim","timestamp":"..."}
```

### Step 4.3: Database Connectivity Test

```bash
# Check the health endpoint shows healthy (means DB is connected)
docker exec contractsim-dev wget -q -O- http://localhost:3020/health | grep -q '"status":"healthy"' && echo "DB Connected OK" || echo "DB Connection FAILED"
```

---

## 5. Troubleshooting

### Problem: "Database does not exist"

```bash
# Create the database
docker exec bsim-db psql -U bsim -c "CREATE DATABASE contractsim;"
```

### Problem: "Migration failed"

```bash
# Check Prisma migration status
docker exec contractsim-dev npx prisma migrate status

# If migrations are pending, deploy them
docker exec contractsim-dev npx prisma migrate deploy

# If migration is broken, check the error and potentially reset (DEV ONLY!)
# WARNING: This drops all data!
docker exec contractsim-dev npx prisma migrate reset --force
```

### Problem: "Connection refused to database"

```bash
# Verify database container is running
docker ps | grep bsim-db

# Verify network connectivity
docker exec contractsim-dev ping -c 3 bsim-db

# Check DATABASE_URL is correct
docker exec contractsim-dev printenv DATABASE_URL
```

### Problem: "Permission denied"

```bash
# Check user has access to database
docker exec bsim-db psql -U bsim -d contractsim -c "SELECT 1;"

# Grant permissions if needed
docker exec bsim-db psql -U bsim -c "GRANT ALL PRIVILEGES ON DATABASE contractsim TO bsim;"
```

---

## 6. Quick Reference Commands

```bash
# === DATABASE ===
# Create database
docker exec bsim-db psql -U bsim -c "CREATE DATABASE contractsim;"

# List databases
docker exec bsim-db psql -U bsim -c "\l"

# Connect to contractsim database
docker exec -it bsim-db psql -U bsim -d contractsim

# List tables
docker exec bsim-db psql -U bsim -d contractsim -c "\dt"

# Count contracts
docker exec bsim-db psql -U bsim -d contractsim -c "SELECT COUNT(*) FROM \"Contract\";"

# === MIGRATIONS ===
# Run migrations
docker exec contractsim-dev npx prisma migrate deploy

# Check migration status
docker exec contractsim-dev npx prisma migrate status

# Generate Prisma client (if needed)
docker exec contractsim-dev npx prisma generate

# === CONTAINER ===
# View logs
docker logs contractsim-dev --tail 100 -f

# Restart container
docker restart contractsim-dev

# Shell into container
docker exec -it contractsim-dev sh

# Health check
docker exec contractsim-dev wget -q -O- http://localhost:3020/health
```

---

## 7. Environment Variables Reference

The following environment variables must be set for database connectivity:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://bsim:password@bsim-db:5432/contractsim` |
| `NODE_ENV` | Environment (affects logging) | `development` or `production` |

These are set in `docker-compose.yml` / `docker-compose.dev.yml` and should not need manual configuration.

---

## 8. Deployment Checklist

- [ ] Database `contractsim` exists
- [ ] Migrations have been run (`npx prisma migrate deploy`)
- [ ] All 10 tables exist (check with `\dt`)
- [ ] ContractSim container is running
- [ ] Health check returns `{"status":"healthy"}`
- [ ] Container can reach BSIM at `http://bsim-backend:3001/health`
- [ ] Container can reach WSIM at configured URL
- [ ] API keys are configured for S2S auth

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('WAGER', 'ESCROW', 'MILESTONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PROPOSED', 'FUNDING', 'ACTIVE', 'SETTLING', 'SETTLED', 'EXPIRED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EscrowType" AS ENUM ('FULL', 'PARTIAL', 'NONE');

-- CreateEnum
CREATE TYPE "SettlementType" AS ENUM ('WINNER_TAKES_ALL', 'PROPORTIONAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('CREATOR', 'COUNTERPARTY');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('WINNER', 'LOSER', 'REFUND', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ConditionStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PredicateOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS', 'IN');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalPot" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "escrowType" "EscrowType" NOT NULL DEFAULT 'FULL',
    "settlementType" "SettlementType" NOT NULL DEFAULT 'WINNER_TAKES_ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fundingDeadline" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractParty" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "stakeAmount" DECIMAL(12,2) NOT NULL,
    "stakeCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "outcomeIfTrue" "OutcomeType" NOT NULL DEFAULT 'WINNER',
    "outcomeIfFalse" "OutcomeType" NOT NULL DEFAULT 'LOSER',
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3),
    "funded" BOOLEAN NOT NULL DEFAULT false,
    "fundedAt" TIMESTAMP(3),
    "escrowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "oracleId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "predicateField" TEXT NOT NULL,
    "predicateOperator" "PredicateOperator" NOT NULL,
    "predicateValue" TEXT NOT NULL,
    "status" "ConditionStatus" NOT NULL DEFAULT 'PENDING',
    "result" BOOLEAN,
    "evidence" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractOutcome" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "winnerId" TEXT,
    "loserId" TEXT,
    "settlementType" TEXT NOT NULL,
    "transferId" TEXT,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "filedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Oracle" (
    "id" TEXT NOT NULL,
    "oracleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventTypes" TEXT[],
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Oracle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OracleEvent" (
    "id" TEXT NOT NULL,
    "oracleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "result" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OracleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "contractId" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_createdAt_idx" ON "Contract"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_idempotencyKey_key" ON "Contract"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ContractParty_walletId_idx" ON "ContractParty"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractParty_contractId_walletId_key" ON "ContractParty"("contractId", "walletId");

-- CreateIndex
CREATE UNIQUE INDEX "Condition_contractId_index_key" ON "Condition"("contractId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "ContractOutcome_contractId_key" ON "ContractOutcome"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_contractId_key" ON "Dispute"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Oracle_oracleId_key" ON "Oracle"("oracleId");

-- CreateIndex
CREATE INDEX "OracleEvent_status_startsAt_idx" ON "OracleEvent"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "OracleEvent_oracleId_eventId_key" ON "OracleEvent"("oracleId", "eventId");

-- CreateIndex
CREATE INDEX "AuditLog_contractId_idx" ON "AuditLog"("contractId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractOutcome" ADD CONSTRAINT "ContractOutcome_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OracleEvent" ADD CONSTRAINT "OracleEvent_oracleId_fkey" FOREIGN KEY ("oracleId") REFERENCES "Oracle"("oracleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

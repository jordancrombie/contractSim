import prisma from '../config/database';
import { Contract, ContractStatus } from '@prisma/client';

export interface AuditEntry {
  contractId?: string;
  action: string;
  actor: string;
  previousState?: object;
  newState?: object;
  metadata?: object;
}

export class AuditService {
  /**
   * Log an audit entry
   */
  async log(entry: AuditEntry): Promise<void> {
    await prisma.auditLog.create({
      data: {
        contractId: entry.contractId,
        action: entry.action,
        actor: entry.actor,
        previousState: entry.previousState || undefined,
        newState: entry.newState || undefined,
        metadata: entry.metadata || undefined,
      },
    });
  }

  /**
   * Log contract creation
   */
  async logContractCreated(contract: Contract, creatorWalletId: string): Promise<void> {
    await this.log({
      contractId: contract.id,
      action: 'CONTRACT_CREATED',
      actor: creatorWalletId,
      newState: {
        id: contract.id,
        type: contract.type,
        status: contract.status,
        title: contract.title,
        totalPot: contract.totalPot.toString(),
      },
    });
  }

  /**
   * Log status change
   */
  async logStatusChange(
    contractId: string,
    previousStatus: ContractStatus,
    newStatus: ContractStatus,
    actor: string,
    metadata?: object
  ): Promise<void> {
    await this.log({
      contractId,
      action: 'STATUS_CHANGED',
      actor,
      previousState: { status: previousStatus },
      newState: { status: newStatus },
      metadata,
    });
  }

  /**
   * Log party acceptance
   */
  async logPartyAccepted(contractId: string, walletId: string): Promise<void> {
    await this.log({
      contractId,
      action: 'PARTY_ACCEPTED',
      actor: walletId,
      metadata: { walletId },
    });
  }

  /**
   * Log funding
   */
  async logFunding(
    contractId: string,
    walletId: string,
    escrowId: string,
    amount: string
  ): Promise<void> {
    await this.log({
      contractId,
      action: 'PARTY_FUNDED',
      actor: walletId,
      metadata: { walletId, escrowId, amount },
    });
  }

  /**
   * Log oracle outcome
   */
  async logOracleOutcome(
    contractId: string,
    oracleId: string,
    conditionIndex: number,
    result: boolean
  ): Promise<void> {
    await this.log({
      contractId,
      action: 'ORACLE_OUTCOME',
      actor: `oracle:${oracleId}`,
      metadata: { oracleId, conditionIndex, result },
    });
  }

  /**
   * Log settlement
   */
  async logSettlement(
    contractId: string,
    winnerId: string | null,
    transferId: string
  ): Promise<void> {
    await this.log({
      contractId,
      action: 'SETTLEMENT_COMPLETED',
      actor: 'system',
      metadata: { winnerId, transferId },
    });
  }

  /**
   * Get audit trail for a contract
   */
  async getContractAuditTrail(contractId: string) {
    return prisma.auditLog.findMany({
      where: { contractId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export const auditService = new AuditService();

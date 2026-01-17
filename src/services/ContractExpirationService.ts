import prisma from '../config/database';
import { ContractStatus } from '@prisma/client';
import { bsimClient } from './BsimClient';
import { webhookService } from './WebhookService';
import { auditService } from './AuditService';

const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

export class ContractExpirationService {
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false; // Mutex to prevent overlapping checks

  /**
   * Start the expiration checker
   */
  start(): void {
    if (this.intervalId) {
      console.log('[ContractExpiration] Already running');
      return;
    }

    console.log('[ContractExpiration] Starting - checking every minute for expired contracts');

    // Run immediately
    this.checkExpiredContracts();

    // Then run every minute
    this.intervalId = setInterval(() => this.checkExpiredContracts(), CHECK_INTERVAL_MS);
  }

  /**
   * Stop the expiration checker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ContractExpiration] Stopped');
    }
  }

  /**
   * Check for and process expired contracts
   */
  private async checkExpiredContracts(): Promise<void> {
    // Prevent overlapping executions
    if (this.isProcessing) {
      console.log('[ContractExpiration] Previous check still running, skipping');
      return;
    }

    this.isProcessing = true;
    try {
      const now = new Date();

      // Find contracts past their funding deadline that are still in PROPOSED or FUNDING
      const expiredContracts = await prisma.contract.findMany({
        where: {
          status: { in: [ContractStatus.PROPOSED, ContractStatus.FUNDING] },
          fundingDeadline: { lt: now },
        },
        include: {
          parties: true,
        },
      });

      if (expiredContracts.length > 0) {
        console.log(`[ContractExpiration] Found ${expiredContracts.length} expired contract(s)`);
      }

      for (const contract of expiredContracts) {
        await this.expireContract(contract);
      }
    } catch (err) {
      console.error('[ContractExpiration] Check error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Expire a single contract and return escrows to BSIM
   */
  private async expireContract(contract: {
    id: string;
    title: string;
    status: ContractStatus;
    parties: {
      id: string;
      walletId: string;
      displayName: string;
      escrowId: string | null;
      funded: boolean;
      stakeAmount: { toString(): string };
    }[];
  }): Promise<void> {
    console.log(`[ContractExpiration] Expiring contract ${contract.id} (${contract.title})`);

    const previousStatus = contract.status;

    // Return escrows for any funded parties
    for (const party of contract.parties) {
      if (party.escrowId && party.funded) {
        try {
          console.log(`[ContractExpiration] Returning escrow ${party.escrowId} for ${party.walletId}`);
          await bsimClient.returnEscrow(
            party.escrowId,
            contract.id,
            'Contract expired - funding deadline passed'
          );
          console.log(`[ContractExpiration] Escrow ${party.escrowId} returned successfully`);
        } catch (err) {
          // Log but continue - BSIM may have already expired the escrow
          console.error(
            `[ContractExpiration] Failed to return escrow ${party.escrowId}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    // Update contract status
    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: ContractStatus.EXPIRED },
    });

    // Audit log
    await auditService.logStatusChange(
      contract.id,
      previousStatus,
      ContractStatus.EXPIRED,
      'system'
    );

    // Notify both parties of expiration
    for (const party of contract.parties) {
      const refundAmount = party.funded ? party.stakeAmount.toString() : '0.00';
      await webhookService.notifyContractExpired(
        contract.id,
        contract.title,
        party.walletId,
        refundAmount
      );
    }

    console.log(`[ContractExpiration] Contract ${contract.id} expired and parties notified`);
  }

  /**
   * Manually expire a contract (for admin use)
   */
  async forceExpire(contractId: string): Promise<void> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { parties: true },
    });

    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    if (contract.status !== ContractStatus.PROPOSED && contract.status !== ContractStatus.FUNDING) {
      throw new Error(`Cannot expire contract in ${contract.status} status`);
    }

    await this.expireContract(contract);
  }
}

export const contractExpirationService = new ContractExpirationService();

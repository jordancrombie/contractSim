import prisma from '../config/database';
import { ContractStatus } from '@prisma/client';
import { bsimClient } from './BsimClient';
import { transferSimClient } from './TransferSimClient';
import { webhookService } from './WebhookService';
import { auditService } from './AuditService';

export class SettlementService {
  /**
   * Trigger settlement for a contract
   * Called when all conditions are resolved
   */
  async settleContract(contractId: string): Promise<void> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        parties: true,
        conditions: true,
      },
    });

    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      throw new Error(`Contract ${contractId} is not in ACTIVE status`);
    }

    // Check all conditions are resolved
    const unresolvedConditions = contract.conditions.filter(c => c.status !== 'RESOLVED');
    if (unresolvedConditions.length > 0) {
      throw new Error(`Contract ${contractId} has ${unresolvedConditions.length} unresolved conditions`);
    }

    // Determine winner based on conditions
    // For wagers: party whose prediction matched wins
    const { winner, loser } = this.determineOutcome(contract);

    if (!winner || !loser) {
      // Refund scenario - no clear winner
      await this.processRefund(contract);
      return;
    }

    // Transition to SETTLING
    await prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.SETTLING },
    });

    await auditService.logStatusChange(
      contractId,
      ContractStatus.ACTIVE,
      ContractStatus.SETTLING,
      'system'
    );

    // Notify both parties of outcome (winner gets "won", loser gets "lost")
    await webhookService.notifyContractOutcome(
      contractId,
      contract.title,
      { walletId: winner.walletId, displayName: winner.displayName },
      { walletId: loser.walletId, displayName: loser.displayName }
    );

    // Create settlement via TransferSim
    try {
      const totalPot = parseFloat(contract.totalPot.toString());

      const settlement = await transferSimClient.createSettlement({
        contractId,
        settlementType: 'winner_payout',
        from: {
          walletId: loser.walletId,
          bankId: loser.bankId,
          escrowId: loser.escrowId!,
        },
        to: {
          walletId: winner.walletId,
          bankId: winner.bankId,
        },
        amount: totalPot,
        currency: contract.currency,
        metadata: {
          contractTitle: contract.title,
          originalStake: parseFloat(winner.stakeAmount.toString()),
          winnings: parseFloat(loser.stakeAmount.toString()),
          loserDisplayName: loser.displayName,
          winnerDisplayName: winner.displayName,
        },
      });

      // Create outcome record
      await prisma.contractOutcome.create({
        data: {
          contractId,
          winnerId: winner.walletId,
          loserId: loser.walletId,
          settlementType: 'winner_payout',
          settlementId: settlement.settlement_id,
          transferId: settlement.transfer_id,
        },
      });

      // Release loser's escrow
      await bsimClient.releaseEscrow(loser.escrowId!, {
        releaseType: 'settlement',
        transferReference: settlement.transfer_id,
        contractId,
        reason: 'contract_settlement',
      });

      // Release winner's escrow (their stake returned + winnings come from transfer)
      await bsimClient.releaseEscrow(winner.escrowId!, {
        releaseType: 'settlement',
        transferReference: settlement.transfer_id,
        contractId,
        reason: 'contract_settlement',
      });

      console.log(`[Settlement] Contract ${contractId} settlement initiated: ${settlement.settlement_id}`);

      // Settlement completion will be handled by webhook from TransferSim

    } catch (err) {
      console.error(`[Settlement] Failed for contract ${contractId}:`, err);

      // Transition to DISPUTED
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.DISPUTED },
      });

      await prisma.dispute.create({
        data: {
          contractId,
          filedBy: 'system',
          reason: `Settlement failed: ${(err as Error).message}`,
          status: 'OPEN',
        },
      });

      throw err;
    }
  }

  /**
   * Process refund when there's no clear winner
   */
  private async processRefund(contract: {
    id: string;
    title: string;
    parties: { walletId: string; escrowId: string | null; displayName: string; stakeAmount: { toString(): string } }[];
  }): Promise<void> {
    console.log(`[Settlement] Processing refund for contract ${contract.id}`);

    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: ContractStatus.SETTLING },
    });

    // Return escrow to each party
    for (const party of contract.parties) {
      if (party.escrowId) {
        try {
          await bsimClient.returnEscrow(
            party.escrowId,
            contract.id,
            'contract_refund'
          );
        } catch (err) {
          console.error(`[Settlement] Failed to return escrow for ${party.walletId}:`, err);
        }
      }
    }

    // Create outcome record
    await prisma.contractOutcome.create({
      data: {
        contractId: contract.id,
        settlementType: 'refund',
      },
    });

    // Transition to SETTLED
    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: ContractStatus.SETTLED,
        settledAt: new Date(),
      },
    });

    // Notify both parties of expiration/refund
    for (const party of contract.parties) {
      await webhookService.notifyContractExpired(
        contract.id,
        contract.title,
        party.walletId,
        party.stakeAmount?.toString() || '0.00'
      );
    }
  }

  /**
   * Determine winner and loser based on condition results
   */
  private determineOutcome(contract: {
    type: string;
    parties: {
      walletId: string;
      bankId: string;
      displayName: string;
      role: string;
      stakeAmount: { toString(): string };
      escrowId: string | null;
      outcomeIfTrue: string;
      outcomeIfFalse: string;
    }[];
    conditions: {
      result: boolean | null;
    }[];
  }): {
    winner: typeof contract.parties[0] | null;
    loser: typeof contract.parties[0] | null;
  } {
    // For simple 2-party wager with 1 condition
    const conditionResult = contract.conditions[0]?.result;

    if (conditionResult === null) {
      return { winner: null, loser: null };
    }

    // Find party who wins based on condition result
    const winner = contract.parties.find(p =>
      (conditionResult && p.outcomeIfTrue === 'WINNER') ||
      (!conditionResult && p.outcomeIfFalse === 'WINNER')
    );

    const loser = contract.parties.find(p =>
      (conditionResult && p.outcomeIfTrue === 'LOSER') ||
      (!conditionResult && p.outcomeIfFalse === 'LOSER')
    );

    return { winner: winner || null, loser: loser || null };
  }

  /**
   * Check if a contract is ready for settlement
   */
  async checkAndSettle(contractId: string): Promise<boolean> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { conditions: true },
    });

    if (!contract || contract.status !== ContractStatus.ACTIVE) {
      return false;
    }

    const allResolved = contract.conditions.every(c => c.status === 'RESOLVED');

    if (allResolved) {
      await this.settleContract(contractId);
      return true;
    }

    return false;
  }
}

export const settlementService = new SettlementService();

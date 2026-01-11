import { Router, Request, Response, NextFunction } from 'express';
import { serviceAuth, allowServices, AuthenticatedRequest } from '../middleware/auth';
import { settlementService } from '../services/SettlementService';
import prisma from '../config/database';

const router = Router();

// All webhook routes require service authentication
router.use(serviceAuth);

/**
 * POST /webhooks/bsim
 * Receive escrow events from BSIM
 */
router.post(
  '/bsim',
  allowServices('bsim'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { event_type, data } = req.body;

      console.log(`[Webhook] Received from BSIM: ${event_type}`);

      switch (event_type) {
        case 'escrow.held':
          // Escrow has been successfully created
          await handleEscrowHeld(data);
          break;

        case 'escrow.expired':
          // Escrow expired and funds were returned
          await handleEscrowExpired(data);
          break;

        case 'escrow.released':
          // Escrow was released for settlement
          await handleEscrowReleased(data);
          break;

        case 'escrow.returned':
          // Escrow was returned (cancelled)
          await handleEscrowReturned(data);
          break;

        default:
          console.warn(`[Webhook] Unknown BSIM event type: ${event_type}`);
      }

      res.json({ received: true, event_type });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /webhooks/transfersim
 * Receive settlement events from TransferSim
 */
router.post(
  '/transfersim',
  allowServices('transfersim'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { event_type, data } = req.body;

      console.log(`[Webhook] Received from TransferSim: ${event_type}`);

      switch (event_type) {
        case 'settlement.completed':
          await handleSettlementCompleted(data);
          break;

        case 'settlement.failed':
          await handleSettlementFailed(data);
          break;

        default:
          console.warn(`[Webhook] Unknown TransferSim event type: ${event_type}`);
      }

      res.json({ received: true, event_type });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// BSIM Event Handlers
// ============================================

async function handleEscrowHeld(data: {
  escrow_id: string;
  contract_id: string;
  user_id: string;
  wallet_id: string;
  amount: number;
}): Promise<void> {
  console.log(`[Webhook] Escrow held: ${data.escrow_id} for contract ${data.contract_id}`);

  // Update party with escrow ID and mark as funded
  const party = await prisma.contractParty.findFirst({
    where: {
      contractId: data.contract_id,
      walletId: data.wallet_id,
    },
  });

  if (party && !party.funded) {
    await prisma.contractParty.update({
      where: { id: party.id },
      data: {
        escrowId: data.escrow_id,
        funded: true,
        fundedAt: new Date(),
      },
    });

    // Check if all parties are now funded
    const contract = await prisma.contract.findUnique({
      where: { id: data.contract_id },
      include: { parties: true },
    });

    if (contract && contract.parties.every(p => p.funded || p.walletId === data.wallet_id)) {
      // Transition to ACTIVE
      await prisma.contract.update({
        where: { id: data.contract_id },
        data: {
          status: 'ACTIVE',
          fundedAt: new Date(),
        },
      });
      console.log(`[Webhook] Contract ${data.contract_id} is now ACTIVE`);
    }
  }
}

async function handleEscrowExpired(data: {
  escrow_id: string;
  contract_id: string;
  wallet_id: string;
}): Promise<void> {
  console.log(`[Webhook] Escrow expired: ${data.escrow_id} for contract ${data.contract_id}`);

  // Check if contract should be expired
  const contract = await prisma.contract.findUnique({
    where: { id: data.contract_id },
  });

  if (contract && contract.status === 'FUNDING') {
    await prisma.contract.update({
      where: { id: data.contract_id },
      data: { status: 'EXPIRED' },
    });
    console.log(`[Webhook] Contract ${data.contract_id} expired due to escrow timeout`);
  }
}

async function handleEscrowReleased(data: {
  escrow_id: string;
  contract_id: string;
  transfer_reference: string;
}): Promise<void> {
  console.log(`[Webhook] Escrow released: ${data.escrow_id} for settlement`);
  // Settlement is being processed by TransferSim
}

async function handleEscrowReturned(data: {
  escrow_id: string;
  contract_id: string;
  reason: string;
}): Promise<void> {
  console.log(`[Webhook] Escrow returned: ${data.escrow_id}, reason: ${data.reason}`);
  // Funds have been returned to user
}

// ============================================
// TransferSim Event Handlers
// ============================================

async function handleSettlementCompleted(data: {
  settlement_id: string;
  transfer_id: string;
  contract_id: string;
  amount: number;
  from_wallet_id: string;
  to_wallet_id: string;
}): Promise<void> {
  console.log(`[Webhook] Settlement completed: ${data.settlement_id} for contract ${data.contract_id}`);

  // Update contract outcome
  await prisma.contractOutcome.upsert({
    where: { contractId: data.contract_id },
    create: {
      contractId: data.contract_id,
      winnerId: data.to_wallet_id,
      loserId: data.from_wallet_id,
      settlementType: 'winner_payout',
      transferId: data.transfer_id,
      settlementId: data.settlement_id,
    },
    update: {
      transferId: data.transfer_id,
      settlementId: data.settlement_id,
    },
  });

  // Transition contract to SETTLED
  await prisma.contract.update({
    where: { id: data.contract_id },
    data: {
      status: 'SETTLED',
      settledAt: new Date(),
    },
  });

  console.log(`[Webhook] Contract ${data.contract_id} is now SETTLED`);

  // TODO: Notify WSIM of settlement
}

async function handleSettlementFailed(data: {
  settlement_id: string;
  contract_id: string;
  error: string;
  error_message: string;
}): Promise<void> {
  console.error(`[Webhook] Settlement failed: ${data.settlement_id} - ${data.error_message}`);

  // Mark contract as disputed for manual resolution
  await prisma.contract.update({
    where: { id: data.contract_id },
    data: { status: 'DISPUTED' },
  });

  // Create dispute record
  await prisma.dispute.create({
    data: {
      contractId: data.contract_id,
      filedBy: 'system',
      reason: `Settlement failed: ${data.error_message}`,
      evidence: data as object,
      status: 'OPEN',
    },
  });

  console.log(`[Webhook] Contract ${data.contract_id} marked as DISPUTED due to settlement failure`);
}

export default router;

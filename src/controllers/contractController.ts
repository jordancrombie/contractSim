import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { contractService } from '../services/ContractService';
import { bsimClient, BsimError } from '../services/BsimClient';
import { AuthenticatedRequest } from '../middleware/auth';
import { IdempotentRequest } from '../middleware/idempotency';
import { ContractType, EscrowType, SettlementType, PartyRole, ContractStatus } from '@prisma/client';
import { ValidationError, ConflictError, ForbiddenError } from '../middleware/errorHandler';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createContractSchema = z.object({
  type: z.nativeEnum(ContractType),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  parties: z.array(z.object({
    walletId: z.string(),
    bankId: z.string(),
    displayName: z.string(),
    role: z.nativeEnum(PartyRole),
    stakeAmount: z.number().positive().max(100),
  })).min(2).max(2),
  conditions: z.array(z.object({
    oracleId: z.string(),
    eventType: z.string(),
    eventId: z.string(),
    predicateField: z.string(),
    predicateOperator: z.string(),
    predicateValue: z.string(),
  })).min(1),
  escrowType: z.nativeEnum(EscrowType).optional(),
  settlementType: z.nativeEnum(SettlementType).optional(),
  expiresAt: z.string().datetime(),
  fundingDeadline: z.string().datetime().optional(),
});

const listContractsSchema = z.object({
  status: z.string().optional(),
  type: z.nativeEnum(ContractType).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const initiateFundingSchema = z.object({
  account_id: z.string().min(1),
  bsim_user_id: z.string().min(1),
});

// ============================================
// CONTROLLER
// ============================================

export class ContractController {
  /**
   * POST /api/v1/contracts
   * Create a new contract
   */
  async createContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest & IdempotentRequest;
      const walletId = authReq.serviceIdentity.walletId;

      if (!walletId) {
        throw new ValidationError('Missing wallet context');
      }

      const parsed = createContractSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      }

      const contract = await contractService.createContract(
        {
          ...parsed.data,
          expiresAt: new Date(parsed.data.expiresAt),
          fundingDeadline: parsed.data.fundingDeadline
            ? new Date(parsed.data.fundingDeadline)
            : undefined,
          idempotencyKey: authReq.idempotencyKey,
        },
        walletId
      );

      res.status(201).json({
        contract_id: contract.id,
        status: contract.status.toLowerCase(),
        title: contract.title,
        total_pot: contract.totalPot.toString(),
        currency: contract.currency,
        parties: contract.parties.map(p => ({
          wallet_id: p.walletId,
          display_name: p.displayName,
          role: p.role.toLowerCase(),
          stake: p.stakeAmount.toString(),
          accepted: p.accepted,
          funded: p.funded,
        })),
        conditions_count: contract.conditions.length,
        expires_at: contract.expiresAt.toISOString(),
        funding_deadline: contract.fundingDeadline.toISOString(),
        created_at: contract.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/contracts/:id
   * Get contract details
   */
  async getContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const contract = await contractService.getContract(id);

      res.json({
        contract_id: contract.id,
        type: contract.type.toLowerCase(),
        status: contract.status.toLowerCase(),
        title: contract.title,
        description: contract.description,
        total_pot: contract.totalPot.toString(),
        currency: contract.currency,
        escrow_type: contract.escrowType.toLowerCase(),
        settlement_type: contract.settlementType.toLowerCase(),
        parties: contract.parties.map(p => ({
          wallet_id: p.walletId,
          bank_id: p.bankId,
          display_name: p.displayName,
          role: p.role.toLowerCase(),
          stake: p.stakeAmount.toString(),
          accepted: p.accepted,
          accepted_at: p.acceptedAt?.toISOString(),
          funded: p.funded,
          funded_at: p.fundedAt?.toISOString(),
          escrow_id: p.escrowId,
        })),
        conditions: contract.conditions.map(c => ({
          index: c.index,
          oracle_id: c.oracleId,
          event_type: c.eventType,
          event_id: c.eventId,
          predicate: {
            field: c.predicateField,
            operator: c.predicateOperator.toLowerCase(),
            value: c.predicateValue,
          },
          status: c.status.toLowerCase(),
          result: c.result,
        })),
        expires_at: contract.expiresAt.toISOString(),
        funding_deadline: contract.fundingDeadline.toISOString(),
        created_at: contract.createdAt.toISOString(),
        accepted_at: contract.acceptedAt?.toISOString(),
        funded_at: contract.fundedAt?.toISOString(),
        resolved_at: contract.resolvedAt?.toISOString(),
        settled_at: contract.settledAt?.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/contracts
   * List contracts for a user
   */
  async listContracts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const walletId = authReq.serviceIdentity.walletId;

      if (!walletId) {
        throw new ValidationError('Missing wallet context');
      }

      const parsed = listContractsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters', parsed.error.flatten());
      }

      const statusFilter = parsed.data.status
        ? parsed.data.status.split(',').map(s => s.trim().toUpperCase()) as ContractStatus[]
        : undefined;

      const { contracts, total } = await contractService.listContracts(walletId, {
        status: statusFilter,
        type: parsed.data.type,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });

      res.json({
        contracts: contracts.map(c => ({
          contract_id: c.id,
          type: c.type.toLowerCase(),
          status: c.status.toLowerCase(),
          title: c.title,
          total_pot: c.totalPot.toString(),
          currency: c.currency,
          parties_count: c.parties.length,
          parties: c.parties.map(p => ({
            wallet_id: p.walletId,
            display_name: p.displayName,
            role: p.role.toLowerCase(),
          })),
          expires_at: c.expiresAt.toISOString(),
          created_at: c.createdAt.toISOString(),
        })),
        total,
        limit: parsed.data.limit || 20,
        offset: parsed.data.offset || 0,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/contracts/:id/accept
   * Accept a contract
   */
  async acceptContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const walletId = authReq.serviceIdentity.walletId;
      const { id } = req.params;

      if (!walletId) {
        throw new ValidationError('Missing wallet context');
      }

      const contract = await contractService.acceptContract(id, walletId);

      res.json({
        contract_id: contract.id,
        status: contract.status.toLowerCase(),
        message: 'Contract accepted',
        all_accepted: contract.parties.every(p => p.accepted),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/contracts/:id/fund
   * Initiate funding by calling BSIM escrow API
   *
   * This endpoint is called by WSIM to initiate the escrow creation.
   * The actual funding is recorded when BSIM sends the escrow.held webhook.
   */
  async initiateFunding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const walletId = authReq.serviceIdentity.walletId;
      const { id: contractId } = req.params;

      if (!walletId) {
        throw new ValidationError('Missing wallet context');
      }

      const parsed = initiateFundingSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      }

      const { account_id, bsim_user_id } = parsed.data;

      // Get contract and validate state
      const contract = await contractService.getContract(contractId);

      // Find user's party
      const party = contract.parties.find(p => p.walletId === walletId);
      if (!party) {
        throw new ForbiddenError('You are not a party to this contract');
      }

      if (party.funded) {
        throw new ConflictError('You have already funded this contract');
      }

      // Validate funding is allowed based on contract type, status, and role
      // FUNDING state always allows funding
      if (contract.status !== ContractStatus.FUNDING) {
        // WAGER type: Creator can fund in PROPOSED state (before counterparty accepts)
        if (contract.type === ContractType.WAGER && contract.status === ContractStatus.PROPOSED) {
          if (party.role !== PartyRole.CREATOR) {
            throw new ConflictError(
              'Counterparty must accept the wager before funding. Please accept the contract first.'
            );
          }
          // Creator can proceed - continue to escrow creation
        } else {
          // All other cases: funding not allowed
          throw new ConflictError(`Cannot fund contract in ${contract.status} status`);
        }
      }

      // Call BSIM to create escrow hold
      console.log(`[Fund] Initiating escrow for contract ${contractId}, user ${walletId}`);

      try {
        await bsimClient.createEscrowHold({
          userId: bsim_user_id,
          walletId: walletId,
          accountId: account_id,
          amount: parseFloat(party.stakeAmount.toString()),
          currency: contract.currency,
          contractId: contract.id,
          expiresAt: contract.fundingDeadline,
          description: `Escrow for: ${contract.title}`,
        });
      } catch (err) {
        if (err instanceof BsimError) {
          console.error(`[Fund] BSIM escrow creation failed: ${err.message}`);
          throw new ConflictError(`Escrow creation failed: ${err.message}`);
        }
        throw err;
      }

      console.log(`[Fund] Escrow creation initiated for contract ${contractId}`);

      // Return 202 Accepted - funding will be confirmed via webhook
      res.status(202).json({
        contract_id: contract.id,
        status: 'funding_initiated',
        message: 'Escrow creation initiated. Contract will be updated when confirmed.',
        stake_amount: party.stakeAmount.toString(),
        currency: contract.currency,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Record funding (internal - used by webhook handler)
   * @deprecated Use webhook handler directly instead
   */
  async recordFunding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { wallet_id, escrow_id, amount } = req.body;

      if (!wallet_id || !escrow_id || amount === undefined) {
        throw new ValidationError('Missing required fields: wallet_id, escrow_id, amount');
      }

      const contract = await contractService.recordFunding(
        id,
        wallet_id,
        escrow_id,
        parseFloat(amount)
      );

      res.json({
        contract_id: contract.id,
        status: contract.status.toLowerCase(),
        message: 'Funding recorded',
        all_funded: contract.parties.every(p => p.funded),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/contracts/:id/cancel
   * Cancel a contract
   */
  async cancelContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const walletId = authReq.serviceIdentity.walletId;
      const { id } = req.params;

      if (!walletId) {
        throw new ValidationError('Missing wallet context');
      }

      const contract = await contractService.cancelContract(id, walletId);

      res.json({
        contract_id: contract.id,
        status: contract.status.toLowerCase(),
        message: 'Contract cancelled',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const contractController = new ContractController();

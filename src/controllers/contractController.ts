import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { contractService } from '../services/ContractService';
import { AuthenticatedRequest } from '../middleware/auth';
import { IdempotentRequest } from '../middleware/idempotency';
import { ContractType, EscrowType, SettlementType, PartyRole, ContractStatus } from '@prisma/client';
import { ValidationError } from '../middleware/errorHandler';

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
        status: contract.status,
        title: contract.title,
        total_pot: contract.totalPot.toString(),
        currency: contract.currency,
        parties: contract.parties.map(p => ({
          wallet_id: p.walletId,
          display_name: p.displayName,
          role: p.role,
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
        type: contract.type,
        status: contract.status,
        title: contract.title,
        description: contract.description,
        total_pot: contract.totalPot.toString(),
        currency: contract.currency,
        escrow_type: contract.escrowType,
        settlement_type: contract.settlementType,
        parties: contract.parties.map(p => ({
          wallet_id: p.walletId,
          bank_id: p.bankId,
          display_name: p.displayName,
          role: p.role,
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
            operator: c.predicateOperator,
            value: c.predicateValue,
          },
          status: c.status,
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
          type: c.type,
          status: c.status,
          title: c.title,
          total_pot: c.totalPot.toString(),
          currency: c.currency,
          parties_count: c.parties.length,
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
        status: contract.status,
        message: 'Contract accepted',
        all_accepted: contract.parties.every(p => p.accepted),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/contracts/:id/fund
   * Record funding (called by BSIM)
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
        status: contract.status,
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
        status: contract.status,
        message: 'Contract cancelled',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const contractController = new ContractController();

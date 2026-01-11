import prisma from '../config/database';
import { env } from '../config/env';
import { auditService } from './AuditService';
import {
  Contract,
  ContractParty,
  ContractStatus,
  ContractType,
  EscrowType,
  SettlementType,
  PartyRole,
  Prisma,
} from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../middleware/errorHandler';

// ============================================
// DTOs
// ============================================

export interface CreateContractDto {
  type: ContractType;
  title: string;
  description?: string;
  parties: {
    walletId: string;
    bankId: string;
    displayName: string;
    role: PartyRole;
    stakeAmount: number;
  }[];
  conditions: {
    oracleId: string;
    eventType: string;
    eventId: string;
    predicateField: string;
    predicateOperator: string;
    predicateValue: string;
  }[];
  escrowType?: EscrowType;
  settlementType?: SettlementType;
  expiresAt: Date;
  fundingDeadline?: Date;
  idempotencyKey?: string;
}

export interface ContractWithRelations extends Contract {
  parties: ContractParty[];
  conditions: {
    id: string;
    index: number;
    oracleId: string;
    eventType: string;
    eventId: string;
    predicateField: string;
    predicateOperator: string;
    predicateValue: string;
    status: string;
    result: boolean | null;
  }[];
}

// ============================================
// SERVICE
// ============================================

export class ContractService {
  /**
   * Create a new contract
   */
  async createContract(dto: CreateContractDto, creatorWalletId: string): Promise<ContractWithRelations> {
    // Validate
    this.validateCreateContract(dto, creatorWalletId);

    // Calculate total pot
    const totalPot = dto.parties.reduce((sum, p) => sum + p.stakeAmount, 0);

    // Validate max value
    if (totalPot > env.contracts.maxValue) {
      throw new ValidationError(`Total pot ${totalPot} exceeds maximum ${env.contracts.maxValue}`);
    }

    // Set funding deadline if not provided
    const fundingDeadline = dto.fundingDeadline || new Date(
      Date.now() + env.contracts.defaultFundingTimeoutHours * 60 * 60 * 1000
    );

    // Create contract with parties and conditions
    const contract = await prisma.contract.create({
      data: {
        type: dto.type,
        status: ContractStatus.PROPOSED,
        title: dto.title,
        description: dto.description,
        totalPot: new Prisma.Decimal(totalPot),
        currency: env.contracts.defaultCurrency,
        escrowType: dto.escrowType || EscrowType.FULL,
        settlementType: dto.settlementType || SettlementType.WINNER_TAKES_ALL,
        expiresAt: dto.expiresAt,
        fundingDeadline,
        idempotencyKey: dto.idempotencyKey,
        parties: {
          create: dto.parties.map((p, index) => ({
            walletId: p.walletId,
            bankId: p.bankId,
            displayName: p.displayName,
            role: p.role,
            stakeAmount: new Prisma.Decimal(p.stakeAmount),
            stakeCurrency: env.contracts.defaultCurrency,
            // Creator auto-accepts
            accepted: p.walletId === creatorWalletId,
            acceptedAt: p.walletId === creatorWalletId ? new Date() : null,
          })),
        },
        conditions: {
          create: dto.conditions.map((c, index) => ({
            index,
            oracleId: c.oracleId,
            eventType: c.eventType,
            eventId: c.eventId,
            predicateField: c.predicateField,
            predicateOperator: c.predicateOperator as any,
            predicateValue: c.predicateValue,
          })),
        },
      },
      include: {
        parties: true,
        conditions: true,
      },
    });

    // Audit log
    await auditService.logContractCreated(contract, creatorWalletId);

    return contract as ContractWithRelations;
  }

  /**
   * Get a contract by ID
   */
  async getContract(contractId: string): Promise<ContractWithRelations> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        parties: true,
        conditions: true,
        outcome: true,
        dispute: true,
      },
    });

    if (!contract) {
      throw new NotFoundError('Contract');
    }

    return contract as ContractWithRelations;
  }

  /**
   * List contracts for a user
   */
  async listContracts(
    walletId: string,
    filters?: {
      status?: ContractStatus[];
      type?: ContractType;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ contracts: ContractWithRelations[]; total: number }> {
    const where: Prisma.ContractWhereInput = {
      parties: {
        some: { walletId },
      },
      ...(filters?.status && { status: { in: filters.status } }),
      ...(filters?.type && { type: filters.type }),
    };

    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: {
          parties: true,
          conditions: true,
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      }),
      prisma.contract.count({ where }),
    ]);

    return {
      contracts: contracts as ContractWithRelations[],
      total,
    };
  }

  /**
   * Accept a contract (counterparty)
   */
  async acceptContract(contractId: string, walletId: string): Promise<ContractWithRelations> {
    const contract = await this.getContract(contractId);

    // Validate state
    if (contract.status !== ContractStatus.PROPOSED) {
      throw new ConflictError(`Cannot accept contract in ${contract.status} status`);
    }

    // Find party
    const party = contract.parties.find(p => p.walletId === walletId);
    if (!party) {
      throw new ForbiddenError('You are not a party to this contract');
    }

    if (party.accepted) {
      throw new ConflictError('You have already accepted this contract');
    }

    // Update party
    await prisma.contractParty.update({
      where: { id: party.id },
      data: {
        accepted: true,
        acceptedAt: new Date(),
      },
    });

    // Audit
    await auditService.logPartyAccepted(contractId, walletId);

    // Check if all parties accepted
    const updatedContract = await this.getContract(contractId);
    const allAccepted = updatedContract.parties.every(p => p.accepted);

    if (allAccepted) {
      // Transition to FUNDING
      await this.transitionStatus(contractId, ContractStatus.FUNDING, 'system');
    }

    return this.getContract(contractId);
  }

  /**
   * Record funding from BSIM
   */
  async recordFunding(
    contractId: string,
    walletId: string,
    escrowId: string,
    amount: number
  ): Promise<ContractWithRelations> {
    const contract = await this.getContract(contractId);

    if (contract.status !== ContractStatus.FUNDING) {
      throw new ConflictError(`Cannot fund contract in ${contract.status} status`);
    }

    const party = contract.parties.find(p => p.walletId === walletId);
    if (!party) {
      throw new ForbiddenError('Wallet is not a party to this contract');
    }

    if (party.funded) {
      throw new ConflictError('This party has already funded');
    }

    // Verify amount
    if (amount !== parseFloat(party.stakeAmount.toString())) {
      throw new ValidationError(
        `Funding amount ${amount} does not match stake ${party.stakeAmount}`
      );
    }

    // Update party
    await prisma.contractParty.update({
      where: { id: party.id },
      data: {
        funded: true,
        fundedAt: new Date(),
        escrowId,
      },
    });

    // Audit
    await auditService.logFunding(contractId, walletId, escrowId, amount.toString());

    // Check if all parties funded
    const updatedContract = await this.getContract(contractId);
    const allFunded = updatedContract.parties.every(p => p.funded);

    if (allFunded) {
      // Transition to ACTIVE
      await prisma.contract.update({
        where: { id: contractId },
        data: {
          status: ContractStatus.ACTIVE,
          fundedAt: new Date(),
        },
      });
      await auditService.logStatusChange(
        contractId,
        ContractStatus.FUNDING,
        ContractStatus.ACTIVE,
        'system'
      );
    }

    return this.getContract(contractId);
  }

  /**
   * Cancel a contract
   */
  async cancelContract(contractId: string, walletId: string): Promise<ContractWithRelations> {
    const contract = await this.getContract(contractId);

    // Can only cancel in DRAFT or PROPOSED
    if (contract.status !== ContractStatus.DRAFT && contract.status !== ContractStatus.PROPOSED) {
      throw new ConflictError(`Cannot cancel contract in ${contract.status} status`);
    }

    // Must be a party
    const party = contract.parties.find(p => p.walletId === walletId);
    if (!party) {
      throw new ForbiddenError('You are not a party to this contract');
    }

    await this.transitionStatus(contractId, ContractStatus.CANCELLED, walletId);

    return this.getContract(contractId);
  }

  /**
   * Transition contract status
   */
  private async transitionStatus(
    contractId: string,
    newStatus: ContractStatus,
    actor: string
  ): Promise<void> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new NotFoundError('Contract');
    }

    const previousStatus = contract.status;

    await prisma.contract.update({
      where: { id: contractId },
      data: { status: newStatus },
    });

    await auditService.logStatusChange(contractId, previousStatus, newStatus, actor);
  }

  /**
   * Validate create contract request
   */
  private validateCreateContract(dto: CreateContractDto, creatorWalletId: string): void {
    if (dto.parties.length < 2) {
      throw new ValidationError('Contract must have at least 2 parties');
    }

    if (dto.parties.length > 2) {
      throw new ValidationError('Multi-party contracts not yet supported');
    }

    const creator = dto.parties.find(p => p.walletId === creatorWalletId);
    if (!creator) {
      throw new ValidationError('Creator must be a party to the contract');
    }

    if (creator.role !== PartyRole.CREATOR) {
      throw new ValidationError('Creator must have CREATOR role');
    }

    if (dto.conditions.length < 1) {
      throw new ValidationError('Contract must have at least 1 condition');
    }

    if (new Date(dto.expiresAt) <= new Date()) {
      throw new ValidationError('Expiration date must be in the future');
    }
  }
}

export const contractService = new ContractService();

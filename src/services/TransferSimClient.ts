import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';

interface SettlementRequest {
  contractId: string;
  settlementType: 'winner_payout' | 'refund' | 'partial';
  from: {
    walletId: string;
    bankId: string;
    escrowId: string;
    userId: string; // BSIM user ID for escrow release
  };
  to: {
    walletId: string;
    bankId: string;
    userId: string; // BSIM user ID for credit
  };
  amount: number;
  currency: string;
  metadata: {
    contractTitle: string;
    originalStake: number;
    winnings: number;
    loserDisplayName: string;
    winnerDisplayName: string;
  };
}

interface SettlementResponse {
  settlement_id: string;
  transfer_id: string;
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  from_wallet_id: string;
  to_wallet_id: string;
  created_at: string;
  completed_at?: string;
}

export class TransferSimClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.services.transfersim;
    this.apiKey = env.apiKeys.transfersim;
  }

  /**
   * Create a settlement transfer
   */
  async createSettlement(request: SettlementRequest): Promise<SettlementResponse> {
    const idempotencyKey = `${request.contractId}_settlement_${Date.now()}`;

    const response = await fetch(`${this.baseUrl}/api/v1/settlements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        contract_id: request.contractId,
        settlement_type: request.settlementType,
        from: {
          wallet_id: request.from.walletId,
          bank_id: request.from.bankId,
          escrow_id: request.from.escrowId,
          user_id: request.from.userId,
        },
        to: {
          wallet_id: request.to.walletId,
          bank_id: request.to.bankId,
          user_id: request.to.userId,
        },
        amount: request.amount,
        currency: request.currency,
        metadata: {
          contract_title: request.metadata.contractTitle,
          original_stake: request.metadata.originalStake,
          winnings: request.metadata.winnings,
          loser_display_name: request.metadata.loserDisplayName,
          winner_display_name: request.metadata.winnerDisplayName,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; code?: string };
      throw new TransferSimError(
        response.status,
        error.error || 'Failed to create settlement',
        error.code
      );
    }

    return response.json() as Promise<SettlementResponse>;
  }

  /**
   * Get settlement status
   */
  async getSettlementStatus(settlementId: string): Promise<SettlementResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/settlements/${settlementId}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; code?: string };
      throw new TransferSimError(
        response.status,
        error.error || 'Failed to get settlement status',
        error.code
      );
    }

    return response.json() as Promise<SettlementResponse>;
  }
}

export class TransferSimError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'TransferSimError';
  }
}

export const transferSimClient = new TransferSimClient();

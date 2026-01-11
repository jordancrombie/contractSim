import { env } from '../config/env';

interface EscrowHoldRequest {
  userId: string;
  accountId: string;
  amount: number;
  currency: string;
  contractId: string;
  expiresAt: Date;
  description: string;
}

interface EscrowHoldResponse {
  escrow_id: string;
  status: string;
  amount: number;
  available_balance: number;
  escrowed_balance: number;
  created_at: string;
}

interface EscrowReleaseRequest {
  releaseType: 'settlement' | 'return';
  transferReference?: string;
  contractId: string;
  reason: string;
}

export class BsimClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.services.bsim;
    this.apiKey = env.apiKeys.bsim;
  }

  /**
   * Create an escrow hold on a user's account
   */
  async createEscrowHold(request: EscrowHoldRequest): Promise<EscrowHoldResponse> {
    const response = await fetch(`${this.baseUrl}/api/escrow/hold`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        user_id: request.userId,
        account_id: request.accountId,
        amount: request.amount,
        currency: request.currency,
        contract_id: request.contractId,
        contract_service: 'contractsim',
        hold_type: 'escrow',
        expires_at: request.expiresAt.toISOString(),
        description: request.description,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; code?: string };
      throw new BsimError(
        response.status,
        error.error || 'Failed to create escrow hold',
        error.code
      );
    }

    return response.json() as Promise<EscrowHoldResponse>;
  }

  /**
   * Release an escrow hold for settlement
   */
  async releaseEscrow(escrowId: string, request: EscrowReleaseRequest): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/escrow/${escrowId}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        release_type: request.releaseType,
        transfer_reference: request.transferReference,
        contract_id: request.contractId,
        reason: request.reason,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; code?: string };
      throw new BsimError(
        response.status,
        error.error || 'Failed to release escrow',
        error.code
      );
    }
  }

  /**
   * Return an escrow hold (cancel/expire)
   */
  async returnEscrow(escrowId: string, contractId: string, reason: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/escrow/${escrowId}/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        contract_id: contractId,
        reason,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; code?: string };
      throw new BsimError(
        response.status,
        error.error || 'Failed to return escrow',
        error.code
      );
    }
  }

  /**
   * Get escrow status
   */
  async getEscrowStatus(escrowId: string): Promise<{
    escrow_id: string;
    status: string;
    amount: number;
    contract_id: string;
  }> {
    const response = await fetch(`${this.baseUrl}/api/escrow/${escrowId}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string; code?: string };
      throw new BsimError(
        response.status,
        error.error || 'Failed to get escrow status',
        error.code
      );
    }

    return response.json() as Promise<{
      escrow_id: string;
      status: string;
      amount: number;
      contract_id: string;
    }>;
  }
}

export class BsimError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'BsimError';
  }
}

export const bsimClient = new BsimClient();

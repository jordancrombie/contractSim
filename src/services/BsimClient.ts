import { env } from '../config/env';

interface EscrowHoldRequest {
  userId: string;
  walletId: string;  // WSIM wallet ID - BSIM includes this in webhook
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
    // Use the dedicated outbound key for calling BSIM's escrow API
    // Falls back to the inbound key for backwards compatibility during migration
    this.apiKey = env.outboundApiKeys.bsimEscrow || env.apiKeys.bsim;

    if (!env.outboundApiKeys.bsimEscrow) {
      console.warn('[BsimClient] BSIM_ESCROW_API_KEY not configured, using BSIM_API_KEY as fallback');
    }
  }

  /**
   * Create an escrow hold on a user's account
   */
  async createEscrowHold(request: EscrowHoldRequest): Promise<EscrowHoldResponse> {
    const url = `${this.baseUrl}/api/escrow/hold`;
    const requestBody = {
      user_id: request.userId,
      wallet_id: request.walletId,
      account_id: request.accountId,
      amount: request.amount,
      currency: request.currency,
      contract_id: request.contractId,
      contract_service: 'contractsim',
      hold_type: 'escrow',
      expires_at: request.expiresAt.toISOString(),
      description: request.description,
    };

    console.log(`[BsimClient] Creating escrow hold: ${url}`);
    console.log(`[BsimClient] Request body:`, JSON.stringify(requestBody, null, 2));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      console.error(`[BsimClient] Network error calling BSIM:`, networkError);
      throw new BsimError(0, `Network error: ${networkError instanceof Error ? networkError.message : 'Unknown network error'}`);
    }

    console.log(`[BsimClient] Response status: ${response.status}`);

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      let errorCode: string | undefined;

      try {
        const responseText = await response.text();
        console.error(`[BsimClient] Error response body: ${responseText}`);

        if (responseText) {
          const error = JSON.parse(responseText) as { error?: string; message?: string; code?: string };
          errorMessage = error.error || error.message || 'Failed to create escrow hold';
          errorCode = error.code;
        }
      } catch (parseError) {
        console.error(`[BsimClient] Could not parse error response`);
      }

      throw new BsimError(response.status, errorMessage, errorCode);
    }

    const result = await response.json() as EscrowHoldResponse;
    console.log(`[BsimClient] Escrow created successfully:`, result.escrow_id);
    return result;
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

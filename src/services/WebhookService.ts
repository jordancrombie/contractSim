import crypto from 'crypto';
import prisma from '../config/database';
import { env } from '../config/env';
import { WebhookStatus } from '@prisma/client';

interface WebhookPayload {
  event_id: string;
  event_type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export class WebhookService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

  /**
   * Send a webhook to WSIM for contract events
   */
  async sendToWsim(eventType: string, data: Record<string, unknown>): Promise<void> {
    const payload: WebhookPayload = {
      event_id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    await this.queueWebhook('wsim', `${env.services.wsim}/api/webhooks/contractsim`, payload);
  }

  /**
   * Queue a webhook for delivery
   */
  private async queueWebhook(
    destination: string,
    url: string,
    payload: WebhookPayload
  ): Promise<void> {
    await prisma.webhookDelivery.create({
      data: {
        destination,
        url,
        eventType: payload.event_type,
        payload: payload as object,
        status: WebhookStatus.PENDING,
        nextAttemptAt: new Date(),
      },
    });

    // Attempt immediate delivery
    this.processWebhooks().catch(console.error);
  }

  /**
   * Process pending webhooks
   */
  async processWebhooks(): Promise<void> {
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: WebhookStatus.PENDING,
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: this.MAX_RETRIES },
      },
      take: 10,
    });

    for (const webhook of pending) {
      await this.deliverWebhook(webhook.id);
    }
  }

  /**
   * Deliver a single webhook
   */
  private async deliverWebhook(webhookId: string): Promise<void> {
    const webhook = await prisma.webhookDelivery.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) return;

    try {
      const payloadString = JSON.stringify(webhook.payload);
      const secret = this.getWebhookSecretForDestination(webhook.destination);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': webhook.eventType,
        'X-API-Key': this.getApiKeyForDestination(webhook.destination),
      };

      // Add HMAC signature if secret is configured
      if (secret) {
        const signature = crypto
          .createHmac('sha256', secret)
          .update(payloadString)
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
      });

      const responseBody = await response.text();

      if (response.ok) {
        await prisma.webhookDelivery.update({
          where: { id: webhookId },
          data: {
            status: WebhookStatus.DELIVERED,
            attempts: webhook.attempts + 1,
            lastAttemptAt: new Date(),
            responseStatus: response.status,
            responseBody: responseBody.substring(0, 1000),
          },
        });
        console.log(`[Webhook] Delivered: ${webhook.eventType} to ${webhook.destination}`);
      } else {
        await this.handleFailure(webhook, response.status, responseBody);
      }
    } catch (err) {
      await this.handleFailure(webhook, 0, (err as Error).message);
    }
  }

  /**
   * Handle webhook delivery failure
   */
  private async handleFailure(
    webhook: { id: string; attempts: number; eventType: string; destination: string },
    statusCode: number,
    responseBody: string
  ): Promise<void> {
    const attempts = webhook.attempts + 1;
    const shouldRetry = attempts < this.MAX_RETRIES;

    const nextAttemptAt = shouldRetry
      ? new Date(Date.now() + this.RETRY_DELAYS[attempts - 1])
      : null;

    await prisma.webhookDelivery.update({
      where: { id: webhook.id },
      data: {
        status: shouldRetry ? WebhookStatus.PENDING : WebhookStatus.FAILED,
        attempts,
        lastAttemptAt: new Date(),
        nextAttemptAt,
        responseStatus: statusCode,
        responseBody: responseBody.substring(0, 1000),
      },
    });

    if (!shouldRetry) {
      console.error(`[Webhook] Failed permanently: ${webhook.eventType} to ${webhook.destination}`);
    } else {
      console.warn(`[Webhook] Retry ${attempts}/${this.MAX_RETRIES}: ${webhook.eventType}`);
    }
  }

  /**
   * Get API key for destination service
   */
  private getApiKeyForDestination(destination: string): string {
    switch (destination) {
      case 'wsim':
        return env.apiKeys.wsim;
      case 'bsim':
        return env.apiKeys.bsim;
      case 'transfersim':
        return env.apiKeys.transfersim;
      default:
        return '';
    }
  }

  /**
   * Get webhook secret for destination service (for HMAC signing)
   */
  private getWebhookSecretForDestination(destination: string): string | undefined {
    switch (destination) {
      case 'wsim':
        return env.webhookSecrets.wsim;
      case 'bsim':
        return env.webhookSecrets.bsim;
      case 'transfersim':
        return env.webhookSecrets.transfersim;
      default:
        return undefined;
    }
  }

  /**
   * Notify WSIM of contract events
   */
  async notifyContractProposed(contractId: string, creator: { walletId: string; displayName: string }, recipientWalletId: string, title: string): Promise<void> {
    await this.sendToWsim('contract.proposed', {
      contract_id: contractId,
      title,
      creator: {
        wallet_id: creator.walletId,
        display_name: creator.displayName,
      },
      recipient_wallet_id: recipientWalletId,
    });
  }

  async notifyContractAccepted(
    contractId: string,
    title: string,
    acceptedBy: { walletId: string; displayName: string },
    recipientWalletId: string
  ): Promise<void> {
    await this.sendToWsim('contract.accepted', {
      contract_id: contractId,
      title,
      recipient_wallet_id: recipientWalletId,
      accepted_by: {
        wallet_id: acceptedBy.walletId,
        display_name: acceptedBy.displayName,
      },
    });
  }

  async notifyContractFunded(
    contractId: string,
    title: string,
    fundedBy: { walletId: string; displayName: string },
    recipientWalletId: string,
    contractStatus: 'funding' | 'active'
  ): Promise<void> {
    await this.sendToWsim('contract.funded', {
      contract_id: contractId,
      title,
      recipient_wallet_id: recipientWalletId,
      funded_by: {
        wallet_id: fundedBy.walletId,
        display_name: fundedBy.displayName,
      },
      contract_status: contractStatus,
    });
  }

  async notifyContractOutcome(
    contractId: string,
    title: string,
    winner: { walletId: string; displayName: string },
    loser: { walletId: string; displayName: string }
  ): Promise<void> {
    // Send webhook to winner
    await this.sendToWsim('contract.outcome', {
      contract_id: contractId,
      title,
      recipient_wallet_id: winner.walletId,
      outcome: 'won',
      opponent: {
        wallet_id: loser.walletId,
        display_name: loser.displayName,
      },
    });

    // Send webhook to loser
    await this.sendToWsim('contract.outcome', {
      contract_id: contractId,
      title,
      recipient_wallet_id: loser.walletId,
      outcome: 'lost',
      opponent: {
        wallet_id: winner.walletId,
        display_name: winner.displayName,
      },
    });
  }

  async notifyContractSettled(
    contractId: string,
    title: string,
    winnerWalletId: string,
    loserWalletId: string,
    winnerAmount: string,
    currency: string
  ): Promise<void> {
    // Send webhook to winner
    await this.sendToWsim('contract.settled', {
      contract_id: contractId,
      title,
      recipient_wallet_id: winnerWalletId,
      outcome: 'won',
      amount: winnerAmount,
      currency,
    });

    // Send webhook to loser
    await this.sendToWsim('contract.settled', {
      contract_id: contractId,
      title,
      recipient_wallet_id: loserWalletId,
      outcome: 'lost',
      amount: '0.00',
      currency,
    });
  }

  async notifyContractCancelled(
    contractId: string,
    title: string,
    cancelledBy: { walletId: string; displayName: string },
    recipientWalletId: string
  ): Promise<void> {
    await this.sendToWsim('contract.cancelled', {
      contract_id: contractId,
      title,
      recipient_wallet_id: recipientWalletId,
      cancelled_by: {
        wallet_id: cancelledBy.walletId,
        display_name: cancelledBy.displayName,
      },
    });
  }

  async notifyContractExpired(
    contractId: string,
    title: string,
    recipientWalletId: string,
    refundAmount: string
  ): Promise<void> {
    await this.sendToWsim('contract.expired', {
      contract_id: contractId,
      title,
      recipient_wallet_id: recipientWalletId,
      refund_amount: refundAmount,
    });
  }

  async notifyContractDisputed(
    contractId: string,
    title: string,
    disputedBy: { walletId: string; displayName: string },
    recipientWalletId: string,
    reason: string
  ): Promise<void> {
    await this.sendToWsim('contract.disputed', {
      contract_id: contractId,
      title,
      recipient_wallet_id: recipientWalletId,
      disputed_by: {
        wallet_id: disputedBy.walletId,
        display_name: disputedBy.displayName,
      },
      reason,
    });
  }
}

export const webhookService = new WebhookService();

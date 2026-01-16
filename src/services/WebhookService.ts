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
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': webhook.eventType,
          'X-API-Key': this.getApiKeyForDestination(webhook.destination),
        },
        body: JSON.stringify(webhook.payload),
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

  async notifyContractAccepted(contractId: string, title: string, acceptedBy: { walletId: string; displayName: string }, creator: { walletId: string }): Promise<void> {
    await this.sendToWsim('contract.accepted', {
      contract_id: contractId,
      title,
      accepted_by: {
        wallet_id: acceptedBy.walletId,
        display_name: acceptedBy.displayName,
      },
      creator: {
        wallet_id: creator.walletId,
      },
    });
  }

  async notifyContractFunded(contractId: string, title: string, parties: { walletId: string }[]): Promise<void> {
    await this.sendToWsim('contract.funded', {
      contract_id: contractId,
      title,
      parties: parties.map(p => ({ wallet_id: p.walletId })),
    });
  }

  async notifyContractOutcome(contractId: string, title: string, winnerId: string | null, loserId: string | null): Promise<void> {
    await this.sendToWsim('contract.outcome', {
      contract_id: contractId,
      title,
      winner_wallet_id: winnerId,
      loser_wallet_id: loserId,
    });
  }

  async notifyContractSettled(contractId: string, title: string, winnerId: string, amount: string): Promise<void> {
    await this.sendToWsim('contract.settled', {
      contract_id: contractId,
      title,
      winner_wallet_id: winnerId,
      amount,
    });
  }

  async notifyContractCancelled(contractId: string, title: string, parties: { walletId: string }[]): Promise<void> {
    await this.sendToWsim('contract.cancelled', {
      contract_id: contractId,
      title,
      parties: parties.map(p => ({ wallet_id: p.walletId })),
    });
  }
}

export const webhookService = new WebhookService();

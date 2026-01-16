import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

// Service identity after authentication
export interface ServiceIdentity {
  service: 'wsim' | 'bsim' | 'transfersim' | 'oracle';
  walletId?: string;  // Present when WSIM proxies a user request
}

// Extend Express Request
export interface AuthenticatedRequest extends Request {
  serviceIdentity: ServiceIdentity;
}

/**
 * Validates service-to-service API key authentication.
 *
 * Expected headers:
 * - X-API-Key: The service's API key
 * - X-Wallet-Id: (optional) The user's walletId when proxied by WSIM
 */
export function serviceAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'] as string;
  const walletId = req.headers['x-wallet-id'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  let service: ServiceIdentity['service'] | null = null;

  if (apiKey === env.apiKeys.wsim) {
    service = 'wsim';
  } else if (apiKey === env.apiKeys.bsim) {
    service = 'bsim';
  } else if (apiKey === env.apiKeys.transfersim) {
    service = 'transfersim';
  }

  if (!service) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  (req as AuthenticatedRequest).serviceIdentity = {
    service,
    walletId: walletId || undefined,
  };

  next();
}

/**
 * Requires that the request came from WSIM with a user context.
 */
export function requireUserContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.serviceIdentity) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (authReq.serviceIdentity.service !== 'wsim') {
    res.status(403).json({ error: 'This endpoint requires WSIM proxy' });
    return;
  }

  if (!authReq.serviceIdentity.walletId) {
    res.status(400).json({ error: 'Missing X-Wallet-Id header' });
    return;
  }

  next();
}

/**
 * Allows specific services to access an endpoint.
 */
export function allowServices(...allowed: ServiceIdentity['service'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.serviceIdentity) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!allowed.includes(authReq.serviceIdentity.service)) {
      res.status(403).json({
        error: `This endpoint is only accessible by: ${allowed.join(', ')}`,
      });
      return;
    }

    next();
  };
}

interface WebhookSignatureOptions {
  secret: string | undefined;
  headerName?: string;  // Default: 'x-webhook-signature'
  service: ServiceIdentity['service'];
}

/**
 * Verifies HMAC signature for webhook requests.
 *
 * @param options Configuration options
 * @param options.secret The HMAC secret to verify against
 * @param options.headerName The header containing the signature (default: 'x-webhook-signature')
 * @param options.service The service identity to set after successful verification
 */
export function verifyWebhookSignature(options: WebhookSignatureOptions) {
  const headerName = options.headerName || 'x-webhook-signature';

  return (req: Request, res: Response, next: NextFunction): void => {
    // If no secret configured, skip verification (dev mode)
    if (!options.secret) {
      console.warn(`[Auth] Webhook signature verification skipped for ${options.service} - no secret configured`);
      (req as AuthenticatedRequest).serviceIdentity = { service: options.service };
      next();
      return;
    }

    const signatureHeader = req.headers[headerName] as string;

    if (!signatureHeader) {
      res.status(401).json({ error: `Missing webhook signature (expected ${headerName} header)` });
      return;
    }

    // Strip 'sha256=' prefix if present (GitHub-style signatures)
    const signature = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', options.secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // Check lengths match before constant-time comparison (prevents RangeError)
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.warn(`[Auth] Webhook signature mismatch for ${options.service}`);
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    // Set service identity for downstream handlers
    (req as AuthenticatedRequest).serviceIdentity = {
      service: options.service,
    };

    next();
  };
}

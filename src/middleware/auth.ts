import { Request, Response, NextFunction } from 'express';
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

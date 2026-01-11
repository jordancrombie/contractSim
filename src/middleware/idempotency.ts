import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/database';

export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
}

/**
 * Idempotency middleware for POST/PUT/PATCH requests.
 *
 * Expects header: Idempotency-Key: {uuid}
 *
 * If the same key is seen twice within 24 hours, returns the cached response.
 */
export function idempotency(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = req.headers['idempotency-key'] as string | undefined;

  if (!key) {
    next();
    return;
  }

  // Store for later use
  (req as IdempotentRequest).idempotencyKey = key;

  // Check for existing response
  checkIdempotencyKey(key, req, res, next);
}

async function checkIdempotencyKey(
  key: string,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (existing) {
      // Verify the request is the same
      const currentHash = hashRequest(req);
      if (existing.requestHash !== currentHash) {
        res.status(422).json({
          error: 'Idempotency key reused with different request parameters',
          code: 'IDEMPOTENCY_MISMATCH',
        });
        return;
      }

      // Return cached response
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }

    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Save the response asynchronously (don't block)
      saveIdempotencyResponse(key, req, res.statusCode, body).catch(console.error);
      return originalJson(body);
    };

    next();
  } catch (err) {
    // On error, continue without idempotency
    console.error('Idempotency check failed:', err);
    next();
  }
}

function hashRequest(req: Request): string {
  const data = JSON.stringify({
    method: req.method,
    path: req.path,
    body: req.body,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function saveIdempotencyResponse(
  key: string,
  req: Request,
  statusCode: number,
  body: unknown
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await prisma.idempotencyKey.upsert({
    where: { key },
    create: {
      key,
      requestHash: hashRequest(req),
      responseStatus: statusCode,
      responseBody: body as object,
      expiresAt,
    },
    update: {
      responseStatus: statusCode,
      responseBody: body as object,
    },
  });
}

/**
 * Cleanup expired idempotency keys (run periodically)
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

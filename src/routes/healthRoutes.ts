import { Router } from 'express';
import prisma from '../config/database';
import { version } from '../../package.json';

const router = Router();

/**
 * GET /health
 * Health check endpoint for load balancers
 */
router.get('/', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      service: 'contractsim',
      version,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'contractsim',
      version,
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/ready
 * Readiness check
 */
router.get('/ready', async (req, res) => {
  res.json({
    status: 'ready',
    service: 'contractsim',
    version,
    timestamp: new Date().toISOString(),
  });
});

export default router;

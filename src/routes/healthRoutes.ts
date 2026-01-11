import { Router } from 'express';
import prisma from '../config/database';

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
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'contractsim',
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
    timestamp: new Date().toISOString(),
  });
});

export default router;

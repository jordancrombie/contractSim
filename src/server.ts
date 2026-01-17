import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import contractRoutes from './routes/contractRoutes';
import healthRoutes from './routes/healthRoutes';
import oracleRoutes from './routes/oracleRoutes';
import webhookRoutes from './routes/webhookRoutes';
import { testOracleService } from './services/TestOracleService';
import { contractExpirationService } from './services/ContractExpirationService';
import prisma from './config/database';

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// CORS
app.use(cors({
  origin: env.server.isDev ? '*' : [
    'https://contract.banksim.ca',
    'https://wsim.banksim.ca',
    'https://banksim.ca',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Wallet-Id', 'Idempotency-Key'],
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Request logging (dev only)
if (env.server.isDev) {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// ROUTES
// ============================================

// Health checks (no auth required)
app.use('/health', healthRoutes);

// API v1
app.use('/api/v1/contracts', contractRoutes);
app.use('/api/v1/oracles', oracleRoutes);

// Alias routes for WSIM compatibility (WSIM calls /contracts and /oracles directly)
app.use('/contracts', contractRoutes);
app.use('/oracles', oracleRoutes);

// Webhooks (service-to-service callbacks)
app.use('/webhooks', webhookRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

const PORT = env.server.port;

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║           ContractSim Server Started              ║
╠═══════════════════════════════════════════════════╣
║  Port: ${PORT}                                       ║
║  Environment: ${env.server.nodeEnv.padEnd(33)}║
║  Health: http://localhost:${PORT}/health              ║
╚═══════════════════════════════════════════════════╝
  `);

  // Initialize and start test oracle
  try {
    await testOracleService.initialize();
    testOracleService.start();
  } catch (err) {
    console.error('[TestOracle] Failed to start:', err);
  }

  // Start contract expiration checker
  try {
    contractExpirationService.start();
  } catch (err) {
    console.error('[ContractExpiration] Failed to start:', err);
  }
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[Server] Already shutting down, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections (give existing requests time to complete)
  const shutdownTimeout = setTimeout(() => {
    console.error('[Server] Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Stop background services
    console.log('[Server] Stopping background services...');
    testOracleService.stop();
    contractExpirationService.stop();

    // Disconnect from database
    console.log('[Server] Disconnecting from database...');
    await prisma.$disconnect();

    console.log('[Server] Graceful shutdown complete');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (err) {
    console.error('[Server] Error during shutdown:', err);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

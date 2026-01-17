import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Singleton pattern - always use the same instance to prevent connection leaks
// The global variable survives hot reloads in development and ensures
// we never create multiple PrismaClient instances
function createPrismaClient(): PrismaClient {
  // Connection pool settings can also be set via DATABASE_URL query params:
  // ?connection_limit=10&pool_timeout=30
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma = global.__prisma ?? createPrismaClient();

// Always cache the instance globally
global.__prisma = prisma;

export default prisma;

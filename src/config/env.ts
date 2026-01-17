import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string(),

  // Server
  PORT: z.string().default('3003'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Service API Keys (S2S auth - for incoming requests)
  WSIM_API_KEY: z.string(),
  BSIM_API_KEY: z.string(),
  TRANSFERSIM_API_KEY: z.string(),

  // Outbound API Keys (for ContractSim calling other services)
  BSIM_ESCROW_API_KEY: z.string().optional(),

  // Webhook Secrets (HMAC verification for inbound webhooks)
  TRANSFERSIM_WEBHOOK_SECRET: z.string().optional(),
  BSIM_WEBHOOK_SECRET: z.string().optional(),

  // Outbound Webhook Secrets (HMAC signing for outbound webhooks)
  WSIM_WEBHOOK_SECRET: z.string().optional(),

  // External Service URLs
  WSIM_URL: z.string().default('http://localhost:3002'),
  BSIM_URL: z.string().default('http://localhost:3001'),
  TRANSFERSIM_URL: z.string().default('http://localhost:3004'),

  // Contract Defaults
  DEFAULT_FUNDING_TIMEOUT_HOURS: z.string().default('48'),
  MAX_CONTRACT_VALUE: z.string().default('100.00'),
  DEFAULT_CURRENCY: z.string().default('CAD'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = {
  database: {
    url: parsed.data.DATABASE_URL,
  },
  server: {
    port: parseInt(parsed.data.PORT, 10),
    nodeEnv: parsed.data.NODE_ENV,
    isDev: parsed.data.NODE_ENV === 'development',
    isProd: parsed.data.NODE_ENV === 'production',
  },
  apiKeys: {
    wsim: parsed.data.WSIM_API_KEY,
    bsim: parsed.data.BSIM_API_KEY,
    transfersim: parsed.data.TRANSFERSIM_API_KEY,
  },
  outboundApiKeys: {
    bsimEscrow: parsed.data.BSIM_ESCROW_API_KEY,
  },
  webhookSecrets: {
    transfersim: parsed.data.TRANSFERSIM_WEBHOOK_SECRET,
    bsim: parsed.data.BSIM_WEBHOOK_SECRET,
    wsim: parsed.data.WSIM_WEBHOOK_SECRET,
  },
  services: {
    wsim: parsed.data.WSIM_URL,
    bsim: parsed.data.BSIM_URL,
    transfersim: parsed.data.TRANSFERSIM_URL,
  },
  contracts: {
    defaultFundingTimeoutHours: parseInt(parsed.data.DEFAULT_FUNDING_TIMEOUT_HOURS, 10),
    maxValue: parseFloat(parsed.data.MAX_CONTRACT_VALUE),
    defaultCurrency: parsed.data.DEFAULT_CURRENCY,
  },
};

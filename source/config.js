import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export const config = {
  // GCP Configurations
  projectId: process.env.GCP_PROJECT_ID || 'intelligent-grid-operator',
  subscriptionName: process.env.GCP_SUBSCRIPTION_NAME || 'grid-operator-sub-v2',
  auditLogTopic: process.env.GCP_AUDIT_LOG_TOPIC || 'store_data',

  // Middleware performance and reliability
  flowControl: {
    maxMessages: parseInt(process.env.FLOW_CONTROL_MAX_MESSAGES || '100', 10),
    allowMaxOutstandingMessages: true,
  },
  ackDeadlineSeconds: parseInt(process.env.ACK_DEADLINE_SECONDS || '60', 10),

  // Routing Endpoints (Explicitly configured for each individual exchange ID)
  endpoints: {
    Metering: process.env.ENDPOINT_METERING || 'https://api.intelligent-pilot.eu/v2/metering',
    GridSignal: process.env.ENDPOINT_GRID_SIGNAL || 'https://api.intelligent-pilot.eu/v2/grid-signals',
    P2PMarketData: process.env.ENDPOINT_P2P_MARKET_DATA || 'https://api.intelligent-pilot.eu/v2/p2p-market',
    DynamicGridTariff: process.env.ENDPOINT_DYNAMIC_GRID_TARIFF || 'https://api.intelligent-pilot.eu/v2/grid-tariffs',
    TransactionValidation: process.env.ENDPOINT_TRANSACTION_VALIDATION || 'https://api.intelligent-pilot.eu/v2/transaction-validation',
  },

  // Security tokens/keys (Mocks for local testing unless provided)
  entityTokens: {
    Metering: process.env.TOKEN_METERING || 'token-secure-metering-v2',
    GridSignal: process.env.TOKEN_GRID_SIGNAL || 'token-secure-grid-signal-v2',
    P2PMarketData: process.env.TOKEN_P2P_MARKET_DATA || 'token-secure-p2p-v2',
    DynamicGridTariff: process.env.TOKEN_DYNAMIC_GRID_TARIFF || 'token-secure-tariffs-v2',
    TransactionValidation: process.env.TOKEN_TRANSACTION_VALIDATION || 'token-secure-validation-v2',
  },

  // Log configuration
  logLevel: process.env.LOG_LEVEL || 'info',
};

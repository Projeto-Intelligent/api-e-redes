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

  // Routing endpoint (single downstream destination)
  endpoint: process.env.ENDPOINT || 'https://{the-client-gw-api-here}/api/v2/identity',

  // Security token for the downstream endpoint
  bearerToken: process.env.ENDPOINT_TOKEN || 'token-secure-v2',

  // Log configuration
  logLevel: process.env.LOG_LEVEL || 'info',
};

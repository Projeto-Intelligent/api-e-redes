import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const normalizeExchangeKey = (exchange) => {
  if (!exchange || typeof exchange !== 'string') return 'DEFAULT';
  return exchange.toUpperCase().replace(/[^A-Z0-9]/g, '_');
};

const defaultEndpoint = process.env.ENDPOINT || 'https://api.intelligent-pilot.eu/api/v2/messages';
const defaultApiKey = process.env.ENDPOINT_API_KEY || 'api-key-secure-v2';
const defaultTopicName = process.env.TOPIC_NAME || 'TOPIC_NAME';
const defaultTopicOwner = process.env.TOPIC_OWNER || 'TOPIC_OWNER';
const defaultTopicVersion = process.env.TOPIC_VERSION || 'TOPIC_VERSION';
const defaultFqcn = process.env.FQCN || 'eu.energygrid.messages.GenericMessage';

const getRoutingMetadataForExchange = (exchange) => {
  const key = normalizeExchangeKey(exchange);

  return {
    topicName: process.env[`ROUTING_TOPIC_NAME_${key}`] || defaultTopicName,
    topicOwner: process.env[`ROUTING_TOPIC_OWNER_${key}`] || defaultTopicOwner,
    topicVersion: process.env[`ROUTING_TOPIC_VERSION_${key}`] || defaultTopicVersion,
    fqcn: process.env[`ROUTING_FQCN_${key}`] || defaultFqcn,
  };
};

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

  // Routing metadata
  entityId: process.env.ENTITY_ID || '612',
  pubsubEnabled: process.env.PUBSUB_ENABLED !== 'false',
  httpListenerEnabled: process.env.HTTP_LISTENER_ENABLED !== 'false',
  httpListenerPort: parseInt(process.env.HTTP_LISTENER_PORT || '8080', 10),
  httpListenerPath: process.env.HTTP_LISTENER_PATH || '/message',

  // Single downstream routing endpoint used for all message types
  endpoint: defaultEndpoint,
  apiKey: defaultApiKey,

  // Log configuration
  logLevel: process.env.LOG_LEVEL || 'info',

  // Resolve message-type-specific metadata from environment
  getRoutingMetadataForExchange,
};

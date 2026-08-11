import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
};

const parsePositiveInt = (value, defaultValue) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

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

const parseEwdsTopics = (value) => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      console.warn('[Config] EWDS_TOPICS must be a JSON array. Ignoring value.');
      return [];
    }

    return parsed
      .filter((topic) => topic && typeof topic === 'object')
      .map((topic) => ({
        owner: topic.owner,
        name: topic.name,
        clientId: topic.clientId,
        version: topic.version,
        fqcn: topic.fqcn,
      }))
      .filter((topic) =>
        [topic.owner, topic.name, topic.clientId].every(
          (field) => typeof field === 'string' && field.trim().length > 0,
        ),
      );
  } catch (error) {
    console.warn(`[Config] Failed to parse EWDS_TOPICS JSON. Ignoring value. Error: ${error.message}`);
    return [];
  }
};

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

  // Downstream gateway endpoint used for all message types
  endpoint: defaultEndpoint,
  apiKey: defaultApiKey,

  // Log configuration
  logLevel: process.env.LOG_LEVEL || 'info',

  ewds: {
    enabled: parseBoolean(process.env.EWDS_ENABLED, false),
    proxyEnabled: parseBoolean(process.env.EWDS_PROXY_ENABLED, false),
    proxyPath: process.env.EWDS_PROXY_PATH || '/ewds/messages',
    baseUrl: process.env.EWDS_BASE_URL || 'https://api.intelligent-pilot.eu',
    messagesPath: process.env.EWDS_MESSAGES_PATH || '/api/v2/messages',
    apiKey: process.env.EWDS_API_KEY || process.env.ENDPOINT_API_KEY || '',
    pollIntervalMs: parsePositiveInt(process.env.EWDS_POLL_INTERVAL_MS, 60000),
    lookbackMs: parsePositiveInt(process.env.EWDS_LOOKBACK_MS, 300000),
    fetchAmount: parsePositiveInt(process.env.EWDS_FETCH_AMOUNT, 200),
    requestTimeoutMs: parsePositiveInt(process.env.EWDS_REQUEST_TIMEOUT_MS, 15000),
    validateFetchedMessages: parseBoolean(process.env.EWDS_VALIDATE_FETCHED_MESSAGES, true),
    forwardFetchedMessages: parseBoolean(process.env.EWDS_FORWARD_FETCHED_MESSAGES, false),
    fqcn: process.env.EWDS_FQCN || process.env.FQCN || '',
    topics: (() => {
      const topicsFromArray = parseEwdsTopics(process.env.EWDS_TOPICS);
      if (topicsFromArray.length > 0) return topicsFromArray;

      const owner = process.env.EWDS_TOPIC_OWNER;
      const name = process.env.EWDS_TOPIC_NAME;
      const clientId = process.env.EWDS_CLIENT_ID;
      const version = process.env.EWDS_TOPIC_VERSION;
      const fqcn = process.env.EWDS_FQCN || process.env.FQCN;

      if ([owner, name, clientId].every((field) => typeof field === 'string' && field.trim().length > 0)) {
        return [{ owner, name, clientId, version, fqcn }];
      }

      return [];
    })(),
  },

  // Resolve message-type-specific metadata from environment
  getRoutingMetadataForExchange,
};

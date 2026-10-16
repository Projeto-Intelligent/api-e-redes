/**
 * INTELLIGENT Grid Operator Middleware V2 - Node.js HTTP || GCP Pub/Sub Pull Subscriber
 * 
 * Main entry point for the Version 2 Grid Operator Middleware. Has two execution 
 * modes HTTP or  GCP Pub/Sub pull subscriber. When the script is configured for 
 * GCP Pub/Sub pulls messages from a GCP Pub/Sub subscription, validates their transport
 * headers and ontology, forwards payloads to gateway endpoints, logs audit
 * events, and properly manages message acknowledgement (ACK/NACK).
 */

import { createServer } from 'http';
import { PubSub } from '@google-cloud/pubsub';
import { config } from './config.js';
import { validateTransportHeader, validateOntologyPayload } from './validator.js';
import { routeMessage } from './router.js';
import { createEwdsPoller } from './ewds.js';
import { createSqsPoller } from './sqs_subscriber.js';

// Initialize Pub/Sub client
// When deployed on GCP (Cloud Run, GCE, GKE), Pub/Sub client automatically
// picks up credentials. For local testing, credentials can be set via GOOGLE_APPLICATION_CREDENTIALS.
const pubSubClient = new PubSub({
  projectId: config.projectId,
});

function parseJsonRequest(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  });
  res.end(body);
}

async function proxyEwdsGetRequest(req, res, requestUrl) {
  const firstConfiguredTopic = config.ewds.topics[0] || null;
  const outgoingParams = new URLSearchParams();

  const incomingFqcn = requestUrl.searchParams.get('fqcn');
  const fqcn = incomingFqcn || config.ewds.fqcn;
  if (!fqcn) {
    sendJsonResponse(res, 400, {
      error: 'Missing required query parameter: fqcn',
      hint: 'Provide fqcn in query string or set EWDS_FQCN in environment.',
    });
    return;
  }

  outgoingParams.set('fqcn', fqcn);

  const incomingTopicName = requestUrl.searchParams.get('topicName');
  const incomingTopicOwner = requestUrl.searchParams.get('topicOwner');
  const incomingClientId = requestUrl.searchParams.get('clientId');
  const incomingAmount = requestUrl.searchParams.get('amount');
  const incomingFrom = requestUrl.searchParams.get('from');

  const topicName = incomingTopicName || firstConfiguredTopic?.name;
  const topicOwner = incomingTopicOwner || firstConfiguredTopic?.owner;
  const clientId = incomingClientId || firstConfiguredTopic?.clientId;

  if (topicName) outgoingParams.set('topicName', topicName);
  if (topicOwner) outgoingParams.set('topicOwner', topicOwner);
  if (clientId) outgoingParams.set('clientId', clientId);
  if (incomingFrom) outgoingParams.set('from', incomingFrom);

  outgoingParams.set('amount', incomingAmount || String(config.ewds.fetchAmount));

  const passthroughParams = [
    'initiatingMessageId',
    'initiatingTransactionId',
    'transactionId',
    'messageId',
    'messageIds',
  ];

  for (const paramName of passthroughParams) {
    const value = requestUrl.searchParams.get(paramName);
    if (value) {
      outgoingParams.set(paramName, value);
    }
  }

  const baseUrl = config.ewds.baseUrl.endsWith('/') ? config.ewds.baseUrl.slice(0, -1) : config.ewds.baseUrl;
  const messagesPath = config.ewds.messagesPath.startsWith('/') ? config.ewds.messagesPath : `/${config.ewds.messagesPath}`;
  const targetUrl = `${baseUrl}${messagesPath}?${outgoingParams.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(config.ewds.apiKey ? { 'x-api-key': config.ewds.apiKey } : {}),
      },
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const body = isJson ? await response.json() : await response.text();

    sendJsonResponse(res, response.status, {
      success: response.ok,
      upstreamStatus: response.status,
      request: {
        targetUrl,
      },
      data: body,
    });
  } catch (error) {
    console.error(`[EWDS Proxy] Failed to call upstream GET /api/v2/messages: ${error.message}`);
    sendJsonResponse(res, 502, {
      success: false,
      error: 'Failed to fetch messages from EWDS upstream',
      details: error.message,
    });
  }
}

async function httpMessageHandler(req, res) {
  const requestUrl = new URL(req.url || '', 'http://localhost');
  const requestPath = requestUrl.pathname;

  if (config.ewds.proxyEnabled && requestPath === config.ewds.proxyPath) {
    if (req.method !== 'GET') {
      sendJsonResponse(res, 405, { error: 'Method Not Allowed. Use GET.' });
      return;
    }

    await proxyEwdsGetRequest(req, res, requestUrl);
    return;
  }

  if (req.method !== 'POST') {
    sendJsonResponse(res, 405, { error: 'Method Not Allowed. Use POST.' });
    return;
  }

  if (requestPath !== config.httpListenerPath) {
    sendJsonResponse(res, 404, { error: 'Not Found' });
    return;
  }

  let parsedMessage;
  try {
    parsedMessage = await parseJsonRequest(req);
  } catch (err) {
    console.error('[HTTP Listener] Invalid JSON body received:', err.message);
    sendJsonResponse(res, 400, { error: 'Invalid JSON payload' });
    return;
  }

  const headerValidation = validateTransportHeader(parsedMessage);
  if (!headerValidation.isValid) {
    console.error(`[HTTP Listener] Invalid transport header: ${headerValidation.error}`);
    await publishAuditEvent(parsedMessage.messageId || 'unknown', parsedMessage.exchange || 'Unknown', 'FAILED', {
      error: `Header validation failed: ${headerValidation.error}`,
    });
    sendJsonResponse(res, 400, { error: headerValidation.error });
    return;
  }

  if (config.httpValidateOntology) {
    const ontologyValidation = validateOntologyPayload(parsedMessage);
    if (!ontologyValidation.isValid) {
      console.error(`[HTTP Listener] Ontology validation failed for exchange ${parsedMessage.exchange}: ${ontologyValidation.error}`);
      await publishAuditEvent(parsedMessage.messageId, parsedMessage.exchange, 'FAILED', {
        error: `Ontology validation failed: ${ontologyValidation.error}`,
      });
      sendJsonResponse(res, 400, { error: ontologyValidation.error });
      return;
    }
  }

  try {
    const routingResult = await routeMessage(parsedMessage);

    await publishAuditEvent(parsedMessage.messageId, parsedMessage.exchange, routingResult.success ? 'SUCCESS' : 'FAILED', {
      statusCode: routingResult.statusCode,
      responseBody: routingResult.responseBody,
      error: routingResult.error,
    });

    const statusCode = routingResult.success ? 200 : Math.max(400, routingResult.statusCode || 502);
    sendJsonResponse(res, statusCode, {
      success: routingResult.success,
      statusCode: routingResult.statusCode,
      responseBody: routingResult.responseBody,
      error: routingResult.error,
    });
  } catch (error) {
    console.error(`[HTTP Listener] Routing execution failed for message ${parsedMessage.messageId}: ${error.message}`);
    await publishAuditEvent(parsedMessage.messageId, parsedMessage.exchange, 'FAILED', {
      error: error.message,
    });
    sendJsonResponse(res, 503, { error: 'Downstream routing failed', details: error.message });
  }
}

/**
 * Publishes an audit event to a secondary "store_data" Pub/Sub topic.
 * This record is subsequently stored in BigQuery for historical compliance,
 * auditability, and data verification (as specified in D3.4 / Figure 1).
 * 
 * @param {string} originalMessageId - ID of the processed message
 * @param {string} exchange - The Exchange discriminator
 * @param {string} status - Processing status (SUCCESS / FAILED)
 * @param {object} metadata - Additional metadata such as routing status or error
 */
async function publishAuditEvent(originalMessageId, exchange, status, metadata = {}) {
  if (process.env.PUBLISH_AUDIT_EVENT==='false') return;
  try {
    const auditTopic = pubSubClient.topic(config.auditLogTopic);
    
    // Check if topic exists (useful for mock/sandbox running)
    const [exists] = await auditTopic.exists().catch(() => [false]);
    if (!exists) {
      console.log(`[Audit] Audit topic "${config.auditLogTopic}" does not exist. Logging audit event locally:`, {
        originalMessageId, exchange, status, timestamp: new Date().toISOString(), ...metadata
      });
      return;
    }

    const auditPayload = {
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      originalMessageId,
      exchange,
      status,
      processedAt: new Date().toISOString(),
      retentionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30-day retention/expiry
      ...metadata
    };

    const dataBuffer = Buffer.from(JSON.stringify(auditPayload));
    const publishId = await auditTopic.publishMessage({ data: dataBuffer });
    console.log(`[Audit] Successfully published audit trail record ${publishId} for message ${originalMessageId}`);
  } catch (error) {
    // Audit failures should not cause message reprocessing (NACK) but should be heavily logged
    console.error(`[Audit] [CRITICAL] Failed to publish audit record: ${error.message}`);
  }
}

/**
 * Message Handler callback for processing incoming Pub/Sub messages.
 * 
 * @param {import('@google-cloud/pubsub').Message} message - The Pub/Sub message object
 */
async function messageHandler(message) {
  const receiveTime = new Date().toISOString();
  console.log(`\n======================================================================`);
  console.log(`[Subscriber] Received Pub/Sub Message. ID: ${message.id} | Attempt: ${message.deliveryAttempt}`);
  
  let parsedMessage;
  try {
    const rawData = message.data.toString('utf8');
    parsedMessage = JSON.parse(rawData);
  } catch (err) {
    console.error(`[Subscriber] [BAD_FORMAT] Message data is not valid JSON. Content: ${message.data.toString()}`);
    // If the message is completely unparseable, ACK it to prevent poison message loops, 
    // but log a severe warning or push to a Dead Letter queue.
    message.ack();
    await publishAuditEvent(message.id, 'Unknown', 'FAILED', { error: 'Invalid JSON format', rawLength: message.data.length });
    return;
  }

  // 1. Validate transport header structure
  const headerValidation = validateTransportHeader(parsedMessage);
  if (!headerValidation.isValid) {
    console.error(`[Subscriber] [INVALID_HEADER] Validation failed for message ID ${message.id}: ${headerValidation.error}`);
    // Message fails basic structural contract, ACK it to remove it from the pipe
    message.ack();
    await publishAuditEvent(message.id, parsedMessage.exchange || 'Unknown', 'FAILED', { 
      error: `Header validation failed: ${headerValidation.error}`,
      parsedMessage 
    });
    return;
  }

  const { messageId, exchange, pilotId, scenarioId } = parsedMessage;

  // 2. Validate deep ontology structure
  const ontologyValidation = validateOntologyPayload(parsedMessage);
  if (!ontologyValidation.isValid) {
    console.error(`[Subscriber] [INVALID_ONTOLOGY] Schema mismatch for Exchange [${exchange}] in msg ${messageId}: ${ontologyValidation.error}`);
    // Ontology violation. ACK it, as it is a bad payload that cannot be handled by schema
    message.ack();
    await publishAuditEvent(messageId, exchange, 'FAILED', { 
      error: `Ontology check failed: ${ontologyValidation.error}`,
      pilotId,
      scenarioId
    });
    return;
  }

  // 3. Forward to designated Gateway Endpoint (Routing)
  try {
    const routingResult = await routeMessage(parsedMessage);

    if (routingResult.success) {
      // 4. Message successfully dispatched! Log audit trail and ACK message
      await publishAuditEvent(messageId, exchange, 'SUCCESS', {
        pilotId,
        scenarioId,
        statusCode: routingResult.statusCode,
        responseBody: routingResult.responseBody
      });

      console.log(`[Subscriber] [ACK] Message ${messageId} successfully processed & acknowledged.`);
      message.ack();
    } else {
      // Endpoint returned an explicit error (e.g. 400 Bad Request, 401 Unauthorized)
      console.error(`[Subscriber] [ROUTING_ERROR] Downstream returned error for message ${messageId}. Status: ${routingResult.statusCode}`);
      
      // If it's a client/auth error, redelivering might not help, but for safety in middleware
      // we NACK so it can be re-attempted, or dead-lettered based on GCP subscription policy.
      message.nack();
    }
  } catch (error) {
    // 5. Transient error (Network outage, DNS lookup failure, etc.)
    console.error(`[Subscriber] [TRANSIENT_FAILURE] Retrying message ${messageId} later. Error: ${error.message}`);
    
    // NACK so GCP Pub/Sub will redeliver the message according to subscription retry settings.
    message.nack();
  }
}

function processSqsEnvelope(envelope) {
  return new Promise((resolve) => {
    const message = {
      id: envelope.messageId,
      data: Buffer.from(JSON.stringify(envelope)),
      ack: () => resolve('ack'),
      nack: () => resolve('retry'),
    };

    messageHandler(message).catch((error) => {
      console.error(`[SQS Subscriber] Message processing failed: ${error.message}`);
      resolve('retry');
    });
  });
}

async function processEwdsEnvelope(envelope, topic, pollMetadata = {}) {
  if (config.ewds.validateFetchedMessages) {
    const headerValidation = validateTransportHeader(envelope);
    if (!headerValidation.isValid) {
      console.error(`[EWDS] Invalid transport header. topic=${topic.owner}/${topic.name} messageId=${envelope?.messageId || 'unknown'} error=${headerValidation.error}`);
      await publishAuditEvent(envelope?.messageId || 'unknown', envelope?.exchange || 'Unknown', 'FAILED', {
        source: 'EWDS',
        error: `Header validation failed: ${headerValidation.error}`,
        topic,
        pollMetadata,
      });
      return;
    }

    const ontologyValidation = validateOntologyPayload(envelope);
    if (!ontologyValidation.isValid) {
      console.error(`[EWDS] Ontology validation failed for message ${envelope.messageId}: ${ontologyValidation.error}`);
      await publishAuditEvent(envelope.messageId, envelope.exchange, 'FAILED', {
        source: 'EWDS',
        error: `Ontology validation failed: ${ontologyValidation.error}`,
        topic,
        pollMetadata,
      });
      return;
    }
  } else {
    console.log('[EWDS] Validation disabled for fetched messages via EWDS_VALIDATE_FETCHED_MESSAGES=false.');
  }

  if (!config.ewds.forwardFetchedMessages) {
    await publishAuditEvent(envelope.messageId, envelope.exchange, 'SUCCESS', {
      source: 'EWDS',
      mode: 'INGEST_ONLY',
      topic,
      pollMetadata,
    });
    return;
  }

  try {
    const routingResult = await routeMessage(envelope);
    await publishAuditEvent(envelope.messageId, envelope.exchange, routingResult.success ? 'SUCCESS' : 'FAILED', {
      source: 'EWDS',
      mode: 'INGEST_AND_FORWARD',
      topic,
      pollMetadata,
      statusCode: routingResult.statusCode,
      responseBody: routingResult.responseBody,
      error: routingResult.error,
    });
  } catch (error) {
    await publishAuditEvent(envelope.messageId, envelope.exchange, 'FAILED', {
      source: 'EWDS',
      mode: 'INGEST_AND_FORWARD',
      topic,
      pollMetadata,
      error: error.message,
    });
  }
}

/**
 * Main application initializer
 */
function main() {
  console.log(`=============================================================================`);
  console.log(`INTELLIGENT Grid Operator Middleware V2 - HTTP || GCP Pub/Sub / AWS SQS Subscriber`);
  console.log(`=============================================================================`);
  if (process.env.PUBSUB_ENABLED==='true') console.log(`[Init] Configured GCP Project ID: ${config.projectId}`);
  if (process.env.PUBSUB_ENABLED==='true') console.log(`[Init] Target Pub/Sub Subscription: ${config.subscriptionName}`);
  if (process.env.PUBSUB_ENABLED==='true')  console.log(`[Init] Flow Control Max Messages: ${config.flowControl.maxMessages}`);
  console.log(`[Init] Downstream routing endpoint: ${config.endpoint}`);
  if (process.env.PUBSUB_ENABLED==='true') console.log(`[Init] Pub/Sub enabled: ${config.pubsubEnabled}`);
  console.log(`[Init] HTTP listener enabled: ${config.httpListenerEnabled}`);
  if (config.ewds.proxyEnabled) {
    console.log(`[Init] EWDS proxy endpoint enabled: GET ${config.ewds.proxyPath}`);
  }
  if (config.ewds.enabled) {
    console.log(`[Init] EWDS ingest enabled: true`);
    console.log(`[Init] EWDS poll interval: ${config.ewds.pollIntervalMs} ms`);
    console.log(`[Init] EWDS topics configured: ${config.ewds.topics.length}`);
  } else {
    console.log('[Init] EWDS ingest disabled via EWDS_ENABLED=false');
  }

  let subscription;
  if (config.pubsubEnabled) {
    subscription = pubSubClient.subscription(config.subscriptionName, {
      flowControl: config.flowControl,
      ackDeadlineSeconds: config.ackDeadlineSeconds,
    });

    // Attach handlers
    subscription.on('message', messageHandler);
    subscription.on('error', (error) => {
      console.error(`[Subscriber] [CRITICAL_SYSTEM_ERROR] Pub/Sub subscription encountered an error: ${error.message}`);
    });

    console.log(`\n[Subscriber] Active and listening for messages on GCP Pull Subscription...`);
  } else {
    console.log('[Subscriber] Pub/Sub processing disabled via PUBSUB_ENABLED=false');
  }

  let sqsSubscriber;
  if (config.sqs.enabled) {
    sqsSubscriber = createSqsPoller(config.sqs, processSqsEnvelope);
    sqsSubscriber.start().catch((error) => {
      console.error(`[SQS Subscriber] [CRITICAL_SYSTEM_ERROR] Poller stopped: ${error.message}`);
    });
    console.log(`[SQS Subscriber] Polling queue ${config.sqs.queueUrl}`);
  } else {
    console.log('[SQS Subscriber] Disabled via SQS_ENABLED=false');
  }

  let httpServer;
  let stopEwdsPolling;
  if (config.httpListenerEnabled) {
    httpServer = createServer(httpMessageHandler);
    httpServer.listen(config.httpListenerPort, () => {
      console.log(`[HTTP Listener] Ready to receive POST requests at ${config.httpListenerPath} on port ${config.httpListenerPort}`);
    });

    httpServer.on('error', (error) => {
      console.error(`[HTTP Listener] Server error: ${error.message}`);
    });
  } else {
    console.log('[HTTP Listener] Disabled via HTTP_LISTENER_ENABLED=false');
  }

  if (config.ewds.enabled) {
    if (config.ewds.topics.length === 0) {
      console.warn('[EWDS] Enabled but no valid topics were configured. Set EWDS_TOPICS or EWDS_TOPIC_OWNER/NAME/CLIENT_ID (and optional EWDS_TOPIC_VERSION) plus EWDS_FQCN or FQCN.');
    } else {
      const ewdsPoller = createEwdsPoller(config.ewds, processEwdsEnvelope);
      stopEwdsPolling = ewdsPoller.schedule();
      ewdsPoller.runOnce().catch((error) => {
        console.error(`[EWDS] Initial polling cycle failed: ${error.message}`);
      });
    }
  }

  // Graceful Shutdown Mechanics
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown of Grid Operator Subscriber...`);
    
    try {
      if (subscription) {
        await subscription.close();
        console.log('[Shutdown] Closed Pub/Sub subscription listener successfully.');
      }

      if (sqsSubscriber) {
        await sqsSubscriber.stop();
        console.log('[Shutdown] Stopped SQS polling successfully.');
      }

      if (httpServer) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
        console.log('[Shutdown] HTTP listener stopped successfully.');
      }

      if (stopEwdsPolling) {
        stopEwdsPolling();
        console.log('[Shutdown] EWDS polling timer stopped successfully.');
      }

      process.exit(0);
    } catch (err) {
      console.error('[Shutdown] Error closing subscription stream:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('index.js')) {
  main();
}

export { messageHandler, publishAuditEvent };

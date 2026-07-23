/**
 * INTELLIGENT Grid Operator Middleware V2 - Node.js GCP Pub/Sub Pull Subscriber
 * 
 * Main entry point for the Version 2 Grid Operator Middleware. This script
 * pulls messages from a GCP Pub/Sub subscription, validates their transport
 * headers and ontology, forwards payloads to gateway endpoints, logs audit
 * events, and properly manages message acknowledgement (ACK/NACK).
 */

import { createServer } from 'http';
import { PubSub } from '@google-cloud/pubsub';
import { config } from './config.js';
import { validateTransportHeader, validateOntologyPayload } from './validator.js';
import { routeMessage } from './router.js';

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

async function httpMessageHandler(req, res) {
  const requestPath = new URL(req.url || '', 'http://localhost').pathname;

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

  const ontologyValidation = validateOntologyPayload(parsedMessage);
  if (!ontologyValidation.isValid) {
    console.error(`[HTTP Listener] Ontology validation failed for exchange ${parsedMessage.exchange}: ${ontologyValidation.error}`);
    await publishAuditEvent(parsedMessage.messageId, parsedMessage.exchange, 'FAILED', {
      error: `Ontology validation failed: ${ontologyValidation.error}`,
    });
    sendJsonResponse(res, 400, { error: ontologyValidation.error });
    return;
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

/**
 * Main application initializer
 */
function main() {
  console.log(`======================================================================`);
  console.log(`INTELLIGENT Grid Operator Middleware V2 - GCP Pub/Sub Pull Subscriber`);
  console.log(`======================================================================`);
  console.log(`[Init] Configured GCP Project ID: ${config.projectId}`);
  console.log(`[Init] Target Pub/Sub Subscription: ${config.subscriptionName}`);
  console.log(`[Init] Flow Control Max Messages: ${config.flowControl.maxMessages}`);
  console.log(`[Init] Downstream routing endpoint: ${config.endpoint}`);
  console.log(`[Init] Pub/Sub enabled: ${config.pubsubEnabled}`);
  console.log(`[Init] HTTP listener enabled: ${config.httpListenerEnabled}`);

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

  let httpServer;
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

  // Graceful Shutdown Mechanics
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown of Grid Operator Subscriber...`);
    
    try {
      if (subscription) {
        await subscription.close();
        console.log('[Shutdown] Closed Pub/Sub subscription listener successfully.');
      }

      if (httpServer) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
        console.log('[Shutdown] HTTP listener stopped successfully.');
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

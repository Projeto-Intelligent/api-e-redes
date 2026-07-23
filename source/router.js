/**
 * INTELLIGENT Grid Operator Middleware V2 - Routing & HTTP Forwarding Module
 * 
 * Responsible for routing messages to the downstream endpoint
 * and attaching the configured API key.
 */

import crypto from 'crypto';
import { config } from './config.js';

function buildDefaultSendMessageResponse({ messageId, transactionId, statusCode }) {
  return {
    clientGatewayMessageId: messageId,
    did: 'unknown',
    recipients: {
      total: 0,
      sent: statusCode >= 200 && statusCode < 300 ? 0 : 0,
      failed: statusCode >= 200 && statusCode < 300 ? 0 : 0,
    },
    status: [
      {
        name: statusCode >= 200 && statusCode < 300 ? 'SENT' : 'FAILED',
        details: [
          {
            did: 'unknown',
            messageId,
            statusCode,
          },
        ],
      },
    ],
  };
}

function normalizeSendMessageResponse(responseBody, context) {
  if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
    const hasRequiredFields =
      typeof responseBody.clientGatewayMessageId === 'string' &&
      typeof responseBody.did === 'string' &&
      responseBody.recipients &&
      Array.isArray(responseBody.status);

    if (hasRequiredFields) {
      return responseBody;
    }

    return {
      ...buildDefaultSendMessageResponse(context),
      ...responseBody,
      recipients: {
        ...buildDefaultSendMessageResponse(context).recipients,
        ...(responseBody.recipients || {}),
      },
      status: Array.isArray(responseBody.status)
        ? responseBody.status
        : buildDefaultSendMessageResponse(context).status,
    };
  }

  return buildDefaultSendMessageResponse(context);
}

/**
 * Routes and forwards an authorized message to the designated pilot endpoint.
 * Utilizes native Node.js fetch (available in Node.js 18+).
 * 
 * @param {object} message - The validated message object containing headers and payload
 * @returns {Promise<object>} Result of the routing operation { success: boolean, statusCode?: number, responseBody?: any, error?: string }
 */
export async function routeMessage(message) {
  const {
    exchange,
    payload,
    messageId,
    pilotId,
    transactionId,
    topicName: messageTopicName,
    topicOwner: messageTopicOwner,
    topicVersion: messageTopicVersion,
    fqcn: messageFqcn,
    entityId: messageEntityId,
  } = message;

  const metadata = config.getRoutingMetadataForExchange(exchange);
  const endpoint = config.endpoint;
  const apiKey = config.apiKey;
  const topicName = messageTopicName || metadata.topicName;
  const topicOwner = messageTopicOwner || metadata.topicOwner;
  const topicVersion = messageTopicVersion || metadata.topicVersion;
  const fqcn = messageFqcn || metadata.fqcn;
  const entityId = messageEntityId || config.entityId;
  const routingTransactionId = transactionId || crypto.randomUUID();
  const payloadAsString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const responseContext = {
    messageId,
    transactionId: routingTransactionId,
    statusCode: 200,
  };

  console.log(`[Router] Message ${messageId} (${exchange}) destined for pilot "${pilotId}". Using endpoint: ${endpoint}`);
  console.log(`[Router] Routing config for exchange ${exchange}: topicName=${topicName}, topicOwner=${topicOwner}, topicVersion=${topicVersion}, fqcn=${fqcn}, entityId=${entityId}`);

  if (!fqcn) {
    console.error(`[Router] [BAD_REQUEST] Missing required 'fqcn' in message ${messageId}`);
    return { success: false, statusCode: 400, error: 'Missing required field: fqcn' };
  }

  if (!endpoint) {
    console.error(`[Router] [CONFIG_ERROR] No downstream endpoint configured for exchange ${exchange}`);
    return { success: false, statusCode: 500, error: `No endpoint configured for exchange ${exchange}` };
  }

  if (endpoint.includes('intelligent-pilot.eu')) {
    console.log(`[Router] [MOCK SIMULATION] Forwarding message to sandbox ${exchange} endpoint...`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (process.env.DISABLE_MOCK_FAILURES === 'true' || Math.random() > 0.05) {
      console.log(`[Router] [MOCK SUCCESS] Message ${messageId} successfully accepted by ${exchange} downstream.`);
      return {
        success: true,
        statusCode: 200,
        responseBody: normalizeSendMessageResponse({
          clientGatewayMessageId: messageId,
          did: 'did:mock:gateway',
          recipients: { total: 0, sent: 0, failed: 0 },
          status: [{ name: 'SENT', details: [{ did: 'did:mock:recipient', messageId, statusCode: 200 }] }],
        }, responseContext),
      };
    }
    console.warn(`[Router] [MOCK FAILURE] Temporary outage at ${endpoint}`);
    throw new Error(`Connection timed out to simulated endpoint: ${endpoint}`);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Message-ID': messageId,
        'X-Pilot-ID': pilotId,
        'x-api-key': apiKey,
        'X-Exchange-Discriminator': exchange,
        'User-Agent': 'INTELLIGENT-Grid-Operator-Middleware/2.0.0',
      },
      body: JSON.stringify({
        fqcn,
        initiatingMessageId: messageId,
        initiatingTransactionId: routingTransactionId,
        topicName,
        topicVersion,
        topicOwner,
        transactionId: routingTransactionId,
        payload: payloadAsString,
        anonymousRecipient: [],
      }),
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const responseBody = isJson ? await response.json() : await response.text();

    if (response.ok) {
      console.log(`[Router] [SUCCESS] Message ${messageId} routed to ${exchange} endpoint. HTTP ${response.status}`);
      return {
        success: true,
        statusCode: response.status,
        responseBody: normalizeSendMessageResponse(responseBody, {
          ...responseContext,
          statusCode: response.status,
        }),
      };
    }

    console.error(`[Router] [ERROR] Downstream returned error code HTTP ${response.status}: ${JSON.stringify(responseBody)}`);
    return {
      success: false,
      statusCode: response.status,
      error: `Downstream error: HTTP ${response.status}`,
      responseBody,
    };
  } catch (error) {
    console.error(`[Router] [NETWORK EXCEPTION] Failed to connect to ${endpoint}: ${error.message}`);
    throw error;
  }
}

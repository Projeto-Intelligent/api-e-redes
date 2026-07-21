/**
 * INTELLIGENT Grid Operator Middleware V2 - Routing & HTTP Forwarding Module
 * 
 * Responsible for routing messages to the appropriate downstream pilot endpoints
 * and attaching authorization credentials as per the EWDS specification.
 */

import { config } from './config.js';

/**
 * Routes and forwards an authorized message to the designated pilot endpoint.
 * Utilizes native Node.js fetch (available in Node.js 18+).
 * 
 * @param {object} message - The validated message object containing headers and payload
 * @returns {Promise<object>} Result of the routing operation { success: boolean, statusCode?: number, responseText?: string, error?: string }
 */
export async function routeMessage(message) {
  const { exchange, payload, messageId, pilotId, transactionId, topicName, topicOwner, topicVersion, fqcn } = message;
  const endpoint = config.endpoint;
  const token = config.bearerToken;

  console.log(`[Router] Message ${messageId} (${exchange}) destined for pilot "${pilotId}". Attempting routing to: ${endpoint}`);

  // Require `fqcn` to be provided by the incoming message
  if (!fqcn) {
    console.error(`[Router] [BAD_REQUEST] Missing required 'fqcn' in message ${messageId}`);
    return { success: false, statusCode: 400, error: 'Missing required field: fqcn' };
  }

  // For testing purposes: if endpoint is default/mock, simulate network response
  if (endpoint.includes('intelligent-pilot.eu')) {
    console.log(`[Router] [MOCK SIMULATION] Forwarding message to sandbox ${exchange} endpoint...`);
    await new Promise(resolve => setTimeout(resolve, 150)); // simulate latency
    
    // Simulate high success rate, allow disabling failures during testing/benchmarking
    if (process.env.DISABLE_MOCK_FAILURES === 'true' || Math.random() > 0.05) {
      console.log(`[Router] [MOCK SUCCESS] Message ${messageId} successfully accepted by ${exchange} downstream.`);
      return { success: true, statusCode: 200, responseText: 'OK (Simulated)' };
    } else {
      console.warn(`[Router] [MOCK FAILURE] Temporary outage at ${endpoint}`);
      throw new Error(`Connection timed out to simulated endpoint: ${endpoint}`);
    }
  }

  // Real HTTP execution for production
  try {
    // Ensure we always have a transactionId

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Message-ID': messageId,
        'X-Pilot-ID': pilotId,
        'x-api-key': token,
        'X-Exchange-Discriminator': exchange,
        'User-Agent': 'INTELLIGENT-Grid-Operator-Middleware/2.0.0'
      },
      body: JSON.stringify({
        fqcn,
        topicName: topicName || 'TOPIC_NAME',
        topicOwner: topicOwner || 'TOPIC_OWNER',
        topicVersion: topicVersion || 'TOPIC_VERSION',
        transactionId: crypto.randomUUID(),
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
        anonymousRecipient: []
      })
    });

    const responseText = await response.text();

    if (response.ok) {
      console.log(`[Router] [SUCCESS] Message ${messageId} routed to ${exchange} endpoint. HTTP ${response.status}`);
      return { 
        success: true, 
        statusCode: response.status, 
        responseText 
      };
    } else {
      console.error(`[Router] [ERROR] Downstream returned error code HTTP ${response.status}: ${responseText}`);
      return { 
        success: false, 
        statusCode: response.status, 
        error: `Downstream error: HTTP ${response.status}`,
        responseText 
      };
    }
  } catch (error) {
    console.error(`[Router] [NETWORK EXCEPTION] Failed to connect to ${endpoint}: ${error.message}`);
    throw error; // Throw so caller knows to NACK for reprocessing
  }
}

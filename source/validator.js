/**
 * INTELLIGENT Grid Operator Middleware V2 - Validation Module
 * 
 * Responsible for verifying the structure, transport headers, and exchange
 * discriminator of incoming messages.
 */

const VALID_EXCHANGES = [
  'Metering',
  'GridSignal',
  'P2PMarketData',
  'DynamicGridTariff',
  'TransactionValidation'
];

/**
 * Validates the outer message envelope (Transport Header)
 * @param {object} msg - The parsed JSON message
 * @returns {object} Validation result { isValid: boolean, error: string|null }
 */
export function validateTransportHeader(msg) {
  if (!msg || typeof msg !== 'object') {
    return { isValid: false, error: 'Message is not a valid JSON object' };
  }

  // 1. Check messageId
  const messageId = msg.messageId || msg.msgId || msg.message_id;
  if (!messageId || typeof messageId !== 'string') {
    return { isValid: false, error: 'Missing or invalid "messageId" in transport header' };
  }

  // 2. Check exchange discriminator (CRITICAL)
  if (!msg.exchange || typeof msg.exchange !== 'string') {
    return { isValid: false, error: 'Missing or invalid "exchange" discriminator in transport header' };
  }

  if (!VALID_EXCHANGES.includes(msg.exchange)) {
    return { 
      isValid: false, 
      error: `Invalid exchange discriminator "${msg.exchange}". Must be one of: ${VALID_EXCHANGES.join(', ')}` 
    };
  }

  // 3. Check timestampUtc
  if (!msg.timestampUtc || typeof msg.timestampUtc !== 'string' || isNaN(Date.parse(msg.timestampUtc))) {
    return { isValid: false, error: 'Missing or invalid "timestampUtc" in transport header' };
  }

  // 4. Check pilotId
  if (!msg.pilotId || typeof msg.pilotId !== 'string') {
    return { isValid: false, error: 'Missing or invalid "pilotId" (e.g. PT, CH, IE) in transport header' };
  }

  // 5. Check scenarioId
  if (!msg.scenarioId || typeof msg.scenarioId !== 'string') {
    return { isValid: false, error: 'Missing or invalid "scenarioId" in transport header' };
  }

  // 6. Check payload structure presence
  if (!msg.payload || typeof msg.payload !== 'object') {
    return { isValid: false, error: 'Missing or invalid "payload" object in transport header' };
  }

  return { isValid: true, error: null };
}

/**
 * Performs deep, ontology-aligned schema checks on the message payload
 * based on the exchange discriminator (Version 2 spec).
 * @param {object} msg - The validated outer envelope
 * @returns {object} Ontology validation result { isValid: boolean, error: string|null }
 */
export function validateOntologyPayload(msg) {
  const { exchange, payload } = msg;

  switch (exchange) {
    case 'Metering':
      // Accept canonical ontology data or the raw E-REDES schema carried by the adapter.
      const hasCanonicalMetering = payload['int:DataSet'] !== undefined;
      const hasRawERedesMetering = Boolean(
        payload.POD &&
        payload.Date &&
        Array.isArray(payload.Measures)
      );

      if (!hasCanonicalMetering && !hasRawERedesMetering) {
        return { isValid: false, error: 'Metering payload must contain "int:DataSet" object' };
      }
      break;

    case 'GridSignal':
      // Grid status (0=GREEN, 1=YELLOW, 2=RED) or flexibility procurement (kW)
      if (!payload['int:DataSet']) {
        return { isValid: false, error: 'GridSignal payload must contain "int:DataSet" object' };
      }
      const dataSet = payload['int:DataSet'];
      if (dataSet['int:contains'] && dataSet['int:contains']['int:TimeSeries']) {
        const timeSeries = dataSet['int:contains']['int:TimeSeries'];
        if (!Array.isArray(timeSeries['int:hasObservation'])) {
          return { isValid: false, error: 'GridSignal TimeSeries must contain an "int:hasObservation" array' };
        }
      }
      break;

    case 'P2PMarketData':
      // Represented by int:Market, int:Order (bid/offer), int:Trade, int:Actor
      const validMarketKeys = ['int:Market', 'int:Order', 'int:Trade', 'int:Actor'];
      const hasValidMarketObj = validMarketKeys.some(key => payload[key] !== undefined);
      if (!hasValidMarketObj) {
        return { 
          isValid: false, 
          error: `P2PMarketData payload must contain one of: ${validMarketKeys.join(', ')}` 
        };
      }
      break;

    case 'DynamicGridTariff':
      // Time-of-Use tariffs (int:Tariff) and/or dynamic fee models (int:GridFeeModel)
      if (!payload['int:Tariff'] && !payload['int:GridFeeModel']) {
        return { 
          isValid: false, 
          error: 'DynamicGridTariff payload must contain either "int:Tariff" or "int:GridFeeModel"' 
        };
      }
      break;

    case 'TransactionValidation':
      // Validated transaction (int:Trade) and outcome dataset (int:DataSet where 0=VALID, 1=INVALID)
      if (!payload['int:Trade'] || !payload['int:DataSet']) {
        return { 
          isValid: false, 
          error: 'TransactionValidation payload must contain both "int:Trade" and "int:DataSet"' 
        };
      }
      break;
  }

  return { isValid: true, error: null };
}

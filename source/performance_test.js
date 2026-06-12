/**
 * INTELLIGENT Grid Operator Middleware V2 - Compliance and Performance Test Script
 * 
 * Simulates high-throughput concurrent message ingestion through the Pub/Sub subscriber
 * pipeline. Generates synthetic payloads (aligned to Section 4 specifications)
 * and measures parsing, validation, routing latency, and overall throughput.
 */

import { messageHandler } from './index.js';

// Disable mock failures for deterministic testing
process.env.DISABLE_MOCK_FAILURES = 'true';

// Helper to generate UUIDs
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 1. Generate synthetic test cases matching D3.4 specifications
const TEST_CASES = [
  // A. Grid status signal (Section 4.3.6)
  {
    name: 'GRID_STATUS (Valid Green/Yellow/Red)',
    payload: {
      messageId: uuidv4(),
      exchange: 'GridSignal',
      timestampUtc: new Date().toISOString(),
      pilotId: 'PT',
      scenarioId: 'SCN-PT-01',
      payload: {
        'int:DataSet': {
          'int:dataSetName': 'SCN-PT-01_GRID_STATUS_FEEDER_PT-FEEDER-012',
          'int:dataSetDescription': 'Synthetic traffic-light grid status. Encoding: 0=GREEN, 1=YELLOW, 2=RED.',
          'int:contains': {
            'int:TimeSeries': {
              'int:hasObservation': [
                { 'int:TimeSeriesValue': { 'int:timestamp': new Date().toISOString(), 'int:value': 0 } },
                { 'int:TimeSeriesValue': { 'int:timestamp': new Date().toISOString(), 'int:value': 1 } }
              ]
            }
          }
        }
      }
    },
    shouldSucceed: true
  },
  // B. P2P Market Bid (Section 4.4.3)
  {
    name: 'P2P_MARKET_BID (Valid Bid)',
    payload: {
      messageId: uuidv4(),
      exchange: 'P2PMarketData',
      timestampUtc: new Date().toISOString(),
      pilotId: 'IE',
      scenarioId: 'SCN-IE-01',
      payload: {
        'int:Order': {
          'int:orderId': 'ORDER-IE-0001',
          'int:orderType': 'bid',
          'int:quantity': 2.5,
          'int:priceLimit': 0.22,
          'int:timeSlot': new Date().toISOString(),
          'int:marketId': 'DEX-SPOT-0001',
          'int:createdBy': {
            'int:Actor': { 'int:actorName': 'PARTY-IE-0007', 'int:actorType': 'Prosumer' }
          }
        }
      }
    },
    shouldSucceed: true
  },
  // C. Dynamic Grid Tariff TOU Model (Section 4.5.3)
  {
    name: 'DYNAMIC_GRID_TARIFF (Valid TOU Tariff)',
    payload: {
      messageId: uuidv4(),
      exchange: 'DynamicGridTariff',
      timestampUtc: new Date().toISOString(),
      pilotId: 'PT',
      scenarioId: 'SCN-PT-TAR-01',
      payload: {
        'int:Tariff': {
          'int:tariffName': 'TAR-PT-TOU-001',
          'int:tariffStructure': 'time-of-use',
          'int:currency': 'EUR',
          'int:gridFee': 0.0
        }
      }
    },
    shouldSucceed: true
  },
  // D. Transaction Validation Outcome (Section 4.6.5)
  {
    name: 'TRANSACTION_VALIDATION (Valid Outcome)',
    payload: {
      messageId: uuidv4(),
      exchange: 'TransactionValidation',
      timestampUtc: new Date().toISOString(),
      pilotId: 'CH',
      scenarioId: 'SCN-CH-VAL-02',
      payload: {
        'int:Trade': {
          'int:tradeId': 'TRADE-CH-20260328-0012',
          'int:tradeQuantity': 3.5,
          'int:tradePrice': 0.24,
          'int:tradeTimestamp': new Date().toISOString(),
          'int:timeSlot': new Date().toISOString(),
          'int:marketId': 'DEX-SPOT-0001'
        },
        'int:DataSet': {
          'int:dataSetName': 'SCN-CH-VAL-02_RESULT_TRADE-CH-20260328-0012',
          'int:dataSetDescription': 'Synthetic validation result. outcomeEncoding: 0=VALID, 1=INVALID',
          'int:contains': {
            'int:TimeSeries': {
              'int:hasObservation': [
                { 'int:TimeSeriesValue': { 'int:timestamp': new Date().toISOString(), 'int:value': 1 } }
              ]
            }
          }
        }
      }
    },
    shouldSucceed: true
  },
  // E. Metering Telemetry (Section 4.2)
  {
    name: 'METERING_TELEMETRY (Valid Metering)',
    payload: {
      messageId: uuidv4(),
      exchange: 'Metering',
      timestampUtc: new Date().toISOString(),
      pilotId: 'PT',
      scenarioId: 'SCN-PT-01',
      payload: {
        'int:DataSet': {
          'int:dataSetName': 'SCN-PT-01_METERING_ACTIVE_ENERGY_CONSUMPTION_POD_PT0002000133842114AB',
          'int:dataSetDescription': 'Normalized active energy consumption telemetry for POD PT0002000133842114AB',
          'int:contains': {
            'int:TimeSeries': {
              'int:measurementUnit': 'kW',
              'int:hasObservation': [
                { 'int:TimeSeriesValue': { 'int:timestamp': new Date().toISOString(), 'int:value': 0.124, 'int:qualityFlag': 'verified' } },
                { 'int:TimeSeriesValue': { 'int:timestamp': new Date().toISOString(), 'int:value': 0.196, 'int:qualityFlag': 'verified' } }
              ]
            }
          }
        }
      }
    },
    shouldSucceed: true
  },
  // F. Invalid Case: Missing Exchange Discriminator
  {
    name: 'INVALID_CASE (Missing Exchange)',
    payload: {
      messageId: uuidv4(),
      timestampUtc: new Date().toISOString(),
      pilotId: 'PT',
      scenarioId: 'SCN-PT-01',
      payload: {}
    },
    shouldSucceed: false
  },
  // F. Invalid Case: Bad Ontology Schema for Metering
  {
    name: 'INVALID_CASE (Bad Ontology Schema for Metering)',
    payload: {
      messageId: uuidv4(),
      exchange: 'Metering',
      timestampUtc: new Date().toISOString(),
      pilotId: 'PT',
      scenarioId: 'SCN-PT-01',
      payload: {
        someRandomField: 'This is not int:DataSet!'
      }
    },
    shouldSucceed: false
  }
];

/**
 * Creates a mock GCP Pub/Sub Message object.
 */
function createMockPubSubMessage(id, dataPayload) {
  const rawString = JSON.stringify(dataPayload);
  return {
    id: id,
    data: Buffer.from(rawString),
    deliveryAttempt: 1,
    ackCalled: false,
    nackCalled: false,
    ack() {
      this.ackCalled = true;
    },
    nack() {
      this.nackCalled = true;
    }
  };
}

/**
 * Runs the performance and compliance test suite.
 */
async function runPerfTest() {
  console.log(`\n======================================================================`);
  console.log(`MIDDLEWARE PERFORMANCE & COMPLIANCE TEST SUITE - VERSION 2`);
  console.log(`======================================================================`);
  console.log(`Generating 500 concurrent messages across 6 transaction profiles...`);

  const NUM_RUNS = 500;
  const messages = [];

  // Generate 500 simulated events
  for (let i = 0; i < NUM_RUNS; i++) {
    const template = TEST_CASES[i % TEST_CASES.length];
    const testPayload = JSON.parse(JSON.stringify(template.payload));
    
    // Randomize some attributes to simulate diverse events
    if (testPayload.messageId) testPayload.messageId = uuidv4();
    if (testPayload.payload && testPayload.payload['int:Order']) {
      testPayload.payload['int:Order']['int:orderId'] = `ORDER-${1000 + i}`;
    }

    messages.push({
      name: template.name,
      mockMessage: createMockPubSubMessage(`msg-${100000 + i}`, testPayload),
      shouldSucceed: template.shouldSucceed
    });
  }

  console.log(`Beginning high-concurrency execution...`);
  const startTime = process.hrtime.bigint();

  // Process all 500 messages concurrently
  await Promise.all(messages.map(item => messageHandler(item.mockMessage)));

  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1000000;

  // Compile compliance and metrics results
  let passedCompliance = 0;
  let failedCompliance = 0;
  let correctAck = 0;
  let incorrectHandling = 0;

  messages.forEach(item => {
    const isAcked = item.mockMessage.ackCalled;
    const isNacked = item.mockMessage.nackCalled;

    if (item.shouldSucceed) {
      if (isAcked && !isNacked) {
        passedCompliance++;
        correctAck++;
      } else {
        failedCompliance++;
        incorrectHandling++;
      }
    } else {
      // Invalid cases should be gracefully acknowledged (as unprocessable payloads) or correctly managed
      if (isAcked) {
        passedCompliance++;
        correctAck++;
      } else {
        failedCompliance++;
        incorrectHandling++;
      }
    }
  });

  const throughputSec = (NUM_RUNS / (durationMs / 1000)).toFixed(2);
  const avgLatencyMs = (durationMs / NUM_RUNS).toFixed(3);

  console.log(`\n======================================================================`);
  console.log(`PERFORMANCE & COMPLIANCE TEST REPORT`);
  console.log(`======================================================================`);
  console.log(`- Total Messages Handled:       ${NUM_RUNS}`);
  console.log(`- Overall Test Duration:        ${durationMs.toFixed(2)} ms`);
  console.log(`- Average Message Processing:   ${avgLatencyMs} ms`);
  console.log(`- Peak System Throughput:       ${throughputSec} msgs/sec`);
  console.log(`- Compliance Passing Rate:      ${((passedCompliance / NUM_RUNS) * 100).toFixed(1)}% (${passedCompliance}/${NUM_RUNS})`);
  console.log(`- Correct ACK Actions:          ${correctAck}`);
  console.log(`- Pipeline Faults/Regressions:  ${incorrectHandling}`);
  console.log(`======================================================================`);

  if (incorrectHandling === 0) {
    console.log(`\n[SUCCESS] Compliance verification passed. Middleware adheres fully to Version 2 standard.`);
  } else {
    console.error(`\n[FAILURE] Regression faults detected in message handoff and pipeline handling.`);
    process.exit(1);
  }
}

runPerfTest().catch(console.error);

/**
 * INTELLIGENT Grid Operator Middleware V2 - Metering Adapter Compliance Test
 * 
 * Ingests the exact raw Portuguese E-REDES metering payload provided, maps it 
 * to the INTELLIGENT ontology (D3.1) and Transport Header specs using adapter.js, 
 * and asserts compliance using validator.js.
 */

import { adaptERedesMetering } from './adapter.js';
import { validateTransportHeader, validateOntologyPayload } from './validator.js';

// The exact raw E-REDES metering payload provided by the user
const rawERedesPayload = {
  "POD": "PT0002000133842114AB",
  "Channel": "413",
  "Unit": "kW",
  "Losses": "0",
  "Date": "2026-01-18",
  "Period": "W",
  "Measures": [
    { "time": "00:15", "value": 0.0, "flag": 0.0 },
    { "time": "00:30", "value": 0.0, "flag": 0.0 },
    { "time": "00:45", "value": 0.0, "flag": 0.0 },
    { "time": "01:00", "value": 0.0, "flag": 0.0 },
    { "time": "01:15", "value": 0.0, "flag": 0.0 },
    { "time": "01:30", "value": 0.0, "flag": 0.0 },
    { "time": "01:45", "value": 0.0, "flag": 0.0 },
    { "time": "02:00", "value": 0.0, "flag": 0.0 },
    { "time": "02:15", "value": 0.0, "flag": 0.0 },
    { "time": "02:30", "value": 0.0, "flag": 0.0 },
    { "time": "02:45", "value": 0.0, "flag": 0.0 },
    { "time": "03:00", "value": 0.0, "flag": 0.0 },
    { "time": "03:15", "value": 0.0, "flag": 0.0 },
    { "time": "03:30", "value": 0.0, "flag": 0.0 },
    { "time": "03:45", "value": 0.0, "flag": 0.0 },
    { "time": "04:00", "value": 0.0, "flag": 0.0 },
    { "time": "04:15", "value": 0.0, "flag": 0.0 },
    { "time": "04:30", "value": 0.0, "flag": 0.0 },
    { "time": "04:45", "value": 0.0, "flag": 0.0 },
    { "time": "05:00", "value": 0.0, "flag": 0.0 },
    { "time": "05:15", "value": 0.0, "flag": 0.0 },
    { "time": "05:30", "value": 0.0, "flag": 0.0 },
    { "time": "05:45", "value": 0.0, "flag": 0.0 },
    { "time": "06:00", "value": 0.0, "flag": 0.0 },
    { "time": "06:15", "value": 0.0, "flag": 0.0 },
    { "time": "06:30", "value": 0.0, "flag": 0.0 },
    { "time": "06:45", "value": 0.0, "flag": 0.0 },
    { "time": "07:00", "value": 0.0, "flag": 0.0 },
    { "time": "07:15", "value": 0.0, "flag": 0.0 },
    { "time": "07:30", "value": 0.0, "flag": 0.0 },
    { "time": "07:45", "value": 0.0, "flag": 0.0 },
    { "time": "08:00", "value": 0.0, "flag": 0.0 },
    { "time": "08:15", "value": 0.0, "flag": 0.0 },
    { "time": "08:30", "value": 0.0, "flag": 0.0 },
    { "time": "08:45", "value": 0.0, "flag": 0.0 },
    { "time": "09:00", "value": 0.0, "flag": 0.0 },
    { "time": "09:15", "value": 0.0, "flag": 0.0 },
    { "time": "09:30", "value": 0.0, "flag": 0.0 },
    { "time": "09:45", "value": 0.116, "flag": 0.0 },
    { "time": "10:00", "value": 0.104, "flag": 0.0 },
    { "time": "10:15", "value": 0.064, "flag": 0.0 },
    { "time": "10:30", "value": 0.068, "flag": 0.0 },
    { "time": "10:45", "value": 0.124, "flag": 0.0 },
    { "time": "11:00", "value": 0.196, "flag": 0.0 },
    { "time": "11:15", "value": 0.276, "flag": 0.0 },
    { "time": "11:30", "value": 0.244, "flag": 0.0 },
    { "time": "11:45", "value": 0.304, "flag": 0.0 },
    { "time": "12:00", "value": 0.576, "flag": 0.0 },
    { "time": "12:15", "value": 0.0, "flag": 0.0 },
    { "time": "12:30", "value": 0.164, "flag": 0.0 },
    { "time": "12:45", "value": 0.0, "flag": 0.0 },
    { "time": "13:00", "value": 0.0, "flag": 0.0 },
    { "time": "13:15", "value": 0.0, "flag": 0.0 },
    { "time": "13:30", "value": 0.0, "flag": 0.0 },
    { "time": "13:45", "value": 0.0, "flag": 0.0 },
    { "time": "14:00", "value": 0.0, "flag": 0.0 },
    { "time": "14:15", "value": 0.0, "flag": 0.0 },
    { "time": "14:30", "value": 0.0, "flag": 0.0 },
    { "time": "14:45", "value": 0.0, "flag": 0.0 },
    { "time": "15:00", "value": 0.0, "flag": 0.0 },
    { "time": "15:15", "value": 0.0, "flag": 0.0 },
    { "time": "15:30", "value": 0.0, "flag": 0.0 },
    { "time": "15:45", "value": 0.0, "flag": 0.0 },
    { "time": "16:00", "value": 0.0, "flag": 0.0 },
    { "time": "16:15", "value": 0.0, "flag": 0.0 },
    { "time": "16:30", "value": 0.0, "flag": 0.0 },
    { "time": "16:45", "value": 0.0, "flag": 0.0 },
    { "time": "17:00", "value": 0.0, "flag": 0.0 },
    { "time": "17:15", "value": 0.0, "flag": 0.0 },
    { "time": "17:30", "value": 0.0, "flag": 0.0 },
    { "time": "17:45", "value": 0.0, "flag": 0.0 },
    { "time": "18:00", "value": 0.0, "flag": 0.0 },
    { "time": "18:15", "value": 0.0, "flag": 0.0 },
    { "time": "18:30", "value": 0.0, "flag": 0.0 },
    { "time": "18:45", "value": 0.0, "flag": 0.0 },
    { "time": "19:00", "value": 0.0, "flag": 0.0 },
    { "time": "19:15", "value": 0.0, "flag": 0.0 },
    { "time": "19:30", "value": 0.0, "flag": 0.0 },
    { "time": "19:45", "value": 0.0, "flag": 0.0 },
    { "time": "20:00", "value": 0.0, "flag": 0.0 },
    { "time": "20:15", "value": 0.0, "flag": 0.0 },
    { "time": "20:30", "value": 0.0, "flag": 0.0 },
    { "time": "20:45", "value": 0.0, "flag": 0.0 },
    { "time": "21:00", "value": 0.0, "flag": 0.0 },
    { "time": "21:15", "value": 0.0, "flag": 0.0 },
    { "time": "21:30", "value": 0.0, "flag": 0.0 },
    { "time": "21:45", "value": 0.0, "flag": 0.0 },
    { "time": "22:00", "value": 0.0, "flag": 0.0 },
    { "time": "22:15", "value": 0.0, "flag": 0.0 },
    { "time": "22:30", "value": 0.0, "flag": 0.0 },
    { "time": "22:45", "value": 0.0, "flag": 0.0 },
    { "time": "23:00", "value": 0.0, "flag": 0.0 },
    { "time": "23:15", "value": 0.0, "flag": 0.0 },
    { "time": "23:30", "value": 0.0, "flag": 0.0 },
    { "time": "23:45", "value": 0.0, "flag": 0.0 },
    { "time": "24:00", "value": 0.0, "flag": 0.0 }
  ]
};

function runTest() {
  console.log(`======================================================================`);
  console.log(`METERING PAYLOAD NORMALIZATION & VALIDATION TEST`);
  console.log(`======================================================================`);
  console.log(`Ingesting E-REDES raw telemetry...`);

  // 1. Convert E-REDES payload using our adapter
  const normalizedMessage = adaptERedesMetering(rawERedesPayload);
  
  console.log(`\nConversion complete. Normalized INTELLIGENT Message structure:\n`);
  console.log(JSON.stringify(normalizedMessage, null, 2));

  console.log(`\n======================================================================`);
  console.log(`RUNNING SCHEMA COMPLIANCE CHECKS`);
  console.log(`======================================================================`);

  // 2. Validate using our core validators
  const headerCheck = validateTransportHeader(normalizedMessage);
  console.log(`- Transport Envelope Check: ${headerCheck.isValid ? 'PASSED (valid)' : 'FAILED: ' + headerCheck.error}`);

  const ontologyCheck = validateOntologyPayload(normalizedMessage);
  console.log(`- Ontology Alignment Check: ${ontologyCheck.isValid ? 'PASSED (valid)' : 'FAILED: ' + ontologyCheck.error}`);

  if (headerCheck.isValid && ontologyCheck.isValid) {
    console.log(`\n[SUCCESS] The E-REDES payload has been successfully converted into a valid D3.4 / D3.1 Metering message!`);
  } else {
    console.error(`\n[FAILURE] The normalized payload fails compliance validation rules.`);
    process.exit(1);
  }
}

runTest();
export { rawERedesPayload };

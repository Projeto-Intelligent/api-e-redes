/**
 * INTELLIGENT Grid Operator Middleware V2 - Normalization & Adapter Module
 * 
 * Maps heterogeneous, pilot-specific raw E-REDES Portuguese metering structures
 * into the pilot-agnostic, ontology-aligned transport envelopes defined in D3.4 / D3.1.
 */

/**
 * Normalizes a raw E-REDES metering record to an ontology-aligned message.
 * Handles timestamp combination, channel mappings, and structural alignment.
 * 
 * @param {object} raw - The raw E-REDES Portuguese metering payload
 * @returns {object} Fully compliant INTELLIGENT envelope + payload
 */
export function adaptERedesMetering(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid raw payload provided for adapter');
  }

  const { POD, Channel, Unit, Date: rawDate, Measures } = raw;

  if (!POD || !rawDate || !Array.isArray(Measures)) {
    throw new Error('Missing core attributes in raw E-REDES payload (POD, Date, or Measures)');
  }

  // 1. Resolve domain name based on E-REDES Channel
  // Portuguese E-REDES standard active energy channels: 
  // - Channel '1' or containing '413' usually denotes Active Consumption (import).
  // - Channel '2' or containing '411' denotes Active Production (export).
  let exchangeType = 'Metering';
  let dataSetType = 'ACTIVE_ENERGY_CONSUMPTION';
  let dataSetDesc = `Normalized active energy consumption telemetry for POD ${POD}`;

  const channelStr = String(Channel);
  if (channelStr === '412' || channelStr === '2') {
    dataSetType = 'ACTIVE_ENERGY_PRODUCTION';
    dataSetDesc = `Normalized active energy production telemetry for POD ${POD}`;
  } else if (channelStr === '413' || channelStr === '1') {
    dataSetType = 'ACTIVE_ENERGY_CONSUMPTION';
    dataSetDesc = `Normalized active energy consumption telemetry for POD ${POD}`;
  }

  // 2. Format Measures array into ontology observations
  const observations = Measures.map((item, idx) => {
    let { time, value, flag } = item;

    // Normalise "24:00" to next day's 00:00 to prevent JavaScript Date parsing exceptions
    let dateStr = rawDate;
    if (time === '24:00') {
      const nextDay = new Date(Date.parse(rawDate));
      nextDay.getUTCDate(); // load
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      dateStr = nextDay.toISOString().split('T')[0];
      time = '00:00';
    }

    // Construct valid UTC ISO-8601 string (assume UTC as per D3.4 standard)
    const timestamp = `${dateStr}T${time}:00Z`;

    // Map quality flags
    const qualityStr = Number(flag) === 0 ? 'verified' : 'estimated';

    return {
      'int:TimeSeriesValue': {
        'int:timestamp': timestamp,
        'int:value': Number(value),
        'int:qualityFlag': qualityStr
      }
    };
  });

  // 3. Assemble the compliant Transport Header Envelope (D3.4 compliant)
  const normalizedEnvelope = {
    messageId: `msg-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    exchange: exchangeType,
    timestampUtc: new Date().toISOString(),
    pilotId: 'PT', // Portugal Pilot
    scenarioId: 'SCN-PT-METERING-V2',
    payload: {
      'int:DataSet': {
        'int:dataSetName': `SCN-PT-01_METERING_${dataSetType}_POD_${POD}`,
        'int:dataSetDescription': dataSetDesc,
        'int:contains': {
          'int:TimeSeries': {
            'int:measurementUnit': Unit || 'kW',
            'int:hasObservation': observations
          }
        }
      }
    }
  };

  return normalizedEnvelope;
}

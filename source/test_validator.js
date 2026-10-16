import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTransportHeader, validateOntologyPayload } from './validator.js';

const envelope = {
  messageId: 'payload-test',
  exchange: 'Metering',
  timestampUtc: '2026-10-15T10:00:00Z',
  pilotId: 'PT',
  scenarioId: 'test',
};

test('transport validation accepts object and string payloads', () => {
  for (const payload of [{ 'int:DataSet': {} }, '{"int:DataSet":{}}', 'plain text', '']) {
    assert.equal(validateTransportHeader({ ...envelope, payload }).isValid, true);
  }
});

test('transport validation rejects missing, null, and primitive payloads', () => {
  for (const payload of [undefined, null, 42, false]) {
    assert.equal(validateTransportHeader({ ...envelope, payload }).isValid, false);
  }
});

test('string payloads do not bypass required transport fields', () => {
  for (const field of Object.keys(envelope)) {
    const message = { ...envelope, payload: 'plain text' };
    delete message[field];
    assert.equal(validateTransportHeader(message).isValid, false);
  }
});

test('ontology validation handles objects and serialized objects without mutation', () => {
  const examples = {
    Metering: { 'int:DataSet': {} },
    GridSignal: { 'int:DataSet': {} },
    P2PMarketData: { 'int:Market': {} },
    DynamicGridTariff: { 'int:Tariff': {} },
    TransactionValidation: { 'int:Trade': {}, 'int:DataSet': {} },
  };
  for (const [exchange, object] of Object.entries(examples)) {
    for (const payload of [object, JSON.stringify(object, null, 2)]) {
      const message = { ...envelope, exchange, payload };
      assert.equal(validateOntologyPayload(message).isValid, true);
      assert.equal(message.payload, payload);
    }
  }
});

test('ontology validation rejects malformed JSON, non-objects, and schema mismatches', () => {
  for (const payload of ['plain text', '', 'null', '42', 'true', '[]', '"text"', null, {}]) {
    const result = validateOntologyPayload({ ...envelope, payload });
    assert.equal(result.isValid, false);
    assert.equal(typeof result.error, 'string');
  }
  assert.match(validateOntologyPayload({ ...envelope, payload: 'invalid JSON' }).error, /valid JSON/);
});
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOntologyPayload, validateTransportHeader } from './validator.js';
import { createSqsPoller, createSqsTransportEnvelope } from './sqs_subscriber.js';

function makeSqsMessage(recordId, messageId = recordId) {
  return {
    MessageId: messageId,
    ReceiptHandle: `receipt-${messageId}`,
    Body: JSON.stringify({
      POD: 'PT0002000001099462LL',
      Channel: '416',
      Unit: 'kW',
      Losses: '0',
      Date: '2025-12-27',
      Period: 'W',
      Measures: [{ time: '00:15', value: 1.144, flag: 0 }],
    }),
    MessageAttributes: {
      RecordId: { StringValue: recordId },
    },
  };
}

test('adapts one intact SQS E-REDES record to a stable validated transport envelope', () => {
  const record = {
    POD: 'PT0002000001099462LL',
    Channel: '416',
    Unit: 'kW',
    Losses: '0',
    Date: '2025-12-27',
    Period: 'W',
    Measures: [
      { time: '00:15', value: 1.144, flag: 0 },
      { time: '00:30', value: 1.136, flag: 0 },
    ],
  };
  const envelope = createSqsTransportEnvelope({
    Body: JSON.stringify(record),
    MessageAttributes: {
      RecordId: { StringValue: 'stable-record-id' },
    },
  });

  assert.equal(envelope.messageId, 'stable-record-id');
  assert.equal(envelope.transactionId, 'stable-record-id');
  assert.equal(envelope.exchange, 'Metering');
  assert.deepEqual(envelope.payload, record);
  assert.deepEqual(validateTransportHeader(envelope), { isValid: true, error: null });
  assert.deepEqual(validateOntologyPayload(envelope), { isValid: true, error: null });
});

test('rejects SQS records without the deterministic RecordId attribute', () => {
  assert.throws(
    () => createSqsTransportEnvelope({ Body: '{}' }),
    /RecordId/,
  );
});

test('deletes an SQS message only after the API message handler acknowledges it', async () => {
  const commands = [];
  const client = {
    async send(command) {
      commands.push(command.constructor.name);
      if (command.constructor.name === 'ReceiveMessageCommand') {
        return { Messages: [makeSqsMessage('record-1')] };
      }
      return {};
    },
  };
  const poller = createSqsPoller({ queueUrl: 'queue-url' }, async (envelope) => {
    assert.equal(envelope.messageId, 'record-1');
    return 'ack';
  }, client);

  await poller.pollOnce();

  assert.deepEqual(commands, ['ReceiveMessageCommand', 'DeleteMessageCommand']);
});

test('retains a failed FIFO message and does not process later messages in its batch', async () => {
  const commands = [];
  const processedIds = [];
  const client = {
    async send(command) {
      commands.push(command.constructor.name);
      if (command.constructor.name === 'ReceiveMessageCommand') {
        return {
          Messages: [makeSqsMessage('record-1'), makeSqsMessage('record-2')],
        };
      }
      return {};
    },
  };
  const poller = createSqsPoller({ queueUrl: 'queue-url' }, async (envelope) => {
    processedIds.push(envelope.messageId);
    return 'retry';
  }, client);

  await poller.pollOnce();

  assert.deepEqual(processedIds, ['record-1']);
  assert.deepEqual(commands, ['ReceiveMessageCommand']);
});
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { adaptERedesMetering } from './adapter.js';

function getStringAttribute(attributes, name) {
  const value = attributes?.[name]?.StringValue ?? attributes?.[name]?.stringValue;
  return typeof value === 'string' ? value : undefined;
}

export function createSqsTransportEnvelope(sqsMessage, adapterOptions = {}) {
  const recordId = getStringAttribute(sqsMessage.MessageAttributes, 'RecordId');
  if (!recordId) {
    throw new Error('SQS message is missing the RecordId message attribute');
  }

  const rawRecord = JSON.parse(sqsMessage.Body || '');
  if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
    throw new Error('SQS message body must contain one E-REDES JSON object');
  }

  return {
    ...adaptERedesMetering(rawRecord, { ...adapterOptions, messageId: recordId }),
    transactionId: recordId,
  };
}

export function createSqsPoller(settings, processEnvelope, client = new SQSClient({ region: settings.region })) {
  if (!settings.queueUrl) throw new Error('SQS_QUEUE_URL is required when SQS processing is enabled');

  let running = false;
  let activeReceiveController;
  let pollingPromise;

  async function pollOnce(signal) {
    const command = new ReceiveMessageCommand({
      QueueUrl: settings.queueUrl,
      MaxNumberOfMessages: settings.maxMessages,
      WaitTimeSeconds: settings.waitTimeSeconds,
      VisibilityTimeout: settings.visibilityTimeoutSeconds,
      MessageAttributeNames: ['All'],
    });
    const response = await client.send(command, signal ? { abortSignal: signal } : undefined);
    const messages = response.Messages || [];

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      try {
        const envelope = createSqsTransportEnvelope(message, settings.adapterOptions);
        const disposition = await processEnvelope(envelope);
        if (disposition !== 'ack') {
          console.warn(`[SQS Subscriber] Retrying message ${message.MessageId} after processing failure.`);
          break;
        }

        await client.send(new DeleteMessageCommand({
          QueueUrl: settings.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
        console.log(`[SQS Subscriber] Deleted processed message ${message.MessageId}.`);
      } catch (error) {
        console.error(`[SQS Subscriber] Failed message ${message.MessageId}: ${error.message}`);
        break;
      }
    }

    return messages.length;
  }

  async function poll() {
    while (running) {
      activeReceiveController = new AbortController();

      try {
        await pollOnce(activeReceiveController.signal);
      } catch (error) {
        if (!running) break;
        console.error(`[SQS Subscriber] Receive failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, settings.errorBackoffMs));
      }
    }
  }

  return {
    pollOnce: () => pollOnce(),
    start() {
      if (running) return pollingPromise;
      running = true;
      pollingPromise = poll();
      return pollingPromise;
    },
    async stop() {
      running = false;
      activeReceiveController?.abort();
      await pollingPromise;
    },
  };
}
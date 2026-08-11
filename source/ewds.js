const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function buildMessagesUrl(baseUrl, messagesPath) {
  if (!baseUrl) {
    throw new Error('EWDS base URL is required');
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = messagesPath.startsWith('/') ? messagesPath : `/${messagesPath}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function buildTopicQueryParams(topic, fromIso, amount, defaultFqcn) {
  const params = new URLSearchParams();
  const fqcn = topic.fqcn || defaultFqcn;
  if (!fqcn) {
    throw new Error('EWDS topic is missing required fqcn');
  }

  params.set('fqcn', fqcn);
  params.set('topicOwner', topic.owner);
  params.set('topicName', topic.name);
  params.set('clientId', topic.clientId);
  params.set('from', fromIso);
  params.set('amount', String(amount));
  return params;
}

function extractTopicVersion(messageCandidate) {
  if (!isObject(messageCandidate)) return null;
  if (typeof messageCandidate.topicVersion === 'string') return messageCandidate.topicVersion;
  if (isObject(messageCandidate.message) && typeof messageCandidate.message.topicVersion === 'string') {
    return messageCandidate.message.topicVersion;
  }
  return null;
}

function matchesRequestedVersion(messageCandidate, requestedVersion) {
  if (!requestedVersion) return true;
  const candidateVersion = extractTopicVersion(messageCandidate);
  if (!candidateVersion) return true;
  return candidateVersion === requestedVersion;
}

function extractMessages(responseBody) {
  if (Array.isArray(responseBody)) return responseBody;
  if (!isObject(responseBody)) return [];
  if (Array.isArray(responseBody.messages)) return responseBody.messages;
  if (isObject(responseBody.data) && Array.isArray(responseBody.data.messages)) return responseBody.data.messages;
  if (Array.isArray(responseBody.data)) return responseBody.data;
  return [];
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeEnvelope(messageCandidate) {
  if (!messageCandidate) return null;

  if (isObject(messageCandidate) && isObject(messageCandidate.message)) {
    return messageCandidate.message;
  }

  if (isObject(messageCandidate)) {
    if (typeof messageCandidate.payload === 'string') {
      const parsedPayload = parseMaybeJson(messageCandidate.payload);
      if (isObject(parsedPayload)) {
        return {
          ...messageCandidate,
          payload: parsedPayload,
        };
      }
    }

    return messageCandidate;
  }

  if (typeof messageCandidate === 'string') {
    const parsedCandidate = parseMaybeJson(messageCandidate);
    if (isObject(parsedCandidate)) return parsedCandidate;
  }

  return null;
}

async function fetchTopicMessages({ messagesUrl, topic, fromIso, amount, defaultFqcn, apiKey, requestTimeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  const queryParams = buildTopicQueryParams(topic, fromIso, amount, defaultFqcn);
  const requestUrl = `${messagesUrl}?${queryParams.toString()}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      signal: controller.signal,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const responseBody = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        error: `EWDS GET failed with HTTP ${response.status}`,
        responseBody,
        topic,
      };
    }

    const rawMessages = extractMessages(responseBody);
    const messages = rawMessages
      .filter((candidate) => matchesRequestedVersion(candidate, topic.version))
      .map((candidate) => normalizeEnvelope(candidate))
      .filter((candidate) => isObject(candidate));

    return {
      ok: true,
      statusCode: response.status,
      topic,
      messages,
      rawCount: rawMessages.length,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      error: error.name === 'AbortError' ? 'EWDS GET request timed out' : error.message,
      topic,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createEwdsPoller(ewdsConfig, onEnvelope) {
  const messagesUrl = buildMessagesUrl(ewdsConfig.baseUrl, ewdsConfig.messagesPath);
  let lastPollEndIso = null;
  let pollInFlight = false;

  async function runOnce() {
    if (pollInFlight) {
      console.warn('[EWDS] Previous polling cycle is still running. Skipping overlap cycle.');
      return;
    }

    pollInFlight = true;
    const pollEndIso = new Date().toISOString();
    const pollStartIso = lastPollEndIso || new Date(Date.now() - ewdsConfig.lookbackMs).toISOString();

    try {
      for (const topic of ewdsConfig.topics) {
        const result = await fetchTopicMessages({
          messagesUrl,
          topic,
          fromIso: pollStartIso,
          amount: ewdsConfig.fetchAmount,
          defaultFqcn: ewdsConfig.fqcn,
          apiKey: ewdsConfig.apiKey,
          requestTimeoutMs: ewdsConfig.requestTimeoutMs,
        });

        if (!result.ok) {
          console.error(`[EWDS] Failed to fetch topic owner=${topic.owner}, name=${topic.name}, clientId=${topic.clientId}, version=${topic.version}. ${result.error}`);
          continue;
        }

        console.log(`[EWDS] Fetched ${result.messages.length} message envelope(s) from topic owner=${topic.owner}, name=${topic.name}, clientId=${topic.clientId}, version=${topic.version} in window ${pollStartIso} -> ${pollEndIso}.`);

        for (const envelope of result.messages) {
          await onEnvelope(envelope, topic, {
            from: pollStartIso,
            to: pollEndIso,
            fetchedAt: pollEndIso,
          });
        }
      }

      lastPollEndIso = pollEndIso;
    } finally {
      pollInFlight = false;
    }
  }

  return {
    runOnce,
    schedule() {
      const intervalHandle = setInterval(() => {
        runOnce().catch((error) => {
          console.error(`[EWDS] Polling cycle failed with unexpected error: ${error.message}`);
        });
      }, ewdsConfig.pollIntervalMs);

      return () => clearInterval(intervalHandle);
    },
  };
}

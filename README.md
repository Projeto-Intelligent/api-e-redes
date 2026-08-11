# INTELLIGENT Grid Operator Middleware V2

Welcome to the **INTELLIGENT Grid Operator Middleware (Version 2)** documentation. 

This repository contains the Node.js implementation of the Grid Operator Middleware designed under **WP3 - Data integration and interoperability infrastructure (Task 3.3)**. The middleware acts as a decoupled interoperability layer connecting Distribution System Operator (DSO) internal systems with decentralized market and optimization platforms like GSY DEX and FOS.

---

## 📂 Documentation Directory Structure

To help you navigate the system architecture, message schemas, and specifications, the following documentation files have been prepared:

*   [doc/architecture.md](doc/architecture.md): Covers high-level system architecture, GCP Pub/Sub Pull mechanics, event-driven data flow, and the target integration with the Energy Web Digital Spine (EWDS).
*   [doc/api_specification.md](doc/api_specification.md): Details the 5 Exchange Discriminators, transport header contracts, payload structures, and concrete JSON examples.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **Google Cloud SDK**: Properly authenticated with permission to access Pub/Sub subscriptions.

### 2. Installation
Navigate to the `source` folder and install dependencies:
```bash
cd source
npm install
```

### 3. Configuration
Configure the middleware by creating a `.env` file in the `source` directory (or export environment variables directly):

| Env Variable | Description | Default |
| :--- | :--- | :--- |
| `GCP_PROJECT_ID` | Your GCP Project ID | `intelligent-grid-operator` |
| `GCP_SUBSCRIPTION_NAME` | GCP Pub/Sub Pull Subscription Name | `grid-operator-sub-v2` |
| `GCP_AUDIT_LOG_TOPIC` | Pub/Sub topic for audit records | `store_data` |
| `FLOW_CONTROL_MAX_MESSAGES` | Max concurrent messages pulled | `100` |
| `ACK_DEADLINE_SECONDS` | Message ACK deadline in seconds | `60` |
| `ENDPOINT` | Downstream gateway endpoint URL | `https://api.intelligent-pilot.eu/api/v2/messages` |
| `ENDPOINT_API_KEY` | API key sent in `x-api-key` | `api-key-secure-v2` |
| `PUBSUB_ENABLED` | Enable GCP Pub/Sub subscriber mode | `true` |
| `PUBLISH_AUDIT_EVENT` | Enable audit publishing to Pub/Sub | `false` |
| `HTTP_LISTENER_ENABLED` | Enable HTTP listener mode | `true` |
| `HTTP_LISTENER_PORT` | HTTP listener port | `8080` |
| `HTTP_LISTENER_PATH` | HTTP listener path | `/message` |
| `EWDS_ENABLED` | Enable EWDS ingestion by polling `GET /api/v2/messages` | `false` |
| `EWDS_PROXY_ENABLED` | Expose local proxy endpoint that forwards `GET` requests to EWDS CGW | `false` |
| `EWDS_PROXY_PATH` | Local HTTP path for EWDS GET proxy endpoint | `/ewds/messages` |
| `EWDS_BASE_URL` | EWDS CGW base URL for ingestion calls | `https://api.intelligent-pilot.eu` |
| `EWDS_MESSAGES_PATH` | EWDS message endpoint path | `/api/v2/messages` |
| `EWDS_API_KEY` | API key used for EWDS GET requests | Falls back to `ENDPOINT_API_KEY` |
| `EWDS_POLL_INTERVAL_MS` | Polling interval for EWDS ingestion | `60000` |
| `EWDS_LOOKBACK_MS` | Time window length for each EWDS fetch | `300000` |
| `EWDS_FETCH_AMOUNT` | Max number of messages fetched per EWDS GET request | `200` |
| `EWDS_REQUEST_TIMEOUT_MS` | Timeout for each EWDS GET request | `15000` |
| `EWDS_VALIDATE_FETCHED_MESSAGES` | Validate transport header + ontology for messages fetched via EWDS GET polling | `true` |
| `EWDS_FQCN` | Required `fqcn` sent to `GET /api/v2/messages` | _(unset)_ |
| `EWDS_FORWARD_FETCHED_MESSAGES` | Forward ingested EWDS messages to downstream router | `false` |
| `EWDS_TOPIC_OWNER` | Single-topic owner for EWDS GET filter | _(unset)_ |
| `EWDS_TOPIC_NAME` | Single-topic name for EWDS GET filter | _(unset)_ |
| `EWDS_CLIENT_ID` | Single-topic clientId for EWDS GET filter | _(unset)_ |
| `EWDS_TOPIC_VERSION` | Optional single-topic version used for local post-fetch filtering | _(unset)_ |
| `EWDS_TOPICS` | Multi-topic JSON array with required `owner`, `name`, `clientId` and optional `version`, `fqcn` (overrides single-topic fields) | `[]` |

### 4. EWDS GET Usage
The service supports two ways of retrieving EWDS messages:

- **On-demand proxy GET**: your client calls this service, and the service forwards to EWDS CGW.
- **Automatic polling**: the service fetches from EWDS CGW periodically in the background.

To enable each mode:

- `EWDS_PROXY_ENABLED=true` for on-demand proxy GET.
- `EWDS_ENABLED=true` for background polling.

#### Polling without forwarding (read-only)
To keep polling active while ensuring messages are **not** re-sent to downstream gateways, use:

- `EWDS_ENABLED=true`
- `EWDS_VALIDATE_FETCHED_MESSAGES=false`
- `EWDS_FORWARD_FETCHED_MESSAGES=false`
- `PUBLISH_AUDIT_EVENT=false`

Recommended optional setting when you only want automated background fetches:

- `EWDS_PROXY_ENABLED=false`

With this setup, the middleware fetches messages from EWDS without forwarding and without publishing audit events to Pub/Sub topics.

#### Manual GET through local proxy endpoint
When the HTTP listener is enabled, call:

```bash
curl -G "http://localhost:8080/ewds/messages" \
	-H "x-api-key: <LOCAL_API_KEY_IF_APPLICABLE>" \
	--data-urlencode "fqcn=helloworld.sub" \
	--data-urlencode "topicName=helloWorld" \
	--data-urlencode "topicOwner=integration.apps.intelligent.auth.ewc" \
	--data-urlencode "clientId=intelligent-ew-client" \
	--data-urlencode "amount=10"
```

Supported GET query parameters for manual calls (`/api/v2/messages` schema):

- `fqcn` (required)
- `from`
- `amount`
- `topicName`
- `topicOwner`
- `clientId`
- `initiatingMessageId`
- `initiatingTransactionId`
- `transactionId`
- `messageId`
- `messageIds`

If `topicName`, `topicOwner`, or `clientId` are omitted, the proxy falls back to the first configured EWDS topic. If `fqcn` is omitted, the proxy uses `EWDS_FQCN`; if neither is set, it returns `400`.

#### Multi-topic behavior
EWDS `GET /api/v2/messages` fetches one topic per request. For multiple topics, the middleware executes one GET per configured topic in sequence during each polling cycle.

### 5. Running the Middleware
Start the runtime (supports HTTP listener and/or Pub/Sub mode according to env flags):
```bash
npm run start
```

### 6. Running Performance & Compliance Tests
Execute the adapter and performance/compliance tests:
```bash
npm run test
```

---

## ☁️ GCP Infrastructure & Deployment

The middleware's deployment components are managed inside the **`deploy`** root directory. The subscriber is deployed as an always-on **Google Cloud Run V2 Service** with dedicated background CPU allocation (`cpu_idle_avoidance = true`), maintaining active connections to pull messages from GCP Pub/Sub in real-time.

### 1. Configure Components
The service and all dependent resource components are named and configured in **[deploy/terraform.tfvars](deploy/terraform.tfvars)**:
```hcl
# GCP target parameters
project_id             = "intelligent-grid-operator"
region                 = "europe-west1"

# Service and resource configurations
cloud_run_service_name = "grid-operator-middleware-v2"
pubsub_subscription_name = "grid-operator-sub-v2"
pubsub_audit_topic_name  = "store_data"
```

### 2. Run the Deployment
A fully automated shell script is provided to compile your local Node.js context, push it to Google Artifact Registry, and provision all infrastructure using Terraform:
```bash
cd deploy
./deploy.sh
```

---

## 🛠️ Technology Stack
- **Runtime**: Node.js (v18+) with native ES Modules (ESM).
- **GCP Services**: Cloud Pub/Sub, Cloud Run / App Engine (deployment environment).
- **Communication**: HTTP/1.1 & HTTP/2 via native Node.js `fetch` (zero-dependency HTTP forwarding).

## 📄 License

This project is licensed under the **Apache License, Version 2.0**.

Additional terms applicable to this repository are provided in **E-REDES-LICENSE.md**.

By using, modifying or redistributing this software, you agree to comply with both the Apache License 2.0 and the supplementary terms contained in the E-REDES License Agreement.

For more information, see:

- `LICENSE`
- `E-REDES-LICENSE.md`

# INTELLIGENT Grid Operator Middleware V2

Welcome to the **INTELLIGENT Grid Operator Middleware (Version 2)** documentation. 

This repository contains the Node.js implementation of the Grid Operator Middleware designed under **WP3 - Data integration and interoperability infrastructure (Task 3.3)**. The middleware acts as a decoupled interoperability layer connecting Distribution System Operator (DSO) internal systems with decentralized market and optimization platforms like GSY DEX and FOS.

---

## 📂 Documentation Directory Structure

To help you navigate the system architecture, message schemas, and specifications, the following documentation files have been prepared:

*   [architecture.md](file:///home/nandrade/projects/edp/eu/api/doc/architecture.md): Covers high-level system architecture, GCP Pub/Sub Pull mechanics, event-driven data flow, and integration with the Energy Web Digital Spine (EWDS).
*   [api_specification.md](file:///home/nandrade/projects/edp/eu/api/doc/api_specification.md): Details the 5 Exchange Discriminators, transport header contracts, ontology-aligned payload structures (D3.1 compliant), and concrete JSON examples.

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
| `GCP_AUDIT_LOG_TOPIC` | Pub/Sub Topic for Audit Logs (BigQuery) | `store_data` |
| `FLOW_CONTROL_MAX_MESSAGES` | Max concurrent messages pulled | `100` |
| `ACK_DEADLINE_SECONDS` | Message ACK deadline in seconds | `60` |

### 4. Running the Middleware
Start the Pub/Sub listener:
```bash
npm run start
```

### 5. Running Performance & Compliance Tests
Execute the simulated stress and schema-compliance test:
```bash
npm run test:perf
```

---

## ☁️ GCP Infrastructure & Deployment

The middleware's deployment components are managed inside the **`deploy`** root directory. The subscriber is deployed as an always-on **Google Cloud Run V2 Service** with dedicated background CPU allocation (`cpu_idle_avoidance = true`), maintaining active connections to pull messages from GCP Pub/Sub in real-time.

### 1. Configure Components
The service and all dependent resource components are named and configured in the **[deploy/terraform.tfvars](file:///home/nandrade/projects/edp/eu/api/deploy/terraform.tfvars)** file:
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

# API Specification & Message Schemas

This document defines the technical contracts, transport envelopes, and domain-specific ontology structures (INTELLIGENT D3.1 compliant) processed by the **Grid Operator Middleware V2**.

---

## ✉️ Cross-Domain Message Structure

All messages follow a strict two-layer architecture, separating transport-level metadata from semantic domain content.

### 1. Transport Header Envelope
The outer envelope provides the middleware and EWDS with routing, tracing, and classification metadata:

```json
{
  "messageId": "UUID string (globally unique)",
  "exchange": "Exchange Discriminator (defines the domain)",
  "timestampUtc": "ISO 8601 UTC timestamp",
  "pilotId": "Pilot country identifier (PT, CH, IE)",
  "scenarioId": "Simulation scenario identifier (e.g. SCN-PT-01)",
  "payload": {
    "Domain-Specific Payload Object"
  }
}
```

---

## 🔀 Exchange Discriminator Mapping

The `exchange` attribute is a mandatory field. The middleware validates this string and routes the message payload based on the following mapping:

| Exchange Discriminator | Description | Core Payload Ontologies |
| :--- | :--- | :--- |
| `Metering` | Raw connection-point telemetry | `int:DataSet` containing `int:TimeSeries` |
| `GridSignal` | Grid status and flex needs | `int:DataSet` (Traffic-light status / kW need) |
| `P2PMarketData` | Decentralized energy market orders | `int:Market`, `int:Order`, `int:Trade`, `int:Actor` |
| `DynamicGridTariff` | Dynamic and TOU tariffs | `int:Tariff`, `int:GridFeeModel` |
| `TransactionValidation` | Grid-constraint assessment | `int:Trade`, `int:DataSet` (Valid/Invalid check) |

---

## 📋 Exchange Domain Specifications

### A. Metering Data (`Metering`)
- **Scope**: Raw, non-aggregated active energy consumption, active energy production, and active power telemetry.
- **Resolution**: 15-minute periods, supplied on a **D+1** availability basis.

### B. Grid Market Signals (`GridSignal`)
Communicates grid conditions and localized flexibility requirements.
- **Grid Status**: Traffic lights encoded numerically:
  - `0` = **GREEN** (Normal)
  - `1` = **YELLOW** (Congestion Warning)
  - `2` = **RED** (Active Grid Constraint / Violation)
- **Flexibility Procurement**: Expressed as requested power in kilowatts (**kW**).

#### Grid Status Example Payload:
```json
{
  "messageId": "8c6c2e64-2b8a-4b4c-9d9c-7b3e5b0d7e2a",
  "exchange": "GridSignal",
  "timestampUtc": "2026-03-27T18:00:00Z",
  "pilotId": "PT",
  "scenarioId": "SCN-PT-01",
  "payload": {
    "int:DataSet": {
      "int:dataSetName": "SCN-PT-01_GRID_STATUS_FEEDER_PT-FEEDER-012",
      "int:dataSetDescription": "Synthetic traffic-light grid status. Encoding: 0=GREEN, 1=YELLOW, 2=RED.",
      "int:contains": {
        "int:TimeSeries": {
          "int:hasObservation": [
            { "int:TimeSeriesValue": { "int:timestamp": "2026-03-28T00:00:00Z", "int:value": 0 } },
            { "int:TimeSeriesValue": { "int:timestamp": "2026-03-28T00:30:00Z", "int:value": 1 } },
            { "int:TimeSeriesValue": { "int:timestamp": "2026-03-28T01:00:00Z", "int:value": 2 } }
          ]
        }
      }
    }
  }
}
```

---

### C. P2P Market Data (`P2PMarketData`)
Ingests bids, offers, cleared trades, and participant registries from **GSY DEX**.

#### Market Bid Example Payload:
```json
{
  "messageId": "1a6a7b3c-8bcb-4d8b-b8d7-0c7c5f1c8b3e",
  "exchange": "P2PMarketData",
  "timestampUtc": "2026-03-27T18:05:00Z",
  "pilotId": "IE",
  "scenarioId": "SCN-IE-01",
  "payload": {
    "int:Order": {
      "int:orderId": "ORDER-IE-0001",
      "int:orderType": "bid",
      "int:quantity": 2.5,
      "int:priceLimit": 0.22,
      "int:timeSlot": "2026-03-28T10:00:00Z",
      "int:marketId": "DEX-SPOT-0001",
      "int:createdBy": {
        "int:Actor": { "int:actorName": "PARTY-IE-0007", "int:actorType": "Prosumer" }
      }
    }
  }
}
```

---

### D. Dynamic Grid Tariff Models (`DynamicGridTariff`)
Exposes non-binding grid tariff reference models to align market behavior with grid conditions.
- **Static / Time-of-Use (TOU)**: Represented via `int:Tariff`.
- **Dynamic Fee Logic**: Parameterized formula representations via `int:GridFeeModel`.

#### Time-of-Use Tariff Example:
```json
{
  "messageId": "5a4d4c6d-1d5d-4a3b-9b62-9dfb1e6c2c88",
  "exchange": "DynamicGridTariff",
  "timestampUtc": "2026-03-27T18:10:00Z",
  "pilotId": "PT",
  "scenarioId": "SCN-PT-TAR-01",
  "payload": {
    "int:Tariff": {
      "int:tariffName": "TAR-PT-TOU-001",
      "int:tariffStructure": "time-of-use",
      "int:currency": "EUR",
      "int:gridFee": 0.0
    },
    "int:DataSet": {
      "int:dataSetName": "TAR-PT-TOU-001_GRIDFEE_REF_TS",
      "int:dataSetDescription": "Synthetic TOU grid-fee reference time series (EUR/kWh).",
      "int:contains": {
        "int:TimeSeries": {
          "int:hasObservation": [
            { "int:TimeSeriesValue": { "int:timestamp": "2026-03-28T00:00:00Z", "int:value": 0.030 } },
            { "int:TimeSeriesValue": { "int:timestamp": "2026-03-28T18:00:00Z", "int:value": 0.060 } }
          ]
        }
      }
    }
  }
}
```

---

### E. Transaction Validation (`TransactionValidation`)
Exposes constraints (e.g. thermal limits, voltage bands) assessment results evaluated by the DSO simulation tools.
- **Outcome Code**:
  - `0` = **VALID** (Feasible under current grid conditions)
  - `1` = **INVALID** (Grid constraint violation detected)

#### Invalid Transaction Outcome (Thermal Limit Exceeded):
```json
{
  "messageId": "4c3b2a1f-0e9d-4f7a-8b6c-5d4e3f2a1b0c",
  "exchange": "TransactionValidation",
  "timestampUtc": "2026-03-27T18:20:10Z",
  "pilotId": "CH",
  "scenarioId": "SCN-CH-VAL-02",
  "payload": {
    "int:Trade": {
      "int:tradeId": "TRADE-CH-20260328-0012",
      "int:tradeQuantity": 3.5,
      "int:tradePrice": 0.24,
      "int:tradeTimestamp": "2026-03-27T18:06:00Z",
      "int:timeSlot": "2026-03-28T16:15:00Z",
      "int:marketId": "DEX-SPOT-0001",
      "int:buyer": { "int:Actor": { "int:actorName": "PARTY-CH-0009", "int:actorType": "Prosumer" } },
      "int:seller": { "int:Actor": { "int:actorName": "PARTY-CH-0004", "int:actorType": "Prosumer" } }
    },
    "int:DataSet": {
      "int:dataSetName": "SCN-CH-VAL-02_RESULT_TRADE-CH-20260328-0012",
      "int:dataSetDescription": "Synthetic validation result. outcomeEncoding: 0=VALID, 1=INVALID. Reason: thermalLimitExceeded.",
      "int:contains": {
        "int:TimeSeries": {
          "int:hasObservation": [
            { "int:TimeSeriesValue": { "int:timestamp": "2026-03-28T16:15:00Z", "int:value": 1 } }
          ]
        }
      }
    },
    "metrics": {
      "maxLoadingPercent": 112.0,
      "minVoltagePu": 0.95
    }
  }
}
```

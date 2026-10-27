# Angular Operations Dashboard (`frontend-admin`)

A dedicated operations, system telemetry, and job pipeline console built with Angular 18 for platform operators and recruiters.

> **Role in Seekers Platform:** Part of the Seekers polyglot microservices platform. Provides operational visibility over crawling connectors, ingestion throughput, queue lag, and catalog health. Preserved as a standalone Angular portfolio application adhering to the Seekers Design System.

---

## 1. Primary Technology Stack

- **Framework:** Angular 18 (NgModule architecture, SCSS styling, TypeScript 5.5)
- **Design Tokens:** SCSS variables matching `docs/DESIGN_SYSTEM.md` (Charcoal & Amber palette)
- **State Management & Streaming:** RxJS 7.8 (`BehaviorSubject`, `Observable`, `interval`)
- **Real-Time Transport:** Socket.io-client 4.8 with automated fallback to synthetic streaming adapter
- **Build Tool:** Angular CLI 18.2 (`@angular-devkit/build-angular`)
- **Production Server:** Nginx Alpine reverse proxy

---

## 2. Architecture & Operations Shell

```
                +--------------------------------------+
                |  Angular Operations Dashboard        |
                |  (Port 4200 dev / Port 80 container) |
                +-------------------+------------------+
                                    |
          +-------------------------+-------------------------+
          | (Interactive Simulation Toolbar)                  | (Real-Time Telemetry)
          v                                                   v
   +--------------+  +---------------+  +--------------+  +---------------+
   | Crawl Burst  |  | Pause/Resume  |  | Disconnect   |  | Ingest Stream |
   | (+5 Events)  |  | Stream State  |  | Test Banner  |  | Audit Table   |
   +--------------+  +---------------+  +--------------+  +---------------+
```

### Key UI Features

- **Pipeline Telemetry Cards:** Displays real-time metrics for Active Connectors (`4/5 Healthy`), Ingestion Throughput (`142 jobs/hr`), Processing Latency (`18ms`), and Dead Letter Queue (`0 errors`).
- **Crawler Source Connectors Table:** Real-time status for 5 regional sources (`bdjobs`, `linkedin-bd`, `chaldal-careers`, `pathao-careers`, `glassdoor-bd`) with target geography, last ingested timestamp, collected job counter, and pause/resume controls.
- **Real-Time Ingestion Audit Stream:** Filterable table of incoming job events with search query, source dropdown filter, processing duration, and an "Inspect JSON ↗" modal showing raw event payloads (`job.ingested.v1.schema.json`).
- **Interactive Simulator Toolbar:**
  - `⚡ Crawl Burst (+5)`: Injects 5 simulated newly crawled jobs into the stream.
  - `⏸ / ▶ Pause/Resume`: Pauses or resumes periodic stream injection.
  - `Test Offline`: Simulates network failure with reconnection banner and countdown.
  - `🔄 Reset`: Resets metrics and telemetry to deterministic baseline.

---

## 3. Design System & Accessibility

- **Theme:** Deep charcoal background (`#090d16`), elevated slate cards (`#0f172a`), and restrained amber accents (`#f59e0b`).
- **Typography:** Sora for dashboard section headers, Plus Jakarta Sans for UI labels, and JetBrains Mono for telemetry/payloads.
- **Responsive Viewports:** Validated across mobile (`360px`), tablet (`768px`), and desktop (`1280px+`) with zero horizontal overflow.
- **Accessibility:** High-contrast status badges (`HEALTHY` emerald, `DEGRADED` amber, `PAUSED` slate), visible `:focus-visible` rings, and full keyboard dismissible modals.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x or 22.x
- npm 10.x+

### Running Locally

```bash
cd frontend-admin
npm install

# Start local development server with hot-reload:
npm start

# Or build and serve optimized production bundle:
npm run build
npx serve -s dist/frontend-admin/browser -l 4200

# Navigate to: http://localhost:4200
```

### Running Validation Checks

```bash
npm run build
```

---

## 5. Standalone Demonstration Mode

- **Autonomous Simulation:** Automatically generates realistic periodic ingestion events in the browser without requiring live Kafka, MongoDB, or Go scraper containers.
- **Truthful Labelling:** Explicit header pill indicating `Standalone Demo Mode` and system envelope metadata card confirming the $0 free-tier profile and synthetic provenance.

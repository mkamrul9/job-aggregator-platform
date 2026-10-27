# Angular Operations Dashboard (`frontend-admin`)

A dedicated operations, system telemetry, and job moderation console built with Angular for platform operators and recruiters.

> **Role in Seekers Platform:** Part of the Seekers polyglot microservices platform. This frontend consumes live ingestion events streamed from `service-notification` via WebSockets (Socket.io) and provides operational monitoring over scraping pipelines, throughput metrics, and catalog health.

---

## 1. Primary Technology Stack

- **Framework:** Angular 18 (Standalone modules, SCSS styling, TypeScript 5.4)
- **State Management & Streaming:** RxJS 7.8 (`BehaviorSubject`, `Observable`)
- **Real-Time Transport:** Socket.io-client 4.7
- **Build Tool:** Angular CLI 18.2 (`@angular-devkit/build-angular`)
- **Production Server:** Nginx Alpine reverse proxy

---

## 2. Architecture & Interfaces

The admin frontend connects to the platform's notification and metric streams:

```
               +--------------------------------------+
               |  Angular Operations Dashboard        |
               |  (Port 4200 dev / Port 80 container) |
               +-------------------+------------------+
                                   |
         +-------------------------+-------------------------+
         | (Socket.io WebSocket)                             | (REST API)
         v                                                   v
  +--------------+                                    +--------------+
  | Notification |                                    | API Gateway  |
  | Service :4000|                                    | (Nginx :80)  |
  +--------------+                                    +--------------+
```

### Key UI Features

- **Live Job Ingestion Feed:** Displays incoming jobs scraped in real time with company, title, and timestamp.
- **System Health & Metrics:** Operational panels for tracking ingestion throughput and worker health.
- **Moderation Console:** Review incoming listings, flag source anomalies, and inspect raw payloads.

---

## 3. Current Capabilities & Baseline Status

- **Production Build (`npm run build`):** `[Verified]` — compiles successfully to production bundle in `dist/frontend-admin`.
- **Development Server (`npm start`):** `[Verified]` — serves locally at `http://localhost:4200`.
- **Live Feed Service (`live-feed.service.ts`):** Implements `RxJS BehaviorSubject` connected to Socket.io `live-job-feed` topic.
- **Known Limitations:**
  - Hardcoded to connect to `http://localhost:4000` directly rather than through an environment-aware gateway route.
  - Header, sidebar, and metric panels currently contain static placeholder figures.
  - In Docker Compose, the service was historically commented out and requires container network wiring.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x (or LTS)
- npm 10.x+

### Installation

```bash
cd frontend-admin
npm install
```

### Configuration

Copy the example environment configuration:
```bash
cp .env.example .env
```
Key configuration settings (see `.env.example`):
- `NG_APP_SOCKET_URL`: Socket.io endpoint (default: `http://localhost:4000`)
- `NG_APP_API_URL`: Backend REST API URL (default: `http://localhost:80`)
- `NG_APP_DEMO_MODE`: Toggle standalone synthetic demo mode (Phase P12)

### Running Locally

```bash
# Start local development server with hot-reload:
npm start

# Navigate to: http://localhost:4200
```

### Building for Production

```bash
npm run build
# Outputs optimized production assets to dist/frontend-admin/browser
```

---

## 5. Planned Standalone Demonstration (Phase P12)

In Phase P12, this Angular application will feature an independent demonstration mode:
- **Synthetic Live Stream:** Generates simulated high-velocity job ingestion events directly in the browser so recruiters can evaluate the Angular dashboard without operating Kafka, Elasticsearch, or Go scrapers.
- **Drill-down Workflows:** Interactive filters, category counters, and latency distribution charts powered by mock telemetry.
- **Clear Mode Badges:** Prominent indicators distinguishing synthetic demonstration data from live cluster mode.

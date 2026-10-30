# Seekers Operations Console (`frontend-admin`)

A responsive administrative operations console, pipeline telemetry dashboard, and job catalog moderation application built with Angular 19 for platform operators and recruiters.

> **Role in Seekers Platform:** Part of the Seekers polyglot microservices platform. Provides operational control and visibility over crawling source connectors, Kafka consumer lag, dead-letter quarantine (DLQ), deduplication clusters, candidate support reports, and catalog reindexing. Preserved as an independent, fully interactive Angular portfolio demonstration adhering to the Seekers Design System.

---

## 1. Primary Technology Stack & Toolchain

- **Framework:** Angular 19 (NgModule architecture, SCSS styling, TypeScript 5.5, RxJS 7.8)
- **Styling & Design Tokens:** TailwindCSS 3.4 & custom SCSS matching `docs/DESIGN_SYSTEM.md` (Deep Charcoal `#090d16` & Amber `#f59e0b` palette)
- **State Management & Telemetry:** Reactive RxJS subjects (`BehaviorSubject`, `Observable`, `forkJoin`, `switchMap`)
- **Dual Adapter Architecture:** Clean abstraction separating `DemoOperationsAdapter` (synthetic simulation) and `LiveOperationsAdapter` (authenticated HTTP gateway & WebSocket) behind a unified `OperationsAdapter` interface
- **Testing:** Karma 6.4 + Jasmine 5.2 running on headless Chrome (`npm run test:ci`) with 58 automated tests covering all components, adapters, and guards
- **Production Server:** Nginx Alpine reverse proxy supporting both root (`/`) and gateway subpath (`/admin/`) deep-link routing

---

## 2. Dual Operations Mode Architecture

```
                  +----------------------------------------------+
                  |         Seekers Operations Console           |
                  |         (Angular 18 Operations Shell)        |
                  +-----------------------+----------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
                      v                                       v
         +-------------------------+             +-------------------------+
         |  DemoOperationsAdapter  |             |  LiveOperationsAdapter  |
         |  (In-Memory Simulation) |             |  (Authenticated Fleet)  |
         +-------------------------+             +-------------------------+
         | • Zero backend fleet    |             | • Nginx API Gateway     |
         | • Zero Firebase secrets |             | • /api/v1/jobs & admin  |
         | • Interactive bursts    |             | • /api/v1/admin/reports |
         | • Deterministic resets  |             | • Role-guarded Bearer   |
         +-------------------------+             +-------------------------+
```

### Standalone Demonstration Mode (Portfolio Ready)
- **Zero-Dependency Startup:** Runs entirely in the browser with zero backend services, zero Kafka brokers, zero MongoDB instances, and zero external network calls.
- **Realistic Ecosystem Simulation:** Preloaded with deterministic data representing Bangladesh tech employers (bKash, Pathao, Chaldal, ShopUp, Brain Station 23, Optimizely Dhaka, Therap BD, Walton Digi-Tech).
- **Interactive Controls:**
  - `⚡ Burst (+5)`: Injects 5 simulated crawled job entities into the pipeline.
  - `⏸ / ▶ Pause/Resume`: Toggles autonomous periodic stream simulation.
  - `🔄 Reset`: Resets all telemetry, sources, catalog, DLQ, and audit logs to baseline.
  - **Persona & Role Switcher:** One-click role toggle in header (`ADMIN`, `OPERATOR`, `READ_ONLY`) to test permission boundaries.

### Live Fleet Operations Mode
- **Authenticated REST API Integration:** Communicates via `/api/v1/*` endpoints:
  - `GET /api/v1/jobs` & `GET /api/v1/admin/ingestion/status` (Node Ingestion)
  - `GET /api/v1/admin/sources` & `PATCH /api/v1/admin/sources/:id` (Go Scraper Registry)
  - `GET /api/v1/admin/reports` & `PATCH /api/v1/admin/reports/:id` (NestJS User & Support)
  - `GET /api/v1/notifications/health` & `GET /api/v1/notifications/captured` (Notification Outbox)
  - `GET /api/v1/resume/health` (Python Resume Parser)
- **No Deceptive Fallbacks:** In live mode, service failure or network partitions honestly display `DOWN` or `DEGRADED` states rather than falling back to synthetic fixtures.

---

## 3. Operational Consoles & Route Structure

The console provides 6 dedicated views plus an authentication gateway:

| Route | View Name | Capabilities |
|---|---|---|
| `/overview` | **Pipeline Health** | 4 primary telemetry KPI cards (Connectors, Throughput, Latency, DLQ), 7-service fleet status table, hourly throughput distribution chart, quick actions. |
| `/sources` | **Crawler Sources** | Configured source connectors table with target regions, honest licensing/permission status (`PUBLIC_API`, `LICENSED`, `PENDING`, `PROHIBITED`), fetch budgets, pause/resume toggles, and manual crawl trigger modal. Crawl execution run history table. |
| `/catalog` | **Catalog & Moderation** | Canonical job deduplication table, title/company/location search, source/status filters, bounded pagination. Detail inspection modal showing duplicate clusters and raw payload preview. Moderation actions (`EXPIRE`, `FLAG`, `UNFLAG`, `HIDE`, `RESTORE`) with audit logging. |
| `/queues` | **Queues & DLQ Recovery** | Kafka topic lag (`job.collected.v1`), consumer group status, projection outbox backlog. Quarantined poison events table with raw schema error inspector, safe bounded replay, and discard controls. Zero-downtime Elasticsearch index rebuild and catalog reconciliation. |
| `/support` | **Support Queue** | Candidate bug & listing feedback reports (`EXPIRED_LISTING`, `BROKEN_LINK`, `INCORRECT_DATA`, `SPAM`). Filter by status (`RECEIVED`, `IN_REVIEW`, `RESOLVED`, `DISMISSED`). Triage modal with operator resolution notes. |
| `/audit` | **Audit History** | Immutable server-side audit trail recording operator identity, timestamp, action type, target entity, result (`SUCCESS`/`FAILURE`), and before/after JSON diffs. |
| `/login` | **Operator Login** | Mode selector (Demo vs Live) and role switcher (`ADMIN`, `OPERATOR`, `READ_ONLY`) with permission boundary explanations. |

---

## 4. Role & Permission Boundaries

Privileged actions are strictly guarded both in UI and on backend APIs:

| Action | `ADMIN` | `OPERATOR` | `READ_ONLY` |
|---|:---:|:---:|:---:|
| View Health, Telemetry, and Logs | ✅ | ✅ | ✅ |
| Pause / Resume Crawler Sources | ✅ | ❌ | ❌ |
| Trigger Manual Crawl Run | ✅ | ✅ | ❌ |
| Moderate Listings (Expire, Flag, Hide) | ✅ | ✅ | ❌ |
| Triage Support Reports & Save Notes | ✅ | ✅ | ❌ |
| Replay or Discard Quarantined Dead Letters | ✅ | ✅ | ❌ |
| Run Catalog Reconciliation (Dry-run / Live) | ✅ | ❌ | ❌ |
| Initiate Zero-Downtime Index Rebuild | ✅ | ❌ | ❌ |

---

## 5. Local Setup & Testing

### Running the Application

```bash
cd frontend-admin
npm ci

# Start local Angular development server:
npm start
# Navigate to: http://localhost:4200/

# Or compile optimized production bundle:
npm run build
```

### Running Automated Karma Test Suite

```bash
# Execute 58 unit and integration tests in headless Chrome:
npm run test:ci
```

---

## 6. Gateway Routing & Base Href Support

The application supports both independent root hosting and Nginx reverse proxy subpath routing:
- **Direct root deployment:** Accessed at `http://localhost:4200/` or `http://localhost/` (`<base href="/">`)
- **Gateway deployment:** Accessed behind Nginx at `http://localhost/admin/` (`<base href="/admin/">`)
- **Dynamic detection script** in `src/index.html` resolves the correct base href at runtime before Angular bootstraps, ensuring deep links, relative assets, and client routing function seamlessly across environments.

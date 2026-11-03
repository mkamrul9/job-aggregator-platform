# Seekers Production Operations & Infrastructure Runbook (P14)

Prepared: November 2026  
Status: Authoritative Production Infrastructure, Observability & Recovery Guide  
Architecture: Polyglot Microservices Monorepo with Reproducible Private Staging & Standalone Portfolios

---

## 1. Architecture Topology & Network Boundaries

```mermaid
flowchart TD
    Internet["Internet Ingress (Port 80 / 443)"] --> Gateway["Nginx API Gateway (Reverse Proxy & Rate Limiter)"]

    subgraph "Private Microservices Network (microservices-net - Internal Only)"
        Gateway --> Next["frontend-next (Next.js :3000)"]
        Gateway --> Admin["frontend-admin (Angular :80)"]
        Gateway --> Ingestion["service-ingestion (Node.js :5000)"]
        Gateway --> User["service-user (NestJS :3000)"]
        Gateway --> Notif["service-notification (Node.js :4000)"]
        Gateway --> ResumeRest["service-resume (FastAPI :8000)"]

        User -- "Private gRPC" --> ResumeGrpc["service-resume (gRPC :50051)"]
        Scraper["service-scraper (Go Collector)"] -- "Kafka Producer" --> Kafka["Kafka 3.8.0 KRaft (:9092)"]
        Kafka -- "Consumer" --> Ingestion
        Kafka -- "Consumer" --> Notif

        Ingestion -- "Canonical Store" --> Mongo["MongoDB 7.0 (:27017)"]
        Ingestion -- "Projection" --> ES["Elasticsearch 8.10.2 (:9200)"]
        User -- "Authoritative DB" --> Postgres["PostgreSQL 15 (:5432)"]
        User -- "Private Volume" --> Storage["Private Object Storage (/app/data/storage)"]

        Prometheus["Prometheus (:9090)"] -. "Scrapes /metrics" .-> Ingestion
        Prometheus -. "Scrapes /metrics" .-> User
        Prometheus -. "Scrapes /metrics" .-> Notif
        Prometheus -. "Scrapes /metrics" .-> ResumeRest
        Prometheus -. "Alerts" .-> Grafana["Grafana (:3000)"]
    end
```

### Ingress & Boundary Rules:
1. **Zero Host Exposure of Datastores:** PostgreSQL (`5432`), MongoDB (`27017`), Elasticsearch (`9200`), and Kafka (`9092`) have **NO host port bindings** in staging or production. They communicate exclusively over the internal Docker bridge network `microservices-net`.
2. **Gateway Single Point of Ingress:** All candidate and operator requests enter through Nginx on port 80/443. Nginx enforces client request size limits (10MB for resume uploads), exact rate limits (50r/s with burst of 100), upstream timeouts (5s connect, 60s read), and security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
3. **Correlation ID Forwarding:** Every request carries an `X-Correlation-ID` header. If missing from the client, Nginx synthesizes a unique `$request_id` and forwards it to downstream services.

---

## 2. Independent Project Deployment & Evaluation Recipes

Every one of the 7 projects can be deployed and evaluated independently without spinning up the entire fleet:

| Service | Primary Stack | Independent Run Command | Health Check Probe | Standalone Portfolio Mode |
|---|---|---|---|---|
| **`frontend-next`** | Next.js 15, React 19, TypeScript | `cd frontend-next && npm run dev` | `GET http://localhost:3000/api/health` | Candidate web experience with search, filters, detail view, candidate workspace |
| **`frontend-admin`** | Angular 19, TypeScript, SCSS | `cd frontend-admin && npm start` | `GET http://localhost:4200/index.html` | Operations console with synthetic mock adapter (zero backend needed) or live mode |
| **`service-user`** | NestJS 11, Prisma, PostgreSQL | `cd service-user && npm run start:dev` | `GET http://localhost:3000/users/health` | Identity synchronization, profile management, application tracking, durable erasure |
| **`service-ingestion`** | Node.js 22, Express, Mongo, ES | `cd service-ingestion && npm run start:standalone` | `GET http://localhost:5000/health` | Dual-write catalog ingestion, dead-letter quarantine replay, ES index rebuild |
| **`service-notification`** | Node.js 22, Express, Socket.io | `cd service-notification && npm start` | `GET http://localhost:4000/health` | In-memory durable store with CAPTURE mode (inspect deliveries without SMTP credentials) |
| **`service-resume`** | Python 3.11, FastAPI, spaCy, gRPC | `cd service-resume && uvicorn main:app --port 8000` | `GET http://localhost:8000/health` | Standalone browser demo (`GET /demo`), real `/sample-resume.pdf` extraction |
| **`service-scraper`** | Go 1.23, Playwright, SSRF Guard | `cd service-scraper && go run . -mode=once` | CLI exit code 0 | Standalone CLI crawler (`-source=linkedin`, `-fixture=...`) |

---

## 3. Observability, Metrics & Alert Runbook

Prometheus scrapes all backend services at 15-second intervals via `config-prometheus/prometheus.yml`:
- `notification-service:4000/metrics`
- `ingestion-service:5000/metrics`
- `user-service:3000/metrics`
- `resume-api:8000/metrics`

### Production Alert Rules & Remediation

#### 1. `ServiceDown` (Severity: CRITICAL)
- **Expression:** `up == 0` for 1m
- **Impact:** An upstream application container or service instance has crashed or failed health probes.
- **Triage & Remediation:**
  1. Inspect container logs: `docker compose -f docker-compose.staging.yml logs --tail=100 <service-name>`
  2. Verify resource consumption: `docker stats`
  3. Restart unresponsive container: `docker compose -f docker-compose.staging.yml restart <service-name>`

#### 2. `IngestionDeadLetterSpike` (Severity: CRITICAL)
- **Expression:** `ingestion_dead_letter_total > 10` for 1m
- **Impact:** Malformed, unparseable, or schema-violating crawl events are accumulating in the quarantine queue.
- **Triage & Remediation:**
  1. Log into the Angular Operations Console at `/admin/queues` or query `GET /api/v1/admin/dead-letters`.
  2. Inspect quarantine error codes (`SCHEMA_VIOLATION_INVALID_HASH`, `MALFORMED_JSON`).
  3. If crawler source has drifted, pause connector: `POST /api/v1/admin/sources/:id/pause`.
  4. Fix ingestion parser mapping and replay poison messages: `POST /api/v1/admin/dead-letters/:id/replay`.

#### 3. `NotificationDeliveryFailureHigh` (Severity: WARNING)
- **Expression:** `rate(notification_deliveries_total{status="failed"}[5m]) > 0.05` for 2m
- **Impact:** Delivery failure rate exceeds 5% of attempted notifications.
- **Triage & Remediation:**
  1. Verify SMTP server responsiveness: `curl -v telnet://$SMTP_HOST:$SMTP_PORT`
  2. Check for bounce rates or provider throttling in notification logs.
  3. If staging, ensure `NOTIFICATION_MODE=CAPTURE` is set so no real mail is attempted.

#### 4. `KafkaConsumerLagHigh` (Severity: WARNING)
- **Expression:** `kafka_consumer_lag > 500` for 3m
- **Impact:** Consumers are falling behind producers on `jobs.new` or `job.matches` topics.
- **Triage & Remediation:**
  1. Check ingestion worker processing latency: `GET /api/v1/admin/status`
  2. Scale consumer worker concurrency or check MongoDB write pool saturation.

#### 5. `BackupDrillOverdue` (Severity: WARNING)
- **Expression:** `time() - seekers_backup_last_timestamp_seconds > 86400` for 1h
- **Impact:** No automated disaster recovery restore drill has been executed within the last 24 hours.
- **Triage & Remediation:**
  1. Execute automated restore drill: `node scripts/restore-drill.js`
  2. Check `data/restore_drill/LATEST_RESTORE_REPORT.json` for verified status.

---

## 4. Disaster Recovery, Backup & Restore Drills

### Agreed Target SLA:
- **RPO (Recovery Point Objective):** <= 15 minutes (maximum acceptable data loss window)
- **RTO (Recovery Time Objective):** <= 60 minutes (maximum acceptable restoration duration)

### Backup Procedure
Execute authoritative snapshot script:
```bash
node scripts/backup-stores.js
```
The script:
1. Dumps PostgreSQL authoritative schema and rows (users, profiles, applications, durable erasures).
2. Dumps MongoDB canonical job catalog and dead letter quarantine.
3. Archives private object storage (resumes and export zips).
4. Computes SHA-256 cryptographic checksums for every artifact.
5. Emits `manifest.json` with timestamp and file metadata.

### Restoration Drill Procedure
Execute verified restore drill:
```bash
node scripts/restore-drill.js
```
The restoration pipeline validates:
1. **Pre-flight Integrity:** Verifies SHA-256 checksum of every artifact before unpacking.
2. **Privacy & Durable Erasure Invariant:** Confirms that any account in `DurableErasureRecord` is NOT resurrected and remains permanently blocked (`403 ACCOUNT_PERMANENTLY_ERASED`).
3. **Private Object Storage Containment:** Confirms purged resumes are absent from active storage.
4. **Search Rebuild:** Rebuilds Elasticsearch projection directly from the restored canonical MongoDB collection.
5. **Measures Actual RPO & RTO:** Records timing and asserts `RTO <= 60m` and `RPO <= 15m`.

---

## 5. Automated Rollback Rehearsal

To safely revert a failed deployment without losing durable state:
```bash
node scripts/rollback-staging.js
```
The rollback rehearsal verifies:
1. **Forward Schema Compatibility:** Migrations are non-destructive and backward-compatible with the target image.
2. **Durable State Preservation:** In-flight job listings, durable erasure records, and suppression lists remain 100% intact.
3. **Service Health Recovery:** All 7 services respond with 200 OK to health probes under the rolled-back version.

---

## 6. Basic Operating Cost Analysis

The Seekers platform is engineered for high capital efficiency using standard container virtualization:

| Component | Self-Hosted Linux VPS (Recommended Tier) | AWS / GCP Cloud Equivalent | Monthly Cost (VPS) |
|---|---|---|---|
| **Compute & Memory** | 1x Dedicated or Cloud VPS (4 vCPU, 8GB RAM, 160GB NVMe) | 2x t4g.medium / e2-standard-2 | $12.00 / month |
| **Database Tier** | Containerized PostgreSQL 15 + MongoDB 7.0 (local NVMe volumes) | AWS RDS Postgres + MongoDB Atlas M10 | $0.00 (included in VPS) vs ~$120/mo cloud |
| **Message Broker** | Apache Kafka 3.8.0 KRaft mode (zero Zookeeper overhead) | AWS MSK or Confluent Cloud | $0.00 (included in VPS) vs ~$150/mo cloud |
| **Search Engine** | Elasticsearch 8.10.2 (capped to 1GB JVM Heap) | AWS OpenSearch Service | $0.00 (included in VPS) vs ~$60/mo cloud |
| **Object Storage** | Local Private Volume mount or Cloudflare R2 / MinIO ($0 tier) | AWS S3 Standard | $0.00 / month |
| **Observability** | Prometheus v2.54 + Grafana 11.2 (containerized) | Datadog / NewRelic | $0.00 (included in VPS) |
| **Total Estimated Cost**| **~$12.00 – $20.00 / month** | **~$350.00 – $500.00 / month** | **96% Cost Reduction** |

*Note: For the portfolio showcase and initial regional launch, the $0 Free Tier local/developer setup and a single $12/month VPS comfortably support up to 5,000 active candidates with 15-minute RPO and sub-second search response.*

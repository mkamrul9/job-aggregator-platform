# Node.js Notification Delivery Service (`service-notification`)

An event-driven notification service that broadcasts live job ingestion events via WebSockets, evaluates preference-matched job opportunities against candidate alert subscriptions, and dispatches email alerts with durable delivery tracking and one-click unsubscribe.

> **Role in Seekers Platform:** Operates as a reactive downstream consumer of versioned `job.ingested.v1` and legacy `jobs.new` Kafka streams. Emits real-time sanitized Socket.io events consumed by frontend clients, persists delivery/evaluation records in crash-safe storage, and dispatches candidate job match emails in local `CAPTURE` or integrated `SMTP` modes while exposing Prometheus telemetry.

---

## 1. Primary Technology Stack

- **Runtime:** Node.js 20.x
- **Server Framework:** Express 5.x with HTTP Server
- **Real-Time WebSockets:** Socket.io 4.x with strict public stream payload sanitization and authenticated candidate-scoped rooms (`candidate:${candidateId}`)
- **Event Streaming:** KafkaJS 2.x (Consumer Group: `email-notification-group`)
- **Email Delivery & Capturing:** Nodemailer with dual modes:
  - `CAPTURE` (default for local development, CI, testing, and demo — stores full message envelopes with zero external dependencies)
  - `SMTP` (for real or sandbox SMTP relays when configured; requires non-empty `ALERT_UNSUBSCRIBE_SECRET` and valid SMTP host)
- **Security & Token Integrity:**
  - Dedicated HMAC-SHA256 unsubscribe tokens with mandatory finite expiration (maximum 90 days), purpose binding (`job_alert_unsubscribe`), and length limits (2048 chars).
  - RFC 8058 One-Click Unsubscribe POST handling with URL query token and `List-Unsubscribe=One-Click` header/body parsing.
  - API endpoint authentication: admin/internal service credentials required for administrative operations (`/captured`, `/subscriptions`, `/suppressions`, `/evaluate`) and provider webhook secret required for `/webhooks/provider`.
  - HTML entity escaping across all rendered notification templates to prevent XSS injection.
- **Durable Storage:** `DurableNotificationStore` crash-safe atomic file-backed JSON store:
  - Cross-process exclusive file locking (`_withLock` via `.lock` atomic reservation) preventing concurrent write collisions and stale in-memory state overwrites.
  - Multi-worker delivery state machine with lease acquisition and fencing token protection against late/stale worker races.
  - Non-swallowed persistence errors: disk write or atomic rename failures immediately bubble up.
  - Corrupt storage file isolation: corrupt JSON files are automatically preserved as `.corrupt-${Date.now()}` and throw `PersistenceCorruptionError`.
  - Retention bounding: maximum 500 captured emails, 5000 completed deliveries, and 10000 event receipts without pruning active or unfinished deliveries.
  - Dual suppression scopes: isolates global suppression (`global_suppressions` for bounces, spam complaints, and global opt-outs) from per-subscription suppression (`subscription_suppressions`).
  - Durable outbox synchronization tasks (`sync_tasks`) and pending daily/weekly digest buffers (`digests`).
- **Durable Worker:** `DurableNotificationWorker` background loop recovering due retries with exponential backoff and jitter, bridging pending unsubscribe outbox tasks to `service-user`, and dispatching matured digest batches.
- **Telemetry & Metrics:** `prom-client` 15.x (`job_notifications_sent_total`, `notification_evaluations_total`, `notification_deliveries_total`)

---

## 2. Architecture & Data Ownership

```
               +--------------------------------------+
               |  Apache Kafka (job.ingested.v1)      |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |  service-notification (Node.js :4000)|
               |  - Kafka Consumer & Idempotency Gate |
               |  - Preference Matcher (P10 aligned)  |
               |  - Delivery State Machine            |
               |  - Scoped Durable Store (JSON)       |
               |  - Token Security (HMAC-SHA256)      |
               |  - Prometheus Telemetry              |
               +---------+------------------+---------+
                         |                  |
                         v                  v
                 +---------------+  +------------------+
                 | Socket.io     |  | Local Capture    |
                 | (Sanitized)   |  | Mailbox / SMTP   |
                 +---------------+  +------------------+
```

### Data Ownership & Source of Truth

- **Identity & Subscriptions Authority:** `service-user` (PostgreSQL) is authoritative for candidate accounts, saved searches, and alert preferences.
- **Delivery & Notification Records Authority:** `service-notification` owns its delivery state machine records, event watermarks, suppressions, and captured email logs in its scoped durable store (`data/notifications_store.json`).
- **Idempotency & Deduplication:** Deliveries are keyed logically by subscription, job IDs, version, and date window. Duplicate events are safely acknowledged without duplicate email dispatches.

---

## 3. HTTP Endpoints

Both canonical `/api/v1/notifications/...` paths and gateway-stripped paths (`/...`) are supported.

| Method | Route | Access Control | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Health status, mode (`CAPTURE` or `SMTP`), uptime, and store statistics |
| `GET` | `/metrics` | Public | Prometheus metrics exposition format |
| `GET` | `/api/v1/notifications/captured` | Admin / Service | Query captured demonstration emails (`limit`, `to` filters) |
| `GET` | `/api/v1/notifications/captured/:id` | Admin / Service | Fetch full headers, plain text, and HTML of a captured email |
| `DELETE` | `/api/v1/notifications/captured` | Admin / Service | Clear captured demonstration mailbox |
| `GET` | `/api/v1/notifications/unsubscribe` | Public (Token-bound) | Safe browser confirmation page for one-click unsubscribe (link prefetch safe) |
| `POST` | `/api/v1/notifications/unsubscribe` | Public (Token-bound) | Verify HMAC token and deactivate subscription + record suppression (RFC 8058 compliant) |
| `POST` | `/api/v1/notifications/webhooks/provider` | Webhook Secret | Handle bounce and spam complaint callbacks from email providers |
| `POST` | `/api/v1/notifications/evaluate` | Admin / Service | Directly evaluate a job against active subscriptions |
| `GET` | `/api/v1/notifications/subscriptions` | Admin / Service | List cached candidate alert subscriptions |
| `POST` | `/api/v1/notifications/subscriptions` | Admin / Service | Register or update candidate alert subscription |
| `GET` | `/api/v1/notifications/suppressions` | Admin / Service | List active global and subscription-level suppressions |
| `WS` | `/socket.io` | Authenticated Rooms | WebSocket server emitting sanitized `live-job-feed` and authenticated candidate updates |

---

## 4. Preference Matching & Delivery Guarantees

The notification service aligns with Phase 10 matching semantics:
1. **Query Matching:** Token-boundary matching (`\bword\b`) across job title, company, description, and skills to prevent substring false matches (e.g. `react` matching `reactor`).
2. **Strict Remote:** If candidate preference is `FULLY_REMOTE`, hybrid or on-site listings are strictly rejected (`REMOTE_PREFERENCE_MISMATCH`).
3. **Location Matching:** On-site and hybrid roles must match candidate's designated location. Fully remote jobs satisfy any location requirement.
4. **Compensation Normalization:** Hourly, weekly, monthly, and yearly salary values are normalized before comparing against subscription thresholds. Currency mismatches are rejected (`SALARY_CURRENCY_MISMATCH`).
5. **Skill Aliases:** Recognizes common tech stack aliases (e.g., `golang` <-> `go`, `ts` <-> `typescript`, `k8s` <-> `kubernetes`, `py` <-> `python`).
6. **Punctuation-Heavy Tokens:** Safely matches languages like `C++`, `C#`, `.NET`, and `Node.js` without regex syntax faults.
7. **Lifecycle Gate:** Expired, flagged, draft, or inactive listings are excluded at the evaluation boundary.
8. **Verification Requirement:** Subscriptions with `email_verified !== true` are strictly rejected (`EMAIL_NOT_VERIFIED`).
9. **Suppression Enforcement:** Unsubscribed addresses, hard bounces, and spam complaints are permanently suppressed.

---

## 5. Standalone CLI & Event Replay Showcase

The notification service provides an independent demonstration CLI that operates without running Kafka, Next.js, Angular, Python, or the full platform fleet:

```bash
# Replay synthetic jobs against candidate subscriptions in CAPTURE mode
node cli.js replay

# Inspect captured demonstration emails
node cli.js captured

# View full headers, plain text, and HTML body of a captured email
node cli.js captured-show <captured-id>

# Verify a signed unsubscribe token without mutating state
node cli.js verify-token <token>

# Execute one-click unsubscribe using signed token
node cli.js unsubscribe <token>

# Print store delivery statistics and suppression counts
node cli.js stats

# Clear captured mailbox
node cli.js captured-clear
```

---

## 6. Running Tests

```bash
# Run the complete unit, storage, template, crypto, and integration test suite
npm test
```

---

## 7. Engineering Tradeoffs & Known Limitations

- **Atomic File-backed JSON Storage vs Distributed DBMS:** Implemented `DurableNotificationStore` featuring cross-process exclusive file locking (`_withLock`), atomic rename swaps, and automatic corruption isolation (`.corrupt-<timestamp>`) for zero-dependency standalone operation, lightweight local verification, and predictable test execution. High-throughput distributed clustering across multi-region server fleets would swap this store for a managed PostgreSQL or Redis adapter.
- **Double Suppression Scoping:** Separated global suppressions (`global_suppressions` for hard bounces, spam complaints, and global opt-outs) from per-subscription suppressions (`subscription_suppressions`). This ensures unsubscribing from one specific search alert never unintentionally deactivates other unrelated active career notifications.
- **Two-Phase Unsubscribe (Link Prefetch Protection):** Implemented strict RFC 8058 compliance where `POST /unsubscribe` executes state mutation and suppression recording, while `GET /unsubscribe` displays a confirmation web form. This prevents corporate mail scanners and email prefetch bots from accidentally terminating candidate subscriptions.
- **Safe Capture vs Live SMTP:** Default `CAPTURE` mode buffers full email envelopes locally without external network dependencies, guaranteeing zero accidental test emails during local verification or CI runs. `SMTP` mode is safely gated behind non-empty secret and relay configuration.

---

## 8. Portfolio Summary & Interview Walkthrough

### Technology CV Bullet
> **Node.js Backend Engineer — Real-Time Notification & Matching Service:** Built an event-driven job alert microservice using Node.js 20, Express, Socket.io 4, and KafkaJS. Engineered token-boundary candidate preference matching with currency normalization, crash-safe multi-worker delivery state machines with atomic file locking and corruption quarantine, and RFC 8058 one-click unsubscribe with HMAC-SHA256 signature verification.

### Technical Interview Walkthrough
1. **Core Problem:** Broadcasting live job events and delivering candidate email alerts requires token-accurate matching, strict multi-worker delivery deduplication, rock-solid bounce/complaint suppression, and tamper-proof unsubscribe links that resist automated prefetch bots.
2. **Solution Architecture:** Engineered an event-driven consumer processing `job.ingested.v1` Kafka streams, evaluating jobs against candidate subscriptions using boundary-safe regex matching and salary normalization. Broadcasts sanitized real-time events via Socket.io and queues outbound email deliveries into an idempotent state machine.
3. **Resilience & Security:** Designed crash-resilient atomic storage with cross-process lock files, automated corrupt state isolation, and dedicated HMAC-SHA256 unsubscribe tokens with 90-day finite expiration and purpose binding. Tested with standalone CLI replay and comprehensive automated test suites.


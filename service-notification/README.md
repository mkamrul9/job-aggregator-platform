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
  - Multi-instance writer synchronization via on-disk state re-synchronization prior to mutation and flush.
  - Non-swallowed persistence errors: disk write or atomic rename failures immediately bubble up.
  - Corrupt storage file isolation: corrupt JSON files are automatically preserved as `.corrupt-${Date.now()}` and throw `PersistenceCorruptionError`.
  - Retention bounding: maximum 500 captured emails, 5000 deliveries, and 5000 event receipts.
  - Dual suppression scopes: isolates global suppression (`global_suppressions` for bounces, spam complaints, and global opt-outs) from per-subscription suppression (`subscription_suppressions`).
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

## 7. Operational Limitations

1. **Storage Concurrency:** The atomic JSON storage adapter coordinates local multi-instance processes via on-disk synchronization. High-throughput distributed clustering across distinct machines requires a PostgreSQL or Redis storage adapter.
2. **SMTP Provider:** In `CAPTURE` mode, emails are stored locally for verification and are not transmitted over the wire. In `SMTP` mode, external mail delivery requires a reachable SMTP host with valid authentication and non-empty `ALERT_UNSUBSCRIBE_SECRET`.

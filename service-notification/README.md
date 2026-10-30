# Node.js Notification Delivery Service (`service-notification`)

An event-driven notification service that broadcasts live job ingestion events via WebSockets, evaluates preference-matched job opportunities against candidate alert subscriptions, and dispatches email alerts with durable delivery tracking and one-click unsubscribe.

> **Role in Seekers Platform:** Operates as a reactive downstream consumer of versioned `job.ingested.v1` and legacy `jobs.new` Kafka streams. Emits real-time sanitized Socket.io events consumed by frontend clients, persists delivery/evaluation records in crash-safe storage, and dispatches candidate job match emails in local `CAPTURE` or integrated `SMTP` modes while exposing Prometheus telemetry.

---

## 1. Primary Technology Stack

- **Runtime:** Node.js 20.x
- **Server Framework:** Express 5.x with HTTP Server
- **Real-Time WebSockets:** Socket.io 4.x (CORS-enabled, sanitized public job stream & candidate-authenticated private rooms)
- **Event Streaming:** KafkaJS 2.x (Consumer Group: `email-notification-group`)
- **Email Delivery & Capturing:** Nodemailer 9.x with dual modes:
  - `CAPTURE` (default for local development, CI, testing, and demo — stores full message envelopes with zero external dependencies)
  - `SMTP` (for real or sandbox SMTP relays when configured)
- **Security & Integrity:** Cryptographic HMAC-SHA256 purpose-scoped unsubscribe tokens (`RFC 8058` one-click header support) and HTML XSS escaping
- **Durable Storage:** `DurableNotificationStore` crash-safe atomic JSON store (atomic temp write + rename)
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
               |  - Token Generator (HMAC-SHA256)     |
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

- **Identity & Subscriptions Authority:** `service-user` is authoritative for candidate accounts, saved searches, and alert preferences.
- **Delivery & Notification Records Authority:** `service-notification` owns its delivery state machine records, event watermarks, suppressions, and captured email logs in its scoped durable store (`data/notifications_store.json`).
- **Idempotency & Deduplication:** Deliveries are keyed logically by `${subscriptionId}:${jobId}`. Duplicate events are safely acknowledged without duplicate email dispatches.

---

## 3. HTTP Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health status, mode (`CAPTURE` or `SMTP`), uptime, and store statistics |
| `GET` | `/metrics` | Prometheus metrics exposition format |
| `GET` | `/api/v1/notifications/captured` | Query captured demonstration emails (`limit`, `to` filters) |
| `GET` | `/api/v1/notifications/captured/:id` | Fetch full headers, plain text, and HTML of a captured email |
| `DELETE` | `/api/v1/notifications/captured` | Clear captured demonstration mailbox |
| `GET` | `/api/v1/notifications/unsubscribe` | Safe browser confirmation page for one-click unsubscribe (link prefetch safe) |
| `POST` | `/api/v1/notifications/unsubscribe` | Verify HMAC token and deactivate subscription + record suppression |
| `POST` | `/api/v1/notifications/webhooks/provider` | Handle bounce and spam complaint callbacks from email providers |
| `POST` | `/api/v1/notifications/evaluate` | Directly evaluate a job against active subscriptions |
| `GET` | `/api/v1/notifications/subscriptions` | List cached candidate alert subscriptions |
| `POST` | `/api/v1/notifications/subscriptions` | Register or update candidate alert subscription |
| `GET` | `/api/v1/notifications/suppressions` | List active suppressed email addresses |
| `WS` | `/socket.io` | WebSocket server emitting sanitized `live-job-feed` |

---

## 4. Preference Matching & Delivery Guarantees

The notification service aligns with Phase 10 matching semantics:
1. **Query Matching:** Token-boundary matching (`\bword\b`) across job title, company, description, and skills to prevent substring false matches (e.g. `react` matching `reactor`).
2. **Strict Remote:** If candidate preference is `FULLY_REMOTE`, hybrid or on-site listings are strictly rejected (`REMOTE_PREFERENCE_MISMATCH`).
3. **Location Matching:** On-site and hybrid roles must match candidate's designated location. Fully remote jobs satisfy any location requirement.
4. **Compensation Normalization:** Hourly, weekly, monthly, and yearly salary values are normalized before comparing against subscription thresholds.
5. **Lifecycle Gate:** Expired, flagged, draft, or inactive listings are excluded at the evaluation boundary.
6. **Suppression Enforcement:** Unsubscribed addresses, hard bounces, and spam complaints are permanently suppressed.

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

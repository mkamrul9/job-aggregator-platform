# Node.js Notification Delivery Service (`service-notification`)

An event-driven notification service that broadcasts live job ingestion events to admin dashboards via WebSockets and dispatches email alerts to matching candidates.

> **Role in Seekers Platform:** Operates as a reactive downstream consumer of the `jobs.new` Kafka stream. Emits real-time Socket.io events consumed by `frontend-admin` and delivers candidate job match emails while exposing Prometheus telemetry.

---

## 1. Primary Technology Stack

- **Runtime:** Node.js 20.x
- **Server Framework:** Express 5.x with HTTP Server
- **Real-Time WebSockets:** Socket.io 4.x (CORS-enabled)
- **Event Streaming:** KafkaJS 2.x (Consumer Group: `email-notification-group`)
- **Email Delivery:** Nodemailer 9.x
- **Telemetry & Metrics:** `prom-client` 15.x (Default runtime metrics + custom `job_notifications_sent_total`)

---

## 2. Architecture & Interfaces

```
               +--------------------------------------+
               |  Apache Kafka (topic: jobs.new)      |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |  service-notification (Node.js :4000)|
               |  - Kafka Consumer Group              |
               |  - Socket.io Server                  |
               |  - Nodemailer Dispatcher             |
               |  - Prometheus /metrics               |
               +---------+------------------+---------+
                         |                  |
                         v                  v
                 +---------------+  +------------------+
                 | frontend-admin|  | SMTP / Candidate |
                 | (WebSocket)   |  | Mailbox          |
                 +---------------+  +------------------+
```

### Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Service health status |
| `GET` | `/metrics` | Prometheus metrics exposition format |
| `WS` | `/socket.io` | WebSocket server emitting `live-job-feed` |

---

## 3. Current Capabilities & Baseline Status

- **Syntax & Parse Check (`node --check index.js`):** `[Verified]` — valid JavaScript syntax.
- **WebSocket Broadcast (`live-job-feed`):** Emits structured job payloads to connected Socket.io clients.
- **Prometheus Telemetry:** Exposes process memory, CPU, event loop lag, and custom notification counter on `/metrics`.
- **Known Limitations:**
  - Email transport currently uses mock Ethereal test credentials and hardcoded recipient data.
  - Package test script is a placeholder; meaningful unit/integration tests to be added in Phase P02.
  - Delivery failures are logged to console without retry backoff or dead-letter queue.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x
- Apache Kafka (or planned synthetic injector)

### Installation

```bash
cd service-notification
npm install
```

### Configuration

The application reads variables from its process environment; it does not load `.env` automatically. The example only documents the supported Kafka/CORS settings:
```bash
cp .env.example .env
```
Key configuration settings (see `.env.example`):
- `KAFKA_BROKER`: Kafka broker address (default: `localhost:9092`)
- `SOCKET_CORS_ORIGIN`: Allowed origins for WebSocket connections (default: `http://localhost:4200,http://localhost:3003`)

The server port (`4000`), SMTP settings, and recipient are currently hardcoded. `PORT` or `SMTP_*` environment variables do not configure them. Provider configuration and safe local capture delivery must be implemented before testing actual mail workflows.

### Running Locally

```bash
node index.js
```

---

## 5. Planned Standalone Demonstration (Phase P11)

In Phase P11, this notification service will feature an independent demonstration mode:
- **Synthetic Event Injector:** Command-line tool injecting realistic job match events directly into the processing loop without running Kafka.
- **Local Mailbox Capture:** Integration with a local capture mailbox (e.g. Mailpit) allowing visual inspection of rich HTML email alerts.
- **Live WebSocket Test Client:** Minimal diagnostic UI verifying socket connection, payload receipt, and live Prometheus metric increments.

# Go Job Collection Engine (`service-scraper`)

A concurrent, resilient web scraping and event collection engine written in Go 1.23 that harvests job listings from approved career sources and ATS feeds, cleans and extracts structured metadata, normalizes records into versioned domain event envelopes, and publishes them to Apache Kafka with durable lease scheduling and offline CLI support.

> **Role in Seekers Platform:** Operates as the initial collection frontier in the Seekers microservices architecture. It emits versioned `job.collected.v1` events to Kafka (with backward-compatible delivery to `jobs.new`), where downstream catalog ingestion (`service-ingestion`) and notification delivery (`service-notification`) consume them.

---

## 1. Primary Technology Stack

- **Language:** Go 1.23
- **Event Streaming:** `github.com/segmentio/kafka-go` (v0.4.51)
- **Browser Automation:** `github.com/mxschmitt/playwright-go` (v0.6100.0)
- **Dependency Management:** Go Modules (`go.mod`, `go.sum`)
- **Runtime Environment:** Containerized Go executable with non-root security boundaries

---

## 2. Architecture & Concurrency Model

```
               +--------------------------------------+
               |    Approved Launch Source Registry   |
               |  (Greenhouse, Lever, Chaldal, etc.)  |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |      Durable Scheduling Core         |
               |  - FileSchedulerStore (Leases)       |
               |  - Worker Pool & Bounded Queues      |
               |  - Rate Limiter with Jitter & Backoff|
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |       Connectors & SSRF Guard        |
               |  - SafeHTTPClient (DNS Re-eval)      |
               |  - Loopback / ULA / Private IP Block |
               |  - StripHTML & Field Normalization   |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |     SeekersEventEnvelope Builder     |
               |  - Schema: job.collected.v1          |
               |  - SHA-256 URL Hash Partition Key    |
               +-------------------+------------------+
                                   |
            +----------------------+----------------------+
            | (Daemon Mode)                               | (CLI / Fixture Mode)
            v                                             v
     +--------------+                              +--------------+
     | Apache Kafka |                              | Stdout / File|
     | job.collected|                              | Clean NDJSON |
     |      .v1     |                              | (Exit 0/1/2) |
     +--------------+                              +--------------+
```

### Key Components

1. **Approved Source Registry (`registry.go`):**  
   Tracks operational provenance for all sources: connector ID, version, approved hosts, review date, permission reference, attribution, fetch budget (max req/sec, burst), retention, and enabled status.
2. **Server-Side Request Forgery (SSRF) Guard (`ssrf.go`):**  
   Protects server fetches against untrusted destinations by validating schemes (`http`/`https`), rejecting credentials, single-label intranet hosts, IPv4/IPv6 loopback (`127.0.0.0/8`, `::1`), RFC 1918 private subnets, cloud metadata (`169.254.169.254`), carrier-grade NAT (`100.64.0.0/10`), and IPv6 ULA (`fc00::/7`). A custom dialer and redirect handler revalidate resolved IPs on every hop.
3. **Durable Scheduling & Lease Coordination (`scheduler.go`):**  
   Coordinates multi-worker crawls without overlap using leases with automatic expiry and renewal. Checkpoints (`last_run_at`, `last_success_at`, `jobs_collected`, `status`, `last_error`) survive process restarts in `./data/state`.
4. **Versioned Event Envelope (`models.go`, `publisher.go`):**  
   Emits `SeekersEventEnvelope` conforming strictly to `contracts/events/envelope.schema.json` and `job.collected.v1.schema.json`. Partitioning is bound to `source_url_hash` for deterministic ordering.

---

## 3. Evidence-Backed Launch Source Coverage

| Source ID | Name | Connector Type | Approved Hosts | Status | Permission & Provenance |
|---|---|---|---|---|---|
| `greenhouse-feed` | Greenhouse Public ATS Feed | `json_api` | `boards-api.greenhouse.io`, `boards.greenhouse.io` | **ENABLED** | Public career board API per Greenhouse documentation; terms reviewed 2026-10-27 |
| `lever-feed` | Lever Public Careers API | `json_api` | `api.lever.co`, `jobs.lever.co` | **ENABLED** | Public postings API per Lever developer documentation; terms reviewed 2026-10-27 |
| `bdjobs-tech` | BDJobs Tech Category Feed | `feed` | `jobs.bdjobs.com`, `bdjobs.com` | **DISABLED** | Live collection disabled: unverified custom API schema; requires dedicated connector implementation and approved syndication agreement |
| `chaldal-careers` | Chaldal Engineering Careers | `json_api` | `chaldal.com`, `careers.chaldal.com` | **DISABLED** | Live collection disabled: employer endpoint is not an ATS feed; requires verified connector |
| `pathao-careers` | Pathao Tech Careers | `json_api` | `pathao.com`, `careers.pathao.com` | **DISABLED** | Live collection disabled: employer endpoint is not an ATS feed; requires verified connector |
| `linkedin-bd` | LinkedIn Bangladesh | `html` | `www.linkedin.com` | **DISABLED** | Live collection disabled: automated scraping requires formal LinkedIn partner agreement |
| `fixture-local` | Deterministic Local Test Fixture | `fixture` | `localhost` | **ENABLED** | Local synthetic test dataset for zero-network offline verification |

---

## 4. Standalone CLI & Local Demonstration

The Go collector features a standalone CLI that executes against local fixtures or real sources with **zero external dependencies** (no Kafka, MongoDB, Node, or Playwright required):

### List Registered Sources
```bash
go run . -list-sources
```

### Offline Fixture Execution (Deterministic Demonstration)
```bash
# Parses local fixture, formats to clean JSON on stdout, logs to stderr
go run . -mode=cli -fixture=fixtures/greenhouse_sample.json -format=json
```

### Save Output to NDJSON File
```bash
go run . -mode=cli -fixture=fixtures/greenhouse_sample.json -format=ndjson -output=file -output-file=collected.ndjson
```

### CLI Exit Codes
- `0`: Success — jobs collected and emitted successfully.
- `1`: Fatal error — invalid configuration, unresolvable source, or write failure.
- `2`: Schema drift warning — parser returned 0 jobs or payload structure changed unexpectedly.

---

## 5. Running Tests

```bash
# Run unit and regression tests (SSRF, parsers, drift, scheduler leases, fixtures)
go test -v ./...

# Run code hygiene checks
go vet ./...
```

---

## 6. Engineering Tradeoffs & Known Limitations

- **Lightweight HTTP/JSON vs Headless Browsers:** Prioritizes direct public ATS JSON feeds (Greenhouse/Lever) for speed and sub-second collection latency. Heavy Playwright headless browser rendering is reserved strictly for complex JavaScript SPAs.
- **SSRF Protection:** Enforces strict DNS resolution checks that reject loopback (`127.0.0.1`), private RFC 1918 subnets (`10.0.0.0/8`, `192.168.0.0/16`), and AWS metadata endpoints (`169.254.169.254`), preventing server-side request forgery attacks.
- **Legal Source Governance:** Inactive or unpartnered source connectors are disabled by default (`DISABLED`), ensuring ethical scraping compliance and preventing IP bans or terms of service violations.

---

## 7. Portfolio Summary & Interview Walkthrough

### Technology CV Bullet
> **Go Systems & Distributed Scraping Engineer — Collector Service:** Engineered an autonomous, ethical web scraping microservice in Go 1.23 with rate budgeting, SSRF DNS validation, and Kafka event publishing (`job.collected.v1`). Built standalone CLI execution modes with deterministic exit codes and verified parser drift detection across 8 test suites.

### Technical Interview Walkthrough
1. **Core Problem:** Web scraping at scale risks server IP bans, SSRF vulnerabilities, schema drift on employer site changes, and uncoordinated duplicate crawls.
2. **Solution Architecture:** Developed a modular Go collector featuring leaky-bucket rate limiters per domain, strict URL normalization with SHA-256 deduplication hashing, and standard `SeekersEventEnvelope` JSON schemas.
3. **Resilience & Safety:** Guarded all outbound HTTP requests with private IP filtering, built deterministic exit codes (0, 1, 2) for automated pipeline orchestration, and verified zero-dependency offline fixture execution.

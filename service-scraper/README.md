# Go Job Collection Engine (`service-scraper`)

A concurrent web scraping and data extraction engine written in Go that harvests job listings from web sources, cleans and extracts structured metadata, and publishes events to Apache Kafka.

> **Role in Seekers Platform:** Operates as the initial ingestion frontier in the Seekers microservices architecture. It streams newly collected job records to the `jobs.new` Kafka topic, where downstream workers (`service-ingestion` and `service-notification`) consume them.

---

## 1. Primary Technology Stack

- **Language:** Go 1.23
- **Browser Automation:** `github.com/mxschmitt/playwright-go` (v0.6100.0)
- **Event Streaming:** `github.com/segmentio/kafka-go` (v0.4.51)
- **Dependency Management:** Go Modules (`go.mod`, `go.sum`). Module-based dependency retrieval verified; vendor directory untracked.
- **Runtime Environment:** Ubuntu 22.04 container with Chromium browser binaries

---

## 2. Architecture & Concurrency Model

The scraper is built around an event-driven worker pool pattern using Go channels and goroutines:

```
               +----------------------------------+
               |   Job Targets (Career Portals)   |
               +-----------------+----------------+
                                 |
                                 v
               +----------------------------------+
               |   Playwright Browser Headless    |
               |   DOM Extraction & Page Parsing  |
               +-----------------+----------------+
                                 |
                                 v
               +----------------------------------+
               |   Worker Goroutine Pool          |
               |   HTML Sanitization & Normalizer |
               +-----------------+----------------+
                                 |
                                 v
               +----------------------------------+
               |   EventPublisher Interface       |
               +-----------------+----------------+
                                 |
          +----------------------+----------------------+
          | (Integrated mode)                           | (Standalone mode)
          v                                             v
   +--------------+                              +--------------+
   | Apache Kafka |                              | Stdout / File|
   | (jobs.new)   |                              | JSON Fixture |
   +--------------+                              +--------------+
```

### Decoupled Publisher Interface

The publisher logic is isolated behind an explicit Go interface (`publisher.go`):
```go
type EventPublisher interface {
    Publish(topic string, key string, payload []byte) error
    Close() error
}
```
This enables zero-infrastructure unit testing via `MockPublisher` and provides the foundation for the planned standalone CLI file output adapter.

---

## 3. Current Capabilities & Baseline Status

- **Unit Tests (`go test -v ./...`):** `[Verified]` — passes cleanly in 0.8s using mock event publisher.
- **Code Hygiene (`go vet ./...`):** `[Verified]` — zero warnings or lint errors.
- **Module Mode (`go test -mod=mod ./...`):** `[Verified]` — compiles and passes without local vendor directory.
- **Known Limitations:**
  - Scraping targets currently consist of hardcoded LinkedIn URL patterns with one source selector set.
  - No dynamic scheduling, per-source rate limiters, or robots.txt compliance manager yet implemented.
  - Startup currently fails immediately if Kafka broker is unavailable when integrated mode runs.

---

## 4. Setup & Local Execution

### Prerequisites

- Go 1.23+
- Node.js (for Playwright browser driver installation)

### Installation

```bash
cd service-scraper

# Download Go module dependencies
go mod download

# Install Playwright browser dependencies (if running headless scraping locally)
go run github.com/playwright-community/playwright-go/cmd/playwright@v0.4901.0 install --with-deps
```

### Configuration

Copy the example configuration:
```bash
cp .env.example .env
```
Key configuration settings (see `.env.example`):
- `KAFKA_BROKER`: Address of Kafka broker (default: `localhost:9092`)
- `KAFKA_JOB_TOPIC`: Event topic (default: `jobs.new`)
- `HEADLESS`: Toggle headless browser execution (default: `true`)

### Running Tests

```bash
go test -v ./...
go vet ./...
```

---

## 5. Planned Standalone Demonstration (Phase P07)

In Phase P07, this Go collection engine will feature a standalone demonstration mode:
- **CLI Local Runner:** Run the scraper against local HTML fixtures or mock targets with `--fixture=sample.html`.
- **JSON File / Console Output:** Route parsed job structures directly to stdout or JSON file with `--output=json` without requiring Kafka or Zookeeper/KRaft.
- **Verified Concurrency:** Measure worker pool throughput and retry backoff cleanly in isolation.

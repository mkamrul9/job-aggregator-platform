# Phase 28: System Observability (Prometheus & Grafana)

## Overview
As our microservice architecture scales, silent failures (like memory leaks or silent crashes) become a severe operational risk. To mitigate this, we implemented robust system observability utilizing Prometheus (for metric scraping and storage) and Grafana (for visual dashboards).

## Implementation Details

### 1. Application Instrumentation
We instrumented `service-notification` (an Express backend) using the `prom-client` package.
- **Default Metrics**: Exposed Node.js internal telemetry, including Event Loop Lag, V8 Heap utilization, and CPU load.
- **Custom Metrics**: Implemented a Prometheus `Counter` metric named `job_notifications_sent_total` to track successful job match email dispatches.
- **Scraping Endpoint**: All data is exposed via a new `/metrics` HTTP route formatted strictly to Prometheus specifications.

### 2. Prometheus Configuration
Created `config-prometheus/prometheus.yml`, configuring a `scrape_interval` of 10s. Prometheus is explicitly targeted to poll `notification-service:4000/metrics` via the internal Docker network.

### 3. Container Orchestration
Integrated two new services into the global `docker-compose.yml`:
- **Prometheus** (`prom/prometheus:latest`): Exposed on port `9090`. Uses a mounted configuration file and a persistent volume (`prometheus_data`).
- **Grafana** (`grafana/grafana:latest`): Exposed on port `3004` (to prevent port collisions). Uses a persistent volume (`grafana_data`) to ensure dashboards and data sources survive container restarts.

## Verification
You can navigate to `http://localhost:3004` to access Grafana (Default login: `admin` / `admin`), attach Prometheus (`http://prometheus:9090`) as a data source, and immediately build graphs tracking internal memory footprints and the custom `job_notifications_sent_total` metric.

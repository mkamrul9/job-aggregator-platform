# Phase 7 & Deployment Fixes

During the initial deployment of our Dockerized microservices via `docker-compose up`, we encountered and resolved several environmental conflicts and configuration issues.

## 1. PostgreSQL Port Conflict

**The Problem:**
The `user-postgres` container failed to bind to port `5432` on the host machine. This occurred because a local PostgreSQL instance was already natively running on Windows and occupying port `5432`, resulting in a `port is already allocated` error.

**The Fix:**
- Updated `docker-compose.yml` to map the container's Postgres instance to host port `5433` instead (`5433:5432`).
- Updated the connection string in `service-user/.env` (`DATABASE_URL`) to target port `5433` so that local development and Prisma commands continue to function correctly.

## 2. Nginx API Gateway Startup Failure

**The Problem:**
The `api-gateway` (Nginx) container immediately crashed upon startup. Nginx strictly verifies upstream server definitions. Since `user-service` and `resume-service` are defined in the config but not yet containerized and running, Nginx could not resolve their hostnames.

**The Fix:**
- Temporarily commented out the missing `upstream` blocks in `nginx/nginx.conf`.
- Replaced the `proxy_pass` directives for those routes with a stub response: `return 501 '{"error": "user_service not containerized yet"}';`. This allows the API gateway to boot successfully and intelligently handle traffic for uncompleted phases.

## 3. Playwright-Go Driver Missing in Container

**The Problem:**
The `scraper-service` successfully connected to MongoDB but failed when attempting to launch the headless browser, throwing the error: `Could not start Playwright: please install the driver (v1.61.1) first`. While we installed the NodeJS Playwright dependencies in the Dockerfile, the Go-specific driver was not present in the container.

**The Fix:**
- Edited `service-scraper/main.go` and injected `playwright.Install()` directly before `playwright.Run()`. This ensures the Go application programmatically downloads its required driver at runtime if it is missing from the container environment.

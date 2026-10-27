# Phase 6: Dockerizing the Foundation

## What We Did
- Created a multi-stage `Dockerfile` for the Golang Scraper Service to minimize image size while accommodating Playwright's system-level dependencies.
- Updated `docker-compose.yml` to orchestrate `api-gateway`, `scraper-service`, and `job-mongo` within the isolated `microservices-net`.
- Developed `deploy-local.sh` to automate environment teardown, rebuilding, and deployment.
- Updated `main.go` to dynamically read the `MONGO_URI` environment variable for Docker Compose networking.

## Why We Did It
- **Multi-Stage Build:** We need Go to compile the binary, but we don't need the Go toolchain in production. By splitting stages, we build with Go, then move the compiled binary to a lightweight Ubuntu environment where we only install Node/Playwright for JavaScript rendering.
- **Docker Compose:** Managing separate terminal tabs for Mongo, Nginx, and Scrapers is error-prone. Compose handles network resolution automatically (e.g., `MONGO_URI=mongodb://job-mongo:27017` routes internally without exposing ports to the public internet).
- **Automation:** The bash script guarantees a reproducible, clean state every time we deploy locally.

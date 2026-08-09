# Phase 27: CI/CD Pipeline (GitHub Actions)

## Overview
We established Continuous Integration (CI) across our entire platform using GitHub Actions. Automation minimizes regression risks and guarantees stability when collaborating on a distributed system. The CI pipeline operates simultaneously across Go, Python, and Node.js environments.

## Architecture

The `.github/workflows/ci-pipeline.yml` file is defined at the repository root and triggers upon any push or pull request to the `main` branch. It utilizes a strategy known as parallel job execution coupled with dependency gating.

### Isolated Testing Environments (Parallel Execution)
Instead of running tests sequentially on a single virtual machine—which would dramatically slow down developer velocity—the pipeline leverages three distinct, concurrent Ubuntu virtual machines:
1. **`test-scraper`**: Provisions Go 1.22 and runs the core scraper tests.
2. **`test-ai-parser`**: Provisions Python 3.11, installs system and module dependencies (`spaCy`, models, PyTest), and executes API integrations.
3. **`test-user-service`**: Provisions Node.js 20, builds the Prisma Client engine, and runs Jest.

### Dependency Gating (`needs`)
The final job, **`build-docker-images`**, initiates `docker compose build`. This job features a strict `needs: [test-scraper, test-ai-parser, test-user-service]` directive.
- If **any** of the concurrent tests fail (e.g., due to a broken PR), the workflow immediately halts.
- Docker builds are strictly gated, guaranteeing that broken application images are never compiled and ultimately preventing failures from reaching the registry or deployment servers.

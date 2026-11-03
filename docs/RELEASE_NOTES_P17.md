# Seekers Platform Release Notes — v1.0.0-rc1 (Phase 17)

**Release:** Seekers Microservices Job Aggregator & Candidate Intelligence Platform  
**Version:** `v1.0.0-rc1` (Release Candidate 1)  
**Branch:** `codex/production-p17-qualified-production-launch`  
**License:** MIT  

---

## What's in v1.0.0-rc1

### 1. Unified Architecture Across 7 Specialized Projects
- **Candidate Web App (`frontend-next/`):** Next.js 16.3 (App Router), React 19.2, Tailwind CSS. Real-time faceted search, keyset cursor pagination, application tracking Kanban, private PDF resume upload, accessible ARIA landmarking.
- **Operations Console (`frontend-admin/`):** Angular 19.2, standalone components, RxJS reactive streams, Signals. Live crawler monitoring, catalog moderation queues, in-memory zero-credential preview engine.
- **Resume NLP Extractor (`service-resume/`):** Python 3.11+, spaCy NLP entity matcher, pypdf text-layer extraction, FastAPI REST & gRPC dual servers with in-memory parsing (zero persistent storage).
- **Distributed Collector (`service-scraper/`):** Go 1.23, standard library `net/http`, Rod headless browsing, SSRF private IP protection, token-bucket rate limiting.
- **Identity & Workspace (`service-user/`):** NestJS 11, Prisma ORM, PostgreSQL 15. Server-enforced beta allowlist, GDPR-compliant export bundles, 30-day deletion grace period with durable tombstone fencing.
- **Catalog & Ingestion (`service-ingestion/`):** Node.js 22, Express 5, MongoDB 7.0, Elasticsearch 8.10. Canonical URL deduplication, zero-downtime index alias swaps, DLQ poison event quarantine.
- **Notification Engine (`service-notification/`):** Node.js 22, Socket.io 4, Nodemailer. Preference matching, RFC 8058 one-click unsubscribe, global suppression fencing.

### 2. Operational Invariants Certified
- **Fail-Closed Security:** Rejection of insecure default credentials, weak tokens, and wildcard CORS in production mode.
- **Proven Operating Envelope:** Certified for **Tier 0** launch (10,000 candidate accounts, 1,000 DAU, 100 concurrent sessions, 50k–100k jobs).
- **Disaster Recovery:** Signed HMAC backup manifests and tested rollback recovery pipelines (`scripts/rollback-staging.js`).
- **Progressive Canary Rollout:** 4-stage rollout runner (`scripts/launch-production.js`) with automated circuit breakers.

### 3. Quickstart & Verification Commands
```bash
# 1. Validate all contracts, schemas, and launch gates:
node contracts/validate-contracts.js
node scripts/test-launch-gates.js
node scripts/qualify-beta-journeys.js

# 2. Execute local production launch simulation:
node scripts/launch-production.js --demo

# 3. Verify Docker topology:
docker compose -f docker-compose.staging.yml config
```


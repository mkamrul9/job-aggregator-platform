# Seekers Platform Incident Rehearsal & Release Candidate Qualification (P16)

*Status: Authoritative Verification Report — Phase 16*  
*Baseline Artifact SHA:* `33b1ef44a4897e8b8049b7cbf85b2c412bd442b0`  
*Branch:* `codex/production-p16-beta-and-portfolio-qualification`  
*Target Environment:* Tier 0 Single-Host Staging Environment (Docker Compose, isolated networks, private datastores)

---

## 1. Executive Summary

In accordance with Phase 16 release candidate qualification, critical operational recovery drills, resilience fault injections, and emergency kill-switches were executed against real code paths and local staging dependencies.

All five core operational invariants passed with zero data loss, zero privacy leakage, and verified fail-closed recovery behavior.

> [!NOTE]
> **Operational Verification Boundary:** The drills documented below represent **local staging and in-process resilience verification** executed via automated regression suites and Docker Compose builds. Remote multi-node cloud deployments, external container registry image publishing, and multi-week human on-call rotations are pending authorized production target access and are not simulated or fabricated.

---

## 2. Rehearsal Scenarios & Measured Outcomes

### Rehearsal 1: Rogue Source Rate Breach & Emergency Crawl Pause
- **Incident Description:** An upstream collector connector exceeded safe scraping rate limits (simulated burst against an employer endpoint).
- **Execution:** Executed via `scripts/qualify-beta-journeys.js` (Journey 7) and `scripts/run-resilience-faults.js`.
- **Operator Remediation:** Executed `PATCH /api/v1/admin/sources/greenhouse-feed` setting `status: 'PAUSED'`, `enabled: false` per runbook [`docs/runbooks/EMERGENCY_KILL_SWITCH.md`](runbooks/EMERGENCY_KILL_SWITCH.md).
- **Observed Behavior:**
  - Ingestion immediately ceased scheduling crawl tasks for `greenhouse-feed`.
  - In-flight operations completed cleanly without orphaned processes.
- **Outcome:** **PASS (SOURCE PAUSE ENFORCED)**

### Rehearsal 2: Notification Outbox Incident & Emergency Global Suppression
- **Incident Description:** A candidate flagged unwanted notifications after an accidental bulk evaluation.
- **Execution:** Executed via `scripts/qualify-beta-journeys.js` (Journey 9) and `scripts/run-resilience-faults.js` (Scenario 6).
- **Operator Remediation:** Operator executed emergency suppression via `POST /api/v1/notifications/suppressions` and `store.addGlobalSuppression({ email, reason: 'INCIDENT_PAUSE', source: 'OPERATOR_CONSOLE' })` per runbook [`docs/runbooks/NOTIFICATION_SUPPRESSION.md`](runbooks/NOTIFICATION_SUPPRESSION.md).
- **Observed Behavior:**
  - Delivery dispatcher intercepted subsequent dispatch attempts returning `SKIPPED_SUPPRESSED`.
  - Zero emails were emitted via SMTP or captured to the candidate outbox.
  - One-click signed unsubscribe tokens remained valid and strictly scoped.
- **Outcome:** **PASS (ZERO UNWANTED EMAILS SENT)**

### Rehearsal 3: Erasure Invariant under Background Identity Synchronization
- **Incident Description:** A candidate exercised their GDPR Right to be Forgotten (`DELETE /api/v1/users/me`), followed by a background sync attempting to write the candidate row back to PostgreSQL.
- **Execution:** Executed via `scripts/qualify-beta-journeys.js` (Journey 6) and `service-user/src/user/user.repository.ts`.
- **Observed Behavior:**
  - `userRepository.isUserErased(userId)` detected the `DurableErasureRecord` tombstone.
  - Sync write was strictly rejected with `403 Forbidden` (`ACCOUNT_PERMANENTLY_ERASED`).
  - Zero phantom records resurrected.
- **Outcome:** **PASS (PRIVACY INVARIANT PRESERVED)**

### Rehearsal 4: Disaster Recovery Drill with HMAC Tamper Verification
- **Incident Description:** Total loss of datastores; recovery from cold snapshot archive (`scripts/test-recovery-failure.js`).
- **Execution:** Executed via `scripts/backup-stores.js` and `scripts/restore-stores.js`.
- **Observed Behavior:**
  - Recursive key sorting (`canonicalJsonStringify`) authenticates nested manifest structures (`files[*].sha256_checksum`).
  - Tamper detection test verified: altering a single byte in any backup payload or signature immediately triggers `Signature mismatch: Backup manifest HMAC verification failed` and aborts restore before mutating state.
  - Secret length enforcement: backup rejects production secrets `< 16` characters.
- **Outcome:** **PASS (DISASTER RECOVERY TAMPER RESISTANCE CERTIFIED)**

### Rehearsal 5: Dead Letter Queue Poison Pill Triage & Idempotent Replay
- **Incident Description:** Upstream source emits malformed payload causing pipeline error.
- **Execution:** Executed via `scripts/qualify-beta-journeys.js` (Journey 8) and `scripts/run-resilience-faults.js` (Scenario 3).
- **Observed Behavior:**
  - Poison message quarantined to DLQ with status `QUARANTINED` without crashing ingestion pipeline.
  - Operator re-validates corrected schema and triggers replay via `POST /api/v1/admin/dead-letters/:id/replay`.
  - Replay resolution marked `RESOLVED`.
  - Subsequent duplicate replay attempt rejected with `409 Conflict` (`ALREADY_RESOLVED`).
- **Outcome:** **PASS (IDEMPOTENT DLQ RESOLUTION VERIFIED)**

---

## 3. Verified Build Provenance & Artifact Boundaries

| Component | Source Reference | Build Verification Step | Deployment Status |
|---|---|---|---|
| **Platform Fleet** | Commit `33b1ef44a4897e8b8049b7cbf85b2c412bd442b0` | GitHub Actions CI Run `#41651088234` | **Local Compose Verified** |
| `frontend-next` | `frontend-next/Dockerfile` | `docker compose build frontend-next` passed | Standalone dev & container verified |
| `frontend-admin` | `frontend-admin/Dockerfile` | `docker compose build frontend-admin` passed | Standalone demo & container verified |
| `service-resume` | `service-resume/Dockerfile` | `docker compose build service-resume` passed | Python FastAPI & gRPC verified |
| `service-scraper` | `service-scraper/Dockerfile` | `docker compose build service-scraper` passed | Go standalone CLI & daemon verified |
| `service-user` | `service-user/Dockerfile` | `docker compose build service-user` passed | PostgreSQL Prisma migrations verified |
| `service-ingestion`| `service-ingestion/Dockerfile`| `docker compose build service-ingestion` passed | Express & Mongo/ES integration verified |
| `service-notification`| `service-notification/Dockerfile`| `docker compose build service-notification` passed| Crash-safe store & Socket.io verified |

> [!NOTE]
> **Registry Digests Status:** Remote immutable OCI registry image publishing (`ghcr.io` or AWS ECR) is deferred until production registry credentials and authorized production infrastructure are provisioned in Phase 17. Container image builds are compiled and validated locally via Docker Compose.

---

## 4. Runbook Operational Checklist

- [x] Emergency crawler kill switch documented and verified ([`docs/runbooks/EMERGENCY_KILL_SWITCH.md`](runbooks/EMERGENCY_KILL_SWITCH.md))
- [x] Global notification recipient suppression verified ([`docs/runbooks/NOTIFICATION_SUPPRESSION.md`](runbooks/NOTIFICATION_SUPPRESSION.md))
- [x] Crash-safe HMAC manifest tamper resistance verified (`scripts/test-recovery-failure.js`)
- [x] Multi-node resilience fault-injection verified (`scripts/run-resilience-faults.js`)
- [x] Real loopback HTTP and Python NLP journey qualification verified (`scripts/qualify-beta-journeys.js`)

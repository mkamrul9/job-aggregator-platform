# Seekers Platform Bounded Beta Operational Plan (P16)

*Status: Authoritative Beta Operational Plan & Qualification Framework — Phase 16*  
*Verified P15 Baseline SHA:* 1d26ca2e961fcad92ad4996727a8da72d7613e57  
*Branch:* `codex/production-p16-beta-and-portfolio-qualification`  
*Target Environment:* Tier 0 Single-Node Staging Baseline (4 vCPU, 8 GB RAM, containerized datastores)

> [!IMPORTANT]
> **Operational Boundary Notice:** The cohort limits (50 candidates, 5 operators) and 14-day observation window described herein represent the **planned beta envelope**. External human participant observation, cohort onboarding, and operational feedback have NOT yet elapsed and remain an explicit unmet external gate pending human launch authorization. All underlying server-enforced quotas, role boundaries, runbooks, and fail-closed security mechanisms are fully engineered, integrated, and verified.

---

## 1. Beta Cohort Definition & Server-Enforced Access Controls

To ensure strict operational safety and bounded resource consumption, the Phase 16 beta architecture implements server-enforced cohort access:

- **Planned Candidate Cohort:** Maximum 50 invited beta candidates (`BETA_MAX_PARTICIPANTS=50`).
- **Planned Operator Cohort:** 5 authorized platform operators (1 Administrator, 2 Operators, 2 Read-Only Auditors).
- **Server-Enforced Access Control:**
  - Public registration without an allowlisted email or invitation token is blocked at the API boundary when `BETA_ALLOWLIST_ENABLED=true` (`POST /api/v1/users/sync` throws `403 Forbidden` with `code: 'BETA_INVITE_REQUIRED'`).
  - Once active registered candidates reach the ceiling, subsequent signups fail closed (`403 Forbidden` with `code: 'BETA_CAPACITY_REACHED'`).
- **Role Isolation & Authorization:**
  - Candidates access only `/api/v1/users/me`, candidate workspace, resume upload, and public search.
  - Candidate tokens attempting to reach `/api/v1/admin/*` receive `403 Forbidden` (`INSUFFICIENT_PRIVILEGES`).
  - Operators authenticate with explicit `x-admin-key`, `x-service-key`, or HS256 JWT tokens.

---

## 2. Resource Quotas & Daily Ceilings

To remain well within the measured Tier 0 capacity envelope and prevent unintended external provider usage:

| Resource Dimension | Planned Daily Ceiling | Enforcement Mechanism | Status |
|---|---|---|---|
| **Resume Submissions** | 5 uploads / candidate / day (Max 10 MB PDF) | Server validation (`MAX_UPLOAD_BYTES = 10MB` in `StorageService`) + async worker bounds | **Implemented & Verified** |
| **Search Queries** | Max 10 req/sec / IP | Rate limiter middleware (HTTP `429 Too Many Requests`) | **Implemented & Verified** |
| **Source Collection** | Strictly throttled to approved internal fixture sources | Go scraper rate limiter (`MaxRequestsPerMinute: 60`, 2 req/sec, burst 5) | **Implemented & Verified** |
| **Notification Alerts** | Maximum 2 digest alerts / candidate / day | Notification outbox frequency check (`DAILY` default) | **Implemented & Verified** |
| **Email Delivery Mode** | `NOTIFICATION_MODE=CAPTURE` (Local persistent outbox) | Zero unsolicited external SMTP emails emitted during testing/rehearsal | **Implemented & Verified** |
| **Object Storage Retention** | 30 days active; immediate purge of resume file on request | Private MinIO/S3 object storage deletion (`StorageService.deleteObject`) | **Implemented & Verified** |

---

## 3. Critical Candidate & Operator Journeys

### 3.1 Candidate Journeys (Verified via Live Loopback HTTP)
1. **Discovery & Search:** Multi-facet keyword queries, keyset cursor pagination (`cursor=v1...`), filtering by `remote_eligibility` and compensation, outbound destination tracking with tracking parameter stripping (`utm_*`, `fbclid`).
2. **Identity & Onboarding:** Authenticated profile creation, skill confirmation, salary expectation setting, and multi-tab session management.
3. **Resume Intelligence:** Multi-part PDF upload -> Python text stream parsing (spaCy + pypdf) -> entity extraction -> candidate review/edit screen -> candidate-confirmed skill persistence.
4. **Workspace State:** Application tracker (`APPLIED`, `INTERVIEWING`, `OFFER`, `REJECTED`) with optimistic concurrency version fencing (HTTP `409 Conflict` on concurrent race).
5. **Recommendations & Scoped Unsubscribe:** Deterministic explainable matching scores, hard exclusions (salary floor, remote mismatch), and cryptographic HMAC-signed one-click unsubscribe links (`scope=subscription`).
6. **Privacy & GDPR Rights:** Instant JSON data portability export, scheduled account deletion with 30-day grace period, and durable erasure tombstone fencing against silent resurrection.

### 3.2 Operator Journeys (Verified via Live Loopback HTTP)
1. **Source Operations:** Registered sources registry inspection, legal provenance verification, manual crawl dispatch, and emergency source pausing (`/api/v1/sources/:id/pause`).
2. **Catalog Moderation:** Privileged catalog search across all moderation statuses (`ACTIVE`, `FLAGGED`, `EXPIRED`), atomic revision advance, and outbox projection status tracking (`PENDING` -> `INDEXED`).
3. **Dead Letter Queue Triage:** Inspection of quarantined poison events, re-validation against authoritative JSON Schemas, and idempotent replay resolution (HTTP `409 ALREADY_RESOLVED`).
4. **Incident Kill Switches:** Instant global recipient suppression (`addGlobalSuppression`), crawler pause (`updateSourceStatus(PAUSED)`), and outbox drain.

---

## 4. Support, Escalation & Incident Response

### 4.1 Support Channels & Maintained Routes
- **Candidate Problem Reporting:** Authenticated or public issue submission via `POST /reports` or `POST /api/v1/reports` (reference number tracking via `GET /reports/:referenceOrId`).
- **Operator Triage Queue:** Privileged listing reports queue via `GET /admin/reports` and triage status update via `PATCH /admin/reports/:id` (strictly guarded by `RolesGuard` requiring `ADMIN` or `OPERATOR`).
- **Severity 1 (P1 - Data Loss, Security/Privacy Breach, Service Outage):** Execution of runbook [`docs/runbooks/EMERGENCY_KILL_SWITCH.md`](runbooks/EMERGENCY_KILL_SWITCH.md) and [`docs/runbooks/NOTIFICATION_SUPPRESSION.md`](runbooks/NOTIFICATION_SUPPRESSION.md).
- **Severity 2 (P2 - Search Degradation, Parser Timeout, Stale Outbox):** Resolution via outbox projection worker or fallback indexing.
- **Severity 3 (P3 - Minor UI Inconsistency, Non-blocking Filter Bug):** Triage into subsequent development backlog.

### 4.2 Hold & Rollback Criteria
The beta will be halted immediately and rolled back to prior stable release if:
1. Any cross-user privacy leak occurs (candidate A accessing candidate B's profile or resume).
2. Permanent account erasure tombstone is breached (resurrecting an erased candidate).
3. Search p95 exceeds 500 ms for > 5 consecutive minutes under offered load < 50 RPS.
4. Kafka Dead Letter Queue backlog exceeds 50 poison messages in 1 hour.

---

## 5. Participant Disclosure & Privacy Commitments

Every beta participant is presented with clear, plain-language disclosure upon onboarding:
- Resumes are parsed using local, self-hosted Python NLP models (spaCy `en_core_web_sm` and `pypdf`); zero candidate data is shared with third-party LLM APIs.
- Candidate profiles are visible only to the candidate and authorized platform operators.
- Outbound application links direct candidates to employer websites; Seekers does not submit applications on candidates' behalf without confirmation.
- **Distinct Lifecycle Disclosures:**
  - *Resume Document Removal:* Immediate deletion of the PDF file from private object storage upon candidate request (`DELETE /api/v1/users/resume`).
  - *Account Deletion:* Schedules a 30-day grace period with durable erasure tombstones created to permanently block account resurrection during background synchronization.

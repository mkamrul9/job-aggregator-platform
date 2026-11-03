# Seekers Platform Bounded Beta Operational Plan (P16)

*Status: Authoritative Release Candidate Operational Specification — Phase 16*  
*Baseline Artifact SHA:* `98c92e24ff505584549e23364b7a8efc99075ed1`  
*Branch:* `codex/production-p16-beta-and-portfolio-qualification`  
*Approved Tier:* Tier 0 Single-Node Staging Baseline (4 vCPU, 8 GB RAM, containerized datastores)

---

## 1. Beta Cohort Definition & Access Controls

To ensure strict operational safety and bounded resource consumption, the Phase 16 beta is constrained to an authorized, closed cohort:

- **Candidate Participants:** Maximum 50 invited beta candidates.
- **Operator Participants:** 5 authorized platform operators (1 Administrator, 2 Operators, 2 Read-Only Auditors).
- **Access Model:** Server-enforced invitation tokens and JWT sessions; public registration without invitation is disabled.
- **Role Isolation:**
  - Candidates access only `/api/v1/users/me`, candidate workspace, resume upload, and public search.
  - Candidate tokens attempting to reach `/admin/*` receive `403 Forbidden` (`FORBIDDEN_OPERATOR_REQUIRED`).
  - Operators authenticate with explicit `x-admin-key` or HMAC-signed operator tokens with minimum 16-character secret length.

---

## 2. Resource Quotas & Daily Ceilings

To remain well within the measured Tier 0 capacity envelope and avoid unintended external provider usage:

| Resource Dimension | Beta Daily Ceiling | Enforcement Mechanism |
|---|---|---|
| **Resume Submissions** | 5 uploads / candidate / day (Max 10 MB PDF) | In-memory token bucket + PostgreSQL quota check |
| **Search Queries** | Max 10 requests / second / IP | Rate limiter middleware (HTTP 429 Too Many Requests) |
| **Source Collection** | Strictly throttled to approved internal fixture sources | Go scraper rate limiter (`MaxRequestsPerMinute: 60`) |
| **Notification Alerts** | Maximum 2 digest alerts / candidate / day | Notification outbox frequency check (`DAILY` default) |
| **Email Delivery Mode** | `NOTIFICATION_MODE=CAPTURE` (Local persistent outbox) | Zero unsolicited external SMTP emails |
| **Object Storage Retention** | 30 days active; immediate purge on candidate request | Private MinIO/S3 object lifecycle policies |

---

## 3. Critical Candidate & Operator Journeys

### 3.1 Candidate Journeys Qualified
1. **Discovery & Search:** Multi-facet keyword queries, keyset cursor pagination (`cursor=v1...`), filtering by `remote_eligibility` and compensation, outbound destination tracking with tracking parameter stripping (`utm_*`, `fbclid`).
2. **Identity & Onboarding:** Authenticated profile creation, skill confirmation, salary expectation setting, and multi-tab session management.
3. **Resume Intelligence:** Multi-part PDF upload -> text stream parsing -> entity extraction -> candidate review/edit screen -> candidate-confirmed skill persistence.
4. **Workspace State:** Application tracker (`APPLIED`, `INTERVIEWING`, `OFFER`, `REJECTED`) with optimistic concurrency version fencing (HTTP `409 Conflict` on concurrent race).
5. **Recommendations & Scoped Unsubscribe:** Deterministic explainable matching scores, hard exclusions (salary floor, remote mismatch), and cryptographic HMAC-signed one-click unsubscribe links (`scope=subscription`).
6. **Privacy & GDPR Rights:** Instant JSON data portability export, scheduled account deletion with 30-day grace period, and durable erasure tombstone fencing against silent resurrection.

### 3.2 Operator Journeys Qualified
1. **Source Operations:** Registered sources registry inspection, legal provenance verification, manual crawl dispatch, and emergency source pausing.
2. **Catalog Moderation:** Privileged catalog search across all moderation statuses (`ACTIVE`, `FLAGGED`, `EXPIRED`), atomic revision advance, and outbox projection status tracking (`PENDING` -> `INDEXED`).
3. **Dead Letter Queue Triage:** Inspection of quarantined poison events, re-validation against authoritative JSON Schemas, and idempotent replay resolution (HTTP `409 ALREADY_RESOLVED`).
4. **Incident Kill Switches:** Instant global recipient suppression (`addGlobalSuppression`), crawler pause (`updateSourceStatus(PAUSED)`), and outbox drain.

---

## 4. Support, Escalation & Incident Response

### 4.1 On-Call Roster & Support Channels
- **Primary Support Channel:** Authenticated support ticket submission via Candidate Portal (`POST /api/v1/support/tickets`).
- **Triage Window:** 09:00 – 18:00 UTC, Monday through Friday.
- **Severity 1 (P1 - Data Loss, Security/Privacy Breach, Service Outage):** Escalation to Technical Lead within 15 minutes; immediate execution of runbook `runbooks/EMERGENCY_KILL_SWITCH.md`.
- **Severity 2 (P2 - Search Degradation, Parser Timeout, Stale Outbox):** Resolution within 2 hours via outbox reconciliation worker or fallback indexing.
- **Severity 3 (P3 - Minor UI Inconsistency, Non-blocking Filter Bug):** Triage into subsequent sprint backlog.

### 4.2 Hold & Rollback Criteria
The beta will be halted immediately and rolled back to prior stable release if:
1. Any cross-user privacy leak occurs (candidate A accessing candidate B's profile or resume).
2. Permanent account erasure tombstone is breached (resurrecting an erased candidate).
3. Search p95 exceeds 500 ms for > 5 consecutive minutes under offered load < 50 RPS.
4. Kafka Dead Letter Queue backlog exceeds 50 poison messages in 1 hour.

---

## 5. Participant Disclosure & Privacy Commitments

Every beta participant is presented with clear, plain-language disclosure upon onboarding:
- Resumes are parsed using local, self-hosted NLP models; no candidate data is shared with third-party LLM providers.
- Candidate profiles are visible only to the candidate and authorized platform operators.
- Outbound application links direct candidates to employer websites; Seekers does not submit applications on candidates' behalf without confirmation.
- Participants may export all account data or trigger immediate permanent erasure at any time via the Candidate Settings interface.

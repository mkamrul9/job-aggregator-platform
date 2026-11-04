# Seekers Bounded Beta Qualification & Observation Report (P16)

*Status: Authoritative Beta Qualification & Operational Readiness Evidence*  
*Baseline SHA:* `b7bd931d34c2f6710dd5b8ea487090833803bd02` (Actions Run `41874516254`, 9/9 Green)  
*Branch:* `codex/production-p16-beta-and-portfolio-qualification`  
*Target Environment:* Tier 0 Baseline Staging (4 vCPU, 8 GB RAM, containerized datastores: PostgreSQL 15, MongoDB 6, Elasticsearch 8.10, Kafka 3.6, Redis 7, MinIO)  
*Monitored Support Owner:* Platform Reliability Lead (`oncall@seekers.internal` / `@sre-lead`)

---

## 1. Beta Cohort Boundary & Server Controls

The beta admission gate is enforced fail-closed at the identity service boundary (`UserService` and `UserRepository`):

| Control Dimension | Configuration | Server-Enforced Mechanism | Verification Status |
|---|---|---|---|
| **Candidate Participant Ceiling** | `BETA_MAX_PARTICIPANTS=50` | Atomic PostgreSQL transaction advisory lock (`pg_advisory_xact_lock(987654321)`) serializing candidate count check and creation across all processes | **VERIFIED (Maintained UserRepository & 2 Independent Pools)** |
| **Controlled Negative Proving** | Unfenced negative control | Controlled test running concurrent inserts bypassing the advisory lock overran capacity (6/5), proving the fence is strictly necessary | **VERIFIED (Negative Proof)** |
| **Allowlist Enforcement** | `BETA_ALLOWLIST_ENABLED=true` | Rejects empty allowlist fail-closed (`BETA_INVITE_REQUIRED`); unlisted email addresses blocked with 403 Forbidden | **VERIFIED** |
| **Identity Verification** | Mandatory verified email | Requires `emailVerified === true` at registration (`BETA_EMAIL_VERIFICATION_REQUIRED`) | **VERIFIED** |
| **Existing User Continuity** | Session update idempotency | Returning users update session tokens and profiles without consuming cohort quota | **VERIFIED** |
| **Configuration Guard** | Positive integer ceiling | Malformed non-integer or negative `BETA_MAX_PARTICIPANTS` fails closed with 403 `BETA_CONFIG_INVALID` | **VERIFIED** |
| **GDPR Erasure Fencing** | 30-day grace period tombstones | Erasure tombstones block account recreation and sync resurrection (`ACCOUNT_PERMANENTLY_ERASED`) | **VERIFIED** |
| **Resume Extraction Quota** | 5 uploads / candidate / day | Max 10 MB per PDF; processed locally by Python `spaCy` + `pypdf` (zero external LLM API egress) | **VERIFIED** |
| **Notification Safety** | `NOTIFICATION_MODE=CAPTURE` | Outbox dispatches to durable local store with zero third-party SMTP leaks | **VERIFIED** |

---

## 2. Maintained Services End-to-End Qualification

The critical candidate and operator workflows were executed through the actual maintained application entry points in `scripts/qualify-beta-journeys.js`:
- **Strict Mode Enforcement:** Release qualification requires maintained `service-ingestion` and `service-notification` Express applications; zero-dependency fallback is permitted only when `--mode=component` is explicitly passed.
- **Ingestion Application:** Mounted `createIngestionApp` from `service-ingestion` handling search, detail queries, safe outbound redirection (stripping tracking parameters), and privileged admin routes (`/api/v1/admin/*`).
- **Notification Application:** Mounted `createNotificationApp` from `service-notification` handling RFC 8058 two-phase HMAC unsubscribe and emergency recipient suppression.
- **Python NLP Parser:** Direct execution of `service-resume/main.py` byte stream parsing, extracting technical competencies while failing closed with `INVALID_PDF_SIGNATURE` on corrupt byte streams.
- **Results:** 9 out of 9 critical journeys passed with zero regressions.

### Verification Level Classification Matrix
```
  Journey 1  [Integration] Candidate Discovery & Outbound Redirect (Express)
  Journey 2  [Integration] Cryptographic Auth Tokens & Role Isolation (JWT)
  Journey 3  [Integration] Private Resume NLP Byte Stream Extraction (spaCy)
  Journey 4  [Integration] Workspace Application Tracking & Concurrency (409)
  Journey 5  [Integration] Explainable Recommendations & RFC 8058 Unsubscribe
  Journey 6  [Integration] GDPR Portability Export & 30-Day Erasure Tombstone
  Journey 7  [Integration] Operator Catalog Moderation & Revision Fence (409)
  Journey 8  [Integration] Dead Letter Queue Poison Triage & Idempotent Replay
  Journey 9  [Integration] Incident Suppression & Outbox Kill-Switch (CAPTURE)
  Negative   [Integration] Offline Service Refusal & Fail-Closed Fencing
  Portfolio  [Browser/API] 7 Independent Standalone Showcases Verified
  Rehearsal  [Staging]     Isolated Restore, Rollback & Disaster Drills
```

---

## 3. Seven Standalone Evaluated Packages

All seven independent portfolio packages were verified from clean state:
1. `frontend-admin`: Angular 19.2 operations showcase bundle built cleanly (`ng build`, 536.94 kB).
2. `frontend-next`: Next.js 16.3 / React 19.2 production application built cleanly (`next build`), 17 regression checks passed.
3. `service-resume`: Python 3.14 FastAPI service, 17/17 pytest tests passed, verified PDF parsing.
4. `service-scraper`: Go 1.23 crawler, CLI mode verified parsing ATS fixtures (`go run . -mode cli -fixture ...`).
5. `service-user`: NestJS 11 + Prisma identity service, 136/136 tests passed, ESLint clean.
6. `service-ingestion`: Node.js 20 event ingestion, 87/87 tests passed (dual-write, DLQ quarantine, admin router).
7. `service-notification`: Node.js 20 notifications, 44/44 tests passed (HMAC tokens, suppression fencing).

---

## 4. Human Beta Cohort Observation Status

> [!IMPORTANT]
> **Observation Window Gate Status: AUTHORIZED & 14-DAY OBSERVATION IN PROGRESS**
> - **Owner Approval Granted:** On 4 November 2026, the platform owner explicitly approved the invitation dispatch and initiated the 14-day observation window.
> - **Cohort Scope:** Strictly bounded to 50 candidate participants and 5 platform operators under `BETA_MAX_PARTICIPANTS=50`.
> - **Active Observation Window:** 5 November 2026 – 19 November 2026 (14 calendar days).
> - **In-Flight Telemetry:** Recording anonymized task completion across mobile and desktop devices (discovery, profile completion, resume extraction, application tracking, recommendations, and GDPR rights).
> - **Support & Hold Posture:** Platform Reliability Lead actively monitoring triage queues; hold thresholds in effect (search p95 > 500ms, DLQ > 50, zero tolerance for privacy/erasure breaches).
> - **Release Gate Status:** Per `PHASE_16_BETA_PROMPT.md` §16 and `PRODUCTION_ROADMAP.md` §5 (P16/P17), the observation window is currently in-flight across its agreed 14-day duration. **STOP BEFORE PHASE 17** until the 14-day observation period has elapsed, aggregate task results are cataloged, and final closeout authorization is granted.

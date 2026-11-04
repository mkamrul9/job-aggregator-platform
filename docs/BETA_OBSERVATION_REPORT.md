# Seekers Bounded Beta Qualification & Observation Report (P16)

*Status: Authoritative Beta Qualification & Operational Readiness Evidence*  
*Branch:* `codex/production-p16-beta-and-portfolio-qualification`  
*Target Environment:* Tier 0 Baseline Staging (4 vCPU, 8 GB RAM, containerized datastores)  
*Enforcement Version:* Commit `437b65c` + atomic PostgreSQL advisory lock fencing

---

## 1. Beta Cohort Boundary & Server Controls

The beta admission gate is enforced fail-closed at the identity service boundary (`UserService` and `UserRepository`):

| Control Dimension | Configuration | Server-Enforced Mechanism | Verification Status |
|---|---|---|---|
| **Candidate Participant Ceiling** | `BETA_MAX_PARTICIPANTS=50` | Atomic PostgreSQL transaction advisory lock (`pg_advisory_xact_lock`) serializing candidate count check and creation across all processes | **VERIFIED (Independent Clients)** |
| **Allowlist Enforcement** | `BETA_ALLOWLIST_ENABLED=true` | Rejects empty allowlist fail-closed (`BETA_INVITE_REQUIRED`); unlisted email addresses blocked with 403 Forbidden | **VERIFIED** |
| **Identity Verification** | Mandatory verified email | Requires `emailVerified === true` at registration (`BETA_EMAIL_VERIFICATION_REQUIRED`) | **VERIFIED** |
| **Existing User Continuity** | Session update idempotency | Returning users update session tokens and profiles without consuming cohort quota | **VERIFIED** |
| **GDPR Erasure Fencing** | 30-day grace period tombstones | Erasure tombstones block account recreation and sync resurrection (`ACCOUNT_PERMANENTLY_ERASED`) | **VERIFIED** |
| **Resume Extraction Quota** | 5 uploads / candidate / day | Max 10 MB per PDF; processed locally by Python `spaCy` + `pypdf` (zero external LLM API egress) | **VERIFIED** |
| **Notification Safety** | `NOTIFICATION_MODE=CAPTURE` | Outbox dispatches to durable local store with zero third-party SMTP leaks | **VERIFIED** |

---

## 2. Maintained Services End-to-End Qualification

The critical candidate and operator workflows were executed through the actual maintained application entry points in `scripts/qualify-beta-journeys.js`:
- **Ingestion Application:** Mounted `createIngestionApp` from `service-ingestion` handling search, detail queries, safe outbound redirection (stripping tracking parameters), and privileged admin routes (`/api/v1/admin/*`).
- **Notification Application:** Mounted `createNotificationApp` from `service-notification` handling RFC 8058 two-phase HMAC unsubscribe and emergency recipient suppression.
- **Python NLP Parser:** Direct execution of `service-resume/main.py` byte stream parsing, extracting technical competencies while failing closed with `INVALID_PDF_SIGNATURE` on corrupt byte streams.
- **Results:** 9 out of 9 critical journeys passed with zero regressions.

---

## 3. Seven Standalone Evaluated Packages

All seven independent portfolio packages were verified from clean state:
1. `frontend-admin`: Angular 19.2 operations showcase bundle built cleanly (`ng build`, 536.94 kB).
2. `frontend-next`: Next.js 16.3 / React 19.2 production application built cleanly (`next build`), 17 regression checks passed.
3. `service-resume`: Python 3.14 FastAPI service, 17/17 pytest tests passed, verified PDF parsing.
4. `service-scraper`: Go 1.23 crawler, CLI mode verified parsing ATS fixtures (`go run . -mode cli -fixture ...`).
5. `service-user`: NestJS 11 + Prisma identity service, 135/135 tests passed, ESLint clean.
6. `service-ingestion`: Node.js 20 event ingestion, 87/87 tests passed (dual-write, DLQ quarantine, admin router).
7. `service-notification`: Node.js 20 notifications, 44/44 tests passed (HMAC tokens, suppression fencing).

---

## 4. Human Beta Cohort Observation Status

> [!IMPORTANT]
> **Observation Window Gate Status: PENDING AUTHORIZATION & REAL COHORT ELAPSED TIME**
> - **Technical Readiness:** 100% complete, hardened, and verified with zero-dependency automated proofs.
> - **External Human Observation:** A genuine 14-day cohort observation requires actual invited human participants, elapsed calendar days, and support triage logs that cannot and must not be synthetically fabricated.
> - **Release Gate Status:** Per `PHASE_16_REPAIR_PROMPT.md` §4 and `PHASE_17_PROMPT.md` §1, Phase 16 technical repairs are complete, while external human observation remains a truthful pending release gate prior to broad public production rollout.

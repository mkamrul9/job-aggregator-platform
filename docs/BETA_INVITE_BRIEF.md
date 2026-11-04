# Seekers Platform Bounded Beta Invite & Operational Brief (P16)

*Status: Authoritative Beta Invite Brief & Launch Proposal — Phase 16*  
*Prepared Date:* 4 November 2026 (Asia/Dhaka)  
*Verified Release Artifact (RC):* Commit `88754e61d0272503481c69c07ab25691c89a8a8e` (Actions Run `41870110256` 9/9 Green)  
*Verified Rollback Reference:* Commit `1d26ca2e961fcad92ad4996727a8da72d7613e57` (Actions Run `41842668900` 9/9 Green)  
*Monitored Support Owner:* Platform Reliability Lead (`oncall@seekers.internal` / `@sre-lead`)

---

## 1. Staging Target Architecture & Endpoints

| Component | Target URL | Target Stack | Ingress Protection |
|---|---|---|---|
| **Candidate Web Portal** | `http://staging.seekers.internal:3000` | Next.js 16.3 / React 19.2 | Nginx rate-limited (50 r/s), CSP, HSTS |
| **Operations Console** | `http://staging.seekers.internal:4200` | Angular 19.2 / SCSS | Privileged token/HS256 JWT auth, Role Guard |
| **Ingress API Gateway** | `http://staging.seekers.internal:80` | Nginx 1.27 / TLS 1.3 | Single ingress point; 10 MB upload ceiling |
| **Health Probe** | `http://staging.seekers.internal:3000/health` | API Gateway (`/health`) | JSON health response (`200 OK`) |

*Network Isolation Constraint:* All datastores (PostgreSQL 15, MongoDB 7, Elasticsearch 8.10, Kafka 3.8, MinIO) operate on the private `microservices-net` Docker bridge with **zero public host port bindings**.

---

## 2. Cohort Definition & Participant Cap

- **Approved Participant Ceiling:** Strictly bounded to **50 candidate participants** (`BETA_MAX_PARTICIPANTS=50`).
- **Internal Operator Cohort:** 5 authorized platform operators (1 Administrator, 2 Operators, 2 Read-Only Auditors).
- **Server-Enforced Capacity Fence:**
  - Enforced via PostgreSQL transaction-level exclusive advisory lock (`pg_advisory_xact_lock(987654321)`) inside `UserRepository.upsertUser()`.
  - When candidate registrations race concurrently for the final remaining slot, exactly 1 candidate is admitted; concurrent contenders receive HTTP `403 Forbidden` with error code `BETA_CAPACITY_REACHED`.
  - Returning candidates update profile and session attributes idempotently without consuming additional cohort slots.
  - Configuration parsing fails closed: malformed non-integer or negative `BETA_MAX_PARTICIPANTS` throws `403 Forbidden` (`BETA_CONFIG_INVALID`).

---

## 3. Approved Invite & Onboarding Process

1. **Pre-Registration:** Platform owner supplies the list of up to 50 verified email addresses, populated in `BETA_INVITE_ALLOWLIST`.
2. **Fail-Closed Registration Barrier:** Public uninvited registrations are rejected at the API boundary with HTTP `403 Forbidden` (`BETA_INVITE_REQUIRED`).
3. **Identity Verification:** Registration strictly requires verified email evidence (`emailVerified === true`). Unverified tokens are rejected with `403 Forbidden` (`BETA_EMAIL_VERIFICATION_REQUIRED`).
4. **Invitation Dispatch:** Delivered exclusively via authorized, owner-approved invitation channels. No invitations are emitted prior to explicit owner authorization.

---

## 4. Proposed Observation Window & Task Schedule

- **Duration:** Exactly 14 calendar days (Proposed: 5 November 2026 – 19 November 2026).
- **Clock Initialization:** The 14-day observation clock starts **ONLY when the approved cohort actually has live access to the staging deployment**.
- **Monitored Candidate Tasks (Mobile & Desktop):**
  1. Discovery, multi-facet filtering, cursor pagination, and outbound application tracking.
  2. Account onboarding, verified email profile creation, and skill confirmation.
  3. Resume PDF upload (5 uploads/day quota), local spaCy parsing, and skill review.
  4. Workspace tracking status transitions (`APPLIED` -> `INTERVIEWING` -> `OFFER` -> `REJECTED`) with 409 concurrency fencing.
  5. Deterministic recommendations and RFC 8058 one-click unsubscribe links.
  6. GDPR portability data export and scheduled account erasure with 30-day tombstone protection.
- **Monitored Operator Tasks:**
  1. Source registry health inspection, legal provenance review, and emergency crawl pausing.
  2. Privileged catalog moderation with revision conflict detection (409).
  3. Dead Letter Queue poison triage, re-validation, and idempotent replay.
  4. Instant global recipient suppression and outbox kill switch execution.

---

## 5. Plain-Language Participant Consent & Safety Disclosures

Every participant is presented with clear, plain-language disclosure upon first login:
1. **Zero LLM Egress:** Resumes are parsed strictly using local, self-hosted open-source NLP models (Python `spaCy` + `pypdf`); zero candidate resume data is ever shared with third-party AI/LLM providers.
2. **Email Delivery Isolation:** During beta, all notifications operate under `NOTIFICATION_MODE=CAPTURE`. Delivery records are written to a private durable outbox with zero unsolicited emails sent to real external inboxes.
3. **Privacy & Data Rights:**
   - Candidate resumes can be removed immediately from private storage (`DELETE /api/v1/users/resume`).
   - Candidate accounts can be erased with a 30-day grace period; durable erasure tombstones permanently block unauthorized re-synchronization.

---

## 6. Hold, Rollback & Incident Escalation Thresholds

The observation window will be paused immediately and the platform rolled back to commit `1d26ca2` if:
1. **Privacy Breach:** Any cross-user data leak occurs (e.g. candidate accessing another candidate's profile/resume).
2. **Resurrection Violation:** An account scheduled for permanent erasure is resurrected during sync.
3. **Search Performance Degradation:** Search p95 latency exceeds 500 ms for > 5 consecutive minutes under load < 50 RPS.
4. **Poison Queue Spike:** Dead Letter Queue backlog exceeds 50 messages in 1 hour.
5. **Crash Loop:** Fatal unhandled crash loops occur in any microservice.

---

## 7. Approval & Sign-Off Gate

> [!IMPORTANT]
> **Owner Authorization Required Prior to Cohort Invitation:**
> All underlying technical, networking, and security controls are 100% verified in CI. In strict compliance with `PHASE_16_BETA_PROMPT.md`, invitations may ONLY be sent upon receiving explicit human authorization from the platform owner.
> 
> Once authorized and delivered, the 14-day observation window will run to completion. Phase 17 (`PHASE_17_PROMPT.md`) must NOT be initiated until this full gate passes.

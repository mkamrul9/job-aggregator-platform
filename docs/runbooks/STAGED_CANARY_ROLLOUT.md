# Operational Runbook: Staged Canary Rollout & Circuit-Breaker Fencing

**Runbook ID:** `RB-PROD-003`  
**Severity:** P1 / Release Governance  
**Owner:** Platform Operations & Site Reliability Engineering  
**Applicability:** Production & Staging Releases (All 7 Microservices & Frontend Portals)  

---

## 1. Purpose & Strategy

This runbook defines the standard operating procedure for executing a staged canary release of the Seekers Platform within the proven **Tier 0 Operating Envelope** (10,000 registered candidates, 1,000 DAU, 50–100 concurrent sessions, 50,000–100,000 catalog jobs).

The rollout proceeds through 4 controlled stages:
1. **Stage 1 (Canary-Internal, 5% weight):** Internal operators and allowlisted test accounts only. Probes all 7 project readiness endpoints.
2. **Stage 2 (Cohort-Public-Small, 25% weight):** Bounded public traffic (up to 25 concurrent sessions). Verifies search latency and outbound redirection.
3. **Stage 3 (Cohort-Expanded, 50% weight):** Expanded traffic (up to 50 concurrent sessions). Verifies Kafka ingestion bursts and resume extraction.
4. **Stage 4 (Full-Launch-Tier0, 100% weight):** Full traffic within Tier 0 bounds (up to 100 concurrent sessions, 20–50 rps search).

---

## 2. Pre-Flight Verification Checklist

Before initiating any traffic shift, verify:
- [ ] OCI image digests conform strictly to `sha256:64hex` format and map to tested Git commit SHA.
- [ ] No default development secrets active (`ADMIN_TOKEN_SECRET`, `JWT_SECRET` length >= 16 characters).
- [ ] Wildcard CORS (`*`) is absent from configuration.
- [ ] Forward database migrations have deployed cleanly without error.
- [ ] Recent backup snapshot exists with certified HMAC signature (`scripts/backup-stores.js`).
- [ ] Standalone test seed catalog (`ALLOW_STANDALONE_TEST_SEED_CATALOG`) and Firebase emulator are disabled.

---

## 3. Execution Commands

### 3.1. Automated Canary Rollout Runner
Execute the production launch pipeline:
```bash
# In local/staging fixture demonstration mode:
node scripts/launch-production.js --demo

# In real production mode (requires live DATABASE_URL and network topology):
node scripts/launch-production.js --real
```

### 3.2. Manual Ingress Traffic Shifting (Nginx / Ingress Controller)
To manually adjust traffic weighting between stable (`app_v0`) and canary (`app_v1`):

1. **Stage 1 (5% Canary):**
   ```nginx
   # In /etc/nginx/conf.d/upstream.conf
   upstream backend_pool {
       server app_stable:3000 weight=95;
       server app_canary:3000 weight=5;
   }
   ```
   Reload Nginx: `nginx -s reload`

2. **Stage 2 (25% Cohort):**
   ```nginx
   upstream backend_pool {
       server app_stable:3000 weight=75;
       server app_canary:3000 weight=25;
   }
   ```
   Reload Nginx: `nginx -s reload`

3. **Stage 3 (50% Cohort):**
   ```nginx
   upstream backend_pool {
       server app_stable:3000 weight=50;
       server app_canary:3000 weight=50;
   }
   ```
   Reload Nginx: `nginx -s reload`

4. **Stage 4 (100% Cutover):**
   ```nginx
   upstream backend_pool {
       server app_canary:3000 weight=100;
   }
   ```
   Reload Nginx: `nginx -s reload`

---

## 4. Circuit Breakers & Abort Triggers

The rollout **MUST IMMEDIATELY FREEZE AND ROLL BACK** if any of the following occur during any observation window:

| Trigger Indicator | Critical Threshold | Automated Action |
|---|---|---|
| **Search Latency (p95)** | `> 500 ms` | Immediate traffic reversion to stable |
| **API Latency (p95)** | `> 300 ms` | Immediate traffic reversion to stable |
| **HTTP 5xx Error Rate** | `> 0.5%` of requests | Immediate traffic freeze; abort rollout |
| **Dead Letter Queue (DLQ)** | `> 5 poison events / min` | Pause crawling via `EMERGENCY_KILL_SWITCH` |
| **Notification Bounce / Spam** | `> 0.1%` bounce rate | Shift notifications to `CAPTURE` mode |
| **Data Loss / Resurrection** | Any resurrected deleted user | Immediate rollback; freeze user sync |

---

## 5. Emergency Rollback Procedure

If an abort trigger fires, execute rollback immediately:
```bash
# 1. Execute automated rollback pipeline
node scripts/rollback-staging.js --real

# 2. Reset Nginx upstream to 100% stable version
sed -i 's/weight=[0-9]*/weight=0/g' /etc/nginx/conf.d/upstream.conf
nginx -s reload

# 3. Verify service health post-rollback
node scripts/test-recovery-failure.js
```


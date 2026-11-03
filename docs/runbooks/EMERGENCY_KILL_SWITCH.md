# Operational Runbook: Emergency Crawler Kill Switch

## 1. Overview & Purpose
This runbook defines the operational procedure for platform operators to immediately halt active web scraping tasks, pause a specific misbehaving job source, or terminate all outbound collection across the platform during an operational incident (e.g., target rate breach, upstream block, or data corruption).

---

## 2. Trigger Conditions (Severity 1 / 2)
- Upstream job board reports excessive request rates from Seekers IP addresses.
- Prometheus alert `CollectorRateBudgetBreach` fires.
- Parser detects widespread schema drift resulting in quarantined dead letters (>50 dead letters in 1 hour).
- Upstream source terms of service change or legal revocation notice received.

---

## 3. Immediate Remediation Procedures

### Option A: Pause Specific Misbehaving Source via Operator API
To pause a specific source (e.g., `greenhouse-feed`):

```bash
# Using Admin Router (requires ADMIN or OPERATOR role key)
curl -X PATCH http://localhost:4000/api/v1/sources/greenhouse-feed \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{
    "enabled": false,
    "reason": "Emergency rate breach containment per runbook EMERGENCY_KILL_SWITCH"
  }'
```

**Verification:**
```bash
curl -s http://localhost:4000/api/v1/sources -H "x-admin-key: $ADMIN_API_KEY" | jq '.[] | select(.id == "greenhouse-feed")'
# Ensure "enabled": false
```

### Option B: Immediate Global Crawler Daemon Halt (Process Termination)
If the scraper daemon does not respond to API commands:

```bash
# Docker Compose environment:
docker compose stop service-scraper

# Standalone process environment:
# Send SIGINT / SIGTERM for graceful shutdown (flushes in-flight queue and releases active leases)
pkill -SIGTERM -f "service-scraper"
```

### Option C: Disable Scraper via Environment Configuration
Set in `.env` or deployment manifest:
```env
CRAWLER_ENABLED=false
```
Then restart the ingestion and scheduler services.

---

## 4. Post-Incident Actions & Verification
1. Confirm zero active HTTP requests are being emitted to external job boards.
2. Verify active crawl leases in `data/state` have expired or been cleanly deleted.
3. Check MongoDB `audit_events` to verify the administrative pause action was logged with operator principal and timestamp:
   ```bash
   # Query audit events
   curl -s http://localhost:4000/api/v1/admin/audit -H "x-admin-key: $ADMIN_API_KEY"
   ```
4. Perform root cause analysis (RCA) and adjust connector rate limits in `service-scraper/registry.go` before re-enabling the source.

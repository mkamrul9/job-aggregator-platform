# Operational Runbook: Global Notification Recipient Suppression

## 1. Overview & Purpose
This runbook defines the operational procedure for operators to immediately halt all outbound notification dispatches (email alerts, digest batches) to a specific candidate, domain, or across the entire platform during an operational incident (e.g., mail storm, bounce spike, spam complaint, or user revocation).

---

## 2. Trigger Conditions (Severity 1 / 2)
- Candidate reports receiving repetitive or unsolicited email notifications.
- SMTP relay provider reports bounce rate $> 2\%$ or spam complaint rate $> 0.1\%$.
- Delivery dispatcher experiences stuck outbox retries or high retry volumes.
- Security incident where notification tokens may have been compromised.

---

## 3. Immediate Remediation Procedures

### Option A: Emergency Suppression via Notification Service API
To immediately suppress an email address globally:

```bash
# Using Notification Service Privileged Route
curl -X POST http://localhost:4000/api/v1/notifications/suppressions \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{
    "email": "candidate@example.com",
    "scope": "GLOBAL",
    "reason": "Emergency suppression per runbook NOTIFICATION_SUPPRESSION",
    "source": "OPERATOR_CONSOLE"
  }'
```

### Option B: Suppression via Standalone CLI
When the HTTP service is unavailable or in a local maintenance shell:

```bash
cd service-notification
node cli.js suppress candidate@example.com --reason="INCIDENT_HALT"
```

### Option C: Force Capture Mode (Safe Outbox Buffer)
To immediately prevent any external SMTP transmission without stopping internal alert processing:

```env
NOTIFICATION_MODE=CAPTURE
```
In `CAPTURE` mode, emails are written exclusively to the local JSON store (`data/notifications_store.json`) and zero packets leave the host toward SMTP servers.

---

## 4. Verification & Audit Trail
1. Confirm the suppressed email appears in the active suppressions registry:
   ```bash
   curl -s http://localhost:4000/api/v1/notifications/suppressions -H "x-admin-key: $ADMIN_API_KEY"
   ```
2. Run a test dry-run evaluation for the recipient:
   - Must return `status: "SKIPPED_SUPPRESSED"`.
3. Verify store statistics:
   ```bash
   node service-notification/cli.js stats
   ```
4. Confirm audit record in the notification durable store.

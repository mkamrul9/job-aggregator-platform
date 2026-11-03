# Operational Runbook: Disaster Recovery & Certified Data Restoration

**Runbook ID:** `RB-PROD-004`  
**Severity:** P0 / Critical Business Continuity  
**Owner:** SRE & Data Infrastructure Team  
**Applicability:** PostgreSQL Authoritative Store, MongoDB Catalog, Object Storage Resumes  

---

## 1. Objective & Recovery Point/Time Targets

- **Recovery Point Objective (RPO):** ≤ 15 minutes of durable transactional data.
- **Recovery Time Objective (RTO):** ≤ 10 minutes to full service restoration.
- **Integrity Guarantee:** Zero resurrection of GDPR-deleted accounts (tombstones strictly enforced), cryptographic HMAC verification of all backup archives before ingestion.

---

## 2. Backup Pipeline Verification

Backups are created via `scripts/backup-stores.js` generating a signed manifest:
```bash
# In real production mode (requires DATABASE_URL and local storage directory):
node scripts/backup-stores.js --real /var/backups/seekers_latest

# In demonstration / local test mode:
node scripts/backup-stores.js --demo ./data/backups/demo_snapshot
```

### Artifact Manifest (`manifest.json`):
```json
{
  "backup_id": "backup_2026-11-03T18-00-00-000Z",
  "timestamp": "2026-11-03T18:00:00.000Z",
  "execution_mode": "REAL_PRODUCTION_MODE",
  "files": {
    "postgres_authoritative.json": { "size": 1545, "sha256": "5de360c20a27..." },
    "mongo_catalog.json": { "size": 2249, "sha256": "5eb5f5583d78..." },
    "resumes": { "count": 20, "sha256": "31ad5f59c2b0..." }
  },
  "hmac_signature": "d8345b90c781113a..."
}
```

---

## 3. Restoration Procedure

### Step 1: Verify Manifest Authenticity
```bash
# Verify HMAC and SHA-256 checksums
node scripts/restore-drill.js --verify-only /var/backups/seekers_latest
```
*If HMAC verification fails or bytes are altered, the restore pipeline fails closed immediately.*

### Step 2: Execute Disaster Recovery Drill
```bash
# Restore datastores in staging / recovery target
node scripts/restore-drill.js /var/backups/seekers_latest
```

### Step 3: Reconcile Account Erasure Tombstones
Verify that no accounts marked as deleted after the backup timestamp are restored:
```bash
# In service-user:
npm run test:smoke:negative
```

### Step 4: Resume Outbox & Projection Reconciliation
Trigger Elasticsearch catalog reindex from MongoDB authoritative data:
```bash
curl -X POST http://localhost:80/api/v1/admin/ingestion/reindex \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## 4. Rollback Verification

If the restored version is found to be incompatible with subsequent event schemas:
```bash
node scripts/rollback-staging.js --real
```
Verify that rollback image conforms to `sha256:64hex` format and that all 7 microservice health probes return HTTP 200.


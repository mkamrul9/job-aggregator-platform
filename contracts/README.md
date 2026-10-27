# Seekers Platform Authoritative Contracts

*Status: Authoritative Machine-Readable Contract Baseline (P03)*  
*Last Updated: 27 October 2026*  
*Validation Command: `node contracts/validate-contracts.js`*

---

## 1. Overview and Authority

This directory houses the authoritative machine-readable contract specifications for the Seekers Job Aggregator Platform. All microservices, frontend applications, and event bus integrations must conform strictly to these contracts.

```
contracts/
├── openapi/
│   └── seekers-api-v1.yaml         # Authoritative OpenAPI 3.1 specification for HTTP endpoints
├── events/
│   ├── envelope.schema.json        # Standard wrapper envelope for all published domain events
│   ├── job.collected.v1.schema.json  # Scraper raw collection event payload (Kafka)
│   ├── job.ingested.v1.schema.json   # Canonical ingested job event payload (Kafka)
│   ├── resume.parsed.v1.schema.json  # Resume NLP extraction event payload
│   ├── candidate.registered.v1.schema.json # Candidate profile synchronization event
│   ├── alert.dispatched.v1.schema.json    # Notification delivery attempt event
│   └── examples/                   # Valid and invalid synthetic fixtures for CI validation
├── protobuf/
│   └── resume/
│       └── v1/
│           └── resume.proto        # Authoritative Protobuf contract for ResumeParser gRPC
└── validate-contracts.js           # Automated validation runner for CI and local verification
```

---

## 2. API Versioning and URL Conventions

1. **Path Prefix:** All versioned platform endpoints are prefixed with `/api/v1/`.
2. **Backward Compatibility:** Minor additions (new response fields, optional query parameters) do not bump the major version. Breaking changes (removing fields, altering types, changing semantics) require `/api/v2/`.
3. **Legacy Migration:**
   - Gateway `/api/jobs` and `frontend-next` `/api/jobs` route to the unified canonical search implementation provided by `service-ingestion`.
   - Direct database access from frontend BFF layers is deprecated in favor of versioned API gateway contracts.
4. **Standard Error Format:** All error responses adhere to the RFC 7807 problem details pattern exposed via `ErrorResponse` (with uppercase machine `code`, human `message`, `correlation_id`, and optional `errors` array).

---

## 3. Event Bus Standards (Kafka)

1. **Envelope Requirement:** Every event published to Kafka must be wrapped in `envelope.schema.json`, providing:
   - `event_id`: Unique UUIDv4/v7 per occurrence.
   - `event_type`: Domain-qualified with version suffix (e.g., `job.collected.v1`).
   - `schema_version`: Semantic version string (`1.0.0`).
   - `producer`: Owning microservice identifier.
   - `timestamp`: UTC ISO-8601 creation time.
   - `correlation_id`: End-to-end trace identifier.
   - `trace_context`: W3C traceparent / tracestate.
   - `payload`: Domain-specific object matching the event schema.
2. **Deduplication:** Consumers must enforce idempotency using deterministic deduplication keys (e.g. `source_url_hash` for jobs, `candidate_id` + `alert_id` for notifications).
3. **Partition Keying:**
   - `job.collected.v1`: Keyed by `source_url_hash` to guarantee ordering per listing.
   - `job.ingested.v1`: Keyed by `job_id`.
   - `resume.parsed.v1`: Keyed by `candidate_id`.
   - `alert.dispatched.v1`: Keyed by `candidate_id`.

---

## 4. Protobuf Contract & Packaging Rule

- **Authoritative Source:** `contracts/protobuf/resume/v1/resume.proto` is the single source of truth for the ResumeParser service.
- **Packaged Copies:**
  - `shared-protos/resume.proto` (monorepo convenience package)
  - `service-user/proto/resume.proto` (packaged directly inside the user service container build context)
- **Drift Detection:** `node contracts/validate-contracts.js` checks packaged copies against the authoritative file and fails CI on divergence.
- **Evolution Guarantee:** Existing field numbers (1 and 2) are immutable. Evolution to object storage identifiers (`document_id = 2`, `content_bytes = 3`, `candidate_id = 4`) preserves wire compatibility with existing callers.

---

## 5. Automated Validation

Run the contract validation suite:
```bash
node contracts/validate-contracts.js
```

This verifies:
- Protobuf contracts have zero drift across packaged copies.
- All JSON Event schemas have valid syntax.
- All positive synthetic examples pass schema validation.
- All negative synthetic examples correctly trigger schema violation rejections.
- The OpenAPI 3.1 specification contains all required paths, security schemes, and component models.

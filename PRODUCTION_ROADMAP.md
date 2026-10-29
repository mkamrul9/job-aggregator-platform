# Seekers: production roadmap

Prepared: 27 October 2026 (Asia/Dhaka). Source baseline: `ca67811` on `main`.

Updated: 27 October 2026. Portfolio requirement: preserve the polyglot microservices architecture and make every service/app independently presentable for technology-specific job applications. The Angular dashboard remains Angular.

**Status:** P03 contracts, scope, data ownership, standalone demonstrations, and capacity targets defined on `codex/production-p03-contracts-and-scope` branched from P02 reviewed commit `583602d`. Authoritative OpenAPI 3.1 specification (`contracts/openapi/seekers-api-v1.yaml`), versioned JSON event envelope and domain event schemas (`contracts/events/*.schema.json`), synthetic valid/invalid fixtures, backward-compatible protobuf evolution (`contracts/protobuf/resume/v1/resume.proto`), and cross-platform automated contract validation suite (`contracts/validate-contracts.js`) established and enforced in CI. Confirmed launch scope for South Asia / Bangladesh regional market, Android-first native mobile (Kotlin/Compose for P18), and $0 Free Tier operating model. P04 is planned and has not started.

Repository publication policy: keep maintained service READMEs, this active roadmap, the service catalog, architecture reference, source, tests, and working configuration/deployment files. Keep personal research, historical daily/phase notes, agent prompts, and execution logs local and ignored. Only configuration examples consumed by an existing application belong in the published baseline. Do not blanket-ignore future maintained documentation or rewrite already-pushed history to remove ordinary documentation.

The existing repository is a prototype with useful foundations. It is not ready for a public production launch or a claim that it supports millions of users. This roadmap turns it into a complete candidate product composed of independently owned, built, tested, deployable, and demonstrable services/apps, establishes dependable operations, and then proves capacity against a defined workload. A recruiter must be able to assess one relevant project without running or understanding the entire platform. Existing phase notes under `docs/` describe earlier development; the production phases below use the separate identifiers **P01–P18**.

## 1. What this assessment covers

Reviewed the first-party candidate frontend, admin frontend, all five backend service directories, database schema, protobuf contract and generated-code requirements, Dockerfiles, Compose configuration, gateway, CI, metrics configuration, deployment and seed scripts, repository hygiene, architecture documentation, and historical development notes. Third-party dependency source is not an application code review target. Broad architecture and research-idea documents are background material, not evidence that those capabilities exist.

The original pre-P01 assessment performed local lint/type checks, existing unit tests where practical, frontend build attempts, Compose configuration validation, and read-only inspection of existing container state and gateway logs. It changed no application feature or database and did not restart containers, send mail, rotate credentials, commit, or push. Build checks generated local output. The stack was not rebuilt from a clean checkout, and no full browser journey or load test passed in that assessment. Subsequent P01 source-baseline work is identified in the status above.

### Verified baseline

- `docker compose config --quiet`: passed configuration validation. This does not validate service readiness.
- Go: existing test passed; `go vet ./...` passed. The test exercises a mock publisher, not actual page extraction or Kafka delivery.
- User service: one Jest test passed; TypeScript check passed. Non-fixing ESLint reported **59 errors and 3 warnings**.
- Candidate frontend: ESLint reported **6 errors**. TypeScript encountered a stale generated `.next/dev/types/validator.ts` import for a removed `app/api/search` route; a clean supported build must distinguish generated-output problems from source defects.
- Candidate production build: failed in Turbopack while processing global CSS and starting a Node subprocess. It failed both inside and outside the sandbox. The root cause and Linux CI behavior remain to be established; this is not yet an attributed application bug.
- Angular admin: production build passed. Build success does not establish working admin functionality or authorization.
- Resume parser: **2 tests passed**, with a PyPDF2 deprecation warning. The sandboxed attempt stalled and was stopped; an outside-sandbox retry completed. These tests reject a non-PDF and exercise a mocked PDF extraction path; they do not qualify real-document extraction quality, gRPC, or the integrated upload flow. Local Python is 3.14, while the container/CI target is 3.11, so parity remains unverified.
- Ingestion and notification services: JavaScript syntax checks passed. Both package test scripts are placeholders that exit with failure.
- Existing local containers: gateway restarting; candidate frontend, user, ingestion, notification, scraper, admin, and Grafana containers stopped/exited. Gateway log reports an unresolved `user-service:3000` upstream. Some containers are old and include legacy services; these observations are a degraded local runtime snapshot, not a deployment of the audited commit.
- Package manifest root dependencies match their corresponding lockfile root entries. No clean dependency installation or complete dependency vulnerability scan was performed.

## 2. Findings that determine the order of work

### Immediate release blockers

1. **Credential handling needs remediation.** A credential is embedded in the local Git remote URL. `service-user/.env` is tracked. Revoke/rotate the exposed credential, inspect the tracked environment file and history safely, and establish credential-free remotes and proper secrets storage. Values must never be copied into this roadmap or logs.
2. **Generated dependencies are committed.** Git tracks 30,048 files under `node_modules`, 407 under `vendor`, and two Python cache files. An ignore rule does not untrack existing files. This compromises clean builds, reviewability, and dependency management. Decide Go vendoring deliberately; remove accidental dependency/cache tracking without rewriting history by default.
3. **Database migrations are missing.** There is a Prisma schema but no tracked `prisma/migrations` history. The README prescribes `migrate deploy`, while the local deploy script uses `db push`. A schema file alone cannot reproduce or safely evolve a production database.
4. **Runtime/dependency compatibility is inconsistent.** Several images and CI use Node 20; Node lists it as EOL. Candidate and ingestion services use Elasticsearch client 9.x against Elasticsearch 8.10.2; this is outside Elastic's documented supported same-major matrix. Python packages/model downloads and several container images float. Angular 18 is outside the currently listed supported Angular versions. Upgrade by compatibility group with regression checks, not by blindly selecting every latest version. Sources: [Node lifecycle](https://nodejs.org/en/about/previous-releases), [Elastic compatibility](https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/installation), [Angular support](https://angular.dev/reference/releases).
5. **The local platform is not healthy.** Upstream resolution, service startup, dependency readiness, and restart behavior require a reproducible diagnosis. The frontend depends on the gateway even though the gateway also requires the frontend upstream to exist; startup should tolerate dependency sequencing without a crash loop.
6. **Authentication is not production configured.** Firebase web configuration falls back to mock values; Compose supplies no Firebase web build configuration or explicit server credential setup. The UI lacks complete session, logout, verification, recovery, and account-management flows.
7. **Resume extraction is detached from the account.** The UI posts anonymously to FastAPI `/api/resume/parse`; it does not use the authenticated user-service upload route, persist a resume, or save extracted skills. Authenticated upload instead relies on a shared local filesystem and a path sent over gRPC.
8. **Job acquisition is illustrative.** The scraper loops over three `example-*` LinkedIn URLs with one source-specific selector set. It has no real discovery catalog, connector management, durable scheduling, or listing expiry process.
9. **Alerts and recommendations are illustrative.** The notification service uses fake SMTP credentials and a hardcoded recipient. It does not implement actual user matching, preferences, opt-in, delivery tracking, or unsubscribe.
10. **Feedback is not submitted.** The report form logs feedback in the browser console and closes. There is no persisted report or support workflow.

### Data integrity and usability gaps

11. **Two search implementations disagree.** Next serves Elasticsearch search at `/api/jobs`; Nginx separately defines `/api/jobs/` to the Mongo-backed ingestion endpoint. Slash normalization/routing must be tested explicitly. Query fields, sorting, counts, and failure behavior differ. Publish one external contract and one owner for search behavior.
12. **Events can be lost after processing failures.** Ingestion catches processing errors and returns normally; Elasticsearch write errors are swallowed after the Mongo write. Notification delivery failures are also swallowed. There is no durable retry/dead-letter/reconciliation path guaranteeing eventual recovery after offset advancement.
13. **Deduplication is incomplete.** Upserting by URL is useful, but no unique job URL index is created. URL canonicalization, source identifiers, cross-source duplicates, and concurrent writes need explicit rules.
14. **Job information is too thin.** The production ingestion schema lacks stable public IDs, structured location, remote policy, salary/currency, employment type, seniority, source provenance, publication/expiry timestamps, and lifecycle status. Dummy seeds contain some fields that the real ingestion path does not preserve.
15. **Search is not a complete browsing experience.** There is no results pagination UI, filter system, persistent query URL, dedicated job detail route, or reliable API-error state. Responses are not checked with `response.ok`; stale requests and stale displayed results are possible. Negative/invalid limits are insufficiently constrained. `_doc` sort is not a job-recency contract.
16. **Account synchronization can appear successful after failure.** The auth component does not propagate non-OK backend sync responses into its success state. Concurrent identity updates, email changes, missing email claims, and database conflicts need handling.
17. **Resume processing has weak boundaries.** MIME type is trusted; the parser reads the entire upload and does CPU-heavy work inside an async request. There are no explicit parser byte/page/time/concurrency budgets, authenticated ownership on the public parser, malware workflow, or retention policy. The gRPC handler accepts filesystem paths and uses an insecure internal channel. The authenticated gateway upload route also lacks the resume route's 10 MB gateway allowance.
18. **Current “AI” means a small skill dictionary.** A spaCy PhraseMatcher recognizes 16 technical skill entries. It is not an implemented recommendation system or general resume understanding. Empty/scanned/encrypted PDFs need truthful supported/unsupported outcomes, with OCR added only if it is in scope.
19. **Admin is a scaffold.** Compose comments out the admin service; header/sidebar are placeholders; the socket points to `localhost:4000`, which is not published for that connection. Nginx has no matching authenticated WebSocket upgrade route. There is no server-enforced admin role boundary or actionable operations console.
20. **Visual polish has not established usability.** Preserve the existing Seekers name and charcoal/amber, Sora/Plus Jakarta design direction as the starting point. Improve task hierarchy, density, contrast, keyboard behavior, and small-screen layouts. The mobile menu is hidden inline, dialogs lack complete accessible behavior, and the large hero precedes the actual work.
21. **Public claims are unsupported.** “2.4M+” roles, “180+” sources, “real-time,” and matching promises are hardcoded. Marketing, job freshness badges, and operational status must reflect measured data and implemented capabilities.
22. **Operations and test coverage are incomplete.** CI does not enforce all frontend/backend lint, meaningful ingestion/notification tests, integrated startup, browser journeys, or admin tests. Old tests still expect removed boilerplate. Only notification metrics are scraped; there is no complete tracing, alerting, backup-restore evidence, deployment rollback, or capacity certification.

### Source evidence guide

- Candidate flows and public claims: `frontend-next/app/page.tsx`, `app/layout.tsx`, `components/AuthComponent.tsx`, `components/ResumeUpload.tsx`, `components/JobSearch.tsx`, `components/Navbar.tsx`, `lib/firebase.ts`, and `app/globals.css`.
- Search ownership and processing errors: `frontend-next/app/api/jobs/route.ts`, `service-ingestion/index.js`, and `nginx/nginx.conf`.
- Identity, persistence, and the alternate resume path: `service-user/src/auth/firebase-auth.guard.ts`, `src/user/user.controller.ts`, `user.service.ts`, `user.repository.ts`, `user.module.ts`, `prisma/schema.prisma`, and `shared-protos/resume.proto`.
- Resume parsing and runtime requirements: `service-resume/main.py`, `grpc_server.py`, `resume_pb2.py`, `resume_pb2_grpc.py`, requirements files, and Dockerfile.
- Connectors, event publishing, and alerts: `service-scraper/main.go`, `kafka.go`, `publisher.go`, `models.go`, `service-notification/index.js`, and `populate_dummy_data.py`.
- Admin availability and socket wiring: `frontend-admin/src/app/app-routing.module.ts`, `core/services/live-feed.service.ts`, dashboard/layout components, and Compose's commented admin service.
- Reproducibility and operations: all service package/lockfiles and Dockerfiles, `docker-compose.yml`, `.github/workflows/ci-pipeline.yml`, `config-prometheus/prometheus.yml`, `deploy-local.sh`, `.gitignore`, and the existing test files. Repository hygiene counts come from `git ls-files`, not a count of installed dependencies on disk.

## 3. Product and architecture direction

### Product we are delivering

A candidate can discover trustworthy current jobs without signing in, understand a listing, follow a safe link to the source, create an account, maintain a profile/resume, save jobs and searches, record applications, receive useful opted-in alerts, control personal data, and get help. An operator can monitor sources and queues, resolve reports, moderate listings, and investigate failures with an audit trail.

Default scope is a job aggregator: applications leave the platform for the original source. The application tracker records candidate-entered status and clearly labelled outbound activity; an outbound click is not proof of a submitted application. Employer posting, in-platform recruiting, payments, subscriptions, social feeds, chat, and automated applications are separate scope decisions. They are not prerequisites merely because they appear in conceptual documentation.

### Each service is also a focused portfolio project

This is an explicit product requirement alongside the integrated application. Preserve the existing technology specializations and service boundaries. A single monorepo can contain independently deployable services; separate Git repositories, code copies, or a monolithic rewrite are not required. Each service owns its runtime, dependency manifest/lockfiles, configuration contract, domain logic, tests, and build artifact. Other services consume its documented API/events rather than importing its business implementation or writing into its owned data directly.

Planned portfolio entry points, not claims of functionality already completed:

- **Python Resume Extractor — `service-resume/`:** a usable resume-upload/result experience served by the Python application, with extracted skills, validation/error states, downloadable structured results, API docs, and a synthetic sample resume. Run real Python parsing locally without requiring the candidate Next.js app, Firebase, PostgreSQL, MongoDB, or Kafka. Use a lightweight Python-served presentation layer; a JavaScript frontend build must not be required to demonstrate the Python project. Production account/storage/job integrations use explicit adapters and the same parsing core.
- **Angular Operations Dashboard — `frontend-admin/`:** retain and upgrade Angular. Build a polished responsive dashboard with filtering, meaningful charts/tables, event updates, and usable drill-down workflows. Provide a clearly labelled synthetic-data demo with simulated updates and controlled failure scenarios so a recruiter can explore it without operating the backend fleet. Live mode connects to authenticated APIs; production operations remain server-authorized.
- **Go Job Collection Engine — `service-scraper/`:** demonstrate actual parsing, bounded concurrency, scheduling/retry behavior, and structured output using local HTML fixtures or an approved source. A CLI/file output adapter lets the Go engine run without Kafka; the integrated Kafka publisher remains a tested adapter to the same collection logic. No arbitrary untrusted URL fetching or bypassing source restrictions in a public demo.
- **NestJS Identity and Profile API — `service-user/`:** a focused API project with documented account/profile/ownership behavior, OpenAPI examples, tests, and a minimal local setup using its own PostgreSQL database plus Firebase Auth emulator or an explicitly configured identity provider. Other platform services are optional contract-checked adapters for the standalone demonstration. Authentication must remain real and enforced.
- **Node.js Job Ingestion and Search API — `service-ingestion/`:** a focused ingestion/search project with real validation, persistence, deduplication, indexing/reconciliation, and query examples. Provide deterministic event replay through a local input adapter so Kafka is optional for the basic demo; explicitly document and start only its required MongoDB/search dependencies. Include a separate real-Kafka integration check.
- **Node.js Notification Delivery Service — `service-notification/`:** demonstrate preference evaluation, templates, delivery state, retries, and observability using synthetic events plus a local capture mailbox/provider sandbox. Do not require production recipients or real mail credentials to try it. Kafka and real-provider delivery remain separately verified integrations.
- **React/Next.js Candidate App — `frontend-next/`:** a complete responsive candidate experience with its own entry URL, documentation, screenshots, and clearly labelled demo API data where independent evaluation needs it. Full platform mode uses the real versioned APIs; contract tests keep demo responses compatible. The browser application does not duplicate backend business logic.
- **Future mobile app — P18:** its own installation/build/demo instructions and release evidence, reusing the platform's versioned contracts.

Every README and CV-facing description leads with the problem solved, relevant primary technology, a working demonstration, and verified results for that project. It can briefly link to the wider platform as context without making the recruiter understand every technology. The platform README provides a service directory with links to these focused entry points. CV text must not imply separate production deployments or measured scale that have not actually been achieved.

### Standalone and integrated execution contract

Every service/app must meet these requirements by the end of its owning feature phase; P01 inventories the gaps, P02 establishes independent build/test entry points, P03 specifies the contracts, and P16 verifies the final portfolio packages.

1. **Independent setup:** one documented quickstart command after prerequisites starts that project with only its necessary dependencies. Provide a service-specific Compose file/profile or an equivalent local runner, safe `.env.example`, dependency/port list, sample inputs, cleanup instructions, and troubleshooting. Validate commands from a clean checkout; do not claim unimplemented setup works.
2. **Three explicit verification levels:** local tests run in isolation; standalone/demo mode uses the real service core with clearly labelled synthetic input or external-boundary adapters; integration mode verifies real cross-service contracts and the complete platform. “Independent” does not mean a database-backed service needs no database.
3. **Same business implementation:** demo adapters replace external inputs/providers, not the parsing, filtering, persistence, ranking, or delivery behavior being showcased. A frontend-only fixture demo is labelled a UI demonstration and never used as proof of backend correctness. Define its schemas against the live contract and check them in CI.
4. **Separate deployability:** each service has a buildable artifact, runtime configuration, health/readiness where applicable, migration/dependency instructions, and a deployment recipe. Service images include their required versioned protobuf/schema assets so a runtime is not tied to a sibling source checkout or host-shared code mount. Compatible services can be upgraded independently. P14 provisions safe independent demo deployments and distinct entry URLs where approved; P16 publishes only verified links and labels local-only demos accurately. A portfolio hub may link to these entry points but is never required to use a project.
5. **Independent evidence:** a focused README, small architecture diagram, API/CLI usage, meaningful tests, screenshots or a short demo recording, tradeoffs/limitations, measured results if available, and a technology-specific project summary. All evidence is sanitized and describes actual shipped behavior. Capture it as each service becomes usable, not only at final platform launch.
6. **CI at both boundaries:** path-aware build/lint/test checks for each project plus contract tests for shared-schema changes and integrated smoke tests. A standalone pass never substitutes for the integration gate. Shared resources trigger all affected checks; independent versioning must retain consumer compatibility.
7. **Isolated demo safety:** demo datasets, storage, identities, metrics, and mail delivery remain separate from production. Demo flags default off in production and fail validation if unsafe combinations are requested; frontend demo mode grants no production permissions. Public resume demos enforce upload/compute limits, a disclosed short retention policy, deletion, and safe sample files. No production admin access, auth bypass, public replay controls, real personal data, or unsolicited email is needed to demonstrate the projects.

### Keep, improve, and add

- **Keep Next.js/React for the web.** The existing investment fits public job pages and a candidate workspace. Do not rewrite the web in Kotlin.
- **Keep Firebase identity initially.** Complete configuration, session lifecycle, role enforcement, and user-data synchronization. Do not store a pretend application password hash for a Firebase-managed identity.
- **Keep the polyglot microservices and app boundaries:** NestJS/TypeScript for identity/profile APIs, Go for connectors, Python for parsing, separate Node.js ingestion and notification services, Angular for operations, and React/Next.js for candidates. Harden their interfaces and independent deployment paths. Kotlin backend services have no established need here. Any future boundary change must preserve the user's ability to showcase each specialized project.
- **Keep PostgreSQL and the existing Mongo job store initially**, with one documented owner per data set. Elasticsearch is a rebuildable search projection, not a second authoritative catalog. P03 must confirm whether operating both databases is justified; any consolidation requires a measured benefit, migration plan, and recovery plan before feature work depends on it.
- **Use one versioned public jobs API** backed by the same search implementation for web and future mobile. Next may provide a web adapter, but business/search logic and database access should not diverge between clients.
- **Keep Kafka only with a justified workload and operational budget.** Since the ingestion path already uses it, first make delivery semantics correct. Add workers when they isolate independently scaled or retried workloads, not for the sake of service count.
- **Keep Angular for the admin dashboard.** It is both the platform's operations interface and the Angular portfolio project. Upgrade it to a supported version, establish independent demo/live modes, and apply the same design, security, and quality gates. Do not replace it with React for framework consolidation.
- **Add private object storage, durable processing/delivery state, structured contracts, and complete telemetry.** Introduce shared rate-limit/cache infrastructure when distributed limits or measured caching needs justify it. Pick hosting, mail delivery, and storage providers against region, budget, reliability, and operational ownership in P03/P14.
- **Defer Kubernetes, service mesh, database sharding, multi-region writes, vector search, and an LLM dependency** until a specific requirement or measured bottleneck warrants them. “Millions of registered accounts” alone does not justify each of these.

### Web versus future mobile

“React” on the web and “React Native” on phones are different UI platforms. Shared TypeScript contracts and business rules are realistic; automatic reuse of every web component is not.

The provisional mobile preference is **React Native** if Android and iOS are both intended, given the existing React/TypeScript investment and this app's feed/form/upload workflows. If the launch is Android-only and deep native integration is the priority, **Kotlin with Jetpack Compose** is a strong candidate. Jetpack Compose is Android's recommended native UI toolkit. Neither choice is a demonstrated performance winner for this repository: benchmark representative release builds on target devices in P18. Sources: [React Native performance](https://reactnative.dev/docs/performance), [Android Compose](https://developer.android.com/compose).

The web must work well on mobile before a native app exists. Stable authenticated APIs, cursor pagination, deep links, upload contracts, notification preferences, localization-ready fields, and account deletion are designed now so a future app can reuse them.

## 4. Working rules for every implementation phase

1. One production phase is active at a time. Its predecessor's completion gate must pass before the next starts. Each phase includes its own tests, security checks, error states, and relevant mobile checks.
2. At the start, turn that phase into a bounded checklist with affected files, explicit non-goals, migration impact, and test cases. Discoveries go into the backlog and are assigned a phase; dependencies can change the order before work starts.
3. Use a feature branch, by default `codex/production-pNN-short-name`. Keep `main` releasable. Align contributor documentation with the chosen branch convention in P01.
4. Implement a complete vertical slice, including persistence and recovery. A visible control must perform its promised operation or remain explicitly unavailable. Test fixtures never become public product claims.
5. Verify the actual phase commit in CI and the appropriate integration environment. Do not treat an old green build, local cached dependencies, swallowed errors, or a placeholder test as a pass.
6. Finish each phase with documentation, evidence, rollback instructions, a conventional commit, and a push to the phase branch. Verify that the remote branch resolves to the intended commit and required CI passes. Record the SHA and PR/check links. Merge/tag through the established protected-branch workflow when its requirements pass.
7. A large phase may use numbered subphases and multiple reviewed commits/PRs. Each subphase still ends at a usable, tested boundary; the parent phase remains incomplete until every required gate passes.
8. Produce a short completion report: behavior delivered, tests and their results, known limitations, migration/recovery notes, commit SHA, verified push, and the next phase. An unavailable external dependency remains an explicit open gate.
9. For each affected project, verify both its standalone entry point and its real integration contract at the relevant phase gate. Update its own documentation, configuration examples, evidence, and release notes alongside platform documentation. Preserve all seven existing service/app identities; do not merge away a technology-specific portfolio project.
10. Keep each phase bounded while delivering portfolio value incrementally: P05 establishes the NestJS showcase, P06 the Next.js/search experience, P07 the Go and ingestion showcases, P08 the Python extractor, P11 the notification showcase, and P12 the Angular dashboard. Earlier infrastructure work lays their foundations; P16 packages and revalidates them rather than postponing every standalone experience until launch.

Each implementation request follows its authorized phase boundary. P01 source-baseline commits already exist; the current follow-up curates the published files and prepares P02. It does not implement P02 or merge to `main`.

## 5. Sequential implementation phases

### P01 — Secure the repository and establish the independent service baseline

**Outcome:** source control is safe and reviewable, and all existing services/apps have a documented identity, dependency boundary, and standalone-readiness backlog.

- Revoke/rotate the credential found in Git configuration; use a credential helper and a credential-free remote URL. Inspect tracked environment files and relevant history with redacted output. Rotate any real exposed credentials. Repository history cleanup, if necessary, is a separately coordinated operation; avoid a blanket force-push.
- Untrack accidentally committed `node_modules`, Python caches, and generated outputs. Choose and document either intentional Go vendoring with verification or module-based dependency retrieval.
- Correct ignore rules, preserve useful documentation, add safe `.env.example` files, validate required configuration, and document Firebase emulator/development setup. Existing `.secrets` is not a production secrets-management solution.
- Establish contribution rules, branch protection requirements, dependency/secret scanning, ownership, and a phase evidence log. Document scans that require a connected provider.
- Create a versioned service catalog covering all seven existing service/app directories: purpose, primary stack, owner, interfaces, owned data, actual build/test/run commands, infrastructure dependencies, current standalone/integration readiness, planned demo approach, and owning feature phase. Use explicit planned/not-yet-verified labels rather than inventing successful commands or deployments.
- Create or improve a focused README for each project and safe configuration examples only for settings consumed by the current implementation, preserving Angular as Angular and Python as Python. Document future configuration in the roadmap instead of publishing no-op `.env.example` files. Add a platform README index of the individual projects and their relevant role/technology. Working demo runners, new UI, and runtime decoupling are delivered in later phases.

**Completion gate:** no active known exposed credential; safe remote configuration; secret checks pass; only intended source, lockfiles, useful configuration, and maintained documentation are tracked; clean clone can enter the documented setup path; all seven project identities, focused READMEs, actual configuration requirements, dependency boundaries, and standalone-readiness gaps are recorded; Angular is explicitly retained; no unreviewed history rewrite. Full standalone application functionality is not a P01 claim.

**Checkpoint:** `chore(repo): secure source baseline and document independent services` → verified push.

### P02 — Make installation, builds, CI, and local startup reproducible

**Outcome:** a fresh checkout produces a healthy development stack and an honest green baseline.

- Diagnose candidate Turbopack/CSS build failure; remove stale generated-output assumptions through the build process. Resolve existing lint/type errors without disabling useful rules as a shortcut.
- Select supported Node/Go/Python releases and compatible framework/database clients. Resolve the Elasticsearch major-version mismatch. Pin deterministic Python dependencies, spaCy model, browser/driver versions, container versions, and reproducible npm installation.
- Add `.dockerignore` rules; prevent host dependencies and credentials entering build contexts. Use appropriate non-root runtime users and minimal runtime dependencies.
- Add initial checked-in Prisma migrations and a safe existing-database baselining procedure. Validate both new database creation and upgrade paths. Stop using production `db push` as deployment migration control.
- Fix gateway/dependency startup behavior, readiness/liveness, graceful termination, environment propagation, gRPC proto packaging, and usable local entry points. Validate both slash forms and proxy redirects.
- CI runs non-mutating lint/type checks, meaningful existing tests, both Angular and Next.js builds, individual service Docker builds, and an isolated stack smoke test. Repair stale boilerplate tests; implement meaningful baseline tests for ingestion and notifications.
- Establish per-project build/test jobs, minimal dependency startup recipes, and configuration boundaries. Package protobuf/schema dependencies with the service that uses them. Document source-checkout requirements explicitly and remove runtime dependence on sibling filesystem mounts. Stub only unavailable external contracts in local tests; keep the full integrated smoke test.

**Completion gate:** clean Linux CI and documented Windows/Docker developer setup pass; every project builds/tests through its own entry point; service dependency recipes do not start unrelated apps; integrated services become ready and the gateway reaches them; migrations apply safely; no placeholder failing tests; stop/start does not depend on arbitrary sleep timing. Independent interactive demos are completed by their owning feature phases.

**Checkpoint:** `fix(platform): establish reproducible builds and healthy local startup` → verified push.

### P03 — Freeze product scope, data ownership, API contracts, and workload targets

**Outcome:** every following phase implements one coherent product and architecture.

- **Confirmed Launch Scope & User Decisions:**
  - *Target Market & Geography:* Regional focus on South Asia / Bangladesh and localized technology market (Dhaka/Chattogram tech hubs, regional remote, BDT/USD compensation, Asia/Dhaka time zone).
  - *Core Business Model:* Job aggregator with outbound applications (tracking outbound candidate clicks and candidate-managed application status; not an in-platform recruiting marketplace or ATS).
  - *Mobile Intent (P18):* Android-first native application with Kotlin and Jetpack Compose consuming the versioned platform API.
  - *Infrastructure & Hosting Budget (P14):* $0 / Free Tier commitment. Full-stack execution via local Docker Compose; free cloud services (Supabase/Neon PostgreSQL, MongoDB Atlas M0, Firebase Auth free tier, GitHub Actions free minutes) for staging. No paid SaaS commitments.
  - *Resume Parser Capability (P08):* Text-layer digital PDFs only (`pypdf`); explicitly reject scanned image PDFs and encrypted documents (`SCANNED_PDF_NO_TEXT`, `ENCRYPTED_PDF`) without OCR (Tesseract) overhead.
- **Service & Data Ownership Frozen:**
  - `service-user`: Owns candidate identity, profile, saved jobs, application tracking history, alerts, and consent/deletion requests (PostgreSQL via Prisma).
  - `service-ingestion`: Authoritative owner of the canonical job catalog, sources, deduplication, and lifecycle state (MongoDB), plus rebuildable search projections (Elasticsearch 8.x). Owns the unified search route `/api/v1/jobs` and legacy gateway `/api/jobs`.
  - `service-scraper`: Owns ephemeral crawling, source-specific HTML extraction, rate limits, and event publishing (`job.collected.v1`). Owns no persistent database.
  - `service-resume`: Owns stateless NLP extraction (spaCy PhraseMatcher) and gRPC/REST parser execution. Persisted skills are saved by `service-user`.
  - `service-notification`: Owns notification templates, preference matching, rate caps, unsubscribe state, and dispatch delivery receipts (`alert.dispatched.v1`).
  - `frontend-next`: React/Next.js candidate portal. Consumes `/api/v1/*` via gateway. Direct Elasticsearch connection is deprecated.
  - `frontend-admin`: Angular 18 operations console. Consumes `/api/v1/admin/*` and WebSocket telemetry. Retained as Angular.
- **Machine-Readable Contracts Established:**
  - *OpenAPI 3.1:* [`contracts/openapi/seekers-api-v1.yaml`](contracts/openapi/seekers-api-v1.yaml) defining all candidate, public, and admin endpoints with RFC 7807 error envelopes, cursor pagination, rate limits, and correlation tracking.
  - *Event Schemas:* [`contracts/events/`](contracts/events/) containing `envelope.schema.json`, `job.collected.v1.schema.json`, `job.ingested.v1.schema.json`, `resume.parsed.v1.schema.json`, `candidate.registered.v1.schema.json`, and `alert.dispatched.v1.schema.json` with synthetic valid/invalid fixtures.
  - *Protobuf Evolution:* [`contracts/protobuf/resume/v1/resume.proto`](contracts/protobuf/resume/v1/resume.proto) established as authoritative contract. Synchronized with `shared-protos/resume.proto` and `service-user/proto/resume.proto`. Backward-compatible evolution from `file_path` to `document_id` / `content_bytes`.
  - *Contract Validation:* Automated test runner [`contracts/validate-contracts.js`](contracts/validate-contracts.js) verified and integrated into GitHub Actions CI pipeline (`validate-contracts` job).
- **Search Transition Established:**
  - Gateway routes `/api/v1/jobs` and legacy `/api/jobs` to `service-ingestion`.
  - `frontend-next` transitions to consuming the unified gateway endpoint; direct internal Elasticsearch connection in Next.js is eliminated.
- **Carried-Forward Unverified Runtime Gaps from P02:**
  - Full-stack live container startup and inter-service HTTP/gRPC/Kafka throughput under sustained load.
  - Live execution of Prisma migration `20261027000000_init` against running PostgreSQL container in CI.
  - Dynamic runtime spaCy model download (`en_core_web_sm`) rather than pinned wheel checksum asset.
  - Angular Karma tests (`test:ci`) require headless Chrome environment in CI.
  - Live Elasticsearch 8.10.2 indexing and search query execution in CI.
  - Operational checklist for upstream provider token rotation.

**Completion gate:** approved scope and architecture decisions; traceable entity/API/event definitions in `contracts/`; feature-to-phase mapping; concrete standalone/demo/integration specifications for all 7 projects; Angular retained; confirmed $0 free tier capacity profile. Automated contract validation passes in CI.

**Checkpoint:** `docs(architecture): define production contracts scope and capacity targets` → verified push.

### P04 — Design the complete responsive product and its component system

**Outcome:** a distinct, usable Seekers interface exists as a reviewed design specification and working interactive prototypes across Next.js, Angular, and Python.

- **Design System Established:** [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) documents complete visual tokens (deep charcoal `#090d16` base, elevated slate `#0f172a`, brand amber `#f59e0b` accents, Sora headings, Plus Jakarta Sans body, JetBrains Mono code). WCAG 2.1 AA contrast verified (15.4:1 primary text, 7.1:1 secondary text).
- **Candidate App Prototype (`frontend-next`):**
  - Search-first header with keyword search, location selector (`Dhaka`, `Chattogram`, `Remote`), and URL-addressable query state.
  - Desktop filter bar (Remote eligibility, Seniority, Job Type, Sort order) and Mobile Filter Bottom Sheet (`MobileFilterSheet.tsx`) with focus containment, touch targets $\ge 44$px, and live counter.
  - Interactive Job Cards (`JobCard.tsx`) with salary display (BDT/USD), remote/seniority badges, freshness, and bookmark save toggle.
  - Accessible Job Detail Drawer (`JobDetailDrawer.tsx`) with Escape key handling, focus trap, outbound application link disclaimer ("Apply on Source ↗"), and "+ Track Application" action.
  - Candidate Workspace: `Discover`, `Saved Jobs`, `Applications` (candidate-managed status tracker with editable notes), `Job Alerts` (subscription frequency & active switch), and `Profile & Skills` (interactive tag cloud and digital resume summary).
  - Truthful synthetic fixtures: 12 curated South Asia / Bangladesh technology roles conforming strictly to OpenAPI 3.1 `seekers-api-v1.yaml` schema; fabricated counters ("2.4M+ jobs") eliminated.
  - Truthful demo banner and provenance modal explaining $0 free-tier constraints and local data boundaries.
- **Standalone Angular Operations Console (`frontend-admin`):**
  - Coherent Angular 18 operations shell with dark theme styling matching Seekers design system.
  - Real-time pipeline health metrics: Active Connectors, Hourly Throughput, Processing Latency, Dead Letter Queue counter.
  - Crawler Source Connectors Table: Live status for 5 regional sources (`bdjobs`, `linkedin-bd`, `chaldal-careers`, `pathao-careers`, `glassdoor-bd`) with pause/resume controls.
  - Ingestion Audit Feed: Filterable table of incoming job events with search, source filter, and "Inspect JSON ↗" modal showing raw `job.ingested.v1.schema.json` event payloads.
  - Interactive Simulation Toolbar: Crawl Burst (+5 events), Pause/Resume stream, Test Offline reconnect banner, and deterministic Reset.
- **Independent Python Resume Extractor UI (`service-resume`):**
  - Served directly from FastAPI (`GET /` and `GET /demo`) as an independent HTML/CSS/JS interface without Node/React dependencies.
  - Drag-and-drop PDF upload zone with client-side file format & 10MB size validation.
  - Quick 1-click "⚡ Load Sample Fullstack CV" button for instant local review.
  - In-memory spaCy PhraseMatcher execution with animated progress indicator.
  - Categorized Extracted Skills cloud and structured JSON download.
  - Edge case simulations: Scanned PDF without text layer (`SCANNED_PDF_NO_TEXT`), encrypted PDF (`ENCRYPTED_PDF`), and oversized file (`FILE_TOO_LARGE`).
  - Clear candidate privacy and zero-retention notice.
- **Responsive & Accessibility Evidence:**
  - Validated via real browser rendering and screenshot capture across 320px, 360px, 390px, 768px, and 1280px widths.
  - Zero horizontal overflow confirmed (`scrollWidth <= innerWidth`).
  - Modal focus trap, backdrop dismissal, and keyboard Escape key restoration confirmed.
  - All 5 pytest unit tests pass; Next.js builds cleanly with Turbopack and passes ESLint (0 errors); Angular 18 builds cleanly with 0 errors.

**Completion gate:** reviewed prototypes for the candidate app, standalone Python extractor, and Angular dashboard across 320, 360/390, 768, and desktop widths; no blocked core task; keyboard/focus and contrast checks; consistent tokens and reusable component specifications; explicit demo/live distinctions; no invented public counts.

**Checkpoint:** `feat(design): establish responsive Seekers product experience` → verified push.

### P05 — Complete identity, onboarding, profiles, and account settings

**Outcome:** a candidate can securely create and manage an account across sessions.

- **Real Firebase Authentication Lifecycle:**
  - Configured Firebase Client SDK (`frontend-next/lib/firebase.ts`) and Admin SDK (`service-user/src/auth/firebase-admin.provider.ts`) connecting predictably to Auth emulator (`localhost:9099`) or production Firebase.
  - Implemented registration, login, email verification status, password reset, session refresh, and logout in `AuthModal.tsx` and authoritative `AuthProvider` (`frontend-next/lib/auth-context.tsx`).
  - RFC 7807 structured auth error responses (`TOKEN_EXPIRED`, `TOKEN_REVOKED`, `ACCOUNT_DISABLED`).
  - Truthfully isolated Demo Mode: clicking "Explore Portfolio Demo" isolates synthetic candidate personas without corrupting or synchronizing with live PostgreSQL databases.
- **Reliable Firebase-to-PostgreSQL Synchronization:**
  - Idempotent `POST /users/sync` endpoint in `service-user`: verifies Firebase claims, resolves email/identity conflicts safely, and upserts user record with role assignment.
  - Explicit synchronization state machine in candidate frontend (`STARTUP`, `SIGNED_OUT`, `SYNCING`, `READY`, `SYNC_ERROR`, `DEMO_MODE`).
  - Unsynchronized accounts remain blocked with a clear retry trigger; synchronization errors never falsely present an account as fully ready.
- **Relational Profiles, Onboarding, and Skills Persistence:**
  - Prisma forward migration `20261027100000_p05_identity_and_profiles` adding `RemoteEligibility` enum, persistent profile attributes (`name`, `title`, `skills`, `extractedSkills`, `locations`, `remotePreference`, `minSalary`, `currency`, `onboardingCompleted`, `onboardingStep`).
  - Safely dropped misleading `passwordHash` placeholder column.
  - Profile read (`GET /users/profile`) and persistent update (`PUT /users/profile`) with DTO validation (`UpdateProfileDto`) and OpenAPI-conforming response (`UserProfileResponseDto`).
  - Connected `ProfileWorkspace.tsx` in Next.js candidate app: live profile editing, interactive skill tag adding/removal, and preference saving.
- **Server-Enforced Ownership & Role Boundaries:**
  - `RolesGuard` and `@Roles('ADMIN')` decorator enforcing server-side authorization via Firebase custom claims and database query fallback.
  - Verified cross-user isolation: User B cannot view or modify User A's profile (`test/standalone-smoke.js`).
  - Non-admin candidates requesting privileged routes receive 403 Forbidden with RFC 7807 problem details.
- **Honest, Durable Account Deletion & Data Export Lifecycle:**
  - Forward-migrated `AccountDeletionRequest` with 30-day grace period `scheduledFor`, `idempotencyKey`, and explicit `"DELETE_MY_ACCOUNT"` confirmation.
  - Forward-migrated `AccountExportRequest` recording personal data archive generation requests.
  - Status endpoint `GET /users/account/status` returning active lifecycle state.
  - Connected `DataControlModal.tsx` providing real user triggers and displaying durable scheduled dates.
- **Standalone NestJS API Quickstart & Strict Integration Verification:**
  - Dedicated standalone recipe: `service-user` runs independently with local PostgreSQL (`docker compose up -d user-postgres`) and Firebase Auth emulator (`firebase.json`).
  - Strict standalone smoke integration test suite (`service-user/test/standalone-smoke.js` / `npm run test:smoke`): 100% pass (47 assertions across 16 checks) verifying unauthenticated rejection (401), invalid token rejection (401), emulator JWT verification, candidate sync, profile persistence, cross-tenant isolation, role boundaries (403), data export, and 30-day scheduled erasure without swallowing errors.
  - Negative error-handling verification (`npm run test:smoke:negative`): proves that unavailable API or emulator dependencies cause non-zero exit codes (exit 1) and never report false-positive success.
  - CI pipeline (`ci-pipeline.yml`): automated integration job running migrations and strict smoke tests against isolated PostgreSQL container and Firebase Auth Emulator.
  - 25 Jest unit tests pass in `service-user` (`npm test`) and non-mutating ESLint passes with 0 errors.
  - Real browser visual and responsive verification across 320px, 360px, 390px, 768px, and 1280px widths (zero horizontal overflow confirmed).
  - Physical asynchronous queue purging and zip archive bundling are documented and deferred to P13.

**Completion gate:** complete auth/profile browser journeys pass; reload and token expiry behave correctly; user A cannot access user B's data; synchronization failure cannot show account readiness; profile changes persist; mobile forms work with keyboard/autofill; the documented standalone NestJS API demonstration and real integration checks pass.

**Checkpoint:** `feat(identity): deliver reliable candidate accounts and profiles` → verified push.

### P06 — Deliver a complete job catalog, unified search, and job details

**Outcome:** users can find, inspect, and safely open appropriate listings.

- **Canonical Job Catalog & Storage Architecture:**
  - Authoritative document persistence in MongoDB (`jobs` collection) with unique indexes on `id` (public UUID v4) and `canonical_url`.
  - Compound indexes on `[status, published_at, id]` and `[status, salary.min, id]` for deterministic keyset pagination.
  - Text search index on `title`, `company`, `description`, `skills`, `location`.
  - Rebuildable Elasticsearch projection in `jobs_index` with full-text boosting (`title^3`, `skills^2`, `company^2`, `description`) and automatic fallback to MongoDB when Elasticsearch is unavailable.
- **Unified Search API & Parameter Contracts:**
  - Implemented `/api/v1/jobs` and backward-compatible legacy alias `/api/jobs` (handling trailing slashes).
  - Contracted query parameter validation matching OpenAPI 3.1: `q` (max 100), `location` (max 100), enums (`remote_eligibility`, `job_type`, `seniority`, `currency`), `min_salary`, `sort` (`date_desc`, `salary_desc`, `relevance`), `limit` (1-100, rejecting negative/oversized with 400), and opaque keyset cursor `cursor`.
  - RFC 7807 Problem Details returned for validation errors and not-found states.
  - Correlation tracking via `X-Correlation-ID` and search engine telemetry via `X-Search-Engine`.
- **Safe Outbound Redirects & SSRF Protection:**
  - `GET /api/v1/jobs/:id/outbound` validates listing active status (404 if expired).
  - Rigorous destination validation preventing SSRF, private network probing (RFC 1918), loopback scanning (`127.0.0.0/8`), link-local metadata exploitation (`169.254.169.254`), credentials, and script/data schemes.
  - Dual negotiation: returns safe 302 redirect for HTML browsers or 200 `{ destination_url }` for API/crawler clients.
- **Decoupled Next.js Web Client & Public Detail Pages:**
  - Removed direct `@elastic/elasticsearch` dependency from Next.js web tier; routes proxy cleanly through to `service-ingestion` (`INGESTION_API_URL`).
  - Added public shareable detail route `/jobs/[id]` (`force-dynamic`) with dynamic OpenGraph metadata and JSON-LD `JobPosting` structured data for active listings.
  - Dedicated custom 404 page for unavailable/expired listings.
  - Interactive Job Detail Drawer with verified outbound apply link and permalink copy.
  - Distinct loading skeletons, honest error banners with bounded retry, and clear results count telemetry.
  - Preserved toggleable standalone portfolio demo mode (`?demo=true` or in-app button) with prominent amber banner and local fixtures.
- **Verification & Testing Suite:**
  - 33 unit tests in `service-ingestion` (`npm test`) covering normalization, UUID generation, URL safety (including IPv6 ULA/loopback/link-local), query validators (strict integer limits, unified cursor schema), and endpoint mocks.
  - 21 strict integration tests in `service-ingestion` (`npm run test:integration`) against isolated test MongoDB database and isolated Elasticsearch index (`jobs_index_test`), with standalone MongoDB fallback mode verification.
  - 12 Next.js regression tests (`npm test` in `frontend-next`) covering auth synchronization (4 tests) and job search/outbound proxying/safe JSON-LD/503 resilience (8 tests).
  - Next.js Turbopack production compilation (`npm run build`) and ESLint (`npm run lint`) pass with 0 errors and 0 warnings.
  - Real browser visual and interaction verification across desktop (1280x800) and mobile (390x844), with zero horizontal overflow confirmed.
  - CI pipeline (`ci-pipeline.yml`) updated with live MongoDB and Elasticsearch services running unit and strict integration tests.

**Repairs & Safety Hardening Completed:**
- Safe JSON-LD serialization (`safeJsonLd`) escaping HTML script break-out tokens (`<`, `>`, `&`).
- Truthful metadata without fabricated expiry dates or hardcoded countries; synthetic demo listings flagged with explicit `is_synthetic` provenance, suppressing search crawler indexing.
- Outbound URL validator hardened against IPv6 loopback (`::1`), ULA (`fc00::/7`), link-local (`fe80::/10`), and single-label hosts while permitting domains with "data" substrings (e.g. `metadata.example.com`).
- Effective listing availability strictly enforced across canonical detail and outbound endpoints (rejecting expired and flagged roles with RFC 7807 problem details).
- Non-destructive Elasticsearch initialization preserving existing indexes on service startup.
- Upstream 503 errors handled gracefully in Next.js SSR with accessible retry views rather than false 404 `notFound()`.
- Client Job Detail Drawer fetches canonical detail dynamically with in-flight abort handling.

**Completion gate:** search/detail/apply journeys and every filter pass against representative fixtures; `/api/jobs` and slash/versioned aliases have tested semantics; query plans/indexes are reviewed; error and no-result states are distinct; independent Next.js demo and seeded real-search API quickstart pass with accurate mode labels; no false “New” badges or fabricated catalog totals. `[PASS]`

**Checkpoint:** `fix(jobs): close catalog safety and discovery regressions` → verified push.

### P07 — Build real source coverage and recoverable ingestion

**Outcome:** the catalog stays current through a pipeline that can recover from failure.

- **Maintained Evidence-Backed Launch Source Coverage (`service-scraper`):**
  - Replaced hardcoded example targets with maintained operational connectors for approved regional and ATS sources (`greenhouse-feed`, `lever-feed`, `bdjobs-tech`, `chaldal-careers`, `pathao-careers`, and `fixture-local`).
  - Recorded operational configurations: connector ID, version, approved hosts, review date, permission reference, attribution, fetch budget (max req/sec, burst), retention, and enabled status. Unapproved sources (`linkedin-bd`) remain explicitly disabled with truthful partner requirement justification.
  - Hardened Server-Side Request Forgery (SSRF) guard in Go (`ssrf.go`) validating URL schemes (`http`/`https`), rejecting credentials, single-label intranet hosts, loopback (`127.0.0.0/8`, `::1`), RFC 1918 private subnets, cloud metadata (`169.254.169.254`), carrier-grade NAT (`100.64.0.0/10`), and IPv6 ULA (`fc00::/7`), with redirect revalidation.
- **Durable Scheduling Core & Standalone Go Collector:**
  - File-backed scheduler store (`scheduler.go`) implementing worker leases with automatic expiration, lease conflict rejection, and durable checkpoints (`last_run_at`, `last_success_at`, `jobs_collected`, `status`, `last_error`) surviving process crashes.
  - Per-source rate limiting with token bucket, exponential backoff, and jitter.
  - Standalone Go CLI supporting `-mode=cli`, `-fixture=<path>`, `-format=json|ndjson`, `-output=stdout|file|kafka`, and exit codes 0 (success), 1 (fatal error), and 2 (drift warning).
  - Deterministic offline execution mode allowing local verification without Kafka, MongoDB, Node, or Playwright.
- **Versioned Event Streaming & Backward-Compatible Consumer:**
  - Emits versioned `SeekersEventEnvelope` (`models.go`, `publisher.go`) conforming strictly to `contracts/events/envelope.schema.json` and `job.collected.v1.schema.json`, partitioned on `source_url_hash`.
  - Dual-publisher and unwrapping adapter in `service-notification/index.js` ensuring backward compatibility with both legacy flat payloads (`jobs.new`) and versioned event envelopes.
- **Recoverable Canonical Persistence & Dead-Letter Quarantine (`service-ingestion`):**
  - Schema validation gate (`src/events/validator.js`) validating incoming envelopes and payloads.
  - Poison message quarantine: malformed events are persisted to `dead_letters` collection with error diagnostics before committing Kafka offsets, preventing partition head-of-line blocking.
  - Manual Kafka offset commits: offsets advance only after durable MongoDB canonical persistence or dead-letter quarantine; no swallowed database errors.
  - Atomic document state tracking in MongoDB: unique indexes on `id`, `canonical_url`, and `source_url_hash`; duplicate delivery preserves `first_seen_at` without bumping revision numbers or dirtying the search projection.
- **Projection Outbox, Reconciliation & Safe Catalog Lifecycle:**
  - Projection outbox worker (`src/search/projection-worker.js`) projecting `PENDING` MongoDB records to Elasticsearch with optimistic concurrency revision checks.
  - Catalog reconciliation engine (`src/search/reconcile.js`) detecting and repairing missing, stale, excess, and status-misaligned documents.
  - Zero-downtime index rebuild (`src/search/reindex.js`) with versioned indexes (`jobs_v<timestamp>`), document count/query verification gates, and atomic alias swaps.
  - Standalone event runner (`bin/event-runner.js`) processing NDJSON event streams or standard input without Kafka.
  - Minimal operator CLI (`bin/operator.js`) providing commands for `status`, `dead-letters list|inspect|replay`, `reconcile [--dry-run]`, and `reindex`.
- **Verification & Testing Suite:**
  - 9 Go unit tests in `service-scraper` covering SSRF guards, ATS parsers, schema drift, monotonic scheduler leases (`FenceToken`), rate limiters, and offline fixtures. `go vet` passes cleanly.
  - 6 unit tests in `service-notification` including versioned event envelope unwrapping.
  - 56 unit tests in `service-ingestion` covering models, schema validators, dead-letter quarantine, atomic Mongo revisions, monotonic search projection guards, reconciliation with `search_after`, and zero-downtime index rebuild.
  - Strict integration tests against isolated MongoDB and Elasticsearch verifying event ingestion, dead-letter isolation, outbox flushing, reconciliation, and zero-downtime index rebuild.
  - Contract validation suite (`contracts/validate-contracts.js`) passing 100%.
  - All seven services compile, test, and build cleanly.

**Completion gate:** at least the agreed launch sources produce verified current listings; source outage, selector drift, duplicate delivery, concurrent upsert, worker crash, malformed event, Kafka interruption, and Elasticsearch outage tests pass; committed events are accounted for; index rebuild can recover the catalog; the Go and Node ingestion standalone quickstarts work without unrelated apps and their real Kafka integration checks pass. `[PASS]`

**Checkpoint:** `feat(ingestion): deliver real connectors and recoverable job processing` → verified push.

### P08 — Deliver secure resume upload and durable profile enrichment

**Outcome:** a candidate owns a private resume and can review persistent extracted skills.

- Replace the disconnected anonymous UI path with the authenticated account-owned upload workflow. If an anonymous preview is retained, explicitly isolate its quota, retention, and lack of persistence.
- Use private object storage and short-lived scoped access; replace arbitrary shared filesystem paths with authorized document/object identifiers. Validate size, signature/type, pages, storage ownership, and access expiration.
- Apply scanning/quarantine as required by the threat model, parser time/memory/concurrency limits, asynchronous processing state, retries, and cancellation/deletion handling. Do not block API event loops with unbounded PDF/NLP work.
- Define parsing status and failure reasons, canonical skill taxonomy/aliases, supported languages, empty/encrypted/scanned PDF behavior, and candidate review/edit before profile updates. Add OCR only if launch scope requires it.
- Version parser outputs and evaluate on consented or synthetic representative resumes. Avoid claims that dictionary matching understands every skill or predicts employment outcomes.
- Deliver the Python Resume Extractor as its own usable application: Python-served responsive upload/result screens, synthetic sample file, structured-result download, API documentation, and useful unsupported/error states. Run actual extraction through the same core as the integrated service, without requiring Node, the Next.js UI, Firebase, PostgreSQL, MongoDB, or Kafka for local standalone use. Additional scanning/storage/queue dependencies are documented and scoped to their deployment mode.
- Implement an isolated public-demo policy if it is published: synthetic sample first, explicit upload notice and short retention/deletion behavior, bounded processing, disabled production integrations, and no production credentials or candidate data. The production profile-enrichment path remains authenticated and independently integration-tested. Capture the Python project's screenshots, walkthrough, tests, and accurate CV-ready summary at this checkpoint.

**Completion gate:** the standalone Python application accepts a supported sample PDF, performs real extraction, displays/downloads results, and handles invalid input through its own quickstart; the integrated valid upload → processing → reviewed skills → persisted profile journey survives reload; invalid/oversized/malformed/password-protected/scanned documents have defined results; cross-user access and arbitrary-path requests fail; retry/deletion/retention tests pass; extraction quality meets P03's agreed benchmark; standalone and integrated paths use the same parsing implementation. `[PASS]`

**Checkpoint:** `feat(resume): deliver private durable resume processing` → verified push.

### P09 — Complete the candidate workspace and real support flows [Completed]

**Outcome:** candidates can manage their search and every exposed action works.

- Implement saved/unsaved jobs, saved searches, notes, and a lightweight application tracker with explicit candidate-managed status and history. Use persistent IDs, pagination, ownership, and safe repeat operations.
- Complete settings, profile/resume management, alert preference entry points, and account-data controls. Show expired/removed saved listings clearly.
- Replace console-only feedback with a persisted report endpoint, acknowledgment/reference, validation, abuse controls, and a support queue. Define support contacts/help and clear error guidance.
- Handle network interruption, double-clicks, concurrent sessions, stale updates, inaccessible jobs, and page reloads. Complete loading/error/empty states and responsive workspace navigation.

**Completion gate:** all workspace actions persist and synchronize correctly; ownership/idempotency tests pass; report submission creates a retrievable operator item; no dead buttons, fake saves, or false application-submitted confirmations. [Verified: 59 Jest tests pass, standalone smoke suite 33 checks pass, 0 lint errors, Next.js build passes]

**Checkpoint:** `feat(workspace): deliver saved jobs applications and support` → verified push.

### P10 — Implement explainable recommendations and matching

**Outcome:** recommendations use actual candidate preferences and job attributes.

- Start with measurable deterministic matching for skills, location/remote constraints, role/seniority, and other agreed preferences. Define hard exclusions versus ranking preferences and treatment of missing data.
- Return useful explanations grounded in stored evidence, such as matching skills or preferred location. Avoid invented percentages or explanations unsupported by the input.
- Recompute incrementally on relevant profile/job changes with bounded fan-out, durable state, freshness/version tracking, and deduplication. Do not scan every job for every user on each event.
- Build recommendation/feedback controls and establish cold-start behavior. Evaluate a labelled relevance set and define metrics for quality, coverage, stale matches, and user feedback.
- Consider semantic/ML ranking only after the baseline is measured and its privacy, operating cost, and quality improvement are established.

**Completion gate:** real profiles generate reproducible relevant results; hard exclusions hold; changes invalidate stale matches; duplicate events do not duplicate recommendations; relevance and compute-cost budgets pass.

**Checkpoint:** `feat(matching): deliver explainable candidate recommendations` → verified push.

### P11 — Deliver dependable alerts and notification preferences

**Outcome:** opted-in candidates receive useful alerts with durable delivery tracking.

- Replace fake SMTP and hardcoded recipients with a configured provider and actual saved-search/match preferences. Use a local capture mailbox for tests; never send test messages to real users.
- Implement immediate/digest schedules, locale/time-zone behavior, frequency caps, verified addresses, unsubscribe, suppression, and preference changes. Add an in-app notification inbox with read state if included in launch scope.
- Process durable delivery jobs with deduplication keys, retry/backoff, provider failure classification, dead letters, rate limits, and provider event/webhook verification. Handle bounce/complaint signals and delayed or duplicate callbacks. Define the ambiguous-acceptance policy for a timeout after a provider may have accepted an email; use provider idempotency where supported and do not claim universal exactly-once email delivery.
- Design accessible branded templates and job deep links; use source freshness/expiry checks at send time. If real-time UI remains, authenticate and authorize sockets, configure the gateway path, reconnect safely, and plan multi-instance fan-out.
- Finish the notification service's independent event-replay/provider-sandbox demonstration using its real preference, template, delivery-state, and retry core. Provide a local capture mailbox/preview, deterministic failure scenarios, service-only setup and docs, and separate checks against the real Kafka/provider contract. Demonstrating delivery never requires sending to real recipients.

**Completion gate:** one durable delivery record exists per eligible candidate/alert; tested retries and replay do not duplicate delivery under the selected provider's supported guarantees; non-matching, unsubscribed, or suppressed users receive none; outage/replay/callback and ambiguous-acceptance tests pass; state and provider receipts make failures diagnosable; standalone sandbox demonstration and integrated delivery checks pass with no production-recipient dependency.

**Checkpoint:** `feat(notifications): deliver preference-aware reliable job alerts` → verified push.

### P12 — Build the Angular operations dashboard and standalone showcase

**Outcome:** operators can run the platform safely, and a recruiter can independently evaluate a complete Angular dashboard.

- Preserve Angular and upgrade its supported toolchain. Provide a usable responsive console with server-enforced roles, privileged-session controls, and an audit trail in live mode. Keep the dashboard independently buildable/deployable; do not migrate it to React.
- Implement source/connector health and enable/pause actions, crawl history, catalog moderation, duplicates/expiry review, user reports, support triage, parser failures, index freshness, queue lag, and delivery failures.
- Add scoped retry/replay/reindex controls with previews, bounded batches, idempotency, and deliberate confirmation for destructive actions. Restrict access to resume contents and personal data.
- Replace hardcoded health indicators and localhost socket addresses with real state. Cover disconnection, stale data, unauthorized requests, and partial outages.
- Deliver clearly separated demo/live data adapters that follow the same typed API/event contracts. The standalone Angular demo contains realistic synthetic metrics/listings, functional filters, tables/charts and drill-downs, simulated event updates, and bounded local-only interactions. Label every simulated source and action honestly; no demo control reaches a production admin endpoint.
- Provide a verified standalone quickstart and, when deployed in P14, a distinct demo entry URL. Add focused Angular architecture documentation, component/state/testing explanations, screenshots, a short demonstration script, and a CV-ready description of verified features.

**Completion gate:** a clean standalone Angular demo starts without running the backend fleet and its interactive journeys pass on mobile/desktop; live mode passes its real API/event contract and operator recovery checks; a candidate cannot invoke admin APIs; every privileged live mutation records actor/action/time/outcome; demo mode cannot grant production rights or invoke production mutations; no placeholder admin routes.

**Checkpoint:** `feat(admin): deliver standalone Angular dashboard and secure live operations` → verified push.

### P13 — Complete cross-product security, privacy, accessibility, and regression qualification

**Outcome:** the feature-complete product meets its defined security and usability bar.

- Test authorization/ownership across all resources, admin privilege boundaries, upload abuse, SSRF/source URL handling, injected job content, open redirects, token/session threats, rate limits, expensive queries, and account enumeration. Apply session-appropriate CSRF protections where cookies are used.
- Configure TLS boundaries, internal service identity, security headers/CSP, CORS, request/file limits, timeouts, dependency/image scans, and PII-safe logging. Validate distributed quotas and graceful rejection under abuse.
- Verify data export/deletion and retention across PostgreSQL, MongoDB, search projections, object storage, derived matches, delivery state, analytics, and documented backup retention. Prepare product-specific privacy/terms/source policies for the launch markets.
- Test keyboard/screen-reader access, dialog focus management, labels/live regions, contrast, zoom, reduced motion, touch sizes, and slow-network recovery against the agreed accessibility standard.
- Run the full browser/API/contract regression suite on the supported browser/device matrix, including unhappy paths. Resolve all release-blocking defects and document any lower-priority limitations accurately.
- Verify isolation across every standalone/demo and live deployment: synthetic datasets/identities, upload retention, mailbox routing, admin permissions, replay endpoints, and production configuration rejection of unsafe demo settings. Test direct API requests as well as UI controls; a demo label is not a security boundary.

**Completion gate:** no unresolved critical/high exploitable release blocker; no cross-user or role-boundary failure; core journeys pass; deletion/export are verified; accessibility checks include manual evaluation; security review and remediation evidence are recorded.

**Checkpoint:** `fix(quality): qualify production security privacy and accessibility` → verified push.

### P14 — Establish production infrastructure, telemetry, and disaster recovery

**Outcome:** the application can be deployed, observed, recovered, and rolled back reliably.

- Provision isolated staging/production through infrastructure as code using the selected provider. Use private networks, managed/persistent data services, secret storage, least-privilege identities, DNS/TLS, CDN, access controls, and explicit resource budgets.
- Run stateless app replicas as needed; externalize uploads and delivery state. Configure database pools/indexes, broker replication/partitions/retention, search durability/capacity, and maintenance procedures for the approved availability target.
- Build immutable images once, scan/sign or attest as appropriate, deploy by digest, and use backward-compatible migration ordering. Establish feature flags and safe rollout/rollback controls.
- Add structured logs, correlation IDs, traces, service and dependency metrics, frontend error/performance reporting, job freshness/quality metrics, queue lag, parser/delivery outcomes, synthetic journeys, and actionable alerts with owners/runbooks.
- Configure backups/PITR where available, object recovery, recovery credentials, retention, and restore drills into an isolated environment. Test regional/provider dependency failure to the extent required by the selected design.
- Provide deployment recipes and independent artifacts for all seven apps/services, with explicit service-owned secrets, health checks, versioned contract dependencies, and minimal infrastructure requirements. Provision distinct isolated portfolio demo entry points for the Python extractor, Angular dashboard, candidate app, and other approved service API/CLI demonstrations. Keep demo data, quotas, mailing, credentials, and billing budgets separate from production; document any service remaining local-only. Source links point directly to the relevant service directory; creating extra repositories or domains is not required.

**Completion gate:** staging is reproducible from code; each service has an independently deployable artifact and verified deployment recipe; approved standalone demo entry points work with isolated resources; production configuration passes review; deployment and rollback rehearsals pass; alerts fire during injected failures; real data-store restores satisfy agreed RPO/RTO; no public database/search/broker/admin-metrics exposure.

**Checkpoint:** `feat(platform): establish observable recoverable production infrastructure` → verified push.

### P15 — Prove performance, capacity, and failure recovery

**Outcome:** documented workload limits replace untested scale claims.

- Seed representative synthetic accounts/catalog data at target cardinality. Model skewed popular searches, unique filters, anonymous/authenticated sessions, write bursts, crawl/index load, resume workloads, notification fan-out, and cache-cold conditions.
- Run baseline, ramp, target, spike, endurance, and dependency-failure tests against production-like staging. Use appropriate load drivers and real-device browser measurements; do not load third-party sources/providers without an agreed test arrangement.
- Profile query plans, DB pools, CPU/memory, event-loop lag, browser assets, search shards/mappings, worker throughput, and queue backlog. Optimize measured bottlenecks and add caching/autoscaling only with correct invalidation and ownership rules.
- Verify replica loss, rolling deploy, broker/search unavailability, worker crash/replay, object-store delays, and email provider throttling. Check recovery without lost durable work, duplicate user-visible actions, or privacy leakage through caches.
- Produce a capacity/cost report with hardware, dataset, request mix, tested duration, p50/p95/p99, error rate, saturation, headroom, recovery time, and known limits. Repeat tests affected by fixes.
- Capture service-specific benchmark evidence where meaningful for the portfolio, with dataset/hardware/mode and limitations. Test each service's resource limits and independent failure behavior as well as full-platform throughput; synthetic demo traffic never becomes a production-scale claim.

**Completion gate:** section 7's agreed performance/recovery targets pass at the selected capacity tier with budgeted headroom; no unexplained event/data loss, unbounded backlog, duplicate deliveries, or sustained memory growth; sustainable cost and rollback behavior are demonstrated.

**Checkpoint:** `perf(platform): verify capacity resilience and operating cost` → verified push.

### P16 — Qualify the platform beta and the individual portfolio projects

**Outcome:** real candidates can complete their tasks, operators can support them, and every individual project is understandable and demonstrable to a recruiter.

- Release to a bounded beta cohort behind appropriate access/feature controls. Supply real permitted source coverage, accurate public claims, monitored support, and clear known limitations.
- Observe discovery → detail → outbound application, account/profile completion, resume review, saved jobs, tracker, alerts, and feedback on real mobile/desktop devices. Obtain consent for research/analytics where required.
- Investigate failed tasks, confusing copy, relevance problems, stale listings, unexpected costs, and errors. Fix root causes and add meaningful regressions before expanding the cohort.
- Rehearse incidents, restore, rollback, support escalation, source disablement, delivery suppression, and an emergency feature kill switch. Validate release notes and operator documentation.
- Validate each project's quickstart from a clean checkout without starting unrelated platform services. Recheck approved deployed entry points and clearly mark local-only demonstrations. Verify real core behavior for backend demos and label fixture-only UI demonstrations accurately.
- Complete the per-service portfolio package incrementally assembled in earlier phases: focused README, source-directory link, demo URL or verified local instructions, screenshots/recording, architecture diagram, API/CLI examples, test evidence, tradeoffs, primary stack, accurate CV bullet, and a short interview walkthrough. Create a platform index linking to all seven projects. Do not invent URLs, screenshots, production adoption, or performance results.

**Completion gate:** agreed beta observation window completes; no open release-blocking defect; core task completion and reliability targets pass; all seven standalone quickstarts/demonstrations and portfolio packages pass review; Angular and Python can each be assessed independently; on-call/support/incident owners are prepared; release candidate and rollback candidate are identified.

**Checkpoint:** `fix(release): qualify platform beta and independent portfolio projects` → verified push.

### P17 — Launch production and certify growth tiers

**Outcome:** a stable public release grows within proven operating limits.

- Deploy the qualified immutable release with staged traffic: internal/canary, small public cohort, expanded cohort, then full intended launch. Define hold/rollback thresholds for errors, latency, queues, data quality, and cost.
- Observe SLOs, synthetic journeys, support reports, source freshness, notification health, database recovery posture, and real-user performance. Stop expansion when gates fail; restore service before resuming growth.
- Establish regular security updates, dependency lifecycle reviews, restore/failover drills, incident reviews, source audits, capacity forecasts, cost reviews, and accessibility regression checks.
- Qualify each later population/workload tier before advertising it. Increase production quotas and capacity only with evidence. Keep the capacity report current as query mix and features change.
- Maintain per-service release notes, compatible versioned APIs/events, portfolio entry-point health, and isolated demo quotas. Publish the relevant project's own release/evidence alongside the platform release; independent deployment does not waive the shared contract/integration gates.

**Completion gate:** the declared launch workload is stable for the agreed observation period; live critical journeys and support operations work; rollback remains available; published scale claims match a measured report. Supporting millions is a separately verified tier, not implied by completing a deployment.

**Checkpoint:** `chore(release): launch qualified production release` → verified push/tag and release evidence.

### P18 — Select and build the native mobile product after web stabilization

**Outcome:** a mobile app reuses the stable platform and meets measured device-quality targets.

- **P18A, decision checkpoint:** confirm Android-only versus Android+iOS, device range, team skills, offline behavior, accessibility, push/background needs, and store requirements. Compare React Native and Kotlin/Compose using the same representative release-build slice: authenticated search list, detail, saved job, resume upload, and notification deep link.
- Measure startup, scrolling/frame stability, memory, network/data use, battery-sensitive background work, crash behavior, accessibility, and implementation/maintenance effort on agreed low/mid-range devices. Record the choice; no universal performance winner is assumed.
- **P18B, implementation checkpoint:** deliver native navigation and screens, secure token storage, deep links, file picker/upload recovery, push preferences, offline saved content where included, poor-network recovery, deletion/export, telemetry, and API compatibility. Share contracts/rules where sensible; design platform-appropriate UI.
- **P18C, release checkpoint:** run real-device and accessibility testing, security review, staged beta, store/privacy disclosures and account-deletion requirements, crash/performance gates, and rollout recovery planning.

**Completion gate:** P18A's measured decision is accepted before full development; P18B's complete journeys pass; P18C's release criteria and store requirements pass. Each subphase receives its own commit-and-push checkpoint.

**Checkpoints:** `docs(mobile): select platform from device benchmarks`; `feat(mobile): deliver native candidate workflows`; `chore(mobile): qualify staged store release` → separate verified pushes.

## 6. Design acceptance criteria used throughout

- The app feels like a career discovery tool: clear company/role/location/pay/freshness hierarchy, useful filtering, trustworthy sources, and low-friction return to previous results.
- Preserve the Seekers visual identity while replacing decoration that interferes with reading, scanning, contrast, or device performance. Use consistent typography, spacing, focus, interaction, and feedback rules across all screens.
- No viewport-dependent missing navigation; no horizontal overflow at supported sizes; no hover-only action; touch/keyboard/screen-reader access to core tasks. Test long content, 200% zoom, mobile keyboards, and safe-area behavior.
- Every action has loading, success, validation, failure, and retry/recovery behavior where relevant. Dialogs manage focus, Escape, background interaction, and focus restoration. Forms retain useful input after failures.
- Use truthful unknown states. Missing salary, unavailable match explanation, or a delayed source is displayed accurately. Counts, badges, status indicators, and promotional copy derive from real data.
- Optimize fonts/assets and avoid making decorative animation or external font availability a condition for using the site. Support reduced motion and maintain readable fallbacks.
- Browser automation and visual comparisons cover agreed desktop/mobile views; manual real-device review remains required for critical journeys. Design quality is a completion gate, not a final cosmetic phase.
- Apply the same quality bar to the independent Python extractor and Angular dashboard. Each has its own useful first screen, navigation, sample/demo journey, responsive states, and readable relevant-technology summary. A recruiter can complete that project's main task without entering the full Seekers app or navigating the entire stack.

## 7. Proposed reliability and scale targets

These are **planning targets to confirm in P03**, not current capabilities or benchmark results. There is no credible promise of zero errors; the requirements are controlled failure, visible recovery, strong regression prevention, and an agreed error budget.

### Initial service objectives

- Core browse/account service availability: at least **99.9% monthly**, with a defined measurement boundary, failure classification, provider dependency policy, and error-budget response. Define separate source freshness, parser, and notification objectives rather than hiding them behind HTTP uptime.
- Under the approved workload: jobs search **p95 ≤ 500 ms**, ordinary non-file API reads/writes **p95 ≤ 300 ms**, measured server-side at a stated boundary. Also measure p99 and end-user latency; provider/region conditions must be recorded.
- Candidate web Core Web Vitals: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile**, segmented by mobile/desktop and representative network/device. Use lab checks before launch and real-user data afterward. Source: [Web Vitals](https://web.dev/articles/vitals).
- For supported PDFs within declared size/page limits: provisional **p95 ≤ 30 s** from accepted upload to result at the agreed arrival rate; queue progress and actionable timeouts are required.
- For opted-in immediate alerts: provisional **p95 ≤ 5 minutes** from eligible indexed job to provider acceptance, with measured inbox/provider outcomes separately. Digests follow the candidate's chosen schedule/time zone.
- Provisional data recovery: primary account/catalog **RPO ≤ 15 minutes, RTO ≤ 60 minutes**, demonstrated by restoration. Search can rebuild from the catalog; broker and object recovery objectives must also be specified and tested. Tighter goals require an explicit design/cost decision.

### Capacity model

“Millions of users” must distinguish registered accounts, monthly/daily activity, open browser sessions, requests per second, and concurrent compute jobs. One million accounts does not imply one million simultaneous users. A same-sized user population can generate very different load.

P03 freezes the tiered capacity profile across three distinct checkpoints:

#### Tier 0 — Initial Regional Launch ($0 Free Tier Budget Ceiling)
- **Target Audience & Market:** South Asia / Bangladesh technology ecosystem (Dhaka/Chattogram tech hubs, regional remote).
- **Hosting & Infrastructure Spend:** **$0.00 / month ceiling** (local developer Docker Compose evaluation, GitHub Actions free runner minutes, free-tier managed services: Neon/Supabase PostgreSQL free tier, MongoDB Atlas M0 free tier, Firebase Auth free tier).
- **Candidate Population:** 10,000 registered accounts; 1,000 Daily Active Candidates (DAU).
- **Concurrent User Load:** 50–100 simultaneous active browser sessions.
- **Catalog Scale:** 50,000–100,000 active job postings.
- **Throughput Targets:**
  - Public Search Reads: Peak 20–50 requests/sec.
  - Ingestion Bursts: 10–25 jobs/sec.
  - Resume Parse Submissions: 1–3 submissions/sec max arrival (asynchronous queue with p95 ≤ 30s).
- **Storage Budgets:** PostgreSQL database < 500 MB; MongoDB catalog < 512 MB; Elasticsearch projection < 1 GB.

#### Tier 1 — Regional Expansion (100k Accounts)
- **Candidate Population:** 100,000 registered accounts; 10,000 DAU; 1,000 concurrent sessions.
- **Catalog Scale:** 500,000 active job postings.
- **Throughput Targets:** 200–500 read RPS; 50 job events/sec ingestion; 5 resume parses/sec.
- **Hosting Budget:** Budgeted cost tier ($50–$100/mo VPS or managed cluster).

#### Tier 2 — Scaled Production Milestone (1M Accounts)
- **Candidate Population:** 1,000,000 registered candidates; 100,000 DAU; 10,000 concurrent browsing sessions.
- **Catalog Scale:** 10,000,000 documents.
- **Throughput Targets:** 2,000 read requests/second peak; 100 candidate writes/sec; 500 job events/sec ingestion burst; 20 resume submissions/sec.
- **Hosting Budget:** Scaled cloud infrastructure tier ($500+/mo). Requires P15 qualification before public scale claims.

## 8. Tests that must exist before release

- **Domain/unit:** meaningful parsing/normalization/ranking/preferences behavior; not only tests of mocks or generated boilerplate.
- **API/contract:** schema validation, pagination boundaries, stable errors, backward compatibility, roles/ownership, event/protobuf compatibility, and provider callbacks.
- **Integration:** actual PostgreSQL/Mongo/search/broker interactions in isolated environments; migrations, unique indexes, object access, durable retries, search reconciliation, and deletion propagation.
- **Browser:** anonymous discovery/detail/apply; account lifecycle; profile/resume; saved jobs/searches/tracker; alert preferences/unsubscribe; reports; operator recovery. Include API failures, slow requests, expiry, reload, double submission, and concurrent sessions.
- **Security/accessibility:** negative authorization/upload/URL cases, dependency/image/secret scans, accessible dialogs/forms, keyboard and screen-reader tasks, and representative real-device checks.
- **Operational:** readiness, process termination, worker restart/replay, partial dependency failure, alerts, rollback, backup restore, capacity/soak/spike tests, and bounded queue recovery.
- **Standalone project qualification:** clean-checkout quickstart and per-project build/test/deploy; declared minimal dependencies; Python extraction and Angular demo journeys without the full platform; service adapter/fixture contract compatibility; demo/live data, auth, upload, and delivery isolation. Keep real integration tests in addition to these checks.

Every defect fix adds a regression when it guards meaningful behavior. Coverage percentages alone do not certify functionality. Flaky, skipped, or unavailable release-critical checks remain open gates.

## 9. Phase evidence and completion record

P01 source-baseline work has been committed; its inherited CI and any unverified security gates remain explicit. P02–P18 are **planned**. Keep detailed agent execution logs local; record concise change/test evidence in commit or PR descriptions and maintained documentation only where useful to contributors. At each checkpoint, record:

- Phase/subphase identifier and the exact capability checklist.
- Source branch, reviewed commit SHA, verified remote SHA, PR and required CI links.
- Test commands/environment/results and design/device evidence.
- Schema/config/data migrations and exercised recovery/rollback instructions.
- Open issues with severity, owner, impact, and assigned future phase.
- Capacity and cost evidence when applicable.
- Affected service/app identities, independently verified entry points, minimal dependency checks, focused README/demo evidence updates, and demo-versus-live limitations. Record a local-only path until a deployed link is verified.
- Completion decision and the next allowed phase.

The roadmap does not mark historical demo milestones as production-complete. A feature is complete only when its user journey, persistent state, authorization, error handling, design, operational recovery, and affected standalone/integrated service requirements meet the relevant gate. Portfolio demo readiness and production readiness are separately evidenced; a working UI fixture cannot certify a backend or platform release.

## 10. Immediate next step

The next implementation request should use the locally supplied Phase 2 prompt and the P02 scope above. Start with a clean Linux reproduction of the missing `@emnapi/core@1.11.3` and `@emnapi/runtime@1.11.3` lockfile entries, then complete P02's build, configuration, migration, CI, and readiness gates. Do not bypass an unresolved credential-revocation requirement. Keep prompts and execution logs out of GitHub; publish only useful source/configuration/test/documentation changes and stop at the requested phase boundary.

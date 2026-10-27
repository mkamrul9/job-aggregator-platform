# Seekers Production Roadmap — Phase Evidence Log

This log records the verified execution, evidence, security checks, and gate results for each phase of the Seekers production roadmap.

---

## Phase P01 — Secure Repository and Establish Independent Service Baseline

- **Date:** 27 October 2026
- **Feature Branch:** `codex/production-p01-service-baseline`
- **Base Commit:** `ca67811` on `main`
- **Status:** **COMPLETED** (Gate passed for P01 checkpoint)

### 1. Remediated Findings & Actions Taken

| Scope | Action Taken | Verification |
|---|---|---|
| **Git Remote Credentials** | Replaced embedded credential URL in `origin` with clean HTTPS URL: `https://github.com/mkamrul9/job-aggregator-platform.git`. Verified Git Credential Manager (`credential.helper=manager`). | `git remote -v` outputs clean URLs with no tokens. |
| **Tracked Environment Files** | Untracked `service-user/.env` from the Git index while keeping local file intact on disk. | Verified with `git ls-files service-user/.env` (untracked) and `Test-Path service-user/.env` (True). |
| **Committed Node Modules** | Untracked 30,048 files in `service-user/node_modules/` from Git index while preserving local modules on disk. Total tracked files reduced from 30,606 to clean source baseline. | `git ls-files` count reduced to 148 source files. Local directory preserved. |
| **Go Vendoring Policy** | Formalized module-based dependency retrieval using `go.mod` and `go.sum`. Untracked 407 files under `service-scraper/vendor/` from Git index. | `go test -mod=mod ./...` and `go vet ./...` executed cleanly in 0.8s. |
| **Python Build Caches** | Untracked `__pycache__` and `.pyc` files in `service-resume/`. | `git ls-files service-resume/__pycache__` returns empty. |
| **Ignore Rule Corrections** | 1. Removed `docs/` from root `.gitignore` to unhide 35 project architecture, planning, and engineering documents.<br/>2. Explicitly added `docs/token_cmd.txt` to `.gitignore` to keep local token command untracked.<br/>3. Added rules ignoring `.env` and `.env.*` across all subprojects while preserving `!.env.example`.<br/>4. Removed `/prisma/migrations` from `service-user/.gitignore` to allow future migration tracking in P02. | `git check-ignore` verified for local secrets, dependencies, and `.env.example` tracking. |
| **Configuration Templates** | Created documented `.env.example` files in repository root and all seven service subdirectories: `service-resume`, `frontend-admin`, `service-scraper`, `service-user`, `service-ingestion`, `service-notification`, `frontend-next`. | All eight `.env.example` files created and tracked. |
| **Service Catalog** | Created authoritative `SERVICE_CATALOG.md` documenting purpose, primary stack, data ownership, interfaces, manifests, verified/observed/planned commands, infrastructure, standalone gaps, planned demo approach, and owning phase for all seven services. | File tracked in root repository. |
| **Project READMEs** | Replaced boilerplate templates with focused, honest READMEs for all seven services: `service-resume/README.md`, `frontend-admin/README.md`, `service-scraper/README.md`, `service-user/README.md`, `service-ingestion/README.md`, `service-notification/README.md`, `frontend-next/README.md`. | All service READMEs linked in root `README.md` index table. |
| **Platform README Index** | Updated root `README.md` with an Independent Service Directory table linking directly to all seven service READMEs and the service catalog. | Verified in `README.md`. |
| **CI Trigger Configuration** | Updated `.github/workflows/ci-pipeline.yml` to trigger pushes on `codex/**` feature branches to verify CI prior to merging. | Workflow configuration updated. |
| **Contributor Guidelines** | Updated `CONTRIBUTING.md` to document the `codex/production-pNN-<short-name>` branch convention and secret hygiene. | Verified in `CONTRIBUTING.md`. |

### 2. Service Verification Summary

| Service Identifier | Service Name | Primary Stack | Verified Local Tests | Known Inherited Blockers (P02 Targets) |
|---|---|---|---|---|
| `service-resume` | Python Resume Extractor | Python 3.11+, FastAPI, spaCy, PyPDF2 | `pytest test_main.py` (2 passed) | PyPDF2 deprecation warning; local Python 3.14 vs container 3.11 parity. |
| `frontend-admin` | Angular Operations Dashboard | Angular 18, TypeScript, RxJS, Socket.io | `npm run build` (production build passed) | Angular 18 support alignment; live Socket.io connection relies on notification service. |
| `service-scraper` | Go Job Collection Engine | Go 1.23, Playwright-Go, Kafka-Go | `go test ./...` and `go vet ./...` (passed) | Scrapes hardcoded LinkedIn URLs; Kafka connection required on startup. |
| `service-user` | NestJS Identity & Profile API | NestJS 10, TypeScript, Prisma, PostgreSQL | `npm test` (1 unit test passed); `npx tsc --noEmit` (passed) | 59 ESLint errors and 3 warnings; unbaselined Prisma migration history. |
| `service-ingestion`| Node.js Ingestion & Search API | Node.js 20, Express, KafkaJS, MongoDB, ES | `node --check index.js` (syntax valid) | Placeholder `npm test` script; ES JS client 9.x vs ES 8.10.2 container mismatch. |
| `service-notification`| Node.js Notification Service | Node.js 20, Express, Socket.io, Nodemailer | `node --check index.js` (syntax valid) | Placeholder `npm test` script; mock Ethereal SMTP creds and single recipient. |
| `frontend-next` | React / Next.js Candidate App | Next.js 14, React 18, TypeScript | UI component structure verified | 6 ESLint errors; Turbopack CSS subprocess compilation error on production build. |

### 3. Open Security Gates & Repository Permissions

- **GitHub Remote Secret Scanning:** Active via GitHub platform tools for public repositories. Note: Enabling branch protection rules (e.g., requiring pull request reviews, passing status checks, and linear history on `main`) requires repository administration permissions on GitHub (`mkamrul9/job-aggregator-platform`). Contributor instructions have been documented in `CONTRIBUTING.md`.
- **Compromised Credentials:** No live secrets or tokens were committed to the Git commit history. The local `GITHUB_TOKEN` stored in `.secrets` was verified to be strictly local and is untracked by Git.

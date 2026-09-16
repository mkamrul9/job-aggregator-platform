# Contributing to Job Aggregator Platform

Thank you for your interest in contributing! This is a **polyglot microservices monorepo** spanning Go, Python, NestJS, Node.js, and Next.js. This guide covers everything you need to go from zero to your first merged PR.

---

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Ways to Contribute](#-ways-to-contribute)
- [Reporting Bugs & Requesting Features (Issues)](#-reporting-bugs--requesting-features-issues)
- [Local Development Setup](#-local-development-setup)
- [Branching Strategy](#-branching-strategy)
- [Commit Message Conventions](#-commit-message-conventions)
- [Coding Standards](#-coding-standards)
- [Testing Guidelines](#-testing-guidelines)
- [Pull Request Process](#-pull-request-process)
- [Project Maintainers](#-project-maintainers)

---

## 🤝 Code of Conduct

By participating in this project you agree to be respectful, constructive, and inclusive in all interactions — in issues, pull requests, code reviews, and discussions. Harassment of any kind is not tolerated.

---

## 💡 Ways to Contribute

You don't have to write code to contribute. Here are all the ways you can help:

| Contribution type | Description |
|---|---|
| 🐛 **Bug Report** | Found something broken? Open an issue using the Bug Report template |
| ✨ **Feature Request** | Have an idea? Open an issue using the Feature Request template |
| 📝 **Documentation** | Improve README, CONTRIBUTING, or inline code comments |
| 🧪 **Tests** | Add missing unit, integration, or E2E tests |
| 🔧 **Bug Fix** | Pick an open `bug` issue and submit a fix |
| 🚀 **New Feature** | Pick an open `enhancement` issue and implement it |
| 🎨 **UI/UX** | Improve the Next.js frontend or Angular admin dashboard |

---

## 🐛 Reporting Bugs & Requesting Features (Issues)

### For Anyone (Contributors & Admins)

Issues are the primary communication channel for work in this repository. Both **external contributors** and **project admins** use issues to track everything that needs to happen.

**To create an issue:**
1. Go to the [Issues tab](https://github.com/mkamrul9/job-aggregator-platform/issues)
2. Click **New Issue**
3. Select the appropriate template:
   - 🐛 **Bug Report** — for broken functionality
   - ✨ **Feature Request** — for new ideas or enhancements

> Issues are auto-labelled based on the template selected.

### Issue Labels

| Label | Meaning |
|---|---|
| `bug` | Something is not working correctly |
| `enhancement` | New feature or improvement |
| `documentation` | Improvements to docs only |
| `good first issue` | A good starting point for new contributors |
| `help wanted` | Extra attention or expertise needed |
| `in progress` | Actively being worked on |
| `needs triage` | Awaiting maintainer review/assignment |
| `wontfix` | Will not be addressed |
| `blocked` | Blocked by another issue or external factor |
| `service: scraper` | Relates to the Go scraper service |
| `service: ingestion` | Relates to the Node.js ingestion worker |
| `service: user` | Relates to the NestJS user service |
| `service: resume` | Relates to the Python FastAPI resume service |
| `service: notification` | Relates to the notification service |
| `service: frontend` | Relates to the Next.js frontend |
| `infra` | Relates to Docker, Nginx, Kafka, or CI/CD |

### Issue Assignment

- **Admins** may self-assign and create internal tracking issues at any time.
- **Contributors** should comment on an unassigned issue to express interest. A maintainer will assign it to you to avoid duplicate work.
- If an assigned issue has had no activity for **14 days**, it will be unassigned and reopened for others.

---

## 💻 Local Development Setup

You do **not** need Go, Node.js, Python, or PostgreSQL installed. The full stack runs in Docker.

### Prerequisites

| Tool | Minimum Version | Download |
|---|---|---|
| Docker Desktop | 24.x | [docker.com/get-started](https://www.docker.com/get-started/) |
| Git | Any recent | [git-scm.com](https://git-scm.com/) |

### Step 1 — Fork and Clone

```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/<your-username>/job-aggregator-platform.git
cd job-aggregator-platform

# Add the upstream remote so you can sync with the main repo
git remote add upstream https://github.com/mkamrul9/job-aggregator-platform.git
```

### Step 2 — Start the Cluster

```bash
docker compose up -d --build
```

The first build takes ~3–5 minutes. Subsequent builds are much faster due to Docker layer caching.

### Step 3 — Apply Database Migrations

```bash
docker compose exec user-service npx prisma migrate deploy
```

### Step 4 — Verify

```bash
docker compose ps
# All containers should show status "running"

# Open the web UI:
# http://localhost
```

### Rebuilding a Single Service

When you modify a single service, you only need to rebuild that one container:

```bash
# Example: rebuild only the ingestion service after editing service-ingestion/index.js
docker compose up -d --build ingestion-service
```

### Viewing Live Logs

```bash
# Stream logs for any service:
docker compose logs -f scraper-service
docker compose logs -f user-service
docker compose logs -f frontend-next
```

---

## 🌿 Branching Strategy

We use a **feature-branch workflow**. **Never commit directly to `main`.**

### Branch Naming Conventions

All branches must follow this format: `<type>/<short-description>`

| Type | When to use | Example |
|---|---|---|
| `feat/` | New feature | `feat/elasticsearch-indexer` |
| `fix/` | Bug fix | `fix/kafka-retry-on-startup` |
| `refactor/` | Code improvement, no behaviour change | `refactor/scraper-goroutine-pool` |
| `docs/` | Documentation changes only | `docs/update-api-reference` |
| `test/` | Adding or updating tests | `test/resume-service-unit-tests` |
| `chore/` | Build, CI, dependency updates | `chore/bump-prisma-to-5` |
| `hotfix/` | Critical fix to be merged urgently | `hotfix/nginx-502-on-resume-route` |

### Workflow

```bash
# 1. Sync your local main with upstream
git checkout main
git fetch upstream
git merge upstream/main

# 2. Create your feature branch
git checkout -b feat/my-new-feature

# 3. Make your changes, commit frequently
git add .
git commit -m "feat(ingestion): add full-text search filter to /api/jobs"

# 4. Push to your fork
git push origin feat/my-new-feature

# 5. Open a Pull Request on GitHub targeting the upstream `main` branch
```

---

## 📝 Commit Message Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/) strictly. Commits that don't conform will be flagged in code review.

### Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer: Closes #<issue-number>]
```

### Types

| Type | Usage |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that is not a fix or feature |
| `chore` | Build system, CI, dependency changes |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `style` | Formatting, no logic changes |
| `perf` | Performance improvement |

### Scopes (use the service or area being changed)

`scraper` · `ingestion` · `user` · `resume` · `notification` · `frontend` · `nginx` · `kafka` · `docker` · `ci` · `deps` · `docs`

### Examples

```bash
feat(scraper): add salary extraction from job description HTML
fix(ingestion): handle undefined company field in kafka payload
refactor(user): extract firebase token validation into shared guard
docs(readme): add elasticsearch setup instructions
test(resume): add pytest for spacy phrase matcher edge cases
chore(ci): add docker build cache to github actions workflow
```

### Linking Issues

Always close related issues in your commit or PR:
```
fix(notification): resolve kafka consumer crash on empty payload

Closes #42
```

---

## 🛠 Coding Standards

This is a polyglot monorepo. Follow the conventions of the language you're working in.

### Go — `service-scraper/`

- Run `go fmt ./...` before every commit
- All exported types must have a GoDoc comment
- All public structs used for Kafka/JSON must have explicit `json:"snake_case"` tags
- Goroutine synchronisation must use `sync.WaitGroup` or channels — no raw sleeps
- Handle all errors explicitly; do not use `_` to discard errors from important operations
- Kafka broker address must always come from the `KAFKA_BROKER` environment variable — no hardcoding

### TypeScript / NestJS — `service-user/`

- Strict TypeScript — no `any`, no `@ts-ignore`
- Run `npm run lint` (ESLint) and `npm run format` (Prettier) before committing
- Follow NestJS modular architecture: Controllers handle HTTP, Services handle business logic
- All incoming request data must be validated via `class-validator` DTOs
- Use `HttpException` with explicit status codes instead of generic `Error` throws

### Python / FastAPI — `service-resume/`

- Follow PEP 8 — use `black` for auto-formatting (`pip install black && black .`)
- Add type hints to all function signatures
- All FastAPI endpoints must have a `response_model` defined
- Any changes to returned data fields must also update the corresponding gRPC Protobuf definition in `shared-protos/`

### Node.js — `service-ingestion/`, `service-notification/`

- Use `async/await` — avoid raw `.then()` chains
- Always validate and safely access Kafka message properties before use
- Log all Kafka consumer errors; never swallow exceptions silently
- Kafka broker address must always come from the `KAFKA_BROKER` environment variable

### Next.js / React — `frontend-next/`

- Keep components focused — one responsibility per component
- All API calls must use relative paths (e.g., `/api/jobs`) so they route through Nginx correctly
- Handle loading and error states in every component that fetches data
- Do not import Firebase directly in components — use the shared `lib/firebase.ts` initialisation

---

## 🧪 Testing Guidelines

**Every PR that fixes a bug or adds a feature must include tests.**

For bug fixes: write a test that **fails before** your patch and **passes after**.

### Go

```bash
cd service-scraper
go test ./... -v
```

Tests are in `scraper_test.go`. Use the `EventPublisher` interface for mocking the Kafka publisher.

### NestJS

```bash
cd service-user
npm test           # Unit tests (Jest)
npm run test:e2e   # End-to-end API tests
```

### Python

```bash
cd service-resume
pip install pytest httpx
pytest -v
```

### Node.js (Ingestion / Notification)

```bash
cd service-ingestion
npm test
```

### Coverage Targets

| Layer | Tools | Target |
|---|---|---|
| Unit | Jest, `go test`, pytest | 70%+ |
| Integration | Testcontainers or Docker Compose test profile | All critical data paths |
| E2E | Playwright / Cypress | Critical user journeys (resume upload, job search) |

---

## 🚀 Pull Request Process

### Before Opening a PR

- [ ] Your branch is up-to-date with `upstream/main`
- [ ] All existing tests pass (`go test ./...`, `npm test`, `pytest`)
- [ ] You have added tests for your changes
- [ ] Commit messages follow Conventional Commits format
- [ ] Code is formatted (`go fmt`, `npm run format`, `black`)
- [ ] You have self-reviewed your diff on GitHub

### Opening the PR

1. Push your branch to your fork
2. Go to the upstream repository and click **"Compare & pull request"**
3. Select `main` as the base branch
4. Fill out the **Pull Request Template** fully — describe what changed and how you tested it
5. Link the issue your PR resolves: `Closes #<issue-number>`
6. Request a review from a maintainer (see below)

### Review and Merge

- At least **1 approving review** is required from a maintainer before merging
- Address all requested changes with new commits (do not force-push during review)
- Once approved, a maintainer will **squash-merge** your PR into `main`
- Your branch will be deleted after merge

### PR Size Guidelines

Keep PRs small and focused. A PR that touches one service and solves one problem is always preferred over a large PR spanning multiple services.

| PR Size | Description |
|---|---|
| ✅ **Ideal** | < 400 lines changed, one logical change |
| ⚠️ **Acceptable** | 400–800 lines, clearly scoped |
| ❌ **Too large** | > 800 lines — break it up into smaller PRs |

---

## 👥 Project Maintainers

| Maintainer | GitHub | Role |
|---|---|---|
| Kamrul | [@mkamrul9](https://github.com/mkamrul9) | Project Lead & Admin |

Maintainers have the authority to:
- Triage and label all issues
- Create internal tracking issues without a template
- Assign issues to contributors
- Approve and merge PRs
- Create and manage releases

---

*Thank you for contributing to the Job Aggregator Platform! Every contribution, big or small, makes this project better. 🚀*

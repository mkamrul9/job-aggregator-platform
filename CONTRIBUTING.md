# Contributing to Job Aggregator Platform

First off, thank you for considering contributing to the Job Aggregator Platform! It's people like you that make this platform a great tool for everyone.

This document provides a set of guidelines and instructions for contributing to this polyglot microservices monorepo. Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open-source project.

---

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [System Architecture & Monorepo Structure](#-system-architecture--monorepo-structure)
- [Local Development Setup](#-local-development-setup)
- [Branching Strategy & Workflow](#-branching-strategy--workflow)
- [Commit Message Conventions](#-commit-message-conventions)
- [Coding Standards & Languages](#-coding-standards--languages)
- [Testing Guidelines](#-testing-guidelines)
- [Pull Request Process](#-pull-request-process)

---

## 🤝 Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please be respectful, constructive, and inclusive in all interactions—whether in issues, pull requests, or code reviews.

---

## 🏗 System Architecture & Monorepo Structure

We operate a **polyglot microservices** architecture. Before diving into code, please familiarize yourself with the structure so you know where your changes belong.

- **`service-scraper/` (Go)**: High-performance concurrent headless browser scraping (Playwright).
- **`service-resume/` (Python/FastAPI)**: AI/NLP engine using spaCy to parse PDFs and extract technical skills.
- **`service-user/` (NestJS/TypeScript)**: User profiles, authentication (JWT), and PostgreSQL interface via Prisma.
- **`service-ingestion/` (Node.js)**: Kafka consumer that upserts incoming job events into MongoDB.
- **`service-notification/` (Node.js/Express)**: Kafka consumer that matches user skills and sends email alerts.
- **`nginx/`**: API Gateway managing external traffic routing.
- **`shared-protos/`**: Protobuf definitions (`.proto` files) used for internal gRPC communication (e.g., between User Service and Resume Service).

*Tip: If you are adding cross-service communication, we prefer **Kafka** for asynchronous data flow and **gRPC** for synchronous, high-performance point-to-point calls.*

---

## 💻 Local Development Setup

You do **not** need to install Go, Node.js, Python, or PostgreSQL locally. The entire stack is containerized.

### Prerequisites
1. [Docker Desktop](https://www.docker.com/get-started/) (v24.x+)
2. Git

### Bootstrapping the Environment
1. Clone the repository:
   ```bash
   git clone https://github.com/mkamrul9/job-aggregator-platform.git
   cd job-aggregator-platform
   ```
2. Run the deployment script to build images and start the cluster:
   ```bash
   ./deploy-local.sh
   ```
3. Verify services are running:
   ```bash
   docker compose ps
   ```

To restart a single service while working on it (e.g., the user service):
```bash
docker compose up -d --build user-service
```

---

## 🌿 Branching Strategy & Workflow

We follow a standard feature-branch workflow. Please do not commit directly to `main`.

1. **Sync your local `main`** branch with the upstream repository.
2. **Create a new branch** for your work. Use the following naming conventions:
   - `feat/your-feature-name` (for new features)
   - `fix/issue-description` (for bug fixes)
   - `refactor/component-name` (for code refactoring)
   - `docs/what-you-changed` (for documentation)
3. Keep your pull requests small and focused on a single logical change.

---

## 📝 Commit Message Conventions

We strictly follow [Conventional Commits](https://www.conventionalcommits.org/). This helps us automatically generate changelogs and version numbers.

**Format:**
```
<type>(<scope>): <short description>
```

**Types:**
- `feat`: A new feature (e.g., `feat(scraper): add support for parsing salaries`)
- `fix`: A bug fix (e.g., `fix(ingestion): resolve undefined URL parsing in kafka payload`)
- `refactor`: Code change that neither adds a feature nor fixes a bug
- `chore`: Build system, dependency updates (e.g., `chore(deps): bump prisma to 5.0`)
- `docs`: Documentation only changes
- `test`: Adding or updating tests

*Note: PRs with non-compliant commit messages will be blocked from merging.*

---

## 🛠 Coding Standards & Languages

Because this is a polyglot monorepo, you must adhere to the standard conventions of the language you are working in:

### Go (`service-scraper`)
- Run `go fmt ./...` before committing.
- Ensure all public structs intended for JSON/Kafka have explicit `json:"snake_case"` tags.
- Handle goroutine synchronization cleanly (use `sync.WaitGroup` and channels).

### TypeScript / NestJS (`service-user`)
- Strictly type your interfaces and variables. Avoid `any`.
- Run `npm run lint` and `npm run format` (Prettier) before committing.
- Follow NestJS modular architecture (Controllers, Services, Modules, DTOs).

### Python / FastAPI (`service-resume`)
- Follow PEP 8 style guidelines.
- Add type hints to function arguments and return types.
- Ensure any model changes align with the gRPC Protobuf definitions.

### Node.js (`service-ingestion`, `service-notification`)
- Use async/await over promises `.then()`.
- Ensure strict JSON parsing and property access, keeping case-sensitivity in mind.

---

## 🧪 Testing Guidelines

Code without tests is legacy code. We expect test coverage for all new features and bug fixes.

1. **Go:** Run `go test ./...` in the `service-scraper/` directory.
2. **NestJS:** Add unit tests using Jest (`npm test`). For new API endpoints, add E2E tests (`npm run test:e2e`).
3. **Python:** Use `pytest` for all NLP and FastAPI route testing.

If you are fixing a bug, please write a test that *fails* before your patch, and *passes* after your patch.

---

## 🚀 Pull Request Process

1. Ensure your code follows the coding standards and passes all tests.
2. Push your branch to GitHub and open a Pull Request against the `main` branch.
3. Fill out the **Pull Request Template** provided in GitHub, describing exactly what your PR does and how you tested it.
4. Request a review from at least one core maintainer.
5. Address any requested changes. Once approved, a maintainer will squash and merge your PR.

Thank you for contributing! 🚀

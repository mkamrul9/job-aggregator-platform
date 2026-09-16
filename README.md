<div align="center">

<h1>⚡ Job Aggregator Platform</h1>

<p><strong>A production-grade, polyglot microservices platform that scrapes job listings, parses resumes with AI/NLP, matches candidates to roles, and delivers real-time alerts — all powered by an event-driven Kafka backbone.</strong></p>

<br/>

[![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-KRaft-231F20?style=for-the-badge&logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Latest-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Nginx](https://img.shields.io/badge/Nginx-Gateway-009639?style=for-the-badge&logo=nginx&logoColor=white)](https://nginx.org/)

<br/>

</div>

---

## 📋 Table of Contents

- [What This Project Does](#-what-this-project-does)
- [Architecture Overview](#️-architecture-overview)
- [Microservices At a Glance](#-microservices-at-a-glance)
- [End-to-End Data Flow](#-end-to-end-data-flow)
- [Database Architecture](#️-database-architecture)
- [Getting Started](#-getting-started)
- [Accessing the Platform](#-accessing-the-platform)
- [Monorepo Structure](#-monorepo-structure)
- [Environment Variables](#️-environment-variables)
- [API Reference](#-api-reference)
- [Internal Communication (gRPC)](#-internal-communication-grpc)
- [Kafka Topics & Event Contracts](#-kafka-topics--event-contracts)
- [Testing](#-testing)
- [Roadmap](#️-roadmap)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)

---

## 🌟 What This Project Does

This platform is an intelligent, self-hosted career companion that aggregates job listings from across the web, matches them to candidate profiles using AI, and delivers real-time alerts.

| Problem | Our Solution |
|---|---|
| Job listings are scattered across hundreds of websites | **Go Scraper** concurrently harvests listings using headless browser automation |
| Manual job searching is slow and repetitive | **Kafka event bus** fans scraped data out to all consumers simultaneously |
| Candidates don't know which jobs match their skills | **FastAPI + spaCy NLP** extracts technical skills directly from PDF resumes |
| Users miss relevant new postings | **Notification Service** pushes personalised email alerts the moment a match is found |
| One slow service should not crash everything else | **Apache Kafka** fully decouples every service — each publishes or consumes events independently |

---

## 🗺️ Architecture Overview

This platform follows a **polyglot microservices** pattern — each service is written in the language best suited to its job:

```
┌─────────────────────────────────────────────────────┐
│                  CLIENT BROWSER                     │
│               http://localhost (port 80)            │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────────┐
│              NGINX  API GATEWAY  (port 80)          │
│   /            →  frontend-next:3000  (Next.js)     │
│   /api/users/  →  user-service:3000   (NestJS)      │
│   /api/resume/ →  resume-api:8000     (FastAPI)     │
│   /api/jobs/   →  ingestion-service:5000 (Node.js)  │
│   /api/notifications/ → notification-service:4000   │
└──┬──────┬──────────┬──────────┬──────────┬──────────┘
   │      │          │          │          │
   ▼      ▼          ▼          ▼          ▼
 ┌────┐ ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────────┐
 │Next│ │ User │  │Resume│  │Inges-│  │Notification  │
 │ JS │ │Serv. │  │ API  │  │tion  │  │   Service    │
 │    │ │NestJS│  │FastAP│  │Node.j│  │   Express    │
 └────┘ └──┬───┘  └──────┘  └──┬───┘  └──────┬───────┘
           │ gRPC               │               │
           └──→ resume-grpc     │ Kafka         │ Kafka
                :50051          │ Producer      │ Consumer
                                ▼               │
                      ┌──────────────────┐      │
                      │  Apache  Kafka   │◄─────┘
                      │  (KRaft mode)    │
                      │   jobs.new       │
                      └────────┬─────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
          ┌────────────┐             ┌──────────────┐
          │ Ingestion  │             │ Notification │
          │  Worker    │             │   Consumer   │
          │  Node.js   │             │   Node.js    │
          └──────┬─────┘             └──────────────┘
                 │
                 ▼
           ┌──────────┐
           │ MongoDB  │
           │ job_     │
           │ platform │
           └──────────┘
```

> **Key principle:** No service directly calls another to store data. All writes go through Kafka events, making the system resilient to individual service restarts.

---

## 🧩 Microservices At a Glance

### 🕷️ Scraper Service — `service-scraper/` (Go)
High-performance data harvester. Uses Playwright-Go for headless Chromium automation. Launches one **Goroutine per URL** for true parallelism.

- Concurrent Goroutines for each target job URL
- Renders JavaScript-heavy pages via headless Chromium
- Extracts title, company, URL, and description
- Publishes a `JobFound` event to the `jobs.new` Kafka topic
- **Does NOT write to any database** — fully decoupled from persistence

---

### 📥 Ingestion Worker — `service-ingestion/` (Node.js)
Silent background process. Listens to Kafka and persists data to MongoDB.

- Subscribes to `jobs.new` topic (consumer group: `mongo-ingestion-group`)
- Performs **upsert** into MongoDB (deduplicates by URL)
- Exposes `GET /api/jobs` with **pagination** (`?page=`, `?limit=`) and **text search** (`?q=`)
- Horizontally scalable — Kafka auto-redistributes load across replicas

---

### 👤 User Service — `service-user/` (NestJS + TypeScript)
Authentication and profile management backbone.

- Firebase Auth integration; token verification via Firebase Admin SDK
- User profiles with skill arrays (populated from resume parsing)
- Connects to **PostgreSQL** via **Prisma ORM**
- Calls Resume Service via **gRPC** to extract skills on upload
- File uploads handled by **Multer** with PDF-only enforcement

---

### 📄 Resume API — `service-resume/` (Python + FastAPI)
AI/NLP engine that extracts intelligence from PDF resumes.

- Accepts PDF uploads via `POST /parse`
- Extracts raw text with **PyPDF2**
- Runs text through a **spaCy PhraseMatcher** pipeline (15+ recognised tech skills)
- Also exposes a **gRPC server** (port `50051`) for synchronous inter-service calls
- Returns structured JSON: `{ filename, status, extracted_skills[] }`

---

### 🔔 Notification Service — `service-notification/` (Node.js + Express)
Proactive alerting engine for matched job events.

- Subscribes to `jobs.new` Kafka topic (consumer group: `email-notification-group`)
- Matches incoming jobs against stored user skill preferences
- Sends personalised email alerts via **Nodemailer** (Ethereal SMTP in dev)
- Exposes `/health` endpoint via Express for container health-checks

---

### 🖥️ Frontend — `frontend-next/` (Next.js + React)
Candidate-facing web portal. Served through Nginx at `http://localhost`.

- Live **Job Feed** auto-loaded from the Ingestion Service API
- **Search bar** with real-time keyword filtering (`?q=`)
- **AI Resume Parser** — upload a PDF and instantly see your extracted skills
- Firebase Auth integration for user login and profile management

---

## 🔄 End-to-End Data Flow

How a single job listing travels through the entire system:

```
1. 🕷️  Go Scraper opens a headless Chrome browser
        ↓ (concurrent goroutines)
2. 📄  Extracts: title, company, URL, description
        ↓
3. 📤  Publishes JSON event to Kafka topic: jobs.new
        ↓ (Kafka fans out to all consumers)
       ┌────────────────────┬────────────────────┐
       ↓                    ↓                    ↓
4a. 📥 Ingestion         4b. 🔔 Notification    4c. 🖥️ Frontend
    Worker upserts          Service emails           Job Feed shows
    to MongoDB              matched users            new listings
```

Steps 4a, 4b, and 4c happen **simultaneously and independently**. No service blocks any other.

---

## 🗄️ Database Architecture

The platform uses **polyglot persistence** — the right database for the right job:

| Database | Service | Exposed Port | Purpose |
|---|---|---|---|
| **PostgreSQL 15** | User Service | `5433` (host) | ACID-compliant user data: profiles, auth, skill arrays |
| **MongoDB** | Ingestion Worker | `27017` (host) | Flexible document storage for semi-structured job listings |
| **Elasticsearch 8.10** | Future Search API | `9200` (host) | Full-text inverted index for lightning-fast job search |

### PostgreSQL Schema (Prisma)
```prisma
model User {
  id                 String    @id
  email              String    @unique
  role               Role      @default(USER)
  subscriptionStatus SubStatus @default(FREE)
  profile            Profile?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

model Profile {
  id              String   @id @default(uuid())
  userId          String   @unique
  firstName       String
  lastName        String
  resumeUrl       String?
  extractedSkills String[]  // Populated by the AI Resume Service
}
```

### MongoDB Job Document
```json
{
  "_id": "ObjectId('...')",
  "title": "Senior Go Engineer",
  "company": "TechCorp Inc.",
  "url": "https://linkedin.com/jobs/view/12345",
  "raw_description": "We are looking for a Go developer...",
  "scraped_at": "2026-09-16T10:00:00Z"
}
```

---

## 🚀 Getting Started

### Prerequisites

You only need **two tools** installed. Everything else runs inside Docker.

| Tool | Minimum Version | Download |
|---|---|---|
| Docker Desktop | 24.x | [docker.com/get-started](https://www.docker.com/get-started/) |
| Git | Any recent | [git-scm.com](https://git-scm.com/) |

> ✅ You do **NOT** need Go, Node.js, Python, or Java installed locally.

### 1. Clone the Repository

```bash
git clone https://github.com/mkamrul9/job-aggregator-platform.git
cd job-aggregator-platform
```

### 2. Start the Entire Platform

```bash
docker compose up -d --build
```

This will build all images and start the full cluster in detached mode. The first build takes ~3-5 minutes as it pulls base images and compiles all services.

### 3. Run Database Migrations

After the cluster is up, apply the Prisma schema to PostgreSQL:

```bash
docker compose exec user-service npx prisma migrate deploy
```

### 4. Verify Everything is Running

```bash
docker compose ps
```

All services should show status `running`:

| Container | Port | Role |
|---|---|---|
| `api-gateway` | `80` | Nginx reverse proxy |
| `frontend-next` | *(internal)* | Next.js web UI |
| `user-service` | *(internal)* | NestJS auth & profiles |
| `resume-api` | *(internal)* | FastAPI NLP parser |
| `resume-grpc` | *(internal)* | gRPC resume server |
| `ingestion-service` | *(internal)* | Kafka → MongoDB worker |
| `scraper-service` | *(internal)* | Go headless scraper |
| `notification-service` | *(internal)* | Kafka → Email alerter |
| `kafka` | `9092` | Event bus |
| `job-mongo` | `27017` | Job listings DB |
| `user-postgres` | `5433` | User profiles DB |
| `elasticsearch` | `9200` | Search index |

---

## 🌐 Accessing the Platform

Once all containers are running, open your browser:

| Interface | URL | Description |
|---|---|---|
| **Web App** | [http://localhost](http://localhost) | Main candidate portal (job feed + resume parser) |
| **Resume API Docs** | [http://localhost/api/resume/docs](http://localhost/api/resume/docs) | Interactive FastAPI Swagger UI |
| **Job Feed API** | [http://localhost/api/jobs](http://localhost/api/jobs) | Raw JSON job listing endpoint |
| **Notification Health** | [http://localhost/api/notifications/health](http://localhost/api/notifications/health) | Service health check |
| **Grafana Metrics** | [http://localhost:3001](http://localhost:3001) | Prometheus + Grafana dashboards |
| **Elasticsearch** | [http://localhost:9200](http://localhost:9200) | ES cluster status |

---

## 📁 Monorepo Structure

```
job-aggregator-platform/
│
├── 📄 docker-compose.yml          # Orchestrates the entire cluster
├── 📄 deploy-local.sh             # One-command local deployment script
├── 📄 .gitignore
│
├── 🕷️  service-scraper/            # Go — Concurrent web scraper → Kafka producer
│   ├── main.go                    # Entry point: Goroutine pool + Playwright
│   ├── kafka.go                   # Kafka writer initialisation & publish logic
│   ├── models.go                  # DBJob struct (JSON serialisable)
│   ├── scraper_test.go            # Unit tests
│   └── Dockerfile
│
├── 📥 service-ingestion/           # Node.js — Kafka consumer → MongoDB writer + REST API
│   ├── index.js                   # Consumer loop, upsert logic, paginated /api/jobs endpoint
│   └── Dockerfile
│
├── 👤 service-user/                # NestJS/TypeScript — Auth + User Profiles
│   ├── src/
│   │   ├── auth/                  # Firebase guards, decorators
│   │   └── user/                  # Controllers, services, DTOs
│   ├── prisma/
│   │   └── schema.prisma          # PostgreSQL schema definition
│   └── Dockerfile
│
├── 📄 service-resume/              # Python/FastAPI — REST resume parser + gRPC server
│   ├── main.py                    # FastAPI REST endpoint (POST /parse)
│   ├── grpc_server.py             # gRPC server implementation
│   ├── resume_pb2.py              # Auto-generated Protobuf stubs
│   ├── requirements.txt
│   └── Dockerfile
│
├── 🔔 service-notification/        # Node.js/Express — Kafka consumer → Email alerts
│   ├── index.js                   # Consumer + Nodemailer SMTP logic
│   └── Dockerfile
│
├── 🌐 nginx/
│   └── nginx.conf                 # API Gateway routing rules
│
├── 🔗 shared-protos/               # Protobuf definitions (shared across services)
│   └── resume.proto
│
├── 🖥️  frontend-next/              # Next.js 15 — Candidate-facing web app
│   ├── app/                       # Next.js App Router pages
│   ├── components/
│   │   ├── JobSearch.tsx          # Job feed + search bar
│   │   └── ResumeUpload.tsx       # PDF upload + skill display
│   ├── lib/
│   │   └── firebase.ts            # Firebase Auth initialisation
│   └── Dockerfile
│
├── 🖥️  frontend-admin/             # Angular — Internal admin dashboard (planned)
│
├── .github/
│   ├── workflows/                 # GitHub Actions CI/CD pipelines
│   ├── ISSUE_TEMPLATE/            # Bug report & feature request templates
│   └── PULL_REQUEST_TEMPLATE.md   # PR description template
│
└── docs/                          # Additional architecture documentation
```

---

## ⚙️ Environment Variables

All environment variables are pre-configured in `docker-compose.yml` for local development. **Never commit real secrets to Git.**

### Scraper Service
| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | `kafka:9092` | Internal Kafka broker address |

### Ingestion Service
| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | `kafka:9092` | Internal Kafka broker address |
| `MONGO_URI` | `mongodb://job-mongo:27017` | MongoDB connection string |

### User Service
| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://admin:password@user-postgres:5432/db` | Prisma PostgreSQL connection |
| `RESUME_GRPC_URL` | `resume-grpc:50051` | Internal gRPC address for resume service |
| `FIREBASE_PROJECT_ID` | `your-project-id` | Firebase project for token verification |

### Frontend (Next.js)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |

> ⚠️ **Production:** Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, or Doppler) and inject secrets at runtime. Never hardcode credentials.

---

## 🌐 API Reference

All external traffic routes through **Nginx on port 80**.

### Job Listings — `GET /api/jobs`

Fetch paginated job listings with optional keyword search.

```
GET /api/jobs?page=1&limit=20&q=React
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Results per page |
| `q` | string | *(none)* | Keyword filter (title or company) |

**Response:**
```json
{
  "jobs": [{ "title": "...", "company": "...", "url": "...", "scraped_at": "..." }],
  "total": 145,
  "page": 1,
  "limit": 20
}
```

### Resume Parser — `POST /api/resume/parse`

Upload a PDF resume and extract technical skills.

```bash
curl.exe -X POST http://localhost/api/resume/parse -F "file=@resume.pdf"
```

**Response:**
```json
{
  "filename": "resume.pdf",
  "status": "success",
  "extracted_skills": ["Go", "Docker", "Kafka", "NestJS", "PostgreSQL"]
}
```

### Notification Health — `GET /api/notifications/health`

```bash
curl http://localhost/api/notifications/health
```
```json
{ "status": "Notification Service is running." }
```

### User Service — `POST /api/users/sync`

Sync a Firebase-authenticated user to the PostgreSQL database. Requires a valid Firebase Bearer token.

```bash
curl -X POST http://localhost/api/users/sync \
  -H "Authorization: Bearer <firebase_id_token>"
```

### User Resume Upload — `POST /api/users/upload-resume`

Upload and parse a resume for a logged-in user (stores extracted skills to their profile).

```bash
curl.exe -X POST http://localhost/api/users/upload-resume \
  -H "Authorization: Bearer <firebase_id_token>" \
  -F "resume=@resume.pdf"
```

---

## 🔀 Internal Communication (gRPC)

The **User Service** and **Resume gRPC Service** communicate over gRPC for low-latency, type-safe inter-service calls.

**Protobuf Contract** (`shared-protos/resume.proto`):
```protobuf
syntax = "proto3";
package resume;

service ResumeParser {
  rpc ParseResume (ParseRequest) returns (ParseResponse);
}

message ParseRequest {
  string file_path = 1;
}

message ParseResponse {
  repeated string skills = 1;
  float confidence_score = 2;
  string extracted_text = 3;
}
```

**Flow:**
```
Browser uploads PDF
  → Nginx (port 80)
    → User Service (NestJS)
      → gRPC call → Resume gRPC Service (port 50051)
          ← returns extracted skills []
      ← saves skills to PostgreSQL via Prisma
    ← returns updated profile JSON
  ← 200 OK
```

---

## 📡 Kafka Topics & Event Contracts

Apache Kafka runs in **KRaft mode** — no ZooKeeper required.

### Topic: `jobs.new`

**Producer:** `service-scraper` (Go)

**Consumers:**
- `service-ingestion` (group: `mongo-ingestion-group`)
- `service-notification` (group: `email-notification-group`)

**Message Schema:**
```json
{
  "title": "Senior Go Developer",
  "company": "Acme Corp",
  "url": "https://linkedin.com/jobs/view/12345",
  "raw_description": "We are looking for a Go developer with Kafka experience...",
  "scraped_at": "2026-09-16T04:00:00Z"
}
```

**Message Key:** The job URL is used as the Kafka partition key, guaranteeing ordered processing of updates for the same listing.

---

## 🧪 Testing

### Running Tests

**Go Scraper:**
```bash
cd service-scraper
go test ./...
```

**NestJS User Service:**
```bash
cd service-user
npm test            # Unit tests (Jest)
npm run test:e2e    # End-to-end tests
```

**FastAPI Resume Service:**
```bash
cd service-resume
pip install pytest httpx
pytest
```

### Testing Strategy

| Layer | Tools | Coverage Target |
|---|---|---|
| **Unit** | Jest (TS), `go test` (Go), pytest (Python) | 70%+ |
| **Integration** | Testcontainers (isolated DB per test run) | All critical data paths |
| **E2E** | Playwright / Cypress | Critical user journeys |

---

## 🗺️ Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Monorepo setup, Docker Compose foundation | ✅ Complete |
| **Phase 2** | Nginx API Gateway, path-based routing | ✅ Complete |
| **Phase 3–4** | NestJS User Service, Prisma ORM, PostgreSQL schema | ✅ Complete |
| **Phase 5** | Go scraper with Playwright, concurrent Goroutines | ✅ Complete |
| **Phase 6** | MongoDB integration, Scraper → DB pipeline | ✅ Complete |
| **Phase 7–12** | FastAPI Resume Service, spaCy NLP, gRPC | ✅ Complete |
| **Phase 13** | Apache Kafka (KRaft mode) infrastructure | ✅ Complete |
| **Phase 14** | Scraper decoupled — publishes to Kafka | ✅ Complete |
| **Phase 15** | Node.js Ingestion Worker — Kafka → MongoDB | ✅ Complete |
| **Phase 16** | Elasticsearch provisioning | ✅ Complete |
| **Phase 17** | Notification Service — Kafka → Email alerts | ✅ Complete |
| **Phase 18** | Bug fixes: pagination, gRPC errors, Kafka retry | ✅ Complete |
| **Phase 19** | Next.js frontend — Candidate job portal | ✅ Complete |
| **Phase 20** | GitHub Actions CI/CD pipeline | ✅ Complete |
| **Phase 21** | Elasticsearch Indexer Worker (Kafka → ES) | 🔜 Planned |
| **Phase 22** | Angular Admin Dashboard — Platform analytics | 🔜 Planned |
| **Phase 23** | Production deployment (ECS / Railway / Render) | 🔜 Planned |

---

## 🤝 Contributing

We welcome contributions of all kinds — bug fixes, features, documentation, and tests.

Please read **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full guide on:
- Setting up your local development environment
- Our branching strategy and naming conventions
- Commit message format (Conventional Commits)
- How to open issues and pull requests
- Coding standards for each language in the monorepo

---

## 🔒 Security

| Area | Implementation |
|---|---|
| **Authentication** | Firebase Auth; ID tokens verified server-side via Firebase Admin SDK |
| **API Access** | NestJS `FirebaseAuthGuard` protects all authenticated routes |
| **Secrets** | Never committed to Git; injected via Docker environment variables |
| **Data in transit** | Nginx terminates external TLS; internal services on isolated `microservices-net` bridge |
| **Input validation** | NestJS DTOs validated via `class-validator`; FastAPI uses Pydantic; PDF-only enforced on upload |
| **Kafka** | Internal-only broker; never exposed to the public internet |
| **Elasticsearch** | Security disabled for dev; X-Pack **must** be enabled in production |
| **Least privilege** | Each service only has access to its own database |

> 🚨 **Before deploying to production:** Enable `xpack.security.enabled=true` on Elasticsearch, rotate all default passwords, enable MongoDB authentication, and configure a secrets manager.

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0**.
You are free to use, study, modify and distribute this software under the same terms.
See the [LICENSE](./LICENSE) file for full details.

---

<div align="center">

**Built with ❤️ as a production-grade microservices learning platform**

*If this project helped you, please consider giving it a ⭐ on GitHub!*

</div>

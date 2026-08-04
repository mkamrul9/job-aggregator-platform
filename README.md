<div align="center">

<h1>⚡ Job Aggregator Platform</h1>

<p><strong>A production-grade, polyglot microservices monorepo that scrapes job listings across the web, parses resumes using AI/NLP, matches candidates to roles, and delivers real-time alerts — all powered by an event-driven Kafka backbone.</strong></p>

<br/>

[![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-KRaft-231F20?style=for-the-badge&logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.10-005571?style=for-the-badge&logo=elasticsearch&logoColor=white)](https://elastic.co/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Latest-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Nginx](https://img.shields.io/badge/Nginx-Gateway-009639?style=for-the-badge&logo=nginx&logoColor=white)](https://nginx.org/)

<br/>

</div>

---

## 📋 Table of Contents

- [🌟 What This Project Does](#-what-this-project-does)
- [🗺️ Architecture Overview](#️-architecture-overview)
- [🧩 Microservices At a Glance](#-microservices-at-a-glance)
- [🔄 The Data Flow: End-to-End](#-the-data-flow-end-to-end)
- [🗄️ Database Architecture](#️-database-architecture)
- [🚀 Getting Started](#-getting-started)
- [📁 Monorepo Structure](#-monorepo-structure)
- [⚙️ Environment Variables](#️-environment-variables)
- [🌐 API Reference](#-api-reference)
- [🔀 Internal Communication (gRPC)](#-internal-communication-grpc)
- [📡 Kafka Topics & Event Contracts](#-kafka-topics--event-contracts)
- [🧪 Testing](#-testing)
- [📜 Commit Conventions](#-commit-conventions)
- [🗺️ Roadmap](#️-roadmap)
- [🔒 Security](#-security)
- [📄 License](#-license)

---

## 🌟 What This Project Does

Think of this platform as an intelligent career companion that runs entirely on your own infrastructure.

| Problem | Our Solution |
|---|---|
| Job listings are scattered across 100s of websites | **Go Scraper** concurrently harvests listings using headless browser automation |
| Querying raw text at scale is slow | **Elasticsearch** provides an inverted index for sub-millisecond full-text search |
| Candidates don't know which jobs match their skills | **FastAPI + spaCy NLP** extracts technical skills from PDF resumes |
| Users miss relevant new postings | **Notification Service** pushes personalised email alerts the moment a match is scraped |
| One slow service should not crash everything else | **Apache Kafka** decouples every service — each publishes or consumes events independently |

---

## 🗺️ Architecture Overview

This platform follows a **polyglot microservices** pattern — each service is written in the language best suited to its job:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│              Web Browser  ·  Mobile App  ·  Postman                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  HTTP (port 80)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NGINX API GATEWAY                                │
│        Reverse proxy · Path-based routing · SSL termination         │
│                                                                     │
│  /api/users/  →  user-service:3000  (NestJS)                       │
│  /api/resume/ →  resume-service:8000  (FastAPI)                     │
│  /api/notifications/ → notification-service:4000  (Express)         │
└──────┬──────────┬──────────┬──────────┬────────────────────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────────┐
  │ User   │  │ Resume │  │Scraper │  │ Notification │
  │Service │  │Service │  │Service │  │   Service    │
  │NestJS  │  │FastAPI │  │  Go    │  │   Express    │
  │  TS    │  │Python  │  │        │  │   Node.js    │
  └───┬────┘  └───┬────┘  └───┬────┘  └──────┬───────┘
      │  gRPC     │           │               │
      └───────────┘           │ Kafka         │ Kafka
                              │ Producer      │ Consumer
                              ▼               │
                    ┌──────────────────┐      │
                    │   Apache Kafka   │◄─────┘
                    │  (KRaft mode)    │
                    │   jobs.new       │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐  ┌─────────┐  ┌──────────────┐
       │ Ingestion  │  │  (fut.) │  │ Notification │
       │  Worker    │  │  ES     │  │  (consumer)  │
       │  Node.js   │  │ Worker  │  │              │
       └─────┬──────┘  └────┬────┘  └──────────────┘
             │              │
             ▼              ▼
       ┌──────────┐  ┌──────────────┐
       │ MongoDB  │  │Elasticsearch │
       │ job_     │  │  8.10.2      │
       │ platform │  │  Port 9200   │
       └──────────┘  └──────────────┘
```

> **Key principle:** No service directly calls another to store data. All writes go through Kafka events, making the system resilient to individual service restarts.

---

## 🧩 Microservices At a Glance

### 🕷️ Scraper Service — `service-scraper/` (Go)
The high-performance data harvester. Uses Playwright-Go to control a headless Chromium browser. Launches one **Goroutine per URL**, achieving true parallelism with minimal memory overhead.

**Why Go?** Goroutines are lightweight (~4KB RAM each vs ~2MB for OS threads), allowing thousands of concurrent browser sessions.

**What it does:**
- Launches concurrent Goroutines for each job URL
- Renders JavaScript-heavy pages via headless Chromium
- Extracts job title, company, URL, and description
- Publishes a `JobFound` event to the `jobs.new` Kafka topic
- **Does NOT write to any database** — fully decoupled

---

### 📥 Ingestion Worker — `service-ingestion/` (Node.js)
A silent background process with no open ports. It only listens to Kafka.

**Why Node.js?** Moving JSON from a network stream (Kafka) to a NoSQL store (MongoDB) is purely I/O-bound — Node's async event loop handles this with extremely low RAM usage.

**What it does:**
- Subscribes to `jobs.new` Kafka topic (consumer group: `mongo-ingestion-group`)
- Parses each event's JSON payload
- Performs an **upsert** operation into MongoDB (deduplication by URL)
- Horizontally scalable — spin up more containers; Kafka auto-redistributes load

---

### 👤 User Service — `service-user/` (NestJS + TypeScript)
The authentication and profile management backbone.

**What it does:**
- User registration and login with **JWT** authentication
- Password hashing via **bcrypt**
- User profiles with skill arrays (populated from resume parsing)
- Connects to **PostgreSQL** via **Prisma ORM**
- Calls the Resume Service via **gRPC** when a resume is uploaded

---

### 📄 Resume Service — `service-resume/` (Python + FastAPI)
The AI/NLP engine that extracts intelligence from PDF resumes.

**What it does:**
- Accepts PDF uploads via REST API
- Extracts raw text using **PyPDF2**
- Runs extracted text through a **spaCy PhraseMatcher NLP pipeline**
- Identifies 15+ technical skills (React, Go, Kafka, Kubernetes, etc.)
- Exposes a **gRPC server** (`port 50051`) for high-performance inter-service calls
- Returns structured JSON with extracted skills

---

### 🔔 Notification Service — `service-notification/` (Node.js + Express)
The proactive alerting engine. Listens for new jobs and notifies matched users.

**What it does:**
- Subscribes to `jobs.new` Kafka topic (consumer group: `email-notification-group`)
- Matches incoming jobs against stored user skill preferences
- Sends personalised email alerts using **Nodemailer** (Ethereal SMTP in dev)
- Exposes `/health` endpoint via Express for container health-checks
- Routed through Nginx at `/api/notifications/health`

---

### 🔍 Elasticsearch — `docker-compose.yml` (Managed Container)
The search engine powering full-text job discovery.

**Why not just use MongoDB for search?**
MongoDB uses regex or simple text indexes which scan documents linearly. Elasticsearch uses an **inverted index** — like the index at the back of a textbook — so it doesn't scan; it looks up. The difference at 1,000,000 documents is orders of magnitude.

- Single-node cluster (KRaft equivalent: `discovery.type=single-node`)
- Security disabled for local development
- JVM capped at 1GB (`ES_JAVA_OPTS=-Xms1g -Xmx1g`)
- Persistent data via `elastic_data` volume

---

## 🔄 The Data Flow: End-to-End

Understanding how a single job listing travels through the system:

```
1. 🕷️  Go Scraper opens a headless Chrome browser
        ↓ (concurrent goroutines)
2. 📄  Extracts: title, company, URL, description
        ↓
3. 📤  Publishes JSON event to Kafka topic: jobs.new
        ↓ (Kafka fans out to all consumers)
       ┌────────────────┬──────────────────┐
       ↓                ↓                  ↓
4a. 📥 Ingestion    4b. 🔔 Notification   4c. 🔍 (Future)
    Worker saves       Service emails         ES Indexer
    to MongoDB         matched users          indexes for search
```

**The key insight:** Steps 4a, 4b, and 4c all happen **simultaneously and independently**. If MongoDB goes down, the Notification Service still sends emails. If the email server is slow, MongoDB still saves data. No service blocks any other.

---

## 🗄️ Database Architecture

The platform uses **polyglot persistence** — the right database for the right job:

| Database | Service | Port | Purpose |
|---|---|---|---|
| **PostgreSQL 15** | User Service | 5433 (host) | ACID-compliant relational data: users, auth, profiles, subscriptions |
| **MongoDB** | Ingestion Worker | 27017 (host) | Flexible document storage for semi-structured job listings |
| **Elasticsearch 8.10** | Future Search API | 9200 (host) | Full-text inverted index for lightning-fast job search |

### PostgreSQL Schema (via Prisma)
```prisma
model User {
  id                 String    @id @default(uuid())
  email              String    @unique
  passwordHash       String
  role               Role      @default(USER)
  subscriptionStatus SubStatus @default(FREE)
  profile            Profile?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

model Profile {
  id        String   @id @default(uuid())
  userId    String   @unique
  firstName String
  lastName  String
  resumeUrl String?
  skills    String[] // Populated by the AI Resume Service
}
```

### MongoDB Job Document
```json
{
  "_id": "ObjectId('...')",
  "title": "Senior Go Engineer",
  "company": "TechCorp Inc.",
  "url": "https://linkedin.com/jobs/...",
  "raw_description": "We are looking for a Go developer...",
  "scraped_at": "2026-08-04T04:00:00Z"
}
```

---

## 🚀 Getting Started

### Prerequisites

You only need **two tools** installed on your machine. Everything else runs inside Docker.

| Tool | Minimum Version | Download |
|---|---|---|
| Docker Desktop | 24.x | [docker.com/get-started](https://www.docker.com/get-started/) |
| Git | Any recent | [git-scm.com](https://git-scm.com/) |

> ✅ You do **NOT** need Go, Node.js, Python, or Java installed locally.

---

### 1. Clone the Repository

```bash
git clone https://github.com/mkamrul9/job-aggregator-platform.git
cd job-aggregator-platform
```

### 2. Start the Entire Platform

A single script handles everything — cleaning old containers, building images, and applying database migrations:

```bash
./deploy-local.sh
```

This script:
1. 🧹 Tears down any existing containers (`docker compose down`)
2. 🏗️ Rebuilds the Go scraper image from scratch (`--no-cache`)
3. 🌐 Spins up the entire cluster in detached mode (`-d`)
4. 💾 Waits for PostgreSQL to be ready, then runs Prisma migrations

### 3. Verify Everything is Running

```bash
docker compose ps
```

You should see all services with a status of `Up`:

| Service | Port | Status |
|---|---|---|
| `api-gateway` | 80 | Up |
| `scraper-service` | — | Up |
| `ingestion-service` | — | Up |
| `notification-service` | 4000 | Up |
| `user-service` | 3000 | Up |
| `resume-service` | 8000 | Up |
| `kafka` | 9092 | Up |
| `job-mongo` | 27017 | Up |
| `user-postgres` | 5433 | Up |
| `elasticsearch` | 9200 | Up |

### 4. Verify Key Services

**Elasticsearch** (takes ~30s to boot its JVM):
```bash
curl http://localhost:9200
# Expected: JSON response with "tagline": "You Know, for Search"
```

**Notification Service Health Check:**
```bash
curl http://localhost/api/notifications/health
# Expected: {"status":"Notification Service is running."}
```

**Resume Service Docs:**
```
http://localhost:8000/docs
```

---

## 📁 Monorepo Structure

```
job-aggregator-platform/
│
├── 📄 docker-compose.yml       # Orchestrates the entire cluster
├── 📄 deploy-local.sh          # One-command local deployment script
├── 📄 .gitignore
│
├── 🕷️  service-scraper/         # Go — Concurrent web scraper → Kafka producer
│   ├── main.go                  # Entry point: Goroutine pool + Playwright
│   ├── kafka.go                 # Kafka writer initialization & publish logic
│   ├── models.go                # DBJob struct (JSON serializable)
│   ├── Dockerfile               # Multi-stage Go build
│   ├── go.mod
│   └── go.sum
│
├── 📥 service-ingestion/        # Node.js — Kafka consumer → MongoDB writer
│   ├── index.js                 # Consumer loop with upsert logic
│   ├── Dockerfile
│   └── package.json
│
├── 👤 service-user/             # NestJS/TypeScript — Auth + User Profiles
│   ├── src/
│   │   ├── auth/                # JWT strategies, guards, decorators
│   │   └── users/               # Controllers, services, DTOs
│   ├── prisma/
│   │   └── schema.prisma        # PostgreSQL schema definition
│   └── Dockerfile
│
├── 📄 service-resume/           # Python/FastAPI — NLP resume parser + gRPC server
│   ├── main.py                  # FastAPI REST endpoints
│   ├── grpc_server.py           # gRPC server implementation
│   ├── resume_pb2.py            # Auto-generated Protobuf stubs
│   ├── requirements.txt
│   └── Dockerfile
│
├── 🔔 service-notification/     # Node.js/Express — Kafka consumer → Email alerts
│   ├── index.js                 # Consumer + Nodemailer SMTP logic
│   ├── Dockerfile
│   └── package.json
│
├── 🌐 nginx/
│   └── nginx.conf               # API Gateway routing rules
│
├── 🔗 shared-protos/            # Protobuf definitions (shared across services)
│
├── 🖥️  frontend-next/            # Next.js — Candidate-facing web app
└── 🖥️  frontend-admin/           # Angular — Internal admin dashboard
```

---

## ⚙️ Environment Variables

Each service reads its configuration from environment variables injected by Docker Compose. For local development, these are already set in `docker-compose.yml`.

### Scraper Service
| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | `kafka:9092` | Internal Kafka broker address |

### Ingestion Worker
| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | `kafka:9092` | Internal Kafka broker address |
| `MONGO_URI` | `mongodb://job-mongo:27017` | MongoDB connection string |

### User Service
| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://admin:password123@user-postgres:5432/job_aggregator_users` | Prisma PostgreSQL connection |
| `RESUME_GRPC_URL` | `resume-service:50051` | Internal gRPC address for resume service |

### Notification Service
| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | `kafka:9092` | Internal Kafka broker address |

> ⚠️ **Production Note:** Never commit real credentials. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, or Doppler) and inject secrets at runtime.

---

## 🌐 API Reference

All external traffic is routed through the **Nginx Gateway on port 80**.

### Resume Service (FastAPI) — `http://localhost:8000`

#### `POST /parse`
Upload a PDF resume and extract technical skills.

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: multipart/form-data" \
  -F "file=@./my_resume.pdf"
```

**Response:**
```json
{
  "filename": "my_resume.pdf",
  "status": "success",
  "extracted_skills": ["Go", "Docker", "Kafka", "NestJS", "PostgreSQL"]
}
```

### Notification Service (Express) — via Nginx

#### `GET /api/notifications/health`
```bash
curl http://localhost/api/notifications/health
```
```json
{ "status": "Notification Service is running." }
```

### User Service (NestJS) — Planned routes via `/api/users/`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users/auth/signup` | Register a new user |
| `POST` | `/api/users/auth/login` | Authenticate and receive JWT |
| `GET` | `/api/users/profile` | Get the current user's profile |
| `POST` | `/api/users/profile/resume` | Upload and parse resume PDF |

---

## 🔀 Internal Communication (gRPC)

The **User Service** and **Resume Service** communicate over gRPC for low-latency, type-safe inter-service calls. gRPC uses HTTP/2 and Protocol Buffers (binary format) instead of HTTP/1.1 JSON — approximately 7x faster for high-frequency calls.

**Protobuf Contract** (`shared-protos/resume.proto`):
```protobuf
syntax = "proto3";
package resume;

service ResumeParser {
  rpc ParseResume (ParseRequest) returns (ParseResponse);
}

message ParseRequest {
  string resume_url = 1;
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
        → User Service (NestJS, port 3000)
            → gRPC call → Resume Service (FastAPI, port 50051)
                ← returns extracted skills []
            ← saves skills to PostgreSQL via Prisma
        ← returns updated profile JSON
    ← 200 OK
```

---

## 📡 Kafka Topics & Event Contracts

Apache Kafka runs in **KRaft mode** — no ZooKeeper required. The entire Kafka cluster is a single broker for local development.

### Topic: `jobs.new`

**Producer:** `service-scraper` (Go)
**Consumers:**
- `service-ingestion` (consumer group: `mongo-ingestion-group`)
- `service-notification` (consumer group: `email-notification-group`)

**Message Schema** (JSON, keyed by job URL):
```json
{
  "title": "Senior Go Developer",
  "company": "Acme Corp",
  "url": "https://linkedin.com/jobs/view/12345",
  "raw_description": "We are looking for a Go developer with Kafka experience...",
  "scraped_at": "2026-08-04T04:00:00Z"
}
```

**Message Key:** The job's URL is used as the Kafka partition key. This guarantees all updates to the same job listing always land on the same partition, enabling ordered processing.

**Consumer Groups — Why They Matter:**
Because the ingestion worker and notification service each belong to different consumer groups, Kafka delivers every message to **both** of them independently. Adding a third consumer (e.g., an Elasticsearch indexer) requires zero changes to existing services — just a new consumer with a new group ID.

---

## 🧪 Testing

### Running Tests Locally

**Go Scraper:**
```bash
cd service-scraper
go test ./...
```

**NestJS User Service:**
```bash
cd service-user
npm test          # Unit tests (Jest)
npm run test:e2e  # End-to-end tests
```

**FastAPI Resume Service:**
```bash
cd service-resume
pip install pytest
pytest
```

### Testing Strategy

| Layer | Tools | Target Coverage |
|---|---|---|
| **Unit** | Jest (TS), `go test` (Go), pytest (Python) | 70%+ |
| **Integration** | Testcontainers (isolated DB instances per test) | Key data paths |
| **E2E** | Playwright / Cypress (frontend flows) | Critical user journeys |

---

## 📜 Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow the format:

```
<type>(<scope>): <description>
```

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither adds a feature nor fixes a bug |
| `chore` | Build system, dependency updates, config changes |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `style` | Formatting (no logic changes) |

**Examples from this project's history:**
```
feat(ingestion): create node.js worker to consume kafka events and persist to mongodb
refactor(scraper): decouple MongoDB and implement Kafka producer for asynchronous event publishing
chore(search): provision single-node elasticsearch container for high-performance inverted index searching
feat(notification): implement express service and nodemailer to consume kafka events and trigger email alerts
```

---

## 🗺️ Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Project setup, monorepo structure, Docker Compose foundation | ✅ Complete |
| **Phase 2** | Nginx API Gateway, internal networking, path-based routing | ✅ Complete |
| **Phase 3–4** | NestJS User Service, Prisma ORM, JWT auth, PostgreSQL schema | ✅ Complete |
| **Phase 5** | Go scraper with Playwright, headless browser, concurrent Goroutines | ✅ Complete |
| **Phase 6** | MongoDB integration, Scraper → DB pipeline | ✅ Complete |
| **Phase 7–12** | FastAPI Resume Service, spaCy NLP, gRPC inter-service communication | ✅ Complete |
| **Phase 13** | Apache Kafka (KRaft mode) infrastructure | ✅ Complete |
| **Phase 14** | Scraper decoupled from MongoDB — now publishes to Kafka | ✅ Complete |
| **Phase 15** | Node.js Ingestion Worker — Kafka consumer → MongoDB | ✅ Complete |
| **Phase 16** | Elasticsearch provisioning | ✅ Complete |
| **Phase 18** | Notification Service — Kafka consumer → Email alerts | ✅ Complete |
| **Phase 17** | Elasticsearch Indexer Worker (Kafka → ES) | 🔜 Planned |
| **Phase 19** | Next.js frontend — Candidate job portal | 🔜 Planned |
| **Phase 20** | Angular Admin Dashboard — Platform analytics | 🔜 Planned |
| **Phase 21** | GitHub Actions CI/CD pipeline | 🔜 Planned |
| **Phase 22** | Production deployment (ECS / Railway / Render) | 🔜 Planned |

---

## 🔒 Security

Security is built into the architecture, not bolted on afterward.

| Area | Implementation |
|---|---|
| **Authentication** | JWT tokens with short expiry; bcrypt password hashing (cost factor 12) |
| **API Access** | All routes protected by NestJS guards; public routes explicitly whitelisted |
| **Secrets** | Never committed to Git; injected via environment variables; production uses a secrets manager |
| **Data in transit** | Nginx terminates TLS for external traffic; internal services communicate over the isolated `microservices-net` bridge |
| **Data at rest** | PostgreSQL and MongoDB volumes encrypted in production |
| **Input validation** | All NestJS endpoints validated via `class-validator` DTOs; FastAPI uses Pydantic models |
| **Kafka** | Internal-only broker; never exposed to the public internet |
| **Elasticsearch** | Security disabled for dev only; X-Pack security must be enabled in production |
| **Least privilege** | Each service only has access to its own database; no cross-service database access |

> 🚨 **Before deploying to production:** Enable `xpack.security.enabled=true` on Elasticsearch, rotate all passwords, enable MongoDB authentication, and configure a proper secrets manager.

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0**.
You are free to use, study, modify and distribute this software under the same license.
See the [LICENSE](./LICENSE) file for full details.

---

<div align="center">

**Built with ❤️ as a production-grade microservices learning platform**

*If this project helped you, please consider giving it a ⭐ on GitHub!*

</div>

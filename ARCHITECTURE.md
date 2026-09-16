# Architecture Deep-Dive: Job Aggregator Platform

> **Who this document is for:** Anyone who wants to understand how this platform works — developers contributing code, technical leads reviewing the design, or curious learners exploring a real-world microservices system. No prior knowledge of the codebase is assumed.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [How the System Starts Up](#2-how-the-system-starts-up)
3. [Network Architecture — How Every Request Gets Routed](#3-network-architecture--how-every-request-gets-routed)
4. [The Job Scraping Pipeline — From Web Page to Database](#4-the-job-scraping-pipeline--from-web-page-to-database)
5. [The Kafka Event Bus — The Backbone of Everything](#5-the-kafka-event-bus--the-backbone-of-everything)
6. [The Ingestion Worker — How Jobs Are Stored](#6-the-ingestion-worker--how-jobs-are-stored)
7. [The Notification Pipeline — How Alerts Are Sent](#7-the-notification-pipeline--how-alerts-are-sent)
8. [The Resume Parsing Pipeline — AI Skill Extraction](#8-the-resume-parsing-pipeline--ai-skill-extraction)
9. [The User Authentication Flow — Firebase + NestJS](#9-the-user-authentication-flow--firebase--nestjs)
10. [The Frontend Application — What Users See and Do](#10-the-frontend-application--what-users-see-and-do)
11. [The Job Search API — How the Feed Works](#11-the-job-search-api--how-the-feed-works)
12. [The gRPC Channel — High-Speed Internal Communication](#12-the-grpc-channel--high-speed-internal-communication)
13. [Database Architecture — What Is Stored Where and Why](#13-database-architecture--what-is-stored-where-and-why)
14. [Complete Data Flow — An End-to-End Walkthrough](#14-complete-data-flow--an-end-to-end-walkthrough)
15. [Container Architecture — The Docker Setup](#15-container-architecture--the-docker-setup)
16. [Observability — Prometheus & Grafana Monitoring](#16-observability--prometheus--grafana-monitoring)
17. [CI/CD Pipeline — Automated Testing and Building](#17-cicd-pipeline--automated-testing-and-building)
18. [Security Model — How the Platform Protects Itself](#18-security-model--how-the-platform-protects-itself)
19. [Error Handling Across Services](#19-error-handling-across-services)
20. [Scalability Model — How This Grows](#20-scalability-model--how-this-grows)
21. [Service Reference Card](#21-service-reference-card)

---

## 1. Platform Overview

The Job Aggregator Platform is a full-stack, event-driven microservices system that does three things:

1. **Scrapes** job listings from the web automatically, every few minutes, using a headless browser.
2. **Parses** PDF resumes using an NLP (Natural Language Processing) AI model to extract a candidate's technical skills.
3. **Matches** candidates to relevant jobs and sends email notifications when a new match is scraped.

Everything runs locally on your machine via Docker. There is no cloud dependency to get started.

### System Topology at a Glance

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              YOUR BROWSER                                      │
│                          http://localhost:80                                   │
└──────────────────────────────────┬─────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                         NGINX  (api-gateway)                                   │
│                         Listens on port 80                                     │
│  Routes traffic based on URL path to the correct backend container             │
└──────┬──────────┬────────────┬────────────┬──────────────┬──────────────────────┘
       │          │            │            │              │
       ▼          ▼            ▼            ▼              ▼
 ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌────────────────┐
 │ Next.js  │ │  User   │ │ Resume │ │Ingestion │ │  Notification  │
 │ Frontend │ │ Service │ │  API   │ │ Service  │ │    Service     │
 │          │ │ NestJS  │ │ FastAPI│ │  Node.js │ │   Node.js      │
 └──────────┘ └────┬────┘ └───┬────┘ └────┬─────┘ └───────┬────────┘
                   │ gRPC      │           │               │
                   │           │           │ Kafka         │ Kafka
                   ▼           │           │ consumer      │ consumer
             ┌──────────┐      │           ▼               │
             │ Resume   │      │    ┌─────────────┐        │
             │ gRPC Svc │      │    │   Apache    │◄───────┘
             │ (Python) │      │    │    Kafka    │
             └──────────┘      │    │  (KRaft)   │
                               │    └─────┬───────┘
             ┌─────────────┐   │          │
             │  Go Scraper │───┼──────────┘ (Kafka producer)
             │   Service   │   │
             └─────────────┘   │
                               │
       ┌────────────────────────────────────────┐
       │             DATA STORES                │
       │  PostgreSQL    MongoDB    Elasticsearch │
       │  (users)       (jobs)     (search idx) │
       └────────────────────────────────────────┘
```

---

## 2. How the System Starts Up

When you run `docker compose up -d --build`, Docker performs the following sequence:

### Step-by-Step Boot Sequence

```
docker compose up
│
├─ 1. Builds all Docker images in parallel
│     ├─ frontend-next     → node:20-alpine, npm install, next build
│     ├─ user-service      → node:20-alpine, npm install, prisma generate
│     ├─ resume-api        → python:3.11-slim, pip install requirements
│     ├─ resume-grpc       → python:3.11-slim, pip install requirements
│     ├─ ingestion-service → node:20-alpine, npm install
│     ├─ scraper-service   → golang:1.23-alpine, go build
│     └─ notification-svc  → node:20-alpine, npm install
│
├─ 2. Creates the Docker network: microservices-net (bridge)
│
├─ 3. Starts infrastructure containers first (depends_on)
│     ├─ kafka             → Apache Kafka in KRaft mode (no ZooKeeper)
│     ├─ job-mongo         → MongoDB 
│     ├─ user-postgres     → PostgreSQL 15
│     └─ elasticsearch     → Elasticsearch 8.10
│
├─ 4. Starts application containers
│     ├─ resume-grpc       → gRPC Python server, port 50051 (internal)
│     ├─ resume-api        → FastAPI REST server, port 8000 (internal)
│     ├─ user-service      → NestJS server, port 3000 (internal)
│     ├─ ingestion-service → Node.js worker, port 5000 (internal)
│     ├─ notification-svc  → Node.js worker (internal)
│     ├─ scraper-service   → Go binary runs immediately
│     └─ frontend-next     → Next.js standalone server, port 3000 (internal)
│
└─ 5. Starts api-gateway (Nginx) on host port 80
       └─ Nginx reads nginx.conf and begins routing traffic
```

### What "Internal" Means

Containers that say "(internal)" above have no ports mapped to your host machine. They are only reachable by other containers on the `microservices-net` network. The only entry point to the entire system from your browser is port `80` on Nginx.

```
HOST MACHINE
│
│  Port 80 ───────► Nginx (api-gateway)
│  Port 9200 ──────► Elasticsearch (for debugging)
│  Port 27017 ─────► MongoDB (for debugging)
│  Port 5433 ──────► PostgreSQL (for debugging)
│
│  All other service ports are INTERNAL ONLY
```

---

## 3. Network Architecture — How Every Request Gets Routed

Every single request from your browser goes through Nginx first. Nginx reads the URL path and decides which container to send it to. This is called **path-based routing**.

### Nginx Routing Rules

```
Incoming Request URL               → Sent To Container
─────────────────────────────────────────────────────────────
GET  http://localhost/             → frontend-next:3000
GET  http://localhost/jobs         → frontend-next:3000
GET  http://localhost/profile      → frontend-next:3000

POST http://localhost/api/users/sync           → user-service:3000
POST http://localhost/api/users/upload-resume  → user-service:3000

POST http://localhost/api/resume/parse         → resume-api:8000
GET  http://localhost/api/resume/docs          → resume-api:8000 (Swagger UI)

GET  http://localhost/api/jobs                 → ingestion-service:5000
GET  http://localhost/api/jobs?q=React         → ingestion-service:5000
GET  http://localhost/api/jobs?page=2          → ingestion-service:5000

GET  http://localhost/api/notifications/health → notification-service:4000
```

### Why This Pattern Matters

Without Nginx in front, every service would need its own port exposed to your browser. You'd be calling `http://localhost:3000/users` for users, `http://localhost:5000/jobs` for jobs, and `http://localhost:8000/parse` for resumes. 

With Nginx:
- Your browser only ever talks to one address: `http://localhost`
- Nginx handles the internal routing
- Each service believes it is receiving requests directly
- Adding a new service is just one new `location` block in `nginx.conf`

### Nginx Configuration Walkthrough

```nginx
# nginx/nginx.conf

upstream user_service {
    server user-service:3000;       # Docker DNS resolves "user-service"
}

upstream ingestion_service {
    server ingestion-service:5000;
}

upstream resume_api {
    server resume-api:8000;
}

upstream notification_service {
    server notification-service:4000;
}

upstream frontend {
    server frontend-next:3000;      # The Next.js app
}

server {
    listen 80;

    # All /api/users/* traffic → NestJS User Service
    location /api/users/ {
        proxy_pass http://user_service/;
    }

    # All /api/jobs traffic → Node.js Ingestion Service
    location /api/jobs {
        proxy_pass http://ingestion_service/api/jobs;
    }

    # All /api/resume/* traffic → Python FastAPI
    location /api/resume/ {
        proxy_pass http://resume_api/;
        client_max_body_size 10M;   # Allow PDF uploads up to 10MB
    }

    # Notification health check
    location /api/notifications/ {
        proxy_pass http://notification_service/;
    }

    # Everything else → Next.js Frontend
    location / {
        proxy_pass http://frontend/;
    }
}
```

---

## 4. The Job Scraping Pipeline — From Web Page to Database

The Go Scraper is the starting point for all job data in the system. It runs automatically, uses a real web browser in headless mode, and publishes every job it finds to Kafka.

### Scraper Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GO SCRAPER SERVICE                               │
│                    (service-scraper/)                               │
│                                                                     │
│  1. main() starts                                                   │
│       │                                                             │
│       ▼                                                             │
│  2. Initialise Kafka Writer                                         │
│     ┌─────────────────────────────────────────┐                    │
│     │ kafka.NewWriter({                        │                    │
│     │   Addr:  KAFKA_BROKER env var            │                    │
│     │   Topic: "jobs.new"                      │                    │
│     │ })                                       │                    │
│     └─────────────────────────────────────────┘                    │
│       │                                                             │
│       ▼                                                             │
│  3. Install Playwright (downloads Chromium browser binary)          │
│       │                                                             │
│       ▼                                                             │
│  4. Launch headless Chromium browser                                │
│       │                                                             │
│       ▼                                                             │
│  5. Define list of job URLs to scrape                               │
│     ┌────────────────────────────────┐                             │
│     │ jobURLs := []string{           │                             │
│     │   "https://linkedin.com/...",  │                             │
│     │   "https://linkedin.com/...",  │                             │
│     │   "https://linkedin.com/...",  │                             │
│     │ }                              │                             │
│     └────────────────────────────────┘                             │
│       │                                                             │
│       ▼                                                             │
│  6. Launch ONE Goroutine per URL (true parallelism)                 │
│     ┌─────────────────────────────────────────────────────────┐    │
│     │  var wg sync.WaitGroup                                  │    │
│     │  for _, url := range jobURLs {                          │    │
│     │      wg.Add(1)                                          │    │
│     │      go func(url string) {                              │    │
│     │          defer wg.Done()                                │    │
│     │          scrapeAndPublish(browser, url, publisher)      │    │
│     │      }(url)                                             │    │
│     │  }                                                      │    │
│     │  wg.Wait()  // Block until ALL goroutines finish        │    │
│     └─────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Inside `scrapeAndPublish()` — What One Goroutine Does

```
scrapeAndPublish(browser, url, publisher)
│
├─ 1. Open a new browser tab (context) for this URL
│
├─ 2. Navigate to the URL
│     browser.NewPage() → page.Goto(url)
│
├─ 3. Wait for the page to fully render (JavaScript runs, etc.)
│     page.WaitForLoadState("networkidle")
│
├─ 4. Extract data from the rendered HTML
│     ├─ title   = page.TextContent("h1.job-title")
│     ├─ company = page.TextContent(".company-name")
│     └─ desc    = page.TextContent(".job-description")
│
├─ 5. Build a DBJob struct
│     job := DBJob{
│         Title:      title,
│         Company:    company,
│         URL:        url,
│         ScrapedAt:  time.Now(),
│     }
│
├─ 6. Serialise to JSON
│     payload, _ := json.Marshal(job)
│
└─ 7. Publish to Kafka topic "jobs.new"
      publisher.Publish(url, payload)
      // url is used as the Kafka message KEY
      // payload is the Kafka message VALUE
```

### Why a Headless Browser?

Most modern job boards (LinkedIn, Indeed, etc.) are built as Single Page Applications (SPAs). Their HTML source code is essentially empty — the actual job data is loaded dynamically by JavaScript running in your browser.

A simple HTTP request to `https://linkedin.com/jobs/view/12345` would return a near-empty HTML page. The Go Scraper uses Playwright to launch an actual Chromium browser engine, let it run the JavaScript, and then read the fully-rendered DOM — the same page you see in Chrome.

### Why Go for the Scraper?

Go's **goroutines** are extremely lightweight — each one costs only ~4KB of memory compared to ~2MB for a traditional OS thread. This means we can have 1,000 goroutines running simultaneously (each handling one URL) using only ~4MB of memory total. An equivalent system using Python threads or Java threads would need gigabytes of RAM for the same load.

```
100 URLs to scrape:

  Go (100 goroutines):     ~400KB RAM, all run in parallel
  Python (100 threads):    ~200MB RAM, limited by GIL
  Sequential (any lang):   100x slower — each URL waits for previous
```

---

## 5. The Kafka Event Bus — The Backbone of Everything

Apache Kafka is the central nervous system of the platform. Every time a job is scraped, the scraper publishes an event to Kafka. Multiple services then consume that event independently.

### What Is Kafka?

Think of Kafka as a very durable, very fast message queue. Publishers put messages into "topics". Subscribers (called consumers) read from those topics. Crucially:

- **Messages are persisted on disk** — if a consumer is down, it won't miss messages when it comes back up
- **Multiple consumers can read the same message** — each consumer group gets its own copy
- **Order is guaranteed** within a partition

### Kafka Topology in This Platform

```
PRODUCER                          KAFKA                        CONSUMERS
─────────                         ────────────────             ─────────────────────────────

service-scraper  ──publish──►  Topic: jobs.new  ──fan-out──► ingestion-service
  (Go)                                          │              (consumer group: mongo-ingestion-group)
                                                │
                                                └──────────► notification-service
                                                              (consumer group: email-notification-group)
```

### Why Two Consumer Groups?

Kafka uses "consumer groups" to track which messages each group has already read. If the `ingestion-service` is in group `mongo-ingestion-group`, and the `notification-service` is in group `email-notification-group`, Kafka delivers every single message to **both** groups independently.

This means:
- When a new job is published, MongoDB gets it AND the notification system gets it simultaneously
- If MongoDB is slow today, the notification still sends (they don't block each other)
- If you want to add a third consumer (e.g., an Elasticsearch indexer), you just create a new consumer group — zero changes to the scraper or any existing service

### KRaft Mode (No ZooKeeper)

This platform runs Kafka in **KRaft mode**, which is the modern way to run Kafka without needing a separate ZooKeeper cluster. All Kafka metadata (topics, partitions, consumer group offsets) is stored inside Kafka itself. This simplifies the deployment — fewer containers, fewer moving parts.

### Message Format — What Gets Published

Every message published to the `jobs.new` topic has:

```
Kafka Message
├─ KEY:   The job URL (string)
│         e.g. "https://linkedin.com/jobs/view/12345"
│         (Used for partition assignment — all updates to the same job go to the same partition)
│
└─ VALUE: JSON payload (bytes)
          {
            "title":           "Senior Software Engineer",
            "company":         "Acme Corp",
            "url":             "https://linkedin.com/jobs/view/12345",
            "raw_description": "We are looking for a...",
            "scraped_at":      "2026-09-16T10:00:00Z"
          }
```

### What Happens If Kafka Is Not Ready?

When the `notification-service` starts, it attempts to connect to Kafka. If Kafka hasn't fully booted yet (which can happen on first startup), the connection will fail.

To handle this, the notification service has a **retry loop with backoff**:

```javascript
// service-notification/index.js
async function connectWithRetry(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            await consumer.connect();
            console.log('Connected to Kafka');
            return;
        } catch (err) {
            console.log(`Kafka not ready, retrying in ${(i+1)*2}s...`);
            await new Promise(r => setTimeout(r, (i + 1) * 2000));
        }
    }
    throw new Error('Could not connect to Kafka after retries');
}
```

This prevents the notification service from crash-looping while Kafka is still booting.

---

## 6. The Ingestion Worker — How Jobs Are Stored

The Ingestion Worker is a Node.js process that sits silently in the background. It has one job: listen to the `jobs.new` Kafka topic and save every message into MongoDB.

### Ingestion Flow

```
┌───────────────────────────────────────────────────────────────┐
│                  INGESTION SERVICE                            │
│                  (service-ingestion/)                         │
│                                                               │
│  1. Connect to Kafka as consumer                              │
│     group: "mongo-ingestion-group"                            │
│     topic: "jobs.new"                                         │
│                                                               │
│  2. Connect to MongoDB                                        │
│     database: "job_platform"                                  │
│     collection: "jobs"                                        │
│                                                               │
│  3. Start consuming loop                                      │
│     for each message in topic:                                │
│       │                                                       │
│       ├─ Parse JSON from message.value                        │
│       │                                                       │
│       ├─ Run MongoDB UPSERT                                   │
│       │   filter:  { url: job.url }  ← find by URL           │
│       │   update:  { $set: { ...job, scraped_at: now } }     │
│       │   options: { upsert: true }  ← insert if not found   │
│       │                                                       │
│       └─ Commit Kafka offset (acknowledge message received)   │
│                                                               │
│  4. Expose REST API for the frontend                          │
│     GET /api/jobs                                             │
│     GET /api/jobs?q=React&page=1&limit=20                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Why Upsert Instead of Insert?

The scraper runs every few minutes and will re-scrape the same URLs. Without upsert, MongoDB would accumulate duplicate documents for every scraping cycle.

With upsert (`filter by URL, update if exists, insert if not`):
- The first time a URL is scraped → a new document is created
- Every subsequent scrape → the existing document is updated with fresh data
- The MongoDB collection always has exactly one document per unique job URL

### The Job Search API

The Ingestion Service also exposes a REST API that the frontend uses to display the job feed. It supports three query parameters:

```
GET /api/jobs

Query Parameters:
  ?page=<number>   Page number (default: 1)
  ?limit=<number>  Results per page (default: 20)
  ?q=<string>      Keyword filter (searches title and company fields)

Examples:
  GET /api/jobs                         → First 20 jobs, newest first
  GET /api/jobs?page=2                  → Second page of 20 jobs
  GET /api/jobs?limit=50                → First 50 jobs
  GET /api/jobs?q=React                 → Jobs with "React" in title or company
  GET /api/jobs?q=Google&limit=10       → Jobs at Google, first 10
```

### How the Search Works

```javascript
// service-ingestion/index.js

app.get('/api/jobs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const page  = parseInt(req.query.page)  || 1;
    const skip  = (page - 1) * limit;       // e.g. page 2, limit 20 → skip 20
    const q     = req.query.q;

    // Build MongoDB query
    let query = {};
    if (q) {
        // Case-insensitive regex search on title OR company
        query = {
            $or: [
                { title:   new RegExp(q, 'i') },
                { company: new RegExp(q, 'i') }
            ]
        };
    }

    // Execute paginated query
    const jobs  = await jobsCollection
        .find(query)
        .sort({ scraped_at: -1 })  // Newest first
        .skip(skip)
        .limit(limit)
        .toArray();

    const total = await jobsCollection.countDocuments(query);

    res.json({ jobs, total, page, limit });
});
```

---

## 7. The Notification Pipeline — How Alerts Are Sent

The Notification Service runs as a background process, consuming the same `jobs.new` Kafka topic as the Ingestion Worker. But instead of saving to MongoDB, it sends emails.

### Notification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│               NOTIFICATION SERVICE                              │
│               (service-notification/)                           │
│                                                                 │
│  1. Connect to Kafka                                            │
│     group: "email-notification-group"                           │
│     (Different group from ingestion — gets its own copy)        │
│                                                                 │
│  2. For each new job message received:                          │
│       │                                                         │
│       ├─ Parse job data from Kafka payload                      │
│       │   { title, company, url, raw_description }              │
│       │                                                         │
│       ├─ Check job skills against stored user preferences       │
│       │   (currently stub — future: query PostgreSQL)           │
│       │                                                         │
│       ├─ If match found → build email                           │
│       │   Subject: "New Job Match: <title> at <company>"        │
│       │   Body: Job details + link to apply                     │
│       │                                                         │
│       └─ Send via Nodemailer (Ethereal SMTP in dev)             │
│                                                                 │
│  3. Expose health check endpoint                                │
│     GET /health → { status: "Notification Service running" }   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Email Transport in Development

In development, emails are not sent to real inboxes. The service uses **Ethereal** — a fake SMTP server provided by Nodemailer that captures emails and lets you view them at `https://ethereal.email`. This means you can test the full email pipeline without needing an email provider API key.

```javascript
// Creates a throwaway test account automatically
const testAccount = await nodemailer.createTestAccount();

const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: testAccount.user,
        pass: testAccount.pass,
    },
});
```

Every email sent in dev will log a preview URL to the Docker logs:
```
docker compose logs -f notification-service

# Output:
# Email sent: <message-id>
# Preview URL: https://ethereal.email/message/WaQKMgahreGssXx...
```

Open that URL in your browser to see exactly what the email looks like.

---

## 8. The Resume Parsing Pipeline — AI Skill Extraction

When a user uploads a PDF resume, it passes through two services: the NestJS User Service (which handles the HTTP request and file storage) and the Python Resume API (which reads the PDF and extracts skills).

### Resume Upload Flow — REST Path (Current Implementation)

```
Browser                     Nginx               Resume API (FastAPI)
  │                           │                       │
  │  POST /api/resume/parse   │                       │
  │  Content-Type: multipart  │                       │
  │  Body: PDF file bytes     │                       │
  │──────────────────────────►│                       │
  │                           │  proxy_pass           │
  │                           │──────────────────────►│
  │                           │                       │
  │                           │              ┌─────────────────────┐
  │                           │              │ 1. Validate content  │
  │                           │              │    type = PDF        │
  │                           │              │                     │
  │                           │              │ 2. Read all bytes    │
  │                           │              │    from upload       │
  │                           │              │                     │
  │                           │              │ 3. Wrap in BytesIO   │
  │                           │              │    stream            │
  │                           │              │                     │
  │                           │              │ 4. PyPDF2 reads      │
  │                           │              │    each page and     │
  │                           │              │    extracts text     │
  │                           │              │                     │
  │                           │              │ 5. spaCy PhraseMatcher│
  │                           │              │    scans text for   │
  │                           │              │    known tech skills │
  │                           │              │                     │
  │                           │              │ 6. Return JSON       │
  │                           │              └─────────────────────┘
  │                           │                       │
  │                           │◄──────────────────────│
  │◄──────────────────────────│                       │
  │                           │
  │  {                        │
  │    "filename": "cv.pdf",  │
  │    "status": "success",   │
  │    "extracted_skills": [  │
  │       "Python",           │
  │       "Docker",           │
  │       "React"             │
  │    ]                      │
  │  }                        │
```

### How the NLP Skill Extraction Works

The Python service uses **spaCy's PhraseMatcher**, which is an extremely fast algorithm for finding exact multi-word phrases in a large body of text.

**Step 1: Build the matcher at startup**

```python
# service-resume/main.py

nlp = spacy.load("en_core_web_sm")  # Load the English NLP model
matcher = PhraseMatcher(nlp.vocab, attr="LOWER")  # Case-insensitive

TECH_SKILLS = [
    "React", "Angular", "Vue", "Node.js", "NestJS",
    "Python", "FastAPI", "Go", "Golang",
    "Docker", "Kubernetes",
    "PostgreSQL", "MongoDB", "Kafka",
    "Microservices"
    # ... add more here
]

# Convert each skill string into a spaCy Doc pattern
patterns = [nlp.make_doc(skill) for skill in TECH_SKILLS]
matcher.add("SKILLS", patterns)
```

**Step 2: Extract skills from uploaded text**

```python
def extract_skills_from_text(text: str) -> list:
    doc = nlp(text)                     # Parse text into linguistic tokens
    matches = matcher(doc)              # Find all skill pattern matches
    extracted = set()                   # Use a set to avoid duplicates

    for match_id, start, end in matches:
        span = doc[start:end]           # The matched text span
        # Canonicalise: "python" → "Python", "golang" → "Go"
        skill = CANONICAL_SKILLS.get(span.text.lower(), span.text)
        extracted.add(skill)

    return list(extracted)
```

**Why PhraseMatcher instead of regex?**

PhraseMatcher uses Aho-Corasick algorithm internally — it scans the entire document once and matches all patterns simultaneously, regardless of how many patterns there are. With 500 skill patterns, the performance is the same as with 5.

A regex approach would require 500 separate regex operations on the same text, which is 100x slower.

### The gRPC Alternative Path (For Authenticated Users)

When a logged-in user uploads their resume through the User Service, a different path is used: the NestJS User Service calls the Python gRPC service directly over gRPC (not REST). This is covered in detail in [Section 12](#12-the-grpc-channel--high-speed-internal-communication).

---

## 9. The User Authentication Flow — Firebase + NestJS

User authentication uses **Firebase Authentication** — a managed auth service by Google. The NestJS User Service validates Firebase ID tokens on every protected request.

### Authentication Flow — Login and First Request

```
Browser (User)                Firebase Auth          NestJS User Service
     │                              │                       │
     │  1. User enters email +      │                       │
     │     password in React UI     │                       │
     │                              │                       │
     │  signInWithEmailAndPassword()│                       │
     │─────────────────────────────►│                       │
     │                              │                       │
     │  ◄── Firebase ID Token ──────│                       │
     │      (JWT, expires 1hr)      │                       │
     │                              │                       │
     │  2. Browser stores token     │                       │
     │     in memory                │                       │
     │                              │                       │
     │  3. Makes API request with   │                       │
     │     token in header          │                       │
     │                              │                       │
     │  POST /api/users/sync        │                       │
     │  Authorization: Bearer <token>                       │
     │─────────────────────────────────────────────────────►│
     │                              │                       │
     │                              │  FirebaseAuthGuard     │
     │                              │  verifies token with  │
     │                              │  Firebase Admin SDK   │
     │                              │◄──────────────────────│
     │                              │──────────────────────►│
     │                              │  { uid, email, ... }  │
     │                              │                       │
     │                              │  Creates/updates User  │
     │                              │  record in PostgreSQL │
     │                              │                       │
     │◄─────────────────────────────────────────────────────│
     │  { message: "User synced", user: { id, email } }    │
```

### The FirebaseAuthGuard

The `FirebaseAuthGuard` in NestJS is a middleware that runs before every protected route handler. It:

1. Reads the `Authorization: Bearer <token>` header
2. Calls Firebase Admin SDK `auth().verifyIdToken(token)`
3. If valid: attaches the decoded user object to `request.user` and lets the request through
4. If invalid or missing: throws `UnauthorizedException` with a descriptive JSON message

```typescript
// service-user/src/auth/firebase-auth.guard.ts

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Authorization token is missing.');
        }

        const token = authHeader.split(' ')[1];

        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            request.user = decodedToken;  // Attach to request
            return true;
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired token.');
        }
    }
}
```

### Using the Guard on Routes

```typescript
// service-user/src/user/user.controller.ts

@Post('sync')
@UseGuards(FirebaseAuthGuard)   // ← This line activates the guard
async syncUser(@Req() request: any) {
    // Only reachable if token is valid
    // request.user = { uid, email, ... } from Firebase
    const user = await this.userService.findOrCreateUser({
        id:    request.user.uid,
        email: request.user.email,
    });
    return { message: 'User synced', user };
}
```

---

## 10. The Frontend Application — What Users See and Do

The Next.js frontend is the face of the platform. It is a React application built with the Next.js App Router and served through Nginx.

### Page Structure

```
http://localhost/
│
└─ app/
   ├─ page.tsx           ← The main page (root route "/")
   │   Contains:
   │   ├─ Left column:   ResumeUpload component
   │   └─ Right column:  JobSearch component
   │
   ├─ layout.tsx         ← Root layout (font, metadata, global CSS)
   │
   └─ api/
      └─ search/
         └─ route.ts     ← Next.js API route (server-side proxy)
```

### ResumeUpload Component — State Machine

```
ResumeUpload Component
│
├─ State Variables:
│   file     = null          ← Selected PDF file
│   uploading = false        ← Is request in flight?
│   skills   = []            ← Skills returned from API
│   error    = ""            ← Error message to display
│
├─ User Actions:
│   ┌─────────────────────────────────────────────────────────┐
│   │                                                         │
│   │  [User drags PDF onto drop zone]                        │
│   │         ↓                                               │
│   │  setFile(droppedFile)  →  Green tick + filename shown   │
│   │                                                         │
│   │  [User clicks "Parse Resume"]                           │
│   │         ↓                                               │
│   │  handleUpload() runs:                                   │
│   │    1. Validate: file must exist                         │
│   │    2. setUploading(true)                                │
│   │    3. Build FormData with file                          │
│   │    4. POST /api/resume/parse                            │
│   │    5. Await response                                    │
│   │    6. setSkills(data.extracted_skills)                  │
│   │    7. setUploading(false)                               │
│   │                                                         │
│   │  [Skills array is now populated]                        │
│   │         ↓                                               │
│   │  Skills render as badge tags below the upload box       │
│   │                                                         │
│   └─────────────────────────────────────────────────────────┘
│
└─ Rendered Output:
    ┌─────────────────────────────┐
    │   📄 AI Resume Parser       │
    │                             │
    │  ┌───────────────────────┐  │
    │  │  Drag & Drop PDF here │  │
    │  │  or click to browse   │  │
    │  └───────────────────────┘  │
    │                             │
    │  [Parse Resume ↑]           │
    │                             │
    │  Detected Skills:           │
    │  [Python] [Docker] [React]  │
    └─────────────────────────────┘
```

### JobSearch Component — State Machine

```
JobSearch Component
│
├─ State Variables:
│   searchTerm = ""       ← What the user typed
│   jobs       = []       ← Array of job objects from API
│   loading    = false    ← Is request in flight?
│
├─ On Mount (useEffect):
│   fetchJobs("")         ← Automatically load all jobs on page load
│                            No user action required
│
├─ User Actions:
│   ┌─────────────────────────────────────────────────────────┐
│   │                                                         │
│   │  [User types "React" in search box]                     │
│   │         ↓                                               │
│   │  setSearchTerm("React")                                 │
│   │                                                         │
│   │  [User clicks Search]                                   │
│   │         ↓                                               │
│   │  handleSearch() → fetchJobs("React")                    │
│   │         ↓                                               │
│   │  GET /api/jobs?q=React                                  │
│   │         ↓                                               │
│   │  setJobs(data.jobs)                                     │
│   │         ↓                                               │
│   │  Job cards re-render with filtered results              │
│   │                                                         │
│   └─────────────────────────────────────────────────────────┘
│
└─ Rendered Output:
    ┌─────────────────────────────┐
    │   4 RESULTS FOR "React"     │
    │                             │
    │  ┌───────────────────────┐  │
    │  │ Senior React Dev      │  │
    │  │ @ Acme Corp           │  │
    │  │ [View & Apply →]      │  │
    │  └───────────────────────┘  │
    │                             │
    │  ┌───────────────────────┐  │
    │  │ Frontend Engineer     │  │
    │  │ @ The Home Depot      │  │
    │  │ [View & Apply →]      │  │
    │  └───────────────────────┘  │
    └─────────────────────────────┘
```

---

## 11. The Job Search API — How the Feed Works

The job feed is one of the most visible features of the platform. Here is exactly what happens when a user lands on the page and when they perform a search.

### Initial Page Load — Auto-Fetch

```
Timeline: User opens http://localhost in browser

T=0ms    Browser loads HTML from Next.js
T=50ms   React components mount
T=50ms   JobSearch useEffect fires
T=51ms   fetchJobs("") called with empty query
T=51ms   fetch("/api/jobs") request sent
T=51ms   Nginx receives request
T=52ms   Nginx routes to ingestion-service:5000
T=52ms   Node.js queries MongoDB: find({}).sort({scraped_at:-1}).limit(20)
T=80ms   MongoDB returns 20 most recent jobs
T=81ms   Ingestion service returns JSON response
T=82ms   React setJobs(data.jobs) updates state
T=83ms   Component re-renders with 20 job cards visible
```

### Search Query — Keyword Filter

```
Timeline: User types "Engineer" and clicks Search

T=0ms    User clicks Search button
T=1ms    handleSearch() called
T=1ms    fetchJobs("Engineer") called
T=2ms    fetch("/api/jobs?q=Engineer") request sent
T=2ms    Nginx routes to ingestion-service:5000
T=2ms    Node.js builds MongoDB query:
         { $or: [
             { title:   /Engineer/i },
             { company: /Engineer/i }
           ]
         }
T=3ms    MongoDB executes regex search
T=30ms   MongoDB returns matching documents
T=31ms   Response JSON returned to browser
T=32ms   setJobs() updates state with filtered results
T=33ms   Job cards re-render with only matching jobs
```

### Pagination

```
For large datasets, the API supports pagination:

Page 1: GET /api/jobs?page=1&limit=20
        MongoDB: find().skip(0).limit(20)    → documents 1–20

Page 2: GET /api/jobs?page=2&limit=20
        MongoDB: find().skip(20).limit(20)   → documents 21–40

Page 3: GET /api/jobs?page=3&limit=20
        MongoDB: find().skip(40).limit(20)   → documents 41–60

Response always includes metadata:
{
  "jobs":  [...],   ← The data
  "total": 145,     ← Total matching documents
  "page":  2,       ← Current page
  "limit": 20       ← Page size
}
```

---

## 12. The gRPC Channel — High-Speed Internal Communication

When a logged-in user uploads their resume via the User Service (not the direct resume endpoint), the NestJS service calls the Python gRPC service to extract skills. This is an internal, binary-protocol call — much faster than HTTP/JSON.

### Why gRPC for This Call?

- **Binary protocol**: Protocol Buffers serialize data ~5x more compactly than JSON
- **HTTP/2**: Multiplexed streams, no head-of-line blocking
- **Strict typing**: Both services agree on an exact message schema (the `.proto` file). If either side changes a field, it is a compile-time error — not a runtime surprise
- **Synchronous and fast**: The user is waiting for their skills to appear — this call must be fast

### gRPC Call Flow

```
NestJS User Service                       Python gRPC Service
(service-user/)                           (service-resume/grpc_server.py)
       │                                           │
       │  POST /api/users/upload-resume            │
       │  ← (user uploaded a PDF) ─               │
       │                                           │
       │  1. Multer saves file to /uploads/        │
       │     file.path = "/uploads/1234.pdf"       │
       │                                           │
       │  2. Create gRPC client stub               │
       │     pointing at resume-grpc:50051         │
       │                                           │
       │  3. Call ParseResume RPC                  │
       │─────── ParseRequest ──────────────────────►
       │        { file_path: "/uploads/1234.pdf" } │
       │                                           │
       │                             ┌─────────────────────────┐
       │                             │  gRPC Server receives   │
       │                             │  ParseRequest           │
       │                             │                         │
       │                             │  1. Read file from path │
       │                             │  2. PyPDF2 extracts text│
       │                             │  3. spaCy finds skills  │
       │                             │  4. Build ParseResponse │
       │                             └─────────────────────────┘
       │                                           │
       │◄──────── ParseResponse ───────────────────│
       │          { skills: ["Go","Docker",...],   │
       │            confidence_score: 0.92,        │
       │            extracted_text: "..." }        │
       │                                           │
       │  4. Save skills to PostgreSQL             │
       │     UPDATE Profile SET                    │
       │       extractedSkills = ["Go","Docker"]   │
       │     WHERE userId = <user-id>              │
       │                                           │
       │  5. Return success response to browser    │
       │     { message: "Resume parsed",           │
       │       user: { skills: [...] } }           │
```

### The Protobuf Contract

```protobuf
// shared-protos/resume.proto

syntax = "proto3";
package resume;

// The service definition
service ResumeParser {
    rpc ParseResume (ParseRequest) returns (ParseResponse);
}

// Request message: tell the server where the PDF file is
message ParseRequest {
    string file_path = 1;   // Absolute path inside the container
}

// Response message: the extracted data
message ParseResponse {
    repeated string skills = 1;        // Array of skill strings
    float confidence_score   = 2;      // Overall confidence 0.0–1.0
    string extracted_text    = 3;      // Full raw text extracted from PDF
}
```

Both the NestJS service and the Python service are generated from this single `.proto` file. Any schema change must be made here first and then regenerated in both services.

---

## 13. Database Architecture — What Is Stored Where and Why

The platform uses three different databases, each chosen for a specific purpose.

### PostgreSQL — Structured User Data

**Used by:** User Service (NestJS)  
**Accessed via:** Prisma ORM  
**Port on host:** 5433

PostgreSQL stores data that has strict relationships and requires ACID guarantees (Atomicity, Consistency, Isolation, Durability).

```
PostgreSQL Database: job_aggregator_users
│
├─ Table: User
│   ┌──────────────────┬──────────────┬──────────────────────────┐
│   │ Column           │ Type         │ Description              │
│   ├──────────────────┼──────────────┼──────────────────────────┤
│   │ id               │ String (PK)  │ Firebase UID             │
│   │ email            │ String       │ User email (unique)      │
│   │ role             │ Enum         │ USER | ADMIN             │
│   │ subscriptionStatus│ Enum        │ FREE | PREMIUM           │
│   │ createdAt        │ DateTime     │ Account creation time    │
│   │ updatedAt        │ DateTime     │ Last update time         │
│   └──────────────────┴──────────────┴──────────────────────────┘
│
└─ Table: Profile (one-to-one with User)
    ┌──────────────────┬──────────────┬──────────────────────────┐
    │ Column           │ Type         │ Description              │
    ├──────────────────┼──────────────┼──────────────────────────┤
    │ id               │ String (PK)  │ Profile UUID             │
    │ userId           │ String (FK)  │ → User.id                │
    │ firstName        │ String       │ First name               │
    │ lastName         │ String       │ Last name                │
    │ resumeUrl        │ String?      │ Path to uploaded PDF     │
    │ extractedSkills  │ String[]     │ Skills from AI parser    │
    └──────────────────┴──────────────┴──────────────────────────┘
```

**Why PostgreSQL for users?**
- Users have relationships (one user has one profile)
- Email must be globally unique — enforced by a database constraint
- User data is critical — ACID guarantees prevent partial writes
- Prisma provides type-safe queries from TypeScript

### MongoDB — Semi-Structured Job Listings

**Used by:** Ingestion Service (Node.js)  
**Port on host:** 27017

MongoDB stores data that is semi-structured (each job might have slightly different fields from different sources).

```
MongoDB Database: job_platform
Collection: jobs

Example Document:
{
    "_id": ObjectId("..."),
    "title": "Senior Software Engineer",
    "company": "Acme Corp",
    "url": "https://linkedin.com/jobs/view/12345",    ← Unique index
    "raw_description": "We are looking for...",
    "scraped_at": ISODate("2026-09-16T10:00:00Z")
}

Indexes:
- { url: 1 }  UNIQUE  ← Enforces deduplication
- { scraped_at: -1 }  ← Powers the "newest first" sort
- { title: "text", company: "text" }  ← Optional: full-text index
```

**Why MongoDB for jobs?**
- Job listings from different sources have different fields — flexible schema
- The scraper publishes JSON directly into Kafka — MongoDB accepts that JSON as-is
- Upsert-by-URL deduplication is trivial in MongoDB
- High write throughput for scraping bursts

### Elasticsearch — Full-Text Search Index

**Port on host:** 9200  
**Status:** Provisioned, not yet fully integrated

Elasticsearch is provisioned and running but the indexer worker (which would feed it from Kafka) is a planned future phase. Once completed, job search will be powered by Elasticsearch's inverted index instead of MongoDB regex, enabling:
- Typo tolerance (fuzzy matching)
- Relevance ranking (most relevant results first)
- Faceted filtering (filter by skills, company, location simultaneously)
- Sub-millisecond response times on millions of documents

---

## 14. Complete Data Flow — An End-to-End Walkthrough

This section walks through the entire platform lifecycle for two key user scenarios.

### Scenario A: A Job Gets Scraped

```
                ┌─────────────────────────────────────────┐
                │          GO SCRAPER                     │
                │  Playwright opens Chromium browser      │
                │  Navigates to LinkedIn job URL          │
                │  Extracts: title, company, description  │
                └───────────────────┬─────────────────────┘
                                    │
                                    │ JSON message published to
                                    │ Kafka topic: jobs.new
                                    │ Key: job URL
                                    ▼
                ┌─────────────────────────────────────────┐
                │           APACHE KAFKA                  │
                │   Topic: jobs.new                       │
                │   Partition: hash(url) % num_partitions │
                │   Message retained for 7 days           │
                └──────────────────┬──────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼ (consumer group: mongo-ingestion-group) │
 ┌────────────────────────────┐         ▼ (consumer group: email-notification-group)
 │    INGESTION SERVICE       │  ┌──────────────────────────────────────┐
 │                            │  │      NOTIFICATION SERVICE            │
 │  Receives Kafka message    │  │                                      │
 │  Parses JSON               │  │  Receives same Kafka message         │
 │  Upserts to MongoDB:       │  │  Checks job against user skill prefs │
 │    filter: { url }         │  │  Sends email via Nodemailer if match │
 │    update: { $set: job }   │  │                                      │
 │    upsert: true            │  └──────────────────────────────────────┘
 └────────────────────────────┘
              │
              ▼
 ┌────────────────────────────┐
 │         MONGODB            │
 │   Collection: jobs         │
 │   New doc created or       │
 │   existing doc updated     │
 └────────────────────────────┘
              │
              ▼
 ┌────────────────────────────┐
 │     NEXT.JS FRONTEND       │
 │                            │
 │   GET /api/jobs            │
 │   ← shows new job in feed  │
 └────────────────────────────┘
```

### Scenario B: A User Uploads a Resume

```
User opens http://localhost
            │
            ▼
┌─────────────────────────────────┐
│       NEXT.JS FRONTEND          │
│   ResumeUpload component        │
│   User drops PDF file           │
│   Clicks "Parse Resume"         │
└────────────────┬────────────────┘
                 │ POST /api/resume/parse
                 │ Content-Type: multipart/form-data
                 │ Body: PDF bytes
                 ▼
┌─────────────────────────────────┐
│         NGINX GATEWAY           │
│   Matches /api/resume/          │
│   Forwards to resume-api:8000   │
│   client_max_body_size 10M      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│      RESUME API (FastAPI)       │
│                                 │
│   1. Validate: PDF only         │
│   2. Read bytes into BytesIO    │
│   3. PyPDF2 → extract text      │
│   4. spaCy PhraseMatcher scan   │
│   5. Return extracted_skills[]  │
└────────────────┬────────────────┘
                 │ JSON response
                 ▼
┌─────────────────────────────────┐
│       NEXT.JS FRONTEND          │
│   data.extracted_skills found   │
│   setSkills(data.extracted...)  │
│   Skills render as badge tags   │
│   e.g. [Python] [Docker] [Go]   │
└─────────────────────────────────┘
```

---

## 15. Container Architecture — The Docker Setup

All services run inside Docker containers, connected on a shared private network.

### Container Map

```
docker-compose.yml defines:

Infrastructure (start first)
├─ kafka              Image: confluentinc/cp-kafka
│   Ports:  9092 (internal), 29092 (internal)
│   Volumes: kafka_data
│   Config:  KRaft mode (no ZooKeeper), auto-creates topics
│
├─ job-mongo          Image: mongo:latest
│   Ports:  27017:27017 (also exposed to host for debugging)
│   Volumes: mongo_data
│
├─ user-postgres      Image: postgres:15
│   Ports:  5433:5432 (host:container)
│   Volumes: postgres_data
│   Env:    POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
│
└─ elasticsearch      Image: docker.elastic.co/elasticsearch/elasticsearch:8.10.2
    Ports:  9200:9200
    Env:    discovery.type=single-node, xpack.security.enabled=false
    Memory: ES_JAVA_OPTS=-Xms1g -Xmx1g

Application Services
├─ api-gateway        Image: nginx:alpine
│   Ports:  80:80  ← The only entry point from your browser
│   Volumes: ./nginx/nginx.conf mounted into container
│
├─ frontend-next      Built from: ./frontend-next/Dockerfile
│   Ports:  Internal only (nginx proxies to it)
│   Env:    Firebase config vars
│
├─ user-service       Built from: ./service-user/Dockerfile
│   Ports:  Internal only
│   Env:    DATABASE_URL, RESUME_GRPC_URL
│
├─ resume-api         Built from: ./service-resume/Dockerfile
│   Ports:  Internal only
│   Entry:  uvicorn main:app (FastAPI REST server)
│
├─ resume-grpc        Built from: ./service-resume/Dockerfile
│   Ports:  50051 (internal only)
│   Entry:  python grpc_server.py (gRPC server)
│
├─ ingestion-service  Built from: ./service-ingestion/Dockerfile
│   Ports:  5000 (internal only)
│   Env:    KAFKA_BROKER, MONGO_URI
│
├─ scraper-service    Built from: ./service-scraper/Dockerfile
│   Ports:  None (pure background worker)
│   Env:    KAFKA_BROKER
│
└─ notification-svc   Built from: ./service-notification/Dockerfile
    Ports:  4000 (internal only)
    Env:    KAFKA_BROKER

Monitoring
├─ prometheus          Scrapes /metrics from all services
└─ grafana             Visualises Prometheus data at localhost:3001
```

### Multi-Stage Docker Builds

Every service uses a **multi-stage Dockerfile** to produce small production images. Here is the pattern used by all services:

```dockerfile
# Stage 1: Builder (large image with all tools)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install           ← Install ALL deps (including devDeps)
COPY . .
RUN npm run build         ← Compile TypeScript, etc.

# Stage 2: Runner (tiny production image)
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist           ← Only compiled output
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/main.js"]
```

The builder stage might be 800MB. The final runner image might be 120MB. Only the runner stage gets deployed.

### Volumes — Persistent Data

Docker containers are ephemeral — their filesystem disappears when they stop. To persist data, Docker volumes are used:

```
Named Volumes (persist across container restarts):
  kafka_data       → Kafka log segments and offsets
  mongo_data       → MongoDB database files
  postgres_data    → PostgreSQL data directory
  elastic_data     → Elasticsearch indices
  grafana_data     → Grafana dashboards and config

Bind Mounts (live-reload from host filesystem):
  ./nginx/nginx.conf → /etc/nginx/nginx.conf  (Nginx config)
```

---

## 16. Observability — Prometheus & Grafana Monitoring

The platform includes a complete monitoring stack with Prometheus and Grafana.

### How Monitoring Works

```
Services expose metrics at /metrics endpoints
         │
         ▼
Prometheus scrapes these endpoints every 15 seconds
Stores as time-series data
         │
         ▼
Grafana queries Prometheus
Renders live dashboards
Accessible at http://localhost:3001
```

### What Metrics Are Collected

| Service | Metric Type | Example Metrics |
|---|---|---|
| **Nginx** | Request rates, latency, error rates | `nginx_http_requests_total`, `nginx_connections_active` |
| **Node.js services** | Event loop lag, memory, GC | `nodejs_heap_used_bytes`, `nodejs_eventloop_lag_seconds` |
| **Kafka** | Consumer lag, publish rate | `kafka_consumer_lag`, `kafka_messages_per_second` |
| **MongoDB** | Query times, connections | `mongodb_connections_current` |
| **System** | CPU, memory, disk | `container_cpu_usage_seconds_total` |

### Accessing Grafana

1. Open `http://localhost:3001` in your browser
2. Login: `admin` / `admin` (default dev credentials)
3. Dashboards are pre-provisioned from `config-prometheus/`

---

## 17. CI/CD Pipeline — Automated Testing and Building

Every push and pull request to this repository triggers the GitHub Actions CI pipeline.

### Pipeline Triggers

```
Trigger: Push to any branch
Trigger: Pull Request targeting main
```

### Pipeline Stages

```
GitHub Actions CI Pipeline (.github/workflows/ci-pipeline.yml)
│
├─ Job: Test Go Scraper
│   ├─ Checkout code
│   ├─ Setup Go 1.23
│   ├─ cd service-scraper
│   └─ go test ./...
│
├─ Job: Test Python Resume Service
│   ├─ Checkout code
│   ├─ Setup Python 3.11
│   ├─ pip install -r requirements.txt
│   └─ pytest
│
├─ Job: Test NestJS User Service
│   ├─ Checkout code
│   ├─ Setup Node 20
│   ├─ npm install
│   └─ npm test
│
└─ Job: Build Docker Images (only on main branch)
    ├─ docker compose build
    └─ Verify all images build without errors
```

### Branch Protection Rules (Recommended Setup)

Go to **GitHub → Settings → Branches → Add Rule** for the `main` branch:

```
Branch name pattern: main

✓ Require a pull request before merging
  - Required approving reviews: 1

✓ Require status checks to pass before merging
  - Status checks: "Test Go Scraper", "Test Python", "Test NestJS"

✓ Require conversation resolution before merging

✓ Do not allow bypassing the above settings
```

With these rules, no code can reach `main` without passing all tests and getting a code review.

---

## 18. Security Model — How the Platform Protects Itself

### Authentication Boundaries

```
PUBLIC (no auth required):
├─ GET  /api/jobs          → Browse all job listings
├─ GET  /api/jobs?q=...    → Search job listings
├─ POST /api/resume/parse  → Parse a PDF resume
└─ GET  /api/notifications/health

PROTECTED (Firebase token required):
├─ POST /api/users/sync           → Sync Firebase user to PostgreSQL
└─ POST /api/users/upload-resume  → Upload resume + save to user profile
```

### Defence in Depth

```
Layer 1: Network isolation
  All services on microservices-net bridge
  Only port 80 (Nginx) exposed to host

Layer 2: Input validation
  FastAPI: Pydantic + PDF mime-type check
  NestJS:  class-validator DTOs on all inputs
  Multer:  File filter (PDF only), size limit

Layer 3: Authentication
  FirebaseAuthGuard on all protected NestJS routes
  Firebase Admin SDK verifies token server-side

Layer 4: Authorisation
  Users can only access their own data (filtered by Firebase UID)

Layer 5: File handling
  /uploads directory created with fs.mkdirSync({ recursive: true })
  Files stored with random unique names (prevents path traversal)
  Only PDF content-type accepted
```

---

## 19. Error Handling Across Services

Each service has a specific error handling strategy.

### NestJS (User Service)

```typescript
// Structured HTTP exceptions — always JSON, always consistent
throw new BadRequestException('Only PDF files are allowed');
throw new UnauthorizedException('Authorization token is missing.');
throw new HttpException('Resume parsing failed', HttpStatus.UNPROCESSABLE_ENTITY);

// All exceptions return:
// { statusCode: 422, message: "Resume parsing failed", error: "Unprocessable Entity" }
```

### FastAPI (Resume API)

```python
# HTTP exceptions with detail messages
raise HTTPException(status_code=400, detail="Only PDF files are supported.")
raise HTTPException(status_code=500, detail=f"Error processing NLP: {str(e)}")

# FastAPI automatically wraps these as:
# { "detail": "Only PDF files are supported." }
```

### Go (Scraper)

```go
// Errors are always wrapped with context and logged
if err != nil {
    log.Fatalf("Could not start Playwright: %v", err)
}

// Non-fatal errors log and continue (don't crash the whole scraper)
if err != nil {
    log.Printf("Warning: failed to scrape %s: %v", url, err)
    return  // This goroutine stops, others continue
}
```

### Node.js (Ingestion / Notification)

```javascript
// Kafka consumer errors are caught and logged
try {
    await consumer.run({ eachMessage: async ({ message }) => {
        // process message
    }});
} catch (err) {
    console.error('Consumer error:', err);
    // Service continues running
}

// REST API errors
app.get('/api/jobs', async (req, res) => {
    try {
        // ... query MongoDB
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

---

## 20. Scalability Model — How This Grows

The current architecture is designed for easy horizontal scaling.

### Kafka Consumer Scaling

```
Current setup:
  kafka broker: 1
  jobs.new topic partitions: 1
  ingestion-service replicas: 1

To scale the ingestion worker (handle more job volume):
  1. Increase topic partitions: kafka-topics.sh --alter --partitions 4
  2. Scale the service: docker compose up --scale ingestion-service=4
  3. Kafka automatically distributes the 4 partitions across 4 workers

Each worker handles 25% of the load. No code changes needed.
```

### Nginx Load Balancing

```nginx
# To scale user-service to 3 replicas, just list them:
upstream user_service {
    server user-service-1:3000;
    server user-service-2:3000;
    server user-service-3:3000;
}
# Nginx round-robins requests across all three automatically
```

### Stateless Services

All application services (NestJS, Node.js, FastAPI, Next.js) are **stateless** — they store nothing in memory between requests. All state lives in the databases. This means any replica can handle any request, and scaling is as simple as starting more containers.

---

## 21. Service Reference Card

Quick reference for every service in the platform.

| Service | Language | Image | Internal Port | Host Port | Entry Point | Primary Responsibility |
|---|---|---|---|---|---|---|
| `api-gateway` | — | `nginx:alpine` | 80 | **80** | `nginx -g daemon off` | Route all external traffic |
| `frontend-next` | TypeScript/React | Custom | 3000 | *none* | `node server.js` | Serve the web UI |
| `user-service` | TypeScript/NestJS | Custom | 3000 | *none* | `node dist/main.js` | Auth, user profiles, PostgreSQL |
| `resume-api` | Python/FastAPI | Custom | 8000 | *none* | `uvicorn main:app` | PDF parsing via REST |
| `resume-grpc` | Python/gRPC | Custom | 50051 | *none* | `python grpc_server.py` | PDF parsing via gRPC |
| `ingestion-service` | Node.js | Custom | 5000 | *none* | `node index.js` | Kafka→MongoDB + REST API |
| `scraper-service` | Go | Custom | *none* | *none* | `./scraper` | Headless browser scraping |
| `notification-service` | Node.js/Express | Custom | 4000 | *none* | `node index.js` | Kafka→Email alerts |
| `kafka` | — | `cp-kafka` | 9092 | *none* | — | Event bus (KRaft mode) |
| `job-mongo` | — | `mongo:latest` | 27017 | 27017 | — | Job listing storage |
| `user-postgres` | — | `postgres:15` | 5432 | 5433 | — | User profile storage |
| `elasticsearch` | — | `elasticsearch:8.10.2` | 9200 | 9200 | — | Future search index |
| `prometheus` | — | `prom/prometheus` | 9090 | *none* | — | Metrics collection |
| `grafana` | — | `grafana/grafana` | 3000 | 3001 | — | Metrics visualisation |

### Environment Variables Quick Reference

| Variable | Service | Value in dev | Description |
|---|---|---|---|
| `KAFKA_BROKER` | scraper, ingestion, notification | `kafka:9092` | Kafka address |
| `MONGO_URI` | ingestion | `mongodb://job-mongo:27017` | MongoDB connection |
| `DATABASE_URL` | user-service | `postgresql://admin:...@user-postgres:5432/...` | PostgreSQL connection |
| `RESUME_GRPC_URL` | user-service | `resume-grpc:50051` | gRPC server address |
| `UPLOAD_DIR` | user-service | `/uploads` | PDF storage directory |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | frontend-next | *(your Firebase key)* | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | frontend-next | *(your Firebase domain)* | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | frontend-next | *(your project ID)* | Firebase web config |

### Useful Docker Commands

```bash
# View all running containers
docker compose ps

# Stream logs from a specific service
docker compose logs -f scraper-service
docker compose logs -f ingestion-service
docker compose logs -f user-service

# Rebuild and restart a single service (after code change)
docker compose up -d --build ingestion-service

# Open a shell inside a running container
docker compose exec user-service sh
docker compose exec job-mongo mongosh

# Stop everything
docker compose down

# Stop everything AND delete all data volumes (WARNING: deletes all data)
docker compose down -v

# Check resource usage (CPU, memory per container)
docker stats

# Apply Prisma migrations manually
docker compose exec user-service npx prisma migrate deploy

# View Prisma studio (visual DB browser)
docker compose exec user-service npx prisma studio
```

### API Quick Test Reference

```bash
# Test the job feed
curl http://localhost/api/jobs

# Test search
curl "http://localhost/api/jobs?q=React&limit=5"

# Test pagination
curl "http://localhost/api/jobs?page=2&limit=10"

# Test resume parsing (Windows PowerShell)
$form = @{ file = Get-Item "C:\path\to\resume.pdf" }
Invoke-RestMethod -Uri "http://localhost/api/resume/parse" -Method POST -Form $form

# Test notification health
curl http://localhost/api/notifications/health

# Test Elasticsearch is running
curl http://localhost:9200

# Watch scraper logs live
docker compose logs -f scraper-service
```

---

## 22. Detailed File-by-File Reference

This section documents every significant source file in the monorepo, what it does, and how it fits into the larger system.

### service-scraper/ (Go)

#### `main.go`
The entry point for the scraper. Executed once when the Docker container starts.

**What it does, in order:**
1. Reads `KAFKA_BROKER` from environment (e.g. `kafka:9092`)
2. Calls `InitKafkaWriter(broker)` from `kafka.go` to create a Kafka producer
3. Wraps the writer in a `KafkaPublisher` struct (which implements `EventPublisher` interface)
4. Calls `playwright.Install()` — downloads the Chromium browser binary if not cached
5. Calls `playwright.Run()` — starts the Playwright browser manager process
6. Launches a headless Chromium browser via `pw.Chromium.Launch()`
7. Defines a hardcoded list of LinkedIn job URLs to scrape
8. Spawns one goroutine per URL using `go func(url) { scrapeAndPublish(...) }(url)`
9. Uses `sync.WaitGroup` to block until all goroutines finish
10. Closes the browser and Playwright process

```
main.go structure:
  func main()
    └─ InitKafkaWriter(broker)        → kafka.go
    └─ playwright.Install()           → downloads Chromium
    └─ playwright.Run()               → starts browser manager
    └─ for each URL:
         └─ go scrapeAndPublish()     → spawns goroutine
    └─ wg.Wait()                      → wait for all goroutines
```

#### `kafka.go`
Handles all Kafka interactions for the scraper.

**Functions:**
- `InitKafkaWriter(broker string) *kafka.Writer` — creates a Kafka writer connected to the broker
- `KafkaPublisher.Publish(key string, value []byte) error` — sends one message to Kafka

**Key decisions:**
- The `EventPublisher` interface is defined here — it allows tests to inject a mock publisher instead of a real Kafka writer
- The message key is always the job URL — this ensures consistent Kafka partition assignment

#### `models.go`
Defines the `DBJob` struct — the data shape for a scraped job.

```go
type DBJob struct {
    Title          string    `json:"title"`
    Company        string    `json:"company"`
    URL            string    `json:"url"`
    RawDescription string    `json:"raw_description"`
    ScrapedAt      time.Time `json:"scraped_at"`
}
```

Every field has a `json:` tag to control the JSON key names. This ensures the Kafka message body matches the shape expected by the ingestion service and MongoDB.

#### `scraper_test.go`
Unit tests for the scraper logic. Uses a mock `EventPublisher` to test publishing logic without needing a real Kafka server.

---

### service-ingestion/ (Node.js)

#### `index.js`
The entire ingestion service — both the Kafka consumer and the REST API — live in this single file.

**Sections of the file:**

```
Section 1: Dependencies
  require('kafkajs')          → Kafka client
  require('mongodb')          → MongoDB client
  require('express')          → HTTP server

Section 2: MongoDB setup
  MongoClient.connect(MONGO_URI)
  db = client.db('job_platform')
  jobsCollection = db.collection('jobs')

Section 3: Kafka consumer setup
  new Kafka({ brokers: [KAFKA_BROKER] })
  consumer = kafka.consumer({ groupId: 'mongo-ingestion-group' })
  consumer.subscribe({ topic: 'jobs.new', fromBeginning: true })

Section 4: Consumer loop
  consumer.run({
    eachMessage: async ({ message }) => {
      const job = JSON.parse(message.value.toString())
      await jobsCollection.updateOne(
        { url: job.url },       ← filter
        { $set: job },          ← update
        { upsert: true }        ← insert if not exists
      )
    }
  })

Section 5: Express REST API
  GET /api/jobs  → paginated + searchable job listing
  Starts HTTP server on port 5000

Section 6: Error handling
  Graceful Kafka disconnect on process termination
```

---

### service-user/ (NestJS/TypeScript)

#### `src/main.ts`
NestJS bootstrap. Starts the HTTP server on port 3000. Enables CORS for development. Initialises Firebase Admin SDK.

#### `src/app.module.ts`
Root NestJS module. Imports `UserModule`.

#### `src/user/user.module.ts`
Declares the `UserController` and `UserService`. Imports Multer configuration for file uploads.

#### `src/user/user.controller.ts`
Handles HTTP requests for the `/users` route group.

Routes defined here:
```
POST /users/sync
  @UseGuards(FirebaseAuthGuard)    ← must have valid Firebase token
  Calls: this.userService.findOrCreateUser()

POST /users/upload-resume
  @UseGuards(FirebaseAuthGuard)    ← must have valid Firebase token
  @UseInterceptors(FileInterceptor('resume'))  ← handles multipart
  Validates: PDF only, saves to /uploads
  Calls: this.userService.processUserResume()
```

#### `src/user/user.service.ts`
Business logic layer. Decoupled from HTTP — only called by controllers.

**Methods:**
- `findOrCreateUser({ id, email })` — queries PostgreSQL via Prisma, creates user+profile if not found
- `processUserResume(userId, filePath)` — calls resume-grpc service via gRPC, saves extracted skills to PostgreSQL

#### `src/auth/firebase-auth.guard.ts`
NestJS Guard that intercepts every request to a `@UseGuards(FirebaseAuthGuard)` endpoint.

**How it works:**
1. Extracts `Authorization` header
2. Strips `Bearer ` prefix
3. Calls `admin.auth().verifyIdToken(token)`
4. Attaches decoded user to `request.user`
5. Throws `UnauthorizedException` if anything fails

#### `prisma/schema.prisma`
The single source of truth for the PostgreSQL database schema. All tables, columns, types, and relationships are defined here. Run `npx prisma migrate deploy` to apply it to the database.

---

### service-resume/ (Python/FastAPI)

#### `main.py`
The FastAPI REST server. Starts with `uvicorn main:app`.

**At startup (module load time):**
1. Loads the spaCy English model: `nlp = spacy.load("en_core_web_sm")`
2. Creates a `PhraseMatcher` instance
3. Converts all strings in `TECH_SKILLS` list to spaCy Doc patterns
4. Adds all patterns to the matcher under the label `"SKILLS"`

**Request handler (`POST /parse`):**
1. Validates content type is `application/pdf`
2. Reads all bytes from the uploaded file
3. Wraps in `io.BytesIO` stream
4. Creates `PdfReader` from stream
5. Extracts text from each page, joining with spaces
6. Passes text to `extract_skills_from_text()`
7. Returns `{ filename, status, extracted_skills[] }`

#### `grpc_server.py`
The gRPC server. Starts on port 50051. Listens for `ParseResume` RPC calls from the NestJS User Service.

**On receiving a `ParseRequest`:**
1. Reads `file_path` from the request (a file path inside the container)
2. Opens and reads the PDF file from that path
3. Runs the same skill extraction pipeline as `main.py`
4. Returns a `ParseResponse` with `skills[]` and `confidence_score`

#### `resume_pb2.py` and `resume_pb2_grpc.py`
Auto-generated files. **Do not edit manually.** These are regenerated from `shared-protos/resume.proto` whenever the proto file changes, using the command:

```bash
python -m grpc_tools.protoc \
    -I ../shared-protos \
    --python_out=. \
    --grpc_python_out=. \
    ../shared-protos/resume.proto
```

#### `requirements.txt`
Lists all Python dependencies. Installed during Docker image build.

```
fastapi          → Web framework
uvicorn          → ASGI server
PyPDF2           → PDF text extraction
spacy            → NLP library
grpcio           → gRPC runtime
grpcio-tools     → gRPC code generation
protobuf         → Protocol Buffers
```

---

### service-notification/ (Node.js)

#### `index.js`
The entire notification service. Combines a Kafka consumer and a minimal Express server.

**Kafka consumer section:**
- Subscribes to `jobs.new` with group `email-notification-group`
- On each message: extracts job data, checks for skill matches, sends email
- Uses `connectWithRetry()` to handle Kafka boot delays

**Express section:**
- `GET /health` — returns `{ status: "Notification Service is running." }`
- Required by Nginx configuration and Docker health checks

**Email section:**
- Uses `nodemailer.createTestAccount()` in development (Ethereal)
- In production: swap for SendGrid, Mailgun, or AWS SES transporter

---

### nginx/nginx.conf

The complete API gateway configuration. This file is volume-mounted into the Nginx container at runtime, so changes take effect after `docker compose restart api-gateway`.

**Structure:**
```
events { }         ← Connection settings

http {
    upstream user_service        { server user-service:3000; }
    upstream ingestion_service   { server ingestion-service:5000; }
    upstream resume_api          { server resume-api:8000; }
    upstream notification_service{ server notification-service:4000; }
    upstream frontend            { server frontend-next:3000; }

    server {
        listen 80;

        location /api/users/        { proxy_pass http://user_service/; }
        location /api/jobs          { proxy_pass http://ingestion_service/api/jobs; }
        location /api/resume/       { proxy_pass http://resume_api/; }
        location /api/notifications/{ proxy_pass http://notification_service/; }
        location /                  { proxy_pass http://frontend/; }
    }
}
```

**Important proxy settings applied globally:**
```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
```

These headers pass the original client IP to the backend services so they can log real client addresses instead of the Nginx container's IP.

---

### frontend-next/ (Next.js)

#### `app/page.tsx`
The root page rendered at `http://localhost/`. A React Server Component that lays out the two-column design:
- Left column: `<ResumeUpload />` component
- Right column: `<JobSearch />` component

#### `app/layout.tsx`
Root layout for the entire application. Sets:
- HTML `<title>` and `<meta>` description for SEO
- Global font (loaded via `next/font`)
- `<body>` wrapper with global CSS class

#### `components/ResumeUpload.tsx`
Client component (`'use client'`). Handles the entire resume upload UX:
- Drag-and-drop file selection
- PDF validation
- `fetch('/api/resume/parse')` with FormData
- Renders extracted skills as badge tags

#### `components/JobSearch.tsx`
Client component (`'use client'`). Handles the job feed:
- Auto-fetches on mount via `useEffect`
- Text search with `?q=` parameter
- Renders job cards with "View & Apply" links

#### `lib/firebase.ts`
Initialises the Firebase app exactly once using `getApps().length` check to prevent re-initialisation during hot reloads. Exports the `auth` object used by components for login.

#### `Dockerfile`
Multi-stage build:
- **builder** stage: installs all deps, runs `npm run build` (Next.js production build)
- **runner** stage: copies only the `.next/standalone` output and static files, making a minimal production image

---

## 23. Common Tasks and How to Do Them

This section shows how to perform the most common development tasks you'll encounter while working on this project.

### Add a New API Endpoint to the Ingestion Service

1. Open `service-ingestion/index.js`
2. Add a new route:
   ```javascript
   app.get('/api/jobs/:id', async (req, res) => {
       try {
           const { ObjectId } = require('mongodb');
           const job = await jobsCollection.findOne({ _id: new ObjectId(req.params.id) });
           if (!job) return res.status(404).json({ error: 'Job not found' });
           res.json(job);
       } catch (err) {
           res.status(500).json({ error: 'Internal server error' });
       }
   });
   ```
3. Add the route to Nginx if it uses a new path prefix
4. Rebuild: `docker compose up -d --build ingestion-service`
5. Test: `curl http://localhost/api/jobs/<mongo-id>`

---

### Add a New Skill to the Resume Parser

1. Open `service-resume/main.py`
2. Find the `TECH_SKILLS` list
3. Add your skill string exactly as you want it to appear in the output:
   ```python
   TECH_SKILLS = [
       # ... existing skills ...
       "TypeScript",    # ← Add your new skill here
       "AWS",
       "Redis",
   ]
   ```
4. The `CANONICAL_SKILLS` dict is built automatically from the list
5. Rebuild: `docker compose up -d --build resume-api resume-grpc`
6. Test: Upload a PDF that mentions your new skill

---

### Add a New Protected Route to the User Service

1. Open `service-user/src/user/user.controller.ts`
2. Add your endpoint with the guard:
   ```typescript
   @Get('profile')
   @UseGuards(FirebaseAuthGuard)
   async getProfile(@Req() request: any) {
       const userId = request.user.uid;
       return this.userService.getProfile(userId);
   }
   ```
3. Add the business logic to `user.service.ts`
4. Add a Prisma query if you need DB access
5. Rebuild: `docker compose up -d --build user-service`
6. Test with a valid Firebase token in the `Authorization` header

---

### Add a New Kafka Topic

1. Add the topic creation to the Kafka environment in `docker-compose.yml`:
   ```yaml
   kafka:
     environment:
       KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
       KAFKA_CREATE_TOPICS: "jobs.new:1:1,users.registered:1:1"
   ```
2. The scraper publishes to it:
   ```go
   writer := kafka.NewWriter(kafka.WriterConfig{
       Brokers: []string{broker},
       Topic:   "users.registered",  // ← new topic
   })
   ```
3. A consumer subscribes to it:
   ```javascript
   await consumer.subscribe({ topic: 'users.registered', fromBeginning: true });
   ```

---

### Change the Nginx Routing

1. Open `nginx/nginx.conf`
2. Add or modify a `location` block:
   ```nginx
   location /api/analytics/ {
       proxy_pass http://analytics_service/;
   }
   ```
3. Add the upstream at the top:
   ```nginx
   upstream analytics_service {
       server analytics-service:6000;
   }
   ```
4. Restart just Nginx (no rebuild needed): `docker compose restart api-gateway`

---

### Run the Database Schema Migration

If you change `service-user/prisma/schema.prisma`:

```bash
# 1. Generate a new migration file (creates SQL migration)
docker compose exec user-service npx prisma migrate dev --name "add_location_to_profile"

# 2. This automatically applies it to the running database

# 3. Regenerate Prisma client types (auto-done by migrate dev)
docker compose exec user-service npx prisma generate

# For production deployments (no interactive prompt):
docker compose exec user-service npx prisma migrate deploy
```

---

### Inspect MongoDB Directly

```bash
# Open a MongoDB shell inside the container
docker compose exec job-mongo mongosh

# Once inside:
use job_platform
db.jobs.find().limit(5).pretty()
db.jobs.countDocuments()
db.jobs.find({ title: /React/i }).count()
db.jobs.deleteMany({})   # WARNING: clears all jobs
```

---

### Inspect PostgreSQL Directly

```bash
# Open a psql shell inside the container
docker compose exec user-postgres psql -U admin -d job_aggregator_users

# Once inside:
\dt                        # List all tables
SELECT * FROM "User";      # View all users
SELECT * FROM "Profile";   # View all profiles
\q                         # Quit
```

### Inspect Kafka Topics

```bash
# List all topics
docker compose exec kafka kafka-topics.sh \
    --bootstrap-server localhost:9092 \
    --list

# View messages in the jobs.new topic (latest 10)
docker compose exec kafka kafka-console-consumer.sh \
    --bootstrap-server localhost:9092 \
    --topic jobs.new \
    --from-beginning \
    --max-messages 10

# Check consumer group lag
docker compose exec kafka kafka-consumer-groups.sh \
    --bootstrap-server localhost:9092 \
    --describe \
    --group mongo-ingestion-group
```

---

## 24. Troubleshooting Common Issues

### Issue: "Service not found" on http://localhost

**Cause:** Nginx started before the frontend container was ready.  
**Fix:** `docker compose restart api-gateway`

---

### Issue: Job feed is empty

**Possible causes and fixes:**

1. **Scraper hasn't run yet** — check scraper logs:
   ```bash
   docker compose logs scraper-service
   ```
   If you see "Could not launch browser", the Playwright install may have failed. Rebuild: `docker compose up -d --build scraper-service`

2. **MongoDB is empty** — the scraper targets placeholder LinkedIn URLs which require authentication. Add real publicly accessible URLs to the `jobURLs` list in `service-scraper/main.go`.

3. **Ingestion service not consuming** — check logs:
   ```bash
   docker compose logs ingestion-service
   ```
   Look for "Connected to Kafka" and "Connected to MongoDB". If absent, the service may have started before Kafka was ready.

---

### Issue: Resume parsing returns empty skills

**Cause:** The PDF may contain scanned images (no selectable text) or the skills in the resume do not match any entry in `TECH_SKILLS`.  
**Fix:**
1. Try a PDF with clearly typed text (not a scanned document)
2. Add more skills to the `TECH_SKILLS` list in `service-resume/main.py`
3. Check the resume API logs: `docker compose logs resume-api`

---

### Issue: `docker compose up` fails with "port already in use"

**Cause:** Another process is using port 80 (common: IIS, another Nginx, or another Docker project).  
**Fix:**
```powershell
# Find what's using port 80
netstat -ano | findstr :80
# Kill it by PID, or change the port in docker-compose.yml:
ports:
  - "8080:80"    # ← Change host port to 8080
```

---

### Issue: Kafka consumer lag is growing

**Cause:** The ingestion or notification service is consuming messages slower than the scraper produces them.  
**Fix:** Scale the consumer:
```bash
docker compose up --scale ingestion-service=3
```
Ensure the `jobs.new` topic has enough partitions for all replicas (at least 3 partitions for 3 replicas).

---

### Issue: Prisma migration fails

**Cause:** The database schema has a conflict or the database is not reachable.  
**Fix:**
```bash
# Check the user-service logs for the exact error
docker compose logs user-service

# Ensure postgres is healthy
docker compose ps user-postgres

# Reset the database (WARNING: deletes all data)
docker compose exec user-postgres psql -U admin -c "DROP DATABASE job_aggregator_users;"
docker compose exec user-postgres psql -U admin -c "CREATE DATABASE job_aggregator_users;"
docker compose exec user-service npx prisma migrate deploy
```

---

## 25. Planned Features and Extension Points

This section documents planned features and how they would integrate with the existing architecture.

### Elasticsearch Indexer Worker (Phase 21)

A new Node.js consumer that subscribes to `jobs.new` and indexes each job into Elasticsearch.

```
Future service: service-es-indexer/

Kafka consumer group: elasticsearch-indexer-group
Subscribes to: jobs.new

For each message:
  1. Parse job JSON
  2. POST to Elasticsearch index "jobs"
     PUT /jobs/_doc/<url-hash>
     { title, company, description, scraped_at }
  3. Commit Kafka offset
```

The `GET /api/jobs?q=` endpoint would then query Elasticsearch instead of MongoDB, enabling:
- Fuzzy matching (typo-tolerant search)
- Relevance scoring
- Highlight matching terms in results
- Field boosting (title matches score higher than description matches)

### Job-to-Profile Matching Algorithm

A background worker that runs when a user's profile is updated (new skills extracted from resume). It queries MongoDB for jobs whose description contains any of the user's skills, and returns a ranked list.

```
Trigger: User uploads resume → skills extracted → profile updated
         │
         ▼
MatchingWorker runs:
  1. Fetch user's extractedSkills[] from PostgreSQL
  2. Query MongoDB: { raw_description: { $regex: skill, $options: 'i' } }
     for each skill in extractedSkills
  3. Score each job: count how many user skills appear in the description
  4. Sort by score (highest first)
  5. Store top 20 matches in user's profile
  6. Publish "match.found" event to Kafka → triggers Notification Service
```

### Angular Admin Dashboard (Phase 22)

A separate frontend for internal admins. Would be served at `http://localhost/admin` via a new Nginx location block.

**Features planned:**
- Total jobs scraped (chart over time)
- Total users registered
- Resume parsing success rate
- Kafka consumer group lag monitoring
- Manual trigger to re-run the scraper

### Production Deployment (Phase 23)

The Docker Compose setup maps 1:1 to cloud deployment options:

```
Option A: AWS ECS (Elastic Container Service)
  Each docker-compose service → one ECS Task Definition
  Shared network → ECS Service Discovery
  Volumes → EFS (Elastic File System) or RDS/MongoDB Atlas
  Port 80 → Application Load Balancer

Option B: Railway
  Each service → one Railway service
  docker-compose.yml → railway.toml
  Managed PostgreSQL and MongoDB add-ons available

Option C: Render
  Each service → one Render web service or background worker
  Managed PostgreSQL, Redis available
  Free tier available for testing
```

---

*This document is the definitive guide to how the Job Aggregator Platform works. For contributing guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md). For a high-level project overview, see [README.md](./README.md).*


# Job Aggregator Platform

Phase 1: System Design & Repository Setup

## Repository Structure

This repository uses a Polyrepo approach with an overarching Docker Compose file for local development.

- `frontend-next/`: User-facing portal (Next.js)
- `frontend-admin/`: Internal dashboard (Angular)
- `service-user/`: Auth & Profile (NestJS/PostgreSQL)
- `service-scraper/`: LinkedIn Crawler (Go)
- `service-resume/`: AI Parsing (FastAPI)
- `service-notification/`: Email alerts (Express)

## Database Schema Design

We use two different databases suited for different purposes:

### 1. PostgreSQL (Relational) - User Service
Used for user data (passwords, emails, roles, subscription status) which is highly structured and requires strict ACID compliance.

**Core Entities (v1):**
- **User**: `id`, `email`, `password_hash`, `role`, `subscription_status`, `created_at`, `updated_at`
- **Profile**: `user_id`, `first_name`, `last_name`, `resume_url`, `skills`

### 2. MongoDB (NoSQL) - Job Catalog
Used for job descriptions scraped from the web. Job data is unstructured (some have salary ranges, some have arrays of benefits, some just text blobs). A document database handles this lack of strict structure perfectly.

**Core Entities (v1):**
- **Job**: `_id`, `title`, `company`, `location`, `description`, `salary_range` (optional), `benefits` (array, optional), `source_url`, `scraped_at`

## API Contracts (The Boundaries)

Microservices communicate with each other like third-party APIs.

### Contract A: Frontend saving a parsed resume (RESTful)
- **Route**: `POST /api/users/profile/resume` (Routed through Nginx to the NestJS service).
- **Action**: NestJS receives the PDF, securely saves it to a cloud bucket (like AWS S3 or a local Docker volume for now), and gets a URL.
- **Next Step**: NestJS must now ask the FastAPI service to parse it.

### Contract B: NestJS asking FastAPI for skills (gRPC)
gRPC is used here for synchronous, low-latency response since the user is waiting on the frontend.
- **Request (Protobuf)**: Send `resume_url`.
- **Response (Protobuf)**: Receive `["React", "Node.js", "Docker"]` and confidence scores.

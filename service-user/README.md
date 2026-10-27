# NestJS Identity & Profile API (`service-user`)

The central candidate identity, profile management, and account data service for the Seekers platform, built with NestJS and Prisma ORM.

> **Role in Seekers Platform:** Authoritative owner of candidate accounts and relational user profiles in PostgreSQL. Validates Firebase identity tokens, persists candidate skills and profile preferences, and dispatches uploaded resumes to `service-resume` over gRPC.

---

## 1. Primary Technology Stack

- **Framework:** NestJS 11 (Modular architecture: Controllers, Services, Guards)
- **Language:** TypeScript 5.7 (current compiler settings do not enable every strict check)
- **Database & ORM:** PostgreSQL 15 with Prisma ORM 5.x
- **Authentication:** Firebase Admin SDK (`FirebaseAuthGuard`)
- **Inter-Service RPC:** `@grpc/grpc-js` and `@grpc/proto-loader`
- **Testing:** Jest, ts-jest, supertest

---

## 2. Architecture & Interfaces

The service serves authenticated HTTP endpoints and communicates with backend services:

```
               +--------------------------------------+
               |  Next.js Candidate Frontend          |
               +-------------------+------------------+
                                   | (Bearer JWT)
                                   v
               +--------------------------------------+
               |  API Gateway (Nginx :80)             |
               +-------------------+------------------+
                                   |
                                   v
               +--------------------------------------+
               |  service-user (NestJS :3000)         |
               |  - FirebaseAuthGuard (JWT verify)    |
               |  - UserController (Profiles & Sync)  |
               +---------+------------------+---------+
                         |                  |
                         v                  v
                 +---------------+  +------------------+
                 | PostgreSQL 15 |  | service-resume   |
                 | (Prisma ORM)  |  | (gRPC :50051)    |
                 +---------------+  +------------------+
```

### Endpoints

| Method | Route | Description | Auth Required |
|---|---|---|---|
| `POST` | `/users/sync` | Candidate upsert after Firebase login | Yes (Bearer JWT) |
| `POST` | `/users/upload-resume` | Upload PDF resume, forward to gRPC parser, save skills | Yes (Bearer JWT) |

Nginx exposes these routes under `/api/users/`. Profile read/edit endpoints are planned for P05 and are not implemented yet.

---

## 3. Current Capabilities & Baseline Status

- **Unit Testing (`npm test`):** `[Verified locally]` — 1 mocked `UserService` unit test passes. Linux CI fails earlier during `npm ci`; P02 must repair the lockfile before claiming a clean CI pass.
- **Type Checking (`npx tsc --noEmit`):** `[Verified]` — zero TypeScript compilation errors.
- **Prisma Client (`npx prisma generate`):** `[Verified]` — generates typed client from `schema.prisma`.
- **Linting (`npm run lint`):** `[Observed-but-unverified]` — 59 errors and 3 warnings recorded for remediation in Phase P02.
- **Known Limitations:**
  - Prisma migration history (`prisma/migrations`) was previously uncommitted; baseline migration to be established in P02.
  - Resume upload relies on a shared host filesystem volume (`/uploads`) rather than cloud object storage.
  - Authentication requires either live Google credentials or local Firebase emulator configuration.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x
- npm 10.x+
- PostgreSQL 15 (standalone or via Docker)

### Installation

```bash
cd service-user
npm install
npx prisma generate
```

### Configuration

Copy the example configuration:
```bash
cp .env.example .env
```
Key configuration settings (see `.env.example`):
- `DATABASE_URL`: PostgreSQL connection string (default: `postgresql://admin:password123@localhost:5433/job_aggregator_users?schema=public`)
- `RESUME_GRPC_URL`: Address of gRPC resume parser (default: `localhost:50051`)
- `FIREBASE_AUTH_EMULATOR_HOST`: Set to `localhost:9099` for local emulator authentication

### Running the Service

```bash
# Start in development watch mode:
npm run start:dev

# Start in production mode:
npm run start:prod
```

### Running Tests

```bash
# Run unit tests:
npm test

# Run e2e tests:
npm run test:e2e
```

---

## 5. Planned Standalone Demonstration (Phase P05)

In Phase P05, this NestJS service will feature an independent API demonstration:
- **Local Emulator Quickstart:** One-command startup with its own PostgreSQL container and Firebase Auth emulator.
- **Interactive OpenAPI Specification:** Swagger UI exposing all endpoints with sample request/response payloads.
- **Mock gRPC Adapter:** Allows resume upload and skill extraction testing without operating the Python container.

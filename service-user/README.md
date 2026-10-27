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
| `POST` | `/users/sync` | Idempotent candidate sync after Firebase login | Yes (Bearer JWT) |
| `GET` | `/users/profile` | Retrieve candidate profile and onboarding state | Yes (Bearer JWT) |
| `PUT` | `/users/profile` | Update profile, skills, preferences, and onboarding step | Yes (Bearer JWT) |
| `POST` | `/users/account/export` | Request full account data export archive | Yes (Bearer JWT) |
| `POST` | `/users/account/delete` | Request account erasure with 30-day grace period | Yes (Bearer JWT, `confirmText: "DELETE_MY_ACCOUNT"`) |
| `GET` | `/users/account/status` | Retrieve lifecycle status of deletion/export requests | Yes (Bearer JWT) |
| `GET` | `/users/admin/test-privileged` | Role-enforced endpoint requiring admin permissions | Yes (`ADMIN` role via `RolesGuard`) |
| `POST` | `/users/upload-resume` | Upload PDF resume, forward to gRPC parser, save skills | Yes (Bearer JWT) |

Nginx exposes these routes under `/api/users/` (or directly via `/users/` when accessed standalone).

---

## 3. Current Capabilities & Baseline Status

- **Unit Testing (`npm test`):** `[Verified locally]` — 25 unit tests pass (Guards, Controllers, Repositories, Services).
- **Standalone Smoke Testing (`npm run test:smoke`):** `[Verified locally]` — Full integration suite against real PostgreSQL and Firebase Auth Emulator:
  - Unauthenticated access rejection (401 Unauthorized)
  - Real emulator JWT generation & verification
  - Idempotent candidate user synchronization (`POST /users/sync`)
  - Profile read and persistent update (`GET/PUT /users/profile`)
  - Cross-user data isolation (User B cannot read/write User A's profile)
  - Server-enforced role boundary rejection (403 Forbidden for candidate on admin route)
  - Data export request registration (`POST /users/account/export`)
  - Scheduled account deletion with 30-day grace period (`POST /users/account/delete`)
- **Type Checking (`npx tsc --noEmit`):** `[Verified]` — zero TypeScript compilation errors.
- **Prisma Client (`npx prisma generate`):** `[Verified]` — Prisma Client v5.22.0.
- **Database Migrations (`npx prisma migrate deploy`):** `[Verified]` — Clean forward migration history (`20261027000000_init`, `20261027100000_p05_identity_and_profiles`).
- **Known Limitations:**
  - Resume upload relies on a shared host filesystem volume (`/uploads`) rather than cloud object storage (S3/GCS planned for P07).
  - Background asynchronous worker for export archive bundling and hard deletion execution runs asynchronously on scheduled intervals (P06+).

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x
- npm 10.x+
- PostgreSQL 15 (standalone or via Docker port 5433)
- Firebase CLI (`firebase-tools` for running the local Auth emulator)

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
- `GCP_PROJECT_ID`: Firebase project ID (default: `seekers-dev`)

### Database Migrations

Apply Prisma migrations against the active database:
```bash
npm run prisma:migrate
```

### Running the Service

```bash
# Start in development watch mode:
npm run start:dev

# Start in production mode:
npm run start:prod
```

### Running Tests

```bash
# Run unit test suite:
npm test

# Run standalone integration smoke test (requires PostgreSQL & Firebase Emulator):
npm run test:smoke
```

---

## 5. Standalone Quickstart (Phase P05 Verified)

Run `service-user` completely independently without needing other microservices:

1. **Start PostgreSQL:**
   ```bash
   docker compose up -d user-postgres
   ```
2. **Start Firebase Auth Emulator:**
   ```bash
   npx firebase emulators:start --only auth
   ```
3. **Start NestJS Service:**
   ```bash
   npm run start:dev
   ```
4. **Run Smoke Test Suite:**
   ```bash
   npm run test:smoke
   ```

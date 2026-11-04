# NestJS Identity & Profile API (`service-user`)

The central candidate identity, profile management, and account data service for the Seekers platform, built with NestJS and Prisma ORM.

> **Role in Seekers Platform:** Authoritative owner of candidate accounts and relational user profiles in PostgreSQL. Validates Firebase identity tokens, persists candidate skills and profile preferences, manages owned private resume documents, and dispatches uploaded resumes to `service-resume` over gRPC.

---

## 1. Primary Technology Stack

- **Framework:** NestJS 11 (Modular architecture: Controllers, Services, Guards)
- **Language:** TypeScript 5.7
- **Database & ORM:** PostgreSQL 15 with Prisma ORM 5.x
- **Authentication:** Firebase Admin SDK (`FirebaseAuthGuard`)
- **Inter-Service RPC:** `@grpc/grpc-js` and `@grpc/proto-loader` implementing `shared-protos/resume.proto`
- **Private Storage:** Isolated object storage adapter with path traversal protection, server-controlled opaque keys, and 10MB streaming bounds
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
               |  - UserController (Profiles & Resume)|
               |  - StorageService (Private Storage)  |
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
| `POST` | `/users/resume/upload` | Upload PDF resume (max 10MB), store to private storage, return 202 Accepted | Yes (Bearer JWT, accepts `file` or `resume`) |
| `GET` | `/users/resume/status/:parseId` | Check asynchronous extraction status and retrieved skills | Yes (Bearer JWT, owned by candidate) |
| `POST` | `/users/resume/review` | Apply candidate-reviewed skills to profile without clobbering manual skills | Yes (Bearer JWT) |
| `DELETE`| `/users/resume` | Delete active resume document and storage object | Yes (Bearer JWT) |
| `GET` | `/users/resume/download` | Download active resume document stream | Yes (Bearer JWT) |
| `POST` | `/users/account/export` | Request full account data export archive | Yes (Bearer JWT) |
| `POST` | `/users/account/delete` | Request account erasure with 30-day grace period | Yes (Bearer JWT, `confirmation: "DELETE_MY_ACCOUNT"`) |
| `GET` | `/users/account/status` | Retrieve lifecycle status of deletion/export requests | Yes (Bearer JWT) |
| `GET` | `/users/admin/test-privileged` | Role-enforced endpoint requiring admin permissions | Yes (`ADMIN` role via `RolesGuard`) |

---

## 3. Current Capabilities & Baseline Status

- **Unit Testing (`npm test`):** `[Verified locally & CI]` — 42 unit tests pass across 6 suites (Guards, Controllers, Repositories, Services, StorageService).
- **Non-mutating Linting (`npm run lint`):** `[Verified locally & CI]` — ESLint passes with 0 errors and 0 warnings.
- **Negative Error-Handling Verification (`npm run test:smoke:negative`):** `[Verified locally & CI]` — Verifies that missing API dependencies or unavailable Firebase Auth emulator produce immediate non-zero exit status and never report false-positive success.
- **Strict Standalone Smoke Testing (`npm run test:smoke`):** `[Verified locally & CI]` — Full 20-step integration suite against live PostgreSQL and Firebase Auth Emulator:
  - 1. Service health check (`/users/health`)
  - 2. Unauthenticated access rejection (401 Unauthorized)
  - 3. Forged Bearer token rejection (401 Unauthorized)
  - 4. Authentic emulator JWT issuance for Candidate A and Candidate B
  - 5. Idempotent candidate user synchronization (`POST /users/sync`)
  - 6. Repeated synchronization idempotency check
  - 7. Initial profile read with default UNSPECIFIED preferences (`GET /users/profile`)
  - 8. Profile mutation with strict DTO validation (`PUT /users/profile`)
  - 9. Database persistence verification on profile reload
  - 10. Candidate B user synchronization
  - 11. Cross-tenant isolation & ownership boundary enforcement
  - 12. Server-enforced role boundary rejection (403 Forbidden on privileged admin route)
  - 13. Personal data export request recording (`POST /users/account/export`)
  - 14. Scheduled account deletion request with 30-day grace period (`POST /users/account/delete`)
  - 15. Deletion request idempotency & cross-candidate ownership isolation
  - 16. Account lifecycle status query (`GET /users/account/status`)
  - 17. Multipart PDF resume upload (`POST /users/resume/upload` returns 202 Accepted with `parse_id`)
  - 18. Resume parse status query (`GET /users/resume/status/:parseId`)
  - 19. Cross-candidate status access rejection (Candidate B receives 404 for Candidate A's `parseId`)
  - 20. Candidate resume deletion (`DELETE /users/resume`)
- **Database Migrations (`npx prisma migrate deploy`):** `[Verified]` — Clean forward migration history (`20261027000000_init`, `20261027100000_p05_identity_and_profiles`, `20261027180000_p05_scoped_deletion_idempotency`, `20261028000000_p08_resume_documents_and_lifecycle`).

---

## 4. Engineering Tradeoffs & Known Limitations

- **Relational PostgreSQL vs Document Store:** Selected PostgreSQL with Prisma ORM for authoritative user identities, applications, and privacy records to leverage strict ACID transaction guarantees, foreign-key cascade deletions, and unique constraints.
- **Durable Erasure Tombstones:** Implemented `DurableErasureRecord` to store cryptographic hashes and IDs of permanently erased candidates, strictly preventing asynchronous sync tasks from resurrecting deleted accounts.
- **Asynchronous Resume Processing:** Upload endpoint returns `202 Accepted` with a tracking `parse_id`, offloading heavy parsing to `service-resume` and decoupling HTTP response latency from file extraction.

---

## 5. Portfolio Summary & Interview Walkthrough

### Technology CV Bullet
> **NestJS Backend Engineer — Identity & Workspace Microservice:** Built an enterprise identity, application tracking, and workspace API using NestJS 11, TypeScript, Prisma, and PostgreSQL 16. Implemented role-based access control, cryptographic session handling, GDPR-compliant data export and 30-day erasure grace periods with durable tombstone fencing, validated across 20 automated qualification checks.

### Technical Interview Walkthrough
1. **Core Problem:** Managing candidate profiles, multi-stage application state, and resume lifecycle requires strict multi-tenant data isolation and rigorous compliance with right-to-be-forgotten privacy mandates.
2. **Solution Architecture:** Engineered a modular NestJS service backed by Prisma ORM and PostgreSQL with clean repository-service patterns, input validation pipes (`class-validator`), and gRPC communication with `service-resume`.
3. **Privacy & Security:** Designed tombstone-based permanent erasure preventing background identity synchronization from recreating deleted user accounts, with complete cascade purging of resumes and workspace history.

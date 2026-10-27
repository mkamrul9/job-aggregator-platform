# Phase 8: Authentication (Firebase & NestJS Integration)

## Overview
In this phase, we established a secure authentication flow by combining Firebase Authentication with our local PostgreSQL database. Firebase handles the complexities of secure password hashing, reset emails, and session tokens, issuing a secure JSON Web Token (JWT). Our NestJS backend simply verifies that JWT.

If the JWT is valid, we synchronize the user's Firebase UID into our local PostgreSQL database. This allows us to safely attach application-specific relational data—such as roles and resume profiles—to the user.

## Implementation Details

1. **Firebase Admin SDK:**
   Installed `firebase-admin` into the `service-user` module and downgraded `@prisma/client` to `v5.21.0` to maintain compatibility with standard schema configurations.

2. **Firebase Auth Guard (`src/auth/firebase-auth.guard.ts`):**
   Created a custom NestJS Guard to intercept incoming HTTP requests. The Guard:
   - Extracts the Bearer token from the `Authorization` header.
   - Uses the Firebase Admin SDK (`getAuth().verifyIdToken()`) to securely validate the JWT.
   - Attaches the decoded user payload to the request object or throws an `UnauthorizedException` if invalid.

3. **Prisma User Service (`src/user/user.service.ts`):**
   Engineered an `upsert` mechanism that safely checks if a user exists in the PostgreSQL database via Prisma. 
   - If the user (by Firebase UID) already exists, it does nothing.
   - If they are new, it seamlessly creates a new row with their Firebase UID as the primary key.

4. **User Sync Controller (`src/user/user.controller.ts`):**
   Exposed a `POST /users/sync` REST endpoint protected by the `@UseGuards(FirebaseAuthGuard)` decorator. Frontend clients will call this endpoint immediately after a successful Firebase login to ensure their data is synchronized with the backend.

## Future Integration Note
Currently, the Nginx API Gateway routing for `/api/users/` returns a `501 Not Implemented` response. Once the `service-user` is containerized within `docker-compose.yml`, the Nginx configuration can be updated to seamlessly `proxy_pass` traffic to the NestJS container.

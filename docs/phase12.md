# Phase 12: Containerizing Core Services (NestJS & FastAPI)

## Overview
In this phase, we brought the new User Service and Resume Service into the Docker ecosystem. These services now live on the same virtual network (`microservices-net`) as the Nginx API Gateway and PostgreSQL database, allowing them to securely communicate over gRPC and internal HTTP.

## Implementation Details

1. **FastAPI Dockerfile (`service-resume/Dockerfile`):**
   - Created a Python environment using `python:3.11-slim`.
   - Installed system dependencies (gcc, g++) and Python packages via `requirements.txt`.
   - Downloaded the spaCy NLP model (`en_core_web_sm`).
   - Exposed ports 8000 (REST API) and 50051 (gRPC).
   - Configured the startup command to launch both `uvicorn` and the `grpc_server.py` script.

2. **NestJS Dockerfile (`service-user/Dockerfile`):**
   - Implemented a multi-stage Docker build using `node:20-alpine`.
   - Stage 1 (Builder): Installed dependencies, generated the Prisma client specifically for the Alpine Linux environment, and compiled the NestJS application.
   - Stage 2 (Production runtime): Copied the compiled code, dependencies, and generated Prisma client from the builder stage, and exposed port 3000.
   - Configured the startup command to run the production build (`npm run start:prod`).

3. **Docker Compose Integration (`docker-compose.yml`):**
   - Added `user-service` to the Docker Compose configuration, connecting it to the `microservices-net` network.
   - Configured environment variables for `user-service`, pointing `DATABASE_URL` to the `user-postgres` container and `RESUME_GRPC_URL` to the internal `resume-service:50051` address.
   - Added `resume-service` to the configuration, connecting it to the same network.

4. **Automating Prisma Migrations (`deploy-local.sh`):**
   - Updated the local deployment script to automatically run the Prisma database push command (`npx prisma db push`) within the `user-service` container after a brief sleep to ensure the database container is fully initialized.

## Next Steps
With the core backend services containerized and communicating seamlessly over the internal network, our microservices architecture is solidifying. We will continue to build out the frontend components and complete the job matching algorithm to tie the entire platform together.

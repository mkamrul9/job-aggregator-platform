# Phase 25: Frontend Dockerization

## Overview
To conclude Module 4 and ensure environmental parity across the entire ecosystem, we containerized the Next.js Candidate Portal and the Angular Admin Dashboard. Both applications were integrated into the `microservices-net` Docker network, allowing them to boot synchronously with the backend infrastructure.

## Implementation Details

### Next.js (`frontend-next`) Containerization
- **Standalone Output**: We updated `next.config.ts` with `output: 'standalone'`. This leverages Next.js's built-in build tracing to strip away unused dependencies, drastically reducing the final image size.
- **Multi-stage Dockerfile**:
  - **Stage 1 (Builder)**: Uses `node:20-alpine` to install dependencies via `npm ci` and compile the React application.
  - **Stage 2 (Runner)**: A clean `node:20-alpine` environment. Only the `.next/standalone` output, `.next/static` files, and `public` assets are copied over. The server exposes port 3000 internally.

### Angular (`frontend-admin`) Containerization
- **Static Nginx Serving**: Because Angular compiles to pure HTML/CSS/JS (a Single Page Application), it does not require Node.js at runtime.
- **Multi-stage Dockerfile**:
  - **Stage 1 (Builder)**: Uses `node:20-alpine` to execute `ng build --configuration=production`, generating optimized static assets in `/dist/frontend-admin/browser`.
  - **Stage 2 (Runner)**: Uses `nginx:alpine` to serve those static files.
- **Client-Side Routing**: We created `nginx.conf` containing `try_files $uri $uri/ /index.html;`. This instructs Nginx to redirect 404s back to `index.html`, allowing Angular's router to take control of deep links instead of failing.

### Docker Compose Integration
- Added both services to the root `docker-compose.yml`.
- `frontend-next` is mapped to host port `3001` (to prevent conflict with NestJS on 3000) and depends on `api-gateway`.
- `frontend-admin` is mapped to host port `4200` (bridging the internal Nginx port 80) and depends on `notification-service`.

## Ecosystem Architecture Complete
With this final step, executing `./deploy-local.sh` now orchestrates 9 discrete containers:
1. **API Gateway** (Nginx)
2. **Scraper** (Golang)
3. **Event Bus** (Kafka KRaft)
4. **Data Ingestion** (Node.js)
5. **NoSQL Store** (MongoDB)
6. **User/Match DB** (PostgreSQL)
7. **AI Parsing** (Python FastAPI)
8. **Real-time Notifications** (Express + WebSockets)
9. **Search Engine** (Elasticsearch)
10. **Candidate Portal** (Next.js)
11. **Admin Dashboard** (Angular)

# Phase 2: The API Gateway (Nginx)

## What We Did
- Introduced an **API Gateway** using an `nginx:alpine` container.
- Updated `docker-compose.yml` to include the `api-gateway` service and a custom bridge network `microservices-net`.
- Configured Nginx (`nginx/nginx.conf`) as a reverse proxy, setting up upstream routing for the User Service and Resume Service.

## Why We Did It
Exposing every individual microservice directly (e.g., ports 3000, 4000, 8000) causes CORS nightmares, exposes internal network topology, and complicates client-side development. 

## Benefits
- **Single Entry Point**: Frontends only talk to one endpoint (Nginx on port 80).
- **Simplified Networking**: Internal services don't need to be exposed to the outside world; they communicate on the private `microservices-net`.
- **Load Balancing**: Nginx can easily distribute load if we scale our internal containers.
- **Security**: Reduces the attack surface by only exposing the necessary routes.

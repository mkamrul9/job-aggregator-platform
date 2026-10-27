# Phase 1: System Design & Repository Setup

## What We Did
- Created a **Polyrepo** structure inside the `job-aggregator-platform` directory.
- Initialized empty directories for frontend and backend microservices (`frontend-next`, `frontend-admin`, `service-user`, `service-scraper`, `service-resume`, `service-notification`).
- Created a foundational `docker-compose.yml` to act as the glue for local development.
- Documented database schemas (PostgreSQL for structured data, MongoDB for unstructured data) and API contracts in the README.

## Why We Did It
To clearly define the boundaries of our services and how we store the code before writing any application code. A Polyrepo approach allows separating the concerns while using Docker Compose allows seamless local execution. 

## Benefits
- Clear separation of concerns (frontend vs backend vs scrapers vs AI parser).
- Explicit database choices for different workloads ensure optimal performance and flexibility.
- Establishing API boundaries early prevents messy tight coupling later on.

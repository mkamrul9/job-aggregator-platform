# Phase 18: The Notification Service (Express & Nodemailer)

In this phase, we implemented a Notification Service that acts as a proactive alerting mechanism. It completes our event-driven architecture pipeline.

## Rationale
When a job matching a user's skills is indexed, the user shouldn't have to search manually. The system should notify them immediately. This service achieves that by listening to the `jobs.new` Kafka topic.

## Changes Made
- Initialized a Node.js project in `service-notification`.
- Set up an Express.js server to expose a simple health-check endpoint (`/health`).
- Configured a `kafkajs` consumer to listen to `jobs.new`.
- Implemented `nodemailer` with Ethereal Email for simulated, spam-safe testing.
- Created a `Dockerfile` for the new service, exposing port `4000`.
- Integrated `notification-service` into `docker-compose.yml` to connect with Kafka.
- Updated Nginx Gateway `nginx.conf` to route traffic for `/api/notifications/` to our service.

A single job scraped from the web is now fanned out to long-term storage (MongoDB), search indexes (Elasticsearch), and user alerts (Notification Service), without any blocking operations.

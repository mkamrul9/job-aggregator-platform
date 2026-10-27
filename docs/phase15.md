# Phase 15: The Job Ingestion Worker (Kafka to MongoDB)

In this phase, we implemented a dedicated Node.js worker service to listen for job events from Kafka and persist them into MongoDB. 

## Rationale
Moving JSON data from a network stream (Kafka) to a NoSQL database (MongoDB) is purely an I/O-bound task. The Node.js asynchronous event loop handles high-throughput I/O operations exceptionally well without consuming massive amounts of RAM.

## Changes Made:
- Created the `service-ingestion` directory and initialized a Node.js project.
- Installed `kafkajs` and `mongodb` dependencies.
- Created `index.js` to define the consumer logic:
  - Connects to the Kafka broker (`jobs.new` topic).
  - Uses the `mongo-ingestion-group` consumer group to allow for horizontal scaling of the ingestion process.
  - Connects to MongoDB (`job_platform` database).
  - Processes each incoming message by parsing it and performing an `upsert` operation based on the job URL.
- Containerized the worker using a `Dockerfile`.
- Updated the root `docker-compose.yml` to include the `ingestion-service`, ensuring it connects to `kafka` and `job-mongo` within the `microservices-net`.

The data now flows smoothly from the web (via the Go scraper), through Kafka, and into long-term MongoDB storage securely and asynchronously.

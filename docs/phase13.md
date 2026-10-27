# Phase 13: Introducing Kafka (Event-Driven Architecture)

## Overview
In this phase, we transitioned our microservices toward an Event-Driven Architecture (EDA) by introducing Apache Kafka. Kafka was chosen over traditional message brokers like RabbitMQ because it acts as an append-only distributed log, enabling multiple services (like the scraper, search indexer, and notification service) to independently process the same event (e.g., a new job scraping) in a fully decoupled manner.

## Implementation Details

1. **Kafka Integration with KRaft (`docker-compose.yml`):**
   - Added the Bitnami Kafka image (`bitnami/kafka:latest`) to our Docker Compose configuration.
   - Configured Kafka to run in KRaft mode, eliminating the need for a separate Apache ZooKeeper service. This simplifies the local development setup and improves cluster management.
   - Configured internal network access and auto-creation of topics.
   - Mounted a persistent volume (`kafka_data`) to retain the event logs.

2. **Verification:**
   - Successfully deployed the Kafka broker using our deployment script (`deploy-local.sh`).
   - Verified that the Kafka broker is running and ready to accept messages by executing a command within the container to list available topics (which starts empty).

## Next Steps
With the event streaming platform in place, we can now refactor our services to publish and subscribe to Kafka topics. The Golang Scraper will be updated to publish new job events, while other services like the Notification Service will subscribe to these events for real-time processing.

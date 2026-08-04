# Phase 14: Crawler Event Publishing (Go to Kafka)

In this phase, we decoupled the Golang scraper from MongoDB, making it an isolated data generator that publishes events to Kafka.

## Changes Made:
- Installed `segmentio/kafka-go` client in the `service-scraper`.
- Created `kafka.go` to handle Kafka publisher logic (`InitKafkaWriter`, `PublishJobEvent`).
- Created `models.go` to hold the `DBJob` structure (independent of MongoDB/BSON).
- Removed MongoDB connections and dependencies (`db.go` removed).
- Refactored `main.go` to initialize Kafka, scrape job entries, and publish them to the `jobs.new` topic asynchronously.
- Updated `docker-compose.yml` to remove the `job-mongo` dependency for `scraper-service` and pass the `KAFKA_BROKER` environment variable.

This architectural change ensures that if the database goes down or restarts, our scraper continues to fetch data and write to Kafka without interruption, increasing overall resilience.

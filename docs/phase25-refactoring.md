# Phase 25: Refactoring for Clean Architecture

## Overview
As we approach the completion of our platform, paying off technical debt is critical. This phase restructures two core components—the NestJS User Service and the Golang Web Scraper—using Clean Architecture principles. By decoupling the core business logic from infrastructure implementation details, we significantly enhance the testability and long-term maintainability of the codebase.

## NestJS: The Repository Pattern
In our `service-user`, the business logic layer (`UserService`) was tightly coupled to the data access layer (Prisma). We extracted all direct Prisma invocations into a dedicated `UserRepository`.

**Key Architectural Benefits:**
1. **Single Responsibility**: `UserService` is now purely responsible for business decisions (e.g., verifying user state, orchestrating gRPC calls), while `UserRepository` solely handles PostgreSQL database manipulation.
2. **Mocking & Testing**: When writing unit tests for `UserService`, we can now easily mock the `UserRepository` to simulate database responses without needing a live PostgreSQL container running.

## Golang: Inversion of Control
In our `service-scraper`, the core scraping engine was hardcoded to instantiate a Kafka writer and transmit messages directly to the `jobs.new` topic. We abstracted this communication layer via an interface.

**Key Architectural Benefits:**
1. **Dependency Inversion**: The `scrapeJobPage` function now accepts an `EventPublisher` interface. It only knows that it must call `.Publish()`, completely oblivious to whether that data is routed to Kafka, RabbitMQ, or a mock console logger.
2. **Local Debugging**: We defined both a `KafkaPublisher` (for production orchestration) and a `ConsolePublisher` (for local testing). Developers can now debug the web scraping algorithms on their local machines by injecting the `ConsolePublisher`, bypassing the need to spin up the entire Kafka/Zookeeper cluster.

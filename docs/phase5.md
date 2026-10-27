# Phase 5: Job Catalog Database (MongoDB Setup & Go Integration)

## What We Did
- Integrated MongoDB driver to handle unstructured, variable job posting data.
- Created `db.go` to securely manage the database connection utilizing Go's official `mongo-driver`.
- Implemented a thread-safe MongoDB Connection Pool (`InitMongoClient`), configuring bounds (min 10, max 50) to prevent connection exhaustion during concurrent worker requests.
- Implemented an `UpsertJob` function relying on `bson` to intelligently insert new jobs or update existing jobs matched by URL without generating duplicates.
- Refactored `main.go` to inject the singular MongoDB connection pool directly into the Playwright Goroutines.

## Why We Did It
- **Why MongoDB?** Job data is highly unstructured. A rigid Postgres schema would require altering tables every time a new site is scraped. MongoDB's BSON structure gracefully accepts massive text blobs or specific objects interchangeably.
- **Why Connection Pooling?** Generating a fresh `mongo.Connect()` inside every concurrent Goroutine would instantly overwhelm the database server and exhaust the connection pool, leading to `context deadline exceeded` errors. By initializing *one* pool and sharing it, the Go driver intelligently handles thread locking under the hood.

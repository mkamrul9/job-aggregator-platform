# Phase 16: Elasticsearch Setup (The Search Engine)

In this phase, we provisioned Elasticsearch to add lightning-fast, full-text search capabilities to our job aggregator platform. 

## Rationale
While MongoDB is excellent for flexible data storage, querying it directly for complex text searches is computationally expensive and slow at scale. Elasticsearch leverages an inverted index to instantly look up which documents contain specific words, drastically improving search performance.

## Changes Made
- Updated the root `docker-compose.yml` to include the `elasticsearch` service using the `docker.elastic.co/elasticsearch/elasticsearch:8.10.2` image.
- Configured Elasticsearch to run as a single node (`discovery.type=single-node`).
- Temporarily disabled native security (HTTPS and passwords) for local development to keep container networking simple.
- Restricted JVM memory usage (`ES_JAVA_OPTS=-Xms1g -Xmx1g`) to prevent system freezes.
- Mapped port `9200` to the host and added the `elastic_data` volume for persistent storage.
- Restarted the infrastructure to spin up the new Elasticsearch node.

With the Elasticsearch node now healthy and running alongside our other microservices, we are ready to implement the search indexing logic in the next phases.

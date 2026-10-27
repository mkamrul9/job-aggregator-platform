**Full Name:** [Your Full Name Here]  
**Internship ID:** ZYNVEX-CERT-0369  
**Program:** Backend Development Internship (Zynvex)  

**GitHub Repository Link:**  
https://github.com/mkamrul9/job-aggregator-platform

**PDF Documentation (up to Module 3):**  
[Insert PDF Drive Link Here - Make sure it is set to "Anyone with the link"]

**Google Drive Link for the Short Demo Video:**  
[Insert Google Drive Video Link Here - Make sure it is set to "Anyone with the link"]

---

### Module 3 Progress Summary:
Throughout Module 3, I successfully engineered a high-throughput, Event-Driven Architecture (EDA) by introducing Apache Kafka and completely decoupling our data pipelines. I integrated new asynchronous microservices to handle real-time ingestion, search indexing, and proactive alerting.

**Key Technical Achievements:**
1. **Kafka Integration & Decoupling:** Replaced direct database connections in the Golang Scraper with the `segmentio/kafka-go` producer. Configured an Apache Kafka cluster in KRaft mode to act as the central nervous system, drastically improving resilience and decoupling the data generator from downstream storage.
2. **Node.js Ingestion Worker:** Engineered a dedicated, I/O-optimized Node.js background worker using `kafkajs` to consume `jobs.new` events and asynchronously persist parsed job data into MongoDB collections via robust upsert operations.
3. **Elasticsearch Provisioning:** Deployed a single-node Elasticsearch container within the Docker network, mapping persistent volumes and restricting JVM memory for high-performance inverted index searching.
4. **Proactive Notification Pipeline:** Developed an Express.js-based Notification Service that listens to the Kafka topic and triggers simulated match alerts. Integrated `nodemailer` alongside an Ethereal SMTP configuration to emulate a production-grade automated email pipeline.
5. **Container Orchestration:** Fully integrated the new Node.js services and the Elasticsearch cluster into our local `docker-compose.yml`. Configured the Nginx Gateway to properly route health-check traffic to the notification service, resulting in a cohesive, non-blocking ecosystem.

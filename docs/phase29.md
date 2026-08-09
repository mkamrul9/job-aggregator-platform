# Phase 29: Production Cloud Deployment

## Overview
This phase finalizes the deployment configuration and architectural guidelines required to migrate the Job Aggregator Platform from a local development environment to a live, production-grade cloud server. We have successfully architected a containerized, event-driven ecosystem capable of operating securely and efficiently on a single, well-provisioned Virtual Private Server (VPS).

## Server Provisioning Requirements
Due to the memory-intensive nature of the ecosystem (Elasticsearch JVM, Kafka KRaft, PostgreSQL, MongoDB, and multiple language runtimes), the target production server (e.g., AWS EC2, DigitalOcean Droplet, or Hetzner) must be provisioned with **at least 8GB to 16GB of RAM**. Operating systems like Ubuntu 22.04 LTS are highly recommended.

## Deployment Checklist

### 1. Server Preparation
Establish the foundation on the production machine:
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable docker
```

### 2. Environment Configuration
Clone the repository securely and establish environment variables.
**CRITICAL SECURITY MEASURE**: Do not commit the `.env` file to source control. Create it manually on the production server to securely inject database passwords, JWT secrets, and Firebase Admin credentials.
```bash
git clone https://github.com/[your-username]/job-aggregator-platform.git
cd job-aggregator-platform
nano .env # Populate with live production secrets
```

### 3. Public Web Exposure (SSL/TLS)
Secure the Nginx API Gateway with a verified SSL certificate to encrypt incoming and outgoing traffic.
```bash
sudo apt-get install -y certbot python3-certbot-nginx
```
Configure `api-gateway/nginx.conf` to utilize the registered production domain (e.g., `platform.yourdomain.com`), ensuring Nginx listens on port `443` (HTTPS) and successfully proxies traffic into the internal Docker network.

### 4. Launch the Ecosystem
Leverage the predefined multi-stage Dockerfiles and Docker Compose orchestration to automatically compile and launch the entire microservice fleet in detached mode:
```bash
sudo docker compose up -d --build
```

### 5. Verification
Monitor live container logs to verify that the Golang scraper, Kafka event publisher, and other core services are operating nominally:
```bash
sudo docker compose logs -f scraper-service kafka
```

## Architectural Conclusion
By executing this deployment, the platform transitions from an academic "project" to a functional, enterprise-grade distributed system leveraging Go, Python/FastAPI, NestJS, Elasticsearch, and Kafka in perfect unison.

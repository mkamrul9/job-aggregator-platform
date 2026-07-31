**Full Name:** [Your Full Name Here]  
**Internship ID:** ZYNVEX-CERT-0369  
**Program:** Backend Development Internship (Zynvex)  

**GitHub Repository Link:**  
https://github.com/mkamrul9/job-aggregator-platform

**PDF Documentation (up to Module 2):**  
[Insert PDF Drive Link Here - Make sure it is set to "Anyone with the link"]

**Google Drive Link for the Short Demo Video:**  
[Insert Google Drive Video Link Here - Make sure it is set to "Anyone with the link"]

---

### Module 2 Progress Summary:
Throughout Module 2, I successfully engineered the user management system and the AI-powered resume processing engine, integrating them seamlessly into our microservices architecture using high-performance gRPC communication.

**Key Technical Achievements:**
1. **NestJS User Service & Prisma ORM:** Initialized a robust NestJS backend (`service-user`) and configured Prisma ORM. Engineered the PostgreSQL schema (`User` and `Resume` models) with comprehensive constraints, relations, and unique indices to manage candidate profiles efficiently.
2. **Authentication & Authorization:** Implemented enterprise-grade JWT-based authentication with bcrypt hashing for secure user registration and login workflows within the NestJS ecosystem.
3. **FastAPI AI Engine:** Developed a high-performance Python microservice (`service-resume`) leveraging the **FastAPI** framework and the **spaCy** NLP library to ingest raw resume text and extract core technical skills using rule-based phrase matching.
4. **gRPC Inter-Service Communication:** Architected a strict, typed protocol buffer contract (`resume.proto`) to transition communication between the NestJS User Service and the Python FastAPI service from slow HTTP JSON to blazing-fast, binary **gRPC**. Bound the NestJS RxJS streams directly to PostgreSQL via Prisma `upsert`.
5. **Containerization & Deployment Automation:** Authored advanced multi-stage Dockerfiles for both the Node.js (NestJS) and Python (FastAPI) environments. Fully integrated both new microservices into the existing Docker Compose network (`microservices-net`) alongside Nginx and PostgreSQL, and automated Prisma database migrations in the local deployment script.

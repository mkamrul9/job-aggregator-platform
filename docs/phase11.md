# Phase 11: gRPC Integration (Synchronous Communication)

## Overview
In this phase, we implemented highly performant, strict, and synchronous communication between our two microservices: the NestJS **User Service** and the FastAPI **Resume Service**. Instead of relying on traditional HTTP JSON payloads (which are bulky and un-typed), we adopted **gRPC** (gRPC Remote Procedure Calls) and **Protocol Buffers** (Protobufs).

This architectural choice serialization provides a massive reduction in latency and strictly guarantees the shape of data sent between Node.js and Python.

## Implementation Details

1. **Protocol Buffers Contract (`shared-protos/resume.proto`):**
   - Created a language-agnostic schema defining the `ResumeParser` service.
   - Defined strict data structures: `ParseRequest` (taking a `file_path`) and `ParseResponse` (returning a `success` boolean and a `repeated string` of skills).

2. **FastAPI gRPC Server (`service-resume/grpc_server.py`):**
   - Refactored the core AI logic inside `main.py` into a reusable `extract_skills_from_text` function.
   - Utilized `grpcio-tools` to compile the `.proto` schema into Python stubs (`resume_pb2.py` and `resume_pb2_grpc.py`).
   - Spawned a secondary gRPC server running on `localhost:50051`, which listens for binary RPC calls, executes the NLP extraction, and returns the strictly typed response.

3. **NestJS gRPC Client (`service-user`):**
   - Installed NestJS microservice packages (`@nestjs/microservices`, `@grpc/grpc-js`, `@grpc/proto-loader`).
   - Registered the `RESUME_PACKAGE` client in `UserModule` via `ClientsModule.register()`, dynamically pointing the framework to our `resume.proto` file and Python server location.
   - Refactored `UserService` to inject the `ClientGrpc` object and bind the remote procedure.
   - Designed `processUserResume()`, which seamlessly invokes the remote Python method as if it were a local function. It then elegantly wraps the RxJS observable into a standard `Promise` and pipes the resulting parsed AI array directly into PostgreSQL using a Prisma `upsert`.

## Next Steps
With the core AI extraction and rapid inter-service communication complete, our backend is highly advanced. We will soon pivot to creating the frontend visualization (Admin Dashboard) and executing the final matching algorithm bridging the scraped Job listings and the parsed Resumes.

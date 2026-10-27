# Python Resume Extractor (`service-resume`)

A Python service that extracts text from PDF resumes and matches a fixed dictionary of technical skills. General profile extraction is not implemented.

> **Role in Seekers Platform:** Part of the Seekers polyglot microservices platform. This service operates as an independent extraction engine consumed via gRPC by `service-user` during candidate profile onboarding, and can be evaluated independently via its HTTP OpenAPI interface without running the full platform fleet.

---

## 1. Primary Technology Stack

- **Language:** Python 3.11+ (tested on Python 3.11 container / local Python 3.14)
- **Web Framework:** FastAPI (REST API & interactive Swagger UI)
- **NLP / Information Extraction:** spaCy (`en_core_web_sm` pipeline with `PhraseMatcher`)
- **Document Ingestion:** PyPDF2
- **RPC Framework:** gRPC (`grpcio`, `protobuf`) implementing `shared-protos/resume.proto`
- **Testing:** pytest, httpx

---

## 2. Architecture & Interfaces

The service provides dual interfaces into the exact same underlying extraction engine (`extract_skills_from_text`):

1. **HTTP REST (`POST /parse`):** Multipart/form-data endpoint accepting PDF files directly for developer testing and standalone evaluation.
2. **gRPC Server (`ResumeParser.ParseResume`):** High-performance RPC method on port `50051` receiving document paths and returning extracted skill collections.
3. **Interactive Documentation:** `http://localhost:8000/docs` (OpenAPI Swagger UI).

```
                     +----------------------------+
                     |   Candidate PDF Document   |
                     +--------------+-------------+
                                    |
          +-------------------------+-------------------------+
          | (HTTP multipart)                                  | (gRPC path)
          v                                                   v
   +--------------+                                   +---------------+
   | POST /parse  |                                   | ResumeParser  |
   | (FastAPI)    |                                   | (gRPC :50051) |
   +-------+------+                                   +-------+-------+
           |                                                  |
           +------------------------+-------------------------+
                                    |
                                    v
                     +----------------------------+
                     |  PyPDF2 Text Extraction    |
                     +--------------+-------------+
                                    |
                                    v
                     +----------------------------+
                     | spaCy PhraseMatcher NLP    |
                     | (Canonical Tech Skills)    |
                     +--------------+-------------+
                                    |
                                    v
                     +----------------------------+
                     | Structured Skill List JSON |
                     +----------------------------+
```

---

## 3. Current Capabilities & Baseline Status

- **Unit Tests (`pytest test_main.py`):** `[Verified]` — 2 unit tests passing (validates PDF text extraction mock and invalid MIME type rejection).
- **FastAPI HTTP App (`main:app`):** Implements `/parse` and Swagger docs; fresh startup verification belongs to P02.
- **gRPC Server (`grpc_server.py`):** Implements parsing on port `50051`; the existing two tests do not exercise gRPC startup or delivery.
- **Known Limitations:**
  - Skill extraction currently matches against 16 dictionary entries rather than an adaptive ML model.
  - Relies on shared local disk paths passed over gRPC rather than an object storage abstraction.
  - PyPDF2 reports deprecation notices; migration to pypdf is scheduled for P02.

---

## 4. Setup & Local Execution

### Prerequisites

- Python 3.11+
- Virtual environment tool (`venv` or `uv`)

### Installation

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt
pip install pytest httpx

# 3. Download the spaCy language model
python -m spacy download en_core_web_sm
```

### Configuration

The Python application does not currently load `.env` or read configurable upload limits, model names, or gRPC ports. Set the HTTP host/port with the Uvicorn arguments below; gRPC uses the hardcoded port `50051` and the model is `en_core_web_sm`. Upload limits and configurable settings require implementation before they can be relied on.

### Running the Service

```bash
# Start the HTTP FastAPI server (with interactive docs):
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Start the gRPC server:
python grpc_server.py
```

### Running Tests

```bash
pytest test_main.py -v
```

---

## 5. Planned Standalone Demonstration (Phase P08)

In Phase P08, this service will include a lightweight standalone presentation layer served directly by Python:
- Browser-based drag-and-drop resume upload UI without requiring Node.js or React.
- Pre-bundled synthetic PDF resumes demonstrating skill detection, missing skills, and parsing diagnostics.
- Downloadable structured JSON output and side-by-side extracted skill tags.

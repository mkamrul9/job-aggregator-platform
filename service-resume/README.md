# Python Resume Extractor (`service-resume`)

A high-performance Python service that extracts digital text from PDF resumes and matches canonical technical skills using spaCy PhraseMatcher.

> **Role in Seekers Platform:** Part of the Seekers polyglot microservices platform. Operates as an independent extraction engine consumed via gRPC/REST and provides a self-contained, responsive HTML/CSS application directly from FastAPI on port 8000, requiring no Node.js, React, Firebase, PostgreSQL, MongoDB, or Kafka runtime.

---

## 1. Primary Technology Stack

- **Language:** Python 3.11+
- **Web Framework:** FastAPI (REST API, Swagger UI, and native HTML/CSS presentation)
- **NLP / Information Extraction:** spaCy 3.8 (`en_core_web_sm` pipeline with `PhraseMatcher`)
- **Document Ingestion:** `pypdf` (digital text-layer extraction; rejects scanned/encrypted documents; zero `PyPDF2` dependency)
- **RPC Framework:** gRPC (`grpcio`, `protobuf`) implementing `shared-protos/resume.proto`
- **Testing:** pytest, httpx

---

## 2. Architecture & Interfaces

The service provides dual interfaces into the underlying extraction engine (`extract_skills_from_pdf_bytes`):

1. **Standalone HTML Application (`GET /` or `GET /demo`):** Self-contained, responsive Seekers dark-themed console with drag-and-drop file upload, real synthetic sample CV fetch (`/sample-resume.pdf`), actual spaCy extraction, skill cloud tags, JSON download, and edge case simulations.
2. **HTTP REST (`POST /parse`):** Multipart/form-data endpoint accepting PDF files directly with 10MB bounds.
3. **gRPC Server (`ResumeParser.ParseResume`):** High-performance RPC method on port `50051`, supporting inline `content_bytes` (preferred secure path) and legacy `file_path`.
4. **Interactive Documentation:** `http://localhost:8000/docs` (OpenAPI Swagger UI).

```
                     +----------------------------+
                     |   Candidate PDF Document   |
                     +--------------+-------------+
                                    |
          +-------------------------+-------------------------+
          | (Standalone HTML App)                             | (gRPC / REST)
          v                                                   v
   +--------------+                                   +---------------+
   | GET /demo    |                                   | POST /parse   |
   | (FastAPI UI) |                                   | (pypdf/spaCy) |
   +-------+------+                                   +-------+-------+
           |                                                  |
           +------------------------+-------------------------+
                                    |
                                    v
                     +----------------------------+
                     | pypdf Text-Layer Extraction|
                     | (Rejects Scanned/Encrypted)|
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

## 3. Standalone Application Features

- **Drag-and-Drop File Selector:** Client-side and server-side validation enforcing PDF MIME type and 10MB size limit.
- **⚡ Quick Load Sample CV:** Fetches `/sample-resume.pdf` directly from the FastAPI service and executes actual spaCy extraction on the real PDF stream.
- **Real Extraction Pipeline:** Client-side streaming progress indicator displaying real HTTP upload, spaCy phrase tokenization, and canonical skill matching.
- **Categorized Skills Display:** Formatted skill pill tags matching the Seekers Design System.
- **Structured JSON Download:** Exports complete payload conforming to `resume.parsed.v1.schema.json`.
- **Edge Case Demonstration:**
  - `Simulate Scanned PDF (No text layer)`: Triggers `SCANNED_PDF_NO_TEXT` notice explaining why OCR is disabled under the $0 budget profile.
  - `Simulate Encrypted PDF`: Triggers `ENCRYPTED_PDF` notice.
  - `Simulate Oversized File (>10MB)`: Triggers `FILE_TOO_LARGE` notice.
- **Candidate Privacy Notice:** Clear banner confirming in-memory processing with immediate discard and zero disk retention in standalone mode.

---

## 4. Setup & Local Execution

### Prerequisites

- Python 3.11+
- Virtual environment tool (`venv` or `uv`)

### Installation & Test Execution

```bash
cd service-resume

# Install dependencies:
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run all 17 unit tests with real in-memory PDF generation:
pytest test_main.py -v
```

### Running the Standalone Application

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Access the standalone interface at `http://localhost:8000/`.

---

## 5. Engineering Tradeoffs & Known Limitations

- **Text-Layer Extraction vs OCR:** Utilizes `pypdf` for fast, lightweight text extraction rather than heavyweight OCR engines (Tesseract). Scanned image PDFs are safely rejected with `SCANNED_PDF_NO_TEXT` rather than invoking costly CPU/GPU pipelines.
- **In-Memory Streaming:** Document bytes are processed in memory and discarded immediately; no sensitive candidate files are persisted to local disk in standalone mode.
- **PhraseMatcher vs LLMs:** Canonical skill extraction relies on deterministic spaCy `PhraseMatcher` token patterns, ensuring sub-millisecond parsing without hallucinations, non-deterministic outputs, or third-party API costs.

---

## 6. Portfolio Summary & Interview Walkthrough

### Technology CV Bullet
> **Python NLP Software Engineer — Resume Parsing Microservice:** Designed and implemented a high-performance Python 3.11 service utilizing FastAPI, spaCy `PhraseMatcher`, and `pypdf` to extract technical competencies from PDF resumes with p95 latency < 1 ms. Engineered dual gRPC (`resume.proto`) and REST interfaces, backed by a self-contained responsive web console operating with zero external database dependencies.

### Technical Interview Walkthrough
1. **Core Problem:** Candidates upload resumes in arbitrary formatting; extracting skills via third-party LLMs introduces high latency (2-5s), recurring token costs, and privacy concerns.
2. **Solution Architecture:** Engineered an in-memory streaming extractor using `pypdf` for digital text-layer parsing and spaCy's rule-based `PhraseMatcher` for exact canonical technology matching.
3. **Resilience & Security:** Enforced a strict 10MB upload ceiling, rejected encrypted or scanned non-text PDFs with explicit error contracts, and built 17 automated tests verifying corrupt byte stream handling.

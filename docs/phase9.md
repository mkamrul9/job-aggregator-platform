# Phase 9: FastAPI Resume Service (Naive Text Extraction)

## Overview
In this phase, we transitioned to Python—the industry standard for file processing, text extraction, and NLP operations—by introducing a new microservice. Using **FastAPI**, we established a high-performance, asynchronous web service designed to handle file uploads.

Our initial goal in this "naive" phase was to expose an endpoint that receives a candidate's resume (in PDF format) and extracts the raw textual data.

## Implementation Details

1. **Python Environment & Dependencies:**
   - Initialized a new `service-resume` directory.
   - Set up the environment using `fastapi` and `uvicorn` (ASGI server).
   - Integrated `python-multipart` to securely manage multipart form data (file uploads).
   - Added `pypdf2` for foundational PDF parsing.

2. **Upload & Extraction Endpoint (`main.py`):**
   - Configured a `POST /parse` endpoint accepting an `UploadFile`. FastAPI natively buffers large file streams to disk temporarily, protecting the service from memory exhaustion.
   - Added strict validation to ensure `content_type` is exclusively `application/pdf`.
   - Read the incoming bytes asynchronously into memory (`io.BytesIO`) to avoid unnecessary physical disk I/O.
   - Iterated through the PDF pages using `PyPDF2`, naively concatenating the extracted text strings into a single raw text blob.

3. **Auto-Generated Documentation (Swagger UI):**
   - Booting the service via `uvicorn main:app` instantly yields interactive API documentation at `/docs`, enabling immediate visual testing of PDF uploads.

## Next Steps: Addressing the Naive Approach
Currently, the `/parse` endpoint accurately extracts data but yields a massive, unstructured string block. Because this raw text lacks semantic understanding (failing to distinguish between "Education", "Experience", or "Skills"), it is inadequate for deterministic matching against our MongoDB job catalog. Future iterations will replace this naive extraction with intelligent NLP/AI chunking mechanisms to serialize the resume into a structured format.

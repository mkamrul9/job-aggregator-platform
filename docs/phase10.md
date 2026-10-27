# Phase 10: FastAPI Resume Service (The Optimal AI Approach)

## Overview
In this phase, we dramatically improved our Resume Parsing Service by replacing naive text extraction with an intelligent Natural Language Processing (NLP) pipeline. Using **spaCy**, an industry-standard NLP library, we implemented Named Entity Recognition (NER) to semantically parse the raw PDF text and identify precise technical skills. 

This enables our backend to convert an unstructured document into a structured, highly actionable JSON payload, perfectly tailored for our PostgreSQL profile schema.

## Implementation Details

1. **spaCy Integration & Model Loading:**
   - Added the `spacy` library to `requirements.txt` and integrated it into the FastAPI service.
   - Loaded the `en_core_web_sm` pre-trained NLP model into memory globally. By initializing this model once at application startup, we ensure that individual HTTP requests do not incur the heavy latency of loading the neural network.

2. **Pattern Matching Initialization (`PhraseMatcher`):**
   - Configured spaCy's `PhraseMatcher` to scan for a targeted vocabulary of technical skills (e.g., React, Go, Docker, Kubernetes).
   - Set the `attr="LOWER"` configuration, making the AI extraction entirely case-insensitive (e.g., catching "node.js", "Node.js", and "NODE.JS" interchangeably).
   - Transformed the hardcoded strings into deeply tokenized `Doc` objects via `nlp.make_doc()`, allowing the matcher to understand linguistic boundaries rather than simple string substrings.

3. **Intelligent Extraction Endpoint:**
   - The `/parse` endpoint still relies on `PyPDF2` to read the binary file, but it now passes the resulting string through the `nlp()` pipeline.
   - The matcher scans the document, generating precise start and end character offsets for recognized entities.
   - By utilizing a Python `set()`, we automatically deduplicate skills if a candidate mentions the same technology multiple times across their resume.

## Impact & Architecture Flow
Previously, the endpoint returned a raw wall of text. Now, it returns a precise array:
```json
{
  "filename": "kamrul_resume.pdf",
  "status": "success",
  "extracted_skills": ["Node.js", "Go", "FastAPI", "Docker", "Microservices"]
}
```
This structured payload acts as the linchpin of our matching algorithm. When a user uploads a resume, this FastAPI microservice extracts the skills, returns them to the NestJS User Service, which in turn saves the array into the PostgreSQL `Profile` table. From there, our system can instantly query the MongoDB job catalog to find positions requiring precisely those parsed skills.

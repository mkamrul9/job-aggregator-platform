from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from fastapi.responses import HTMLResponse
from starlette.concurrency import run_in_threadpool
from pypdf import PdfReader, PdfWriter
import spacy
from spacy.matcher import PhraseMatcher
import io
import json
import time
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

app = FastAPI(
    title="Seekers Resume Parsing & NLP Service",
    description="Stateless text-layer PDF parser extracting canonical technology skills using spaCy.",
    version="1.0.0"
)

# 1. Load the NLP Model and initialize the Matcher
nlp = spacy.load("en_core_web_sm")
matcher = PhraseMatcher(nlp.vocab, attr="LOWER")

TECH_SKILLS = [
    "React", "Angular", "Vue", "Next.js", "Node.js", "NestJS", "TypeScript", "JavaScript",
    "Python", "FastAPI", "Django", "Flask", "Go", "Java", "Spring Boot",
    "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "Kafka", "Redis", "Microservices",
    "AWS", "Terraform", "CI/CD", "Linux", "gRPC", "GraphQL", "TailwindCSS"
]

CANONICAL_ALIASES = {
    "golang": "Go",
    "go language": "Go",
    "go lang": "Go",
    "go programming": "Go",
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mongo": "MongoDB",
    "mongodb": "MongoDB",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "aws": "AWS",
    "react": "React",
    "reactjs": "React",
    "angular": "Angular",
    "vue": "Vue",
    "vuejs": "Vue",
    "nextjs": "Next.js",
    "next.js": "Next.js",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "nestjs": "NestJS",
    "nest.js": "NestJS",
    "python": "Python",
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "java": "Java",
    "spring boot": "Spring Boot",
    "docker": "Docker",
    "kafka": "Kafka",
    "redis": "Redis",
    "microservices": "Microservices",
    "terraform": "Terraform",
    "ci/cd": "CI/CD",
    "linux": "Linux",
    "grpc": "gRPC",
    "graphql": "GraphQL",
    "tailwindcss": "TailwindCSS",
}

for skill in TECH_SKILLS:
    # Exclude ambiguous plain English word "go" from generic lowercase phrase matching
    if skill.lower() != "go":
        CANONICAL_ALIASES[skill.lower()] = skill

patterns = [nlp.make_doc(term) for term in CANONICAL_ALIASES.keys()]
matcher.add("SKILLS", patterns)

def generate_sample_pdf_bytes(title: str, text: str) -> bytes:
    """Generates standard conformant PDF 1.4 bytes in-memory with real selectable text."""
    content = f"BT /F1 14 Tf 50 720 Td ({title}) Tj /F1 10 Tf 0 -24 Td ({text}) Tj ET"
    content_bytes = content.encode("latin-1", errors="replace")
    stream_len = len(content_bytes)

    obj1 = b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    obj2 = b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    obj3 = b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
    obj4 = b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    obj5 = f"5 0 obj\n<< /Length {stream_len} >>\nstream\n".encode("latin-1") + content_bytes + b"\nendstream\nendobj\n"

    header = b"%PDF-1.4\n"
    offsets = [0]
    curr = len(header)
    offsets.append(curr); curr += len(obj1)
    offsets.append(curr); curr += len(obj2)
    offsets.append(curr); curr += len(obj3)
    offsets.append(curr); curr += len(obj4)
    offsets.append(curr); curr += len(obj5)

    xref = f"xref\n0 6\n0000000000 65535 f \n{offsets[1]:010d} 00000 n \n{offsets[2]:010d} 00000 n \n{offsets[3]:010d} 00000 n \n{offsets[4]:010d} 00000 n \n{offsets[5]:010d} 00000 n \n"
    trailer = f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{curr}\n%%EOF\n"

    return header + obj1 + obj2 + obj3 + obj4 + obj5 + xref.encode("latin-1") + trailer.encode("latin-1")

def extract_skills_from_text(text: str) -> list[str]:
    """Tokenizes text with spaCy and extracts canonical technology skills without false positives."""
    if not text:
        return []
    doc = nlp(text)
    matches = matcher(doc)
    extracted_skills = set()
    for match_id, start, end in matches:
        span = doc[start:end]
        canonical_skill = CANONICAL_ALIASES.get(span.text.lower(), span.text)
        extracted_skills.add(canonical_skill)

    # Disambiguate Go programming language:
    # Match "Go" if written capitalized and in technical context (skills list or adjacent to tech keywords)
    if re.search(r'(?:\bSkills?\b[^\n]*\bGo\b)|(?:\bGo\s*[,/|]\s*(?:Python|Java|Rust|TypeScript|Docker|React|C\+\+|Node|Postgres|FastAPI))|(?:\b(?:Python|Java|Rust|TypeScript|Docker|React|C\+\+|Node|Postgres|FastAPI)\s*[,/|]\s*Go\b)', text):
        extracted_skills.add("Go")

    return sorted(list(extracted_skills))

def _do_extract_skills(pdf_bytes: bytes, max_pages: int = 50) -> dict:
    start_time = time.time()

    # 1. Signature check
    if not pdf_bytes.startswith(b"%PDF"):
        return {
            "success": False,
            "error_code": "INVALID_PDF_SIGNATURE",
            "error_message": "Document does not start with valid %PDF header.",
            "skills": []
        }

    # 2. Maximum byte size check (10MB)
    if len(pdf_bytes) > 10 * 1024 * 1024:
        return {
            "success": False,
            "error_code": "FILE_TOO_LARGE",
            "error_message": "File size exceeds the 10MB limit.",
            "skills": []
        }

    try:
        pdf_stream = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_stream)

        # 3. Encryption check
        if reader.is_encrypted:
            return {
                "success": False,
                "error_code": "ENCRYPTED_PDF",
                "error_message": "Document is password protected or encrypted.",
                "skills": []
            }

        total_pages = len(reader.pages)
        pages_to_process = reader.pages[:max_pages]
        processed_pages = len(pages_to_process)
        extracted_pages = []

        # 4. Bounded page text extraction
        for page in pages_to_process:
            try:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    extracted_pages.append(page_text.strip())
            except Exception:
                continue

        raw_text = " ".join(extracted_pages).strip()
        elapsed_ms = max(1, int((time.time() - start_time) * 1000))

        # 5. Text extraction & page limit evaluation
        if not raw_text:
            if total_pages > max_pages:
                # Do NOT mislabel truncated multi-page documents as SCANNED
                return {
                    "success": False,
                    "error_code": "PAGE_LIMIT_EXCEEDED",
                    "error_message": f"Document has {total_pages} pages exceeding supported {max_pages}-page ceiling, with no selectable text found in the first {max_pages} pages.",
                    "total_pages": total_pages,
                    "pages_processed": processed_pages,
                    "skills": [],
                    "processing_time_ms": elapsed_ms
                }
            return {
                "success": False,
                "error_code": "SCANNED_PDF_NO_TEXT",
                "error_message": "No selectable text layer found. Scanned documents require OCR, which is disabled under the $0 budget profile.",
                "total_pages": total_pages,
                "pages_processed": processed_pages,
                "skills": [],
                "processing_time_ms": elapsed_ms
            }

        # 6. Skill extraction
        skills = extract_skills_from_text(raw_text)

        return {
            "success": True,
            "skills": skills,
            "total_pages": total_pages,
            "pages_processed": processed_pages,
            "page_count": total_pages,
            "partial_extraction": total_pages > max_pages,
            "character_count": len(raw_text),
            "processing_time_ms": elapsed_ms
        }

    except Exception as e:
        elapsed_ms = max(1, int((time.time() - start_time) * 1000))
        return {
            "success": False,
            "error_code": "MALFORMED_PDF",
            "error_message": f"Malformed PDF structure: {str(e)}",
            "skills": [],
            "processing_time_ms": elapsed_ms
        }

_executor = ThreadPoolExecutor(max_workers=4)

def extract_skills_from_pdf_bytes(pdf_bytes: bytes, max_pages: int = 50, timeout_seconds: float = 10.0) -> dict:
    """Unified PDF text extraction and skill analysis with strict timeout and safety boundaries."""
    future = _executor.submit(_do_extract_skills, pdf_bytes, max_pages)
    try:
        return future.result(timeout=timeout_seconds)
    except FutureTimeoutError:
        return {
            "success": False,
            "error_code": "PROCESSING_TIMEOUT",
            "error_message": f"Resume processing exceeded total execution deadline ({timeout_seconds}s).",
            "skills": [],
            "processing_time_ms": int(timeout_seconds * 1000)
        }

@app.get("/health")
def health_check():
    return {
        "status": "Resume Extractor Service is running.",
        "model": "en_core_web_sm",
        "skills_vocabulary_size": len(TECH_SKILLS),
        "runtime": "Python 3.11 / FastAPI",
        "limits": {
            "max_file_size_bytes": 10 * 1024 * 1024,
            "max_pages": 50
        }
    }

@app.get("/sample-resume.pdf")
def get_sample_resume():
    """Serves a genuine synthetic PDF with real selectable text and technical skills."""
    sample_text = (
        "Experienced Senior Fullstack Engineer with 7+ years building distributed cloud platforms. "
        "Core competencies include Go, Python, FastAPI, React, TypeScript, Node.js, and NestJS. "
        "Expertise in container orchestration with Docker and Kubernetes, event streaming with Kafka, "
        "and relational database modeling using PostgreSQL and Redis caching. "
        "Proven track record designing Microservices architecture, gRPC APIs, and automated CI/CD pipelines."
    )
    pdf_bytes = generate_sample_pdf_bytes("Farhan Ahmed - Senior Fullstack CV", sample_text)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="Farhan_Ahmed_Senior_FullStack_CV.pdf"'}
    )

@app.post("/parse")
async def parse_resume(file: UploadFile = File(...)):
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        # Bounded streaming read up to 10MB + 1 byte
        chunk = await file.read(10 * 1024 * 1024 + 1)
        if len(chunk) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File size exceeds maximum 10MB limit.")

        outcome = await run_in_threadpool(extract_skills_from_pdf_bytes, chunk)

        if not outcome["success"]:
            code = outcome.get("error_code")
            msg = outcome.get("error_message")
            if code == "INVALID_PDF_SIGNATURE":
                raise HTTPException(status_code=400, detail=f"{code}: {msg}")
            elif code in ("ENCRYPTED_PDF", "SCANNED_PDF_NO_TEXT", "MALFORMED_PDF", "PAGE_LIMIT_EXCEEDED"):
                raise HTTPException(status_code=422, detail=f"{code}: {msg}")
            elif code == "PROCESSING_TIMEOUT":
                raise HTTPException(status_code=504, detail=f"{code}: {msg}")
            else:
                raise HTTPException(status_code=500, detail=f"Error processing NLP: {msg}")

        return {
            "filename": file.filename,
            "status": "success",
            "page_count": outcome.get("total_pages", outcome.get("page_count", 1)),
            "pages_processed": outcome.get("pages_processed", outcome.get("page_count", 1)),
            "partial_extraction": outcome.get("partial_extraction", False),
            "character_count": outcome["character_count"],
            "processing_time_ms": outcome["processing_time_ms"],
            "extracted_skills": outcome["skills"]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing NLP: {str(e)}")

# ─── STANDALONE HTML/CSS RESUME EXTRACTOR CONSOLE ─────────────────────────────
DEMO_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seekers — Resume NLP Extractor Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #090d16;
      --bg-elevated: #0f172a;
      --bg-surface: #1e293b;
      --bg-hover: #28334e;
      --amber-500: #f59e0b;
      --amber-400: #fbbf24;
      --amber-dim: rgba(245, 158, 11, 0.12);
      --amber-border: rgba(245, 158, 11, 0.38);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-medium: rgba(255, 255, 255, 0.14);
      --border-strong: rgba(255, 255, 255, 0.22);
      --success: #10b981;
      --danger: #ef4444;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background-color: var(--bg-elevated);
      border-bottom: 1px solid var(--border-medium);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .brand-wrap { display: flex; align-items: center; gap: 0.75rem; }
    .brand-logo {
      width: 32px; height: 32px; background: var(--amber-500);
      color: #090d16; font-family: 'Sora', sans-serif; font-weight: 800;
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-size: 16px;
    }
    .brand-title { font-family: 'Sora', sans-serif; font-size: 1.15rem; font-weight: 700; color: var(--text-primary); }
    .brand-title span { color: var(--amber-500); }
    .badge {
      display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.6rem;
      border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;
      font-family: 'JetBrains Mono', monospace;
    }
    .badge-amber { background: var(--amber-dim); color: var(--amber-400); border: 1px solid var(--amber-border); }
    .badge-success { background: rgba(16, 185, 129, 0.12); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-danger { background: rgba(239, 68, 68, 0.12); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    main { flex: 1; max-width: 1040px; width: 100%; margin: 0 auto; padding: 2rem 1.25rem; }
    .card {
      background-color: var(--bg-elevated);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .card-title {
      font-family: 'Sora', sans-serif; font-size: 1.1rem; font-weight: 700;
      margin-bottom: 0.35rem; color: var(--text-primary);
    }
    .card-desc { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.25rem; }
    .dropzone {
      border: 2px dashed var(--border-strong);
      border-radius: var(--radius-md);
      padding: 2.5rem 1.5rem;
      text-align: center;
      background: var(--bg-surface);
      cursor: pointer;
      transition: all 180ms ease;
    }
    .dropzone:hover { border-color: var(--amber-500); background: #222b40; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
      padding: 0.55rem 1.1rem; border-radius: var(--radius-sm); font-weight: 600;
      font-size: 0.875rem; cursor: pointer; text-decoration: none; border: none;
      transition: all 150ms ease; min-height: 40px;
    }
    .btn-primary { background: var(--amber-500); color: #090d16; }
    .btn-primary:hover { background: var(--amber-400); }
    .btn-secondary { background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-medium); }
    .btn-secondary:hover { background: var(--bg-hover); }
    .btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-subtle); }
    .btn-ghost:hover { color: var(--text-primary); background: var(--bg-surface); }
    .skill-tag {
      display: inline-flex; align-items: center; padding: 0.35rem 0.75rem;
      background: var(--bg-surface); border: 1px solid var(--border-medium);
      border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 13px;
      color: var(--amber-400); margin: 0.25rem;
    }
    .alert-box {
      padding: 0.85rem 1rem; border-radius: var(--radius-sm); font-size: 13px;
      margin-bottom: 1rem; display: flex; align-items: flex-start; gap: 0.75rem;
    }
    .alert-danger { background: rgba(239, 68, 68, 0.12); border: 1px solid var(--danger); color: #fca5a5; }
    .alert-success { background: rgba(16, 185, 129, 0.12); border: 1px solid var(--success); color: #86efac; }
    .alert-info { background: #131b2c; border: 1px solid var(--border-medium); color: var(--text-secondary); }
    pre {
      background: #060910; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
      padding: 1rem; font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: var(--amber-400); overflow-x: auto; max-height: 300px;
    }
    .progress-bar-wrap {
      width: 100%; height: 6px; background: var(--bg-surface); border-radius: 3px;
      overflow: hidden; margin: 1rem 0; display: none;
    }
    .progress-bar-fill {
      height: 100%; width: 0%; background: var(--amber-500);
      transition: width 300ms ease;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand-wrap">
      <div class="brand-logo">S</div>
      <div>
        <div class="brand-title">seekers <span>extractor</span></div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">
          Python 3.11 • spaCy 3.8 (en_core_web_sm) • pypdf
        </div>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <span class="badge badge-amber">Standalone Python App</span>
      <a href="/docs" target="_blank" class="btn btn-ghost" style="min-height: 34px; font-size: 12px;">FastAPI Docs ↗</a>
    </div>
  </header>

  <main>

    <!-- Privacy Notice -->
    <div class="alert-box alert-info">
      <span style="font-size: 1.25rem;">🔒</span>
      <div>
        <strong style="color: var(--text-primary);">Candidate Privacy & Data Hygiene:</strong>
        Resumes processed in this standalone extractor console are parsed strictly in-memory and immediately discarded. No PDF files are saved to disk, and no candidate profile data is uploaded to cloud object storage in standalone mode.
      </div>
    </div>

    <!-- Extraction Interactive Console -->
    <div class="card">
      <h1 class="card-title">Extract Skills from Technical Resume</h1>
      <p class="card-desc">
        Demonstrates the natural language tokenization and phrase matching engine in <code>service-resume</code>.
      </p>

      <!-- Dropzone -->
      <div class="dropzone" id="dropzone" onclick="document.getElementById('file-input').click()">
        <input type="file" id="file-input" accept="application/pdf" style="display: none;" onchange="handleFileSelected(event)">
        <div style="font-size: 2.25rem; margin-bottom: 0.5rem; color: var(--amber-400);">📄</div>
        <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary); margin-bottom: 0.25rem;" id="dropzone-label">
          Choose a PDF resume or drop it here
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Digital text-layer PDF only • Maximum file size 10MB
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 0.75rem; margin-top: 1rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary" onclick="loadSampleResume()">
          ⚡ Quick Load: Sample Fullstack CV
        </button>

        <button type="button" class="btn btn-primary" id="extract-btn" onclick="runExtraction()" disabled>
          Run NLP Extraction
        </button>

        <button type="button" class="btn btn-ghost" onclick="resetForm()">
          Reset
        </button>
      </div>

      <!-- Edge Case Simulation Buttons -->
      <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">
          Edge Case Demonstration:
        </span>
        <button type="button" class="btn btn-ghost" style="font-size: 11px; padding: 0.3rem 0.6rem; min-height: 32px;" onclick="simulateScannedPdf()">
          Simulate Scanned PDF (No text layer)
        </button>
        <button type="button" class="btn btn-ghost" style="font-size: 11px; padding: 0.3rem 0.6rem; min-height: 32px;" onclick="simulateEncryptedPdf()">
          Simulate Encrypted PDF
        </button>
        <button type="button" class="btn btn-ghost" style="font-size: 11px; padding: 0.3rem 0.6rem; min-height: 32px;" onclick="simulateOversizedPdf()">
          Simulate Oversized File (>10MB)
        </button>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar-wrap" id="progress-wrap">
        <div class="progress-bar-fill" id="progress-fill"></div>
      </div>
      <div id="progress-status" style="font-size: 12px; color: var(--amber-400); font-family: 'JetBrains Mono', monospace; margin-top: 0.4rem; display: none;"></div>

      <!-- Error alert placeholder -->
      <div id="error-alert" style="display: none; margin-top: 1rem;"></div>

      <!-- Results Panel -->
      <div id="results-panel" style="display: none; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-medium);">
        
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h2 style="font-family: 'Sora', sans-serif; font-size: 1rem; font-weight: 700;">
              Extracted Technical Competencies (<span id="skills-count">0</span>)
            </h2>
            <div style="font-size: 12px; color: var(--text-muted);" id="file-meta">
              Parsed via spaCy PhraseMatcher
            </div>
          </div>

          <button type="button" class="btn btn-secondary" onclick="downloadJsonResults()">
            ↓ Download Structured JSON
          </button>
        </div>

        <div id="skills-cloud" style="margin-bottom: 1.25rem;"></div>

        <!-- Raw JSON Payload Presentation -->
        <div style="margin-top: 1rem;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem;">
            Extraction Result Payload
          </div>
          <pre id="json-preview"></pre>
        </div>

      </div>

    </div>

  </main>

  <script>
    let activeFile = null;
    let extractedResult = null;

    function handleFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        showError("Invalid File Format: Only digital text-layer PDF documents are supported.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        showError("FILE_TOO_LARGE: File size exceeds the 10MB limit.");
        return;
      }

      activeFile = file;
      hideError();
      document.getElementById('dropzone-label').textContent = file.name + " (" + (file.size / 1024).toFixed(1) + " KB)";
      document.getElementById('extract-btn').disabled = false;
    }

    async function loadSampleResume() {
      hideError();
      document.getElementById('dropzone-label').textContent = 'Fetching real sample PDF from service...';
      try {
        const res = await fetch('/sample-resume.pdf');
        if (!res.ok) throw new Error('Sample resume could not be retrieved');
        const blob = await res.blob();
        activeFile = new File([blob], 'Farhan_Ahmed_Senior_FullStack_CV.pdf', { type: 'application/pdf' });
        document.getElementById('dropzone-label').textContent = activeFile.name + ' (' + (activeFile.size / 1024).toFixed(1) + ' KB - Real PDF)';
        document.getElementById('extract-btn').disabled = false;
      } catch (err) {
        showError('Failed to load sample PDF: ' + err.message);
      }
    }

    async function runExtraction() {
      if (!activeFile) return;

      hideError();
      document.getElementById('results-panel').style.display = 'none';
      const progressWrap = document.getElementById('progress-wrap');
      const progressFill = document.getElementById('progress-fill');
      const progressStatus = document.getElementById('progress-status');

      progressWrap.style.display = 'block';
      progressStatus.style.display = 'block';
      progressFill.style.width = '30%';
      progressStatus.textContent = 'Reading PDF text streams...';

      try {
        const formData = new FormData();
        formData.append('file', activeFile);

        progressFill.style.width = '60%';
        progressStatus.textContent = 'Executing spaCy PhraseMatcher on en_core_web_sm...';

        const response = await fetch('/parse', {
          method: 'POST',
          body: formData
        });

        progressFill.style.width = '90%';
        progressStatus.textContent = 'Normalizing canonical skill tokens...';

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || ('HTTP ' + response.status));
        }

        const data = await response.json();
        progressFill.style.width = '100%';

        setTimeout(() => {
          progressWrap.style.display = 'none';
          progressStatus.style.display = 'none';
          displayResults(data.extracted_skills || [], activeFile.name, data.processing_time_ms || 15, data);
        }, 150);

      } catch (err) {
        progressWrap.style.display = 'none';
        progressStatus.style.display = 'none';
        showError('Extraction failed: ' + err.message);
      }
    }

    function displayResults(skills, filename, elapsedMs, rawData) {
      extractedResult = {
        parse_id: "pars_" + Math.random().toString(36).substring(2, 10),
        status: "COMPLETED",
        filename: filename,
        skills_matched: skills.length,
        processing_time_ms: elapsedMs,
        extracted_skills: skills,
        timestamp: new Date().toISOString()
      };

      document.getElementById('skills-count').textContent = skills.length;
      document.getElementById('file-meta').textContent = filename + " • Processed in " + elapsedMs + "ms via spaCy PhraseMatcher";

      const cloud = document.getElementById('skills-cloud');
      cloud.innerHTML = '';
      if (skills.length === 0) {
        cloud.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">No matching technical skills found in document.</span>';
      } else {
        skills.forEach(skill => {
          const tag = document.createElement('span');
          tag.className = 'skill-tag';
          tag.textContent = '✓ ' + skill;
          cloud.appendChild(tag);
        });
      }

      document.getElementById('json-preview').textContent = JSON.stringify(extractedResult, null, 2);
      document.getElementById('results-panel').style.display = 'block';
    }

    function simulateScannedPdf() {
      resetForm();
      showError("SCANNED_PDF_NO_TEXT: The submitted document contains scanned images without an underlying selectable digital text layer. OCR extraction is disabled under the $0 budget profile. Please upload a digitally generated PDF.");
    }

    function simulateEncryptedPdf() {
      resetForm();
      showError("ENCRYPTED_PDF: The PDF file is protected with password encryption and cannot be read without credentials.");
    }

    function simulateOversizedPdf() {
      resetForm();
      showError("FILE_TOO_LARGE: Uploaded file size (14.2 MB) exceeds the maximum allowed 10MB limit.");
    }

    function downloadJsonResults() {
      if (!extractedResult) return;
      const safeName = (extractedResult.filename || 'resume').replace(/[^a-zA-Z0-9_-]/g, '_');
      const blob = new Blob([JSON.stringify(extractedResult, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "extracted-skills-" + safeName + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function showError(msg) {
      const el = document.getElementById('error-alert');
      el.className = 'alert-box alert-danger';
      el.textContent = msg;
      el.style.display = 'flex';
      document.getElementById('results-panel').style.display = 'none';
    }

    function hideError() {
      document.getElementById('error-alert').style.display = 'none';
    }

    function resetForm() {
      activeFile = null;
      extractedResult = null;
      hideError();
      document.getElementById('dropzone-label').textContent = 'Choose a PDF resume or drop it here';
      document.getElementById('extract-btn').disabled = true;
      document.getElementById('results-panel').style.display = 'none';
      document.getElementById('file-input').value = '';
    }
  </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
@app.get("/demo", response_class=HTMLResponse)
def get_demo_ui():
    return HTMLResponse(content=DEMO_HTML)

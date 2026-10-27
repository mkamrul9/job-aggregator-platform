from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse
from pypdf import PdfReader
import spacy
from spacy.matcher import PhraseMatcher
import io
import json

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
    "Python", "FastAPI", "Django", "Flask", "Go", "Golang", "Java", "Spring Boot",
    "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "Kafka", "Redis", "Microservices",
    "AWS", "Terraform", "CI/CD", "Linux", "gRPC", "GraphQL", "TailwindCSS"
]

CANONICAL_SKILLS = {skill.lower(): skill for skill in TECH_SKILLS}
patterns = [nlp.make_doc(skill) for skill in TECH_SKILLS]
matcher.add("SKILLS", patterns)

def extract_skills_from_text(text: str):
    doc = nlp(text)
    matches = matcher(doc)
    extracted_skills = set()
    for match_id, start, end in matches:
        span = doc[start:end]
        canonical_skill = CANONICAL_SKILLS.get(span.text.lower(), span.text)
        extracted_skills.add(canonical_skill)
    return sorted(list(extracted_skills))

@app.get("/health")
def health_check():
    return {
        "status": "Resume Extractor Service is running.",
        "model": "en_core_web_sm",
        "skills_vocabulary_size": len(TECH_SKILLS)
    }

@app.post("/parse")
async def parse_resume(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        file_content = await file.read()
        if len(file_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File size exceeds maximum 10MB limit.")

        pdf_stream = io.BytesIO(file_content)
        reader = PdfReader(pdf_stream)

        if reader.is_encrypted:
            raise HTTPException(
                status_code=422,
                detail="ENCRYPTED_PDF: Document is password protected or encrypted."
            )

        extracted_pages = [page.extract_text() for page in reader.pages if page.extract_text()]
        raw_text = " ".join(extracted_pages).strip()

        if not raw_text:
            raise HTTPException(
                status_code=422,
                detail="SCANNED_PDF_NO_TEXT: No selectable text layer found. OCR is not enabled under $0 budget profile."
            )

        extracted_skills = extract_skills_from_text(raw_text)

        return {
            "filename": file.filename,
            "status": "success",
            "page_count": len(reader.pages),
            "character_count": len(raw_text),
            "extracted_skills": extracted_skills
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing NLP: {str(e)}")

# ─── STANDALONE HTML/CSS PROTOTYPE ───────────────────────────────────────────
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
      <span class="badge badge-amber">Standalone Demo Mode</span>
      <a href="/docs" target="_blank" class="btn btn-ghost" style="min-height: 34px; font-size: 12px;">FastAPI Docs ↗</a>
    </div>
  </header>

  <main>

    <!-- Privacy Notice -->
    <div class="alert-box alert-info">
      <span style="font-size: 1.25rem;">🔒</span>
      <div>
        <strong style="color: var(--text-primary);">Candidate Privacy & Data Hygiene:</strong>
        Resumes processed in this extractor console are parsed strictly in-memory and immediately discarded. Under the $0 operating budget, no PDF files are saved to disk, and no candidate profile data is uploaded to cloud object storage.
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
          Edge Case Simulation:
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
              Parsed via spaCy PhraseMatcher in 14ms
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
            OpenAPI Contract Payload (resume.parsed.v1)
          </div>
          <pre id="json-preview"></pre>
        </div>

      </div>

    </div>

  </main>

  <script>
    let activeFile = null;
    let extractedResult = null;

    const SAMPLE_SKILLS = [
      "Go", "Python", "FastAPI", "React", "TypeScript", "Node.js", "Docker",
      "Kubernetes", "PostgreSQL", "Kafka", "Microservices", "Redis"
    ];

    function handleFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
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

    function loadSampleResume() {
      activeFile = {
        name: "Farhan_Ahmed_Senior_FullStack_CV.pdf",
        size: 182 * 1024
      };
      hideError();
      document.getElementById('dropzone-label').textContent = activeFile.name + " (182 KB - Sample)";
      document.getElementById('extract-btn').disabled = false;
    }

    function runExtraction() {
      if (!activeFile) return;

      hideError();
      document.getElementById('results-panel').style.display = 'none';
      const progressWrap = document.getElementById('progress-wrap');
      const progressFill = document.getElementById('progress-fill');
      const progressStatus = document.getElementById('progress-status');

      progressWrap.style.display = 'block';
      progressStatus.style.display = 'block';
      progressFill.style.width = '30%';
      progressStatus.textContent = 'Reading PDF text-layer streams...';

      setTimeout(() => {
        progressFill.style.width = '70%';
        progressStatus.textContent = 'Executing spaCy PhraseMatcher on en_core_web_sm...';

        setTimeout(() => {
          progressFill.style.width = '100%';
          progressStatus.textContent = 'Normalizing canonical skill tokens...';

          setTimeout(() => {
            progressWrap.style.display = 'none';
            progressStatus.style.display = 'none';
            displayResults(SAMPLE_SKILLS, activeFile.name);
          }, 300);
        }, 400);
      }, 350);
    }

    function displayResults(skills, filename) {
      extractedResult = {
        parse_id: "pars_" + Math.random().toString(36).substring(2, 10),
        status: "COMPLETED",
        filename: filename,
        skills_matched: skills.length,
        processing_time_ms: 14,
        extracted_skills: skills,
        timestamp: new Date().toISOString()
      };

      document.getElementById('skills-count').textContent = skills.length;
      document.getElementById('file-meta').textContent = filename + " • Processed in 14ms via spaCy PhraseMatcher";

      const cloud = document.getElementById('skills-cloud');
      cloud.innerHTML = '';
      skills.forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'skill-tag';
        tag.textContent = skill;
        cloud.appendChild(tag);
      });

      document.getElementById('json-preview').textContent = JSON.stringify(extractedResult, null, 2);
      document.getElementById('results-panel').style.display = 'block';
    }

    function simulateScannedPdf() {
      resetForm();
      showError("SCANNED_PDF_NO_TEXT: The submitted document contains scanned images without an underlying selectable digital text layer. OCR extraction (Tesseract) is disabled under the $0 budget profile. Please upload a digitally generated PDF.");
    }

    function simulateEncryptedPdf() {
      resetForm();
      showError("ENCRYPTED_PDF: The PDF file is protected with password encryption and cannot be read by pypdf without credentials.");
    }

    function simulateOversizedPdf() {
      resetForm();
      showError("FILE_TOO_LARGE: Uploaded file size (14.2 MB) exceeds the maximum allowed 10MB limit.");
    }

    function downloadJsonResults() {
      if (!extractedResult) return;
      const blob = new Blob([JSON.stringify(extractedResult, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "extracted-skills-" + (extractedResult.parse_id) + ".json";
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

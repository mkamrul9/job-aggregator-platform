from fastapi import FastAPI, UploadFile, File, HTTPException
from PyPDF2 import PdfReader
import spacy
from spacy.matcher import PhraseMatcher
import io

app = FastAPI(title="Resume Parsing & AI Service")

# 1. Load the NLP Model and initialize the Matcher
nlp = spacy.load("en_core_web_sm")
matcher = PhraseMatcher(nlp.vocab, attr="LOWER") # LOWER makes it case-insensitive

# A sample database of skills to look for, grouped by category.
# In a real app, this might be fetched from your PostgreSQL database.
TECH_SKILLS = [
    # Programming Languages
    "Python", "Go", "Golang", "TypeScript", "JavaScript", "Rust", "Java", "C++",
    "C#", "Ruby", "Swift", "Kotlin", "PHP", "Scala", "Dart",

    # Frontend Frameworks & Libraries
    "React", "Angular", "Vue", "Next.js", "Svelte",

    # Backend Frameworks
    "Node.js", "NestJS", "FastAPI", "Django", "Flask", "Spring Boot",
    "Express", "Laravel", "Ruby on Rails",

    # Databases & Storage
    "PostgreSQL", "MongoDB", "Redis", "MySQL", "Cassandra", "DynamoDB",
    "Elasticsearch", "SQLite",

    # Cloud & Infrastructure
    "AWS", "Azure", "GCP", "Terraform", "Ansible",

    # Containers & Orchestration
    "Docker", "Kubernetes",

    # Message Brokers & Queues
    "Kafka", "RabbitMQ",

    # DevOps & CI/CD
    "Jenkins", "GitLab CI", "GitHub Actions", "Prometheus", "Grafana",

    # APIs & Communication
    "GraphQL", "REST", "gRPC", "WebSocket",

    # Architecture
    "Microservices",
]

# Create a dictionary for canonical mapping
CANONICAL_SKILLS = {skill.lower(): skill for skill in TECH_SKILLS}

# Convert the skills into spaCy patterns
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
    return list(extracted_skills)

@app.post("/parse")
async def parse_resume(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        # Extract text using PyPDF2 (Same as Phase 9)
        file_content = await file.read()
        pdf_stream = io.BytesIO(file_content)
        reader = PdfReader(pdf_stream)
        raw_text = " ".join([page.extract_text() for page in reader.pages if page.extract_text()])

        # 2. Process the text through the NLP pipeline
        extracted_skills = extract_skills_from_text(raw_text)

        # Return a structured, useful JSON payload
        return {
            "filename": file.filename,
            "status": "success",
            "extracted_skills": extracted_skills
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing NLP: {str(e)}")

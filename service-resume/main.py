from fastapi import FastAPI, UploadFile, File, HTTPException
from PyPDF2 import PdfReader
import spacy
from spacy.matcher import PhraseMatcher
import io

app = FastAPI(title="Resume Parsing & AI Service")

# 1. Load the NLP Model and initialize the Matcher
nlp = spacy.load("en_core_web_sm")
matcher = PhraseMatcher(nlp.vocab, attr="LOWER") # LOWER makes it case-insensitive

# A sample database of skills to look for. 
# In a real app, this might be fetched from your PostgreSQL database.
TECH_SKILLS = ["React", "Angular", "Vue", "Node.js", "NestJS", "Python", "FastAPI", "Go", "Golang", "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "Kafka", "Microservices"]

# Convert the skills into spaCy patterns
patterns = [nlp.make_doc(skill) for skill in TECH_SKILLS]
matcher.add("SKILLS", patterns)

def extract_skills_from_text(text: str):
    doc = nlp(text)
    matches = matcher(doc)
    extracted_skills = set()
    for match_id, start, end in matches:
        span = doc[start:end]
        extracted_skills.add(span.text)
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

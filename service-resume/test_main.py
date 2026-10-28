import pytest
from fastapi.testclient import TestClient
from main import app, generate_sample_pdf_bytes, extract_skills_from_pdf_bytes
from grpc_server import ResumeParserServicer
import resume_pb2
import io
from pypdf import PdfWriter

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "Resume Extractor Service is running." in data["status"]
    assert data["runtime"] == "Python 3.11 / FastAPI"
    assert data["skills_vocabulary_size"] > 0

def test_demo_ui_endpoints():
    for route in ["/", "/demo"]:
        response = client.get(route)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "seekers" in response.text.lower()
        assert "privacy" in response.text.lower()

def test_sample_resume_pdf_endpoint():
    response = client.get("/sample-resume.pdf")
    assert response.status_code == 200
    assert "application/pdf" in response.headers["content-type"]
    assert response.content.startswith(b"%PDF-1.4")
    
    # Verify the sample PDF parses cleanly with our extraction core
    outcome = extract_skills_from_pdf_bytes(response.content)
    assert outcome["success"] is True
    assert "Python" in outcome["skills"]
    assert "Go" in outcome["skills"]
    assert "Docker" in outcome["skills"]
    assert "Kubernetes" in outcome["skills"]

def test_parse_resume_real_pdf_success():
    sample_text = "Staff Backend Engineer experienced in Python, Go, Docker, Kubernetes, Kafka, and PostgreSQL."
    pdf_bytes = generate_sample_pdf_bytes("Staff Engineer Resume", sample_text)
    
    response = client.post(
        "/parse",
        files={"file": ("real_resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Python" in data["extracted_skills"]
    assert "Go" in data["extracted_skills"]
    assert "Kafka" in data["extracted_skills"]
    assert "PostgreSQL" in data["extracted_skills"]
    assert data["page_count"] == 1

def test_parse_resume_zero_skills():
    empty_skills_text = "Experienced History Teacher with over 10 years teaching world civilizations and ancient history."
    pdf_bytes = generate_sample_pdf_bytes("Teacher Resume", empty_skills_text)
    
    response = client.post(
        "/parse",
        files={"file": ("teacher_resume.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["extracted_skills"] == []

def test_parse_resume_rejects_non_pdf():
    response = client.post(
        "/parse",
        files={"file": ("resume.txt", io.BytesIO(b"Fake text data"), "text/plain")}
    )
    assert response.status_code == 400
    assert "Only PDF files are supported" in response.json()["detail"]

def test_parse_resume_rejects_invalid_pdf_signature():
    response = client.post(
        "/parse",
        files={"file": ("fake.pdf", io.BytesIO(b"NOT A REAL PDF FILE HEADER"), "application/pdf")}
    )
    assert response.status_code == 400
    assert "INVALID_PDF_SIGNATURE" in response.json()["detail"]

def test_parse_resume_rejects_scanned_pdf_no_text():
    # PDF with blank/empty text stream
    pdf_bytes = generate_sample_pdf_bytes("", "")
    
    response = client.post(
        "/parse",
        files={"file": ("scanned.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    )
    assert response.status_code == 422
    assert "SCANNED_PDF_NO_TEXT" in response.json()["detail"]

def test_parse_resume_rejects_encrypted_pdf():
    # Create real encrypted PDF with pypdf
    source_pdf = generate_sample_pdf_bytes("Encrypted Resume", "Python, React developer.")
    writer = PdfWriter()
    writer.append(io.BytesIO(source_pdf))
    writer.encrypt("secret-password")
    encrypted_stream = io.BytesIO()
    writer.write(encrypted_stream)
    encrypted_bytes = encrypted_stream.getvalue()

    response = client.post(
        "/parse",
        files={"file": ("encrypted.pdf", io.BytesIO(encrypted_bytes), "application/pdf")}
    )
    assert response.status_code == 422
    assert "ENCRYPTED_PDF" in response.json()["detail"]

def test_grpc_servicer_content_bytes_flow():
    servicer = ResumeParserServicer()
    pdf_bytes = generate_sample_pdf_bytes("Candidate CV", "Senior Engineer skilled in Go, FastAPI, and Kubernetes.")
    
    req = resume_pb2.ParseRequest(
        document_id="resumes/user-1/doc-1.pdf",
        candidate_id="user-1",
        content_bytes=pdf_bytes
    )
    res = servicer.ParseResume(req, None)
    assert res.success is True
    assert "Go" in res.skills
    assert "FastAPI" in res.skills
    assert "Kubernetes" in res.skills
    assert res.processing_time_ms >= 0

def test_grpc_servicer_scanned_rejection():
    servicer = ResumeParserServicer()
    blank_pdf = generate_sample_pdf_bytes("", "")
    req = resume_pb2.ParseRequest(
        document_id="resumes/user-2/blank.pdf",
        candidate_id="user-2",
        content_bytes=blank_pdf
    )
    res = servicer.ParseResume(req, None)
    assert res.success is False
    assert res.error_code == "SCANNED_PDF_NO_TEXT"
    assert len(res.skills) == 0

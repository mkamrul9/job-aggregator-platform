import pytest
from fastapi.testclient import TestClient
from main import app
import io
from unittest.mock import patch, MagicMock

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert "Resume Extractor Service is running." in response.json()["status"]

def test_demo_ui_endpoints():
    for route in ["/", "/demo"]:
        response = client.get(route)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "seekers" in response.text.lower()
        assert "privacy" in response.text.lower()

def test_parse_resume_rejects_non_pdf():
    response = client.post(
        "/parse",
        files={"file": ("resume.txt", io.BytesIO(b"Fake text data"), "text/plain")}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Only PDF files are supported."

@patch('main.PdfReader')
def test_parse_resume_rejects_scanned_pdf(mock_pdf_reader):
    mock_instance = MagicMock()
    mock_instance.is_encrypted = False
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "" # No text layer
    mock_instance.pages = [mock_page]
    mock_pdf_reader.return_value = mock_instance

    response = client.post(
        "/parse",
        files={"file": ("scanned_resume.pdf", io.BytesIO(b"%PDF-1.4\n..."), "application/pdf")}
    )
    assert response.status_code == 422
    assert "SCANNED_PDF_NO_TEXT" in response.json()["detail"]

@patch('main.PdfReader')
def test_parse_resume_success(mock_pdf_reader):
    mock_instance = MagicMock()
    mock_instance.is_encrypted = False
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Experienced Software Engineer skilled in Python, Java, and Kubernetes."
    mock_instance.pages = [mock_page]
    mock_pdf_reader.return_value = mock_instance

    mock_pdf_bytes = b"%PDF-1.4\n%FakePDFContent..."
    
    response = client.post(
        "/parse",
        files={"file": ("test_resume.pdf", io.BytesIO(mock_pdf_bytes), "application/pdf")}
    )
    
    assert response.status_code == 200
    assert "filename" in response.json()
    assert response.json()["status"] == "success"
    assert type(response.json()["extracted_skills"]) == list
    assert "Python" in response.json()["extracted_skills"]

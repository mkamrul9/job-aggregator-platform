import pytest
from fastapi.testclient import TestClient
from main import app
import io
from unittest.mock import patch, MagicMock

client = TestClient(app)

def test_parse_resume_rejects_non_pdf():
    # Test that the API correctly rejects invalid file types
    response = client.post(
        "/parse",
        files={"file": ("resume.txt", io.BytesIO(b"Fake text data"), "text/plain")}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Only PDF files are supported."

@patch('main.PdfReader')
def test_parse_resume_success(mock_pdf_reader):
    # Mock PyPDF2 behavior
    mock_instance = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Experienced Software Engineer skilled in Python, Java, and Kubernetes."
    mock_instance.pages = [mock_page]
    mock_pdf_reader.return_value = mock_instance

    mock_pdf_bytes = b"%PDF-1.4\n%FakePDFContent..."
    
    response = client.post(
        "/parse",
        files={"file": ("test_resume.pdf", io.BytesIO(mock_pdf_bytes), "application/pdf")}
    )
    
    # Assuming our PyPDF2 mock logic or a valid stub returns a 200
    assert response.status_code == 200
    assert "filename" in response.json()
    assert response.json()["status"] == "success"
    assert type(response.json()["extracted_skills"]) == list

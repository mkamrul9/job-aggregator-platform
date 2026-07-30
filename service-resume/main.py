from fastapi import FastAPI, UploadFile, File, HTTPException
from PyPDF2 import PdfReader
import io

app = FastAPI(title="Resume Parsing Service")

@app.post("/parse")
async def parse_resume(file: UploadFile = File(...)):
    # 1. Validate the file type
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        # 2. Read the file into memory
        file_content = await file.read()
        pdf_stream = io.BytesIO(file_content)
        
        # 3. Extract text using PyPDF2
        reader = PdfReader(pdf_stream)
        raw_text = ""
        
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                raw_text += extracted + "\n"

        # 4. Return the naive raw text
        return {
            "filename": file.filename,
            "status": "success",
            "raw_text": raw_text.strip()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

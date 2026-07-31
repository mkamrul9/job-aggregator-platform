# service-resume/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for building some Python packages
RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the spaCy NLP model
RUN python -m spacy download en_core_web_sm

# Copy the application code and shared protos
COPY . .

# Expose FastAPI (8000) and gRPC (50051)
EXPOSE 8000 50051

# Start both the REST API and the gRPC server using a shell command
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 & python grpc_server.py"]

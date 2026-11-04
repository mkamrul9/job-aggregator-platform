#!/usr/bin/env python3
"""
scripts/parse-resume-bench.py
Executes real PDF extraction and NLP skill identification via service-resume main.py.
Measures genuine execution latency per iteration and enforces strict fail-closed validation.
"""

import sys
import os
import json
import time

def run_benchmark():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "MISSING_ARGUMENT",
            "message": "Usage: parse-resume-bench.py <path_to_pdf> [iterations]",
            "completed": 0,
            "errors": 1,
            "latencies": []
        }))
        sys.exit(1)

    file_path = sys.argv[1]
    iterations = int(sys.argv[2]) if len(sys.argv) > 2 else 30

    if not os.path.exists(file_path):
        print(json.dumps({
            "success": False,
            "error": "FILE_NOT_FOUND",
            "message": f"Resume file not found: {file_path}",
            "completed": 0,
            "errors": iterations,
            "latencies": []
        }))
        sys.exit(1)

    with open(file_path, "rb") as f:
        pdf_bytes = f.read()

    # Pre-flight signature verification
    if not pdf_bytes.startswith(b"%PDF"):
        print(json.dumps({
            "success": False,
            "error": "INVALID_PDF_SIGNATURE",
            "message": "File does not start with valid %PDF header.",
            "completed": 0,
            "errors": iterations,
            "latencies": []
        }))
        sys.exit(0)

    # Import real Python parser from service-resume
    service_resume_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "service-resume"))
    if service_resume_dir not in sys.path:
        sys.path.insert(0, service_resume_dir)

    try:
        from main import extract_skills_from_pdf_bytes
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": "IMPORT_ERROR",
            "message": f"Failed to import service-resume main: {str(e)}",
            "completed": 0,
            "errors": iterations,
            "latencies": []
        }))
        sys.exit(1)

    latencies = []
    error_count = 0
    sample_skills = []

    for _ in range(iterations):
        t0 = time.perf_counter()
        try:
            outcome = extract_skills_from_pdf_bytes(pdf_bytes)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            if outcome.get("success") and isinstance(outcome.get("skills"), list):
                latencies.append(round(elapsed_ms, 2))
                sample_skills = outcome.get("skills")
            else:
                error_count += 1
        except Exception:
            error_count += 1

    print(json.dumps({
        "success": error_count == 0 and len(latencies) > 0,
        "completed": len(latencies),
        "errors": error_count,
        "latencies": latencies,
        "skills": sample_skills
    }))

if __name__ == "__main__":
    run_benchmark()

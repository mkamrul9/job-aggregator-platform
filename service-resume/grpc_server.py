import grpc
from concurrent import futures
import resume_pb2
import resume_pb2_grpc
import os
import time

# Unified extraction core from main.py
from main import extract_skills_from_pdf_bytes, extract_skills_from_text

class ResumeParserServicer(resume_pb2_grpc.ResumeParserServicer):
    def ParseResume(self, request, context):
        start_time = time.time()
        print(f"Received gRPC request for candidate: {request.candidate_id}, document: {request.document_id}")

        try:
            # 1. Preferred secure path: inline content_bytes
            if request.content_bytes and len(request.content_bytes) > 0:
                outcome = extract_skills_from_pdf_bytes(request.content_bytes)
                elapsed_ms = max(1, int((time.time() - start_time) * 1000))
                if outcome.get("success"):
                    return resume_pb2.ParseResponse(
                        success=True,
                        skills=outcome.get("skills", []),
                        processing_time_ms=elapsed_ms
                    )
                else:
                    return resume_pb2.ParseResponse(
                        success=False,
                        skills=[],
                        error_code=outcome.get("error_code", "PARSE_ERROR"),
                        error_message=outcome.get("error_message", "Failed to parse resume document."),
                        processing_time_ms=elapsed_ms
                    )

            # 2. Backward compatibility path: local file_path
            if request.file_path:
                if not os.path.exists(request.file_path):
                    print(f"File not found: {request.file_path}")
                    elapsed_ms = max(1, int((time.time() - start_time) * 1000))
                    return resume_pb2.ParseResponse(
                        success=False,
                        skills=[],
                        error_code="FILE_NOT_FOUND",
                        error_message="Specified file path does not exist on filesystem.",
                        processing_time_ms=elapsed_ms
                    )

                with open(request.file_path, "rb") as f:
                    file_bytes = f.read()

                outcome = extract_skills_from_pdf_bytes(file_bytes)
                elapsed_ms = max(1, int((time.time() - start_time) * 1000))

                return resume_pb2.ParseResponse(
                    success=outcome.get("success", False),
                    skills=outcome.get("skills", []),
                    error_code=outcome.get("error_code", ""),
                    error_message=outcome.get("error_message", ""),
                    processing_time_ms=elapsed_ms
                )

            # 3. Neither provided
            elapsed_ms = max(1, int((time.time() - start_time) * 1000))
            return resume_pb2.ParseResponse(
                success=False,
                skills=[],
                error_code="INVALID_REQUEST",
                error_message="Neither content_bytes nor file_path was provided in ParseRequest.",
                processing_time_ms=elapsed_ms
            )

        except Exception as e:
            elapsed_ms = max(1, int((time.time() - start_time) * 1000))
            print(f"Error in gRPC ParseResume: {e}")
            return resume_pb2.ParseResponse(
                success=False,
                skills=[],
                error_code="INTERNAL_ERROR",
                error_message=f"Parser execution encountered unhandled error: {str(e)}",
                processing_time_ms=elapsed_ms
            )

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    resume_pb2_grpc.add_ResumeParserServicer_to_server(ResumeParserServicer(), server)
    server.add_insecure_port('[::]:50051')
    print("gRPC Server running on port 50051")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()

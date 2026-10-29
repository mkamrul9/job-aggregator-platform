import grpc
from concurrent import futures
import resume_pb2
import resume_pb2_grpc
import os
import time

# Unified extraction core from main.py
from main import extract_skills_from_pdf_bytes, extract_skills_from_text

MAX_MESSAGE_LENGTH = 16 * 1024 * 1024  # 16 MB

class ResumeParserServicer(resume_pb2_grpc.ResumeParserServicer):
    def ParseResume(self, request, context):
        start_time = time.time()
        byte_len = len(request.content_bytes) if request.content_bytes else 0
        print(f"Received gRPC ParseResume request (payload bytes: {byte_len})")

        # 1. Enforce service authentication if configured
        expected_token = os.getenv("RESUME_SERVICE_TOKEN")
        if expected_token:
            metadata = dict(context.invocation_metadata()) if context else {}
            auth_header = metadata.get("x-service-auth") or metadata.get("authorization")
            if not auth_header or (auth_header != expected_token and auth_header != f"Bearer {expected_token}"):
                if context:
                    context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid or missing service credentials")
                return resume_pb2.ParseResponse(
                    success=False,
                    skills=[],
                    error_code="UNAUTHENTICATED",
                    error_message="Service authentication required.",
                    processing_time_ms=1
                )

        try:
            # 2. Preferred secure path: inline content_bytes
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

            # 3. Disallow arbitrary local file_path in integrated / production mode
            if request.file_path:
                if os.getenv("ALLOW_LOCAL_FILE_PATH") != "true":
                    elapsed_ms = max(1, int((time.time() - start_time) * 1000))
                    return resume_pb2.ParseResponse(
                        success=False,
                        skills=[],
                        error_code="FORBIDDEN_INPUT_MODE",
                        error_message="Raw file_path access is forbidden. Pass content_bytes directly.",
                        processing_time_ms=elapsed_ms
                    )

                if not os.path.exists(request.file_path):
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

            # 4. Neither provided
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
            return resume_pb2.ParseResponse(
                success=False,
                skills=[],
                error_code="INTERNAL_ERROR",
                error_message=f"Parser execution encountered unhandled error: {str(e)}",
                processing_time_ms=elapsed_ms
            )

def serve():
    options = [
        ('grpc.max_receive_message_length', MAX_MESSAGE_LENGTH),
        ('grpc.max_send_message_length', MAX_MESSAGE_LENGTH),
    ]
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
    resume_pb2_grpc.add_ResumeParserServicer_to_server(ResumeParserServicer(), server)
    port = os.getenv("PORT", "50051")
    server.add_insecure_port(f'[::]:{port}')
    print(f"gRPC Server running on port {port} (max message limit: {MAX_MESSAGE_LENGTH} bytes)")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()

import grpc
from concurrent import futures
import resume_pb2
import resume_pb2_grpc
import os
from PyPDF2 import PdfReader

# Import the AI logic we built in Phase 10
from main import extract_skills_from_text 

class ResumeParserServicer(resume_pb2_grpc.ResumeParserServicer):
    def ParseResume(self, request, context):
        print(f"Received gRPC request to parse: {request.file_path}")
        
        try:
            if not os.path.exists(request.file_path):
                print(f"File not found: {request.file_path}")
                return resume_pb2.ParseResponse(success=False, skills=[])
            
            reader = PdfReader(request.file_path)
            raw_text = " ".join([page.extract_text() for page in reader.pages if page.extract_text()])
            skills = extract_skills_from_text(raw_text) 
            
            return resume_pb2.ParseResponse(
                success=True,
                skills=skills
            )
        except Exception as e:
            print(f"Error parsing resume: {e}")
            return resume_pb2.ParseResponse(success=False, skills=[])

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    resume_pb2_grpc.add_ResumeParserServicer_to_server(ResumeParserServicer(), server)
    server.add_insecure_port('[::]:50051')
    print("gRPC Server running on port 50051")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()

import grpc
from concurrent import futures
import resume_pb2
import resume_pb2_grpc

# Import the AI logic we built in Phase 10
from main import extract_skills_from_text 

class ResumeParserServicer(resume_pb2_grpc.ResumeParserServicer):
    def ParseResume(self, request, context):
        print(f"Received gRPC request to parse: {request.file_path}")
        
        # In reality, you'd download the file from the URL/Path here.
        # For the sake of the example, we simulate extracting text.
        simulated_text = "Experienced in Node.js, Next.js, and Docker."
        
        # Use our spaCy logic
        skills = extract_skills_from_text(simulated_text) 
        
        return resume_pb2.ParseResponse(
            success=True,
            skills=skills
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

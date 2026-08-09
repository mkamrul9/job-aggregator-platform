import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { Observable } from 'rxjs';
import { UserRepository } from './user.repository';

interface ParseResponse {
  success: boolean;
  skills: string[];
}

// Define the TypeScript interface matching the Protobuf
interface ResumeParserService {
  parseResume(data: { filePath: string }): Observable<ParseResponse>;
}

@Injectable()
export class UserService implements OnModuleInit {
  private resumeService: ResumeParserService;

  constructor(
    @Inject('RESUME_PACKAGE') private client: ClientGrpc,
    private readonly userRepository: UserRepository
  ) {}

  onModuleInit() {
    // Dynamically bind the gRPC service
    this.resumeService = this.client.getService<ResumeParserService>('ResumeParser');
  }

  async findOrCreateUser(data: { id: string; email: string }) {
    return this.userRepository.upsertUser(data.id, data.email);
  }

  async processUserResume(userId: string, fileUrl: string) {
    // 1. Make the ultra-fast gRPC call to Python
    const grpcResponse = this.resumeService.parseResume({ filePath: fileUrl });
    
    // NestJS uses RxJS Observables, so we convert it to a Promise
    const result = await lastValueFrom(grpcResponse);

    if (result.success) {
      // 2. Save the extracted skills to PostgreSQL using Repository
      return this.userRepository.updateSkills(userId, result.skills);
    }
    throw new Error('Failed to parse resume via AI service');
  }
}

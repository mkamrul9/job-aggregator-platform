import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { Observable } from 'rxjs';

const prisma = new PrismaClient();

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

  constructor(@Inject('RESUME_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    // Dynamically bind the gRPC service
    this.resumeService = this.client.getService<ResumeParserService>('ResumeParser');
  }

  async findOrCreateUser(data: { id: string; email: string }) {
    // Upsert ensures we don't crash if the user already exists
    return prisma.user.upsert({
      where: { id: data.id },
      update: {}, // Do nothing if they exist
      create: {
        id: data.id,
        email: data.email,
        passwordHash: 'MANAGED_BY_FIREBASE', 
      },
    });
  }

  async processUserResume(userId: string, fileUrl: string) {
    // 1. Make the ultra-fast gRPC call to Python
    const grpcResponse = this.resumeService.parseResume({ filePath: fileUrl });
    
    // NestJS uses RxJS Observables, so we convert it to a Promise
    const result = await lastValueFrom(grpcResponse);

    if (result.success) {
      // 2. Save the extracted skills to PostgreSQL using Prisma
      // Note: Assuming a profile relation exists or update creates it if needed.
      // Based on previous phases, Prisma schema has a Profile.
      // If profile doesn't exist for the user, upsert is safer, but we follow snippet.
      // Snippet provided by user is update.
      return prisma.profile.upsert({
        where: { userId },
        update: { extractedSkills: result.skills },
        create: { userId: userId, extractedSkills: result.skills }
      });
    }
    throw new Error('Failed to parse resume via AI service');
  }
}

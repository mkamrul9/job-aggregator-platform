import {
  Injectable,
  Inject,
  Optional,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { UserRepository } from './user.repository';
import {
  UserProfileResponseDto,
  mapToUserProfileResponse,
} from './dto/user-profile-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

interface ParseResponse {
  success: boolean;
  skills: string[];
}

interface ResumeParserService {
  parseResume(data: { filePath: string }): Observable<ParseResponse>;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private resumeService: ResumeParserService | null = null;

  constructor(
    private readonly userRepository: UserRepository,
    @Optional() @Inject('RESUME_PACKAGE') private client?: ClientGrpc,
  ) {}

  private getResumeService(): ResumeParserService | null {
    if (!this.resumeService && this.client) {
      try {
        this.resumeService =
          this.client.getService<ResumeParserService>('ResumeParser');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not resolve gRPC ResumeParser service: ${msg}`);
      }
    }
    return this.resumeService;
  }

  async syncUser(data: {
    id: string;
    email: string;
    emailVerified?: boolean;
  }): Promise<{ message: string; user: UserProfileResponseDto }> {
    const user = await this.userRepository.upsertUser(
      data.id,
      data.email,
      data.emailVerified ?? false,
    );
    return {
      message: 'User synchronized successfully with PostgreSQL',
      user: mapToUserProfileResponse(user, user.profile),
    };
  }

  // Legacy compatibility alias
  async findOrCreateUser(data: { id: string; email: string }) {
    return this.userRepository.upsertUser(data.id, data.email, false);
  }

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message:
          'Candidate account not found in database. Account synchronization pending.',
      });
    }
    return mapToUserProfileResponse(user, user.profile);
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    const user = await this.userRepository.updateProfile(userId, data);
    return mapToUserProfileResponse(user, user.profile);
  }

  async exportUserData(userId: string): Promise<{
    user_id: string;
    exported_at: string;
    request_id: string;
    status: string;
    profile: UserProfileResponseDto;
    applications: unknown[];
    saved_jobs: unknown[];
    alerts: unknown[];
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Cannot export data: candidate account not found.',
      });
    }

    const exportRecord = await this.userRepository.createExportRequest(userId);

    return {
      user_id: user.id,
      exported_at: new Date().toISOString(),
      request_id: exportRecord.id,
      status: exportRecord.status,
      profile: mapToUserProfileResponse(user, user.profile),
      // Connected in later phases as scoped by PRODUCTION_ROADMAP:
      applications: [],
      saved_jobs: [],
      alerts: [],
    };
  }

  async requestAccountDeletion(
    userId: string,
    idempotencyKey?: string,
    reason?: string,
  ): Promise<{
    success: boolean;
    message: string;
    request_id: string;
    status: string;
    scheduled_for: string;
    requested_at: string;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Cannot register deletion: candidate account not found.',
      });
    }

    const deletionRecord = await this.userRepository.createDeletionRequest(
      userId,
      idempotencyKey,
      reason,
    );

    return {
      success: true,
      message:
        'Account erasure initiated. A 30-day grace period is active before permanent deletion.',
      request_id: deletionRecord.id,
      status: deletionRecord.status,
      scheduled_for: deletionRecord.scheduledFor.toISOString(),
      requested_at: deletionRecord.requestedAt.toISOString(),
    };
  }

  async getAccountStatus(userId: string) {
    const status = await this.userRepository.getAccountStatus(userId);
    return {
      user_id: userId,
      has_pending_deletion: !!status.pendingDeletion,
      pending_deletion: status.pendingDeletion
        ? {
            id: status.pendingDeletion.id,
            status: status.pendingDeletion.status,
            requested_at: status.pendingDeletion.requestedAt.toISOString(),
            scheduled_for: status.pendingDeletion.scheduledFor.toISOString(),
          }
        : null,
      recent_exports: status.recentExports.map((e) => ({
        id: e.id,
        status: e.status,
        requested_at: e.requestedAt.toISOString(),
      })),
    };
  }

  async processUserResume(userId: string, fileUrl: string) {
    const parser = this.getResumeService();
    if (!parser) {
      throw new ServiceUnavailableException({
        code: 'PARSER_UNAVAILABLE',
        message:
          'Python gRPC Resume Extractor service is not connected or currently offline.',
      });
    }

    try {
      const grpcResponse = parser.parseResume({ filePath: fileUrl });
      const result = await lastValueFrom(grpcResponse);

      if (result.success) {
        return this.userRepository.updateSkills(userId, result.skills);
      }
      throw new HttpException(
        'Resume could not be parsed. Ensure the PDF contains selectable text.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      throw new ServiceUnavailableException({
        code: 'PARSER_FAILURE',
        message: 'Resume parsing gRPC call failed to reach Python backend.',
      });
    }
  }
}

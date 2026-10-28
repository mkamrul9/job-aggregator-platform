import {
  Injectable,
  Inject,
  Optional,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { UserRepository } from './user.repository';
import { StorageService } from '../storage/storage.service';
import {
  UserProfileResponseDto,
  mapToUserProfileResponse,
} from './dto/user-profile-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { randomUUID } from 'crypto';
import * as path from 'path';

interface ParseRequest {
  filePath?: string;
  documentId?: string;
  contentBytes?: Buffer | Uint8Array;
  candidateId?: string;
}

interface ParseResponse {
  success: boolean;
  skills: string[];
  errorCode?: string;
  errorMessage?: string;
  processingTimeMs?: number;
}

interface ResumeParserService {
  parseResume(data: ParseRequest): Observable<ParseResponse>;
}

export interface ResumeUploadResult {
  parse_id: string;
  status: 'QUEUED' | 'PROCESSING';
  message: string;
}

export interface ResumeParseStatusResponse {
  parse_id: string;
  status: string;
  extracted_skills: string[];
  error_code?: string;
  processing_time_ms?: number;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private resumeService: ResumeParserService | null = null;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly storageService: StorageService,
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

  async findOrCreateUser(data: { id: string; email: string }) {
    return this.userRepository.upsertUser(data.id, data.email, false);
  }

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `Candidate account not found in database. Account synchronization pending.`,
      });
    }

    return mapToUserProfileResponse(user, user.profile);
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    const updatedUser = await this.userRepository.updateProfile(userId, data);
    return mapToUserProfileResponse(updatedUser, updatedUser.profile);
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
      applications: [],
      saved_jobs: [],
      alerts: [],
    };
  }

  async requestAccountExport(userId: string) {
    return this.exportUserData(userId);
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

  // ─── P08 RESUME UPLOAD, ASYNCHRONOUS PROCESSING & REVIEW ────────────────────

  /**
   * Accepts a PDF resume upload, validates signature and 10MB bounds,
   * stores to private object storage, creates durable records, and starts async parsing.
   */
  async uploadResume(
    userId: string,
    file: Express.Multer.File,
  ): Promise<ResumeUploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided for resume upload');
    }

    let buffer: Buffer;
    if (file.buffer) {
      buffer = file.buffer;
    } else if (file.path) {
      const fs = await import('fs');
      buffer = await fs.promises.readFile(file.path);
    } else {
      throw new BadRequestException('Uploaded file stream is empty or invalid');
    }

    // 1. Validate magic bytes (%PDF) and 10MB ceiling
    this.storageService.validatePdfBuffer(buffer);

    // 2. Compute checksum and generate opaque identifiers
    const checksumSha256 = this.storageService.computeChecksumSha256(buffer);
    const documentId = randomUUID();
    const parseId = randomUUID();
    const storageKey = `resumes/${userId}/${documentId}.pdf`;

    // 3. Persist to isolated private object storage
    await this.storageService.putObject(storageKey, buffer);

    // 4. Sanitize display filename
    const safeFileName = path
      .basename(file.originalname || 'resume.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    // 5. Persist durable ResumeDocument and ResumeParseResult records
    await this.userRepository.createResumeDocument({
      id: documentId,
      userId,
      storageKey,
      fileName: safeFileName,
      fileSizeBytes: buffer.length,
      checksumSha256,
      status: 'UPLOADED',
    });

    await this.userRepository.createParseResult({
      id: parseId,
      documentId,
      userId,
      status: 'QUEUED',
    });

    // 6. Update candidate profile resumeUrl pointer
    await this.userRepository.updateProfile(userId, {});

    // 7. Dispatch asynchronous parsing worker
    this.dispatchParseWorker(
      parseId,
      documentId,
      userId,
      buffer,
      storageKey,
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Async worker failed for parse ${parseId}: ${msg}`);
    });

    return {
      parse_id: parseId,
      status: 'QUEUED',
      message: 'Resume accepted for asynchronous processing.',
    };
  }

  /**
   * Internal asynchronous worker that claims the parse task and invokes the gRPC parser.
   */
  private async dispatchParseWorker(
    parseId: string,
    documentId: string,
    userId: string,
    buffer: Buffer,
    storageKey: string,
  ): Promise<void> {
    await this.userRepository.updateParseResult(parseId, {
      status: 'PROCESSING',
      claimedBy: 'worker-primary',
      claimedUntil: new Date(Date.now() + 60000), // 60s lease
    });

    const parser = this.getResumeService();
    if (!parser) {
      await this.userRepository.updateParseResult(parseId, {
        status: 'FAILED',
        errorCode: 'PARSER_UNAVAILABLE',
        errorMessage: 'Python gRPC Resume Extractor service is not connected.',
      });
      await this.userRepository.updateResumeStatus(documentId, 'FAILED');
      return;
    }

    try {
      const grpcResponse = parser.parseResume({
        documentId: storageKey,
        contentBytes: buffer,
        candidateId: userId,
      });

      const result = await lastValueFrom(grpcResponse);

      if (result.success) {
        await this.userRepository.updateParseResult(parseId, {
          status: 'COMPLETED',
          extractedSkills: result.skills || [],
          processingTimeMs: result.processingTimeMs || 0,
        });

        await this.userRepository.updateResumeStatus(documentId, 'PARSED');
        await this.userRepository.updateSkills(userId, result.skills || []);
      } else {
        await this.userRepository.updateParseResult(parseId, {
          status: 'FAILED',
          errorCode: result.errorCode || 'PARSE_FAILED',
          errorMessage: result.errorMessage || 'Resume could not be parsed.',
          processingTimeMs: result.processingTimeMs || 0,
        });

        await this.userRepository.updateResumeStatus(documentId, 'FAILED');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error calling ResumeParser gRPC: ${msg}`);
      await this.userRepository.updateParseResult(parseId, {
        status: 'FAILED',
        errorCode: 'RPC_COMMUNICATION_ERROR',
        errorMessage:
          'Internal communication error with resume extractor service.',
      });
      await this.userRepository.updateResumeStatus(documentId, 'FAILED');
    }
  }

  /**
   * Retrieves the current parse task status for the owning candidate.
   */
  async getParseStatus(
    userId: string,
    parseId: string,
  ): Promise<ResumeParseStatusResponse> {
    const parseResult = await this.userRepository.findParseResultById(parseId);
    if (!parseResult || parseResult.userId !== userId) {
      throw new NotFoundException({
        code: 'PARSE_TASK_NOT_FOUND',
        message: `Resume parse task ${parseId} was not found for this candidate.`,
      });
    }

    return {
      parse_id: parseResult.id,
      status: parseResult.status,
      extracted_skills: parseResult.extractedSkills,
      error_code: parseResult.errorCode || undefined,
      processing_time_ms: parseResult.processingTimeMs || undefined,
    };
  }

  /**
   * Applies candidate-selected skills from a completed parse task to the profile.
   */
  async reviewParseSkills(
    userId: string,
    parseId: string,
    selectedSkills: string[],
  ): Promise<UserProfileResponseDto> {
    const parseResult = await this.userRepository.findParseResultById(parseId);
    if (!parseResult || parseResult.userId !== userId) {
      throw new NotFoundException({
        code: 'PARSE_TASK_NOT_FOUND',
        message: `Resume parse task ${parseId} was not found for this candidate.`,
      });
    }

    if (parseResult.status !== 'COMPLETED') {
      throw new BadRequestException({
        code: 'PARSE_TASK_INCOMPLETE',
        message: `Cannot review skills: task is currently in ${parseResult.status} state.`,
      });
    }

    const updatedUser = await this.userRepository.applyReviewedSkills(
      userId,
      parseId,
      selectedSkills || [],
    );

    return mapToUserProfileResponse(updatedUser, updatedUser.profile);
  }

  /**
   * Deletes the active candidate resume and associated storage object.
   */
  async deleteResume(userId: string): Promise<{ message: string }> {
    const doc = await this.userRepository.deleteActiveResume(userId);
    if (doc) {
      await this.storageService.deleteObject(doc.storageKey);
    }
    return { message: 'Resume document deleted successfully' };
  }

  /**
   * Retrieves the active resume document file for secure candidate download.
   */
  async downloadResume(
    userId: string,
    documentId?: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const doc = documentId
      ? await this.userRepository.findResumeById(documentId)
      : await this.userRepository.findActiveResume(userId);

    if (!doc || doc.userId !== userId || doc.status === 'DELETED') {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'No active resume document found for this candidate.',
      });
    }

    const buffer = await this.storageService.getObject(doc.storageKey);
    if (!buffer) {
      throw new NotFoundException({
        code: 'STORAGE_OBJECT_NOT_FOUND',
        message:
          'Resume document file could not be located in private storage.',
      });
    }

    return {
      buffer,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  }

  // ─── LEGACY COMPATIBILITY ───────────────────────────────────────────────────

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

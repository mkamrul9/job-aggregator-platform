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
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Metadata } from '@grpc/grpc-js';
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
  parseResume(
    data: ParseRequest,
    metadata?: Metadata,
  ): Observable<ParseResponse>;
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
export class UserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserService.name);
  private resumeService: ResumeParserService | null = null;
  private workerLoopTimer: NodeJS.Timeout | null = null;
  private readonly workerId = `worker-${process.pid}-${randomUUID().slice(0, 6)}`;
  private isShuttingDown = false;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly storageService: StorageService,
    @Optional() @Inject('RESUME_PACKAGE') private client?: ClientGrpc,
  ) {}

  onModuleInit() {
    this.startWorkerLoop();
  }

  onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.workerLoopTimer) {
      clearInterval(this.workerLoopTimer);
      this.workerLoopTimer = null;
    }
  }

  private startWorkerLoop() {
    this.workerLoopTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      void this.processNextParseTask().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(`Worker poll iteration error: ${msg}`);
      });
    }, 2000);
  }

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
   * stores to private object storage, creates durable records, and triggers worker.
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

    // 2. Compute checksum and generate opaque identifiers with safe user ID segment
    const checksumSha256 = this.storageService.computeChecksumSha256(buffer);
    const documentId = randomUUID();
    const parseId = randomUUID();
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storageKey = `resumes/${safeUserId}/${documentId}.pdf`;

    // 3. Persist to isolated private object storage atomically
    await this.storageService.putObject(storageKey, buffer);

    // 4. Sanitize display filename
    const safeFileName = path
      .basename(file.originalname || 'resume.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    // 5. Atomically supersede prior active documents and create new ResumeDocument + ParseResult
    await this.userRepository.createResumeDocumentAtomic({
      documentId,
      parseId,
      userId,
      storageKey,
      fileName: safeFileName,
      fileSizeBytes: buffer.length,
      checksumSha256,
      mimeType: 'application/pdf',
    });

    // 6. Update candidate profile pointer
    await this.userRepository.updateProfileResumeUrl(userId, storageKey);

    // 7. Trigger worker immediately for responsive execution
    this.processNextParseTask().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Immediate worker trigger: ${msg}`);
    });

    return {
      parse_id: parseId,
      status: 'QUEUED',
      message: 'Resume accepted for asynchronous processing.',
    };
  }

  /**
   * Persistent worker loop processor: claims next task, reads from durable storage,
   * calls gRPC with deadline, and performs fenced completion without clobbering profile skills.
   */
  async processNextParseTask(): Promise<boolean> {
    const task = await this.userRepository.claimNextPendingParseTask(
      this.workerId,
      60000,
    );
    if (!task) return false;

    // 1. Read input bytes from durable private storage
    const buffer = await this.storageService.getObject(
      task.document.storageKey,
    );
    if (!buffer) {
      await this.userRepository.completeParseTaskFenced(
        task.id,
        task.fenceToken,
        this.workerId,
        {
          success: false,
          errorCode: 'STORAGE_OBJECT_NOT_FOUND',
          errorMessage: 'Resume file could not be read from private storage.',
        },
      );
      return true;
    }

    // 2. Resolve Python gRPC parser
    const parser = this.getResumeService();
    if (!parser) {
      await this.userRepository.completeParseTaskFenced(
        task.id,
        task.fenceToken,
        this.workerId,
        {
          success: false,
          errorCode: 'PARSER_UNAVAILABLE',
          errorMessage:
            'Python gRPC Resume Extractor service is not connected.',
        },
      );
      return true;
    }

    // 3. Invoke gRPC with finite deadline and service auth metadata
    try {
      const metadata = new Metadata();
      if (process.env.RESUME_SERVICE_TOKEN) {
        metadata.add('x-service-auth', process.env.RESUME_SERVICE_TOKEN);
      }

      const response$ = parser
        .parseResume(
          {
            documentId: task.document.storageKey,
            contentBytes: buffer,
            candidateId: task.userId,
          },
          metadata,
        )
        .pipe(timeout(10000)); // 10-second total RPC deadline

      const result = await lastValueFrom(response$);

      await this.userRepository.completeParseTaskFenced(
        task.id,
        task.fenceToken,
        this.workerId,
        {
          success: Boolean(result.success),
          extractedSkills: result.skills || [],
          errorCode: result.errorCode || undefined,
          errorMessage: result.errorMessage || undefined,
          processingTimeMs: result.processingTimeMs || 0,
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error executing ResumeParser gRPC: ${msg}`);
      await this.userRepository.completeParseTaskFenced(
        task.id,
        task.fenceToken,
        this.workerId,
        {
          success: false,
          errorCode: 'RPC_COMMUNICATION_ERROR',
          errorMessage: `Communication error with extractor service: ${msg}`,
        },
      );
    }

    return true;
  }

  /**
   * Retrieves active resume document and latest parse information for candidate UI hydration.
   */
  async getActiveResume(userId: string) {
    const { document, latestParse } =
      await this.userRepository.findActiveResumeWithLatestParse(userId);

    if (!document) {
      return {
        has_resume: false,
        document: null,
        latest_parse: null,
      };
    }

    return {
      has_resume: true,
      document: {
        id: document.id,
        file_name: document.fileName,
        file_size_bytes: document.fileSizeBytes,
        status: document.status,
        created_at: document.createdAt.toISOString(),
      },
      latest_parse: latestParse
        ? {
            id: latestParse.id,
            status: latestParse.status,
            extracted_skills: latestParse.extractedSkills,
            reviewed_skills: latestParse.reviewedSkills,
            reviewed_at: latestParse.reviewedAt?.toISOString() || null,
            error_code: latestParse.errorCode || null,
          }
        : null,
    };
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
    const updatedUser = await this.userRepository.applyReviewedSkills(
      userId,
      parseId,
      selectedSkills || [],
    );

    return mapToUserProfileResponse(updatedUser, updatedUser.profile);
  }

  /**
   * Deletes the candidate resume with durable object storage cleanup and tombstones.
   */
  async deleteResume(userId: string): Promise<{ message: string }> {
    const deletedDocs =
      await this.userRepository.markActiveResumeDeleted(userId);
    const pendingCleanups =
      await this.userRepository.findPendingCleanups(userId);

    const docsToClean = Array.from(
      new Map(
        [...deletedDocs, ...pendingCleanups].map((d) => [d.id, d]),
      ).values(),
    );

    let allSucceeded = true;
    for (const doc of docsToClean) {
      try {
        await this.storageService.deleteObject(doc.storageKey);
        await this.userRepository.updateDocumentCleanupStatus(
          doc.id,
          'CLEANED',
        );
      } catch (err: unknown) {
        allSucceeded = false;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Storage cleanup failed for document ${doc.id}: ${msg}`,
        );
        await this.userRepository.updateDocumentCleanupStatus(
          doc.id,
          'CLEANUP_FAILED',
        );
      }
    }

    return {
      message: allSucceeded
        ? 'Resume document deleted successfully'
        : 'Resume marked deleted; storage cleanup scheduled.',
    };
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

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
import * as crypto from 'crypto';
import { UserRepository } from './user.repository';
import { StorageService } from '../storage/storage.service';
import {
  UserProfileResponseDto,
  mapToUserProfileResponse,
} from './dto/user-profile-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { TrackedApplication, ApplicationHistory } from '@prisma/client';
import type {
  JobSnapshotInput,
  CatalogJobResponse,
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
  TrackApplicationDto,
  UpdateApplicationDto,
  CreateReportDto,
  TriageReportDto,
  CreateAlertDto,
  PaginationOptionsDto,
  RecommendationFeedbackDto,
  RecommendationsResponseDto,
  RecommendationFeedbackResponseDto,
} from './dto/workspace.dto';
import {
  filterAndRankRecommendations,
  STANDALONE_SEED_JOBS,
  RECOMMENDATION_ALGORITHM_VERSION,
  CandidateMatchingProfile,
} from './recommendation-engine';
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
    this.recommendationsCache.delete(userId);
    return mapToUserProfileResponse(updatedUser, updatedUser.profile);
  }

  async exportUserData(userId: string): Promise<{
    user_id: string;
    exported_at: string;
    request_id: string;
    status: string;
    profile: UserProfileResponseDto;
    saved_jobs: unknown[];
    saved_searches: unknown[];
    applications: unknown[];
    reports: unknown[];
    alerts: unknown[];
    recommendations_feedback?: unknown[];
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Cannot export data: candidate account not found.',
      });
    }

    const exportRecord = await this.userRepository.createExportRequest(userId);
    const comprehensive =
      await this.userRepository.getComprehensiveUserData(userId);

    return {
      user_id: user.id,
      exported_at: new Date().toISOString(),
      request_id: exportRecord.id,
      status: exportRecord.status,
      profile: mapToUserProfileResponse(user, user.profile),
      saved_jobs: comprehensive.savedJobs.map((j) => ({
        id: j.id,
        job_id: j.jobId,
        title: j.titleSnapshot,
        company: j.companySnapshot,
        location: j.locationSnapshot,
        saved_at: j.createdAt.toISOString(),
      })),
      saved_searches: comprehensive.savedSearches.map((s) => ({
        id: s.id,
        name: s.name,
        query: s.query,
        location: s.location,
        created_at: s.createdAt.toISOString(),
      })),
      applications: comprehensive.applications.map((a) => ({
        id: a.id,
        job_id: a.jobId,
        title: a.titleSnapshot,
        company: a.companySnapshot,
        status: a.status,
        notes: a.notes,
        applied_at: a.appliedAt.toISOString(),
        history: a.history.map((h) => ({
          from_status: h.fromStatus,
          to_status: h.toStatus,
          changed_at: h.changedAt.toISOString(),
        })),
      })),
      reports: comprehensive.supportReports.map((r) => ({
        id: r.id,
        reference_num: r.referenceNum,
        report_type: r.reportType,
        status: r.status,
        created_at: r.createdAt.toISOString(),
      })),
      alerts: comprehensive.alerts.map((al) => ({
        id: al.id,
        query: al.query,
        location: al.location,
        frequency: al.frequency,
        active: al.active,
        created_at: al.createdAt.toISOString(),
      })),
      recommendations_feedback: (
        comprehensive.recommendationFeedback || []
      ).map((f) => ({
        id: f.id,
        job_id: f.jobId,
        action: f.action,
        reason: f.reason,
        created_at: f.createdAt.toISOString(),
      })),
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
    this.recommendationsCache.delete(userId);
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

  // ─── P09 CANDIDATE WORKSPACE & SUPPORT ─────────────────────────────────────

  private readonly catalogCache = new Map<
    string,
    {
      result:
        | { kind: 'FOUND'; job: CatalogJobResponse }
        | { kind: 'NOT_FOUND' }
        | { kind: 'UNAVAILABLE' };
      expiresAt: number;
    }
  >();

  private readonly recommendationsCache = new Map<
    string,
    {
      result: RecommendationsResponseDto;
      expiresAt: number;
      profileVersion: string;
    }
  >();

  /**
   * Verified catalog job fetch from authoritative service-ingestion API with 30s cache.
   */
  async fetchCatalogJob(
    jobId: string,
  ): Promise<
    | { kind: 'FOUND'; job: CatalogJobResponse }
    | { kind: 'NOT_FOUND' }
    | { kind: 'UNAVAILABLE' }
  > {
    const cached = this.catalogCache.get(jobId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const ingestionUrl =
      process.env.INGESTION_SERVICE_URL || 'http://localhost:5000';
    try {
      const res = await fetch(`${ingestionUrl}/api/v1/jobs/${jobId}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
      });

      if (res.status === 200) {
        const job = (await res.json()) as CatalogJobResponse;
        const result = { kind: 'FOUND' as const, job };
        this.catalogCache.set(jobId, {
          result,
          expiresAt: Date.now() + 30_000,
        });
        return result;
      }

      if (res.status === 404) {
        const result = { kind: 'NOT_FOUND' as const };
        this.catalogCache.set(jobId, {
          result,
          expiresAt: Date.now() + 10_000,
        });
        return result;
      }

      return { kind: 'UNAVAILABLE' };
    } catch {
      return { kind: 'UNAVAILABLE' };
    }
  }

  // ─── SAVED JOBS ──────────────────────────────────────────────────────────

  async saveJob(
    userId: string,
    jobId: string,
    fallbackSnapshot?: JobSnapshotInput,
  ) {
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new BadRequestException('Valid jobId is required to save a job.');
    }

    // Block unsafe URLs (such as javascript: or data:)
    const rawUrl = fallbackSnapshot?.job_url || fallbackSnapshot?.jobUrl;
    if (rawUrl) {
      const trimmed = rawUrl.trim().toLowerCase();
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        throw new BadRequestException('Job URL must use http or https scheme.');
      }
    }

    const catalogResult = await this.fetchCatalogJob(jobId);

    // Definite 404 from authoritative catalog -> reject saving non-existent listing
    if (catalogResult.kind === 'NOT_FOUND') {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job ${jobId} was not found in the canonical job catalog.`,
      });
    }

    let title: string;
    let company: string;
    let location: string | undefined;
    let jobUrl: string | undefined;
    let salary: string | undefined;
    let source: string;
    let statusAtSave: string;

    if (catalogResult.kind === 'FOUND') {
      const catalogJob = catalogResult.job;
      title = catalogJob.title;
      company = catalogJob.company;
      location = catalogJob.location;
      jobUrl = catalogJob.canonical_url || catalogJob.job_url || rawUrl;
      salary = catalogJob.salary
        ? typeof catalogJob.salary === 'object'
          ? `${catalogJob.salary.min || ''}-${catalogJob.salary.max || ''} ${catalogJob.salary.currency || ''}`.trim()
          : String(catalogJob.salary)
        : fallbackSnapshot?.salary;
      source = catalogJob.source || fallbackSnapshot?.source || 'platform';
      const isExpired =
        catalogJob.status === 'EXPIRED' ||
        Boolean(catalogJob.is_expired) ||
        Boolean(
          catalogJob.expires_at &&
          new Date(catalogJob.expires_at).getTime() <= Date.now(),
        );
      statusAtSave = isExpired ? 'EXPIRED' : catalogJob.status || 'ACTIVE';
    } else {
      // Outage / timeout: allow saving if snapshot is present, but explicitly stage as UNVERIFIED
      if (!fallbackSnapshot?.title || !fallbackSnapshot?.company) {
        throw new BadRequestException(
          'Catalog service is currently unavailable and snapshot details were not provided.',
        );
      }
      title = fallbackSnapshot.title;
      company = fallbackSnapshot.company;
      location = fallbackSnapshot.location;
      jobUrl = rawUrl;
      salary = fallbackSnapshot.salary;
      source = fallbackSnapshot.source || 'platform';
      statusAtSave = 'UNVERIFIED';
    }

    const saved = await this.userRepository.saveJob(userId, jobId, {
      title,
      company,
      location,
      jobUrl,
      salary,
      source,
      statusAtSave,
    });

    return {
      id: saved.id,
      job_id: saved.jobId,
      title: saved.titleSnapshot,
      company: saved.companySnapshot,
      location: saved.locationSnapshot,
      salary: saved.salarySnapshot,
      job_url: saved.jobUrlSnapshot,
      source: saved.sourceSnapshot,
      status: saved.statusAtSave,
      created_at: saved.createdAt.toISOString(),
    };
  }

  async unsaveJob(userId: string, jobId: string) {
    const success = await this.userRepository.unsaveJob(userId, jobId);
    return {
      success,
      message: success ? 'Job unsaved.' : 'Job was not saved.',
    };
  }

  async getSavedJobs(userId: string, options: PaginationOptionsDto = {}) {
    const { items, nextCursor, total } =
      await this.userRepository.findSavedJobs(userId, options);

    const formattedItems = await Promise.all(
      items.map(async (saved) => {
        const catalogResult = await this.fetchCatalogJob(saved.jobId);
        const liveCatalog =
          catalogResult.kind === 'FOUND' ? catalogResult.job : null;

        const isExpired = liveCatalog
          ? Boolean(
              liveCatalog.is_expired ||
              liveCatalog.status === 'EXPIRED' ||
              (liveCatalog.expires_at &&
                new Date(liveCatalog.expires_at).getTime() <= Date.now()),
            )
          : saved.statusAtSave === 'EXPIRED';

        const isAvailable = Boolean(
          liveCatalog && liveCatalog.status === 'ACTIVE' && !isExpired,
        );

        return {
          id: saved.jobId,
          saved_id: saved.id,
          title: liveCatalog?.title || saved.titleSnapshot,
          company: liveCatalog?.company || saved.companySnapshot,
          location: liveCatalog?.location || saved.locationSnapshot || '',
          remote_eligibility: liveCatalog?.remote_eligibility || 'UNSPECIFIED',
          job_type: liveCatalog?.job_type || 'UNSPECIFIED',
          seniority: liveCatalog?.seniority || 'UNSPECIFIED',
          salary:
            liveCatalog?.salary && typeof liveCatalog.salary === 'object'
              ? liveCatalog.salary
              : undefined,
          skills: liveCatalog?.skills || [],
          source: liveCatalog?.source || saved.sourceSnapshot || 'platform',
          published_at:
            liveCatalog?.published_at || saved.createdAt.toISOString(),
          is_expired: isExpired,
          is_available: isAvailable,
          saved_at: saved.createdAt.toISOString(),
        };
      }),
    );

    return {
      items: formattedItems,
      next_cursor: nextCursor,
      total_count: total,
    };
  }

  // ─── SAVED SEARCHES ──────────────────────────────────────────────────────

  async createSavedSearch(userId: string, data: CreateSavedSearchDto) {
    if (
      !data.name ||
      typeof data.name !== 'string' ||
      data.name.trim().length === 0
    ) {
      throw new BadRequestException('Saved search name is required.');
    }

    const created = await this.userRepository.createSavedSearch(userId, {
      name: data.name.trim(),
      query: data.query || data.q,
      location: data.location,
      remoteEligibility: data.remoteEligibility || data.remote_eligibility,
      seniority: data.seniority,
      jobType: data.jobType || data.job_type,
      minSalary:
        data.minSalary !== undefined
          ? Number(data.minSalary)
          : data.min_salary !== undefined
            ? Number(data.min_salary)
            : undefined,
      currency: data.currency,
      payPeriod: data.payPeriod || data.pay_period,
      sort: data.sort,
      alertsEnabled:
        data.alertsEnabled !== undefined
          ? Boolean(data.alertsEnabled)
          : data.alerts_enabled !== undefined
            ? Boolean(data.alerts_enabled)
            : false,
      alertFrequency: data.alertFrequency || data.alert_frequency,
    });

    return {
      id: created.id,
      name: created.name,
      query: created.query,
      location: created.location,
      remote_eligibility: created.remoteEligibility,
      seniority: created.seniority,
      job_type: created.jobType,
      min_salary: created.minSalary,
      currency: created.currency,
      pay_period: created.payPeriod,
      sort: created.sort,
      alerts_enabled: created.alertsEnabled,
      alert_frequency: created.alertFrequency,
      created_at: created.createdAt.toISOString(),
      updated_at: created.updatedAt.toISOString(),
    };
  }

  async getSavedSearches(userId: string, options: PaginationOptionsDto = {}) {
    const { items, nextCursor, total } =
      await this.userRepository.findSavedSearches(userId, options);
    return {
      items: items.map((s) => ({
        id: s.id,
        name: s.name,
        query: s.query,
        location: s.location,
        remote_eligibility: s.remoteEligibility,
        seniority: s.seniority,
        job_type: s.jobType,
        min_salary: s.minSalary,
        currency: s.currency,
        pay_period: s.payPeriod,
        sort: s.sort,
        alerts_enabled: s.alertsEnabled,
        alert_frequency: s.alertFrequency,
        created_at: s.createdAt.toISOString(),
        updated_at: s.updatedAt.toISOString(),
      })),
      next_cursor: nextCursor,
      total_count: total,
    };
  }

  async updateSavedSearch(
    userId: string,
    searchId: string,
    data: UpdateSavedSearchDto,
  ) {
    const updated = await this.userRepository.updateSavedSearch(
      userId,
      searchId,
      {
        name: data.name,
        query: data.query || data.q,
        location: data.location,
        remoteEligibility: data.remoteEligibility || data.remote_eligibility,
        seniority: data.seniority,
        jobType: data.jobType || data.job_type,
        minSalary:
          data.minSalary !== undefined ? Number(data.minSalary) : undefined,
        currency: data.currency,
        payPeriod: data.payPeriod || data.pay_period,
        sort: data.sort,
        alertsEnabled:
          data.alertsEnabled !== undefined
            ? Boolean(data.alertsEnabled)
            : undefined,
        alertFrequency: data.alertFrequency || data.alert_frequency,
      },
    );

    return {
      id: updated.id,
      name: updated.name,
      query: updated.query,
      location: updated.location,
      remote_eligibility: updated.remoteEligibility,
      seniority: updated.seniority,
      job_type: updated.jobType,
      min_salary: updated.minSalary,
      currency: updated.currency,
      pay_period: updated.payPeriod,
      sort: updated.sort,
      alerts_enabled: updated.alertsEnabled,
      alert_frequency: updated.alertFrequency,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    };
  }

  async deleteSavedSearch(userId: string, searchId: string) {
    const success = await this.userRepository.deleteSavedSearch(
      userId,
      searchId,
    );
    return {
      success,
      message: success ? 'Saved search deleted.' : 'Saved search not found.',
    };
  }

  // ─── TRACKED APPLICATIONS ────────────────────────────────────────────────

  async trackApplication(userId: string, data: TrackApplicationDto) {
    if (
      !data.job_id ||
      typeof data.job_id !== 'string' ||
      !data.job_id.trim()
    ) {
      throw new BadRequestException(
        'Valid job_id is required to track an application.',
      );
    }

    const rawUrl =
      data.job_url || data.job_summary?.job_url || data.job_summary?.jobUrl;
    if (rawUrl) {
      const trimmed = rawUrl.trim().toLowerCase();
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        throw new BadRequestException('Job URL must use http or https scheme.');
      }
    }

    const catalogResult = await this.fetchCatalogJob(data.job_id);
    if (catalogResult.kind === 'NOT_FOUND') {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job ${data.job_id} was not found in the canonical job catalog.`,
      });
    }

    const catalogJob =
      catalogResult.kind === 'FOUND' ? catalogResult.job : null;

    const title =
      catalogJob?.title ||
      data.title ||
      data.job_summary?.title ||
      'Tracked Application';
    const company =
      catalogJob?.company ||
      data.company ||
      data.job_summary?.company ||
      'Company';
    const location =
      catalogJob?.location || data.location || data.job_summary?.location;
    const jobUrl = catalogJob?.canonical_url || catalogJob?.job_url || rawUrl;
    const salary = catalogJob?.salary
      ? typeof catalogJob.salary === 'object'
        ? `${catalogJob.salary.min || ''}-${catalogJob.salary.max || ''} ${catalogJob.salary.currency || ''}`.trim()
        : String(catalogJob.salary)
      : data.salary || data.job_summary?.salary;
    const source =
      catalogJob?.source ||
      data.source ||
      data.job_summary?.source ||
      'platform';

    const validStatuses = [
      'APPLIED',
      'INTERVIEWING',
      'OFFERED',
      'REJECTED',
      'WITHDRAWN',
    ];
    const status =
      data.status && validStatuses.includes(data.status)
        ? data.status
        : 'APPLIED';

    const app = await this.userRepository.createApplication(
      userId,
      {
        jobId: data.job_id,
        status,
        notes: data.notes,
      },
      { title, company, location, jobUrl, salary, source },
    );

    return this.mapTrackedApplication(app, catalogJob);
  }

  async updateApplication(
    userId: string,
    applicationId: string,
    data: UpdateApplicationDto,
  ) {
    const validStatuses = [
      'APPLIED',
      'INTERVIEWING',
      'OFFERED',
      'REJECTED',
      'WITHDRAWN',
    ];
    if (data.status && !validStatuses.includes(data.status)) {
      throw new BadRequestException(
        `Invalid application status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const updated = await this.userRepository.updateApplication(
      userId,
      applicationId,
      {
        status: data.status,
        notes: data.notes,
        expectedVersion: data.expected_version,
      },
    );

    const catalogResult = await this.fetchCatalogJob(updated.jobId);
    const catalogJob =
      catalogResult.kind === 'FOUND' ? catalogResult.job : null;
    return this.mapTrackedApplication(updated, catalogJob);
  }

  async deleteApplication(userId: string, applicationId: string) {
    const success = await this.userRepository.deleteApplication(
      userId,
      applicationId,
    );
    return {
      success,
      message: success ? 'Application removed.' : 'Application not found.',
    };
  }

  async getApplications(
    userId: string,
    options: { status?: string } & PaginationOptionsDto = {},
  ) {
    const { items, nextCursor, total } =
      await this.userRepository.findApplications(userId, options);
    const mapped = await Promise.all(
      items.map(async (app) => {
        const catalogResult = await this.fetchCatalogJob(app.jobId);
        const catalogJob =
          catalogResult.kind === 'FOUND' ? catalogResult.job : null;
        return this.mapTrackedApplication(app, catalogJob);
      }),
    );

    return {
      items: mapped,
      next_cursor: nextCursor,
      total_count: total,
    };
  }

  async getApplicationById(userId: string, applicationId: string) {
    const app = await this.userRepository.findApplicationById(
      userId,
      applicationId,
    );
    if (!app) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: `Tracked application ${applicationId} was not found.`,
      });
    }
    const catalogResult = await this.fetchCatalogJob(app.jobId);
    const catalogJob =
      catalogResult.kind === 'FOUND' ? catalogResult.job : null;
    return this.mapTrackedApplication(app, catalogJob);
  }

  private mapTrackedApplication(
    app: TrackedApplication & { history?: ApplicationHistory[] },
    liveCatalog?: CatalogJobResponse | null,
  ) {
    const isExpired = liveCatalog
      ? Boolean(
          liveCatalog.is_expired ||
          liveCatalog.status === 'EXPIRED' ||
          (liveCatalog.expires_at &&
            new Date(liveCatalog.expires_at).getTime() <= Date.now()),
        )
      : false;

    return {
      id: app.id,
      job_id: app.jobId,
      status: app.status,
      notes: app.notes || '',
      version: app.version,
      applied_at: app.appliedAt.toISOString(),
      updated_at: app.updatedAt.toISOString(),
      job_summary: {
        id: app.jobId,
        title: liveCatalog?.title || app.titleSnapshot,
        company: liveCatalog?.company || app.companySnapshot,
        location: liveCatalog?.location || app.locationSnapshot || '',
        remote_eligibility: liveCatalog?.remote_eligibility || 'UNSPECIFIED',
        job_type: liveCatalog?.job_type || 'UNSPECIFIED',
        seniority: liveCatalog?.seniority || 'UNSPECIFIED',
        salary:
          liveCatalog?.salary && typeof liveCatalog.salary === 'object'
            ? liveCatalog.salary
            : undefined,
        source: liveCatalog?.source || app.sourceSnapshot || 'platform',
        is_expired: isExpired,
        is_available: Boolean(
          liveCatalog && liveCatalog.status === 'ACTIVE' && !isExpired,
        ),
      },
      history: (app.history || []).map((h) => ({
        id: h.id,
        from_status: h.fromStatus,
        to_status: h.toStatus,
        notes: h.notesSnapshot,
        changed_at: h.changedAt.toISOString(),
      })),
    };
  }

  // ─── SUPPORT REPORTS & TRIAGE ─────────────────────────────────────────────

  async submitReport(data: CreateReportDto & { userId?: string; ip?: string }) {
    const validReportTypes = [
      'EXPIRED_LISTING',
      'BROKEN_LINK',
      'INCORRECT_DATA',
      'SPAM',
      'OTHER',
    ];
    if (!data.report_type || !validReportTypes.includes(data.report_type)) {
      throw new BadRequestException(
        `Invalid report_type: ${data.report_type}. Allowed: ${validReportTypes.join(', ')}`,
      );
    }
    if (!data.description || data.description.trim().length < 5) {
      throw new BadRequestException(
        'Description must be at least 5 characters long.',
      );
    }
    if (data.description.length > 5000) {
      throw new BadRequestException(
        'Description exceeds 5000 characters limit.',
      );
    }

    if (data.contact_email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.contact_email.trim())) {
        throw new BadRequestException('Invalid contact_email format.');
      }
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    const referenceNum = `RPT-${todayStr}-${randomSuffix}`;

    const ipSalt = process.env.REPORT_IP_SALT || 'seekers-privacy-salt';
    const ipHash = data.ip
      ? crypto
          .createHash('sha256')
          .update(`${data.ip}:${ipSalt}`)
          .digest('hex')
          .substring(0, 32)
      : undefined;

    const report = await this.userRepository.createSupportReport({
      referenceNum,
      userId: data.userId,
      jobId: data.job_id,
      reportType: data.report_type,
      description: data.description.trim(),
      contactEmail: data.contact_email ? data.contact_email.trim() : undefined,
      ipHash,
    });

    return {
      report_id: report.id,
      reference_num: report.referenceNum,
      status: report.status,
      message: 'Report received and queued for operator triage.',
      created_at: report.createdAt.toISOString(),
    };
  }

  async getReport(idOrRef: string, userId?: string, isAdmin = false) {
    const report = await this.userRepository.findReportByIdOrRef(
      idOrRef,
      userId,
      isAdmin,
    );
    if (!report) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: `Report ${idOrRef} was not found or access is restricted.`,
      });
    }

    return {
      id: report.id,
      reference_num: report.referenceNum,
      report_type: report.reportType,
      description: report.description,
      status: report.status,
      operator_notes: isAdmin ? report.operatorNotes : undefined,
      job_id: report.jobId,
      created_at: report.createdAt.toISOString(),
      resolved_at: report.resolvedAt?.toISOString() || null,
    };
  }

  async listReportsQueue(
    options: { status?: string } & PaginationOptionsDto = {},
  ) {
    const { items, nextCursor, total } =
      await this.userRepository.listSupportReports(options);
    return {
      items: items.map((r) => ({
        id: r.id,
        reference_num: r.referenceNum,
        user_id: r.userId,
        job_id: r.jobId,
        report_type: r.reportType,
        description: r.description,
        contact_email: r.contactEmail,
        status: r.status,
        operator_notes: r.operatorNotes,
        created_at: r.createdAt.toISOString(),
        resolved_at: r.resolvedAt?.toISOString() || null,
      })),
      next_cursor: nextCursor,
      total_count: total,
    };
  }

  async triageReport(
    reportId: string,
    data: TriageReportDto,
    operatorId?: string,
  ) {
    const validStatuses = ['RECEIVED', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'];
    if (!data.status || !validStatuses.includes(data.status)) {
      throw new BadRequestException(
        `Invalid status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const updated = await this.userRepository.updateSupportReportStatus(
      reportId,
      {
        status: data.status,
        operatorNotes: data.operator_notes,
        resolvedBy: operatorId,
      },
    );

    return {
      id: updated.id,
      reference_num: updated.referenceNum,
      status: updated.status,
      operator_notes: updated.operatorNotes,
      resolved_at: updated.resolvedAt?.toISOString() || null,
      resolved_by: updated.resolvedBy,
    };
  }

  // ─── ALERTS ──────────────────────────────────────────────────────────────

  async createAlert(userId: string, data: CreateAlertDto) {
    if (!data.query || typeof data.query !== 'string') {
      throw new BadRequestException('Search query is required for alerts.');
    }
    const alert = await this.userRepository.createAlert(userId, data);
    return {
      id: alert.id,
      query: alert.query,
      location: alert.location,
      frequency: alert.frequency,
      active: alert.active,
      created_at: alert.createdAt.toISOString(),
    };
  }

  async listAlerts(userId: string) {
    const alerts = await this.userRepository.listAlerts(userId);
    return alerts.map((al) => ({
      id: al.id,
      query: al.query,
      location: al.location,
      frequency: al.frequency,
      active: al.active,
      created_at: al.createdAt.toISOString(),
    }));
  }

  async deleteAlert(userId: string, alertId: string) {
    const success = await this.userRepository.deleteAlert(userId, alertId);
    return {
      success,
      message: success ? 'Alert subscription removed.' : 'Alert not found.',
    };
  }

  async toggleAlert(userId: string, alertId: string) {
    const alert = await this.userRepository.toggleAlertActive(userId, alertId);
    return {
      id: alert.id,
      query: alert.query,
      location: alert.location,
      frequency: alert.frequency,
      active: alert.active,
      created_at: alert.createdAt.toISOString(),
    };
  }

  // ─── P10 RECOMMENDATIONS & FEEDBACK ──────────────────────────────────────

  async fetchAllActiveJobs(): Promise<CatalogJobResponse[]> {
    const ingestionUrl =
      process.env.INGESTION_SERVICE_URL || 'http://localhost:5000';
    try {
      const res = await fetch(
        `${ingestionUrl}/api/v1/jobs?limit=100&sort=date_desc`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(2500),
        },
      );

      if (res.status === 200) {
        const body = (await res.json()) as { items?: CatalogJobResponse[] };
        if (Array.isArray(body?.items)) {
          return body.items;
        }
        return [];
      }

      if (process.env.ALLOW_STANDALONE_TEST_SEED_CATALOG === 'true') {
        return STANDALONE_SEED_JOBS;
      }
      throw new ServiceUnavailableException({
        code: 'CATALOG_UNAVAILABLE',
        message: 'Job catalog service is temporarily unavailable.',
      });
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      if (process.env.ALLOW_STANDALONE_TEST_SEED_CATALOG === 'true') {
        return STANDALONE_SEED_JOBS;
      }
      throw new ServiceUnavailableException({
        code: 'CATALOG_UNAVAILABLE',
        message: 'Job catalog service is temporarily unavailable.',
      });
    }
  }

  async getRecommendations(
    userId: string,
    options?: PaginationOptionsDto,
  ): Promise<RecommendationsResponseDto> {
    const user = await this.userRepository.findById(userId);
    const profile = user?.profile;

    const profileVersion = profile?.updatedAt?.toISOString() || 'init';

    if (!options?.cursor) {
      const cached = this.recommendationsCache.get(userId);
      if (
        cached &&
        cached.expiresAt > Date.now() &&
        cached.profileVersion === profileVersion
      ) {
        return cached.result;
      }
    }

    const candMatchingProfile: CandidateMatchingProfile = {
      userId,
      skills: profile?.skills || [], // strictly reviewed skills
      title: profile?.title || null,
      locations: profile?.locations || [],
      remotePreference: profile?.remotePreference || 'UNSPECIFIED',
      minSalary: profile?.minSalary || null,
      currency: profile?.currency || 'BDT',
      updatedAt: profile?.updatedAt,
    };

    const dismissedIds = await this.userRepository.getDismissedJobIds(userId);
    const allJobs = await this.fetchAllActiveJobs();

    const isColdStart =
      candMatchingProfile.skills.length === 0 && !candMatchingProfile.title;

    const { items, nextCursor, totalCount } = filterAndRankRecommendations(
      candMatchingProfile,
      allJobs,
      dismissedIds,
      options,
    );

    const result: RecommendationsResponseDto = {
      items,
      next_cursor: nextCursor,
      total_count: totalCount,
      algorithm_version: RECOMMENDATION_ALGORITHM_VERSION,
      freshness_timestamp: new Date().toISOString(),
      is_cold_start: isColdStart,
    };

    if (!options?.cursor) {
      this.recommendationsCache.set(userId, {
        result,
        expiresAt: Date.now() + 15_000,
        profileVersion,
      });
    }

    return result;
  }

  async submitRecommendationFeedback(
    userId: string,
    jobId: string,
    data: RecommendationFeedbackDto,
  ): Promise<RecommendationFeedbackResponseDto> {
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new BadRequestException('Valid jobId is required for feedback.');
    }

    if (data?.action !== 'DISMISS') {
      throw new BadRequestException('Feedback action must be "DISMISS".');
    }

    const validReasons = [
      'NOT_INTERESTED',
      'WRONG_LOCATION',
      'UNDERQUALIFIED',
      'OVERQUALIFIED',
      'OTHER',
    ];
    if (data.reason && !validReasons.includes(data.reason)) {
      throw new BadRequestException(
        `Invalid feedback reason. Must be one of: ${validReasons.join(', ')}`,
      );
    }

    const saved = await this.userRepository.upsertRecommendationFeedback(
      userId,
      jobId.trim(),
      data.action,
      data.reason,
    );

    this.recommendationsCache.delete(userId);

    return {
      success: true,
      job_id: saved.jobId,
      action: saved.action,
      reason:
        (saved.reason as RecommendationFeedbackDto['reason']) || undefined,
      updated_at: saved.updatedAt.toISOString(),
    };
  }

  async undoRecommendationFeedback(userId: string, jobId: string) {
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      throw new BadRequestException(
        'Valid jobId is required to undo feedback.',
      );
    }

    const deleted = await this.userRepository.deleteRecommendationFeedback(
      userId,
      jobId.trim(),
    );

    this.recommendationsCache.delete(userId);

    return {
      success: true,
      job_id: jobId.trim(),
      message: deleted
        ? 'Recommendation dismissal undone.'
        : 'Feedback record was not found or already restored.',
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

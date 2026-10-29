import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  User,
  Profile,
  AccountDeletionRequest,
  AccountExportRequest,
  RemoteEligibility,
  ResumeDocument,
  ResumeParseResult,
  SavedJob,
  SavedSearch,
  TrackedApplication,
  ApplicationHistory,
  SupportReport,
  AlertSubscription,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export type UserWithProfile = User & { profile: Profile | null };

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(
    id: string,
    email: string,
    emailVerified = false,
  ): Promise<UserWithProfile> {
    try {
      // 1. Upsert User record
      const user = await this.prisma.user.upsert({
        where: { id },
        update: {
          email,
          emailVerified,
        },
        create: {
          id,
          email,
          emailVerified,
          role: 'CANDIDATE',
        },
        include: {
          profile: true,
        },
      });

      // 2. Ensure initial Profile record exists
      if (!user.profile) {
        const profile = await this.prisma.profile.create({
          data: {
            userId: user.id,
            name: '',
            skills: [],
            extractedSkills: [],
            locations: [],
            remotePreference: RemoteEligibility.UNSPECIFIED,
            currency: 'BDT',
            onboardingCompleted: false,
            onboardingStep: 0,
          },
        });
        return { ...user, profile };
      }

      return user;
    } catch (err: unknown) {
      // Handle unique email constraint conflict across different UIDs
      const prismaError = err as {
        code?: string;
        meta?: { target?: string[] };
      };
      if (prismaError.code === 'P2002') {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message:
            'The email address associated with this identity is already in use by another account.',
        });
      }
      throw err;
    }
  }

  async findById(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async findByEmail(email: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ): Promise<UserWithProfile> {
    // Ensure profile row exists first
    await this.prisma.profile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        name: data.name ?? '',
        title: data.title ?? null,
        skills: data.skills ?? [],
        locations: data.preferences?.locations ?? [],
        remotePreference:
          (data.preferences?.remote_preference as RemoteEligibility) ??
          RemoteEligibility.UNSPECIFIED,
        minSalary: data.preferences?.min_salary ?? null,
        currency: data.preferences?.currency ?? 'BDT',
        onboardingCompleted: data.onboarding?.completed ?? false,
        onboardingStep: data.onboarding?.step ?? 0,
      },
    });

    // Update with provided fields
    const updateData: {
      name?: string;
      title?: string | null;
      skills?: string[];
      locations?: string[];
      remotePreference?: RemoteEligibility;
      minSalary?: number | null;
      currency?: string;
      onboardingCompleted?: boolean;
      onboardingStep?: number;
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.skills !== undefined) updateData.skills = data.skills;

    if (data.preferences) {
      if (data.preferences.locations !== undefined)
        updateData.locations = data.preferences.locations;
      if (data.preferences.remote_preference !== undefined) {
        updateData.remotePreference = data.preferences.remote_preference;
      }
      if (data.preferences.min_salary !== undefined)
        updateData.minSalary = data.preferences.min_salary;
      if (data.preferences.currency !== undefined)
        updateData.currency = data.preferences.currency;
    }

    if (data.onboarding) {
      if (data.onboarding.completed !== undefined)
        updateData.onboardingCompleted = data.onboarding.completed;
      if (data.onboarding.step !== undefined)
        updateData.onboardingStep = data.onboarding.step;
    }

    await this.prisma.profile.update({
      where: { userId },
      data: updateData,
    });

    const updatedUser = await this.findById(userId);
    if (!updatedUser) {
      throw new Error(`User ${userId} not found after profile update`);
    }
    return updatedUser;
  }

  async updateProfileResumeUrl(
    userId: string,
    resumeUrl: string | null,
  ): Promise<void> {
    await this.prisma.profile.updateMany({
      where: { userId },
      data: { resumeUrl },
    });
  }

  async createExportRequest(userId: string): Promise<AccountExportRequest> {
    return this.prisma.accountExportRequest.create({
      data: {
        userId,
        status: 'READY',
        format: 'JSON',
        completedAt: new Date(),
      },
    });
  }

  async createDeletionRequest(
    userId: string,
    idempotencyKey?: string,
    reason?: string,
  ): Promise<AccountDeletionRequest> {
    // 1. If idempotency key provided, check for existing request strictly scoped to the authenticated candidate
    if (idempotencyKey) {
      const existing = await this.prisma.accountDeletionRequest.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        return existing;
      }
    }

    // 2. Check if user already has an active PENDING deletion request
    const existingPending = await this.prisma.accountDeletionRequest.findFirst({
      where: {
        userId,
        status: 'PENDING',
      },
      orderBy: { requestedAt: 'desc' },
    });

    if (existingPending) {
      return existingPending;
    }

    // 3. Create new deletion request with 30-day grace period
    const gracePeriodMs = 30 * 24 * 60 * 60 * 1000;
    const scheduledFor = new Date(Date.now() + gracePeriodMs);

    try {
      return await this.prisma.accountDeletionRequest.create({
        data: {
          userId,
          status: 'PENDING',
          scheduledFor,
          idempotencyKey: idempotencyKey || null,
          reason: reason || null,
        },
      });
    } catch (error: unknown) {
      // Handle concurrent repeated requests safely:
      // If a concurrent request inserted (userId, idempotencyKey) first,
      // return the authenticated candidate's record instead of failing.
      const prismaError = error as { code?: string };
      if (prismaError?.code === 'P2002' && idempotencyKey) {
        const existing = await this.prisma.accountDeletionRequest.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async getAccountStatus(userId: string): Promise<{
    pendingDeletion: AccountDeletionRequest | null;
    recentExports: AccountExportRequest[];
  }> {
    const pendingDeletion = await this.prisma.accountDeletionRequest.findFirst({
      where: { userId, status: 'PENDING' },
      orderBy: { requestedAt: 'desc' },
    });

    const recentExports = await this.prisma.accountExportRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 5,
    });

    return { pendingDeletion, recentExports };
  }

  // Legacy parser skill attachment (keeps extractedSkills separate from candidate-curated skills)
  async updateSkills(
    userId: string,
    extractedSkills: string[],
  ): Promise<Profile> {
    return this.prisma.profile.upsert({
      where: { userId },
      update: { extractedSkills },
      create: { userId, extractedSkills },
    });
  }

  // ─── P08 OWNED RESUME DOCUMENT & PARSE LIFECYCLE ───────────────────────────

  /**
   * Atomically supersedes prior active documents and creates the new document and parse result.
   */
  async createResumeDocumentAtomic(data: {
    documentId: string;
    parseId: string;
    userId: string;
    storageKey: string;
    fileName: string;
    fileSizeBytes: number;
    checksumSha256: string;
    mimeType?: string;
  }): Promise<{ document: ResumeDocument; parseResult: ResumeParseResult }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Mark existing active documents as SUPERSEDED and inactive
      await tx.resumeDocument.updateMany({
        where: {
          userId: data.userId,
          status: { in: ['UPLOADED', 'PROCESSING', 'PARSED'] },
        },
        data: {
          status: 'SUPERSEDED',
          isActive: false,
        },
      });

      // 2. Cancel in-flight parse tasks for superseded documents
      await tx.resumeParseResult.updateMany({
        where: {
          userId: data.userId,
          status: { in: ['QUEUED', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          claimedUntil: null,
        },
      });

      // 3. Create the new authoritative ResumeDocument
      const document = await tx.resumeDocument.create({
        data: {
          id: data.documentId,
          userId: data.userId,
          storageKey: data.storageKey,
          fileName: data.fileName,
          fileSizeBytes: data.fileSizeBytes,
          checksumSha256: data.checksumSha256,
          mimeType: data.mimeType || 'application/pdf',
          status: 'UPLOADED',
          isActive: true,
          cleanupStatus: 'CLEANED',
        },
      });

      // 4. Create the queued ResumeParseResult
      const parseResult = await tx.resumeParseResult.create({
        data: {
          id: data.parseId,
          documentId: data.documentId,
          userId: data.userId,
          status: 'QUEUED',
          attemptCount: 0,
          maxAttempts: 3,
          fenceToken: 0,
        },
      });

      return { document, parseResult };
    });
  }

  async findActiveResume(userId: string): Promise<ResumeDocument | null> {
    return this.prisma.resumeDocument.findFirst({
      where: {
        userId,
        isActive: true,
        status: { in: ['UPLOADED', 'PROCESSING', 'PARSED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveResumeWithLatestParse(userId: string): Promise<{
    document: ResumeDocument | null;
    latestParse: ResumeParseResult | null;
  }> {
    const document = await this.findActiveResume(userId);
    if (!document) {
      return { document: null, latestParse: null };
    }

    const latestParse = await this.prisma.resumeParseResult.findFirst({
      where: { documentId: document.id },
      orderBy: { createdAt: 'desc' },
    });

    return { document, latestParse };
  }

  async findResumeById(id: string): Promise<ResumeDocument | null> {
    return this.prisma.resumeDocument.findUnique({
      where: { id },
    });
  }

  /**
   * Safely and atomically claims the next available queued or expired task.
   */
  async claimNextPendingParseTask(
    workerId: string,
    leaseDurationMs: number = 60000,
  ): Promise<(ResumeParseResult & { document: ResumeDocument }) | null> {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + leaseDurationMs);

    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.resumeParseResult.findFirst({
        where: {
          OR: [
            { status: 'QUEUED' },
            { status: 'PROCESSING', claimedUntil: { lt: now } },
          ],
          document: {
            status: { notIn: ['DELETED', 'SUPERSEDED'] },
            isActive: true,
          },
          attemptCount: { lt: 3 },
        },
        include: { document: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!candidate) return null;

      const updated = await tx.resumeParseResult.update({
        where: { id: candidate.id },
        data: {
          status: 'PROCESSING',
          claimedBy: workerId,
          claimedUntil: leaseExpiry,
          attemptCount: { increment: 1 },
          fenceToken: { increment: 1 },
        },
        include: { document: true },
      });

      return updated;
    });
  }

  /**
   * Completes a parse task with atomic fencing and document active state validation.
   */
  async completeParseTaskFenced(
    parseId: string,
    fenceToken: number,
    workerId: string,
    data: {
      success: boolean;
      extractedSkills?: string[];
      errorCode?: string;
      errorMessage?: string;
      processingTimeMs?: number;
    },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const parse = await tx.resumeParseResult.findUnique({
        where: { id: parseId },
        include: { document: true },
      });

      if (!parse) return false;

      // Lease fencing check
      if (parse.fenceToken !== fenceToken || parse.claimedBy !== workerId) {
        return false;
      }

      // If document was DELETED or SUPERSEDED while processing, cancel parse and do not update document/profile!
      if (
        parse.document.status === 'DELETED' ||
        parse.document.status === 'SUPERSEDED' ||
        !parse.document.isActive
      ) {
        await tx.resumeParseResult.update({
          where: { id: parseId },
          data: {
            status: 'CANCELLED',
            claimedUntil: null,
          },
        });
        return false;
      }

      if (data.success) {
        await tx.resumeParseResult.update({
          where: { id: parseId },
          data: {
            status: 'COMPLETED',
            extractedSkills: data.extractedSkills || [],
            processingTimeMs: data.processingTimeMs || 0,
            claimedUntil: null,
            errorCode: null,
            errorMessage: null,
          },
        });

        await tx.resumeDocument.update({
          where: { id: parse.documentId },
          data: { status: 'PARSED' },
        });

        // NOTE: Profile skills are explicitly NOT clobbered here.
        // They remain staging-only until candidate review!
        return true;
      } else {
        await tx.resumeParseResult.update({
          where: { id: parseId },
          data: {
            status: 'FAILED',
            errorCode: data.errorCode || 'PARSE_FAILED',
            errorMessage: data.errorMessage || 'Parsing failed',
            processingTimeMs: data.processingTimeMs || 0,
            claimedUntil: null,
          },
        });

        await tx.resumeDocument.update({
          where: { id: parse.documentId },
          data: { status: 'FAILED' },
        });
        return true;
      }
    });
  }

  async findParseResultById(
    id: string,
  ): Promise<(ResumeParseResult & { document: ResumeDocument }) | null> {
    return this.prisma.resumeParseResult.findUnique({
      where: { id },
      include: { document: true },
    });
  }

  async updateParseResult(
    id: string,
    data: Partial<{
      status: string;
      extractedSkills: string[];
      reviewedSkills: string[];
      reviewedAt: Date;
      errorCode: string;
      errorMessage: string;
      processingTimeMs: number;
      attemptCount: number;
      claimedBy: string | null;
      claimedUntil: Date | null;
    }>,
  ): Promise<ResumeParseResult> {
    return this.prisma.resumeParseResult.update({
      where: { id },
      data,
    });
  }

  /**
   * Applies candidate-selected skills in a transaction after validating document active state.
   */
  async applyReviewedSkills(
    userId: string,
    parseId: string,
    selectedSkills: string[],
  ): Promise<UserWithProfile> {
    return this.prisma.$transaction(async (tx) => {
      const parseResult = await tx.resumeParseResult.findUnique({
        where: { id: parseId },
        include: { document: true },
      });

      if (!parseResult || parseResult.userId !== userId) {
        throw new NotFoundException({
          code: 'PARSE_TASK_NOT_FOUND',
          message: `Resume parse task ${parseId} was not found for this candidate.`,
        });
      }

      // Check document state: cannot review deleted or superseded documents
      if (
        parseResult.document.status === 'DELETED' ||
        parseResult.document.status === 'SUPERSEDED' ||
        !parseResult.document.isActive
      ) {
        throw new BadRequestException({
          code: 'DOCUMENT_UNAVAILABLE',
          message:
            'Cannot review skills: associated resume document has been deleted or superseded.',
        });
      }

      if (parseResult.status !== 'COMPLETED') {
        throw new BadRequestException({
          code: 'PARSE_TASK_INCOMPLETE',
          message: `Cannot review skills: task is currently in ${parseResult.status} state.`,
        });
      }

      // Sanitize and validate selected skills
      const validSkills = (selectedSkills || [])
        .filter(
          (s): s is string =>
            typeof s === 'string' && s.trim().length > 0 && s.length <= 100,
        )
        .map((s) => s.trim())
        .slice(0, 50);

      const profile = await tx.profile.findUnique({
        where: { userId },
      });

      const currentSkills = profile?.skills || [];
      const mergedSkills = Array.from(
        new Set([...currentSkills, ...validSkills]),
      );

      await tx.profile.update({
        where: { userId },
        data: {
          skills: mergedSkills,
          extractedSkills: validSkills,
        },
      });

      await tx.resumeParseResult.update({
        where: { id: parseId },
        data: {
          reviewedSkills: validSkills,
          reviewedAt: new Date(),
        },
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });

      if (!updatedUser) {
        throw new Error(`User ${userId} not found after skill review`);
      }
      return updatedUser;
    });
  }

  /**
   * Marks active resume and in-flight tasks as DELETED with CLEANUP_PENDING status.
   */
  async markActiveResumeDeleted(userId: string): Promise<ResumeDocument[]> {
    return this.prisma.$transaction(async (tx) => {
      const activeDocs = await tx.resumeDocument.findMany({
        where: {
          userId,
          status: { in: ['UPLOADED', 'PROCESSING', 'PARSED', 'FAILED'] },
        },
      });

      if (activeDocs.length > 0) {
        const docIds = activeDocs.map((d) => d.id);
        await tx.resumeDocument.updateMany({
          where: { id: { in: docIds } },
          data: {
            status: 'DELETED',
            isActive: false,
            deletedAt: new Date(),
            cleanupStatus: 'CLEANUP_PENDING',
          },
        });

        await tx.resumeParseResult.updateMany({
          where: {
            documentId: { in: docIds },
            status: { in: ['QUEUED', 'PROCESSING'] },
          },
          data: {
            status: 'CANCELLED',
            claimedUntil: null,
          },
        });
      }

      await tx.profile.updateMany({
        where: { userId },
        data: {
          resumeUrl: null,
          extractedSkills: [],
        },
      });

      return activeDocs;
    });
  }

  async updateDocumentCleanupStatus(
    documentId: string,
    status: string,
  ): Promise<void> {
    await this.prisma.resumeDocument.update({
      where: { id: documentId },
      data: { cleanupStatus: status },
    });
  }

  async findPendingCleanups(userId?: string): Promise<ResumeDocument[]> {
    return this.prisma.resumeDocument.findMany({
      where: {
        cleanupStatus: 'CLEANUP_PENDING',
        ...(userId ? { userId } : {}),
      },
    });
  }

  // ─── SAVED JOBS ──────────────────────────────────────────────────────────

  async saveJob(
    userId: string,
    jobId: string,
    snapshot: {
      title: string;
      company: string;
      location?: string;
      jobUrl?: string;
      salary?: string;
      source?: string;
      statusAtSave?: string;
    },
  ): Promise<SavedJob> {
    return this.prisma.savedJob.upsert({
      where: {
        userId_jobId: { userId, jobId },
      },
      create: {
        userId,
        jobId,
        titleSnapshot: snapshot.title,
        companySnapshot: snapshot.company,
        locationSnapshot: snapshot.location || null,
        jobUrlSnapshot: snapshot.jobUrl || null,
        salarySnapshot: snapshot.salary || null,
        sourceSnapshot: snapshot.source || null,
        statusAtSave: snapshot.statusAtSave || 'ACTIVE',
      },
      update: {
        titleSnapshot: snapshot.title,
        companySnapshot: snapshot.company,
        locationSnapshot: snapshot.location || null,
        jobUrlSnapshot: snapshot.jobUrl || null,
        salarySnapshot: snapshot.salary || null,
        sourceSnapshot: snapshot.source || null,
        statusAtSave: snapshot.statusAtSave || 'ACTIVE',
      },
    });
  }

  async unsaveJob(userId: string, jobId: string): Promise<boolean> {
    const deleted = await this.prisma.savedJob.deleteMany({
      where: { userId, jobId },
    });
    return deleted.count > 0;
  }

  async findSavedJobs(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: SavedJob[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const total = await this.prisma.savedJob.count({ where: { userId } });

    const items = await this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
    });
    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      nextCursor = items[items.length - 1]?.id || null;
    }

    return { items, nextCursor, total };
  }

  async isJobSaved(userId: string, jobId: string): Promise<boolean> {
    const count = await this.prisma.savedJob.count({
      where: { userId, jobId },
    });
    return count > 0;
  }

  // ─── SAVED SEARCHES ──────────────────────────────────────────────────────

  async createSavedSearch(
    userId: string,
    data: {
      name: string;
      query?: string;
      location?: string;
      remoteEligibility?: string;
      seniority?: string;
      jobType?: string;
      minSalary?: number;
      currency?: string;
      payPeriod?: string;
      sort?: string;
      alertsEnabled?: boolean;
      alertFrequency?: string;
    },
  ): Promise<SavedSearch> {
    return this.prisma.savedSearch.create({
      data: {
        userId,
        name: data.name,
        query: data.query || null,
        location: data.location || null,
        remoteEligibility: data.remoteEligibility || null,
        seniority: data.seniority || null,
        jobType: data.jobType || null,
        minSalary: data.minSalary !== undefined ? data.minSalary : null,
        currency: data.currency || 'BDT',
        payPeriod: data.payPeriod || 'MONTHLY',
        sort: data.sort || 'date_desc',
        alertsEnabled: Boolean(data.alertsEnabled),
        alertFrequency: data.alertFrequency || null,
      },
    });
  }

  async updateSavedSearch(
    userId: string,
    searchId: string,
    data: Partial<{
      name: string;
      query?: string;
      location?: string;
      remoteEligibility?: string;
      seniority?: string;
      jobType?: string;
      minSalary?: number;
      currency?: string;
      payPeriod?: string;
      sort?: string;
      alertsEnabled?: boolean;
      alertFrequency?: string;
    }>,
  ): Promise<SavedSearch> {
    const existing = await this.prisma.savedSearch.findFirst({
      where: { id: searchId, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SAVED_SEARCH_NOT_FOUND',
        message: `Saved search ${searchId} was not found.`,
      });
    }

    return this.prisma.savedSearch.update({
      where: { id: searchId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.query !== undefined ? { query: data.query || null } : {}),
        ...(data.location !== undefined
          ? { location: data.location || null }
          : {}),
        ...(data.remoteEligibility !== undefined
          ? { remoteEligibility: data.remoteEligibility || null }
          : {}),
        ...(data.seniority !== undefined
          ? { seniority: data.seniority || null }
          : {}),
        ...(data.jobType !== undefined
          ? { jobType: data.jobType || null }
          : {}),
        ...(data.minSalary !== undefined ? { minSalary: data.minSalary } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.payPeriod !== undefined ? { payPeriod: data.payPeriod } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        ...(data.alertsEnabled !== undefined
          ? { alertsEnabled: Boolean(data.alertsEnabled) }
          : {}),
        ...(data.alertFrequency !== undefined
          ? { alertFrequency: data.alertFrequency || null }
          : {}),
      },
    });
  }

  async deleteSavedSearch(userId: string, searchId: string): Promise<boolean> {
    const deleted = await this.prisma.savedSearch.deleteMany({
      where: { id: searchId, userId },
    });
    return deleted.count > 0;
  }

  async findSavedSearches(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    items: SavedSearch[];
    nextCursor: string | null;
    total: number;
  }> {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const total = await this.prisma.savedSearch.count({ where: { userId } });

    const items = await this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
    });
    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      nextCursor = items[items.length - 1]?.id || null;
    }

    return { items, nextCursor, total };
  }

  async findSavedSearchById(
    userId: string,
    searchId: string,
  ): Promise<SavedSearch | null> {
    return this.prisma.savedSearch.findFirst({
      where: { id: searchId, userId },
    });
  }

  // ─── TRACKED APPLICATIONS ────────────────────────────────────────────────

  async createApplication(
    userId: string,
    data: {
      jobId: string;
      status?: string;
      notes?: string;
    },
    snapshot: {
      title: string;
      company: string;
      location?: string;
      jobUrl?: string;
      salary?: string;
      source?: string;
    },
  ): Promise<TrackedApplication & { history: ApplicationHistory[] }> {
    const initialStatus = data.status || 'APPLIED';
    return this.prisma.$transaction(async (tx) => {
      // Idempotency check: if application already tracked, return existing without clobbering status or notes
      const existing = await tx.trackedApplication.findUnique({
        where: {
          userId_jobId: { userId, jobId: data.jobId },
        },
        include: {
          history: {
            orderBy: { changedAt: 'asc' },
          },
        },
      });

      if (existing) {
        return existing;
      }

      const app = await tx.trackedApplication.create({
        data: {
          userId,
          jobId: data.jobId,
          titleSnapshot: snapshot.title,
          companySnapshot: snapshot.company,
          locationSnapshot: snapshot.location || null,
          jobUrlSnapshot: snapshot.jobUrl || null,
          salarySnapshot: snapshot.salary || null,
          sourceSnapshot: snapshot.source || null,
          status: initialStatus,
          notes: data.notes || null,
          version: 1,
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: app.id,
          userId,
          fromStatus: null,
          toStatus: initialStatus,
          notesSnapshot: data.notes || null,
        },
      });

      return tx.trackedApplication.findUniqueOrThrow({
        where: { id: app.id },
        include: {
          history: {
            orderBy: { changedAt: 'asc' },
          },
        },
      });
    });
  }

  async updateApplication(
    userId: string,
    applicationId: string,
    data: {
      status?: string;
      notes?: string;
      expectedVersion?: number;
    },
  ): Promise<TrackedApplication & { history: ApplicationHistory[] }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.trackedApplication.findFirst({
        where: { id: applicationId, userId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'APPLICATION_NOT_FOUND',
          message: `Tracked application ${applicationId} was not found.`,
        });
      }

      // Check expected version precondition
      if (
        data.expectedVersion !== undefined &&
        existing.version !== data.expectedVersion
      ) {
        throw new ConflictException({
          code: 'CONCURRENCY_CONFLICT',
          message:
            'This application record was modified by another session. Please reload and retry.',
          current_version: existing.version,
          expected_version: data.expectedVersion,
        });
      }

      const statusChanged = Boolean(
        data.status && data.status !== existing.status,
      );
      const notesChanged = Boolean(
        data.notes !== undefined && data.notes !== existing.notes,
      );

      // No-op update returns current state without version churn
      if (!statusChanged && !notesChanged) {
        return tx.trackedApplication.findUniqueOrThrow({
          where: { id: applicationId },
          include: {
            history: {
              orderBy: { changedAt: 'asc' },
            },
          },
        });
      }

      // Atomic conditional update to guard against race conditions
      const updateResult = await tx.trackedApplication.updateMany({
        where: {
          id: applicationId,
          userId,
          ...(data.expectedVersion !== undefined
            ? { version: data.expectedVersion }
            : {}),
        },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const latest = await tx.trackedApplication.findUnique({
          where: { id: applicationId },
          select: { version: true },
        });
        throw new ConflictException({
          code: 'CONCURRENCY_CONFLICT',
          message:
            'This application record was modified by another session. Please reload and retry.',
          current_version: latest?.version ?? existing.version,
          expected_version: data.expectedVersion,
        });
      }

      await tx.applicationHistory.create({
        data: {
          applicationId: existing.id,
          userId,
          fromStatus: existing.status,
          toStatus: data.status || existing.status,
          notesSnapshot: data.notes !== undefined ? data.notes : existing.notes,
        },
      });

      return tx.trackedApplication.findUniqueOrThrow({
        where: { id: applicationId },
        include: {
          history: {
            orderBy: { changedAt: 'asc' },
          },
        },
      });
    });
  }

  async deleteApplication(
    userId: string,
    applicationId: string,
  ): Promise<boolean> {
    const deleted = await this.prisma.trackedApplication.deleteMany({
      where: { id: applicationId, userId },
    });
    return deleted.count > 0;
  }

  async findApplications(
    userId: string,
    options: { status?: string; limit?: number; cursor?: string } = {},
  ): Promise<{
    items: (TrackedApplication & { history: ApplicationHistory[] })[];
    nextCursor: string | null;
    total: number;
  }> {
    const limit = Math.min(Math.max(options.limit || 50, 1), 100);
    const where = {
      userId,
      ...(options.status ? { status: options.status } : {}),
    };

    const total = await this.prisma.trackedApplication.count({ where });

    const items = await this.prisma.trackedApplication.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        history: {
          orderBy: { changedAt: 'asc' },
        },
      },
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
    });
    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      nextCursor = items[items.length - 1]?.id || null;
    }

    return { items, nextCursor, total };
  }

  async findApplicationById(
    userId: string,
    applicationId: string,
  ): Promise<(TrackedApplication & { history: ApplicationHistory[] }) | null> {
    return this.prisma.trackedApplication.findFirst({
      where: { id: applicationId, userId },
      include: {
        history: {
          orderBy: { changedAt: 'asc' },
        },
      },
    });
  }

  // ─── SUPPORT REPORTS ─────────────────────────────────────────────────────

  async createSupportReport(data: {
    referenceNum: string;
    userId?: string;
    jobId?: string;
    reportType: string;
    description: string;
    contactEmail?: string;
    ipHash?: string;
  }): Promise<SupportReport> {
    return this.prisma.supportReport.create({
      data: {
        referenceNum: data.referenceNum,
        userId: data.userId || null,
        jobId: data.jobId || null,
        reportType: data.reportType,
        description: data.description,
        contactEmail: data.contactEmail || null,
        status: 'RECEIVED',
        ipHash: data.ipHash || null,
      },
    });
  }

  async findReportByIdOrRef(
    idOrRef: string,
    userId?: string,
    isAdmin = false,
  ): Promise<SupportReport | null> {
    const report = await this.prisma.supportReport.findFirst({
      where: {
        OR: [{ id: idOrRef }, { referenceNum: idOrRef }],
      },
    });

    if (!report) return null;

    if (!isAdmin) {
      if (!userId || report.userId !== userId) {
        return null;
      }
    }

    return report;
  }

  async listSupportReports(
    options: {
      status?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<{
    items: SupportReport[];
    nextCursor: string | null;
    total: number;
  }> {
    const limit = Math.min(Math.max(options.limit || 50, 1), 100);
    const where = {
      ...(options.status ? { status: options.status } : {}),
    };

    const total = await this.prisma.supportReport.count({ where });

    const items = await this.prisma.supportReport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
    });
    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      nextCursor = items[items.length - 1]?.id || null;
    }

    return { items, nextCursor, total };
  }

  async updateSupportReportStatus(
    reportId: string,
    data: {
      status: string;
      operatorNotes?: string;
      resolvedBy?: string;
    },
  ): Promise<SupportReport> {
    return this.prisma.supportReport.update({
      where: { id: reportId },
      data: {
        status: data.status,
        ...(data.operatorNotes !== undefined
          ? { operatorNotes: data.operatorNotes }
          : {}),
        ...(data.status === 'RESOLVED' || data.status === 'DISMISSED'
          ? { resolvedAt: new Date(), resolvedBy: data.resolvedBy || 'admin' }
          : { resolvedAt: null, resolvedBy: null }),
      },
    });
  }

  // ─── ALERTS ──────────────────────────────────────────────────────────────

  async createAlert(
    userId: string,
    data: { query: string; location?: string; frequency?: string },
  ): Promise<AlertSubscription> {
    return this.prisma.alertSubscription.create({
      data: {
        userId,
        query: data.query,
        location: data.location || null,
        frequency: data.frequency || 'DAILY',
        active: true,
      },
    });
  }

  async listAlerts(userId: string): Promise<AlertSubscription[]> {
    return this.prisma.alertSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteAlert(userId: string, alertId: string): Promise<boolean> {
    const deleted = await this.prisma.alertSubscription.deleteMany({
      where: { id: alertId, userId },
    });
    return deleted.count > 0;
  }

  async toggleAlertActive(
    userId: string,
    alertId: string,
  ): Promise<AlertSubscription> {
    const existing = await this.prisma.alertSubscription.findFirst({
      where: { id: alertId, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: `Alert subscription ${alertId} was not found.`,
      });
    }

    return this.prisma.alertSubscription.update({
      where: { id: alertId },
      data: { active: !existing.active },
    });
  }

  // ─── ACCOUNT EXPORT COMPREHENSIVE QUERY ──────────────────────────────────

  async getComprehensiveUserData(userId: string) {
    const [savedJobs, savedSearches, applications, supportReports, alerts] =
      await Promise.all([
        this.prisma.savedJob.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.savedSearch.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.trackedApplication.findMany({
          where: { userId },
          include: { history: { orderBy: { changedAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.supportReport.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.alertSubscription.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      savedJobs,
      savedSearches,
      applications,
      supportReports,
      alerts,
    };
  }
}

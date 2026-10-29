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
}

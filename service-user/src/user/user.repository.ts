import { Injectable, ConflictException } from '@nestjs/common';
import {
  User,
  Profile,
  AccountDeletionRequest,
  AccountExportRequest,
  RemoteEligibility,
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
}

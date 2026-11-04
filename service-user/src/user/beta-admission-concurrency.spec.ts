import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { Role, RemoteEligibility, User, Profile } from '@prisma/client';

interface TestUserRecord extends User {
  profile: Profile | null;
}

describe('P16 Beta Admission & Atomic Concurrency Qualification', () => {
  let service: UserService;

  // In-memory relational state simulator for concurrency racing
  const dbUsers = new Map<string, TestUserRecord>();
  const durableErasures = new Set<string>();
  let txLock: Promise<unknown> = Promise.resolve();

  const mockPrisma = {
    durableErasureRecord: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { userId: string } }) => {
          if (durableErasures.has(where.userId)) {
            return Promise.resolve({
              userId: where.userId,
              erasedAt: new Date(),
            });
          }
          return Promise.resolve(null);
        }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          const u = dbUsers.get(where.id);
          return Promise.resolve(u ? { ...u } : null);
        }),
      count: jest
        .fn()
        .mockImplementation((args?: { where?: { role?: Role } }) => {
          let count = 0;
          for (const u of dbUsers.values()) {
            if (
              !args?.where ||
              !args.where.role ||
              u.role === args.where.role
            ) {
              count++;
            }
          }
          return Promise.resolve(count);
        }),
      create: jest.fn().mockImplementation(
        ({
          data,
        }: {
          data: {
            id: string;
            email: string;
            emailVerified: boolean;
            role?: Role;
          };
        }) => {
          const newUser: TestUserRecord = {
            id: data.id,
            email: data.email,
            emailVerified: data.emailVerified,
            role: data.role || Role.CANDIDATE,
            profile: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          dbUsers.set(data.id, newUser);
          return Promise.resolve({ ...newUser });
        },
      ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: { email?: string; emailVerified?: boolean };
          }) => {
            const u = dbUsers.get(where.id);
            if (!u) throw new Error('User not found');
            if (data.email) u.email = data.email;
            if (data.emailVerified !== undefined)
              u.emailVerified = data.emailVerified;
            u.updatedAt = new Date();
            return Promise.resolve({ ...u });
          },
        ),
    },
    profile: {
      create: jest.fn().mockImplementation(
        ({
          data,
        }: {
          data: {
            userId: string;
            name: string;
            skills: string[];
            extractedSkills: string[];
            locations: string[];
            remotePreference: RemoteEligibility;
            currency: string;
            onboardingCompleted: boolean;
            onboardingStep: number;
          };
        }) => {
          const u = dbUsers.get(data.userId);
          const newProf: Profile = {
            id: `prof_${data.userId}`,
            userId: data.userId,
            name: data.name,
            title: null,
            skills: data.skills,
            extractedSkills: data.extractedSkills,
            resumeUrl: null,
            locations: data.locations,
            remotePreference: data.remotePreference,
            minSalary: null,
            currency: data.currency,
            onboardingCompleted: data.onboardingCompleted,
            onboardingStep: data.onboardingStep,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          if (u) u.profile = newProf;
          return Promise.resolve(newProf);
        },
      ),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest
      .fn()
      .mockImplementation(
        async <T>(cb: (tx: typeof mockPrisma) => Promise<T>): Promise<T> => {
          const run = async () => cb(mockPrisma);
          const next = txLock.then(run, run);
          txLock = next;
          return next;
        },
      ),
  };

  const mockStorageService = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    uploadObject: jest.fn().mockResolvedValue({ storageKey: 'test/key' }),
  };

  beforeEach(async () => {
    dbUsers.clear();
    durableErasures.clear();
    txLock = Promise.resolve();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        UserRepository,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('Fail-Closed Beta Configuration & Identity Gates', () => {
    it('strictly fails closed when BETA_INVITE_ALLOWLIST is empty or undefined', async () => {
      process.env.BETA_ALLOWLIST_ENABLED = 'true';
      delete process.env.BETA_INVITE_ALLOWLIST;

      await expect(
        service.syncUser({
          id: 'cand_1',
          email: 'uninvited@example.com',
          emailVerified: true,
        }),
      ).rejects.toThrow('An invitation is required');

      process.env.BETA_INVITE_ALLOWLIST = '   ,  ';
      await expect(
        service.syncUser({
          id: 'cand_1',
          email: 'uninvited@example.com',
          emailVerified: true,
        }),
      ).rejects.toThrow('An invitation is required');

      delete process.env.BETA_ALLOWLIST_ENABLED;
      delete process.env.BETA_INVITE_ALLOWLIST;
    });

    it('strictly rejects unverified email addresses during initial beta admission', async () => {
      process.env.BETA_ALLOWLIST_ENABLED = 'true';
      process.env.BETA_INVITE_ALLOWLIST = 'approved@seekers.work';

      await expect(
        service.syncUser({
          id: 'cand_unverified',
          email: 'approved@seekers.work',
          emailVerified: false,
        }),
      ).rejects.toThrow('A verified email address is required');

      delete process.env.BETA_ALLOWLIST_ENABLED;
      delete process.env.BETA_INVITE_ALLOWLIST;
    });

    it('strictly rejects accounts with permanent erasure tombstones', async () => {
      durableErasures.add('cand_erased');

      await expect(
        service.syncUser({
          id: 'cand_erased',
          email: 'erased@seekers.work',
          emailVerified: true,
        }),
      ).rejects.toThrow('This account was permanently erased');
    });
  });

  describe('Durable Atomic Concurrency Racing for Final Slot', () => {
    it('atomically admits only one candidate when multiple clients race for the last slot', async () => {
      process.env.BETA_ALLOWLIST_ENABLED = 'true';
      process.env.BETA_MAX_PARTICIPANTS = '5';
      process.env.BETA_INVITE_ALLOWLIST =
        'cand1@seekers.work,cand2@seekers.work,cand3@seekers.work,cand4@seekers.work,cand5@seekers.work,cand6@seekers.work';

      // Seed 4 existing candidates (slots 1..4 taken)
      for (let i = 1; i <= 4; i++) {
        dbUsers.set(`cand_${i}`, {
          id: `cand_${i}`,
          email: `cand${i}@seekers.work`,
          emailVerified: true,
          role: Role.CANDIDATE,
          profile: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      expect(dbUsers.size).toBe(4);

      // Candidate 5 and Candidate 6 race simultaneously for the 5th (and final) slot
      const [res5, res6] = await Promise.allSettled([
        service.syncUser({
          id: 'cand_5',
          email: 'cand5@seekers.work',
          emailVerified: true,
        }),
        service.syncUser({
          id: 'cand_6',
          email: 'cand6@seekers.work',
          emailVerified: true,
        }),
      ]);

      const fulfilled = [res5, res6].filter((r) => r.status === 'fulfilled');
      const rejected = [res5, res6].filter((r) => r.status === 'rejected');

      // Exactly 1 winner admitted, exactly 1 loser rejected with capacity ceiling
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedResult = rejected[0];
      const rejectedError = rejectedResult.reason as Error;
      expect(rejectedError.message).toContain(
        'Beta cohort capacity (5 participants) has been reached',
      );

      // Total candidates in database must equal exactly maxParticipants (5), never 6!
      expect(dbUsers.size).toBe(5);

      delete process.env.BETA_ALLOWLIST_ENABLED;
      delete process.env.BETA_MAX_PARTICIPANTS;
      delete process.env.BETA_INVITE_ALLOWLIST;
    });

    it('permits legitimate returning users to sync sessions without consuming new capacity slots', async () => {
      process.env.BETA_ALLOWLIST_ENABLED = 'true';
      process.env.BETA_MAX_PARTICIPANTS = '2';
      process.env.BETA_INVITE_ALLOWLIST = 'other@seekers.work';

      // Seed 2 candidates (capacity is already 100% full: 2/2)
      dbUsers.set('returning_user', {
        id: 'returning_user',
        email: 'returning@seekers.work',
        emailVerified: true,
        role: Role.CANDIDATE,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          id: 'prof_ret',
          userId: 'returning_user',
          name: 'Returning Candidate',
          title: 'Staff Engineer',
          skills: ['TypeScript'],
          extractedSkills: [],
          resumeUrl: null,
          locations: ['Dhaka'],
          remotePreference: RemoteEligibility.FULLY_REMOTE,
          minSalary: 150000,
          currency: 'BDT',
          onboardingCompleted: true,
          onboardingStep: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      dbUsers.set('user_2', {
        id: 'user_2',
        email: 'user2@seekers.work',
        emailVerified: true,
        role: Role.CANDIDATE,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: null,
      });

      expect(dbUsers.size).toBe(2);

      // Existing returning user logs in / refreshes session
      const outcome = await service.syncUser({
        id: 'returning_user',
        email: 'returning_updated@seekers.work',
        emailVerified: true,
      });

      expect(outcome.user.id).toBe('returning_user');
      expect(outcome.user.email).toBe('returning_updated@seekers.work');
      // Count must still be 2, never incremented
      expect(dbUsers.size).toBe(2);

      delete process.env.BETA_ALLOWLIST_ENABLED;
      delete process.env.BETA_MAX_PARTICIPANTS;
      delete process.env.BETA_INVITE_ALLOWLIST;
    });
  });
});

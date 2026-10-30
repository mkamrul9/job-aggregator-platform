import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from './user.repository';
import { PrismaService } from '../prisma.service';

describe('UserRepository', () => {
  let repository: UserRepository;
  let mockPrisma: {
    accountDeletionRequest: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    resumeDocument: {
      findMany: jest.Mock;
    };
    user: {
      delete: jest.Mock;
    };
  };

  const candidateAId = 'candidate-a-uid';
  const candidateBId = 'candidate-b-uid';
  const sharedKey = 'shared-idempotency-key-123';
  const mockNow = new Date('2026-10-27T12:00:00.000Z');

  beforeEach(async () => {
    mockPrisma = {
      accountDeletionRequest: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      resumeDocument: {
        findMany: jest.fn(),
      },
      user: {
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<UserRepository>(UserRepository);
  });

  describe('createDeletionRequest - Ownership & Idempotency', () => {
    it('scopes idempotencyKey to the authenticated candidate and never returns foreign requests', async () => {
      // Candidate A's request already recorded in database
      const candidateARequest = {
        id: 'del-req-cand-a',
        userId: candidateAId,
        status: 'PENDING',
        scheduledFor: new Date(mockNow.getTime() + 30 * 86400000),
        idempotencyKey: sharedKey,
        reason: 'Candidate A reason',
        requestedAt: mockNow,
        executedAt: null,
      };

      // Candidate B submits deletion request with the exact same idempotency key
      // When repository queries findUnique for Candidate B, it must use Candidate B's UID:
      mockPrisma.accountDeletionRequest.findUnique.mockImplementation(
        ({
          where,
        }: {
          where: {
            userId_idempotencyKey?: {
              userId?: string;
              idempotencyKey?: string;
            };
          };
        }) => {
          if (
            where.userId_idempotencyKey &&
            where.userId_idempotencyKey.userId === candidateAId &&
            where.userId_idempotencyKey.idempotencyKey === sharedKey
          ) {
            return Promise.resolve(candidateARequest);
          }
          return Promise.resolve(null);
        },
      );

      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(null);

      const candidateBNewRequest = {
        id: 'del-req-cand-b',
        userId: candidateBId,
        status: 'PENDING',
        scheduledFor: new Date(mockNow.getTime() + 30 * 86400000),
        idempotencyKey: sharedKey,
        reason: 'Candidate B independent reason',
        requestedAt: mockNow,
        executedAt: null,
      };
      mockPrisma.accountDeletionRequest.create.mockResolvedValue(
        candidateBNewRequest,
      );

      const resultB = await repository.createDeletionRequest(
        candidateBId,
        sharedKey,
        'Candidate B independent reason',
      );

      // Verify Candidate B queried for (candidateBId, sharedKey) and did NOT receive Candidate A's record
      expect(mockPrisma.accountDeletionRequest.findUnique).toHaveBeenCalledWith(
        {
          where: {
            userId_idempotencyKey: {
              userId: candidateBId,
              idempotencyKey: sharedKey,
            },
          },
        },
      );
      expect(resultB.userId).toBe(candidateBId);
      expect(resultB.id).toBe('del-req-cand-b');
      expect(resultB.id).not.toBe(candidateARequest.id);
      expect(resultB.reason).toBe('Candidate B independent reason');
    });

    it('returns existing request on same-candidate idempotent retry without creating duplicate', async () => {
      const candidateARequest = {
        id: 'del-req-cand-a',
        userId: candidateAId,
        status: 'PENDING',
        scheduledFor: new Date(mockNow.getTime() + 30 * 86400000),
        idempotencyKey: sharedKey,
        reason: 'Original reason',
        requestedAt: mockNow,
        executedAt: null,
      };

      mockPrisma.accountDeletionRequest.findUnique.mockResolvedValue(
        candidateARequest,
      );

      // Replay by Candidate A
      const result = await repository.createDeletionRequest(
        candidateAId,
        sharedKey,
        'Modified reason on retry',
      );

      expect(result.id).toBe('del-req-cand-a');
      expect(result.userId).toBe(candidateAId);
      expect(mockPrisma.accountDeletionRequest.create).not.toHaveBeenCalled();
    });

    it('handles concurrent race condition by catching P2002 and returning existing record', async () => {
      // First findUnique returns null (simulate race before insert)
      mockPrisma.accountDeletionRequest.findUnique.mockResolvedValueOnce(null);
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(null);

      // Concurrent insert won the race, so create throws P2002 unique constraint violation
      const p2002Error = new Error(
        'Unique constraint failed on the fields: (userId, idempotencyKey)',
      );
      (p2002Error as unknown as { code: string }).code = 'P2002';
      mockPrisma.accountDeletionRequest.create.mockRejectedValueOnce(
        p2002Error,
      );

      const existingRacedRequest = {
        id: 'del-req-cand-a-concurrent',
        userId: candidateAId,
        status: 'PENDING',
        scheduledFor: new Date(mockNow.getTime() + 30 * 86400000),
        idempotencyKey: sharedKey,
        reason: 'Concurrent winning request',
        requestedAt: mockNow,
        executedAt: null,
      };
      // Second findUnique returns the winning record
      mockPrisma.accountDeletionRequest.findUnique.mockResolvedValueOnce(
        existingRacedRequest,
      );

      const result = await repository.createDeletionRequest(
        candidateAId,
        sharedKey,
        'My concurrent request',
      );

      expect(result.id).toBe('del-req-cand-a-concurrent');
      expect(result.userId).toBe(candidateAId);
      expect(
        mockPrisma.accountDeletionRequest.findUnique,
      ).toHaveBeenCalledTimes(2);
    });

    it('returns existing pending deletion request when user already has active deletion request', async () => {
      mockPrisma.accountDeletionRequest.findUnique.mockResolvedValue(null);
      const activePendingRequest = {
        id: 'del-req-existing-pending',
        userId: candidateAId,
        status: 'PENDING',
        scheduledFor: new Date(mockNow.getTime() + 30 * 86400000),
        idempotencyKey: 'different-old-key',
        reason: 'Previous pending request',
        requestedAt: mockNow,
        executedAt: null,
      };
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(
        activePendingRequest,
      );

      const result = await repository.createDeletionRequest(
        candidateAId,
        'new-key-123',
        'New reason',
      );

      expect(result.id).toBe('del-req-existing-pending');
      expect(result.userId).toBe(candidateAId);
      expect(mockPrisma.accountDeletionRequest.create).not.toHaveBeenCalled();
    });

    it('cancels pending deletion request and sets status to CANCELLED', async () => {
      const activePending = {
        id: 'del-req-123',
        userId: candidateAId,
        status: 'PENDING',
        requestedAt: new Date(),
        scheduledFor: new Date(Date.now() + 86400000),
      };
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(
        activePending,
      );
      mockPrisma.accountDeletionRequest.update.mockResolvedValue({
        ...activePending,
        status: 'CANCELLED',
      });

      const cancelled = await repository.cancelAccountDeletion(candidateAId);
      expect(cancelled.status).toBe('CANCELLED');
      expect(mockPrisma.accountDeletionRequest.update).toHaveBeenCalledWith({
        where: { id: 'del-req-123' },
        data: { status: 'CANCELLED' },
      });
    });

    it('throws NotFoundException when cancelling with no pending request', async () => {
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      await expect(
        repository.cancelAccountDeletion(candidateAId),
      ).rejects.toThrow();
    });

    it('finds due account deletions based on scheduledFor threshold', async () => {
      const dueRequests = [
        {
          id: 'del-1',
          userId: 'user-1',
          status: 'PENDING',
          scheduledFor: new Date(Date.now() - 1000),
        },
      ];
      mockPrisma.accountDeletionRequest.findMany.mockResolvedValue(dueRequests);

      const found = await repository.findDueAccountDeletions(new Date());
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('del-1');
    });

    it('purges user atomically and returns resume storage keys for physical cleanup', async () => {
      mockPrisma.resumeDocument.findMany.mockResolvedValue([
        { storageKey: 'resumes/usr_1/doc_1.pdf' },
        { storageKey: 'resumes/usr_1/doc_2.pdf' },
      ]);
      mockPrisma.user.delete.mockResolvedValue({ id: candidateAId });

      const result = await repository.purgeAccount(candidateAId);
      expect(result.userId).toBe(candidateAId);
      expect(result.resumeStorageKeys).toEqual([
        'resumes/usr_1/doc_1.pdf',
        'resumes/usr_1/doc_2.pdf',
      ]);
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: candidateAId },
      });
    });
  });
});

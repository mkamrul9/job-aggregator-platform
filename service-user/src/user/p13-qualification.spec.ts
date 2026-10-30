import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { RemoteEligibility, Role } from '@prisma/client';

describe('P13 Production Qualification: Security, Privacy & Accessibility', () => {
  let service: UserService;

  const candidateAId = 'usr_candidate_alpha';
  const candidateBId = 'usr_candidate_beta';
  const mockNow = new Date('2026-10-30T12:00:00.000Z');

  const mockCandidateA = {
    id: candidateAId,
    email: 'alpha@seekers.internal',
    emailVerified: true,
    role: Role.CANDIDATE,
    createdAt: mockNow,
    updatedAt: mockNow,
    profile: {
      id: 'prof_alpha',
      userId: candidateAId,
      name: 'Alpha Candidate',
      title: 'Senior Distributed Systems Engineer',
      skills: ['Go', 'TypeScript', 'Kubernetes'],
      extractedSkills: ['Docker'],
      resumeUrl: null,
      locations: ['Dhaka', 'Remote'],
      remotePreference: RemoteEligibility.FULLY_REMOTE,
      minSalary: 180000,
      currency: 'BDT',
      onboardingCompleted: true,
      onboardingStep: 3,
      createdAt: mockNow,
      updatedAt: mockNow,
    },
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    accountDeletionRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    accountExportRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    resumeDocument: {
      findMany: jest.fn(),
    },
    savedJob: { findMany: jest.fn(), count: jest.fn() },
    savedSearch: { findMany: jest.fn(), count: jest.fn() },
    trackedApplication: { findMany: jest.fn(), count: jest.fn() },
    supportReport: { findMany: jest.fn(), count: jest.fn() },
    alertSubscription: { findMany: jest.fn(), count: jest.fn() },
    recommendationFeedback: { findMany: jest.fn() },
  };

  const mockStorage = {
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(true),
    validatePdfBuffer: jest.fn(),
    resolveSafePath: jest.fn((key: string) => `/safe/storage/${key}`),
    computeChecksumSha256: jest.fn().mockReturnValue('mock-sha256'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        UserRepository,
        {
          provide: StorageService,
          useValue: mockStorage,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('1. Privacy: Account Deletion Lifecycle & Controllable Purge', () => {
    it('schedules an account erasure request with 30-day grace period', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockCandidateA);
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(null);
      const scheduledDate = new Date(mockNow.getTime() + 30 * 86400000);
      mockPrisma.accountDeletionRequest.create.mockResolvedValue({
        id: 'del_req_01',
        userId: candidateAId,
        status: 'PENDING',
        scheduledFor: scheduledDate,
        requestedAt: mockNow,
      });

      const result = await service.requestAccountDeletion(
        candidateAId,
        'idem_01',
        'User relocation',
      );

      expect(result.success).toBe(true);
      expect(result.request_id).toBe('del_req_01');
      expect(result.status).toBe('PENDING');
      expect(new Date(result.scheduled_for).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it('cancels a pending account deletion request during the active grace period', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockCandidateA);
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue({
        id: 'del_req_01',
        userId: candidateAId,
        status: 'PENDING',
      });
      mockPrisma.accountDeletionRequest.update.mockResolvedValue({
        id: 'del_req_01',
        userId: candidateAId,
        status: 'CANCELLED',
      });

      const result = await service.cancelAccountDeletion(candidateAId);

      expect(result.success).toBe(true);
      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.accountDeletionRequest.update).toHaveBeenCalledWith({
        where: { id: 'del_req_01' },
        data: { status: 'CANCELLED' },
      });
    });

    it('rejects cancellation when no pending deletion exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockCandidateA);
      mockPrisma.accountDeletionRequest.findFirst.mockResolvedValue(null);

      await expect(service.cancelAccountDeletion(candidateAId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('executes due-date purge worker using controllable reference clock', async () => {
      const expiredRequest = {
        id: 'del_req_due',
        userId: candidateAId,
        status: 'PENDING',
        scheduledFor: new Date(Date.now() - 1000), // Due in the past
      };

      mockPrisma.accountDeletionRequest.findMany.mockResolvedValue([
        expiredRequest,
      ]);
      mockPrisma.accountDeletionRequest.update.mockResolvedValue({
        ...expiredRequest,
        status: 'PROCESSING',
      });
      mockPrisma.resumeDocument.findMany.mockResolvedValue([
        { storageKey: `resumes/${candidateAId}/cv_v1.pdf` },
      ]);
      mockPrisma.user.delete.mockResolvedValue({ id: candidateAId });

      // Run purge with referenceTime set to now
      const purged = await service.processDueAccountDeletions(new Date());

      expect(purged).toBe(1);
      // Confirmed physical storage file deletion
      expect(mockStorage.deleteObject).toHaveBeenCalledWith(
        `resumes/${candidateAId}/cv_v1.pdf`,
      );
      // Confirmed database user deletion (cascades to all child models)
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: candidateAId },
      });
    });
  });

  describe('2. Privacy: Portable Data Export & Cross-User Security', () => {
    it('generates portable export, persists archive, and produces download URL', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockCandidateA);
      mockPrisma.accountExportRequest.create.mockResolvedValue({
        id: 'exp_01',
        userId: candidateAId,
        status: 'READY',
      });
      mockPrisma.accountExportRequest.update.mockResolvedValue({
        id: 'exp_01',
        userId: candidateAId,
        status: 'READY',
        archiveUrl: '/users/account/export/exp_01/download',
      });
      mockPrisma.savedJob.findMany.mockResolvedValue([]);
      mockPrisma.savedSearch.findMany.mockResolvedValue([]);
      mockPrisma.trackedApplication.findMany.mockResolvedValue([]);
      mockPrisma.supportReport.findMany.mockResolvedValue([]);
      mockPrisma.alertSubscription.findMany.mockResolvedValue([]);

      const exportResult = await service.exportUserData(candidateAId);

      expect(exportResult.user_id).toBe(candidateAId);
      expect(exportResult.request_id).toBe('exp_01');
      expect(exportResult.archive_url).toBe(
        '/users/account/export/exp_01/download',
      );
      // Confirmed storage of export archive JSON
      expect(mockStorage.putObject).toHaveBeenCalledWith(
        `exports/${candidateAId}/export-exp_01.json`,
        expect.any(Buffer),
        { skipPdfCheck: true },
      );
    });

    it('allows owner to download export archive', async () => {
      mockPrisma.accountExportRequest.findFirst.mockResolvedValue({
        id: 'exp_01',
        userId: candidateAId,
        status: 'READY',
      });
      const archiveBytes = Buffer.from(
        JSON.stringify({ user_id: candidateAId }),
      );
      mockStorage.getObject.mockResolvedValue(archiveBytes);

      const download = await service.downloadExportArchive(
        candidateAId,
        'exp_01',
      );

      expect(download.buffer).toEqual(archiveBytes);
      expect(download.fileName).toContain('exp_01.json');
    });

    it('strictly forbids foreign candidate from downloading another candidate export', async () => {
      // Candidate B attempts to download Candidate A's export
      mockPrisma.accountExportRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.downloadExportArchive(candidateBId, 'exp_01'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Security: Storage Key Validation & Boundary Hardening', () => {
    it('validates storage key grammar and prevents directory traversal', () => {
      const realStorage = new StorageService();

      // Path traversal attempts
      expect(() => realStorage.resolveSafePath('../../etc/passwd')).toThrow(
        BadRequestException,
      );
      expect(() =>
        realStorage.resolveSafePath('..\\windows\\system32'),
      ).toThrow(BadRequestException);
      expect(() => realStorage.resolveSafePath('/absolute/path')).toThrow(
        BadRequestException,
      );
      expect(() => realStorage.resolveSafePath('C:\\autoexec.bat')).toThrow(
        BadRequestException,
      );
      expect(() => realStorage.resolveSafePath('resumes/evil$file')).toThrow(
        BadRequestException,
      );

      // Safe canonical keys permitted
      expect(
        realStorage.resolveSafePath('resumes/usr_1/cv_2026.pdf'),
      ).toBeDefined();
      expect(
        realStorage.resolveSafePath('exports/usr_1/export_01.json'),
      ).toBeDefined();
    });

    it('validates PDF signature and rejects non-PDF payloads', () => {
      const realStorage = new StorageService();

      // Valid PDF signature
      expect(() =>
        realStorage.validatePdfBuffer(Buffer.from('%PDF-1.7 Test')),
      ).not.toThrow();

      // Invalid signatures
      expect(() =>
        realStorage.validatePdfBuffer(Buffer.from('<html>Evil</html>')),
      ).toThrow(BadRequestException);
      expect(() =>
        realStorage.validatePdfBuffer(Buffer.from('PK\x03\x04 ZipArchive')),
      ).toThrow(BadRequestException);
      expect(() => realStorage.validatePdfBuffer(Buffer.alloc(0))).toThrow(
        BadRequestException,
      );

      // Oversized buffer (>10MB)
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      oversized.write('%PDF', 0, 4, 'ascii');
      expect(() => realStorage.validatePdfBuffer(oversized)).toThrow(
        PayloadTooLargeException,
      );
    });
  });
});

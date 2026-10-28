import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { of } from 'rxjs';
import { RemoteEligibility } from '@prisma/client';
import { Readable } from 'stream';

describe('UserService', () => {
  let service: UserService;

  const mockDate = new Date('2026-10-27T12:00:00.000Z');

  const mockUserWithProfile = {
    id: 'firebase-uid-123',
    email: 'candidate@seekers.example',
    emailVerified: true,
    role: 'CANDIDATE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    profile: {
      id: 'profile-uuid-1',
      userId: 'firebase-uid-123',
      name: 'Farhan Ahmed',
      title: 'Full-Stack Software Engineer',
      skills: ['TypeScript', 'Node.js', 'React'],
      extractedSkills: ['Python', 'Docker'],
      resumeUrl: null,
      locations: ['Dhaka', 'Remote'],
      remotePreference: RemoteEligibility.FULLY_REMOTE,
      minSalary: 150000,
      currency: 'BDT',
      onboardingCompleted: true,
      onboardingStep: 3,
      createdAt: mockDate,
      updatedAt: mockDate,
    },
  };

  const mockUserRepository = {
    upsertUser: jest.fn(),
    findById: jest.fn(),
    updateProfile: jest.fn(),
    createExportRequest: jest.fn(),
    createDeletionRequest: jest.fn(),
    getAccountStatus: jest.fn(),
    updateSkills: jest.fn(),
    createResumeDocument: jest.fn(),
    createParseResult: jest.fn(),
    findParseResultById: jest.fn(),
    updateParseResult: jest.fn(),
    updateResumeStatus: jest.fn(),
    applyReviewedSkills: jest.fn(),
    deleteActiveResume: jest.fn(),
    findActiveResume: jest.fn(),
    findResumeById: jest.fn(),
  };

  const mockClientGrpc = {
    getService: jest.fn().mockReturnValue({
      parseResume: jest
        .fn()
        .mockReturnValue(of({ success: true, skills: ['Python', 'FastAPI'] })),
    }),
  };

  const mockStorageService = {
    validatePdfBuffer: jest.fn(),
    computeChecksumSha256: jest.fn().mockReturnValue('dummy-checksum-sha256'),
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 sample')),
    deleteObject: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: mockUserRepository,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: 'RESUME_PACKAGE',
          useValue: mockClientGrpc,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('syncUser', () => {
    it('should idempotently sync a verified candidate identity and return DTO', async () => {
      mockUserRepository.upsertUser.mockResolvedValue(mockUserWithProfile);

      const result = await service.syncUser({
        id: 'firebase-uid-123',
        email: 'candidate@seekers.example',
        emailVerified: true,
      });

      expect(result.message).toContain('synchronized');
      expect(result.user.id).toBe('firebase-uid-123');
      expect(result.user.email).toBe('candidate@seekers.example');
      expect(result.user.email_verified).toBe(true);
      expect(result.user.name).toBe('Farhan Ahmed');
      expect(result.user.preferences.remote_preference).toBe('FULLY_REMOTE');
      expect(mockUserRepository.upsertUser).toHaveBeenCalledWith(
        'firebase-uid-123',
        'candidate@seekers.example',
        true,
      );
    });
  });

  describe('getProfile', () => {
    it('should return mapped candidate profile when user exists', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUserWithProfile);

      const profile = await service.getProfile('firebase-uid-123');

      expect(profile.id).toBe('firebase-uid-123');
      expect(profile.name).toBe('Farhan Ahmed');
      expect(profile.skills).toEqual(['TypeScript', 'Node.js', 'React']);
      expect(profile.preferences.currency).toBe('BDT');
      expect(profile.onboarding.completed).toBe(true);
    });

    it('should throw NotFoundException if candidate not yet synced', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-uid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update profile attributes and return updated DTO', async () => {
      const updatedUser = {
        ...mockUserWithProfile,
        profile: {
          ...mockUserWithProfile.profile,
          name: 'Farhan Ahmed Updated',
          skills: ['TypeScript', 'Node.js', 'React', 'Go'],
        },
      };
      mockUserRepository.updateProfile.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('firebase-uid-123', {
        name: 'Farhan Ahmed Updated',
        skills: ['TypeScript', 'Node.js', 'React', 'Go'],
      });

      expect(result.name).toBe('Farhan Ahmed Updated');
      expect(result.skills).toContain('Go');
      expect(mockUserRepository.updateProfile).toHaveBeenCalledWith(
        'firebase-uid-123',
        {
          name: 'Farhan Ahmed Updated',
          skills: ['TypeScript', 'Node.js', 'React', 'Go'],
        },
      );
    });
  });

  describe('exportUserData', () => {
    it('should create an export request and return complete personal data archive', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUserWithProfile);
      mockUserRepository.createExportRequest.mockResolvedValue({
        id: 'export-req-uuid-1',
        userId: 'firebase-uid-123',
        status: 'READY',
        format: 'JSON',
        requestedAt: mockDate,
        completedAt: mockDate,
      });

      const exportResult = await service.exportUserData('firebase-uid-123');

      expect(exportResult.user_id).toBe('firebase-uid-123');
      expect(exportResult.request_id).toBe('export-req-uuid-1');
      expect(exportResult.status).toBe('READY');
      expect(exportResult.profile.name).toBe('Farhan Ahmed');
      expect(Array.isArray(exportResult.applications)).toBe(true);
      expect(Array.isArray(exportResult.saved_jobs)).toBe(true);
      expect(Array.isArray(exportResult.alerts)).toBe(true);
    });
  });

  describe('requestAccountDeletion', () => {
    it('should record an account deletion request with a 30-day grace period', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUserWithProfile);
      const scheduledFor = new Date(
        mockDate.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
      mockUserRepository.createDeletionRequest.mockResolvedValue({
        id: 'del-req-uuid-1',
        userId: 'firebase-uid-123',
        status: 'PENDING',
        scheduledFor,
        requestedAt: mockDate,
        idempotencyKey: 'idem-key-abc',
        reason: 'Relocating abroad',
      });

      const result = await service.requestAccountDeletion(
        'firebase-uid-123',
        'idem-key-abc',
        'Relocating abroad',
      );

      expect(result.success).toBe(true);
      expect(result.request_id).toBe('del-req-uuid-1');
      expect(result.status).toBe('PENDING');
      expect(result.scheduled_for).toBe(scheduledFor.toISOString());
      expect(mockUserRepository.createDeletionRequest).toHaveBeenCalledWith(
        'firebase-uid-123',
        'idem-key-abc',
        'Relocating abroad',
      );
    });

    it('should throw NotFoundException if candidate is not registered', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        service.requestAccountDeletion('unknown-uid', 'key-123', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('P08 Owned Resume Lifecycle', () => {
    const mockFile: Express.Multer.File = {
      buffer: Buffer.from('%PDF-1.4 Valid candidate resume'),
      originalname: 'candidate_cv.pdf',
      fieldname: 'file',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 32,
      stream: null as unknown as Readable,
      destination: '',
      filename: '',
      path: '',
    };

    describe('uploadResume', () => {
      it('accepts valid PDF, stores to private storage, creates DB records, and returns 202 payload', async () => {
        mockUserRepository.createResumeDocument.mockResolvedValue({
          id: 'doc-uuid-1',
          userId: 'firebase-uid-123',
          storageKey: 'resumes/firebase-uid-123/doc-uuid-1.pdf',
          fileName: 'candidate_cv.pdf',
        });
        mockUserRepository.createParseResult.mockResolvedValue({
          id: 'parse-uuid-1',
          documentId: 'doc-uuid-1',
          userId: 'firebase-uid-123',
          status: 'QUEUED',
        });
        mockUserRepository.updateProfile.mockResolvedValue(mockUserWithProfile);

        const res = await service.uploadResume('firebase-uid-123', mockFile);

        expect(res.parse_id).toBeDefined();
        expect(res.status).toBe('QUEUED');
        expect(res.message).toContain('accepted for asynchronous processing');
        expect(mockStorageService.validatePdfBuffer).toHaveBeenCalled();
        expect(mockStorageService.putObject).toHaveBeenCalled();
        expect(mockUserRepository.createResumeDocument).toHaveBeenCalled();
        expect(mockUserRepository.createParseResult).toHaveBeenCalled();
      });
    });

    describe('getParseStatus', () => {
      it('returns extraction status and skills for owning candidate', async () => {
        mockUserRepository.findParseResultById.mockResolvedValue({
          id: 'parse-uuid-1',
          userId: 'firebase-uid-123',
          documentId: 'doc-uuid-1',
          status: 'COMPLETED',
          extractedSkills: ['Python', 'FastAPI', 'Docker'],
          processingTimeMs: 18,
        });

        const status = await service.getParseStatus(
          'firebase-uid-123',
          'parse-uuid-1',
        );

        expect(status.parse_id).toBe('parse-uuid-1');
        expect(status.status).toBe('COMPLETED');
        expect(status.extracted_skills).toEqual([
          'Python',
          'FastAPI',
          'Docker',
        ]);
        expect(status.processing_time_ms).toBe(18);
      });

      it('rejects access from a different candidate with NotFoundException', async () => {
        mockUserRepository.findParseResultById.mockResolvedValue({
          id: 'parse-uuid-1',
          userId: 'candidate-A',
          documentId: 'doc-uuid-1',
          status: 'COMPLETED',
          extractedSkills: ['Go'],
        });

        await expect(
          service.getParseStatus('candidate-B', 'parse-uuid-1'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('reviewParseSkills', () => {
      it('merges accepted skills into profile without clobbering existing manual skills', async () => {
        mockUserRepository.findParseResultById.mockResolvedValue({
          id: 'parse-uuid-1',
          userId: 'firebase-uid-123',
          documentId: 'doc-uuid-1',
          status: 'COMPLETED',
          extractedSkills: ['Python', 'Docker'],
        });

        const updatedWithSkills = {
          ...mockUserWithProfile,
          profile: {
            ...mockUserWithProfile.profile,
            skills: ['TypeScript', 'Node.js', 'React', 'Python'],
          },
        };
        mockUserRepository.applyReviewedSkills.mockResolvedValue(
          updatedWithSkills,
        );

        const res = await service.reviewParseSkills(
          'firebase-uid-123',
          'parse-uuid-1',
          ['Python'],
        );

        expect(res.skills).toContain('TypeScript');
        expect(res.skills).toContain('Python');
        expect(mockUserRepository.applyReviewedSkills).toHaveBeenCalledWith(
          'firebase-uid-123',
          'parse-uuid-1',
          ['Python'],
        );
      });

      it('rejects review if parse task is still PROCESSING', async () => {
        mockUserRepository.findParseResultById.mockResolvedValue({
          id: 'parse-uuid-1',
          userId: 'firebase-uid-123',
          status: 'PROCESSING',
        });

        await expect(
          service.reviewParseSkills('firebase-uid-123', 'parse-uuid-1', [
            'Python',
          ]),
        ).rejects.toThrow();
      });
    });

    describe('deleteResume', () => {
      it('deletes active resume document and removes object from storage', async () => {
        mockUserRepository.deleteActiveResume.mockResolvedValue({
          id: 'doc-uuid-1',
          storageKey: 'resumes/firebase-uid-123/doc-uuid-1.pdf',
        });

        const res = await service.deleteResume('firebase-uid-123');

        expect(res.message).toBe('Resume document deleted successfully');
        expect(mockUserRepository.deleteActiveResume).toHaveBeenCalledWith(
          'firebase-uid-123',
        );
        expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
          'resumes/firebase-uid-123/doc-uuid-1.pdf',
        );
      });
    });
  });
});

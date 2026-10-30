import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { of } from 'rxjs';
import { RemoteEligibility } from '@prisma/client';
import { Readable } from 'stream';
import * as crypto from 'crypto';

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
    updateProfileResumeUrl: jest.fn(),
    createExportRequest: jest.fn(),
    findExportRequestById: jest.fn(),
    updateExportRequest: jest.fn(),
    createDeletionRequest: jest.fn(),
    cancelAccountDeletion: jest.fn(),
    findDueAccountDeletions: jest.fn(),
    markAccountDeletionProcessing: jest.fn(),
    purgeAccount: jest.fn(),
    getAccountStatus: jest.fn(),
    updateSkills: jest.fn(),
    createResumeDocument: jest.fn(),
    createResumeDocumentAtomic: jest.fn(),
    createParseResult: jest.fn(),
    findParseResultById: jest.fn(),
    updateParseResult: jest.fn(),
    updateResumeStatus: jest.fn(),
    applyReviewedSkills: jest.fn(),
    deleteActiveResume: jest.fn(),
    markActiveResumeDeleted: jest.fn(),
    findPendingCleanups: jest.fn().mockResolvedValue([]),
    getComprehensiveUserData: jest.fn().mockResolvedValue({
      savedJobs: [],
      savedSearches: [],
      applications: [],
      supportReports: [],
      alerts: [],
    }),
    saveJob: jest.fn(),
    unsaveJob: jest.fn(),
    findSavedJobs: jest.fn(),
    createSavedSearch: jest.fn(),
    findSavedSearches: jest.fn(),
    findSavedSearchById: jest.fn(),
    updateSavedSearch: jest.fn(),
    deleteSavedSearch: jest.fn(),
    createApplication: jest.fn(),
    updateApplication: jest.fn(),
    deleteApplication: jest.fn(),
    findApplications: jest.fn(),
    findApplicationById: jest.fn(),
    getApplicationById: jest.fn(),
    createSupportReport: jest.fn(),
    findReportByIdOrRef: jest.fn(),
    listSupportReports: jest.fn(),
    triageReport: jest.fn(),
    findApplicationById: jest.fn(),
    createAlert: jest.fn(),
    listAlerts: jest.fn(),
    deleteAlert: jest.fn(),
    toggleAlert: jest.fn(),
    deactivateAlert: jest.fn(),
    findAlertWithUser: jest.fn(),
    updateDocumentCleanupStatus: jest.fn(),
    findActiveResume: jest.fn(),
    findActiveResumeWithLatestParse: jest.fn(),
    findResumeById: jest.fn(),
    claimNextPendingParseTask: jest.fn(),
    completeParseTaskFenced: jest.fn(),
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
      expect(exportResult.archive_url).toContain(
        '/users/account/export/export-req-uuid-1/download',
      );
      expect(Array.isArray(exportResult.applications)).toBe(true);
      expect(Array.isArray(exportResult.saved_jobs)).toBe(true);
      expect(Array.isArray(exportResult.alerts)).toBe(true);
      expect(mockStorageService.putObject).toHaveBeenCalled();
    });

    it('downloadExportArchive returns buffer when caller is the owner', async () => {
      mockUserRepository.findExportRequestById.mockResolvedValue({
        id: 'export-1',
        userId: 'firebase-uid-123',
        status: 'READY',
      });
      const exportJson = JSON.stringify({ profile: { name: 'Farhan' } });
      mockStorageService.getObject.mockResolvedValue(
        Buffer.from(exportJson, 'utf-8'),
      );

      const result = await service.downloadExportArchive(
        'firebase-uid-123',
        'export-1',
      );
      expect(result.buffer).toBeDefined();
      expect(result.fileName).toContain('export-1.json');
    });

    it('downloadExportArchive throws NotFoundException when export not found or foreign owner', async () => {
      mockUserRepository.findExportRequestById.mockResolvedValue(null);

      await expect(
        service.downloadExportArchive('foreign-uid', 'export-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelAccountDeletion & Purge Worker', () => {
    it('cancels an active pending account deletion request', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUserWithProfile);
      mockUserRepository.cancelAccountDeletion.mockResolvedValue({
        id: 'del-req-123',
        status: 'CANCELLED',
      });

      const res = await service.cancelAccountDeletion('firebase-uid-123');
      expect(res.success).toBe(true);
      expect(res.status).toBe('CANCELLED');
    });

    it('processDueAccountDeletions purges expired requests and cleans storage files', async () => {
      const dueRequest = {
        id: 'del-due-1',
        userId: 'user-to-purge',
        status: 'PENDING',
        scheduledFor: new Date(Date.now() - 5000),
      };
      mockUserRepository.findDueAccountDeletions.mockResolvedValue([
        dueRequest,
      ]);
      mockUserRepository.markAccountDeletionProcessing.mockResolvedValue({
        ...dueRequest,
        status: 'PROCESSING',
      });
      mockUserRepository.purgeAccount.mockResolvedValue({
        userId: 'user-to-purge',
        resumeStorageKeys: ['resumes/user-to-purge/cv.pdf'],
      });

      const purgedCount = await service.processDueAccountDeletions();
      expect(purgedCount).toBe(1);
      expect(mockUserRepository.purgeAccount).toHaveBeenCalledWith(
        'user-to-purge',
      );
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
        'resumes/user-to-purge/cv.pdf',
      );
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
        mockUserRepository.createResumeDocumentAtomic.mockResolvedValue({
          document: {
            id: 'doc-uuid-1',
            userId: 'firebase-uid-123',
            storageKey: 'resumes/firebase-uid-123/doc-uuid-1.pdf',
            fileName: 'candidate_cv.pdf',
          },
          parseResult: {
            id: 'parse-uuid-1',
            documentId: 'doc-uuid-1',
            userId: 'firebase-uid-123',
            status: 'QUEUED',
          },
        });
        mockUserRepository.updateProfile.mockResolvedValue(mockUserWithProfile);

        const res = await service.uploadResume('firebase-uid-123', mockFile);

        expect(res.parse_id).toBeDefined();
        expect(res.status).toBe('QUEUED');
        expect(res.message).toContain('accepted for asynchronous processing');
        expect(mockStorageService.validatePdfBuffer).toHaveBeenCalled();
        expect(mockStorageService.putObject).toHaveBeenCalled();
        expect(
          mockUserRepository.createResumeDocumentAtomic,
        ).toHaveBeenCalled();
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
    });

    describe('getActiveResume', () => {
      it('returns active resume and latest parse state', async () => {
        mockUserRepository.findActiveResumeWithLatestParse.mockResolvedValue({
          document: {
            id: 'doc-uuid-1',
            fileName: 'resume.pdf',
            fileSizeBytes: 1024,
            status: 'PARSED',
            createdAt: mockDate,
          },
          latestParse: {
            id: 'parse-1',
            status: 'COMPLETED',
            extractedSkills: ['React'],
            reviewedSkills: ['React'],
            reviewedAt: mockDate,
            errorCode: null,
          },
        });

        const res = await service.getActiveResume('firebase-uid-123');
        expect(res.has_resume).toBe(true);
        expect(res.document?.file_name).toBe('resume.pdf');
        expect(res.latest_parse?.status).toBe('COMPLETED');
      });
    });

    describe('deleteResume', () => {
      it('deletes active resume document and removes object from storage', async () => {
        mockUserRepository.markActiveResumeDeleted.mockResolvedValue([
          {
            id: 'doc-uuid-1',
            storageKey: 'resumes/firebase-uid-123/doc-uuid-1.pdf',
          },
        ]);
        mockUserRepository.findPendingCleanups.mockResolvedValue([]);

        const res = await service.deleteResume('firebase-uid-123');

        expect(res.message).toBe('Resume document deleted successfully');
        expect(mockUserRepository.markActiveResumeDeleted).toHaveBeenCalledWith(
          'firebase-uid-123',
        );
        expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
          'resumes/firebase-uid-123/doc-uuid-1.pdf',
        );
      });
    });
  });

  describe('Saved Jobs Workspace', () => {
    it('saves a job snapshot idempotently', async () => {
      mockUserRepository.saveJob.mockResolvedValue({
        id: 'sj-1',
        userId: 'firebase-uid-123',
        jobId: 'job-abc',
        titleSnapshot: 'Backend Engineer',
        companySnapshot: 'Tech Corp',
        locationSnapshot: 'Remote',
        jobUrlSnapshot: 'https://example.com/jobs/1',
        salarySnapshot: '$100k',
        createdAt: mockDate,
      });

      const res = await service.saveJob('firebase-uid-123', 'job-abc', {
        title: 'Backend Engineer',
        company: 'Tech Corp',
        location: 'Remote',
        job_url: 'https://example.com/jobs/1',
        salary: '$100k',
      });

      expect(res.job_id).toBe('job-abc');
      expect(res.title).toBe('Backend Engineer');
      expect(mockUserRepository.saveJob).toHaveBeenCalled();
    });

    it('rejects unsafe javascript URLs in fallback snapshot', async () => {
      await expect(
        service.saveJob('firebase-uid-123', 'job-abc', {
          title: 'Backend Engineer',
          company: 'Tech Corp',
          job_url: 'javascript:alert("exploit")',
        }),
      ).rejects.toThrow();
    });

    it('rejects saving a job that returns 404 in catalog', async () => {
      jest
        .spyOn(service, 'fetchCatalogJob')
        .mockResolvedValue({ kind: 'NOT_FOUND' });
      await expect(
        service.saveJob('firebase-uid-123', 'non-existent-job', {
          title: 'Phantom Job',
          company: 'Phantom Corp',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('unsaves a job', async () => {
      mockUserRepository.unsaveJob.mockResolvedValue(true);
      const res = await service.unsaveJob('firebase-uid-123', 'job-abc');
      expect(res.success).toBe(true);
    });

    it('returns paginated saved jobs with catalog verification', async () => {
      mockUserRepository.findSavedJobs.mockResolvedValue({
        items: [
          {
            id: 'sj-1',
            jobId: 'job-abc',
            titleSnapshot: 'Backend Engineer',
            companySnapshot: 'Tech Corp',
            locationSnapshot: 'Remote',
            jobUrlSnapshot: null,
            salarySnapshot: null,
            createdAt: mockDate,
          },
        ],
        nextCursor: null,
        total: 1,
      });

      const res = await service.getSavedJobs('firebase-uid-123');
      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe('job-abc');
      expect(res.total_count).toBe(1);
    });
  });

  describe('Saved Searches', () => {
    it('creates a saved search query', async () => {
      mockUserRepository.createSavedSearch.mockResolvedValue({
        id: 'search-1',
        userId: 'firebase-uid-123',
        name: 'Remote Backend',
        query: 'backend',
        location: 'Remote',
        remoteEligibility: 'FULLY_REMOTE',
        seniority: 'SENIOR',
        jobType: 'FULL_TIME',
        minSalary: null,
        currency: 'BDT',
        payPeriod: 'MONTHLY',
        sort: 'date_desc',
        alertsEnabled: true,
        alertFrequency: 'DAILY',
        createdAt: mockDate,
        updatedAt: mockDate,
      });

      const res = await service.createSavedSearch('firebase-uid-123', {
        name: 'Remote Backend',
        query: 'backend',
        location: 'Remote',
        remote_eligibility: 'FULLY_REMOTE',
        seniority: 'SENIOR',
        job_type: 'FULL_TIME',
        alerts_enabled: true,
        alert_frequency: 'DAILY',
      });

      expect(res.id).toBe('search-1');
      expect(res.name).toBe('Remote Backend');
      expect(res.query).toBe('backend');
    });
  });

  describe('Applications Workspace & History', () => {
    it('tracks an application and creates initial history entry', async () => {
      mockUserRepository.createApplication.mockResolvedValue({
        id: 'app-1',
        userId: 'firebase-uid-123',
        jobId: 'job-abc',
        titleSnapshot: 'Backend Engineer',
        companySnapshot: 'Tech Corp',
        locationSnapshot: 'Remote',
        jobUrlSnapshot: null,
        salarySnapshot: null,
        status: 'APPLIED',
        notes: 'Applied via company portal',
        version: 1,
        appliedAt: mockDate,
        updatedAt: mockDate,
        history: [
          {
            id: 'h-1',
            applicationId: 'app-1',
            status: 'APPLIED',
            notes: 'Application tracked',
            changedAt: mockDate,
          },
        ],
      });

      const res = await service.trackApplication('firebase-uid-123', {
        job_id: 'job-abc',
        status: 'APPLIED',
        notes: 'Applied via company portal',
        title: 'Backend Engineer',
        company: 'Tech Corp',
      });

      expect(res.id).toBe('app-1');
      expect(res.status).toBe('APPLIED');
      expect(res.version).toBe(1);
      expect(res.history.length).toBe(1);
    });

    it('detects concurrency conflict on stale version update', async () => {
      mockUserRepository.updateApplication.mockRejectedValue(
        new (class ConcurrencyConflict extends Error {
          code = 'CONCURRENCY_CONFLICT';
        })('Application was modified concurrently'),
      );

      await expect(
        service.updateApplication('firebase-uid-123', 'app-1', {
          status: 'INTERVIEWING',
          expected_version: 1,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Reports and Support Triage', () => {
    it('submits a support report with durable reference', async () => {
      mockUserRepository.createSupportReport.mockResolvedValue({
        id: 'rep-uuid-1',
        referenceNum: 'RPT-20261029-ABCD',
        userId: 'firebase-uid-123',
        jobId: 'job-123',
        reportType: 'BROKEN_LINK',
        description: 'The apply link goes to a dead domain.',
        contactEmail: 'user@example.com',
        ipHash: 'hash123',
        status: 'OPEN',
        operatorNotes: null,
        createdAt: mockDate,
        updatedAt: mockDate,
        resolvedAt: null,
      });

      const res = await service.submitReport({
        report_type: 'BROKEN_LINK',
        description: 'The apply link goes to a dead domain.',
        job_id: 'job-123',
        contact_email: 'user@example.com',
        userId: 'firebase-uid-123',
      });

      expect(res.reference_num).toBe('RPT-20261029-ABCD');
      expect(res.status).toBe('OPEN');
    });

    it('rejects foreign candidate reading another users report', async () => {
      mockUserRepository.findReportByIdOrRef.mockResolvedValue(null);

      await expect(
        service.getReport('RPT-20261029-ABCD', 'firebase-uid-123', false),
      ).rejects.toThrow();
    });
  });

  describe('Unsubscribe Token Verification and Scope Enforcement', () => {
    const secret = 'dev-demo-unsubscribe-isolated-key-p11';

    function createTestToken(payload: Record<string, unknown>, key = secret) {
      const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const sig = crypto.createHmac('sha256', key).update(b64).digest('hex');
      return `${b64}.${sig}`;
    }

    it('deactivates alert when token is valid and matches subscription owner', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createTestToken({
        sub: 'sub-valid-1',
        cand: 'firebase-uid-123',
        email: 'candidate@seekers.example',
        exp: nowSec + 3600,
        purpose: 'job_alert_unsubscribe',
      });

      mockUserRepository.findAlertWithUser.mockResolvedValue({
        id: 'sub-valid-1',
        userId: 'firebase-uid-123',
        active: true,
        user: { email: 'candidate@seekers.example' },
      });
      mockUserRepository.deactivateAlert.mockResolvedValue(true);

      const res = await service.unsubscribeAlertByToken(token);
      expect(res.success).toBe(true);
      expect(mockUserRepository.deactivateAlert).toHaveBeenCalledWith(
        'sub-valid-1',
      );
    });

    it('rejects token when candidate ID does not match subscription owner', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createTestToken({
        sub: 'sub-valid-1',
        cand: 'attacker-uid-999',
        email: 'candidate@seekers.example',
        exp: nowSec + 3600,
        purpose: 'job_alert_unsubscribe',
      });

      mockUserRepository.findAlertWithUser.mockResolvedValue({
        id: 'sub-valid-1',
        userId: 'firebase-uid-123',
        user: { email: 'candidate@seekers.example' },
      });

      await expect(service.unsubscribeAlertByToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token when recipient email does not match subscription owner', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createTestToken({
        sub: 'sub-valid-1',
        cand: 'firebase-uid-123',
        email: 'different@example.com',
        exp: nowSec + 3600,
        purpose: 'job_alert_unsubscribe',
      });

      mockUserRepository.findAlertWithUser.mockResolvedValue({
        id: 'sub-valid-1',
        userId: 'firebase-uid-123',
        user: { email: 'candidate@seekers.example' },
      });

      await expect(service.unsubscribeAlertByToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects token missing mandatory expiration', async () => {
      const token = createTestToken({
        sub: 'sub-valid-1',
        cand: 'firebase-uid-123',
        email: 'candidate@seekers.example',
        purpose: 'job_alert_unsubscribe',
      });

      await expect(service.unsubscribeAlertByToken(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects expired token', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createTestToken({
        sub: 'sub-valid-1',
        cand: 'firebase-uid-123',
        email: 'candidate@seekers.example',
        exp: nowSec - 3600,
        purpose: 'job_alert_unsubscribe',
      });

      await expect(service.unsubscribeAlertByToken(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects token signed with wrong key', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createTestToken(
        {
          sub: 'sub-valid-1',
          cand: 'firebase-uid-123',
          email: 'candidate@seekers.example',
          exp: nowSec + 3600,
          purpose: 'job_alert_unsubscribe',
        },
        'wrong-secret-key-1234567890',
      );

      await expect(service.unsubscribeAlertByToken(token)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

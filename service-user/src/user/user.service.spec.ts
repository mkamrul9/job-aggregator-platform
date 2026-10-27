import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { PrismaService } from '../prisma.service';
import { of } from 'rxjs';
import { RemoteEligibility } from '@prisma/client';

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
  };

  const mockClientGrpc = {
    getService: jest.fn().mockReturnValue({
      parseResume: jest
        .fn()
        .mockReturnValue(of({ success: true, skills: ['Python', 'FastAPI'] })),
    }),
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
    });
  });
});

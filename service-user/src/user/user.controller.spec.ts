import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn().mockReturnValue([{ name: '[DEFAULT]' }]),
  initializeApp: jest.fn(),
  applicationDefault: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
  }),
}));

import { UserController } from './user.controller';
import { UserService } from './user.service';
import type { AuthenticatedRequest } from '../auth/firebase-auth.guard';
import { PrismaService } from '../prisma.service';

describe('UserController', () => {
  let controller: UserController;

  const mockUserService = {
    syncUser: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    exportUserData: jest.fn(),
    requestAccountDeletion: jest.fn(),
    getAccountStatus: jest.fn(),
    getActiveResume: jest.fn(),
    getRecommendations: jest.fn(),
    submitRecommendationFeedback: jest.fn(),
    undoRecommendationFeedback: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  const createMockRequest = (
    userPayload?: Record<string, unknown>,
  ): AuthenticatedRequest => {
    return {
      headers: {},
      user: userPayload as unknown as AuthenticatedRequest['user'],
    } as unknown as AuthenticatedRequest;
  };

  describe('health check', () => {
    it('should return healthy status', () => {
      const res = controller.getHealth();
      expect(res.status).toBe('healthy');
      expect(res.service).toBe('service-user');
    });
  });

  describe('POST /users/sync', () => {
    it('should call userService.syncUser with verified JWT claims', async () => {
      const req = createMockRequest({
        uid: 'candidate-99',
        email: 'dev@seekers.example',
        email_verified: true,
      });

      mockUserService.syncUser.mockResolvedValue({
        message: 'User synchronized successfully',
        user: { id: 'candidate-99', email: 'dev@seekers.example' },
      });

      const res = await controller.syncUser(req);

      expect(res.user.id).toBe('candidate-99');
      expect(mockUserService.syncUser).toHaveBeenCalledWith({
        id: 'candidate-99',
        email: 'dev@seekers.example',
        emailVerified: true,
      });
    });

    it('should throw BadRequestException if UID or email claim is missing', async () => {
      const req = createMockRequest({ uid: 'no-email-user' });

      await expect(controller.syncUser(req)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('GET /users/profile', () => {
    it('should retrieve profile by authenticated UID', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });
      mockUserService.getProfile.mockResolvedValue({
        id: 'candidate-99',
        name: 'Ayesha Rahman',
      });

      const res = await controller.getProfile(req);

      expect(res.id).toBe('candidate-99');
      expect(mockUserService.getProfile).toHaveBeenCalledWith('candidate-99');
    });
  });

  describe('PUT /users/profile', () => {
    it('should validate and update candidate profile', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });
      mockUserService.updateProfile.mockResolvedValue({
        id: 'candidate-99',
        name: 'Ayesha Rahman',
        skills: ['NestJS', 'PostgreSQL'],
      });

      const res = await controller.updateProfile(req, {
        name: 'Ayesha Rahman',
        skills: ['NestJS', 'PostgreSQL'],
      });

      expect(res.name).toBe('Ayesha Rahman');
      expect(mockUserService.updateProfile).toHaveBeenCalledWith(
        'candidate-99',
        {
          name: 'Ayesha Rahman',
          skills: ['NestJS', 'PostgreSQL'],
        },
      );
    });
  });

  describe('POST /users/account/export', () => {
    it('should request candidate data export by authenticated UID', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });
      mockUserService.exportUserData.mockResolvedValue({
        user_id: 'candidate-99',
        status: 'READY',
      });

      const res = await controller.exportData(req);

      expect(res.user_id).toBe('candidate-99');
      expect(mockUserService.exportUserData).toHaveBeenCalledWith(
        'candidate-99',
      );
    });
  });

  describe('POST /users/account/delete', () => {
    it('should validate confirmation and schedule deletion', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });
      mockUserService.requestAccountDeletion.mockResolvedValue({
        success: true,
        request_id: 'del-123',
        status: 'PENDING',
      });

      const res = await controller.deleteAccount(
        req,
        { confirmation: 'DELETE_MY_ACCOUNT', reason: 'Done with job search' },
        'idempotency-key-xyz',
      );

      expect(res.success).toBe(true);
      expect(mockUserService.requestAccountDeletion).toHaveBeenCalledWith(
        'candidate-99',
        'idempotency-key-xyz',
        'Done with job search',
      );
    });

    it('should throw BadRequestException if confirmation string is not exact', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });

      await expect(
        controller.deleteAccount(req, { confirmation: 'delete' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /users/account-status & /users/account/status', () => {
    it('should return account lifecycle status for authenticated user', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });
      mockUserService.getAccountStatus.mockResolvedValue({
        has_pending_deletion: true,
        pending_deletion: { status: 'PENDING' },
        recent_exports: [{ request_id: 'exp-1' }],
      });

      const res = await controller.getAccountStatus(req);
      expect(res.has_pending_deletion).toBe(true);
      expect(mockUserService.getAccountStatus).toHaveBeenCalledWith(
        'candidate-99',
      );
    });
  });

  describe('GET /users/resume', () => {
    it('should return active resume information for candidate', async () => {
      const req = createMockRequest({ uid: 'candidate-99' });
      mockUserService.getActiveResume.mockResolvedValue({
        has_resume: true,
        document: { id: 'doc-1' },
      });

      const res = await controller.getActiveResume(req);
      expect(res.has_resume).toBe(true);
      expect(mockUserService.getActiveResume).toHaveBeenCalledWith(
        'candidate-99',
      );
    });
  });

  describe('GET /users/admin/test-privileged', () => {
    it('should return admin confirmation for authorized request', () => {
      const req = createMockRequest({ uid: 'admin-super', role: 'ADMIN' });
      const res = controller.testPrivileged(req);

      expect(res.role).toBe('ADMIN');
      expect(res.message).toContain('Authorized Administrator');
    });
  });

  describe('P10 Recommendations & Feedback', () => {
    it('GET /users/recommendations invokes userService.getRecommendations with parsed limit', async () => {
      const req = createMockRequest({ uid: 'cand-p10' });
      mockUserService.getRecommendations.mockResolvedValue({
        items: [],
        total_count: 0,
        algorithm_version: 'v1.0.0-deterministic',
      });

      const res = await controller.getRecommendations(req, '15', 'cursor-abc');
      expect(mockUserService.getRecommendations).toHaveBeenCalledWith(
        'cand-p10',
        { limit: 15, cursor: 'cursor-abc' },
      );
      expect(res.algorithm_version).toBe('v1.0.0-deterministic');
    });

    it('POST /users/recommendations/:jobId/feedback delegates to userService', async () => {
      const req = createMockRequest({ uid: 'cand-p10' });
      mockUserService.submitRecommendationFeedback.mockResolvedValue({
        success: true,
        job_id: 'job-123',
        action: 'DISMISS',
      });

      const res = await controller.submitRecommendationFeedback(
        req,
        'job-123',
        { action: 'DISMISS', reason: 'NOT_INTERESTED' },
      );
      expect(mockUserService.submitRecommendationFeedback).toHaveBeenCalledWith(
        'cand-p10',
        'job-123',
        {
          action: 'DISMISS',
          reason: 'NOT_INTERESTED',
        },
      );
      expect(res.success).toBe(true);
    });

    it('DELETE /users/recommendations/:jobId/feedback delegates to userService', async () => {
      const req = createMockRequest({ uid: 'cand-p10' });
      mockUserService.undoRecommendationFeedback.mockResolvedValue({
        success: true,
        job_id: 'job-123',
      });

      const res = await controller.undoRecommendationFeedback(req, 'job-123');
      expect(mockUserService.undoRecommendationFeedback).toHaveBeenCalledWith(
        'cand-p10',
        'job-123',
      );
      expect(res.success).toBe(true);
    });
  });
});

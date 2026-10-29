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

import { ReportsController } from './reports.controller';
import { UserService } from './user.service';
import type { AuthenticatedRequest } from '../auth/firebase-auth.guard';
import { PrismaService } from '../prisma.service';

describe('ReportsController', () => {
  let controller: ReportsController;

  const mockUserService = {
    submitReport: jest.fn(),
    getReport: jest.fn(),
    listReportsQueue: jest.fn(),
    triageReport: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
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

    controller = module.get<ReportsController>(ReportsController);
  });

  const createMockRequest = (
    userPayload?: Record<string, unknown>,
  ): AuthenticatedRequest => {
    return {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      user: userPayload as unknown as AuthenticatedRequest['user'],
    } as unknown as AuthenticatedRequest;
  };

  it('submits a report anonymously or authenticated', async () => {
    mockUserService.submitReport.mockResolvedValue({
      report_id: 'rep-1',
      reference_num: 'RPT-20261029-XXXX',
      status: 'OPEN',
      message: 'Report received and queued for operator triage.',
      created_at: new Date().toISOString(),
    });

    const req = createMockRequest({ uid: 'user-1' });
    const res = await controller.submitReport(req, {
      report_type: 'BROKEN_LINK',
      description: 'The listing URL leads to 404',
      job_id: 'job-1',
    });

    expect(res.reference_num).toBe('RPT-20261029-XXXX');
    expect(mockUserService.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        report_type: 'BROKEN_LINK',
        description: 'The listing URL leads to 404',
        job_id: 'job-1',
        userId: 'user-1',
      }),
    );
  });

  it('throws BadRequestException when body is missing in submitReport', async () => {
    const req = createMockRequest();
    await expect(
      controller.submitReport(
        req,
        null as unknown as {
          report_type: string;
          description: string;
          job_id?: string;
          contact_email?: string;
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('retrieves a report status', async () => {
    mockUserService.getReport.mockResolvedValue({
      id: 'rep-1',
      reference_num: 'RPT-20261029-XXXX',
      report_type: 'BROKEN_LINK',
      description: 'The listing URL leads to 404',
      status: 'OPEN',
      created_at: new Date().toISOString(),
    });

    const req = createMockRequest({ uid: 'user-1', role: 'CANDIDATE' });
    const res = await controller.getReportStatus(req, 'RPT-20261029-XXXX');

    expect(res.reference_num).toBe('RPT-20261029-XXXX');
    expect(mockUserService.getReport).toHaveBeenCalledWith(
      'RPT-20261029-XXXX',
      'user-1',
      false,
    );
  });

  it('lists support queue for admin', async () => {
    mockUserService.listReportsQueue.mockResolvedValue({
      items: [],
      next_cursor: null,
      total_count: 0,
    });

    const res = await controller.listSupportQueue('OPEN', '20');
    expect(res.items).toEqual([]);
    expect(mockUserService.listReportsQueue).toHaveBeenCalledWith({
      status: 'OPEN',
      limit: 20,
      cursor: undefined,
    });
  });

  it('triages report status for admin', async () => {
    mockUserService.triageReport.mockResolvedValue({
      id: 'rep-1',
      reference_num: 'RPT-20261029-XXXX',
      status: 'RESOLVED',
      operator_notes: 'Fixed listing URL',
      resolved_at: new Date().toISOString(),
    });

    const req = createMockRequest({ uid: 'admin-1', role: 'ADMIN' });
    const res = await controller.triageReport(req, 'rep-1', {
      status: 'RESOLVED',
      operator_notes: 'Fixed listing URL',
    });

    expect(res.status).toBe('RESOLVED');
    expect(mockUserService.triageReport).toHaveBeenCalledWith(
      'rep-1',
      { status: 'RESOLVED', operator_notes: 'Fixed listing URL' },
      'admin-1',
    );
  });
});

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from './user.service';
import {
  FirebaseAuthGuard,
  OptionalFirebaseAuthGuard,
  type AuthenticatedRequest,
} from '../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

function parseSafeLimit(
  limit?: string,
  defaultLimit = 50,
  maxLimit = 100,
): number {
  if (!limit) return defaultLimit;
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      'Query parameter "limit" must be a positive integer.',
    );
  }
  return Math.min(parsed, maxLimit);
}

@Controller()
export class ReportsController {
  constructor(private readonly userService: UserService) {}

  /**
   * POST /reports and /api/v1/reports
   * Public or authenticated submission of broken/expired listing or feedback reports.
   * Uses OptionalFirebaseAuthGuard: verified bearer token populates user identity;
   * unauthenticated request permitted under public admission policy.
   * Generates a durable opaque receipt reference (RPT-YYYYMMDD-XXXX).
   */
  @Post(['reports', 'api/v1/reports'])
  @HttpCode(201)
  @UseGuards(OptionalFirebaseAuthGuard)
  async submitReport(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      report_type: string;
      description: string;
      job_id?: string;
      contact_email?: string;
    },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    const userId = req.user?.uid;
    const ip = req.ip || req.socket.remoteAddress || undefined;

    return this.userService.submitReport({
      report_type: body.report_type,
      description: body.description,
      job_id: body.job_id,
      contact_email: body.contact_email,
      userId,
      ip,
    });
  }

  /**
   * GET /reports/:referenceOrId
   * Retrieves report status using receipt reference or UUID.
   * Restricted to the authenticated submitter or administrator.
   */
  @Get('reports/:referenceOrId')
  @UseGuards(FirebaseAuthGuard)
  async getReportStatus(
    @Req() request: AuthenticatedRequest,
    @Param('referenceOrId') referenceOrId: string,
  ) {
    const uid = request.user?.uid;
    const isAdmin = request.user?.role === 'ADMIN';

    return this.userService.getReport(referenceOrId, uid, isAdmin);
  }

  /**
   * GET /admin/reports
   * Operator support queue for triage and incident tracking.
   * Server-enforced role boundary: ADMIN only.
   */
  @Get('admin/reports')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listSupportQueue(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = parseSafeLimit(limit, 50);
    return this.userService.listReportsQueue({
      status,
      limit: parsedLimit,
      cursor,
    });
  }

  /**
   * PATCH /admin/reports/:id
   * Updates report status and operator triage notes.
   * Server-enforced role boundary: ADMIN only.
   */
  @Patch('admin/reports/:id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async triageReport(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { status: string; operator_notes?: string },
  ) {
    const adminUid = request.user?.uid;
    return this.userService.triageReport(id, body, adminUid);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  Res,
  Body,
  Headers,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  FirebaseAuthGuard,
  type AuthenticatedRequest,
} from '../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserService } from './user.service';
import { validateUpdateProfileInput } from './dto/update-profile.dto';
import { validateDeleteAccountInput } from './dto/delete-account.dto';
import type {
  JobSnapshotInput,
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
  TrackApplicationDto,
  UpdateApplicationDto,
  CreateAlertDto,
} from './dto/workspace.dto';

function parseSafeLimit(
  limit?: string,
  defaultLimit = 20,
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

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'service-user',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /users/sync
   * Idempotently synchronizes the authenticated Firebase identity with PostgreSQL.
   * Derives UID and email solely from the verified JWT.
   */
  @Post('sync')
  @UseGuards(FirebaseAuthGuard)
  async syncUser(@Req() request: AuthenticatedRequest) {
    const firebaseUser = request.user;
    if (!firebaseUser?.uid || !firebaseUser?.email) {
      throw new BadRequestException({
        code: 'MISSING_IDENTITY_CLAIMS',
        message:
          'Verified Firebase UID and email claims are required for sync.',
      });
    }

    return this.userService.syncUser({
      id: firebaseUser.uid,
      email: firebaseUser.email,
      emailVerified: firebaseUser.email_verified,
    });
  }

  /**
   * GET /users/profile
   * Returns the candidate profile for the authenticated identity.
   */
  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'MISSING_IDENTITY',
        message: 'Authenticated user ID is missing from security context.',
      });
    }

    return this.userService.getProfile(uid);
  }

  /**
   * PUT /users/profile
   * Updates candidate profile with strict server-side validation.
   */
  @Put('profile')
  @UseGuards(FirebaseAuthGuard)
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'MISSING_IDENTITY',
        message: 'Authenticated user ID is missing from security context.',
      });
    }

    const validatedDto = validateUpdateProfileInput(body);
    return this.userService.updateProfile(uid, validatedDto);
  }

  /**
   * POST /users/account/export and /users/export
   * Initiates an export of the authenticated candidate's persistent profile data.
   */
  @Post(['account/export', 'export'])
  @UseGuards(FirebaseAuthGuard)
  async exportData(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'MISSING_IDENTITY',
        message: 'Authenticated user ID is missing from security context.',
      });
    }

    return this.userService.exportUserData(uid);
  }

  /**
   * POST /users/account/delete and /users/delete
   * Initiates a scheduled deletion request with a 30-day grace period.
   */
  @Post(['account/delete', 'delete'])
  @UseGuards(FirebaseAuthGuard)
  async deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'MISSING_IDENTITY',
        message: 'Authenticated user ID is missing from security context.',
      });
    }

    const validated = validateDeleteAccountInput(body);
    const effectiveIdempotencyKey = idempotencyKeyHeader;

    return this.userService.requestAccountDeletion(
      uid,
      effectiveIdempotencyKey,
      validated.reason,
    );
  }

  /**
   * GET /users/account-status or /users/account/status
   * Returns current account lifecycle status, pending deletions, and exports.
   */
  @Get(['account-status', 'account/status'])
  @UseGuards(FirebaseAuthGuard)
  async getAccountStatus(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'MISSING_IDENTITY',
        message: 'Authenticated user ID is missing from security context.',
      });
    }

    return this.userService.getAccountStatus(uid);
  }

  /**
   * GET /users/admin/test-privileged
   * Server-enforced role verification for administrative operations.
   * Non-admin identities receive 403 Forbidden.
   */
  @Get('admin/test-privileged')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  testPrivileged(@Req() request: AuthenticatedRequest) {
    return {
      message: 'Access granted: Authorized Administrator.',
      user_id: request.user?.uid,
      role: 'ADMIN',
    };
  }

  // ─── P08 OWNED RESUME CONTRACTED ENDPOINTS ─────────────────────────────────

  /**
   * POST /users/resume/upload and legacy POST /users/upload-resume
   * Multipart PDF resume upload endpoint with 10MB bounds and 202 Accepted lifecycle.
   * Seamlessly accepts both OpenAPI 'file' and legacy 'resume' multipart field names.
   */
  @Post(['resume/upload', 'upload-resume'])
  @HttpCode(202)
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'resume', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
        fileFilter: (_req, file, cb) => {
          if (
            file.mimetype !== 'application/pdf' &&
            !file.originalname.toLowerCase().endsWith('.pdf')
          ) {
            return cb(
              new BadRequestException('Only PDF files are supported'),
              false,
            );
          }
          cb(null, true);
        },
      },
    ),
  )
  async uploadResume(
    @Req() request: AuthenticatedRequest,
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; resume?: Express.Multer.File[] },
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    const uploaded = files?.file?.[0] || files?.resume?.[0];
    if (!uploaded) {
      throw new BadRequestException('No PDF file provided in upload request');
    }

    return this.userService.uploadResume(uid, uploaded);
  }

  /**
   * GET /users/resume/status/:parseId
   * Polling endpoint to check asynchronous extraction status and retrieve extracted skills.
   */
  @Get('resume/status/:parseId')
  @UseGuards(FirebaseAuthGuard)
  async getResumeParseStatus(
    @Req() request: AuthenticatedRequest,
    @Param('parseId') parseId: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    return this.userService.getParseStatus(uid, parseId);
  }

  /**
   * POST /users/resume/review
   * Applies candidate-reviewed skills to persistent candidate profile without clobbering unselected skills.
   */
  @Post('resume/review')
  @HttpCode(200)
  @UseGuards(FirebaseAuthGuard)
  async reviewResumeSkills(
    @Req() request: AuthenticatedRequest,
    @Body() body: { parse_id: string; selected_skills: string[] },
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    if (!body?.parse_id || !Array.isArray(body?.selected_skills)) {
      throw new BadRequestException(
        'parse_id and selected_skills array are required in review request body.',
      );
    }

    return this.userService.reviewParseSkills(
      uid,
      body.parse_id,
      body.selected_skills,
    );
  }

  /**
   * GET /users/resume
   * Retrieves active resume document and latest parse info for candidate UI hydration.
   */
  @Get('resume')
  @UseGuards(FirebaseAuthGuard)
  async getActiveResume(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    return this.userService.getActiveResume(uid);
  }

  /**
   * DELETE /users/resume
   * Removes active resume document and deletes object from private storage.
   */
  @Delete('resume')
  @UseGuards(FirebaseAuthGuard)
  async deleteResume(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    return this.userService.deleteResume(uid);
  }

  /**
   * GET /users/resume/download
   * Secure candidate download of active uploaded resume document.
   */
  @Get('resume/download')
  @UseGuards(FirebaseAuthGuard)
  async downloadResume(
    @Req() request: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    const { buffer, fileName, mimeType } =
      await this.userService.downloadResume(uid);

    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.send(buffer);
  }

  // ─── P09 SAVED JOBS ────────────────────────────────────────────────────────

  /**
   * GET /users/saved-jobs
   * Lists candidate saved jobs with pagination and live catalog availability.
   */
  @Get('saved-jobs')
  @UseGuards(FirebaseAuthGuard)
  async getSavedJobs(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    const parsedLimit = parseSafeLimit(limit, 20);
    return this.userService.getSavedJobs(uid, {
      limit: parsedLimit,
      cursor,
    });
  }

  /**
   * POST /users/saved-jobs/:jobId
   * Authenticated save of a canonical job listing.
   */
  @Post('saved-jobs/:jobId')
  @HttpCode(201)
  @UseGuards(FirebaseAuthGuard)
  async saveJob(
    @Req() request: AuthenticatedRequest,
    @Param('jobId') jobId: string,
    @Body() body?: JobSnapshotInput,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.saveJob(uid, jobId, body);
  }

  /**
   * DELETE /users/saved-jobs/:jobId
   * Authenticated unsave of a job listing.
   */
  @Delete('saved-jobs/:jobId')
  @HttpCode(204)
  @UseGuards(FirebaseAuthGuard)
  async unsaveJob(
    @Req() request: AuthenticatedRequest,
    @Param('jobId') jobId: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    await this.userService.unsaveJob(uid, jobId);
  }

  // ─── P09 SAVED SEARCHES ──────────────────────────────────────────────────

  /**
   * GET /users/saved-searches
   * Lists candidate saved searches.
   */
  @Get('saved-searches')
  @UseGuards(FirebaseAuthGuard)
  async getSavedSearches(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    const parsedLimit = parseSafeLimit(limit, 20);
    return this.userService.getSavedSearches(uid, {
      limit: parsedLimit,
      cursor,
    });
  }

  /**
   * POST /users/saved-searches
   * Creates a saved search with query and filter criteria.
   */
  @Post('saved-searches')
  @HttpCode(201)
  @UseGuards(FirebaseAuthGuard)
  async createSavedSearch(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateSavedSearchDto,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.createSavedSearch(uid, body);
  }

  /**
   * PUT /users/saved-searches/:id
   * Updates an existing saved search.
   */
  @Put('saved-searches/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateSavedSearch(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateSavedSearchDto,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.updateSavedSearch(uid, id, body);
  }

  /**
   * DELETE /users/saved-searches/:id
   * Removes a saved search.
   */
  @Delete('saved-searches/:id')
  @HttpCode(204)
  @UseGuards(FirebaseAuthGuard)
  async deleteSavedSearch(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    await this.userService.deleteSavedSearch(uid, id);
  }

  // ─── P09 TRACKED APPLICATIONS ────────────────────────────────────────────

  /**
   * GET /users/applications
   * Lists candidate tracked applications with optional status filter.
   */
  @Get('applications')
  @UseGuards(FirebaseAuthGuard)
  async getApplications(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    const parsedLimit = parseSafeLimit(limit, 50);
    return this.userService.getApplications(uid, {
      status,
      limit: parsedLimit,
      cursor,
    });
  }

  /**
   * POST /users/applications
   * Tracks an application with candidate statement of status, notes, and snapshots.
   */
  @Post('applications')
  @HttpCode(201)
  @UseGuards(FirebaseAuthGuard)
  async trackApplication(
    @Req() request: AuthenticatedRequest,
    @Body() body: TrackApplicationDto,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.trackApplication(uid, body);
  }

  /**
   * GET /users/applications/:id
   * Retrieves single tracked application detail.
   */
  @Get('applications/:id')
  @UseGuards(FirebaseAuthGuard)
  async getApplicationById(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.getApplicationById(uid, id);
  }

  /**
   * PATCH /users/applications/:id
   * Updates application status or notes with optimistic concurrency check.
   */
  @Patch('applications/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateApplication(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateApplicationDto,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.updateApplication(uid, id, body);
  }

  /**
   * DELETE /users/applications/:id
   * Removes a tracked application.
   */
  @Delete('applications/:id')
  @HttpCode(204)
  @UseGuards(FirebaseAuthGuard)
  async deleteApplication(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    await this.userService.deleteApplication(uid, id);
  }

  // ─── P09 ALERTS ──────────────────────────────────────────────────────────

  /**
   * GET /users/alerts
   * Lists candidate job alert subscriptions.
   */
  @Get('alerts')
  @UseGuards(FirebaseAuthGuard)
  async listAlerts(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.listAlerts(uid);
  }

  /**
   * POST /users/alerts
   * Creates a candidate job alert subscription.
   */
  @Post('alerts')
  @HttpCode(201)
  @UseGuards(FirebaseAuthGuard)
  async createAlert(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateAlertDto,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.createAlert(uid, body);
  }

  /**
   * DELETE /users/alerts/:id
   * Removes a candidate job alert subscription.
   */
  @Delete('alerts/:id')
  @HttpCode(204)
  @UseGuards(FirebaseAuthGuard)
  async deleteAlert(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    await this.userService.deleteAlert(uid, id);
  }

  /**
   * PATCH /users/alerts/:id/toggle
   * Toggles alert active/paused state.
   */
  @Patch('alerts/:id/toggle')
  @UseGuards(FirebaseAuthGuard)
  async toggleAlert(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }
    return this.userService.toggleAlert(uid, id);
  }
}

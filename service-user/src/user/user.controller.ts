import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
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
   * GET /users/account-status
   * Returns current account lifecycle status, pending deletions, and exports.
   */
  @Get('account-status')
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
}

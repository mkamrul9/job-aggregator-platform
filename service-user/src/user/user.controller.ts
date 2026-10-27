import {
  Controller,
  Get,
  Post,
  Put,
  Req,
  Body,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import {
  FirebaseAuthGuard,
  type AuthenticatedRequest,
} from '../auth/firebase-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserService } from './user.service';
import { validateUpdateProfileInput } from './dto/update-profile.dto';
import { validateDeleteAccountInput } from './dto/delete-account.dto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {
  // Directory already exists or read-only volume
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
   * Returns current authenticated candidate profile.
   */
  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'UNAUTHENTICATED',
        message: 'Valid authentication token required.',
      });
    }
    return this.userService.getProfile(uid);
  }

  /**
   * PUT /users/profile
   * Updates candidate profile attributes, skills, and preferences.
   * Enforces server ownership strictly by authenticated UID.
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
        code: 'UNAUTHENTICATED',
        message: 'Valid authentication token required.',
      });
    }

    const validatedInput = validateUpdateProfileInput(body);
    return this.userService.updateProfile(uid, validatedInput);
  }

  /**
   * POST /users/account/export
   * Initiates/returns machine-readable candidate data archive.
   */
  @Post('account/export')
  @UseGuards(FirebaseAuthGuard)
  async exportData(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'UNAUTHENTICATED',
        message: 'Valid authentication token required.',
      });
    }
    return this.userService.exportUserData(uid);
  }

  /**
   * POST /users/account/delete
   * Initiates account erasure workflow with 30-day grace period.
   * Supports Idempotency-Key header for duplicate protection.
   */
  @Post('account/delete')
  @UseGuards(FirebaseAuthGuard)
  async deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'UNAUTHENTICATED',
        message: 'Valid authentication token required.',
      });
    }

    const validated = validateDeleteAccountInput(body);
    return this.userService.requestAccountDeletion(
      uid,
      idempotencyKey,
      validated.reason,
    );
  }

  /**
   * GET /users/account/status
   * Returns current account lifecycle status (pending deletion, recent exports).
   */
  @Get('account/status')
  @UseGuards(FirebaseAuthGuard)
  async getAccountStatus(@Req() request: AuthenticatedRequest) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException({
        code: 'UNAUTHENTICATED',
        message: 'Valid authentication token required.',
      });
    }
    return this.userService.getAccountStatus(uid);
  }

  /**
   * GET /users/admin/test-privileged
   * Privileged endpoint used for verifying server-enforced role boundaries.
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

  /**
   * POST /users/upload-resume
   * Multipart PDF resume upload endpoint.
   */
  @Post('upload-resume')
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(
    FileInterceptor('resume', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(
            new BadRequestException('Only PDF files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadResume(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const uid = request.user?.uid;
    if (!uid) {
      throw new BadRequestException('User identification missing from token');
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const updatedProfile = await this.userService.processUserResume(
      uid,
      file.path,
    );

    return {
      message: 'Resume uploaded and processed',
      profile: updatedProfile,
    };
  }
}

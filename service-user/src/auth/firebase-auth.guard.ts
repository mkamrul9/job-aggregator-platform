import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getFirebaseAuth } from './firebase-admin.provider';

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken & {
    role?: string;
  };
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (
      !authHeader ||
      typeof authHeader !== 'string' ||
      !authHeader.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException({
        code: 'MISSING_AUTHORIZATION_TOKEN',
        message: 'Authorization header with Bearer token is required.',
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException({
        code: 'EMPTY_BEARER_TOKEN',
        message: 'Bearer token value cannot be empty.',
      });
    }

    try {
      const auth = getFirebaseAuth();
      // Verify token with revocation check
      const decodedToken = await auth.verifyIdToken(token, true);

      // Attach decoded user token payload to request object
      request.user = decodedToken;
      return true;
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      const code = firebaseError.code || 'INVALID_TOKEN';

      if (code === 'auth/id-token-expired') {
        throw new UnauthorizedException({
          code: 'TOKEN_EXPIRED',
          message:
            'Authentication session expired. Please refresh your session.',
        });
      }

      if (code === 'auth/id-token-revoked') {
        throw new UnauthorizedException({
          code: 'TOKEN_REVOKED',
          message:
            'Authentication token has been revoked. Please sign in again.',
        });
      }

      if (code === 'auth/user-disabled') {
        throw new UnauthorizedException({
          code: 'ACCOUNT_DISABLED',
          message: 'Candidate account has been disabled.',
        });
      }

      this.logger.debug(
        `Token verification failed: ${firebaseError.message || code}`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_AUTHENTICATION_TOKEN',
        message: 'Invalid or forged authentication token.',
      });
    }
  }
}

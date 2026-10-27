import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn().mockReturnValue([{ name: '[DEFAULT]' }]),
  initializeApp: jest.fn(),
  applicationDefault: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn().mockReturnValue({
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
  }),
}));

import { FirebaseAuthGuard } from './firebase-auth.guard';

describe('FirebaseAuthGuard', () => {
  let guard: FirebaseAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new FirebaseAuthGuard();
  });

  const createMockContext = (authHeader?: string): ExecutionContext => {
    const request = {
      headers: {
        authorization: authHeader,
      },
      user: undefined,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should throw UnauthorizedException if Authorization header is missing', async () => {
    const context = createMockContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if Authorization header is not Bearer', async () => {
    const context = createMockContext('Basic token123');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should verify valid Bearer token and attach decoded user to request', async () => {
    const decodedToken = {
      uid: 'firebase-user-999',
      email: 'verified@seekers.example',
      email_verified: true,
    };
    mockVerifyIdToken.mockResolvedValue(decodedToken);

    const context = createMockContext('Bearer valid-token-abc');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token-abc', true);
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    expect(request.user).toEqual(decodedToken);
  });

  it('should throw UnauthorizedException with TOKEN_EXPIRED if token has expired', async () => {
    mockVerifyIdToken.mockRejectedValue({
      code: 'auth/id-token-expired',
      message: 'Firebase token expired',
    });

    const context = createMockContext('Bearer expired-token');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException with TOKEN_REVOKED if token has been revoked', async () => {
    mockVerifyIdToken.mockRejectedValue({
      code: 'auth/id-token-revoked',
      message: 'Firebase token revoked',
    });

    const context = createMockContext('Bearer revoked-token');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../prisma.service';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    guard = new RolesGuard(reflector, prisma as unknown as PrismaService);
  });

  const createMockContext = (
    user?: Record<string, unknown>,
  ): ExecutionContext => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access if no roles are required on route', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ uid: 'candidate-1' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow access if user has ADMIN custom claim in Firebase token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    const context = createMockContext({ uid: 'admin-1', admin: true });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should allow access if user has ADMIN role in PostgreSQL', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    const context = createMockContext({ uid: 'admin-1' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      select: { role: true },
    });
  });

  it('should throw ForbiddenException if candidate attempts to access ADMIN endpoint', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    prisma.user.findUnique.mockResolvedValue({
      id: 'candidate-1',
      role: 'CANDIDATE',
    });

    const context = createMockContext({ uid: 'candidate-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException if user object is missing on protected route', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

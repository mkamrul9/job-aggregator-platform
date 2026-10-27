import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './firebase-auth.guard';
import { PrismaService } from '../prisma.service';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.uid) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_UNAUTHENTICATED',
        message: 'Authentication required for privileged operation.',
      });
    }

    // Role check hierarchy:
    // 1. Check custom claim in verified Firebase token: user.admin === true or user.role === 'ADMIN'
    // 2. Query PostgreSQL User record to verify authoritative role
    let effectiveRole = 'CANDIDATE';
    if (user.admin === true || user.role === 'ADMIN') {
      effectiveRole = 'ADMIN';
    } else {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.uid },
        select: { role: true },
      });
      if (dbUser?.role === 'ADMIN') {
        effectiveRole = 'ADMIN';
      }
    }

    const hasRole = requiredRoles.includes(effectiveRole);
    if (!hasRole) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE_PERMISSIONS',
        message: `Action requires [${requiredRoles.join(', ')}] role. Current role is ${effectiveRole}.`,
      });
    }

    return true;
  }
}

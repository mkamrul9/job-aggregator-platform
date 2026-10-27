import { Injectable } from '@nestjs/common';
import { User, Profile } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(id: string, email: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, email, passwordHash: 'MANAGED_BY_FIREBASE' },
    });
  }

  async updateSkills(userId: string, skills: string[]): Promise<Profile> {
    return this.prisma.profile.upsert({
      where: { userId },
      update: { extractedSkills: skills },
      create: { userId, extractedSkills: skills },
    });
  }
}

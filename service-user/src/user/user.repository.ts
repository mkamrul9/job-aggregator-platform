import { Injectable } from '@nestjs/common';
import { PrismaClient, User, Profile } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class UserRepository {
  async upsertUser(id: string, email: string): Promise<User> {
    return prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, email, passwordHash: 'MANAGED_BY_FIREBASE' },
    });
  }

  async updateSkills(userId: string, skills: string[]): Promise<Profile> {
    return prisma.profile.upsert({
      where: { userId },
      update: { extractedSkills: skills },
      create: { userId, extractedSkills: skills }
    });
  }
}

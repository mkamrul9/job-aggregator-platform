import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class UserService {
  async findOrCreateUser(data: { id: string; email: string }) {
    // Upsert ensures we don't crash if the user already exists
    return prisma.user.upsert({
      where: { id: data.id },
      update: {}, // Do nothing if they exist
      create: {
        id: data.id,
        email: data.email,
        passwordHash: 'MANAGED_BY_FIREBASE', 
      },
    });
  }
}

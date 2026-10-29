import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { RolesGuard } from '../auth/roles.guard';
import { existsSync } from 'fs';
import { join } from 'path';

const localProtoPath = join(process.cwd(), 'proto/resume.proto');
const sharedProtoPath = join(process.cwd(), '../shared-protos/resume.proto');
const resolvedProtoPath =
  process.env.RESUME_PROTO_PATH ||
  (existsSync(localProtoPath)
    ? localProtoPath
    : existsSync(sharedProtoPath)
      ? sharedProtoPath
      : localProtoPath);

const hasProto = existsSync(resolvedProtoPath);

@Module({
  imports: hasProto
    ? [
        ClientsModule.register([
          {
            name: 'RESUME_PACKAGE',
            transport: Transport.GRPC,
            options: {
              package: 'resume',
              protoPath: resolvedProtoPath,
              url: process.env.RESUME_GRPC_URL || 'localhost:50051',
              channelOptions: {
                'grpc.max_receive_message_length': 16 * 1024 * 1024,
                'grpc.max_send_message_length': 16 * 1024 * 1024,
              },
            },
          },
        ]),
      ]
    : [],
  controllers: [UserController],
  providers: [
    UserService,
    UserRepository,
    PrismaService,
    StorageService,
    RolesGuard,
  ],
  exports: [UserService, UserRepository, StorageService, RolesGuard],
})
export class UserModule {}

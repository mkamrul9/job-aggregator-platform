import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { join } from 'path';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'RESUME_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'resume',
          protoPath: join(process.cwd(), '../shared-protos/resume.proto'),
          url: 'localhost:50051',
        },
      },
    ]),
  ],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService], // Export if other modules need user lookup
})
export class UserModule {}

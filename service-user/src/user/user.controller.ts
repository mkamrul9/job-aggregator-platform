import { Controller, Post, Req, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserService } from './user.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // The @UseGuards decorator protects this route. 
  // It will only execute if the Firebase token is valid.
  @Post('sync')
  @UseGuards(FirebaseAuthGuard)
  async syncUser(@Req() request: any) {
    const firebaseUser = request.user;

    // Call the service to create or find the user in Postgres
    const user = await this.userService.findOrCreateUser({
      id: firebaseUser.uid, // We use the Firebase UID as our Postgres Primary Key
      email: firebaseUser.email,
    });

    return { message: 'User synced successfully', user };
  }

  @Post('upload-resume')
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('resume', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype !== 'application/pdf') {
        return cb(new BadRequestException('Only PDF files are allowed'), false);
      }
      cb(null, true);
    }
  }))
  async uploadResume(@Req() request: any, @UploadedFile() file: Express.Multer.File) {
    const firebaseUser = request.user;
    
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Call the service to process the resume via gRPC
    const updatedUser = await this.userService.processUserResume(firebaseUser.uid, file.path);
    
    return { message: 'Resume uploaded and parsed successfully', user: updatedUser };
  }
}

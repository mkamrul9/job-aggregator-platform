import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserService } from './user.service';

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
}

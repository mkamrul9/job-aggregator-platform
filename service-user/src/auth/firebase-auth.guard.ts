import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Make sure Firebase is initialized before verifying tokens
// If no app is initialized, initialize one here with default credentials (mocked for now since we don't have the key).
if (!getApps().length) {
  try {
    initializeApp({
      credential: applicationDefault()
    });
  } catch (err) {
    console.warn("Firebase app could not be initialized with default credentials. Verification might fail.");
  }
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      // Verify the JWT with Firebase
      const decodedToken = await getAuth().verifyIdToken(token);
      
      // Attach the decoded user payload to the request object
      // so our controllers can access it (e.g., request.user.uid)
      request.user = decodedToken;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }
}

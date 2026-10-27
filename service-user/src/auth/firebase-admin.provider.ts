import { Logger } from '@nestjs/common';
import {
  getApps,
  initializeApp,
  applicationDefault,
  App,
} from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

const logger = new Logger('FirebaseAdmin');

let firebaseApp: App;

export function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'seekers-dev';
  const isProduction = process.env.NODE_ENV === 'production';

  // Safety check: Never permit emulator in production environment
  if (isProduction && emulatorHost) {
    throw new Error(
      'FATAL: FIREBASE_AUTH_EMULATOR_HOST is configured in production environment. Refusing to initialize insecure configuration.',
    );
  }

  if (emulatorHost) {
    logger.log(
      `Connecting to Firebase Auth Emulator at ${emulatorHost} with project '${projectId}'`,
    );
    // Setting environment variable ensures firebase-admin routes token verification to the emulator
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = emulatorHost;
    process.env['GCLOUD_PROJECT'] = projectId;

    firebaseApp = initializeApp({
      projectId,
    });
  } else {
    logger.log(
      'Initializing Firebase Admin with application default credentials',
    );
    try {
      firebaseApp = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `Firebase initialization warning: ${msg}. Fallback configured for local test mode.`,
      );
      firebaseApp = initializeApp({ projectId });
    }
  }

  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  if (!getApps().length) {
    initializeFirebaseAdmin();
  }
  return getAuth();
}

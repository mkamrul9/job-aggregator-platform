import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';

interface FirebaseStatus {
  isConfigured: boolean;
  isEmulator: boolean;
  projectId: string;
  emulatorHost?: string;
}

const isProduction = process.env.NODE_ENV === 'production';
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'seekers-dev';
const emulatorHost =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ||
  (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ? '127.0.0.1:9099' : undefined);

// Validate environment security: Never permit emulator in production builds
if (isProduction && emulatorHost) {
  throw new Error(
    'FATAL: NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is set in production environment. Refusing to run insecure client configuration.',
  );
}

const isConfigured = Boolean(apiKey && apiKey !== 'replace-with-your-public-web-api-key');
const isEmulator = Boolean(emulatorHost);

const firebaseConfig = {
  apiKey: apiKey || (isEmulator ? 'fake-api-key' : 'mock_key'),
  authDomain: authDomain || `${projectId}.firebaseapp.com`,
  projectId,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);

// Connect Auth Emulator explicitly when running in local emulator mode
if (isEmulator && typeof window !== 'undefined') {
  // Prevent duplicate connection during Next.js client component re-renders
  const emulatorKey = '_seekers_auth_emulator_connected';
  if (!(window as unknown as Record<string, boolean>)[emulatorKey]) {
    try {
      const url = `http://${emulatorHost}`;
      connectAuthEmulator(auth, url, { disableWarnings: true });
      (window as unknown as Record<string, boolean>)[emulatorKey] = true;
      console.info(`[Firebase Client] Connected to Auth Emulator at ${url} (Project: ${projectId})`);
    } catch {
      // Already connected in hot reload
    }
  }
}

export const firebaseStatus: FirebaseStatus = {
  isConfigured,
  isEmulator,
  projectId,
  emulatorHost,
};

export { auth };

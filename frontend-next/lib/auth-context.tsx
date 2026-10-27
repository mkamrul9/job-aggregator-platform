'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  User as FirebaseUser,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import { auth, firebaseStatus } from './firebase';
import { INITIAL_USER_PROFILE, UserProfile } from './mock-data';

export type AuthStatus =
  | 'STARTUP'
  | 'SIGNED_OUT'
  | 'SYNCING'
  | 'READY'
  | 'SYNC_ERROR'
  | 'DEMO_MODE';

export interface DataExportResponse {
  user_id: string;
  exported_at: string;
  request_id: string;
  status: string;
  profile: UserProfile;
  applications: unknown[];
  saved_jobs: unknown[];
  alerts: unknown[];
}

export interface DeletionRequestResponse {
  success: boolean;
  message: string;
  request_id: string;
  status: string;
  scheduled_for: string;
  requested_at: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: FirebaseUser | null;
  profile: UserProfile | null;
  token: string | null;
  error: string | null;
  isDemo: boolean;
  isEmulator: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  exportAccountData: () => Promise<DataExportResponse>;
  requestAccountDeletion: (reason?: string) => Promise<DeletionRequestResponse>;
  retrySync: () => Promise<void>;
  activateDemoMode: () => void;
  exitDemoMode: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Helper to fetch user-service routes through API Gateway (/api/v1/users) or Next.js rewrites
async function fetchUserEndpoint(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const baseUrl =
    typeof window !== 'undefined'
      ? ''
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const gatewayUrl = `${baseUrl}/api/v1/users${path}`;

  try {
    const res = await fetch(gatewayUrl, init);
    if (res.status !== 404) {
      return res;
    }
  } catch {
    // Network error on relative URL, proceed to direct fallback
  }

  // Direct service fallback if gateway and rewrites are bypassed in custom local dev
  const directBase =
    process.env.NEXT_PUBLIC_USER_SERVICE_URL || 'http://localhost:3000';
  return fetch(`${directBase}/users${path}`, init);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('STARTUP');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState<boolean>(false);

  // Perform backend user synchronization with PostgreSQL
  const syncWithBackend = useCallback(async (currentUser: FirebaseUser) => {
    setStatus('SYNCING');
    setError(null);

    try {
      const idToken = await currentUser.getIdToken(false);
      setToken(idToken);

      const syncRes = await fetchUserEndpoint('/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!syncRes.ok) {
        const errJson = await syncRes.json().catch(() => ({}));
        throw new Error(
          errJson.message || `Database synchronization failed with HTTP ${syncRes.status}`,
        );
      }

      // Fetch authentic persisted profile
      const profileRes = await fetchUserEndpoint('/profile', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!profileRes.ok) {
        throw new Error(`Profile retrieval failed with HTTP ${profileRes.status}`);
      }

      const profileData: UserProfile = await profileRes.json();
      setProfile(profileData);
      setStatus('READY');
      setIsDemo(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Auth Sync Error]', msg);
      setError(`Account authenticated, but PostgreSQL sync failed: ${msg}. You can retry without re-authenticating.`);
      setStatus('SYNC_ERROR');
      // Do NOT declare account readiness on sync error!
    }
  }, []);

  // Subscribe to Firebase token & session lifecycle
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await syncWithBackend(firebaseUser);
      } else {
        setUser(null);
        setToken(null);
        // Only set SIGNED_OUT if not in explicit DEMO_MODE
        setStatus((prev) => (prev === 'DEMO_MODE' ? 'DEMO_MODE' : 'SIGNED_OUT'));
        if (status !== 'DEMO_MODE') {
          setProfile(null);
        }
      }
    });

    return () => unsubscribe();
  }, [syncWithBackend, status]);

  const signIn = async (email: string, pass: string) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      setUser(cred.user);
      await syncWithBackend(cred.user);
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      let humanMsg = fbErr.message || 'Authentication failed. Please verify credentials.';
      if (fbErr.code === 'auth/invalid-credential' || fbErr.code === 'auth/wrong-password') {
        humanMsg = 'Invalid email or password. Please verify your credentials.';
      } else if (fbErr.code === 'auth/user-not-found') {
        humanMsg = 'No candidate account registered with this email address.';
      } else if (fbErr.code === 'auth/too-many-requests') {
        humanMsg = 'Too many failed login attempts. Access temporarily locked; please reset password or retry later.';
      }
      setError(humanMsg);
      throw new Error(humanMsg);
    }
  };

  const signUp = async (email: string, pass: string, name: string) => {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name && cred.user) {
        await updateFirebaseProfile(cred.user, { displayName: name });
      }
      setUser(cred.user);
      await syncWithBackend(cred.user);
      // Automatically dispatch email verification request
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Non-fatal if verification email fails in test emulator
      }
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      let humanMsg = fbErr.message || 'Registration failed. Please check form inputs.';
      if (fbErr.code === 'auth/email-already-in-use') {
        humanMsg = 'An account is already registered with this email address. Please sign in instead.';
      } else if (fbErr.code === 'auth/weak-password') {
        humanMsg = 'Password is too weak. Please use at least 8 characters with numbers and symbols.';
      }
      setError(humanMsg);
      throw new Error(humanMsg);
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      await firebaseSignOut(auth);
    } finally {
      setUser(null);
      setProfile(null);
      setToken(null);
      setIsDemo(false);
      setStatus('SIGNED_OUT');
    }
  };

  const sendVerificationEmailAction = async () => {
    if (!user) throw new Error('Must be signed in to request verification.');
    await sendEmailVerification(user);
  };

  const sendPasswordResetAction = async (email: string) => {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid candidate email address.');
    }
    // Prevent account enumeration by returning honest informational guidance
    await sendPasswordResetEmail(auth, email);
  };

  const updateProfileAction = async (updatedFields: Partial<UserProfile>) => {
    if (isDemo || status === 'DEMO_MODE') {
      // In demo mode, mutate synthetic profile locally
      setProfile((prev) => (prev ? { ...prev, ...updatedFields } : null));
      return;
    }

    if (!token || !user) {
      throw new Error('Candidate must be authenticated to persist profile modifications.');
    }

    const res = await fetchUserEndpoint('/profile', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedFields),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Profile update failed with HTTP ${res.status}`);
    }

    const updatedProfile: UserProfile = await res.json();
    setProfile(updatedProfile);
  };

  const exportAccountDataAction = async (): Promise<DataExportResponse> => {
    if (!token || !user) {
      throw new Error('Authentication required for account data export.');
    }

    const res = await fetchUserEndpoint('/account/export', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Export request failed with HTTP ${res.status}`);
    }

    return res.json();
  };

  const requestAccountDeletionAction = async (reason?: string): Promise<DeletionRequestResponse> => {
    if (!token || !user) {
      throw new Error('Authentication required for account deletion.');
    }

    const idempotencyKey = `del_${user.uid}_${Date.now()}`;
    const res = await fetchUserEndpoint('/account/delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        confirmation: 'DELETE_MY_ACCOUNT',
        reason,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Account deletion request failed with HTTP ${res.status}`);
    }

    return res.json();
  };

  const retrySyncAction = async () => {
    if (user) {
      await syncWithBackend(user);
    }
  };

  const activateDemoModeAction = () => {
    setIsDemo(true);
    setStatus('DEMO_MODE');
    setProfile(INITIAL_USER_PROFILE);
    setError(null);
  };

  const exitDemoModeAction = () => {
    setIsDemo(false);
    setStatus('SIGNED_OUT');
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        profile,
        token,
        error,
        isDemo,
        isEmulator: firebaseStatus.isEmulator,
        signIn,
        signUp,
        signOut,
        sendVerificationEmail: sendVerificationEmailAction,
        sendPasswordReset: sendPasswordResetAction,
        updateProfile: updateProfileAction,
        exportAccountData: exportAccountDataAction,
        requestAccountDeletion: requestAccountDeletionAction,
        retrySync: retrySyncAction,
        activateDemoMode: activateDemoModeAction,
        exitDemoMode: exitDemoModeAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// frontend-admin/src/app/core/services/auth.service.ts
import { Injectable, Optional } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { OperatorUser, OperatorRole, AppMode } from '../models/operations.models';

export const DEMO_OPERATORS: Record<OperatorRole, OperatorUser> = {
  ADMIN: {
    id: 'usr_admin_01',
    email: 'farhan.admin@seekers.internal',
    name: 'Farhan A.',
    role: 'ADMIN'
  },
  OPERATOR: {
    id: 'usr_operator_02',
    email: 'tahmid.ops@seekers.internal',
    name: 'Tahmid O.',
    role: 'OPERATOR'
  },
  READ_ONLY: {
    id: 'usr_auditor_03',
    email: 'auditor@seekers.internal',
    name: 'Audit Viewer',
    role: 'READ_ONLY'
  }
};

const MODE_STORAGE_KEY = 'seekers_admin_app_mode';
const USER_STORAGE_KEY = 'seekers_admin_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<OperatorUser | null>(this.loadInitialUser());
  private modeSubject = new BehaviorSubject<AppMode>(this.loadInitialMode());
  private cancelPendingSubject = new Subject<void>();

  user$ = this.userSubject.asObservable();
  mode$ = this.modeSubject.asObservable();
  cancelPending$ = this.cancelPendingSubject.asObservable();

  constructor(@Optional() private http?: HttpClient) {}

  private loadInitialMode(): AppMode {
    try {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (stored === 'live' || stored === 'demo') {
        return stored;
      }
    } catch {}
    return 'demo'; // Default to Standalone Demo Mode
  }

  private loadInitialUser(): OperatorUser | null {
    const currentMode = this.loadInitialMode();
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (currentMode === 'live') {
          // Live mode requires valid session with token
          if (parsed && parsed.token) {
            return parsed;
          }
          return null;
        }
        return parsed;
      }
    } catch {}

    // In live mode, fresh reloads without saved session must remain unauthenticated
    if (currentMode === 'live') {
      return null;
    }

    return DEMO_OPERATORS.ADMIN;
  }

  get currentUser(): OperatorUser | null {
    return this.userSubject.getValue();
  }

  get currentRole(): OperatorRole {
    return this.userSubject.getValue()?.role || 'READ_ONLY';
  }

  get currentMode(): AppMode {
    return this.modeSubject.getValue();
  }

  isDemoMode(): boolean {
    return this.currentMode === 'demo';
  }

  canMutate(): boolean {
    const role = this.currentRole;
    return role === 'ADMIN' || role === 'OPERATOR';
  }

  isAdmin(): boolean {
    return this.currentRole === 'ADMIN';
  }

  setMode(mode: AppMode): void {
    this.cancelPendingSubject.next();

    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {}
    this.modeSubject.next(mode);

    if (mode === 'demo') {
      const user = this.userSubject.getValue();
      if (!user || user.token) {
        this.switchRole('ADMIN');
      }
    } else {
      // Live mode isolation: do not transfer demo credentials to live mode
      const user = this.userSubject.getValue();
      if (!user || !user.token) {
        this.userSubject.next(null);
      }
    }
  }

  switchRole(role: OperatorRole): void {
    this.cancelPendingSubject.next();

    const user = DEMO_OPERATORS[role];
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {}
    this.userSubject.next(user);
    if (this.currentMode !== 'demo') {
      this.setMode('demo');
    }
  }

  loginLive(email: string, token: string, role: OperatorRole = 'ADMIN'): void {
    let effectiveRole = role;
    let uid = `live_${Date.now()}`;
    let name = email.split('@')[0];

    // Decode token claims if present (standard JWT or Firebase ID token)
    const parts = token.split('.');
    if (parts.length === 3) {
      let header: any = null;
      let payload: any = null;
      try {
        const headerStr = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
        header = JSON.parse(headerStr);
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        payload = JSON.parse(payloadStr);
      } catch {
        throw new Error('Malformed authentication token structure');
      }

      // 1. Strictly reject unsigned tokens (alg: none)
      const alg = (header.alg || '').toUpperCase();
      if (!alg || alg === 'NONE') {
        throw new Error('Unsigned tokens (alg: none) are strictly rejected');
      }

      // 2. Reject expired tokens
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp <= nowSec) {
        throw new Error('Authentication session token has expired');
      }

      // 3. Reject candidate accounts
      if (payload.role === 'CANDIDATE') {
        throw new Error('Candidate accounts cannot access administrative console');
      }

      if (payload.admin === true || payload.role === 'ADMIN') {
        effectiveRole = 'ADMIN';
      } else if (payload.role === 'OPERATOR') {
        effectiveRole = 'OPERATOR';
      } else if (payload.role === 'READ_ONLY') {
        effectiveRole = 'READ_ONLY';
      }
      if (payload.uid || payload.sub) uid = payload.uid || payload.sub;
      if (payload.name) name = payload.name;
      if (payload.email) email = payload.email;
    }

    const user: OperatorUser = {
      id: uid,
      email,
      name,
      role: effectiveRole,
      token
    };

    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {}
    this.userSubject.next(user);
    this.setMode('live');
  }

  verifyLiveSession(tokenOverride?: string): Observable<OperatorUser> {
    const token = tokenOverride || this.currentUser?.token;
    if (!token || !this.http) {
      if (this.currentUser) return of(this.currentUser);
      return throwError(() => new Error('No active live session to verify'));
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'x-admin-key': token
    });

    return this.http.get<OperatorUser>('/api/v1/admin/auth/me', { headers }).pipe(
      tap(verified => {
        const user: OperatorUser = {
          ...verified,
          token
        };
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        } catch {}
        this.userSubject.next(user);
      }),
      catchError(err => {
        this.logout();
        return throwError(() => err);
      })
    );
  }

  logout(): void {
    this.cancelPendingSubject.next();

    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {}

    if (this.currentMode === 'demo') {
      this.userSubject.next(DEMO_OPERATORS.READ_ONLY);
    } else {
      this.userSubject.next(null);
    }
  }
}

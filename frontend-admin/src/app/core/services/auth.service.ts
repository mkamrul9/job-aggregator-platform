// frontend-admin/src/app/core/services/auth.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OperatorUser, OperatorRole, AppMode } from '../models/operations.models';

const DEMO_OPERATORS: Record<OperatorRole, OperatorUser> = {
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

  user$ = this.userSubject.asObservable();
  mode$ = this.modeSubject.asObservable();

  constructor() {}

  private loadInitialMode(): AppMode {
    try {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (stored === 'live' || stored === 'demo') {
        return stored;
      }
    } catch {}
    return 'demo'; // Default to Standalone Demo Mode
  }

  private loadInitialUser(): OperatorUser {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
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
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {}
    this.modeSubject.next(mode);
    if (mode === 'demo' && !this.userSubject.getValue()) {
      this.switchRole('ADMIN');
    }
  }

  switchRole(role: OperatorRole): void {
    const user = DEMO_OPERATORS[role];
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {}
    this.userSubject.next(user);
  }

  loginLive(email: string, token: string, role: OperatorRole = 'ADMIN'): void {
    const user: OperatorUser = {
      id: `live_${Date.now()}`,
      email,
      name: email.split('@')[0],
      role,
      token
    };
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {}
    this.userSubject.next(user);
    this.setMode('live');
  }

  logout(): void {
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

// frontend-admin/src/app/core/services/auth.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AuthService]
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with default demo administrator user and mode', () => {
    expect(service.isDemoMode()).toBeTrue();
    expect(service.currentUser).toBeTruthy();
    expect(service.currentRole).toBe('ADMIN');
    expect(service.isAdmin()).toBeTrue();
    expect(service.canMutate()).toBeTrue();
  });

  it('should switch roles and update mutation permissions', () => {
    service.switchRole('OPERATOR');
    expect(service.currentRole).toBe('OPERATOR');
    expect(service.isAdmin()).toBeFalse();
    expect(service.canMutate()).toBeTrue();

    service.switchRole('READ_ONLY');
    expect(service.currentRole).toBe('READ_ONLY');
    expect(service.isAdmin()).toBeFalse();
    expect(service.canMutate()).toBeFalse();
  });

  it('should support live login and logout transitions', () => {
    service.loginLive('secops.admin@seekers.internal', 'secops-live-bearer-token', 'ADMIN');
    expect(service.isDemoMode()).toBeFalse();
    expect(service.currentMode).toBe('live');
    expect(service.currentUser?.email).toBe('secops.admin@seekers.internal');
    expect(service.currentUser?.token).toBe('secops-live-bearer-token');

    service.logout();
    expect(service.currentUser).toBeNull();
  });
});

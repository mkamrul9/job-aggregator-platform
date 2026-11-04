// frontend-admin/src/app/core/services/auth.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
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

  it('should remain unauthenticated on reload in live mode after logout', () => {
    service.loginLive('ops@seekers.internal', 'live-tok-123', 'OPERATOR');
    service.logout();

    // Recreate service instance as would happen on page reload
    const reloadedService = new AuthService();
    expect(reloadedService.currentMode).toBe('live');
    expect(reloadedService.currentUser).toBeNull();
  });

  it('should extract role and identity from signed HS256 JWT token claims', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = btoa(JSON.stringify({
      uid: 'usr_claim_1',
      email: 'auditor@seekers.internal',
      role: 'READ_ONLY',
      exp: nowSec + 3600
    }));
    const jwt = `${header}.${payload}.sig`;

    service.loginLive('auditor@seekers.internal', jwt);
    expect(service.currentRole).toBe('READ_ONLY');
    expect(service.currentUser?.id).toBe('usr_claim_1');
    expect(service.canMutate()).toBeFalse();
  });

  it('strictly rejects unsigned tokens with alg: none', () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ uid: 'usr_fake', email: 'fake@seekers.internal', role: 'ADMIN' }));
    const unsignedJwt = `${header}.${payload}.`;

    expect(() => {
      service.loginLive('fake@seekers.internal', unsignedJwt);
    }).toThrowError(/alg: none/);
  });

  it('strictly rejects expired tokens', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      uid: 'usr_expired',
      email: 'exp@seekers.internal',
      role: 'ADMIN',
      exp: Math.floor(Date.now() / 1000) - 100
    }));
    const expiredJwt = `${header}.${payload}.sig`;

    expect(() => {
      service.loginLive('exp@seekers.internal', expiredJwt);
    }).toThrowError(/expired/);
  });

  it('verifies live session with backend /api/v1/admin/auth/me', () => {
    service.loginLive('admin@seekers.internal', 'valid-admin-token', 'ADMIN');

    service.verifyLiveSession().subscribe(user => {
      expect(user.id).toBe('usr_verified_root');
      expect(user.role).toBe('ADMIN');
    });

    const req = httpMock.expectOne('/api/v1/admin/auth/me');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer valid-admin-token');
    req.flush({
      id: 'usr_verified_root',
      email: 'admin@seekers.internal',
      name: 'Verified Admin',
      role: 'ADMIN'
    });
  });

  it('should isolate mode switching and not transfer demo credentials to live mode', () => {
    service.setMode('demo');
    service.switchRole('ADMIN');
    expect(service.currentUser?.role).toBe('ADMIN');

    // Switch to live mode without having logged in with live token
    service.setMode('live');
    expect(service.currentUser).toBeNull();
  });
});

// frontend-admin/src/app/features/login/login.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        FormsModule,
        RouterModule.forRoot([])
      ],
      declarations: [LoginComponent],
      providers: [AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create login component', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle between demo mode and live mode tabs', () => {
    component.setMode('live');
    expect(component.selectedMode).toBe('live');
    expect(authService.currentMode).toBe('live');

    component.setMode('demo');
    expect(component.selectedMode).toBe('demo');
    expect(authService.currentMode).toBe('demo');
  });

  it('should select role and enter operations console in demo mode', () => {
    spyOn(router, 'navigate');
    component.selectRole('OPERATOR');
    component.onEnterDemo();

    expect(authService.currentRole).toBe('OPERATOR');
    expect(authService.currentMode).toBe('demo');
    expect(router.navigate).toHaveBeenCalledWith(['/overview']);
  });

  it('should validate token presence when attempting live login', () => {
    component.setMode('live');
    component.liveToken = '';
    component.onLoginLive();
    expect(component.errorMessage).toContain('Please provide an administrative bearer token');
  });
});

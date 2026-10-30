// frontend-admin/src/app/layout/header/header.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../core/services/auth.service';
import { OperationsService } from '../../core/services/operations.service';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let authService: AuthService;
  let opsService: OperationsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RouterModule.forRoot([]),
        HttpClientTestingModule
      ],
      declarations: [HeaderComponent],
      providers: [AuthService, OperationsService]
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    opsService = TestBed.inject(OperationsService);
    fixture.detectChanges();
  });

  it('should create header component', () => {
    expect(component).toBeTruthy();
  });

  it('should display console branding and active mode badge', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('seekers');
    expect(el.textContent).toContain('console');
    expect(el.textContent).toContain('Standalone Demo');
  });

  it('should toggle role dropdown menu and switch roles', () => {
    expect(component.showRoleDropdown).toBeFalse();
    component.toggleRoleMenu();
    expect(component.showRoleDropdown).toBeTrue();

    component.onSwitchRole('OPERATOR');
    expect(authService.currentRole).toBe('OPERATOR');
    expect(component.showRoleDropdown).toBeFalse();
  });

  it('should emit mobileMenuToggle when hamburger is clicked', () => {
    spyOn(component.mobileMenuToggle, 'emit');
    component.onToggleMobile();
    expect(component.mobileMenuToggle.emit).toHaveBeenCalled();
  });

  it('should trigger crawl burst via operations service in demo mode', () => {
    spyOn(opsService, 'triggerBurst');
    component.onTriggerBurst();
    expect(opsService.triggerBurst).toHaveBeenCalled();
  });
});

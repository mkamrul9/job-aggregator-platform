// frontend-admin/src/app/features/login/login.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AppMode, OperatorRole } from '../../core/models/operations.models';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    standalone: false
})
export class LoginComponent implements OnInit {
  selectedMode: AppMode = 'demo';
  selectedRole: OperatorRole = 'ADMIN';

  liveEmail = 'admin@seekers.internal';
  liveToken = '';
  errorMessage = '';

  constructor(
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.selectedMode = this.authService.currentMode;
    this.selectedRole = this.authService.currentRole;
  }

  setMode(mode: AppMode): void {
    this.selectedMode = mode;
    this.authService.setMode(mode);
  }

  selectRole(role: OperatorRole): void {
    this.selectedRole = role;
    this.authService.switchRole(role);
  }

  onEnterDemo(): void {
    this.authService.setMode('demo');
    this.authService.switchRole(this.selectedRole);
    this.router.navigate(['/overview']);
  }

  onLoginLive(): void {
    if (!this.liveToken.trim()) {
      this.errorMessage = 'Please provide an administrative bearer token or service key.';
      return;
    }
    this.authService.loginLive(this.liveEmail, this.liveToken.trim());
    this.router.navigate(['/overview']);
  }
}

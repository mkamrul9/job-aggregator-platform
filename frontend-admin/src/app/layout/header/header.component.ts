// frontend-admin/src/app/layout/header/header.component.ts
import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { ConnectionState, OperatorUser, AppMode, OperatorRole } from '../../core/models/operations.models';

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    standalone: false
})
export class HeaderComponent {
  @Output() mobileMenuToggle = new EventEmitter<void>();

  connectionState$: Observable<ConnectionState>;
  user$: Observable<OperatorUser | null>;
  mode$: Observable<AppMode>;

  isPaused = false;
  showRoleDropdown = false;

  constructor(
    public opsService: OperationsService,
    public authService: AuthService,
    private router: Router
  ) {
    this.connectionState$ = this.opsService.getConnectionState();
    this.user$ = this.authService.user$;
    this.mode$ = this.authService.mode$;
  }

  onTriggerBurst(): void {
    this.opsService.triggerBurst();
  }

  onTogglePause(): void {
    this.isPaused = !this.isPaused;
  }

  onResetDemo(): void {
    this.opsService.resetDemo();
  }

  toggleRoleMenu(): void {
    this.showRoleDropdown = !this.showRoleDropdown;
  }

  onSwitchRole(role: OperatorRole): void {
    this.authService.switchRole(role);
    this.showRoleDropdown = false;
  }

  onLogout(): void {
    this.showRoleDropdown = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onToggleMobile(): void {
    this.mobileMenuToggle.emit();
  }
}

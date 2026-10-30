// frontend-admin/src/app/app.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  mobileDrawerOpen = false;

  constructor(
    public authService: AuthService,
    private router: Router
  ) {}

  toggleMobileDrawer(): void {
    this.mobileDrawerOpen = !this.mobileDrawerOpen;
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen = false;
  }

  isLoginRoute(): boolean {
    return this.router.url.includes('/login');
  }
}

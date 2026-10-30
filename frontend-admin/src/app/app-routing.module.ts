// frontend-admin/src/app/app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { OverviewComponent } from './features/overview/overview.component';
import { SourcesComponent } from './features/sources/sources.component';
import { CatalogComponent } from './features/catalog/catalog.component';
import { QueuesComponent } from './features/queues/queues.component';
import { SupportComponent } from './features/support/support.component';
import { AuditComponent } from './features/audit/audit.component';
import { LoginComponent } from './features/login/login.component';

const routes: Routes = [
  { path: 'overview', component: OverviewComponent, canActivate: [AuthGuard] },
  { path: 'sources', component: SourcesComponent, canActivate: [AuthGuard] },
  { path: 'catalog', component: CatalogComponent, canActivate: [AuthGuard] },
  { path: 'queues', component: QueuesComponent, canActivate: [AuthGuard] },
  { path: 'support', component: SupportComponent, canActivate: [AuthGuard] },
  { path: 'audit', component: AuditComponent, canActivate: [AuthGuard] },
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: '**', redirectTo: 'overview' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}

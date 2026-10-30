// frontend-admin/src/app/app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { HeaderComponent } from './layout/header/header.component';

import { OverviewComponent } from './features/overview/overview.component';
import { SourcesComponent } from './features/sources/sources.component';
import { CatalogComponent } from './features/catalog/catalog.component';
import { QueuesComponent } from './features/queues/queues.component';
import { SupportComponent } from './features/support/support.component';
import { AuditComponent } from './features/audit/audit.component';
import { LoginComponent } from './features/login/login.component';

@NgModule({
  declarations: [
    AppComponent,
    SidebarComponent,
    HeaderComponent,
    OverviewComponent,
    SourcesComponent,
    CatalogComponent,
    QueuesComponent,
    SupportComponent,
    AuditComponent,
    LoginComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

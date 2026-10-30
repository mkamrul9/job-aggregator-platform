// frontend-admin/src/app/features/overview/overview.component.ts
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import {
  SystemHealth,
  PipelineTelemetry,
  ConnectionState
} from '../../core/models/operations.models';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss']
})
export class OverviewComponent implements OnInit {
  health$!: Observable<SystemHealth[]>;
  telemetry$!: Observable<PipelineTelemetry>;
  connectionState$!: Observable<ConnectionState>;

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.health$ = this.opsService.getHealth();
    this.telemetry$ = this.opsService.getTelemetry();
    this.connectionState$ = this.opsService.getConnectionState();
  }

  onTriggerBurst(): void {
    this.opsService.triggerBurst();
  }

  onResetDemo(): void {
    this.opsService.resetDemo();
  }
}

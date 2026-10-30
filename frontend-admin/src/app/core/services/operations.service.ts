// frontend-admin/src/app/core/services/operations.service.ts
import { Injectable } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { OperationsAdapter } from './operations-adapter.interface';
import { DemoOperationsAdapter } from './demo-operations.adapter';
import { LiveOperationsAdapter } from './live-operations.adapter';
import { AuthService } from './auth.service';
import {
  SystemHealth,
  PipelineTelemetry,
  SourceConnector,
  CrawlRun,
  ModerationJob,
  QueueMetrics,
  DeadLetterItem,
  SupportReport,
  AuditLogEntry,
  CatalogFilterParams,
  ReconcileReport,
  ReindexResult,
  ConnectionState
} from '../models/operations.models';

@Injectable({
  providedIn: 'root'
})
export class OperationsService implements OperationsAdapter {
  constructor(
    private demoAdapter: DemoOperationsAdapter,
    private liveAdapter: LiveOperationsAdapter,
    private authService: AuthService
  ) {}

  private get activeAdapter(): OperationsAdapter {
    return this.authService.isDemoMode() ? this.demoAdapter : this.liveAdapter;
  }

  getConnectionState(): Observable<ConnectionState> {
    return this.authService.mode$.pipe(
      switchMap(mode => mode === 'demo' ? this.demoAdapter.getConnectionState() : this.liveAdapter.getConnectionState())
    );
  }

  getHealth(): Observable<SystemHealth[]> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getHealth())
    );
  }

  getTelemetry(): Observable<PipelineTelemetry> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getTelemetry())
    );
  }

  getSources(): Observable<SourceConnector[]> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getSources())
    );
  }

  getCrawlRuns(sourceId?: string): Observable<CrawlRun[]> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getCrawlRuns(sourceId))
    );
  }

  toggleSourcePause(sourceId: string, pause: boolean): Observable<SourceConnector> {
    return this.activeAdapter.toggleSourcePause(sourceId, pause);
  }

  triggerCrawlRun(sourceId: string): Observable<CrawlRun> {
    return this.activeAdapter.triggerCrawlRun(sourceId);
  }

  getJobs(params: CatalogFilterParams): Observable<{ jobs: ModerationJob[]; total: number }> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getJobs(params))
    );
  }

  moderateJob(
    jobId: string,
    action: 'EXPIRE' | 'FLAG' | 'UNFLAG' | 'HIDE' | 'RESTORE',
    reason: string
  ): Observable<ModerationJob> {
    return this.activeAdapter.moderateJob(jobId, action, reason);
  }

  getQueueMetrics(): Observable<QueueMetrics> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getQueueMetrics())
    );
  }

  getDeadLetters(): Observable<DeadLetterItem[]> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getDeadLetters())
    );
  }

  replayDeadLetter(id: string): Observable<{ success: boolean; message: string; canonicalJobId?: string }> {
    return this.activeAdapter.replayDeadLetter(id);
  }

  discardDeadLetter(id: string): Observable<{ success: boolean }> {
    return this.activeAdapter.discardDeadLetter(id);
  }

  reconcileCatalog(dryRun: boolean): Observable<ReconcileReport> {
    return this.activeAdapter.reconcileCatalog(dryRun);
  }

  reindexCatalog(): Observable<ReindexResult> {
    return this.activeAdapter.reindexCatalog();
  }

  getSupportReports(status?: string): Observable<SupportReport[]> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getSupportReports(status))
    );
  }

  triageSupportReport(id: string, status: string, notes?: string): Observable<SupportReport> {
    return this.activeAdapter.triageSupportReport(id, status, notes);
  }

  getAuditLogs(): Observable<AuditLogEntry[]> {
    return this.authService.mode$.pipe(
      switchMap(() => this.activeAdapter.getAuditLogs())
    );
  }

  logAuditEvent(entry: Partial<AuditLogEntry>): Observable<void> {
    return this.activeAdapter.logAuditEvent(entry);
  }

  // Simulator helper methods
  triggerBurst(): void {
    if (this.authService.isDemoMode()) {
      this.demoAdapter.triggerBurst();
    }
  }

  resetDemo(): void {
    if (this.authService.isDemoMode()) {
      this.demoAdapter.resetDemo();
    }
  }
}

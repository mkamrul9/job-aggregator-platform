// frontend-admin/src/app/core/services/operations-adapter.interface.ts
import { Observable } from 'rxjs';
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

export interface OperationsAdapter {
  getConnectionState(): Observable<ConnectionState>;
  getHealth(): Observable<SystemHealth[]>;
  getTelemetry(): Observable<PipelineTelemetry>;
  getSources(): Observable<SourceConnector[]>;
  getCrawlRuns(sourceId?: string): Observable<CrawlRun[]>;
  toggleSourcePause(sourceId: string, pause: boolean): Observable<SourceConnector>;
  triggerCrawlRun(sourceId: string): Observable<CrawlRun>;
  getJobs(params: CatalogFilterParams): Observable<{ jobs: ModerationJob[]; total: number }>;
  moderateJob(jobId: string, action: 'EXPIRE' | 'FLAG' | 'UNFLAG' | 'HIDE' | 'RESTORE', reason: string): Observable<ModerationJob>;
  getQueueMetrics(): Observable<QueueMetrics>;
  getDeadLetters(): Observable<DeadLetterItem[]>;
  replayDeadLetter(id: string): Observable<{ success: boolean; message: string; canonicalJobId?: string }>;
  discardDeadLetter(id: string): Observable<{ success: boolean }>;
  reconcileCatalog(dryRun: boolean): Observable<ReconcileReport>;
  reindexCatalog(): Observable<ReindexResult>;
  getSupportReports(status?: string): Observable<SupportReport[]>;
  triageSupportReport(id: string, status: string, notes?: string): Observable<SupportReport>;
  getAuditLogs(): Observable<AuditLogEntry[]>;
  logAuditEvent(entry: Partial<AuditLogEntry>): Observable<void>;
  triggerBurst?(): void;
  resetDemo?(): void;
}

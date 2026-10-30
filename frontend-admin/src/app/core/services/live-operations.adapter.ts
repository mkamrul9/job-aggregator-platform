// frontend-admin/src/app/core/services/live-operations.adapter.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, throwError } from 'rxjs';
import { OperationsAdapter } from './operations-adapter.interface';
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
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class LiveOperationsAdapter implements OperationsAdapter {
  private connectionState$ = new BehaviorSubject<ConnectionState>('connected');

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    const token = this.authService.currentUser?.token;
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
      headers = headers.set('x-admin-key', token);
    }
    return headers;
  }

  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * Probes all 7 microservices in the Seekers platform fleet
   */
  getHealth(): Observable<SystemHealth[]> {
    const checks = [
      this.probeService('service-scraper', 'Go Job Collection Engine', '/api/v1/admin/sources', '8080'),
      this.probeService('service-resume', 'Python Resume Extraction Engine', '/api/v1/resume/health', '8000'),
      this.probeService('service-user', 'NestJS User & Support API', '/api/v1/users/health', '3000'),
      this.probeService('service-ingestion', 'Node Ingestion & Catalog API', '/api/v1/jobs/health', '5000'),
      this.probeService('service-notification', 'Notification Outbox Dispatcher', '/api/v1/notifications/health', '4000'),
      this.probeService('frontend-next', 'Next.js Candidate Application', '/', '3003'),
      this.probeLocalAdmin('frontend-admin', 'Angular Operations Console')
    ];

    return forkJoin(checks).pipe(
      map(results => {
        const downCount = results.filter(r => r.status === 'DOWN').length;
        if (downCount === 0) {
          this.connectionState$.next('connected');
        } else if (downCount < results.length) {
          this.connectionState$.next('reconnecting');
        } else {
          this.connectionState$.next('disconnected');
        }
        return results;
      }),
      catchError(() => {
        this.connectionState$.next('disconnected');
        return of<SystemHealth[]>([
          {
            service: 'platform-gateway',
            displayName: 'Gateway & Services Status',
            status: 'DOWN',
            latencyMs: 0,
            version: '1.0.0',
            endpoint: '/api/v1/*',
            details: 'Platform backend services unreachable',
            checkedAt: new Date().toISOString()
          }
        ]);
      })
    );
  }

  private probeService(
    service: string,
    displayName: string,
    endpoint: string,
    port: string
  ): Observable<SystemHealth> {
    const start = performance.now();
    return this.http.get<any>(endpoint, { headers: this.getAuthHeaders() }).pipe(
      map(res => ({
        service,
        displayName,
        status: 'HEALTHY' as const,
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        version: res?.version || '1.0.0',
        endpoint: `http://localhost:${port}`,
        details: res?.status || 'Online and responding',
        checkedAt: new Date().toISOString()
      })),
      catchError(err => of({
        service,
        displayName,
        status: 'DOWN' as const,
        latencyMs: 0,
        version: 'UNKNOWN',
        endpoint: `http://localhost:${port}`,
        details: `Connection failed: ${err.message || 'HTTP error'}`,
        checkedAt: new Date().toISOString()
      }))
    );
  }

  private probeLocalAdmin(service: string, displayName: string): Observable<SystemHealth> {
    return of({
      service,
      displayName,
      status: 'HEALTHY' as const,
      latencyMs: 1,
      version: '1.0.0',
      endpoint: window.location.origin,
      details: 'Active browser application runtime',
      checkedAt: new Date().toISOString()
    });
  }

  getTelemetry(): Observable<PipelineTelemetry> {
    return this.http.get<any>('/api/v1/admin/ingestion/status', { headers: this.getAuthHeaders() }).pipe(
      map(res => ({
        activeConnectors: res?.activeConnectors ?? 2,
        totalConnectors: res?.totalConnectors ?? 7,
        throughputHourly: res?.throughputHourly ?? 120,
        avgLatencyMs: res?.avgLatencyMs ?? 18,
        kafkaLagMs: res?.kafkaLagMs ?? 14,
        dlqCount: res?.deadLetters ?? 0,
        lastUpdated: new Date().toLocaleTimeString()
      })),
      catchError(err => throwError(() => new Error(`Failed to fetch live telemetry: ${err.message}`)))
    );
  }

  getSources(): Observable<SourceConnector[]> {
    return this.http.get<SourceConnector[]>('/api/v1/admin/sources', { headers: this.getAuthHeaders() }).pipe(
      catchError(err => throwError(() => new Error(`Failed to fetch live sources: ${err.message}`)))
    );
  }

  getCrawlRuns(sourceId?: string): Observable<CrawlRun[]> {
    let params = new HttpParams();
    if (sourceId) {
      params = params.set('source_id', sourceId);
    }
    return this.http.get<CrawlRun[]>('/api/v1/admin/crawl-runs', {
      headers: this.getAuthHeaders(),
      params
    }).pipe(
      catchError(err => throwError(() => new Error(`Failed to fetch crawl runs: ${err.message}`)))
    );
  }

  toggleSourcePause(sourceId: string, pause: boolean): Observable<SourceConnector> {
    const action = pause ? 'pause' : 'resume';
    return this.http.put<SourceConnector>(
      `/api/v1/admin/sources/${sourceId}/${action}`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => new Error(`Failed to toggle source state: ${err.message}`)))
    );
  }

  triggerCrawlRun(sourceId: string): Observable<CrawlRun> {
    return this.http.post<CrawlRun>(
      `/api/v1/admin/sources/${sourceId}/crawl`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => new Error(`Failed to trigger crawl run: ${err.message}`)))
    );
  }

  /**
   * Privileged catalog inspection: queries across all statuses (ACTIVE, FLAGGED, HIDDEN, EXPIRED)
   * Maps { items, total_count, next_cursor } response envelope cleanly to ModerationJob
   */
  getJobs(params: CatalogFilterParams): Observable<{ jobs: ModerationJob[]; total: number }> {
    let httpParams = new HttpParams();
    if (params.query) httpParams = httpParams.set('q', params.query);
    if (params.source && params.source !== 'ALL') httpParams = httpParams.set('source', params.source);
    if (params.status && params.status !== 'ALL') httpParams = httpParams.set('status', params.status);
    if (params.page) httpParams = httpParams.set('page', params.page.toString());
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());

    return this.http.get<any>('/api/v1/admin/jobs', {
      headers: this.getAuthHeaders(),
      params: httpParams
    }).pipe(
      map(res => {
        const rawItems = res?.items || res?.jobs || [];
        const total = res?.total_count ?? res?.total ?? 0;

        const jobs: ModerationJob[] = rawItems.map((j: any) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          source: j.source,
          url: j.canonical_url || j.url,
          status: j.status || 'ACTIVE',
          latencyMs: j.latencyMs || 18,
          scrapedAt: j.created_at || j.scrapedAt || new Date().toLocaleString(),
          outboundClicks: j.outbound_clicks || j.outboundClicks || 0,
          rawDescription: j.raw_description || j.description,
          provenance: {
            duplicateCount: j.provenance?.duplicate_count || j.provenance?.duplicateCount || 1,
            duplicateHashes: j.provenance?.duplicate_hashes || j.provenance?.duplicateHashes || [],
            firstSeenAt: j.provenance?.first_seen_at || j.created_at || new Date().toISOString(),
            lastVerifiedAt: j.provenance?.last_verified_at || j.updated_at || new Date().toISOString(),
            rawPayloadPreview: typeof j.provenance?.raw_payload_preview === 'string'
              ? j.provenance.raw_payload_preview
              : JSON.stringify(j, null, 2)
          }
        }));

        return { jobs, total };
      }),
      catchError(err => throwError(() => new Error(`Failed to fetch catalog jobs: ${err.message}`)))
    );
  }

  moderateJob(
    jobId: string,
    action: 'EXPIRE' | 'FLAG' | 'UNFLAG' | 'HIDE' | 'RESTORE',
    reason: string
  ): Observable<ModerationJob> {
    return this.http.patch<ModerationJob>(
      `/api/v1/admin/jobs/${jobId}/moderate`,
      { action, reason },
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => new Error(`Failed to moderate job: ${err.message}`)))
    );
  }

  getQueueMetrics(): Observable<QueueMetrics> {
    return this.http.get<QueueMetrics>('/api/v1/admin/ingestion/queues', { headers: this.getAuthHeaders() }).pipe(
      catchError(err => throwError(() => new Error(`Failed to fetch queue metrics: ${err.message}`)))
    );
  }

  getDeadLetters(): Observable<DeadLetterItem[]> {
    return this.http.get<any[]>('/api/v1/admin/ingestion/dead-letters', { headers: this.getAuthHeaders() }).pipe(
      map(items => (items || []).map(dl => ({
        id: dl.id,
        eventType: dl.eventType || dl.event_type || 'job.collected.v1',
        quarantinedAt: dl.quarantinedAt || dl.quarantined_at || new Date().toISOString(),
        errors: dl.errors || [],
        rawPayload: dl.rawPayload || dl.raw_payload,
        status: dl.status,
        retryCount: dl.retryCount ?? dl.retry_count ?? 0,
        resolvedAt: dl.resolvedAt || dl.resolved_at
      }))),
      catchError(err => throwError(() => new Error(`Failed to fetch dead letters: ${err.message}`)))
    );
  }

  replayDeadLetter(id: string): Observable<{ success: boolean; message: string; canonicalJobId?: string }> {
    return this.http.post<any>(
      `/api/v1/admin/ingestion/dead-letters/${id}/replay`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => new Error(`Failed to replay dead letter: ${err.message}`)))
    );
  }

  discardDeadLetter(id: string): Observable<{ success: boolean }> {
    return this.http.post<any>(
      `/api/v1/admin/ingestion/dead-letters/${id}/discard`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => new Error(`Failed to discard dead letter: ${err.message}`)))
    );
  }

  reconcileCatalog(dryRun: boolean): Observable<ReconcileReport> {
    return this.http.post<any>(
      '/api/v1/admin/ingestion/reconcile',
      { dryRun },
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(res => ({
        scannedCount: res.scannedCount ?? res.scanned_mongo ?? 0,
        matchedCount: res.matchedCount ?? (res.scanned_mongo ? res.scanned_mongo - (res.missing_indexed || 0) : 0),
        repairedCount: res.repairedCount ?? ((res.missing_indexed || 0) + (res.stale_updated || 0)),
        missingInEs: res.missingInEs ?? res.missing_indexed ?? 0,
        staleInEs: res.staleInEs ?? res.stale_updated ?? 0,
        excessInEs: res.excessInEs ?? res.excess_deleted ?? 0,
        dryRun: Boolean(res.dryRun ?? res.dry_run),
        errors: res.errors || [],
        completedAt: res.completedAt || new Date().toISOString()
      })),
      catchError(err => throwError(() => new Error(`Failed to execute reconciliation: ${err.message}`)))
    );
  }

  reindexCatalog(): Observable<ReindexResult> {
    return this.http.post<any>(
      '/api/v1/admin/ingestion/reindex',
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(res => ({
        operationId: res.operationId || `reindex_${Date.now()}`,
        status: res.status || (res.success ? 'COMPLETED' : 'FAILED'),
        sourceIndex: res.sourceIndex || 'jobs_index',
        targetIndex: res.targetIndex || 'jobs_index',
        alias: res.alias || 'jobs_index',
        documentsIndexed: res.documentsIndexed ?? res.activeJobsProjected ?? 0,
        durationMs: res.durationMs ?? 0,
        startedAt: res.startedAt || new Date().toISOString(),
        completedAt: res.completedAt || new Date().toISOString(),
        error: res.error
      })),
      catchError(err => throwError(() => new Error(`Failed to trigger index rebuild: ${err.message}`)))
    );
  }

  /**
   * Support Triage Queue: handles paginated { items, total_count } response from service-user
   */
  getSupportReports(status?: string): Observable<SupportReport[]> {
    let params = new HttpParams();
    if (status && status !== 'ALL') {
      params = params.set('status', status);
    }
    return this.http.get<any>('/api/v1/admin/reports', {
      headers: this.getAuthHeaders(),
      params
    }).pipe(
      map(response => {
        const rawReports = Array.isArray(response) ? response : (response?.items || []);
        return rawReports.map((r: any) => ({
          id: r.id,
          referenceNum: r.referenceNum || r.reference_num || `RPT-${r.id.slice(0, 8)}`,
          userId: r.userId || r.user_id,
          jobId: r.jobId || r.job_id,
          reportType: r.reportType || r.report_type || 'OTHER',
          description: r.description,
          contactEmail: r.contactEmail || r.contact_email,
          status: r.status,
          operatorNotes: r.operatorNotes || r.operator_notes,
          createdAt: r.createdAt || r.created_at || new Date().toISOString(),
          updatedAt: r.updatedAt || r.updated_at || new Date().toISOString(),
          resolvedAt: r.resolvedAt || r.resolved_at,
          resolvedBy: r.resolvedBy || r.resolved_by
        }));
      }),
      catchError(err => throwError(() => new Error(`Failed to fetch support reports: ${err.message}`)))
    );
  }

  triageSupportReport(id: string, status: string, notes?: string): Observable<SupportReport> {
    return this.http.patch<any>(
      `/api/v1/admin/reports/${id}`,
      { status, operator_notes: notes },
      { headers: this.getAuthHeaders() }
    ).pipe(
      map(r => ({
        id: r.id,
        referenceNum: r.reference_num || r.referenceNum,
        status: r.status,
        operatorNotes: r.operator_notes || r.operatorNotes,
        description: r.description || '',
        reportType: r.report_type || r.reportType || 'OTHER',
        createdAt: r.created_at || r.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })),
      catchError(err => throwError(() => new Error(`Failed to triage support report: ${err.message}`)))
    );
  }

  getAuditLogs(): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>('/api/v1/admin/audit', { headers: this.getAuthHeaders() }).pipe(
      catchError(err => throwError(() => new Error(`Failed to fetch audit logs: ${err.message}`)))
    );
  }

  logAuditEvent(_entry: Partial<AuditLogEntry>): Observable<void> {
    // Authoritative audit evidence is recorded strictly by server-side mutations
    return of(undefined);
  }
}

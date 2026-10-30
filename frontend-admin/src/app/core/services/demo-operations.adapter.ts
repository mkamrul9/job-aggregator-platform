// frontend-admin/src/app/core/services/demo-operations.adapter.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay, map } from 'rxjs/operators';
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
import {
  INITIAL_HEALTH,
  INITIAL_SOURCES,
  INITIAL_CRAWL_RUNS,
  INITIAL_JOBS,
  INITIAL_DEAD_LETTERS,
  INITIAL_SUPPORT_REPORTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_QUEUE_METRICS,
  INITIAL_TELEMETRY
} from './demo-data';

@Injectable({
  providedIn: 'root'
})
export class DemoOperationsAdapter implements OperationsAdapter {
  private health$ = new BehaviorSubject<SystemHealth[]>([...INITIAL_HEALTH]);
  private telemetry$ = new BehaviorSubject<PipelineTelemetry>({ ...INITIAL_TELEMETRY });
  private sources$ = new BehaviorSubject<SourceConnector[]>([...INITIAL_SOURCES]);
  private crawlRuns$ = new BehaviorSubject<CrawlRun[]>([...INITIAL_CRAWL_RUNS]);
  private jobs$ = new BehaviorSubject<ModerationJob[]>([...INITIAL_JOBS]);
  private deadLetters$ = new BehaviorSubject<DeadLetterItem[]>([...INITIAL_DEAD_LETTERS]);
  private supportReports$ = new BehaviorSubject<SupportReport[]>([...INITIAL_SUPPORT_REPORTS]);
  private auditLogs$ = new BehaviorSubject<AuditLogEntry[]>([...INITIAL_AUDIT_LOGS]);
  private queueMetrics$ = new BehaviorSubject<QueueMetrics>({ ...INITIAL_QUEUE_METRICS });
  private connectionState$ = new BehaviorSubject<ConnectionState>('connected');

  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  getHealth(): Observable<SystemHealth[]> {
    return this.health$.asObservable();
  }

  getTelemetry(): Observable<PipelineTelemetry> {
    return this.telemetry$.asObservable();
  }

  getSources(): Observable<SourceConnector[]> {
    return this.sources$.asObservable();
  }

  getCrawlRuns(sourceId?: string): Observable<CrawlRun[]> {
    return this.crawlRuns$.asObservable().pipe(
      map(runs => sourceId ? runs.filter(r => r.sourceId === sourceId) : runs)
    );
  }

  toggleSourcePause(sourceId: string, pause: boolean): Observable<SourceConnector> {
    const sources = this.sources$.getValue();
    const target = sources.find(s => s.id === sourceId);
    if (!target) {
      return throwError(() => new Error(`Source '${sourceId}' not found.`));
    }

    const updated: SourceConnector = {
      ...target,
      status: pause ? 'PAUSED' : 'HEALTHY'
    };

    const newSources = sources.map(s => s.id === sourceId ? updated : s);
    this.sources$.next(newSources);

    // Update telemetry
    const active = newSources.filter(s => s.status === 'HEALTHY' && s.enabled).length;
    this.telemetry$.next({
      ...this.telemetry$.getValue(),
      activeConnectors: active
    });

    // Record audit event
    this.logAuditEvent({
      action: pause ? 'SOURCE_PAUSED' : 'SOURCE_RESUMED',
      targetType: 'SOURCE_CONNECTOR',
      targetId: sourceId,
      result: 'SUCCESS',
      details: `${pause ? 'Paused' : 'Resumed'} crawler connector "${target.name}"`,
      beforeState: { status: target.status },
      afterState: { status: updated.status }
    }).subscribe();

    return of(updated).pipe(delay(200));
  }

  triggerCrawlRun(sourceId: string): Observable<CrawlRun> {
    const sources = this.sources$.getValue();
    const target = sources.find(s => s.id === sourceId);
    if (!target) {
      return throwError(() => new Error(`Source '${sourceId}' not found.`));
    }

    const newRun: CrawlRun = {
      id: `run_${target.id}_${Date.now().toString().slice(-4)}`,
      sourceId: target.id,
      sourceName: target.name,
      trigger: 'MANUAL',
      startedAt: new Date().toLocaleTimeString(),
      durationMs: 2400 + Math.floor(Math.random() * 1200),
      itemsCollected: Math.floor(Math.random() * 15) + 3,
      itemsRejected: 0,
      status: 'SUCCESS'
    };

    const runs = [newRun, ...this.crawlRuns$.getValue()].slice(0, 30);
    this.crawlRuns$.next(runs);

    // Update source stats
    const updatedSource: SourceConnector = {
      ...target,
      lastCrawledAt: 'Just now',
      totalCollected: target.totalCollected + newRun.itemsCollected
    };
    this.sources$.next(sources.map(s => s.id === sourceId ? updatedSource : s));

    // Update telemetry throughput
    const t = this.telemetry$.getValue();
    this.telemetry$.next({
      ...t,
      throughputHourly: t.throughputHourly + newRun.itemsCollected
    });

    // Log audit
    this.logAuditEvent({
      action: 'CRAWL_RUN_TRIGGERED',
      targetType: 'SOURCE_CONNECTOR',
      targetId: sourceId,
      result: 'SUCCESS',
      details: `Manual crawl executed for "${target.name}"; collected ${newRun.itemsCollected} jobs.`
    }).subscribe();

    return of(newRun).pipe(delay(350));
  }

  getJobs(params: CatalogFilterParams): Observable<{ jobs: ModerationJob[]; total: number }> {
    return this.jobs$.asObservable().pipe(
      map(allJobs => {
        let filtered = allJobs;
        if (params.query && params.query.trim()) {
          const q = params.query.toLowerCase().trim();
          filtered = filtered.filter(j =>
            j.title.toLowerCase().includes(q) ||
            j.company.toLowerCase().includes(q) ||
            j.location.toLowerCase().includes(q)
          );
        }
        if (params.source && params.source !== 'ALL') {
          filtered = filtered.filter(j => j.source === params.source);
        }
        if (params.status && params.status !== 'ALL') {
          filtered = filtered.filter(j => j.status === params.status);
        }

        const page = params.page || 1;
        const limit = params.limit || 10;
        const start = (page - 1) * limit;
        const paged = filtered.slice(start, start + limit);

        return { jobs: paged, total: filtered.length };
      })
    );
  }

  moderateJob(
    jobId: string,
    action: 'EXPIRE' | 'FLAG' | 'UNFLAG' | 'HIDE' | 'RESTORE',
    reason: string
  ): Observable<ModerationJob> {
    const jobs = this.jobs$.getValue();
    const target = jobs.find(j => j.id === jobId);
    if (!target) {
      return throwError(() => new Error(`Job '${jobId}' not found.`));
    }

    let nextStatus: ModerationJob['status'] = target.status;
    switch (action) {
      case 'EXPIRE':
        nextStatus = 'EXPIRED';
        break;
      case 'FLAG':
        nextStatus = 'FLAGGED';
        break;
      case 'UNFLAG':
      case 'RESTORE':
        nextStatus = 'ACTIVE';
        break;
      case 'HIDE':
        nextStatus = 'HIDDEN';
        break;
    }

    const updated: ModerationJob = {
      ...target,
      status: nextStatus
    };

    this.jobs$.next(jobs.map(j => j.id === jobId ? updated : j));

    this.logAuditEvent({
      action: `JOB_${action}`,
      targetType: 'CANONICAL_JOB',
      targetId: jobId,
      result: 'SUCCESS',
      details: `Job "${target.title}" status changed from ${target.status} to ${nextStatus}. Reason: ${reason}`,
      beforeState: { status: target.status },
      afterState: { status: nextStatus }
    }).subscribe();

    return of(updated).pipe(delay(250));
  }

  getQueueMetrics(): Observable<QueueMetrics> {
    return this.queueMetrics$.asObservable();
  }

  getDeadLetters(): Observable<DeadLetterItem[]> {
    return this.deadLetters$.asObservable();
  }

  replayDeadLetter(id: string): Observable<{ success: boolean; message: string; canonicalJobId?: string }> {
    const items = this.deadLetters$.getValue();
    const target = items.find(i => i.id === id);
    if (!target) {
      return throwError(() => new Error(`Dead letter item '${id}' not found.`));
    }

    // Simulate repair and resolution
    const resolved: DeadLetterItem = {
      ...target,
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
      retryCount: target.retryCount + 1
    };

    this.deadLetters$.next(items.map(i => i.id === id ? resolved : i));

    // Decrement DLQ count in telemetry
    const t = this.telemetry$.getValue();
    this.telemetry$.next({
      ...t,
      dlqCount: Math.max(0, t.dlqCount - 1)
    });

    const canonicalJobId = `e1a2b3c4-${Math.random().toString(16).substring(2, 6)}-4000-8000-000000000099`;

    this.logAuditEvent({
      action: 'DEAD_LETTER_REPLAYED',
      targetType: 'DEAD_LETTER_QUEUE',
      targetId: id,
      result: 'SUCCESS',
      details: `Replayed dead letter ${id} -> Created canonical listing ${canonicalJobId}`,
      beforeState: { status: target.status },
      afterState: { status: 'RESOLVED' }
    }).subscribe();

    return of({
      success: true,
      message: `Dead letter ${id} successfully replayed and projected to canonical catalog.`,
      canonicalJobId
    }).pipe(delay(400));
  }

  discardDeadLetter(id: string): Observable<{ success: boolean }> {
    const items = this.deadLetters$.getValue();
    const target = items.find(i => i.id === id);
    if (!target) {
      return throwError(() => new Error(`Dead letter item '${id}' not found.`));
    }

    const discarded: DeadLetterItem = {
      ...target,
      status: 'DISCARDED',
      resolvedAt: new Date().toISOString()
    };

    this.deadLetters$.next(items.map(i => i.id === id ? discarded : i));

    const t = this.telemetry$.getValue();
    this.telemetry$.next({
      ...t,
      dlqCount: Math.max(0, t.dlqCount - 1)
    });

    this.logAuditEvent({
      action: 'DEAD_LETTER_DISCARDED',
      targetType: 'DEAD_LETTER_QUEUE',
      targetId: id,
      result: 'SUCCESS',
      details: `Discarded dead letter ${id} with status DISCARDED.`,
      beforeState: { status: target.status },
      afterState: { status: 'DISCARDED' }
    }).subscribe();

    return of({ success: true }).pipe(delay(200));
  }

  reconcileCatalog(dryRun: boolean): Observable<ReconcileReport> {
    const report: ReconcileReport = {
      scannedCount: 3420,
      matchedCount: 3418,
      repairedCount: dryRun ? 0 : 2,
      missingInEs: 2,
      staleInEs: 0,
      excessInEs: 0,
      dryRun,
      errors: [],
      completedAt: new Date().toISOString()
    };

    this.logAuditEvent({
      action: 'CATALOG_RECONCILED',
      targetType: 'SEARCH_INDEX',
      targetId: 'jobs_v1',
      result: 'SUCCESS',
      details: `Catalog reconciliation (dry-run: ${dryRun}): 3,420 scanned, ${report.repairedCount} repaired.`
    }).subscribe();

    return of(report).pipe(delay(600));
  }

  reindexCatalog(): Observable<ReindexResult> {
    const result: ReindexResult = {
      operationId: `reindex_op_${Date.now()}`,
      status: 'COMPLETED',
      sourceIndex: 'jobs_v1',
      targetIndex: `jobs_v2_${Date.now()}`,
      alias: 'jobs',
      documentsIndexed: 3420,
      durationMs: 3840,
      startedAt: new Date(Date.now() - 3840).toISOString(),
      completedAt: new Date().toISOString()
    };

    this.logAuditEvent({
      action: 'INDEX_REBUILD',
      targetType: 'SEARCH_INDEX',
      targetId: result.targetIndex,
      result: 'SUCCESS',
      details: `Rebuilt search index ${result.targetIndex} with atomic alias swap; 3,420 documents indexed in 3.8s.`
    }).subscribe();

    return of(result).pipe(delay(800));
  }

  getSupportReports(status?: string): Observable<SupportReport[]> {
    return this.supportReports$.asObservable().pipe(
      map(reports => status && status !== 'ALL' ? reports.filter(r => r.status === status) : reports)
    );
  }

  triageSupportReport(id: string, status: string, notes?: string): Observable<SupportReport> {
    const reports = this.supportReports$.getValue();
    const target = reports.find(r => r.id === id);
    if (!target) {
      return throwError(() => new Error(`Support report '${id}' not found.`));
    }

    const updated: SupportReport = {
      ...target,
      status: status as SupportReport['status'],
      operatorNotes: notes || target.operatorNotes,
      updatedAt: new Date().toISOString(),
      resolvedAt: (status === 'RESOLVED' || status === 'DISMISSED') ? new Date().toISOString() : target.resolvedAt
    };

    this.supportReports$.next(reports.map(r => r.id === id ? updated : r));

    this.logAuditEvent({
      action: 'SUPPORT_REPORT_TRIAGED',
      targetType: 'SUPPORT_REPORT',
      targetId: id,
      result: 'SUCCESS',
      details: `Report ${target.referenceNum} status updated to ${status}. Notes: ${notes || 'None'}`,
      beforeState: { status: target.status, notes: target.operatorNotes },
      afterState: { status, notes: updated.operatorNotes }
    }).subscribe();

    return of(updated).pipe(delay(250));
  }

  getAuditLogs(): Observable<AuditLogEntry[]> {
    return this.auditLogs$.asObservable();
  }

  logAuditEvent(entry: Partial<AuditLogEntry>): Observable<void> {
    const newEntry: AuditLogEntry = {
      id: `audit_evt_${Date.now().toString().slice(-4)}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      actor: entry.actor || {
        id: 'usr_admin_01',
        email: 'farhan.admin@seekers.internal',
        role: 'ADMIN'
      },
      action: entry.action || 'SYSTEM_ACTION',
      targetType: entry.targetType || 'SYSTEM',
      targetId: entry.targetId || 'unknown',
      result: entry.result || 'SUCCESS',
      details: entry.details,
      beforeState: entry.beforeState,
      afterState: entry.afterState
    };

    const current = this.auditLogs$.getValue();
    this.auditLogs$.next([newEntry, ...current].slice(0, 100));
    return of(undefined);
  }

  triggerBurst(): void {
    const sampleTitles = [
      { title: 'Platform Security Specialist', company: 'bKash Limited', location: 'Dhaka', source: 'greenhouse-feed' },
      { title: 'Senior Backend Engineer (Go)', company: 'Pathao', location: 'Dhaka', source: 'lever-feed' },
      { title: 'Lead Data Engineer (Spark/Kafka)', company: 'ShopUp', location: 'Dhaka', source: 'greenhouse-feed' },
      { title: 'Principal Architect (Distributed)', company: 'Brain Station 23', location: 'Dhaka', source: 'lever-feed' },
      { title: 'Frontend Systems Engineer', company: 'Optimizely Dhaka', location: 'Dhaka', source: 'greenhouse-feed' }
    ];

    const currentJobs = this.jobs$.getValue();
    const newJobs: ModerationJob[] = sampleTitles.map((t, idx) => ({
      id: `e1a2b3c4-burst-${Date.now().toString().slice(-4)}-${idx + 1}`,
      title: `[BURST] ${t.title}`,
      company: t.company,
      location: t.location,
      source: t.source,
      url: `https://jobs.example.com/burst/${idx + 1}`,
      status: 'ACTIVE',
      latencyMs: 10 + Math.floor(Math.random() * 15),
      scrapedAt: new Date().toLocaleTimeString(),
      expiresAt: new Date(Date.now() + 2592000000).toLocaleDateString(),
      outboundClicks: 0,
      rawDescription: `Burst crawled listing from ${t.source}.`,
      provenance: {
        duplicateCount: 1,
        duplicateHashes: [`hash_burst_${Date.now()}_${idx}`],
        firstSeenAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        rawPayloadPreview: `{"burst":true,"title":"${t.title}"}`
      }
    }));

    this.jobs$.next([...newJobs, ...currentJobs]);

    const tel = this.telemetry$.getValue();
    this.telemetry$.next({
      ...tel,
      throughputHourly: tel.throughputHourly + newJobs.length
    });

    this.logAuditEvent({
      action: 'SIMULATOR_BURST_TRIGGERED',
      targetType: 'INGESTION_PIPELINE',
      targetId: 'job.collected.v1',
      result: 'SUCCESS',
      details: `Injected 5 synthetic burst jobs into local pipeline simulator.`
    }).subscribe();
  }

  resetDemo(): void {
    this.health$.next([...INITIAL_HEALTH]);
    this.telemetry$.next({ ...INITIAL_TELEMETRY });
    this.sources$.next([...INITIAL_SOURCES]);
    this.crawlRuns$.next([...INITIAL_CRAWL_RUNS]);
    this.jobs$.next([...INITIAL_JOBS]);
    this.deadLetters$.next([...INITIAL_DEAD_LETTERS]);
    this.supportReports$.next([...INITIAL_SUPPORT_REPORTS]);
    this.auditLogs$.next([...INITIAL_AUDIT_LOGS]);
    this.queueMetrics$.next({ ...INITIAL_QUEUE_METRICS });
    this.connectionState$.next('connected');
  }
}

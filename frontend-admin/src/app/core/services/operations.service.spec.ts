// frontend-admin/src/app/core/services/operations.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { OperationsService } from './operations.service';
import { DemoOperationsAdapter } from './demo-operations.adapter';
import { LiveOperationsAdapter } from './live-operations.adapter';
import { AuthService } from './auth.service';

describe('OperationsService & DemoOperationsAdapter', () => {
  let service: OperationsService;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        OperationsService,
        DemoOperationsAdapter,
        LiveOperationsAdapter,
        AuthService
      ]
    });
    service = TestBed.inject(OperationsService);
    authService = TestBed.inject(AuthService);
    authService.setMode('demo');
    service.resetDemo();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should retrieve all 7 service fleet health records', (done) => {
    service.getHealth().subscribe((health) => {
      expect(health.length).toBe(7);
      const services = health.map(h => h.service);
      expect(services).toContain('service-scraper');
      expect(services).toContain('service-ingestion');
      expect(services).toContain('mongodb-catalog');
      expect(services).toContain('elasticsearch-search');
      expect(services).toContain('service-notification');
      expect(services).toContain('service-user');
      expect(services).toContain('service-resume');
      done();
    });
  });

  it('should toggle source pause status and record audit log', (done) => {
    service.toggleSourcePause('greenhouse-feed', true).subscribe((updated) => {
      expect(updated.status).toBe('PAUSED');

      service.getAuditLogs().subscribe((logs) => {
        const pauseLog = logs.find(l => l.action === 'SOURCE_PAUSED' && l.targetId === 'greenhouse-feed');
        expect(pauseLog).toBeTruthy();
        expect(pauseLog?.result).toBe('SUCCESS');
        done();
      });
    });
  });

  it('should execute manual crawl run and increment collected count', (done) => {
    service.triggerCrawlRun('greenhouse-feed').subscribe((run) => {
      expect(run.status).toBe('SUCCESS');
      expect(run.itemsCollected).toBeGreaterThan(0);
      expect(run.trigger).toBe('MANUAL');
      done();
    });
  });

  it('should moderate job status with audit trace', (done) => {
    const testJobId = 'e1a2b3c4-1111-4000-8000-000000000001';
    service.moderateJob(testJobId, 'EXPIRE', 'Expired on hiring site').subscribe((modJob) => {
      expect(modJob.status).toBe('EXPIRED');

      service.getJobs({ status: 'EXPIRED' }).subscribe(({ jobs }) => {
        const found = jobs.find(j => j.id === testJobId);
        expect(found?.status).toBe('EXPIRED');
        done();
      });
    });
  });

  it('should replay dead letter poison event and decrement DLQ count', (done) => {
    const dlqId = 'dlq_poison_8841';
    service.replayDeadLetter(dlqId).subscribe((res) => {
      expect(res.success).toBeTrue();
      expect(res.canonicalJobId).toBeTruthy();

      service.getTelemetry().subscribe((tel) => {
        expect(tel.dlqCount).toBe(1); // was 2, now 1
        done();
      });
    });
  });

  it('should triage candidate support report and record resolution notes', (done) => {
    const reportId = 'rpt_001_881';
    service.triageSupportReport(reportId, 'RESOLVED', 'Updated destination URL in catalog').subscribe((updated) => {
      expect(updated.status).toBe('RESOLVED');
      expect(updated.operatorNotes).toBe('Updated destination URL in catalog');
      expect(updated.resolvedAt).toBeTruthy();
      done();
    });
  });

  it('should execute catalog reconciliation dry-run preview', (done) => {
    service.reconcileCatalog(true).subscribe((report) => {
      expect(report.scannedCount).toBe(3420);
      expect(report.dryRun).toBeTrue();
      expect(report.repairedCount).toBe(0);
      done();
    });
  });

  it('should execute zero-downtime index rebuild', (done) => {
    service.reindexCatalog().subscribe((res) => {
      expect(res.status).toBe('COMPLETED');
      expect(res.documentsIndexed).toBe(3420);
      expect(res.alias).toBe('jobs');
      done();
    });
  });

  it('should inject burst jobs in demo mode', (done) => {
    service.triggerBurst();
    service.getJobs({ limit: 50 }).subscribe(({ jobs }) => {
      const burstJobs = jobs.filter(j => j.title.startsWith('[BURST]'));
      expect(burstJobs.length).toBe(5);
      done();
    });
  });
});

// frontend-admin/src/app/core/services/live-operations.adapter.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LiveOperationsAdapter } from './live-operations.adapter';
import { AuthService } from './auth.service';

describe('LiveOperationsAdapter Contract & Serialization Integrity', () => {
  let adapter: LiveOperationsAdapter;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LiveOperationsAdapter, AuthService]
    });

    adapter = TestBed.inject(LiveOperationsAdapter);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);

    authService.loginLive('admin@seekers.internal', 'test-auth-token', 'ADMIN');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('maps privileged catalog response { items, total_count } to ModerationJob[]', () => {
    const mockEnvelope = {
      items: [
        {
          id: 'job_001',
          title: 'Senior Systems Engineer',
          company: 'bKash',
          location: 'Dhaka',
          source: 'greenhouse-feed',
          canonical_url: 'https://bkash.com/jobs/001',
          status: 'ACTIVE',
          revision: 1,
          created_at: '2026-10-30T10:00:00Z',
          updated_at: '2026-10-30T10:00:00Z',
          outbound_clicks: 12,
          provenance: {
            duplicate_count: 2,
            duplicate_hashes: ['hash_1', 'hash_2'],
            first_seen_at: '2026-10-30T09:00:00Z',
            last_verified_at: '2026-10-30T10:00:00Z',
            raw_payload_preview: '{"title":"raw"}'
          },
          raw_description: 'Job description'
        }
      ],
      total_count: 42,
      page: 1,
      limit: 10,
      next_cursor: 'page_2'
    };

    adapter.getJobs({ query: 'Engineer', source: 'greenhouse-feed', page: 1, limit: 10 }).subscribe(result => {
      expect(result.total).toBe(42);
      expect(result.jobs.length).toBe(1);
      const job = result.jobs[0];
      expect(job.id).toBe('job_001');
      expect(job.title).toBe('Senior Systems Engineer');
      expect(job.url).toBe('https://bkash.com/jobs/001');
      expect(job.provenance.duplicateCount).toBe(2);
      expect(job.provenance.duplicateHashes).toEqual(['hash_1', 'hash_2']);
    });

    const req = httpMock.expectOne(r => r.url === '/api/v1/admin/jobs');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-auth-token');
    req.flush(mockEnvelope);
  });

  it('handles paginated support queue { items, total_count } without throwing array errors', () => {
    const mockSupportResponse = {
      items: [
        {
          id: 'rep_1',
          reference_num: 'RPT-20261030-001',
          user_id: 'usr_reporter_1',
          job_id: 'job_001',
          report_type: 'BROKEN_LINK',
          description: 'Outbound link returns 404',
          contact_email: 'candidate@example.com',
          status: 'RECEIVED',
          operator_notes: 'Checking source feed',
          created_at: '2026-10-30T08:00:00Z',
          updated_at: '2026-10-30T08:00:00Z'
        }
      ],
      total_count: 1,
      next_cursor: null
    };

    adapter.getSupportReports('RECEIVED').subscribe(reports => {
      expect(reports.length).toBe(1);
      const report = reports[0];
      expect(report.id).toBe('rep_1');
      expect(report.referenceNum).toBe('RPT-20261030-001');
      expect(report.reportType).toBe('BROKEN_LINK');
      expect(report.operatorNotes).toBe('Checking source feed');
    });

    const req = httpMock.expectOne(r => r.url === '/api/v1/admin/reports');
    expect(req.request.method).toBe('GET');
    req.flush(mockSupportResponse);
  });

  it('maps snake_case dead-letter queue records to DeadLetterItem[]', () => {
    const mockDlq = [
      {
        id: 'dlq_01',
        event_type: 'job.collected.v1',
        quarantined_at: '2026-10-30T07:00:00Z',
        errors: ['Invalid salary format'],
        raw_payload: { raw: 'data' },
        status: 'QUARANTINED',
        retry_count: 2
      }
    ];

    adapter.getDeadLetters().subscribe(items => {
      expect(items.length).toBe(1);
      const item = items[0];
      expect(item.id).toBe('dlq_01');
      expect(item.eventType).toBe('job.collected.v1');
      expect(item.quarantinedAt).toBe('2026-10-30T07:00:00Z');
      expect(item.retryCount).toBe(2);
    });

    const req = httpMock.expectOne(r => r.url === '/api/v1/admin/ingestion/dead-letters');
    expect(req.request.method).toBe('GET');
    req.flush(mockDlq);
  });

  it('maps reconciliation and reindex responses accurately', () => {
    const mockReconcile = {
      scanned_mongo: 100,
      scanned_es: 98,
      missing_indexed: 2,
      stale_updated: 1,
      excess_deleted: 0,
      dry_run: true,
      errors: []
    };

    adapter.reconcileCatalog(true).subscribe(res => {
      expect(res.scannedCount).toBe(100);
      expect(res.missingInEs).toBe(2);
      expect(res.staleInEs).toBe(1);
      expect(res.dryRun).toBeTrue();
    });

    const recReq = httpMock.expectOne('/api/v1/admin/ingestion/reconcile');
    expect(recReq.request.method).toBe('POST');
    recReq.flush(mockReconcile);
  });

  it('probes all 7 services and truthful health measurements', () => {
    adapter.getHealth().subscribe(healthList => {
      expect(healthList.length).toBe(7);
      const scraper = healthList.find(h => h.service === 'service-scraper');
      const ingestion = healthList.find(h => h.service === 'service-ingestion');
      const user = healthList.find(h => h.service === 'service-user');
      const resume = healthList.find(h => h.service === 'service-resume');
      const notification = healthList.find(h => h.service === 'service-notification');
      const next = healthList.find(h => h.service === 'frontend-next');
      const admin = healthList.find(h => h.service === 'frontend-admin');

      expect(scraper?.status).toBe('HEALTHY');
      expect(ingestion?.status).toBe('HEALTHY');
      expect(user?.status).toBe('HEALTHY');
      expect(resume?.status).toBe('HEALTHY');
      expect(notification?.status).toBe('HEALTHY');
      expect(next?.status).toBe('HEALTHY');
      expect(admin?.status).toBe('HEALTHY');
    });

    httpMock.expectOne('/api/v1/admin/sources').flush([]);
    httpMock.expectOne('/api/v1/resume/health').flush({ status: 'HEALTHY' });
    httpMock.expectOne('/api/v1/users/health').flush({ status: 'HEALTHY' });
    httpMock.expectOne('/api/v1/jobs/health').flush({ status: 'HEALTHY' });
    httpMock.expectOne('/api/v1/notifications/health').flush({ status: 'HEALTHY' });
    httpMock.expectOne('/').flush('<html>Next.js</html>');
  });
});


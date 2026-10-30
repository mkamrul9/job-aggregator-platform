// frontend-admin/src/app/features/sources/sources.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SourcesComponent } from './sources.component';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { of } from 'rxjs';
import { SourceConnector } from '../../core/models/operations.models';

describe('SourcesComponent', () => {
  let component: SourcesComponent;
  let fixture: ComponentFixture<SourcesComponent>;
  let opsService: OperationsService;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [SourcesComponent],
      providers: [OperationsService, AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(SourcesComponent);
    component = fixture.componentInstance;
    opsService = TestBed.inject(OperationsService);
    authService = TestBed.inject(AuthService);
    authService.switchRole('ADMIN');
    fixture.detectChanges();
  });

  it('should create sources component', () => {
    expect(component).toBeTruthy();
  });

  it('should list registered connectors with honest permission statuses', () => {
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Greenhouse Public ATS Feed');
    expect(text).toContain('Lever Public Careers API');
    expect(text).toContain('BDJobs Tech Portal');
    expect(text).toContain('LinkedIn Bangladesh Mirror');
    expect(text).toContain('PUBLIC_API');
    expect(text).toContain('PROHIBITED');
  });

  it('should toggle pause on a connector', () => {
    const dummySource: SourceConnector = {
      id: 'greenhouse-feed',
      name: 'Greenhouse Public ATS Feed',
      url: 'https://boards-api.greenhouse.io',
      targetRegion: 'Bangladesh',
      status: 'HEALTHY',
      permissionStatus: 'PUBLIC_API',
      permissionRef: 'Terms ok',
      lastCrawledAt: 'now',
      totalCollected: 100,
      errorCount: 0,
      enabled: true,
      type: 'json_api',
      fetchBudget: { maxRps: 2, dailyLimit: 5000 }
    };

    spyOn(opsService, 'toggleSourcePause').and.returnValue(of({ ...dummySource, status: 'PAUSED' }));
    component.onTogglePause(dummySource);
    expect(opsService.toggleSourcePause).toHaveBeenCalledWith('greenhouse-feed', true);
  });

  it('should open and confirm manual crawl modal', () => {
    const dummySource: SourceConnector = {
      id: 'greenhouse-feed',
      name: 'Greenhouse Public ATS Feed',
      url: 'https://boards-api.greenhouse.io',
      targetRegion: 'Bangladesh',
      status: 'HEALTHY',
      permissionStatus: 'PUBLIC_API',
      permissionRef: 'Terms ok',
      lastCrawledAt: 'now',
      totalCollected: 100,
      errorCount: 0,
      enabled: true,
      type: 'json_api',
      fetchBudget: { maxRps: 2, dailyLimit: 5000 }
    };

    component.openCrawlModal(dummySource);
    expect(component.selectedSourceForCrawl).toBe(dummySource);

    spyOn(opsService, 'triggerCrawlRun').and.returnValue(of({
      id: 'run_test_1',
      sourceId: 'greenhouse-feed',
      sourceName: 'Greenhouse Public ATS Feed',
      trigger: 'MANUAL',
      startedAt: '12:00',
      durationMs: 1500,
      itemsCollected: 5,
      itemsRejected: 0,
      status: 'SUCCESS'
    }));

    component.confirmManualCrawl();
    expect(opsService.triggerCrawlRun).toHaveBeenCalledWith('greenhouse-feed');
    expect(component.selectedSourceForCrawl).toBeNull();
  });
});

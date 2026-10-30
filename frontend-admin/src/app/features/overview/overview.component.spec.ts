// frontend-admin/src/app/features/overview/overview.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { OverviewComponent } from './overview.component';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';

describe('OverviewComponent', () => {
  let component: OverviewComponent;
  let fixture: ComponentFixture<OverviewComponent>;
  let opsService: OperationsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RouterModule.forRoot([]),
        HttpClientTestingModule
      ],
      declarations: [OverviewComponent],
      providers: [OperationsService, AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(OverviewComponent);
    component = fixture.componentInstance;
    opsService = TestBed.inject(OperationsService);
    fixture.detectChanges();
  });

  it('should create overview component', () => {
    expect(component).toBeTruthy();
  });

  it('should render telemetry KPI cards and 7-service fleet table', () => {
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Active Connectors');
    expect(text).toContain('Ingestion Throughput');
    expect(text).toContain('Dead Letter Queue');
    expect(text).toContain('Platform Services Fleet Topology');
    expect(text).toContain('Go Collector Daemon');
    expect(text).toContain('Node Ingestion Worker');
    expect(text).toContain('MongoDB Canonical Catalog');
    expect(text).toContain('Elasticsearch 8 Index');
  });

  it('should trigger burst from overview quick actions', () => {
    spyOn(opsService, 'triggerBurst');
    component.onTriggerBurst();
    expect(opsService.triggerBurst).toHaveBeenCalled();
  });
});

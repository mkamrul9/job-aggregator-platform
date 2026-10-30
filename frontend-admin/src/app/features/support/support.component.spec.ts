// frontend-admin/src/app/features/support/support.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SupportComponent } from './support.component';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { SupportReport } from '../../core/models/operations.models';

describe('SupportComponent', () => {
  let component: SupportComponent;
  let fixture: ComponentFixture<SupportComponent>;
  let opsService: OperationsService;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [SupportComponent],
      providers: [OperationsService, AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(SupportComponent);
    component = fixture.componentInstance;
    opsService = TestBed.inject(OperationsService);
    authService = TestBed.inject(AuthService);
    authService.switchRole('OPERATOR');
    fixture.detectChanges();
  });

  it('should create support component', () => {
    expect(component).toBeTruthy();
  });

  it('should display candidate support reports', () => {
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Candidate Support & Listing Triage Queue');
    expect(text).toContain('RPT-20261028-1001');
    expect(text).toContain('BROKEN_LINK');
  });

  it('should open triage modal and save report status resolution', fakeAsync(() => {
    const dummyReport: SupportReport = {
      id: 'rpt_001_881',
      referenceNum: 'RPT-20261028-1001',
      reportType: 'BROKEN_LINK',
      description: 'Link 404',
      status: 'RECEIVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    component.openTriageModal(dummyReport);
    expect(component.selectedReportForTriage).toBe(dummyReport);

    component.triageTargetStatus = 'RESOLVED';
    component.triageNotes = 'Fixed URL link';

    component.saveTriage();
    tick(500);
    expect(component.selectedReportForTriage).toBeNull();
    flush();
  }));
});

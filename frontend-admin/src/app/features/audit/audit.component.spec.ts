// frontend-admin/src/app/features/audit/audit.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AuditComponent } from './audit.component';
import { OperationsService } from '../../core/services/operations.service';
import { AuditLogEntry } from '../../core/models/operations.models';

describe('AuditComponent', () => {
  let component: AuditComponent;
  let fixture: ComponentFixture<AuditComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [AuditComponent],
      providers: [OperationsService]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create audit component', () => {
    expect(component).toBeTruthy();
  });

  it('should render audit table and action filters', () => {
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Privileged Operations Audit Log');
    expect(text).toContain('farhan.admin@seekers.internal');
    expect(text).toContain('SOURCE_PAUSED');
  });

  it('should filter logs by action and search query', () => {
    const sampleLogs: AuditLogEntry[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        actor: { id: 'u1', email: 'admin@seekers.internal', role: 'ADMIN' },
        action: 'SOURCE_PAUSED',
        targetType: 'SOURCE',
        targetId: 'greenhouse',
        result: 'SUCCESS'
      },
      {
        id: '2',
        timestamp: new Date().toISOString(),
        actor: { id: 'u2', email: 'ops@seekers.internal', role: 'OPERATOR' },
        action: 'JOB_EXPIRED',
        targetType: 'JOB',
        targetId: 'job-123',
        result: 'SUCCESS'
      }
    ];

    component.selectedAction = 'SOURCE';
    const filteredByAction = component.getFilteredLogs(sampleLogs);
    expect(filteredByAction.length).toBe(1);
    expect(filteredByAction[0].action).toBe('SOURCE_PAUSED');

    component.selectedAction = 'ALL';
    component.searchQuery = 'job-123';
    const filteredByQuery = component.getFilteredLogs(sampleLogs);
    expect(filteredByQuery.length).toBe(1);
    expect(filteredByQuery[0].targetId).toBe('job-123');
  });

  it('should open and close state transition diff modal', () => {
    const dummyLog: AuditLogEntry = {
      id: 'diff_log_1',
      timestamp: new Date().toISOString(),
      actor: { id: 'u1', email: 'admin@seekers.internal', role: 'ADMIN' },
      action: 'JOB_FLAGGED',
      targetType: 'JOB',
      targetId: 'job-99',
      result: 'SUCCESS',
      beforeState: { status: 'ACTIVE' },
      afterState: { status: 'FLAGGED' }
    };

    component.inspectEntry(dummyLog);
    expect(component.selectedLogEntry).toBe(dummyLog);

    component.closeModal();
    expect(component.selectedLogEntry).toBeNull();
  });
});

// frontend-admin/src/app/features/queues/queues.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { QueuesComponent } from './queues.component';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { DeadLetterItem } from '../../core/models/operations.models';

describe('QueuesComponent', () => {
  let component: QueuesComponent;
  let fixture: ComponentFixture<QueuesComponent>;
  let opsService: OperationsService;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [QueuesComponent],
      providers: [OperationsService, AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(QueuesComponent);
    component = fixture.componentInstance;
    opsService = TestBed.inject(OperationsService);
    authService = TestBed.inject(AuthService);
    authService.switchRole('ADMIN');
    fixture.detectChanges();
  });

  it('should create queues component', () => {
    expect(component).toBeTruthy();
  });

  it('should render Kafka lag and DLQ table', () => {
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent || '';
    expect(text).toContain('Kafka Topic Partition Lag');
    expect(text).toContain('Quarantined Dead-Letter Queue (DLQ)');
    expect(text).toContain('job.collected.v1');
    expect(text).toContain('mongo-ingestion-group');
  });

  it('should inspect DLQ item', () => {
    const dummyDlq: DeadLetterItem = {
      id: 'dlq_test_1',
      eventType: 'job.collected.v1',
      quarantinedAt: new Date().toISOString(),
      errors: ['Schema validation failed'],
      rawPayload: { title: 'Poison job' },
      status: 'QUARANTINED',
      retryCount: 0
    };

    component.onInspectDlq(dummyDlq);
    expect(component.selectedDlqItem).toBe(dummyDlq);

    component.closeDlqModal();
    expect(component.selectedDlqItem).toBeNull();
  });

  it('should replay quarantined DLQ item', () => {
    const dummyDlq: DeadLetterItem = {
      id: 'dlq_poison_8841',
      eventType: 'job.collected.v1',
      quarantinedAt: new Date().toISOString(),
      errors: ['Invalid salary'],
      rawPayload: {},
      status: 'QUARANTINED',
      retryCount: 0
    };

    spyOn(opsService, 'replayDeadLetter').and.callThrough();
    component.onReplayDlq(dummyDlq);
    expect(opsService.replayDeadLetter).toHaveBeenCalledWith('dlq_poison_8841');
  });

  it('should execute catalog reconciliation dry-run', () => {
    spyOn(opsService, 'reconcileCatalog').and.callThrough();
    component.reconcileDryRun = true;
    component.onTriggerReconcile();
    expect(opsService.reconcileCatalog).toHaveBeenCalledWith(true);
  });
});

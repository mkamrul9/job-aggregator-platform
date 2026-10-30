// frontend-admin/src/app/features/queues/queues.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, takeUntil } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import {
  QueueMetrics,
  DeadLetterItem,
  ReconcileReport,
  ReindexResult
} from '../../core/models/operations.models';

@Component({
  selector: 'app-queues',
  templateUrl: './queues.component.html',
  styleUrls: ['./queues.component.scss'],
  standalone: false
})
export class QueuesComponent implements OnInit, OnDestroy {
  metrics$!: Observable<QueueMetrics>;
  deadLetters$!: Observable<DeadLetterItem[]>;

  selectedDlqItem: DeadLetterItem | null = null;
  reconcileDryRun = true;
  reconcileReport: ReconcileReport | null = null;
  reindexResult: ReindexResult | null = null;

  isReconciling = false;
  isReindexing = false;
  isReplaying = false;
  statusMessage = '';

  private destroy$ = new Subject<void>();
  private notificationTimer: any = null;

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.metrics$ = this.opsService.getQueueMetrics();
    this.deadLetters$ = this.opsService.getDeadLetters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
  }

  onInspectDlq(item: DeadLetterItem): void {
    this.selectedDlqItem = item;
  }

  closeDlqModal(): void {
    this.selectedDlqItem = null;
  }

  onReplayDlq(item: DeadLetterItem): void {
    if (!this.authService.canMutate()) {
      alert('Read-only session: DLQ replay is disabled.');
      return;
    }
    this.isReplaying = true;
    this.opsService.replayDeadLetter(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isReplaying = false;
        this.statusMessage = res.message;
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 5000);
      },
      error: (err) => {
        this.isReplaying = false;
        alert(`Failed to replay dead letter: ${err.message}`);
      }
    });
  }

  onDiscardDlq(item: DeadLetterItem): void {
    if (!this.authService.canMutate()) {
      alert('Read-only session: DLQ discard is disabled.');
      return;
    }
    if (!confirm(`Are you sure you want to permanently discard poison message ${item.id}?`)) {
      return;
    }
    this.opsService.discardDeadLetter(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.statusMessage = `Poison message ${item.id} discarded.`;
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 4000);
      },
      error: (err) => {
        alert(`Failed to discard message: ${err.message}`);
      }
    });
  }

  onTriggerReconcile(): void {
    this.triggerReconcile();
  }

  onTriggerReindex(): void {
    this.triggerReindex();
  }

  triggerReconcile(): void {
    if (!this.authService.isAdmin()) {
      alert('Admin privilege required to trigger catalog reconciliation.');
      return;
    }
    this.isReconciling = true;
    this.reconcileReport = null;

    this.opsService.reconcileCatalog(this.reconcileDryRun).pipe(takeUntil(this.destroy$)).subscribe({
      next: (report) => {
        this.isReconciling = false;
        this.reconcileReport = report;
        this.statusMessage = `Reconciliation finished: scanned ${report.scannedCount}, repaired ${report.repairedCount} items.`;
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 6000);
      },
      error: (err) => {
        this.isReconciling = false;
        alert(`Reconciliation failed: ${err.message}`);
      }
    });
  }

  triggerReindex(): void {
    if (!this.authService.isAdmin()) {
      alert('Admin privilege required to trigger zero-downtime reindexing.');
      return;
    }
    if (!confirm('Rebuilding the index creates a new versioned Elasticsearch index and executes an atomic alias swap upon verification. Proceed?')) {
      return;
    }

    this.isReindexing = true;
    this.reindexResult = null;

    this.opsService.reindexCatalog().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isReindexing = false;
        this.reindexResult = res;
        this.statusMessage = `Index rebuilt and alias swapped to ${res.targetIndex}: ${res.documentsIndexed} documents verified in ${res.durationMs}ms.`;
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 7000);
      },
      error: (err) => {
        this.isReindexing = false;
        alert(`Reindexing failed: ${err.message}`);
      }
    });
  }
}

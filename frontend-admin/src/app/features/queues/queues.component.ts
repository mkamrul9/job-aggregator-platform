// frontend-admin/src/app/features/queues/queues.component.ts
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
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
  styleUrls: ['./queues.component.scss']
})
export class QueuesComponent implements OnInit {
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

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.metrics$ = this.opsService.getQueueMetrics();
    this.deadLetters$ = this.opsService.getDeadLetters();
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
    this.opsService.replayDeadLetter(item.id).subscribe({
      next: (res) => {
        this.isReplaying = false;
        this.statusMessage = res.message;
        setTimeout(() => this.statusMessage = '', 5000);
      },
      error: (err) => {
        this.isReplaying = false;
        alert(`Replay failed: ${err.message}`);
      }
    });
  }

  onDiscardDlq(item: DeadLetterItem): void {
    if (!this.authService.canMutate()) {
      alert('Read-only session: discarding dead letters is disabled.');
      return;
    }
    if (!confirm(`Are you sure you want to discard dead letter ${item.id}?`)) return;

    this.opsService.discardDeadLetter(item.id).subscribe({
      next: () => {
        this.statusMessage = `Dead letter ${item.id} discarded.`;
        setTimeout(() => this.statusMessage = '', 4000);
      },
      error: (err) => alert(`Discard failed: ${err.message}`)
    });
  }

  onTriggerReconcile(): void {
    if (!this.authService.canMutate()) {
      alert('Read-only session: reconciliation is disabled.');
      return;
    }
    this.isReconciling = true;
    this.reconcileReport = null;

    this.opsService.reconcileCatalog(this.reconcileDryRun).subscribe({
      next: (report) => {
        this.isReconciling = false;
        this.reconcileReport = report;
        this.statusMessage = `Catalog reconciliation finished. Scanned: ${report.scannedCount}, Repaired: ${report.repairedCount}.`;
        setTimeout(() => this.statusMessage = '', 5000);
      },
      error: (err) => {
        this.isReconciling = false;
        alert(`Reconciliation failed: ${err.message}`);
      }
    });
  }

  onTriggerReindex(): void {
    if (!this.authService.isAdmin()) {
      alert('Reindex requires ADMIN role permissions.');
      return;
    }
    if (!confirm('Initiate zero-downtime Elasticsearch index rebuild with atomic alias swap?')) return;

    this.isReindexing = true;
    this.reindexResult = null;

    this.opsService.reindexCatalog().subscribe({
      next: (result) => {
        this.isReindexing = false;
        this.reindexResult = result;
        this.statusMessage = `Reindex succeeded: ${result.documentsIndexed} docs in ${result.durationMs}ms.`;
        setTimeout(() => this.statusMessage = '', 5000);
      },
      error: (err) => {
        this.isReindexing = false;
        alert(`Reindex failed: ${err.message}`);
      }
    });
  }
}

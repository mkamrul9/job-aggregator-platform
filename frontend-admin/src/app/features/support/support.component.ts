// frontend-admin/src/app/features/support/support.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, takeUntil } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { SupportReport } from '../../core/models/operations.models';

@Component({
  selector: 'app-support',
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.scss'],
  standalone: false
})
export class SupportComponent implements OnInit, OnDestroy {
  reports$!: Observable<SupportReport[]>;
  selectedStatus = 'ALL';

  selectedReportForTriage: SupportReport | null = null;
  triageTargetStatus: 'RECEIVED' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED' = 'RESOLVED';
  triageNotes = '';
  statusMessage = '';

  private destroy$ = new Subject<void>();
  private notificationTimer: any = null;

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
  }

  loadReports(): void {
    this.reports$ = this.opsService.getSupportReports(this.selectedStatus);
  }

  onStatusFilterChange(): void {
    this.loadReports();
  }

  openTriageModal(report: SupportReport): void {
    if (!this.authService.canMutate()) {
      alert('Read-only session: triaging support reports is disabled.');
      return;
    }
    this.selectedReportForTriage = report;
    this.triageTargetStatus = report.status === 'RECEIVED' ? 'IN_REVIEW' : 'RESOLVED';
    this.triageNotes = report.operatorNotes || '';
  }

  closeTriageModal(): void {
    this.selectedReportForTriage = null;
    this.triageNotes = '';
  }

  saveTriage(): void {
    if (!this.selectedReportForTriage) return;
    const report = this.selectedReportForTriage;

    this.opsService.triageSupportReport(report.id, this.triageTargetStatus, this.triageNotes).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.statusMessage = `Report ${updated.referenceNum} updated to ${updated.status}.`;
        this.closeTriageModal();
        this.loadReports();
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 4000);
      },
      error: (err) => {
        alert(`Failed to triage report: ${err.message}`);
      }
    });
  }
}

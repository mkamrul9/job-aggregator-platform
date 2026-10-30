// frontend-admin/src/app/features/catalog/catalog.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { ModerationJob } from '../../core/models/operations.models';

@Component({
  selector: 'app-catalog',
  templateUrl: './catalog.component.html',
  styleUrls: ['./catalog.component.scss'],
  standalone: false
})
export class CatalogComponent implements OnInit, OnDestroy {
  jobs: ModerationJob[] = [];
  totalJobs = 0;
  isLoading = false;

  searchQuery = '';
  selectedSource = 'ALL';
  selectedStatus = 'ALL';
  currentPage = 1;
  pageSize = 10;

  selectedJobForInspection: ModerationJob | null = null;
  selectedJobForAction: { job: ModerationJob; action: 'EXPIRE' | 'FLAG' | 'UNFLAG' | 'HIDE' | 'RESTORE' } | null = null;
  moderationReason = '';
  statusMessage = '';

  private destroy$ = new Subject<void>();
  private notificationTimer: any = null;

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadJobs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
  }

  loadJobs(): void {
    this.isLoading = true;
    this.opsService.getJobs({
      query: this.searchQuery,
      source: this.selectedSource,
      status: this.selectedStatus,
      page: this.currentPage,
      limit: this.pageSize
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.jobs = res.jobs;
        this.totalJobs = res.total;
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        alert(`Failed to load jobs: ${err.message}`);
      }
    });
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.loadJobs();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadJobs();
  }

  nextPage(): void {
    if (this.currentPage * this.pageSize < this.totalJobs) {
      this.currentPage++;
      this.loadJobs();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadJobs();
    }
  }

  onInspect(job: ModerationJob): void {
    this.selectedJobForInspection = job;
  }

  closeInspection(): void {
    this.selectedJobForInspection = null;
  }

  promptAction(job: ModerationJob, action: 'EXPIRE' | 'FLAG' | 'UNFLAG' | 'HIDE' | 'RESTORE'): void {
    if (!this.authService.canMutate()) {
      alert('Read-only mode: moderation actions are disabled.');
      return;
    }
    this.selectedJobForAction = { job, action };
    this.moderationReason = '';
  }

  closeActionModal(): void {
    this.selectedJobForAction = null;
    this.moderationReason = '';
  }

  confirmModerationAction(): void {
    if (!this.selectedJobForAction) return;
    const { job, action } = this.selectedJobForAction;
    const reason = this.moderationReason.trim() || `Administrative ${action} executed by ${this.authService.currentUser?.name || 'Operator'}`;

    this.opsService.moderateJob(job.id, action, reason).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.statusMessage = `Job "${updated.title}" marked as ${updated.status}.`;
        this.closeActionModal();
        this.loadJobs();
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 4000);
      },
      error: (err) => {
        alert(`Failed to moderate job: ${err.message}`);
      }
    });
  }
}

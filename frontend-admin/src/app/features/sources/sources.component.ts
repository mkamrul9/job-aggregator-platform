// frontend-admin/src/app/features/sources/sources.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, takeUntil } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { SourceConnector, CrawlRun } from '../../core/models/operations.models';

@Component({
  selector: 'app-sources',
  templateUrl: './sources.component.html',
  styleUrls: ['./sources.component.scss'],
  standalone: false
})
export class SourcesComponent implements OnInit, OnDestroy {
  sources$!: Observable<SourceConnector[]>;
  crawlRuns$!: Observable<CrawlRun[]>;

  selectedSourceForCrawl: SourceConnector | null = null;
  crawlInProgress = false;
  statusMessage = '';

  private destroy$ = new Subject<void>();
  private notificationTimer: any = null;

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.sources$ = this.opsService.getSources();
    this.crawlRuns$ = this.opsService.getCrawlRuns();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
  }

  onTogglePause(source: SourceConnector): void {
    if (!this.authService.canMutate()) {
      alert('Read-only mode: mutating source state is disabled.');
      return;
    }
    const isPaused = source.status === 'PAUSED';
    this.opsService.toggleSourcePause(source.id, !isPaused).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.statusMessage = `Source "${updated.name}" is now ${updated.status}.`;
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 4000);
      },
      error: (err) => {
        alert(`Failed to update source: ${err.message}`);
      }
    });
  }

  openCrawlModal(source: SourceConnector): void {
    this.selectedSourceForCrawl = source;
  }

  closeCrawlModal(): void {
    this.selectedSourceForCrawl = null;
  }

  confirmManualCrawl(): void {
    if (!this.selectedSourceForCrawl) return;
    if (!this.authService.canMutate()) {
      alert('Read-only mode: triggering crawl is disabled.');
      return;
    }

    const source = this.selectedSourceForCrawl;
    this.crawlInProgress = true;

    this.opsService.triggerCrawlRun(source.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (run) => {
        this.crawlInProgress = false;
        this.closeCrawlModal();
        this.statusMessage = `Crawl completed for "${source.name}": collected ${run.itemsCollected} jobs in ${run.durationMs}ms.`;
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => this.statusMessage = '', 5000);
      },
      error: (err) => {
        this.crawlInProgress = false;
        alert(`Crawl failed: ${err.message}`);
      }
    });
  }
}

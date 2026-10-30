// frontend-admin/src/app/features/sources/sources.component.ts
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';
import { SourceConnector, CrawlRun } from '../../core/models/operations.models';

@Component({
  selector: 'app-sources',
  templateUrl: './sources.component.html',
  styleUrls: ['./sources.component.scss']
})
export class SourcesComponent implements OnInit {
  sources$!: Observable<SourceConnector[]>;
  crawlRuns$!: Observable<CrawlRun[]>;

  selectedSourceForCrawl: SourceConnector | null = null;
  crawlInProgress = false;
  statusMessage = '';

  constructor(
    public opsService: OperationsService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.sources$ = this.opsService.getSources();
    this.crawlRuns$ = this.opsService.getCrawlRuns();
  }

  onTogglePause(source: SourceConnector): void {
    if (!this.authService.canMutate()) {
      alert('Read-only mode: mutating source state is disabled.');
      return;
    }
    const isPaused = source.status === 'PAUSED';
    this.opsService.toggleSourcePause(source.id, !isPaused).subscribe({
      next: (updated) => {
        this.statusMessage = `Source "${updated.name}" is now ${updated.status}.`;
        setTimeout(() => this.statusMessage = '', 4000);
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

    this.opsService.triggerCrawlRun(source.id).subscribe({
      next: (run) => {
        this.crawlInProgress = false;
        this.closeCrawlModal();
        this.statusMessage = `Crawl completed for "${source.name}": collected ${run.itemsCollected} jobs in ${run.durationMs}ms.`;
        setTimeout(() => this.statusMessage = '', 5000);
      },
      error: (err) => {
        this.crawlInProgress = false;
        alert(`Crawl failed: ${err.message}`);
      }
    });
  }
}

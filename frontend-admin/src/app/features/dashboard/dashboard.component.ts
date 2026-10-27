import { Component, OnInit } from '@angular/core';
import {
  LiveFeedService,
  LiveJob,
  CrawlerSource,
  PipelineMetrics,
  ConnectionState
} from '../../core/services/live-feed.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  liveJobs$!: Observable<LiveJob[]>;
  sources$!: Observable<CrawlerSource[]>;
  metrics$!: Observable<PipelineMetrics>;
  connectionState$!: Observable<ConnectionState>;

  searchQuery = '';
  selectedSource = 'ALL';
  selectedJobForInspection: LiveJob | null = null;

  constructor(private liveFeedService: LiveFeedService) {}

  ngOnInit(): void {
    this.liveJobs$ = this.liveFeedService.getLiveJobs();
    this.sources$ = this.liveFeedService.getCrawlerSources();
    this.metrics$ = this.liveFeedService.getPipelineMetrics();
    this.connectionState$ = this.liveFeedService.getConnectionState();
  }

  getFilteredJobs(jobs: LiveJob[] | null): LiveJob[] {
    if (!jobs) return [];
    return jobs.filter((job) => {
      if (this.selectedSource !== 'ALL' && job.source !== this.selectedSource) {
        return false;
      }
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(q);
        const matchesCompany = job.company.toLowerCase().includes(q);
        const matchesSource = job.source.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCompany && !matchesSource) return false;
      }
      return true;
    });
  }

  onInspectJob(job: LiveJob): void {
    this.selectedJobForInspection = job;
  }

  onCloseInspection(): void {
    this.selectedJobForInspection = null;
  }

  onToggleSource(sourceId: string): void {
    this.liveFeedService.toggleSourceStatus(sourceId);
  }

  onTriggerBurst(): void {
    this.liveFeedService.triggerBurst();
  }

  onManualReconnect(): void {
    this.liveFeedService.resetDemo();
  }

  getPayloadJson(job: LiveJob): string {
    const payload = {
      event_id: `evt_${job.id}`,
      event_type: 'job.ingested.v1',
      producer: 'service-ingestion',
      timestamp: new Date().toISOString(),
      correlation_id: `corr_${job.id}`,
      data: {
        job_id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        source: job.source,
        canonical_url: job.url,
        ingestion_latency_ms: job.latency_ms,
        status: job.status,
        raw_description_preview: job.raw_description || 'Extracted via crawler worker.'
      }
    };
    return JSON.stringify(payload, null, 2);
  }
}

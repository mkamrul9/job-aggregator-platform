import { Component, OnInit } from '@angular/core';
import { LiveFeedService, LiveJob } from '../../core/services/live-feed.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  liveJobs$!: Observable<LiveJob[]>;

  constructor(private liveFeedService: LiveFeedService) {}

  ngOnInit(): void {
    // Subscribe the component to the RxJS stream
    this.liveJobs$ = this.liveFeedService.getLiveJobs();
  }
}

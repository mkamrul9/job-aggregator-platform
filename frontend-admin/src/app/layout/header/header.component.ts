import { Component } from '@angular/core';
import { LiveFeedService, ConnectionState } from '../../core/services/live-feed.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html'
})
export class HeaderComponent {
  connectionState$: Observable<ConnectionState>;
  isPaused = false;

  constructor(private liveFeedService: LiveFeedService) {
    this.connectionState$ = this.liveFeedService.getConnectionState();
  }

  onTriggerBurst(): void {
    this.liveFeedService.triggerBurst();
  }

  onTogglePause(): void {
    this.isPaused = this.liveFeedService.togglePauseStream();
  }

  onSimulateDisconnect(): void {
    this.liveFeedService.simulateDisconnect();
  }

  onResetDemo(): void {
    this.isPaused = false;
    this.liveFeedService.resetDemo();
  }
}

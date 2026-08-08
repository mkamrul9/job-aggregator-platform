import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';

export interface LiveJob {
  Title: string;
  Company: string;
  URL: string;
  ScrapedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LiveFeedService {
  private socket: Socket;
  
  // RxJS BehaviorSubject holds the current state of our jobs array
  private jobsSubject = new BehaviorSubject<LiveJob[]>([]);
  
  constructor() {
    // Connect to the Express/Socket.io server
    this.socket = io('http://localhost:4000');

    // Listen for the specific event we emit from the backend
    this.socket.on('live-job-feed', (job: LiveJob) => {
      job.ScrapedAt = new Date().toLocaleTimeString();
      const currentJobs = this.jobsSubject.getValue();
      
      // Add the new job to the top of the list and keep only the latest 50
      this.jobsSubject.next([job, ...currentJobs].slice(0, 50));
    });
  }

  // Expose the data as an Observable for components to subscribe to
  getLiveJobs(): Observable<LiveJob[]> {
    return this.jobsSubject.asObservable();
  }
}

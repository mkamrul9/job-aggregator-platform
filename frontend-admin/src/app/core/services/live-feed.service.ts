import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';

export interface LiveJob {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  latency_ms: number;
  scraped_at: string;
  status: 'INGESTED' | 'PROCESSED' | 'INDEXED';
  raw_description?: string;
}

export interface CrawlerSource {
  id: string;
  name: string;
  url: string;
  target_region: string;
  status: 'HEALTHY' | 'DEGRADED' | 'PAUSED';
  last_crawled_at: string;
  total_collected: number;
  error_count: number;
}

export interface PipelineMetrics {
  active_scrapers: number;
  total_scrapers: number;
  throughput_hourly: number;
  avg_latency_ms: number;
  kafka_lag_ms: number;
  dlq_count: number;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'paused' | 'disconnected';

const INITIAL_SOURCES: CrawlerSource[] = [
  {
    id: 'src_bdjobs',
    name: 'BDJobs Technology Portal',
    url: 'https://jobs.bdjobs.com',
    target_region: 'Dhaka, Chattogram',
    status: 'HEALTHY',
    last_crawled_at: '2 mins ago',
    total_collected: 1842,
    error_count: 0
  },
  {
    id: 'src_linkedin_bd',
    name: 'LinkedIn Bangladesh Tech Feed',
    url: 'https://linkedin.com/jobs',
    target_region: 'Bangladesh (Hybrid & Onsite)',
    status: 'HEALTHY',
    last_crawled_at: '6 mins ago',
    total_collected: 940,
    error_count: 0
  },
  {
    id: 'src_chaldal',
    name: 'Chaldal Careers Direct Feed',
    url: 'https://careers.chaldal.com',
    target_region: 'Gulshan, Dhaka',
    status: 'HEALTHY',
    last_crawled_at: '14 mins ago',
    total_collected: 124,
    error_count: 0
  },
  {
    id: 'src_pathao',
    name: 'Pathao Engineering Pipeline',
    url: 'https://pathao.com/careers',
    target_region: 'Dhanmondi, Dhaka',
    status: 'HEALTHY',
    last_crawled_at: '18 mins ago',
    total_collected: 86,
    error_count: 0
  },
  {
    id: 'src_glassdoor_bd',
    name: 'Glassdoor Regional Mirror',
    url: 'https://glassdoor.com',
    target_region: 'South Asia Remote',
    status: 'DEGRADED',
    last_crawled_at: '45 mins ago',
    total_collected: 412,
    error_count: 3
  }
];

const SAMPLE_BURST_JOBS: Omit<LiveJob, 'id' | 'scraped_at' | 'latency_ms'>[] = [
  {
    title: 'Senior Distributed Systems Engineer (Go/Kafka)',
    company: 'bKash Limited',
    location: 'Kawran Bazar, Dhaka',
    source: 'bdjobs',
    url: 'https://jobs.bdjobs.com/bkash-dist-sys',
    status: 'INGESTED',
    raw_description: 'Architect multi-partition Kafka clusters for payment settlement pipelines.'
  },
  {
    title: 'Senior Mobile Engineer (Android/Kotlin)',
    company: 'Pathao',
    location: 'Dhanmondi, Dhaka',
    source: 'pathao-careers',
    url: 'https://pathao.com/careers/android-sr',
    status: 'INDEXED',
    raw_description: 'Lead Jetpack Compose UI migration for consumer ride-sharing services.'
  },
  {
    title: 'Staff Fullstack Architect (Next.js & Node)',
    company: 'ShopUp',
    location: 'Banani, Dhaka',
    source: 'linkedin-bd',
    url: 'https://linkedin.com/jobs/shopup-staff-architect',
    status: 'PROCESSED',
    raw_description: 'Build B2B merchant logistics portal with offline-first PWA sync.'
  },
  {
    title: 'Cloud Security & DevOps Specialist',
    company: 'Brain Station 23',
    location: 'Mohakhali, Dhaka',
    source: 'bdjobs',
    url: 'https://brainstation-23.com/careers/devops',
    status: 'INDEXED',
    raw_description: 'Provision AWS Terraform infrastructure and monitor multi-region clusters.'
  },
  {
    title: 'Frontend Engineer (React & TypeScript)',
    company: 'Optimizely Dhaka',
    location: 'Tejgaon I/A, Dhaka',
    source: 'linkedin-bd',
    url: 'https://optimizely.com/dhaka/frontend',
    status: 'INGESTED',
    raw_description: 'Maintain accessible design system components and core web vitals telemetry.'
  }
];

@Injectable({
  providedIn: 'root'
})
export class LiveFeedService implements OnDestroy {
  private socket?: Socket;
  
  // State subjects
  private jobsSubject = new BehaviorSubject<LiveJob[]>([]);
  private sourcesSubject = new BehaviorSubject<CrawlerSource[]>(INITIAL_SOURCES);
  private connectionSubject = new BehaviorSubject<ConnectionState>('connected');
  private metricsSubject = new BehaviorSubject<PipelineMetrics>({
    active_scrapers: 4,
    total_scrapers: 5,
    throughput_hourly: 142,
    avg_latency_ms: 18,
    kafka_lag_ms: 12,
    dlq_count: 0
  });

  private simulationSub?: Subscription;
  private isPaused = false;
  private burstCounter = 0;

  constructor() {
    this.initFeed();
  }

  ngOnDestroy(): void {
    this.simulationSub?.unsubscribe();
    this.socket?.disconnect();
  }

  private initFeed(): void {
    // Attempt real socket connection; graceful fallback to synthetic stream
    try {
      this.socket = io('http://localhost:4000', {
        timeout: 3000,
        reconnectionAttempts: 2
      });

      this.socket.on('connect', () => {
        this.connectionSubject.next('connected');
      });

      this.socket.on('disconnect', () => {
        // Fall back seamlessly to standalone simulation mode
        this.startSyntheticStream();
      });

      this.socket.on('live-job-feed', (job: LiveJob) => {
        this.pushJob(job);
      });

      this.socket.on('connect_error', () => {
        // Backend offline -> run synthetic portfolio simulation
        this.startSyntheticStream();
      });
    } catch {
      this.startSyntheticStream();
    }

    // Populate initial baseline jobs so dashboard is immediately reviewable
    this.seedInitialJobs();
  }

  private seedInitialJobs(): void {
    const initialJobs: LiveJob[] = SAMPLE_BURST_JOBS.map((j, i) => ({
      ...j,
      id: `job_init_${i + 1}`,
      latency_ms: 12 + Math.floor(Math.random() * 20),
      scraped_at: new Date(Date.now() - (i * 180000)).toLocaleTimeString()
    }));
    this.jobsSubject.next(initialJobs);
  }

  private startSyntheticStream(): void {
    if (this.simulationSub) return;

    // Periodically ingest a synthetic job every 10 seconds unless paused
    this.simulationSub = interval(10000).subscribe(() => {
      if (!this.isPaused && this.connectionSubject.getValue() === 'connected') {
        this.injectRandomJob();
      }
    });
  }

  private injectRandomJob(): void {
    const template = SAMPLE_BURST_JOBS[Math.floor(Math.random() * SAMPLE_BURST_JOBS.length)];
    const newJob: LiveJob = {
      ...template,
      id: `job_synth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      latency_ms: 10 + Math.floor(Math.random() * 25),
      scraped_at: new Date().toLocaleTimeString()
    };
    this.pushJob(newJob);

    // Update hourly throughput metric
    const currentMetrics = this.metricsSubject.getValue();
    this.metricsSubject.next({
      ...currentMetrics,
      throughput_hourly: currentMetrics.throughput_hourly + 1
    });
  }

  private pushJob(job: LiveJob): void {
    const current = this.jobsSubject.getValue();
    this.jobsSubject.next([job, ...current].slice(0, 50));
  }

  // Public Observables
  getLiveJobs(): Observable<LiveJob[]> {
    return this.jobsSubject.asObservable();
  }

  getCrawlerSources(): Observable<CrawlerSource[]> {
    return this.sourcesSubject.asObservable();
  }

  getConnectionState(): Observable<ConnectionState> {
    return this.connectionSubject.asObservable();
  }

  getPipelineMetrics(): Observable<PipelineMetrics> {
    return this.metricsSubject.asObservable();
  }

  // Interactive Operator Actions
  triggerBurst(): void {
    this.burstCounter++;
    SAMPLE_BURST_JOBS.forEach((sample, idx) => {
      setTimeout(() => {
        const burstJob: LiveJob = {
          ...sample,
          id: `burst_${this.burstCounter}_${idx + 1}`,
          title: `[BURST] ${sample.title}`,
          latency_ms: 8 + Math.floor(Math.random() * 15),
          scraped_at: new Date().toLocaleTimeString()
        };
        this.pushJob(burstJob);
      }, idx * 250);
    });

    const m = this.metricsSubject.getValue();
    this.metricsSubject.next({
      ...m,
      throughput_hourly: m.throughput_hourly + SAMPLE_BURST_JOBS.length
    });
  }

  togglePauseStream(): boolean {
    this.isPaused = !this.isPaused;
    this.connectionSubject.next(this.isPaused ? 'paused' : 'connected');
    return this.isPaused;
  }

  toggleSourceStatus(sourceId: string): void {
    const sources = this.sourcesSubject.getValue().map((s) => {
      if (s.id === sourceId) {
        const nextStatus = s.status === 'PAUSED' ? 'HEALTHY' : 'PAUSED';
        return { ...s, status: nextStatus as CrawlerSource['status'] };
      }
      return s;
    });
    this.sourcesSubject.next(sources);

    const activeCount = sources.filter(s => s.status === 'HEALTHY').length;
    const m = this.metricsSubject.getValue();
    this.metricsSubject.next({ ...m, active_scrapers: activeCount });
  }

  simulateDisconnect(): void {
    this.connectionSubject.next('disconnected');
    setTimeout(() => {
      this.connectionSubject.next('reconnecting');
      setTimeout(() => {
        this.connectionSubject.next('connected');
      }, 2000);
    }, 2000);
  }

  resetDemo(): void {
    this.isPaused = false;
    this.connectionSubject.next('connected');
    this.sourcesSubject.next(INITIAL_SOURCES);
    this.metricsSubject.next({
      active_scrapers: 4,
      total_scrapers: 5,
      throughput_hourly: 142,
      avg_latency_ms: 18,
      kafka_lag_ms: 12,
      dlq_count: 0
    });
    this.seedInitialJobs();
  }
}

/**
 * evaluations/mobile/shared-contracts/index.ts
 * Shared API contracts and data models for mobile prototype evaluation.
 * Sourced directly from OpenAPI 3.1 specification (contracts/openapi/seekers-api-v1.yaml).
 */

export interface MobileJobSummary {
  id: string;
  title: string;
  company: string;
  location: string;
  remoteType: 'REMOTE' | 'HYBRID' | 'ONSITE';
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  postedAt: string;
  sourceUrl: string;
  isSaved?: boolean;
}

export interface MobileJobDetail extends MobileJobSummary {
  description: string;
  requirements: string[];
  skills: string[];
  sourceName: string;
  outboundUrl: string; // Sanitized outbound redirect
}

export interface MobileAuthSession {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
}

export interface MobileResumeUploadStatus {
  parseId: string;
  status: 'QUEUED' | 'PROCESSING' | 'PARSED' | 'FAILED';
  extractedSkills: string[];
  errorMessage?: string;
}

export interface MobileSearchFilters {
  query?: string;
  remote?: boolean;
  minSalary?: number;
  location?: string;
}

export const EVALUATION_API_ROUTES = {
  SEARCH_JOBS: '/api/v1/jobs',
  JOB_DETAIL: '/api/v1/jobs/:id',
  SAVED_JOBS: '/api/v1/users/workspace/saved-jobs',
  RESUME_UPLOAD: '/api/v1/users/resume/upload',
  RESUME_STATUS: '/api/v1/users/resume/status/:id',
  AUTH_SYNC: '/api/v1/users/sync'
} as const;

export const BENCHMARK_FIXTURE_JOBS: MobileJobDetail[] = [
  {
    id: 'job-bench-001',
    title: 'Senior Android Engineer (Jetpack Compose)',
    company: 'Fintech Solutions Ltd',
    location: 'Dhaka, Bangladesh',
    remoteType: 'HYBRID',
    salaryMin: 180000,
    salaryMax: 250000,
    currency: 'BDT',
    postedAt: '2026-11-01T08:00:00Z',
    sourceUrl: 'https://careers.fintech.example/jobs/401',
    outboundUrl: 'http://localhost:3000/api/jobs/job-bench-001/outbound',
    description: 'Lead mobile application development building resilient financial dashboards using modern native architectures.',
    requirements: ['5+ years Kotlin/Android experience', 'Deep expertise in Jetpack Compose and Coroutines', 'Offline data synchronization'],
    skills: ['Kotlin', 'Jetpack Compose', 'Coroutines', 'Room', 'Dagger Hilt'],
    sourceName: 'Greenhouse'
  },
  {
    id: 'job-bench-002',
    title: 'Full-Stack Mobile Engineer (React Native)',
    company: 'E-Commerce Global',
    location: 'Remote, South Asia',
    remoteType: 'REMOTE',
    salaryMin: 200000,
    salaryMax: 300000,
    currency: 'BDT',
    postedAt: '2026-11-02T10:30:00Z',
    sourceUrl: 'https://jobs.ecommerce.example/roles/mobile-fullstack',
    outboundUrl: 'http://localhost:3000/api/jobs/job-bench-002/outbound',
    description: 'Scale our cross-platform shopping and vendor marketplace app with React Native New Architecture.',
    requirements: ['React Native 0.75+ experience', 'TypeScript & State Management (Zustand/Redux)', 'Native module bridge knowledge'],
    skills: ['React Native', 'TypeScript', 'Node.js', 'Hermes', 'Turbomodules'],
    sourceName: 'Lever'
  },
  {
    id: 'job-bench-003',
    title: 'Distributed Systems & Go Backend Engineer',
    company: 'Cloud Scale Networks',
    location: 'Dhaka, Bangladesh',
    remoteType: 'ONSITE',
    salaryMin: 220000,
    salaryMax: 320000,
    currency: 'BDT',
    postedAt: '2026-11-02T14:15:00Z',
    sourceUrl: 'https://cloudscale.example/careers/go-backend',
    outboundUrl: 'http://localhost:3000/api/jobs/job-bench-003/outbound',
    description: 'Design and deploy high-throughput job ingestion pipelines and scraper orchestrators.',
    requirements: ['Proficiency with Go 1.22+', 'Apache Kafka or RabbitMQ event streaming', 'MongoDB or PostgreSQL indexing'],
    skills: ['Go', 'Kafka', 'MongoDB', 'Docker', 'Elasticsearch'],
    sourceName: 'Direct'
  }
];

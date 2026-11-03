/**
 * evaluations/mobile/shared-contracts/index.js
 * CommonJS export of shared contracts and benchmark fixtures.
 * Strictly aligned with OpenAPI 3.1 specification (contracts/openapi/seekers-api-v1.yaml).
 */

const BENCHMARK_FIXTURE_JOBS = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Senior Android Engineer (Jetpack Compose)',
    company: 'Fintech Solutions Ltd',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'HYBRID',
    job_type: 'FULL_TIME',
    seniority: 'SENIOR',
    salary: {
      currency: 'BDT',
      period: 'MONTHLY',
      min: 180000,
      max: 250000
    },
    skills: ['Kotlin', 'Jetpack Compose', 'Coroutines', 'Room', 'Dagger Hilt'],
    source: 'Greenhouse',
    published_at: '2026-11-01T08:00:00.000Z',
    canonical_url: 'https://careers.fintech.example/jobs/401',
    outbound_url: '/api/v1/jobs/550e8400-e29b-41d4-a716-446655440001/outbound',
    description: 'Lead mobile application development building resilient financial dashboards using modern native architectures.',
    status: 'ACTIVE'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Full-Stack Mobile Engineer (React Native)',
    company: 'E-Commerce Global',
    location: 'Remote, South Asia',
    remote_eligibility: 'FULLY_REMOTE',
    job_type: 'FULL_TIME',
    seniority: 'MID',
    salary: {
      currency: 'BDT',
      period: 'MONTHLY',
      min: 200000,
      max: 300000
    },
    skills: ['React Native', 'TypeScript', 'Node.js', 'Hermes', 'Turbomodules'],
    source: 'Lever',
    published_at: '2026-11-02T10:30:00.000Z',
    canonical_url: 'https://jobs.ecommerce.example/roles/mobile-fullstack',
    outbound_url: '/api/v1/jobs/550e8400-e29b-41d4-a716-446655440002/outbound',
    description: 'Scale our cross-platform shopping and vendor marketplace app with React Native New Architecture.',
    status: 'ACTIVE'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: 'Distributed Systems & Go Backend Engineer',
    company: 'Cloud Scale Networks',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'ONSITE_ONLY',
    job_type: 'FULL_TIME',
    seniority: 'SENIOR',
    salary: {
      currency: 'BDT',
      period: 'MONTHLY',
      min: 220000,
      max: 320000
    },
    skills: ['Go', 'Kafka', 'MongoDB', 'Docker', 'Elasticsearch'],
    source: 'Direct',
    published_at: '2026-11-02T14:15:00.000Z',
    canonical_url: 'https://cloudscale.example/careers/go-backend',
    outbound_url: '/api/v1/jobs/550e8400-e29b-41d4-a716-446655440003/outbound',
    description: 'Design and deploy high-throughput job ingestion pipelines and scraper orchestrators.',
    status: 'ACTIVE'
  }
];

const EVALUATION_API_ROUTES = {
  SEARCH_JOBS: '/api/v1/jobs',
  JOB_DETAIL: '/api/v1/jobs/:id',
  JOB_OUTBOUND: '/api/v1/jobs/:id/outbound',
  SAVED_JOBS: '/api/v1/users/saved-jobs',
  SAVE_JOB: '/api/v1/users/saved-jobs/:jobId',
  UNSAVE_JOB: '/api/v1/users/saved-jobs/:jobId',
  RESUME_UPLOAD: '/api/v1/users/resume/upload',
  RESUME_STATUS: '/api/v1/users/resume/status/:id'
};

module.exports = {
  BENCHMARK_FIXTURE_JOBS,
  EVALUATION_API_ROUTES
};

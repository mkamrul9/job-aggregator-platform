// frontend-admin/src/app/core/services/demo-data.ts
import {
  SystemHealth,
  SourceConnector,
  CrawlRun,
  ModerationJob,
  QueueMetrics,
  DeadLetterItem,
  SupportReport,
  AuditLogEntry,
  PipelineTelemetry
} from '../models/operations.models';

export const INITIAL_HEALTH: SystemHealth[] = [
  {
    service: 'service-scraper',
    displayName: 'Go Collector Daemon',
    status: 'HEALTHY',
    latencyMs: 14,
    version: '1.2.0-p12',
    endpoint: 'internal://scraper-worker:50051',
    details: 'Autonomous rate-limited collector; 2 active ATS connectors',
    checkedAt: new Date().toISOString()
  },
  {
    service: 'service-ingestion',
    displayName: 'Node Ingestion Worker',
    status: 'HEALTHY',
    latencyMs: 18,
    version: '1.4.0-p12',
    endpoint: 'http://ingestion-service:5000',
    details: 'Kafka consumer active; schema validator running',
    checkedAt: new Date().toISOString()
  },
  {
    service: 'mongodb-catalog',
    displayName: 'MongoDB Canonical Catalog',
    status: 'HEALTHY',
    latencyMs: 6,
    version: '6.0.12',
    endpoint: 'mongodb://mongodb:27017/job_platform',
    details: 'Primary replica node online; 3,420 canonical listings',
    checkedAt: new Date().toISOString()
  },
  {
    service: 'elasticsearch-search',
    displayName: 'Elasticsearch 8 Index',
    status: 'HEALTHY',
    latencyMs: 22,
    version: '8.10.2',
    endpoint: 'http://elasticsearch:9200/jobs_v1',
    details: 'Index green; alias "jobs" active; 3,420 docs aligned',
    checkedAt: new Date().toISOString()
  },
  {
    service: 'service-notification',
    displayName: 'Notification & Outbox Dispatcher',
    status: 'HEALTHY',
    latencyMs: 12,
    version: '1.1.0-p11',
    endpoint: 'http://notification-service:4000',
    details: 'Fenced lease worker polling; CAPTURE mailbox active',
    checkedAt: new Date().toISOString()
  },
  {
    service: 'service-user',
    displayName: 'NestJS Identity & Workspace API',
    status: 'HEALTHY',
    latencyMs: 16,
    version: '1.3.0-p10',
    endpoint: 'http://user-service:3000',
    details: 'PostgreSQL connection pool healthy; Auth emulator synced',
    checkedAt: new Date().toISOString()
  },
  {
    service: 'service-resume',
    displayName: 'Python Resume Extraction Engine',
    status: 'HEALTHY',
    latencyMs: 45,
    version: '1.0.0-p08',
    endpoint: 'http://resume-api:8000',
    details: 'PyTorch SpaCy extractor loaded; gRPC server ready',
    checkedAt: new Date().toISOString()
  }
];

export const INITIAL_SOURCES: SourceConnector[] = [
  {
    id: 'greenhouse-feed',
    name: 'Greenhouse Public ATS Feed',
    url: 'https://boards-api.greenhouse.io/v1/boards',
    targetRegion: 'Bangladesh & South Asia Remote',
    status: 'HEALTHY',
    permissionStatus: 'PUBLIC_API',
    permissionRef: 'Public ATS API documented at developers.greenhouse.io',
    lastCrawledAt: '3 mins ago',
    totalCollected: 1420,
    errorCount: 0,
    enabled: true,
    type: 'json_api',
    fetchBudget: { maxRps: 2.0, dailyLimit: 5000 }
  },
  {
    id: 'lever-feed',
    name: 'Lever Public Careers API',
    url: 'https://api.lever.co/v0/postings',
    targetRegion: 'Dhaka & Regional Tech',
    status: 'HEALTHY',
    permissionStatus: 'PUBLIC_API',
    permissionRef: 'Public postings API documented at hire.lever.co/developer',
    lastCrawledAt: '7 mins ago',
    totalCollected: 980,
    errorCount: 0,
    enabled: true,
    type: 'json_api',
    fetchBudget: { maxRps: 2.0, dailyLimit: 5000 }
  },
  {
    id: 'bdjobs-tech',
    name: 'BDJobs Tech Portal (Simulated)',
    url: 'https://jobs.bdjobs.com',
    targetRegion: 'Dhaka, Chattogram, Sylhet',
    status: 'PAUSED',
    permissionStatus: 'PENDING',
    permissionRef: 'Syndication licensing pending formal publisher agreement',
    lastCrawledAt: '18 mins ago (Simulated)',
    totalCollected: 640,
    errorCount: 0,
    enabled: false,
    disabledReason: 'Live collection disabled: unverified custom API schema; requires approved syndication agreement',
    type: 'feed',
    fetchBudget: { maxRps: 1.0, dailyLimit: 1000 }
  },
  {
    id: 'chaldal-careers',
    name: 'Chaldal Careers Direct Feed',
    url: 'https://careers.chaldal.com/api/jobs',
    targetRegion: 'Gulshan, Dhaka',
    status: 'PAUSED',
    permissionStatus: 'PENDING',
    permissionRef: 'Employer direct careers API pending API schema specification',
    lastCrawledAt: '25 mins ago (Simulated)',
    totalCollected: 114,
    errorCount: 0,
    enabled: false,
    disabledReason: 'Live collection disabled: employer endpoint is not an ATS feed; requires verified connector',
    type: 'json_api',
    fetchBudget: { maxRps: 1.0, dailyLimit: 500 }
  },
  {
    id: 'pathao-careers',
    name: 'Pathao Tech Careers Pipeline',
    url: 'https://pathao.com/careers/jobs',
    targetRegion: 'Dhanmondi, Dhaka',
    status: 'PAUSED',
    permissionStatus: 'PENDING',
    permissionRef: 'Employer direct careers feed pending endpoint confirmation',
    lastCrawledAt: '35 mins ago (Simulated)',
    totalCollected: 86,
    errorCount: 0,
    enabled: false,
    disabledReason: 'Live collection disabled: employer endpoint is not an ATS feed; requires verified connector',
    type: 'json_api',
    fetchBudget: { maxRps: 1.0, dailyLimit: 500 }
  },
  {
    id: 'linkedin-bd',
    name: 'LinkedIn Bangladesh Mirror',
    url: 'https://linkedin.com/jobs',
    targetRegion: 'Bangladesh (Hybrid & Onsite)',
    status: 'PAUSED',
    permissionStatus: 'PROHIBITED',
    permissionRef: 'User Agreement Section 8.2 prohibits automated access without express permission',
    lastCrawledAt: 'Disabled (Live Blocked)',
    totalCollected: 0,
    errorCount: 0,
    enabled: false,
    disabledReason: 'Live collection disabled: automated scraping requires formal LinkedIn Talent Hub partner agreement',
    type: 'html',
    fetchBudget: { maxRps: 0, dailyLimit: 0 }
  },
  {
    id: 'fixture-local',
    name: 'Deterministic Local Test Fixture',
    url: 'file:///fixtures/jobs.ndjson',
    targetRegion: 'Local Offline Sandbox',
    status: 'HEALTHY',
    permissionStatus: 'PUBLIC_API',
    permissionRef: 'Local offline test suite fixture',
    lastCrawledAt: '1 min ago',
    totalCollected: 180,
    errorCount: 0,
    enabled: true,
    type: 'feed',
    fetchBudget: { maxRps: 10.0, dailyLimit: 10000 }
  }
];

export const INITIAL_CRAWL_RUNS: CrawlRun[] = [
  {
    id: 'run_greenhouse_9821',
    sourceId: 'greenhouse-feed',
    sourceName: 'Greenhouse Public ATS Feed',
    trigger: 'SCHEDULED',
    startedAt: new Date(Date.now() - 180000).toLocaleTimeString(),
    durationMs: 4200,
    itemsCollected: 12,
    itemsRejected: 0,
    status: 'SUCCESS'
  },
  {
    id: 'run_lever_9820',
    sourceId: 'lever-feed',
    sourceName: 'Lever Public Careers API',
    trigger: 'SCHEDULED',
    startedAt: new Date(Date.now() - 420000).toLocaleTimeString(),
    durationMs: 3100,
    itemsCollected: 8,
    itemsRejected: 0,
    status: 'SUCCESS'
  },
  {
    id: 'run_fixture_9819',
    sourceId: 'fixture-local',
    sourceName: 'Deterministic Local Test Fixture',
    trigger: 'MANUAL',
    startedAt: new Date(Date.now() - 900000).toLocaleTimeString(),
    durationMs: 820,
    itemsCollected: 25,
    itemsRejected: 0,
    status: 'SUCCESS'
  },
  {
    id: 'run_bdjobs_sim_9818',
    sourceId: 'bdjobs-tech',
    sourceName: 'BDJobs Tech Portal (Simulated)',
    trigger: 'BURST',
    startedAt: new Date(Date.now() - 1800000).toLocaleTimeString(),
    durationMs: 5400,
    itemsCollected: 5,
    itemsRejected: 1,
    status: 'SUCCESS'
  }
];

export const INITIAL_JOBS: ModerationJob[] = [
  {
    id: 'e1a2b3c4-1111-4000-8000-000000000001',
    title: 'Senior Distributed Systems Engineer (Go/Kafka)',
    company: 'bKash Limited',
    location: 'Kawran Bazar, Dhaka',
    source: 'greenhouse-feed',
    url: 'https://boards.greenhouse.io/bkash/jobs/4011223',
    status: 'ACTIVE',
    latencyMs: 14,
    scrapedAt: new Date(Date.now() - 3600000).toLocaleString(),
    expiresAt: new Date(Date.now() + 2592000000).toLocaleDateString(),
    outboundClicks: 42,
    rawDescription: 'Architect multi-partition Kafka clusters for payment settlement pipelines and microservices.',
    provenance: {
      duplicateCount: 1,
      duplicateHashes: ['hash_bkash_dist_sys_01'],
      firstSeenAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      rawPayloadPreview: '{"event_id":"evt_bk_01","producer":"service-scraper","source":"greenhouse-feed"}'
    }
  },
  {
    id: 'e1a2b3c4-2222-4000-8000-000000000002',
    title: 'Senior Mobile Engineer (Android / Jetpack Compose)',
    company: 'Pathao',
    location: 'Dhanmondi, Dhaka',
    source: 'lever-feed',
    url: 'https://jobs.lever.co/pathao/9b8a7c6d',
    status: 'ACTIVE',
    latencyMs: 18,
    scrapedAt: new Date(Date.now() - 7200000).toLocaleString(),
    expiresAt: new Date(Date.now() + 2160000000).toLocaleDateString(),
    outboundClicks: 28,
    rawDescription: 'Lead Android app architecture migration for consumer ride-sharing and food delivery platforms.',
    provenance: {
      duplicateCount: 1,
      duplicateHashes: ['hash_pathao_android_02'],
      firstSeenAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      rawPayloadPreview: '{"event_id":"evt_pa_02","producer":"service-scraper","source":"lever-feed"}'
    }
  },
  {
    id: 'e1a2b3c4-3333-4000-8000-000000000003',
    title: 'Staff Fullstack Architect (Node & Next.js)',
    company: 'ShopUp',
    location: 'Banani, Dhaka',
    source: 'greenhouse-feed',
    url: 'https://boards.greenhouse.io/shopup/jobs/5544332',
    status: 'ACTIVE',
    latencyMs: 12,
    scrapedAt: new Date(Date.now() - 14400000).toLocaleString(),
    expiresAt: new Date(Date.now() + 1800000000).toLocaleDateString(),
    outboundClicks: 19,
    rawDescription: 'Lead B2B merchant portal core architecture with offline synchronization and inventory control.',
    provenance: {
      duplicateCount: 2,
      duplicateHashes: ['hash_shopup_staff_03a', 'hash_shopup_staff_03b'],
      firstSeenAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      rawPayloadPreview: '{"event_id":"evt_su_03","producer":"service-scraper","source":"greenhouse-feed"}'
    }
  },
  {
    id: 'e1a2b3c4-4444-4000-8000-000000000004',
    title: 'Cloud DevOps & SRE Specialist (Terraform & AWS)',
    company: 'Brain Station 23',
    location: 'Mohakhali, Dhaka',
    source: 'lever-feed',
    url: 'https://jobs.lever.co/brainstation23/887766',
    status: 'ACTIVE',
    latencyMs: 20,
    scrapedAt: new Date(Date.now() - 28800000).toLocaleString(),
    expiresAt: new Date(Date.now() + 1200000000).toLocaleDateString(),
    outboundClicks: 35,
    rawDescription: 'Manage Kubernetes infrastructure, automated CI/CD pipelines, and multi-region deployment resilience.',
    provenance: {
      duplicateCount: 1,
      duplicateHashes: ['hash_bs23_devops_04'],
      firstSeenAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      rawPayloadPreview: '{"event_id":"evt_bs_04","producer":"service-scraper","source":"lever-feed"}'
    }
  },
  {
    id: 'e1a2b3c4-5555-4000-8000-000000000005',
    title: 'Lead Frontend Engineer (Angular & Microfrontends)',
    company: 'Optimizely Dhaka',
    location: 'Tejgaon I/A, Dhaka',
    source: 'greenhouse-feed',
    url: 'https://boards.greenhouse.io/optimizely/jobs/991122',
    status: 'ACTIVE',
    latencyMs: 16,
    scrapedAt: new Date(Date.now() - 43200000).toLocaleString(),
    expiresAt: new Date(Date.now() + 2400000000).toLocaleDateString(),
    outboundClicks: 61,
    rawDescription: 'Architect experimentation dashboard modules, high-throughput analytics visualizations, and design system.',
    provenance: {
      duplicateCount: 1,
      duplicateHashes: ['hash_opt_frontend_05'],
      firstSeenAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      rawPayloadPreview: '{"event_id":"evt_opt_05","producer":"service-scraper","source":"greenhouse-feed"}'
    }
  },
  {
    id: 'e1a2b3c4-6666-4000-8000-000000000006',
    title: 'Healthcare IT Software Engineer (Java / Spring Boot)',
    company: 'Therap (BD) Ltd.',
    location: 'Banasree, Dhaka',
    source: 'fixture-local',
    url: 'https://therapbd.com/careers/java-dev',
    status: 'EXPIRED',
    latencyMs: 22,
    scrapedAt: new Date(Date.now() - 86400000 * 35).toLocaleString(),
    expiresAt: new Date(Date.now() - 86400000 * 5).toLocaleDateString(),
    outboundClicks: 84,
    rawDescription: 'Develop HIPAA-compliant electronic medical record subsystems with PostgreSQL and distributed caching.',
    provenance: {
      duplicateCount: 1,
      duplicateHashes: ['hash_therap_java_06'],
      firstSeenAt: new Date(Date.now() - 86400000 * 35).toISOString(),
      lastVerifiedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      rawPayloadPreview: '{"event_id":"evt_th_06","producer":"service-scraper","source":"fixture-local"}'
    }
  },
  {
    id: 'e1a2b3c4-7777-4000-8000-000000000007',
    title: 'Senior Embedded Firmware Engineer (C/C++ & RTOS)',
    company: 'Walton Digi-Tech',
    location: 'Chandra, Gazipur',
    source: 'fixture-local',
    url: 'https://waltonbd.com/careers/firmware-sr',
    status: 'FLAGGED',
    latencyMs: 25,
    scrapedAt: new Date(Date.now() - 86400000 * 2).toLocaleString(),
    expiresAt: new Date(Date.now() + 1800000000).toLocaleDateString(),
    outboundClicks: 9,
    rawDescription: 'Design micro-controller firmware for smart consumer electronics, battery management, and IoT connectivity.',
    provenance: {
      duplicateCount: 1,
      duplicateHashes: ['hash_walton_firmware_07'],
      firstSeenAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      rawPayloadPreview: '{"event_id":"evt_wt_07","producer":"service-scraper","source":"fixture-local"}'
    }
  }
];

export const INITIAL_DEAD_LETTERS: DeadLetterItem[] = [
  {
    id: 'dlq_poison_8841',
    eventType: 'job.collected.v1',
    quarantinedAt: new Date(Date.now() - 7200000).toISOString(),
    errors: [
      'Schema validation failed: "salary.min" must be less than or equal to "salary.max"',
      'Invalid currency code "XYZ"'
    ],
    status: 'QUARANTINED',
    retryCount: 1,
    rawPayload: {
      event_id: 'evt_raw_poison_01',
      event_type: 'job.collected.v1',
      producer: 'service-scraper',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      data: {
        title: 'Backend Engineer (Unvalidated Salary Range)',
        company: 'Unknown Ventures',
        location: 'Dhaka',
        url: 'https://careers.unknown.com/job/101',
        salary: { min: 90000, max: 40000, currency: 'XYZ' }
      }
    }
  },
  {
    id: 'dlq_poison_8842',
    eventType: 'job.collected.v1',
    quarantinedAt: new Date(Date.now() - 14400000).toISOString(),
    errors: [
      'SSRF Violation: canonical destination URL resolves to private IP (192.168.1.105)',
      'Schema validation failed: "source_job_id" is missing'
    ],
    status: 'QUARANTINED',
    retryCount: 0,
    rawPayload: {
      event_id: 'evt_raw_poison_02',
      event_type: 'job.collected.v1',
      producer: 'service-scraper',
      timestamp: new Date(Date.now() - 14400000).toISOString(),
      data: {
        title: 'Network Operations Engineer',
        company: 'Internal Portal',
        url: 'http://192.168.1.105:8080/careers/job-02'
      }
    }
  }
];

export const INITIAL_SUPPORT_REPORTS: SupportReport[] = [
  {
    id: 'rpt_001_881',
    referenceNum: 'RPT-20261028-1001',
    jobId: 'e1a2b3c4-2222-4000-8000-000000000002',
    jobTitle: 'Senior Mobile Engineer (Android / Jetpack Compose)',
    reportType: 'BROKEN_LINK',
    description: 'The Lever application form returns HTTP 404 on the company career portal.',
    contactEmail: 'candidate.rakib@example.com',
    status: 'IN_REVIEW',
    operatorNotes: 'Verified: Lever slug changed. Updating canonical URL in review.',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    resolvedBy: 'usr_operator_02'
  },
  {
    id: 'rpt_002_882',
    referenceNum: 'RPT-20261029-1002',
    jobId: 'e1a2b3c4-1111-4000-8000-000000000001',
    jobTitle: 'Senior Distributed Systems Engineer (Go/Kafka)',
    reportType: 'EXPIRED_LISTING',
    description: 'Post was filled last week according to bKash LinkedIn post.',
    contactEmail: 'applicant.nadim@example.com',
    status: 'RECEIVED',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'rpt_003_883',
    referenceNum: 'RPT-20261029-1003',
    jobId: 'e1a2b3c4-3333-4000-8000-000000000003',
    jobTitle: 'Staff Fullstack Architect (Node & Next.js)',
    reportType: 'INCORRECT_DATA',
    description: 'Listing title mentions Banani but description states fully remote.',
    status: 'RESOLVED',
    operatorNotes: 'Updated location metadata to Hybrid (Banani & Remote).',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    resolvedAt: new Date(Date.now() - 86400000).toISOString(),
    resolvedBy: 'usr_admin_01'
  },
  {
    id: 'rpt_004_884',
    referenceNum: 'RPT-20261030-1004',
    jobId: 'e1a2b3c4-7777-4000-8000-000000000007',
    jobTitle: 'Senior Embedded Firmware Engineer (C/C++ & RTOS)',
    reportType: 'SPAM',
    description: 'Suspicious email address in job footer asking for processing fees.',
    contactEmail: 'whistleblower@example.com',
    status: 'RECEIVED',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString()
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'audit_evt_991',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    actor: {
      id: 'usr_admin_01',
      email: 'farhan.admin@seekers.internal',
      role: 'ADMIN'
    },
    action: 'SOURCE_PAUSED',
    targetType: 'SOURCE_CONNECTOR',
    targetId: 'bdjobs-tech',
    result: 'SUCCESS',
    details: 'Paused source pending syndication agreement review',
    beforeState: { status: 'HEALTHY' },
    afterState: { status: 'PAUSED' }
  },
  {
    id: 'audit_evt_992',
    timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
    actor: {
      id: 'usr_admin_01',
      email: 'farhan.admin@seekers.internal',
      role: 'ADMIN'
    },
    action: 'JOB_FLAGGED',
    targetType: 'CANONICAL_JOB',
    targetId: 'e1a2b3c4-7777-4000-8000-000000000007',
    result: 'SUCCESS',
    details: 'Listing flagged following spam investigation',
    beforeState: { status: 'ACTIVE' },
    afterState: { status: 'FLAGGED' }
  },
  {
    id: 'audit_evt_993',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    actor: {
      id: 'usr_operator_02',
      email: 'tahmid.ops@seekers.internal',
      role: 'OPERATOR'
    },
    action: 'SUPPORT_REPORT_TRIAGED',
    targetType: 'SUPPORT_REPORT',
    targetId: 'rpt_003_883',
    result: 'SUCCESS',
    details: 'Status updated to RESOLVED; operator notes added',
    beforeState: { status: 'IN_REVIEW' },
    afterState: { status: 'RESOLVED' }
  },
  {
    id: 'audit_evt_994',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    actor: {
      id: 'usr_admin_01',
      email: 'farhan.admin@seekers.internal',
      role: 'ADMIN'
    },
    action: 'CATALOG_RECONCILED',
    targetType: 'SEARCH_INDEX',
    targetId: 'jobs_v1',
    result: 'SUCCESS',
    details: 'Zero-downtime reconciliation: 3,420 scanned, 0 errors',
    beforeState: { staleDocs: 3 },
    afterState: { staleDocs: 0 }
  }
];

export const INITIAL_QUEUE_METRICS: QueueMetrics = {
  topic: 'job.collected.v1',
  partitionCount: 3,
  totalLag: 4,
  consumerGroup: 'mongo-ingestion-group',
  consumerStatus: 'RUNNING',
  projectionOutbox: {
    pending: 0,
    failed: 0
  }
};

export const INITIAL_TELEMETRY: PipelineTelemetry = {
  activeConnectors: 3,
  totalConnectors: 7,
  throughputHourly: 148,
  avgLatencyMs: 18,
  kafkaLagMs: 14,
  dlqCount: 2,
  lastUpdated: new Date().toLocaleTimeString()
};

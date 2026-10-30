// frontend-admin/src/app/core/models/operations.models.ts

export type AppMode = 'demo' | 'live';
export type OperatorRole = 'ADMIN' | 'OPERATOR' | 'READ_ONLY';
export type ConnectionState = 'connected' | 'reconnecting' | 'paused' | 'disconnected';

export interface OperatorUser {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  token?: string;
}

export interface SystemHealth {
  service: string;
  displayName: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  latencyMs: number;
  version: string;
  endpoint: string;
  details?: string;
  checkedAt: string;
}

export interface SourceConnector {
  id: string;
  name: string;
  url: string;
  targetRegion: string;
  status: 'HEALTHY' | 'DEGRADED' | 'PAUSED';
  permissionStatus: 'LICENSED' | 'PUBLIC_API' | 'PENDING' | 'PROHIBITED';
  permissionRef: string;
  lastCrawledAt: string;
  totalCollected: number;
  errorCount: number;
  enabled: boolean;
  disabledReason?: string;
  type: 'json_api' | 'feed' | 'html';
  fetchBudget: {
    maxRps: number;
    dailyLimit: number;
  };
}

export interface CrawlRun {
  id: string;
  sourceId: string;
  sourceName: string;
  trigger: 'SCHEDULED' | 'MANUAL' | 'BURST';
  startedAt: string;
  durationMs: number;
  itemsCollected: number;
  itemsRejected: number;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING';
  errorMessage?: string;
}

export interface ModerationJob {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  status: 'ACTIVE' | 'EXPIRED' | 'FLAGGED' | 'HIDDEN';
  latencyMs: number;
  scrapedAt: string;
  expiresAt?: string;
  outboundClicks: number;
  rawDescription?: string;
  provenance: {
    duplicateCount: number;
    duplicateHashes: string[];
    firstSeenAt: string;
    lastVerifiedAt: string;
    rawPayloadPreview: string;
  };
}

export interface QueueMetrics {
  topic: string;
  partitionCount: number;
  totalLag: number;
  consumerGroup: string;
  consumerStatus: 'RUNNING' | 'DEGRADED' | 'STANDALONE';
  projectionOutbox: {
    pending: number;
    failed: number;
  };
}

export interface DeadLetterItem {
  id: string;
  eventType: string;
  quarantinedAt: string;
  errors: string[];
  rawPayload: any;
  status: 'QUARANTINED' | 'RESOLVED' | 'DISCARDED';
  retryCount: number;
  resolvedAt?: string;
}

export interface SupportReport {
  id: string;
  referenceNum: string;
  userId?: string;
  jobId?: string;
  jobTitle?: string;
  reportType: 'EXPIRED_LISTING' | 'BROKEN_LINK' | 'INCORRECT_DATA' | 'SPAM' | 'OTHER';
  description: string;
  contactEmail?: string;
  status: 'RECEIVED' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  operatorNotes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: {
    id: string;
    email: string;
    role: OperatorRole;
  };
  action: string;
  targetType: string;
  targetId: string;
  result: 'SUCCESS' | 'FAILURE';
  details?: string;
  beforeState?: any;
  afterState?: any;
}

export interface PipelineTelemetry {
  activeConnectors: number;
  totalConnectors: number;
  throughputHourly: number;
  avgLatencyMs: number;
  kafkaLagMs: number;
  dlqCount: number;
  lastUpdated: string;
}

export interface CatalogFilterParams {
  query?: string;
  source?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ReconcileReport {
  scannedCount: number;
  matchedCount: number;
  repairedCount: number;
  missingInEs: number;
  staleInEs: number;
  excessInEs: number;
  dryRun: boolean;
  errors: string[];
  completedAt: string;
}

export interface ReindexResult {
  operationId: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
  sourceIndex: string;
  targetIndex: string;
  alias: string;
  documentsIndexed: number;
  durationMs: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

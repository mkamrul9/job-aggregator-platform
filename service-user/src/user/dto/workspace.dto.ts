export interface JobSnapshotInput {
  title?: string;
  company?: string;
  location?: string;
  job_url?: string;
  jobUrl?: string;
  salary?: string;
  source?: string;
}

export interface CatalogSalary {
  min?: number;
  max?: number;
  currency?: string;
}

export interface CatalogJobResponse {
  id: string;
  title: string;
  company: string;
  location?: string;
  remote_eligibility?: string;
  job_type?: string;
  seniority?: string;
  salary?: CatalogSalary | string;
  skills?: string[];
  source?: string;
  canonical_url?: string;
  job_url?: string;
  published_at?: string;
  expires_at?: string;
  status?: string;
  is_expired?: boolean;
}

export interface CreateSavedSearchDto {
  name: string;
  query?: string;
  q?: string;
  location?: string;
  remoteEligibility?: string;
  remote_eligibility?: string;
  seniority?: string;
  jobType?: string;
  job_type?: string;
  minSalary?: number;
  min_salary?: number;
  currency?: string;
  payPeriod?: string;
  pay_period?: string;
  sort?: string;
  alertsEnabled?: boolean;
  alerts_enabled?: boolean;
  alertFrequency?: string;
  alert_frequency?: string;
}

export interface UpdateSavedSearchDto {
  name?: string;
  query?: string;
  q?: string;
  location?: string;
  remoteEligibility?: string;
  remote_eligibility?: string;
  seniority?: string;
  jobType?: string;
  job_type?: string;
  minSalary?: number;
  min_salary?: number;
  currency?: string;
  payPeriod?: string;
  pay_period?: string;
  sort?: string;
  alertsEnabled?: boolean;
  alerts_enabled?: boolean;
  alertFrequency?: string;
  alert_frequency?: string;
}

export interface TrackApplicationDto {
  job_id: string;
  status?: string;
  notes?: string;
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  job_url?: string;
  source?: string;
  job_summary?: JobSnapshotInput;
}

export interface UpdateApplicationDto {
  status?: string;
  notes?: string;
  expected_version?: number;
}

export interface CreateReportDto {
  report_type: string;
  description: string;
  job_id?: string;
  contact_email?: string;
}

export interface TriageReportDto {
  status: string;
  operator_notes?: string;
}

export interface CreateAlertDto {
  query: string;
  location?: string;
  frequency?: string;
}

export interface PaginationOptionsDto {
  limit?: number;
  cursor?: string;
}

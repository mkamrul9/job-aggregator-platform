// service-scraper/models.go
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// DBJob represents legacy flat job model for backward compatibility
type DBJob struct {
	Title          string    `json:"title"`
	Company        string    `json:"company"`
	URL            string    `json:"url"`
	RawDescription string    `json:"raw_description"`
	ScrapedAt      time.Time `json:"scraped_at"`
}

// SeekersTraceContext matches W3C Trace Context schema in envelope.schema.json
type SeekersTraceContext struct {
	Traceparent string `json:"traceparent,omitempty"`
	Tracestate  string `json:"tracestate,omitempty"`
}

// SeekersEventEnvelope conforms to contracts/events/envelope.schema.json
type SeekersEventEnvelope struct {
	EventID       string               `json:"event_id"`
	EventType     string               `json:"event_type"`
	SchemaVersion string               `json:"schema_version"`
	Producer      string               `json:"producer"`
	Timestamp     string               `json:"timestamp"`
	CorrelationID string               `json:"correlation_id"`
	CausationID   *string              `json:"causation_id"`
	TraceContext  *SeekersTraceContext `json:"trace_context,omitempty"`
	Payload       JobCollectedV1Payload `json:"payload"`
}

// JobCollectedV1Payload conforms to contracts/events/job.collected.v1.schema.json
type JobCollectedV1Payload struct {
	Source        string  `json:"source"`
	SourceJobID   string  `json:"source_job_id"`
	URL           string  `json:"url"`
	SourceURLHash string  `json:"source_url_hash"`
	Title         string  `json:"title"`
	Company       string  `json:"company"`
	Location      string  `json:"location"`
	Description   string  `json:"description"`
	CollectedAt   string  `json:"collected_at"`
	RawHTML       *string `json:"raw_html,omitempty"`
}

// FetchBudget defines rate limits and quotas for a source
type FetchBudget struct {
	MaxRequestsPerSecond float64 `json:"max_requests_per_second"`
	MaxBurst             int     `json:"max_burst"`
	DailyLimit           int     `json:"daily_limit"`
}

// SourceConfig records operational configuration and provenance for a source
type SourceConfig struct {
	ID                   string      `json:"id"`
	Name                 string      `json:"name"`
	Version              string      `json:"version"`
	Owner                string      `json:"owner"`
	ApprovedHosts        []string    `json:"approved_hosts"`
	PermissionRef        string      `json:"permission_ref"`
	ReviewDate           string      `json:"review_date"`
	FieldsCoverage       []string    `json:"fields_coverage"`
	Attribution          string      `json:"attribution"`
	FetchBudget          FetchBudget `json:"fetch_budget"`
	TimeoutSeconds       int         `json:"timeout_seconds"`
	RetentionDays        int         `json:"retention_days"`
	ExpiryDays           int         `json:"expiry_days"`
	Enabled              bool        `json:"enabled"`
	DisabledReason       string      `json:"disabled_reason,omitempty"`
	Type                 string      `json:"type"` // "json_api", "feed", "html"
	BaseURL              string      `json:"base_url,omitempty"`
}

// Checkpoint tracks collector progress and durable lease state for a source
type Checkpoint struct {
	SourceID       string    `json:"source_id"`
	WorkerID       string    `json:"worker_id,omitempty"`
	LeaseUntil     time.Time `json:"lease_until,omitempty"`
	LastRunAt      time.Time `json:"last_run_at"`
	LastSuccessAt  time.Time `json:"last_success_at"`
	JobsCollected  int       `json:"jobs_collected"`
	Status         string    `json:"status"` // "IDLE", "RUNNING", "COMPLETED", "FAILED"
	LastError      string    `json:"last_error,omitempty"`
	CursorOrPage   string    `json:"cursor_or_page,omitempty"`
}

// RunOutcome summarizes the result of a collection cycle
type RunOutcome struct {
	SourceID       string        `json:"source_id"`
	JobsCollected  int           `json:"jobs_collected"`
	Duration       time.Duration `json:"duration"`
	Status         string        `json:"status"` // "COMPLETED", "FAILED", "DRIFT_WARNING"
	Error          string        `json:"error,omitempty"`
}

// Helper: GenerateUUIDv4 generates an RFC 4122 v4 UUID using crypto/rand
func GenerateUUIDv4() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Helper: HashURL generates a SHA-256 hash of a normalized URL string
func HashURL(rawURL string) string {
	normalized := strings.TrimSpace(rawURL)
	h := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(h[:])
}

// Helper: CreateEnvelope creates a valid SeekersEventEnvelope from payload
func CreateEnvelope(payload JobCollectedV1Payload, correlationID string) SeekersEventEnvelope {
	if correlationID == "" {
		correlationID = GenerateUUIDv4()
	}
	return SeekersEventEnvelope{
		EventID:       GenerateUUIDv4(),
		EventType:     "job.collected.v1",
		SchemaVersion: "1.0.0",
		Producer:      "service-scraper",
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		CorrelationID: correlationID,
		CausationID:   nil,
		Payload:       payload,
	}
}

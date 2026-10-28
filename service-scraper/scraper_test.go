// service-scraper/scraper_test.go
package main

import (
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// 1. Preserved legacy Mock Publisher test
func TestMockPublisher(t *testing.T) {
	mockPub := NewMemoryPublisher()

	simulatedJob := DBJob{
		Title:   "Software Engineer",
		Company: "Tech Corp",
		URL:     "https://example.com/job",
	}

	err := mockPub.Publish(simulatedJob)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	if len(mockPub.Envelopes) != 1 {
		t.Fatalf("Expected 1 envelope published, got %d", len(mockPub.Envelopes))
	}

	if mockPub.Envelopes[0].Payload.Title != "Software Engineer" {
		t.Errorf("Expected title 'Software Engineer', got %s", mockPub.Envelopes[0].Payload.Title)
	}
}

// 2. SSRF Protection Tests
func TestSSRFIPChecks(t *testing.T) {
	blockedIPs := []string{
		"127.0.0.1",       // IPv4 loopback
		"127.0.1.1",       // IPv4 loopback range
		"::1",             // IPv6 loopback
		"10.0.0.1",        // RFC 1918 Class A
		"172.16.5.10",     // RFC 1918 Class B
		"192.168.1.1",     // RFC 1918 Class C
		"169.254.169.254", // AWS/Cloud metadata
		"169.254.1.1",     // Link-local
		"100.64.0.1",      // Carrier-Grade NAT
		"fe80::1",         // IPv6 link-local
		"fc00::1",         // IPv6 ULA
		"0.0.0.0",         // Unspecified
	}

	for _, ipStr := range blockedIPs {
		ip := net.ParseIP(ipStr)
		if !IsPrivateOrRestrictedIP(ip) {
			t.Errorf("Expected IP %s to be flagged as private/restricted, but was not", ipStr)
		}
	}

	allowedIPs := []string{
		"8.8.8.8",
		"1.1.1.1",
		"93.184.216.34", // example.com
	}

	for _, ipStr := range allowedIPs {
		ip := net.ParseIP(ipStr)
		if IsPrivateOrRestrictedIP(ip) {
			t.Errorf("Expected public IP %s to be allowed, but was blocked", ipStr)
		}
	}
}

func TestSSRFURLSyntaxAndHostApproval(t *testing.T) {
	approvedHosts := []string{"boards-api.greenhouse.io", "api.lever.co"}

	// Negative cases: scheme, credentials, single-label, unapproved hosts
	testCases := []struct {
		name      string
		rawURL    string
		expectErr error
	}{
		{"reject javascript scheme", "javascript:alert(1)", ErrProhibitedScheme},
		{"reject file scheme", "file:///etc/passwd", ErrProhibitedScheme},
		{"reject data scheme", "data:text/html,payload", ErrProhibitedScheme},
		{"reject embedded credentials", "https://user:pass@boards-api.greenhouse.io/jobs", ErrProhibitedCredentials},
		{"reject single-label intranet host", "https://intranet/api/jobs", ErrSingleLabelHost},
		{"reject unapproved public host", "https://evil.example.com/jobs", ErrUnapprovedHost},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidateTargetURL(tc.rawURL, approvedHosts)
			if err == nil {
				t.Fatalf("Expected error for URL '%s', got nil", tc.rawURL)
			}
		})
	}
}

// 3. Greenhouse Connector Parser Test
func TestGreenhouseParser(t *testing.T) {
	fixtureData, err := os.ReadFile("fixtures/greenhouse_sample.json")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	jobs, err := ParseGreenhousePayload(fixtureData, "greenhouse-feed", "Default Company", 10)
	if err != nil {
		t.Fatalf("Failed to parse Greenhouse payload: %v", err)
	}

	if len(jobs) != 2 {
		t.Fatalf("Expected 2 jobs, got %d", len(jobs))
	}

	j1 := jobs[0]
	if j1.SourceJobID != "4829101" {
		t.Errorf("Expected SourceJobID '4829101', got '%s'", j1.SourceJobID)
	}
	if j1.Title != "Senior Backend Engineer (Go / Distributed Systems)" {
		t.Errorf("Unexpected title: %s", j1.Title)
	}
	if j1.Company != "Pathao Engineering" {
		t.Errorf("Unexpected company: %s", j1.Company)
	}
	if len(j1.SourceURLHash) != 64 {
		t.Errorf("Expected 64-char sha256 hash, got length %d", len(j1.SourceURLHash))
	}
	// Check HTML tags stripped
	if StripHTML("<p>Hello <b>World</b></p>") != "Hello World" {
		t.Errorf("StripHTML failed, got '%s'", StripHTML("<p>Hello <b>World</b></p>"))
	}
}

// 4. Lever Connector Parser Test
func TestLeverParser(t *testing.T) {
	fixtureData, err := os.ReadFile("fixtures/lever_sample.json")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	jobs, err := ParseLeverPayload(fixtureData, "lever-feed", "Tech Corp", 10)
	if err != nil {
		t.Fatalf("Failed to parse Lever payload: %v", err)
	}

	if len(jobs) != 1 {
		t.Fatalf("Expected 1 job, got %d", len(jobs))
	}

	j := jobs[0]
	if j.SourceJobID != "lever-9912a" {
		t.Errorf("Expected SourceJobID 'lever-9912a', got '%s'", j.SourceJobID)
	}
	if j.Location != "Dhaka, Bangladesh" {
		t.Errorf("Expected location 'Dhaka, Bangladesh', got '%s'", j.Location)
	}
}

// 5. Schema Drift & Empty Response Test
func TestParserDriftAndEmpty(t *testing.T) {
	driftData, err := os.ReadFile("fixtures/drift_missing_fields.json")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	// Parsing unexpected payload as Lever should fail or return 0 jobs
	leverJobs, _ := ParseLeverPayload(driftData, "lever-feed", "Tech Corp", 10)
	if len(leverJobs) != 0 {
		t.Errorf("Expected 0 jobs parsed from drift data, got %d", len(leverJobs))
	}

	emptyData, err := os.ReadFile("fixtures/empty_response.json")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	ghJobs, err := ParseGreenhousePayload(emptyData, "greenhouse-feed", "Default", 10)
	if err != nil {
		t.Fatalf("Unexpected error for empty jobs array: %v", err)
	}
	if len(ghJobs) != 0 {
		t.Errorf("Expected 0 jobs, got %d", len(ghJobs))
	}
}

// 6. Durable Scheduler Store & Lease Coordination Test
func TestSchedulerStoreLeaseCoordination(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "scheduler-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewFileSchedulerStore(tmpDir)
	if err != nil {
		t.Fatalf("Failed to init FileSchedulerStore: %v", err)
	}

	sourceID := "test-source-1"
	workerA := "worker-alpha"
	workerB := "worker-beta"

	// Worker A claims lease
	leaseA, claimed, err := store.ClaimLease(sourceID, workerA, 2*time.Second)
	if err != nil || !claimed || leaseA == nil {
		t.Fatalf("Expected workerA to claim lease, err: %v, claimed: %v", err, claimed)
	}
	if leaseA.FenceToken != 1 {
		t.Errorf("Expected initial fence token 1, got %d", leaseA.FenceToken)
	}

	// Worker B attempts to claim same lease while active
	leaseB, claimedB, err := store.ClaimLease(sourceID, workerB, 2*time.Second)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if claimedB || leaseB != nil {
		t.Fatalf("Worker B should have been rejected while Worker A holds active lease")
	}

	// Worker A releases lease
	err = store.ReleaseLease(sourceID, workerA, leaseA.FenceToken)
	if err != nil {
		t.Fatalf("Failed to release lease: %v", err)
	}

	// Worker B can now claim lease
	leaseB2, claimedB2, err := store.ClaimLease(sourceID, workerB, 2*time.Second)
	if err != nil || !claimedB2 || leaseB2 == nil {
		t.Fatalf("Expected workerB to claim released lease, err: %v, claimed: %v", err, claimedB2)
	}
	if leaseB2.FenceToken != 2 {
		t.Errorf("Expected bumped fence token 2, got %d", leaseB2.FenceToken)
	}

	// Record outcome
	err = store.RecordOutcome(RunOutcome{
		SourceID:      sourceID,
		WorkerID:      workerB,
		FenceToken:    leaseB2.FenceToken,
		JobsCollected: 5,
		Duration:      100 * time.Millisecond,
		Status:        "COMPLETED",
	})
	if err != nil {
		t.Fatalf("Failed to record outcome: %v", err)
	}

	cp, err := store.GetCheckpoint(sourceID)
	if err != nil {
		t.Fatalf("Failed to get checkpoint: %v", err)
	}
	if cp.JobsCollected != 5 || cp.Status != "COMPLETED" {
		t.Errorf("Unexpected checkpoint data: %+v", cp)
	}
}

// 6b. Fencing Token & Superseded Worker Rejection Test
func TestSchedulerStoreFenceTokenSupersededReject(t *testing.T) {
	memStore := NewMemorySchedulerStore()
	sourceID := "fenced-source"
	workerA := "worker-old"
	workerB := "worker-new"

	// Worker A claims lease with short duration (already expired)
	leaseA, claimed, err := memStore.ClaimLease(sourceID, workerA, -1*time.Second)
	if err != nil || !claimed {
		t.Fatalf("Expected workerA to claim lease, err: %v", err)
	}

	// Worker B claims the expired lease, incrementing fence token to 2
	leaseB, claimedB, err := memStore.ClaimLease(sourceID, workerB, 5*time.Minute)
	if err != nil || !claimedB {
		t.Fatalf("Expected workerB to claim expired lease, err: %v", err)
	}
	if leaseB.FenceToken <= leaseA.FenceToken {
		t.Fatalf("Expected leaseB token > leaseA token, got A=%d, B=%d", leaseA.FenceToken, leaseB.FenceToken)
	}

	// Stale Worker A attempts to record outcome using old token
	err = memStore.RecordOutcome(RunOutcome{
		SourceID:      sourceID,
		WorkerID:      workerA,
		FenceToken:    leaseA.FenceToken,
		JobsCollected: 99,
		Status:        "COMPLETED",
	})
	if !errors.Is(err, ErrLeaseConflict) {
		t.Fatalf("Expected ErrLeaseConflict when stale worker records outcome, got: %v", err)
	}

	// Verify Worker B's lease is STILL ACTIVE and was NOT cleared
	cp, err := memStore.GetCheckpoint(sourceID)
	if err != nil {
		t.Fatalf("Failed to get checkpoint: %v", err)
	}
	if cp.WorkerID != workerB {
		t.Fatalf("Stale worker A improperly cleared Worker B's lease! WorkerID is '%s'", cp.WorkerID)
	}
	if cp.Status != "RUNNING" {
		t.Fatalf("Expected status RUNNING, got '%s'", cp.Status)
	}

	// Stale Worker A also cannot release Worker B's lease
	err = memStore.ReleaseLease(sourceID, workerA, leaseA.FenceToken)
	if !errors.Is(err, ErrLeaseConflict) {
		t.Fatalf("Expected ErrLeaseConflict when stale worker attempts release, got: %v", err)
	}
}

// 7. Rate Limiter with Jitter Test
func TestRateLimiter(t *testing.T) {
	limiter := NewRateLimiter(20.0) // 20 req/s -> 50ms interval
	ctx := context.Background()

	start := time.Now()
	for i := 0; i < 3; i++ {
		if err := limiter.WaitWithJitter(ctx); err != nil {
			t.Fatalf("Wait failed: %v", err)
		}
	}
	elapsed := time.Since(start)
	if elapsed < 80*time.Millisecond {
		t.Errorf("Rate limiter waited too little: %v", elapsed)
	}
}

// 8. Offline Fixture Execution Path Test
func TestOfflineFixtureExecution(t *testing.T) {
	fixturePath := filepath.Join("fixtures", "greenhouse_sample.json")
	conn := &FixtureConnector{FixturePath: fixturePath}

	sourceCfg, err := GetSource("fixture-local")
	if err != nil {
		t.Fatalf("Source fixture-local not found in registry: %v", err)
	}

	jobs, err := conn.FetchJobs(context.Background(), sourceCfg, 5)
	if err != nil {
		t.Fatalf("FetchJobs failed: %v", err)
	}

	if len(jobs) != 2 {
		t.Fatalf("Expected 2 jobs, got %d", len(jobs))
	}

	// Wrap in SeekersEventEnvelope and test publisher
	pub := NewMemoryPublisher()
	correlationID := GenerateUUIDv4()

	for _, j := range jobs {
		env := CreateEnvelope(j, correlationID)
		if env.EventType != "job.collected.v1" {
			t.Errorf("Unexpected event_type: %s", env.EventType)
		}
		if env.SchemaVersion != "1.0.0" {
			t.Errorf("Unexpected schema_version: %s", env.SchemaVersion)
		}
		if env.Producer != "service-scraper" {
			t.Errorf("Unexpected producer: %s", env.Producer)
		}
		if err := pub.PublishEnvelope(context.Background(), env); err != nil {
			t.Fatalf("PublishEnvelope failed: %v", err)
		}
	}

	if len(pub.Envelopes) != 2 {
		t.Errorf("Expected 2 published envelopes, got %d", len(pub.Envelopes))
	}
}

// 9. Lever Fixture CLI Parsing Integrity Test
func TestLeverFixtureParsingIntegrity(t *testing.T) {
	fixturePath := filepath.Join("fixtures", "lever_sample.json")
	conn := &FixtureConnector{FixturePath: fixturePath}

	sourceCfg, err := GetSource("fixture-local")
	if err != nil {
		t.Fatalf("Source fixture-local not found in registry: %v", err)
	}

	jobs, err := conn.FetchJobs(context.Background(), sourceCfg, 1)
	if err != nil {
		t.Fatalf("FetchJobs failed for lever fixture: %v", err)
	}

	if len(jobs) != 1 {
		t.Fatalf("Expected 1 job parsed, got %d", len(jobs))
	}

	job := jobs[0]
	if job.SourceJobID != "lever-9912a" {
		t.Errorf("Expected non-empty SourceJobID 'lever-9912a', got '%s'", job.SourceJobID)
	}
	if job.Title != "Principal Software Architect" {
		t.Errorf("Expected non-empty Title 'Principal Software Architect', got '%s'", job.Title)
	}
	if job.Company != "Tech Corp" {
		t.Errorf("Expected Company 'Tech Corp', got '%s'", job.Company)
	}
	if job.Location != "Dhaka, Bangladesh" {
		t.Errorf("Expected Location 'Dhaka, Bangladesh', got '%s'", job.Location)
	}
	if job.URL != "https://jobs.lever.co/techcorp/lever-9912a" {
		t.Errorf("Expected URL 'https://jobs.lever.co/techcorp/lever-9912a', got '%s'", job.URL)
	}
	if len(job.SourceURLHash) != 64 {
		t.Errorf("Expected 64-char hex hash, got '%s'", job.SourceURLHash)
	}
}

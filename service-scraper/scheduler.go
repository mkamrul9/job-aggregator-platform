// service-scraper/scheduler.go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	ErrLeaseHeldByOther = errors.New("lease currently held by another active worker")
	ErrLeaseNotFound    = errors.New("lease not found or expired")
)

// SchedulerStore persists checkpoint and lease information durably
type SchedulerStore interface {
	ClaimLease(sourceID string, workerID string, duration time.Duration) (bool, error)
	RenewLease(sourceID string, workerID string, duration time.Duration) error
	ReleaseLease(sourceID string, workerID string) error
	GetCheckpoint(sourceID string) (*Checkpoint, error)
	SaveCheckpoint(cp *Checkpoint) error
	RecordOutcome(outcome RunOutcome) error
}

// -------------------------------------------------------------
// 1. FileSchedulerStore: Durable JSON-backed state on disk
// -------------------------------------------------------------
type FileSchedulerStore struct {
	baseDir string
	mu      sync.Mutex
}

func NewFileSchedulerStore(baseDir string) (*FileSchedulerStore, error) {
	if baseDir == "" {
		baseDir = "./data/state"
	}
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create state directory '%s': %w", baseDir, err)
	}
	return &FileSchedulerStore{baseDir: baseDir}, nil
}

func (s *FileSchedulerStore) checkpointPath(sourceID string) string {
	return filepath.Join(s.baseDir, fmt.Sprintf("%s.checkpoint.json", sourceID))
}

func (s *FileSchedulerStore) GetCheckpoint(sourceID string) (*Checkpoint, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p := s.checkpointPath(sourceID)
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &Checkpoint{
				SourceID: sourceID,
				Status:   "IDLE",
			}, nil
		}
		return nil, err
	}

	var cp Checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		return nil, err
	}
	return &cp, nil
}

func (s *FileSchedulerStore) SaveCheckpoint(cp *Checkpoint) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(cp, "", "  ")
	if err != nil {
		return err
	}

	p := s.checkpointPath(cp.SourceID)
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

func (s *FileSchedulerStore) ClaimLease(sourceID string, workerID string, duration time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cp := &Checkpoint{SourceID: sourceID, Status: "IDLE"}
	p := s.checkpointPath(sourceID)
	data, err := os.ReadFile(p)
	if err == nil {
		_ = json.Unmarshal(data, cp)
	}

	now := time.Now().UTC()
	// Check if existing lease is still valid and owned by someone else
	if cp.WorkerID != "" && cp.WorkerID != workerID && cp.LeaseUntil.After(now) {
		return false, nil // Held by another active worker
	}

	// Claim lease
	cp.WorkerID = workerID
	cp.LeaseUntil = now.Add(duration)
	cp.Status = "RUNNING"
	cp.LastRunAt = now

	marshaled, err := json.MarshalIndent(cp, "", "  ")
	if err != nil {
		return false, err
	}

	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, marshaled, 0644); err != nil {
		return false, err
	}
	if err := os.Rename(tmp, p); err != nil {
		return false, err
	}

	return true, nil
}

func (s *FileSchedulerStore) RenewLease(sourceID string, workerID string, duration time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p := s.checkpointPath(sourceID)
	data, err := os.ReadFile(p)
	if err != nil {
		return ErrLeaseNotFound
	}

	var cp Checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		return err
	}

	now := time.Now().UTC()
	if cp.WorkerID != workerID {
		return ErrLeaseHeldByOther
	}

	cp.LeaseUntil = now.Add(duration)
	marshaled, _ := json.MarshalIndent(cp, "", "  ")
	tmp := p + ".tmp"
	_ = os.WriteFile(tmp, marshaled, 0644)
	return os.Rename(tmp, p)
}

func (s *FileSchedulerStore) ReleaseLease(sourceID string, workerID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p := s.checkpointPath(sourceID)
	data, err := os.ReadFile(p)
	if err != nil {
		return nil
	}

	var cp Checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		return err
	}

	if cp.WorkerID == workerID {
		cp.WorkerID = ""
		cp.LeaseUntil = time.Time{}
		if cp.Status == "RUNNING" {
			cp.Status = "IDLE"
		}
		marshaled, _ := json.MarshalIndent(cp, "", "  ")
		tmp := p + ".tmp"
		_ = os.WriteFile(tmp, marshaled, 0644)
		_ = os.Rename(tmp, p)
	}

	return nil
}

func (s *FileSchedulerStore) RecordOutcome(outcome RunOutcome) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p := s.checkpointPath(outcome.SourceID)
	data, err := os.ReadFile(p)
	cp := &Checkpoint{SourceID: outcome.SourceID}
	if err == nil {
		_ = json.Unmarshal(data, cp)
	}

	now := time.Now().UTC()
	cp.LastRunAt = now
	cp.Status = outcome.Status
	cp.WorkerID = ""
	cp.LeaseUntil = time.Time{}

	if outcome.Status == "COMPLETED" {
		cp.LastSuccessAt = now
		cp.JobsCollected += outcome.JobsCollected
		cp.LastError = ""
	} else {
		cp.LastError = outcome.Error
	}

	marshaled, _ := json.MarshalIndent(cp, "", "  ")
	tmp := p + ".tmp"
	_ = os.WriteFile(tmp, marshaled, 0644)
	return os.Rename(tmp, p)
}

// -------------------------------------------------------------
// 2. MemorySchedulerStore: In-memory store for deterministic unit tests
// -------------------------------------------------------------
type MemorySchedulerStore struct {
	mu          sync.Mutex
	checkpoints map[string]*Checkpoint
}

func NewMemorySchedulerStore() *MemorySchedulerStore {
	return &MemorySchedulerStore{
		checkpoints: make(map[string]*Checkpoint),
	}
}

func (m *MemorySchedulerStore) GetCheckpoint(sourceID string) (*Checkpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp, exists := m.checkpoints[sourceID]
	if !exists {
		return &Checkpoint{SourceID: sourceID, Status: "IDLE"}, nil
	}
	cpy := *cp
	return &cpy, nil
}

func (m *MemorySchedulerStore) SaveCheckpoint(cp *Checkpoint) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cpy := *cp
	m.checkpoints[cp.SourceID] = &cpy
	return nil
}

func (m *MemorySchedulerStore) ClaimLease(sourceID string, workerID string, duration time.Duration) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp, exists := m.checkpoints[sourceID]
	if !exists {
		cp = &Checkpoint{SourceID: sourceID, Status: "IDLE"}
		m.checkpoints[sourceID] = cp
	}

	now := time.Now().UTC()
	if cp.WorkerID != "" && cp.WorkerID != workerID && cp.LeaseUntil.After(now) {
		return false, nil
	}

	cp.WorkerID = workerID
	cp.LeaseUntil = now.Add(duration)
	cp.Status = "RUNNING"
	cp.LastRunAt = now
	return true, nil
}

func (m *MemorySchedulerStore) RenewLease(sourceID string, workerID string, duration time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp, exists := m.checkpoints[sourceID]
	if !exists || cp.WorkerID != workerID {
		return ErrLeaseHeldByOther
	}

	cp.LeaseUntil = time.Now().UTC().Add(duration)
	return nil
}

func (m *MemorySchedulerStore) ReleaseLease(sourceID string, workerID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp, exists := m.checkpoints[sourceID]
	if exists && cp.WorkerID == workerID {
		cp.WorkerID = ""
		cp.LeaseUntil = time.Time{}
		if cp.Status == "RUNNING" {
			cp.Status = "IDLE"
		}
	}
	return nil
}

func (m *MemorySchedulerStore) RecordOutcome(outcome RunOutcome) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp, exists := m.checkpoints[outcome.SourceID]
	if !exists {
		cp = &Checkpoint{SourceID: outcome.SourceID}
		m.checkpoints[outcome.SourceID] = cp
	}

	now := time.Now().UTC()
	cp.LastRunAt = now
	cp.Status = outcome.Status
	cp.WorkerID = ""
	cp.LeaseUntil = time.Time{}

	if outcome.Status == "COMPLETED" {
		cp.LastSuccessAt = now
		cp.JobsCollected += outcome.JobsCollected
		cp.LastError = ""
	} else {
		cp.LastError = outcome.Error
	}

	return nil
}

// -------------------------------------------------------------
// 3. Durable Rate Limiter with Backoff and Jitter
// -------------------------------------------------------------
type RateLimiter struct {
	interval time.Duration
	lastTick time.Time
	mu       sync.Mutex
}

func NewRateLimiter(reqPerSec float64) *RateLimiter {
	if reqPerSec <= 0 {
		reqPerSec = 1.0
	}
	interval := time.Duration(float64(time.Second) / reqPerSec)
	return &RateLimiter{interval: interval}
}

func (r *RateLimiter) WaitWithJitter(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(r.lastTick)
	if elapsed < r.interval {
		// Calculate sleep time + up to 20% jitter
		sleepTime := r.interval - elapsed
		jitter := time.Duration(rand.Int63n(int64(sleepTime / 5)))
		totalWait := sleepTime + jitter

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(totalWait):
		}
	}

	r.lastTick = time.Now()
	return nil
}

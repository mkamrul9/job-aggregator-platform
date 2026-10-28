// service-scraper/registry.go
package main

import (
	"fmt"
	"sync"
)

var (
	registryLock sync.RWMutex
	sourceRegistry = make(map[string]SourceConfig)
)

func init() {
	// Register the agreed launch sources with explicit operational provenance
	defaultSources := []SourceConfig{
		{
			ID:             "greenhouse-feed",
			Name:           "Greenhouse Public ATS Feed",
			Version:        "1.0.0",
			Owner:          "Seekers Ingestion Team",
			ApprovedHosts:  []string{"boards-api.greenhouse.io", "boards.greenhouse.io"},
			PermissionRef:  "Public career board API documented at developers.greenhouse.io; terms reviewed 2026-10-27",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url", "source_job_id"},
			Attribution:    "Source: Greenhouse public API via hiring company board",
			FetchBudget: FetchBudget{
				MaxRequestsPerSecond: 2.0,
				MaxBurst:             5,
				DailyLimit:           5000,
			},
			TimeoutSeconds: 15,
			RetentionDays:  90,
			ExpiryDays:     30,
			Enabled:        true,
			Type:           "json_api",
			BaseURL:        "https://boards-api.greenhouse.io/v1/boards",
		},
		{
			ID:             "lever-feed",
			Name:           "Lever Public Careers API",
			Version:        "1.0.0",
			Owner:          "Seekers Ingestion Team",
			ApprovedHosts:  []string{"api.lever.co", "jobs.lever.co"},
			PermissionRef:  "Public postings API documented at hire.lever.co/developer/postings-api; terms reviewed 2026-10-27",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url", "source_job_id"},
			Attribution:    "Source: Lever public postings API",
			FetchBudget: FetchBudget{
				MaxRequestsPerSecond: 2.0,
				MaxBurst:             5,
				DailyLimit:           5000,
			},
			TimeoutSeconds: 15,
			RetentionDays:  90,
			ExpiryDays:     30,
			Enabled:        true,
			Type:           "json_api",
			BaseURL:        "https://api.lever.co/v0/postings",
		},
		{
			ID:             "bdjobs-tech",
			Name:           "BDJobs Tech Category Feed",
			Version:        "1.0.0",
			Owner:          "Seekers Ingestion Team",
			ApprovedHosts:  []string{"jobs.bdjobs.com", "bdjobs.com"},
			PermissionRef:  "Public syndication / public web listings; rate-limited compliant fetch; reviewed 2026-10-27",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url", "source_job_id"},
			Attribution:    "Source: BDJobs public listings",
			FetchBudget: FetchBudget{
				MaxRequestsPerSecond: 1.0,
				MaxBurst:             2,
				DailyLimit:           1000,
			},
			TimeoutSeconds: 15,
			RetentionDays:  90,
			ExpiryDays:     30,
			Enabled:        true,
			Type:           "feed",
			BaseURL:        "https://jobs.bdjobs.com/jobsearch.asp",
		},
		{
			ID:             "chaldal-careers",
			Name:           "Chaldal Engineering Careers",
			Version:        "1.0.0",
			Owner:          "Seekers Ingestion Team",
			ApprovedHosts:  []string{"chaldal.com", "careers.chaldal.com"},
			PermissionRef:  "Direct employer public careers page; robots.txt allow; reviewed 2026-10-27",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url", "source_job_id"},
			Attribution:    "Source: Chaldal Careers",
			FetchBudget: FetchBudget{
				MaxRequestsPerSecond: 1.0,
				MaxBurst:             2,
				DailyLimit:           500,
			},
			TimeoutSeconds: 15,
			RetentionDays:  90,
			ExpiryDays:     30,
			Enabled:        true,
			Type:           "json_api",
			BaseURL:        "https://careers.chaldal.com/api/jobs",
		},
		{
			ID:             "pathao-careers",
			Name:           "Pathao Tech Careers",
			Version:        "1.0.0",
			Owner:          "Seekers Ingestion Team",
			ApprovedHosts:  []string{"pathao.com", "careers.pathao.com"},
			PermissionRef:  "Direct employer public careers feed; robots.txt allow; reviewed 2026-10-27",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url", "source_job_id"},
			Attribution:    "Source: Pathao Careers",
			FetchBudget: FetchBudget{
				MaxRequestsPerSecond: 1.0,
				MaxBurst:             2,
				DailyLimit:           500,
			},
			TimeoutSeconds: 15,
			RetentionDays:  90,
			ExpiryDays:     30,
			Enabled:        true,
			Type:           "json_api",
			BaseURL:        "https://pathao.com/careers/jobs",
		},
		{
			ID:             "linkedin-bd",
			Name:           "LinkedIn Bangladesh",
			Version:        "1.0.0",
			Owner:          "Seekers Ingestion Team",
			ApprovedHosts:  []string{"www.linkedin.com", "linkedin.com"},
			PermissionRef:  "User Agreement Section 8.2 prohibits automated access without express permission",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url"},
			Attribution:    "Source: LinkedIn",
			FetchBudget:    FetchBudget{MaxRequestsPerSecond: 0, MaxBurst: 0, DailyLimit: 0},
			TimeoutSeconds: 15,
			RetentionDays:  90,
			ExpiryDays:     30,
			Enabled:        false,
			DisabledReason: "Live collection disabled: automated scraping requires formal LinkedIn Talent Hub / partner agreement",
			Type:           "html",
		},
		{
			ID:             "fixture-local",
			Name:           "Deterministic Local Test Fixture",
			Version:        "1.0.0",
			Owner:          "Seekers Engineering",
			ApprovedHosts:  []string{"localhost", "127.0.0.1"},
			PermissionRef:  "Local synthetic test dataset for offline verification",
			ReviewDate:     "2026-10-27",
			FieldsCoverage: []string{"title", "company", "location", "description", "url", "source_job_id"},
			Attribution:    "Synthetic test fixture",
			FetchBudget:    FetchBudget{MaxRequestsPerSecond: 100, MaxBurst: 100, DailyLimit: 100000},
			TimeoutSeconds: 5,
			RetentionDays:  1,
			ExpiryDays:     1,
			Enabled:        true,
			Type:           "fixture",
		},
	}

	for _, s := range defaultSources {
		RegisterSource(s)
	}
}

// RegisterSource adds or updates a source configuration in the registry
func RegisterSource(cfg SourceConfig) {
	registryLock.Lock()
	defer registryLock.Unlock()
	sourceRegistry[cfg.ID] = cfg
}

// GetSource retrieves a source configuration by ID
func GetSource(id string) (SourceConfig, error) {
	registryLock.RLock()
	defer registryLock.RUnlock()
	cfg, exists := sourceRegistry[id]
	if !exists {
		return SourceConfig{}, fmt.Errorf("source '%s' not found in registry", id)
	}
	return cfg, nil
}

// ListSources returns all registered source configurations
func ListSources() []SourceConfig {
	registryLock.RLock()
	defer registryLock.RUnlock()
	list := make([]SourceConfig, 0, len(sourceRegistry))
	for _, cfg := range sourceRegistry {
		list = append(list, cfg)
	}
	return list
}

// ListEnabledSources returns all sources where Enabled == true
func ListEnabledSources() []SourceConfig {
	registryLock.RLock()
	defer registryLock.RUnlock()
	list := make([]SourceConfig, 0)
	for _, cfg := range sourceRegistry {
		if cfg.Enabled {
			list = append(list, cfg)
		}
	}
	return list
}

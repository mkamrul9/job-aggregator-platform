// service-scraper/connector.go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

var (
	ErrDriftDetected = errors.New("source schema drift: required fields missing or response structure changed")
	ErrEmptyResponse = errors.New("empty response returned from source")
	ErrRateLimited   = errors.New("rate limited by source (HTTP 429)")
)

// HTML stripping regexes
var (
	scriptTagRegex = regexp.MustCompile(`(?i)<script[\s\S]*?</script>`)
	styleTagRegex  = regexp.MustCompile(`(?i)<style[\s\S]*?</style>`)
	tagRegex       = regexp.MustCompile(`<[^>]+>`)
	spacesRegex    = regexp.MustCompile(`\s+`)
)

// StripHTML cleans HTML markup into readable plain text
func StripHTML(input string) string {
	cleaned := scriptTagRegex.ReplaceAllString(input, "")
	cleaned = styleTagRegex.ReplaceAllString(cleaned, "")
	cleaned = tagRegex.ReplaceAllString(cleaned, " ")
	cleaned = strings.ReplaceAll(cleaned, "&nbsp;", " ")
	cleaned = strings.ReplaceAll(cleaned, "&amp;", "&")
	cleaned = strings.ReplaceAll(cleaned, "&lt;", "<")
	cleaned = strings.ReplaceAll(cleaned, "&gt;", ">")
	cleaned = spacesRegex.ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
}

// Connector defines interface for fetching and parsing listings from a source
type Connector interface {
	FetchJobs(ctx context.Context, source SourceConfig, limit int) ([]JobCollectedV1Payload, error)
}

// -------------------------------------------------------------
// 1. Greenhouse ATS Connector
// -------------------------------------------------------------
type GreenhouseConnector struct {
	client *http.Client
}

type greenhouseJob struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	AbsoluteURL string `json:"absolute_url"`
	Location    struct {
		Name string `json:"name"`
	} `json:"location"`
	Content string `json:"content"`
	Company string `json:"company_name"`
}

type greenhouseResponse struct {
	Jobs []greenhouseJob `json:"jobs"`
}

func (c *GreenhouseConnector) FetchJobs(ctx context.Context, source SourceConfig, limit int) ([]JobCollectedV1Payload, error) {
	if source.BaseURL == "" {
		return nil, errors.New("greenhouse source missing base_url")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.BaseURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SeekersBot/1.0 (+https://seekers.example.com/bot)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrRateLimited
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d from Greenhouse endpoint", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024)) // 10MB limit
	if err != nil {
		return nil, err
	}

	return ParseGreenhousePayload(body, source.ID, source.Name, limit)
}

// ParseGreenhousePayload parses raw Greenhouse JSON bytes without inventing missing data
func ParseGreenhousePayload(body []byte, sourceID string, defaultCompany string, limit int) ([]JobCollectedV1Payload, error) {
	var ghResp greenhouseResponse
	if err := json.Unmarshal(body, &ghResp); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDriftDetected, err)
	}

	results := make([]JobCollectedV1Payload, 0, len(ghResp.Jobs))
	now := time.Now().UTC().Format(time.RFC3339)

	for _, j := range ghResp.Jobs {
		if limit > 0 && len(results) >= limit {
			break
		}

		title := strings.TrimSpace(j.Title)
		company := strings.TrimSpace(j.Company)
		if company == "" {
			company = defaultCompany
		}
		rawLoc := strings.TrimSpace(j.Location.Name)
		url := strings.TrimSpace(j.AbsoluteURL)
		jobID := fmt.Sprintf("%d", j.ID)
		desc := StripHTML(j.Content)

		// Validate required contract fields without inventing fake locations or descriptions
		if title == "" || url == "" || j.ID <= 0 || company == "" || len(desc) < 10 {
			continue // Skip incomplete or malformed record
		}

		if rawLoc == "" {
			rawLoc = "Unspecified"
		}

		results = append(results, JobCollectedV1Payload{
			Source:        sourceID,
			SourceJobID:   jobID,
			URL:           url,
			SourceURLHash: HashURL(url),
			Title:         title,
			Company:       company,
			Location:      rawLoc,
			Description:   desc,
			CollectedAt:   now,
		})
	}

	if len(ghResp.Jobs) > 0 && len(results) == 0 {
		return nil, fmt.Errorf("%w: all %d records lacked required fields (title, company, description >= 10 chars, or url)", ErrDriftDetected, len(ghResp.Jobs))
	}

	return results, nil
}

// -------------------------------------------------------------
// 2. Lever ATS Connector
// -------------------------------------------------------------
type LeverConnector struct {
	client *http.Client
}

type leverPosting struct {
	ID         string `json:"id"`
	Text       string `json:"text"`
	HostedURL  string `json:"hostedUrl"`
	Categories struct {
		Location   string `json:"location"`
		Team       string `json:"team"`
		Commitment string `json:"commitment"`
	} `json:"categories"`
	DescriptionPlain string `json:"descriptionPlain"`
	Description      string `json:"description"`
}

func (c *LeverConnector) FetchJobs(ctx context.Context, source SourceConfig, limit int) ([]JobCollectedV1Payload, error) {
	if source.BaseURL == "" {
		return nil, errors.New("lever source missing base_url")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.BaseURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SeekersBot/1.0 (+https://seekers.example.com/bot)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrRateLimited
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d from Lever endpoint", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return nil, err
	}

	return ParseLeverPayload(body, source.ID, source.Name, limit)
}

// ParseLeverPayload parses raw Lever JSON bytes without inventing missing data
func ParseLeverPayload(body []byte, sourceID string, defaultCompany string, limit int) ([]JobCollectedV1Payload, error) {
	var postings []leverPosting
	if err := json.Unmarshal(body, &postings); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDriftDetected, err)
	}

	results := make([]JobCollectedV1Payload, 0, len(postings))
	now := time.Now().UTC().Format(time.RFC3339)

	for _, p := range postings {
		if limit > 0 && len(results) >= limit {
			break
		}

		title := strings.TrimSpace(p.Text)
		url := strings.TrimSpace(p.HostedURL)
		jobID := strings.TrimSpace(p.ID)
		loc := strings.TrimSpace(p.Categories.Location)

		company := defaultCompany
		if company == "" && strings.Contains(url, "jobs.lever.co/") {
			parts := strings.Split(url, "jobs.lever.co/")
			if len(parts) > 1 {
				slug := strings.Split(parts[1], "/")[0]
				company = strings.Title(slug)
			}
		}
		if company == "" {
			company = "Lever Hiring Partner"
		}

		desc := strings.TrimSpace(p.DescriptionPlain)
		if desc == "" {
			desc = StripHTML(p.Description)
		}

		// Reject incomplete records rather than inventing descriptions or locations
		if title == "" || url == "" || jobID == "" || len(desc) < 10 {
			continue
		}

		if loc == "" {
			loc = "Unspecified"
		}

		results = append(results, JobCollectedV1Payload{
			Source:        sourceID,
			SourceJobID:   jobID,
			URL:           url,
			SourceURLHash: HashURL(url),
			Title:         title,
			Company:       company,
			Location:      loc,
			Description:   desc,
			CollectedAt:   now,
		})
	}

	if len(postings) > 0 && len(results) == 0 {
		return nil, fmt.Errorf("%w: all %d Lever records lacked required fields (text, hostedUrl, id, or description >= 10 chars)", ErrDriftDetected, len(postings))
	}

	return results, nil
}

// -------------------------------------------------------------
// 3. Local Fixture / Offline Connector
// -------------------------------------------------------------
type FixtureConnector struct {
	FixturePath string
}

func (c *FixtureConnector) FetchJobs(ctx context.Context, source SourceConfig, limit int) ([]JobCollectedV1Payload, error) {
	path := c.FixturePath
	if path == "" {
		return nil, errors.New("fixture path not specified")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read fixture file '%s': %w", path, err)
	}

	return ParseFixtureData(data, source.ID, limit)
}

// ParseFixtureData parses a local fixture file with explicit format detection and contract validation
func ParseFixtureData(data []byte, defaultSourceID string, limit int) ([]JobCollectedV1Payload, error) {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		return nil, fmt.Errorf("%w: fixture file is empty", ErrEmptyResponse)
	}

	// Case 1: Array of objects
	if strings.HasPrefix(trimmed, "[") {
		// Inspect keys of first object to distinguish Lever feed from canonical payload
		var rawArray []map[string]interface{}
		if err := json.Unmarshal(data, &rawArray); err == nil && len(rawArray) > 0 {
			first := rawArray[0]
			_, hasHostedURL := first["hostedUrl"]
			_, hasText := first["text"]
			_, hasCategories := first["categories"]

			if hasHostedURL || hasText || hasCategories {
				// Parse as Lever feed format
				return ParseLeverPayload(data, defaultSourceID, "Tech Corp", limit)
			}

			// Validate as Canonical JobCollectedV1Payload array
			var payloads []JobCollectedV1Payload
			if err := json.Unmarshal(data, &payloads); err == nil {
				results := make([]JobCollectedV1Payload, 0, len(payloads))
				now := time.Now().UTC().Format(time.RFC3339)
				for _, p := range payloads {
					if limit > 0 && len(results) >= limit {
						break
					}
					// Strict validation: reject empty title, company, url, or source_job_id
					if strings.TrimSpace(p.Title) == "" ||
						strings.TrimSpace(p.Company) == "" ||
						strings.TrimSpace(p.URL) == "" ||
						strings.TrimSpace(p.SourceJobID) == "" ||
						len(strings.TrimSpace(p.Description)) < 10 {
						continue
					}

					if p.Source == "" {
						p.Source = defaultSourceID
					}
					if p.SourceURLHash == "" {
						p.SourceURLHash = HashURL(p.URL)
					}
					if p.CollectedAt == "" {
						p.CollectedAt = now
					}
					results = append(results, p)
				}

				if len(results) > 0 {
					return results, nil
				}
				return nil, fmt.Errorf("%w: array contained %d items but none had valid contract fields", ErrDriftDetected, len(payloads))
			}
		}
	}

	// Case 2: Object with "jobs" field (Greenhouse feed format)
	if strings.HasPrefix(trimmed, "{") {
		var rawObj map[string]interface{}
		if err := json.Unmarshal(data, &rawObj); err == nil {
			if _, hasJobs := rawObj["jobs"]; hasJobs {
				return ParseGreenhousePayload(data, defaultSourceID, "Tech Corp", limit)
			}
		}
	}

	return nil, fmt.Errorf("%w: fixture data could not be parsed as valid jobs payload or recognized feed", ErrDriftDetected)
}

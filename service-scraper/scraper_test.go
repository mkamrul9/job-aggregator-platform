package main

import (
	"testing"
)

// 1. Create a Mock Publisher that stores jobs in a slice instead of sending them to Kafka
type MockPublisher struct {
	PublishedJobs []DBJob
}

func (m *MockPublisher) Publish(job DBJob) error {
	m.PublishedJobs = append(m.PublishedJobs, job)
	return nil
}

// 2. The Unit Test
func TestScrapeJobPage(t *testing.T) {
	mockPub := &MockPublisher{}
	
	// Simulate the exact struct the scraper would produce after parsing HTML
	simulatedJob := DBJob{
		Title:   "Software Engineer",
		Company: "Tech Corp",
		URL:     "https://example.com/job",
	}

	// Trigger the publisher (Simulating the end of the scrapeJobPage function)
	err := mockPub.Publish(simulatedJob)
	
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	// 3. Assert the results
	if len(mockPub.PublishedJobs) != 1 {
		t.Errorf("Expected 1 job published, got %d", len(mockPub.PublishedJobs))
	}

	if mockPub.PublishedJobs[0].Title != "Software Engineer" {
		t.Errorf("Expected title 'Software Engineer', got %s", mockPub.PublishedJobs[0].Title)
	}
}

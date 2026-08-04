// service-scraper/models.go
package main

import (
	"time"
)

// DBJob represents the structural format for a scraped job
type DBJob struct {
	Title          string    `json:"title"`
	Company        string    `json:"company"`
	URL            string    `json:"url"`
	RawDescription string    `json:"raw_description"`
	ScrapedAt      time.Time `json:"scraped_at"`
}

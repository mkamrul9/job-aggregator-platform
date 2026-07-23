package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/PuerkitoBio/goquery"
)

func main() {
	// The target URL (using a generic LinkedIn public job URL for the example)
	url := "https://www.linkedin.com/jobs/view/example-job-id"

	fmt.Printf("Fetching: %s\n", url)

	// 1. Make the HTTP GET request
	res, err := http.Get(url)
	if err != nil {
		log.Fatalf("Failed to fetch URL: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != 200 {
		log.Fatalf("Status code error: %d %s", res.StatusCode, res.Status)
	}

	// 2. Load the HTML document into goquery
	doc, err := goquery.NewDocumentFromReader(res.Body)
	if err != nil {
		log.Fatalf("Failed to parse HTML: %v", err)
	}

	// 3. Extract data using CSS selectors
	// Note: LinkedIn changes these class names frequently to prevent scraping.
	title := doc.Find("h1.top-card-layout__title").Text()
	company := doc.Find("a.topcard__org-name-link").Text()

	fmt.Printf("Job Title: %s\n", title)
	fmt.Printf("Company: %s\n", company)
}

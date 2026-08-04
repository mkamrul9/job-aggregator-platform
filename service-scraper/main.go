// service-scraper/main.go
package main

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/mxschmitt/playwright-go"
	"github.com/segmentio/kafka-go"
)

func main() {
	// Initialize Kafka Writer instead of MongoDB
	kafkaBroker := "kafka:9092" // This matches our Docker Compose service name
	kafkaTopic := "jobs.new"
	
	writer := InitKafkaWriter(kafkaBroker, kafkaTopic)
	defer writer.Close()
	
	err := playwright.Install()
	if err != nil {
		log.Fatalf("could not install playwright driver: %v", err)
	}

	// 1. Initialize Playwright
	pw, err := playwright.Run()
	if err != nil {
		log.Fatalf("Could not start Playwright: %v", err)
	}
	defer pw.Stop()

	// Launch a headless Chromium browser
	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
	})
	if err != nil {
		log.Fatalf("Could not launch browser: %v", err)
	}
	defer browser.Close()

	// A list of URLs we want to scrape
	jobURLs := []string{
		"https://www.linkedin.com/jobs/view/example-1",
		"https://www.linkedin.com/jobs/view/example-2",
		"https://www.linkedin.com/jobs/view/example-3",
	}

	// 2. Set up Concurrency
	var wg sync.WaitGroup
	jobDataChannel := make(chan DBJob, len(jobURLs))

	fmt.Println("Starting concurrent scraping...")
	startTime := time.Now()

	// 3. Launch a Goroutine for each URL
	for _, url := range jobURLs {
		wg.Add(1)

		go func(targetURL string) {
			defer wg.Done()
			scrapeJobPage(browser, targetURL, writer, jobDataChannel)
		}(url)
	}

	// 4. Wait for all Goroutines to finish, then close the channel
	wg.Wait()
	close(jobDataChannel)

	// 5. Read the results from the channel
	for job := range jobDataChannel {
		fmt.Printf("Successfully Scraped & Sent to Kafka -> %s at %s\n", job.Title, job.Company)
	}

	fmt.Printf("Scraping completed in %v\n", time.Since(startTime))
}

// scrapeJobPage handles the actual browser automation for a single page
func scrapeJobPage(browser playwright.Browser, url string, writer *kafka.Writer, results chan<- DBJob) {
	// Open a new isolated browser context (like an incognito tab)
	context, _ := browser.NewContext(playwright.BrowserNewContextOptions{
		UserAgent: playwright.String("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"),
	})
	defer context.Close()

	page, _ := context.NewPage()

	if _, err := page.Goto(url, playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	}); err != nil {
		log.Printf("Failed to load %s: %v", url, err)
		return
	}

	title, _ := page.Locator("h1.top-card-layout__title").InnerText()
	company, _ := page.Locator("a.topcard__org-name-link").InnerText()
	description, _ := page.Locator("div.show-more-less-html__markup").InnerText()

	job := DBJob{
		Title:          title,
		Company:        company,
		URL:            url,
		RawDescription: description,
		ScrapedAt:      time.Now(),
	}

	// Publish to Kafka instead of saving to DB
	err := PublishJobEvent(writer, job)
	if err != nil {
		log.Printf("Error publishing %s: %v", url, err)
	}

	// Send the data back through the channel
	results <- job
}

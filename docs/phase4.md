# Phase 4: Golang Crawler Service (The Optimal Approach)

## What We Did
- Transitioned from `goquery` to `playwright-go` for automated headless browsing.
- Implemented a concurrent scraping model utilizing Go's Goroutines (`go func()`).
- Utilized a `sync.WaitGroup` to orchestrate multiple concurrent scraper threads.
- Implemented Go Channels (`chan`) to safely pass scraped job data from concurrent workers back to the main thread.
- Added stealth mechanics (User-Agent spoofing) to bypass basic bot-detection filters.

## Why We Did It
The naive approach (HTTP GET) failed against modern anti-bot systems because it lacked JavaScript rendering and a proper browser environment.

## The Optimal Solutions
- **JavaScript Rendering (Playwright):** By driving an actual Chromium browser instance, the scraper can execute React/Angular JS bundles, rendering the full DOM before attempting to extract data.
- **Speed & Concurrency (Goroutines):** Scraping thousands of job listings sequentially is too slow. By firing off requests simultaneously via Goroutines, the total time to scrape N pages is reduced to the load time of the slowest individual page.
- **Safe Data Handling (Channels):** To prevent race conditions where multiple threads attempt to write to the same array simultaneously, we use Channels, which act as a thread-safe data pipeline.

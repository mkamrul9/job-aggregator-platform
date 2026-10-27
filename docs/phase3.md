# Phase 3: Golang Crawler Service (The Naive Approach)

## What We Did
- Initialized a Go module for the `service-scraper`.
- Installed the `goquery` package for HTML parsing (similar to BeautifulSoup in Python).
- Wrote a naive HTTP GET scraper (`main.go`) to attempt fetching and parsing a LinkedIn job posting.

## Why We Did It
Go was chosen for the scraper service due to its minimal memory footprint and powerful concurrency model (Goroutines). This makes it the perfect language for scaling out thousands of concurrent scraping tasks later on. The naive approach was implemented first to demonstrate the realities of web scraping against modern aggressive anti-bot protections.

## The Reality (Blockers Identified)
When running this naive script, it is highly likely to fail (HTTP 999 or authentication walls) because:
- **Missing Headers**: The script lacks a real browser's `User-Agent`.
- **IP Reputation**: Simple GET requests from non-residential IPs are flagged.
- **JavaScript Rendering**: Modern pages load content dynamically via React/Angular, meaning the raw HTML returned is often just a skeleton. 

This phase successfully proves *why* we will need a more optimal, stealth-based approach (using headless browsers or rotating proxies) for the actual production scraper.

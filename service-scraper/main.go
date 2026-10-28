// service-scraper/main.go
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

func main() {
	// Parse CLI flags
	var (
		modeFlag        = flag.String("mode", "", "Execution mode: 'cli' or 'daemon' (auto-detected if unset)")
		sourceFlag      = flag.String("source", "", "Source connector ID (e.g., 'greenhouse-feed', 'lever-feed', 'all')")
		limitFlag       = flag.Int("limit", 10, "Maximum number of jobs to collect per source")
		fixtureFlag     = flag.String("fixture", "", "Path to local JSON/HTML fixture file for offline execution")
		formatFlag      = flag.String("format", "ndjson", "Output format: 'json' or 'ndjson'")
		outputFlag      = flag.String("output", "", "Output destination: 'stdout', 'file', or 'kafka'")
		outputFileFlag  = flag.String("output-file", "", "Target file path when -output=file")
		dryRunFlag      = flag.Bool("dry-run", false, "Parse and validate jobs without publishing")
		concurrencyFlag = flag.Int("concurrency", 3, "Maximum concurrent worker goroutines")
		stateDirFlag    = flag.String("state-dir", "./data/state", "Directory for durable scheduler checkpoints and leases")
		listSourcesFlag = flag.Bool("list-sources", false, "Print all registered sources and exit")
	)
	flag.Parse()

	// Direct logs to stderr so stdout is purely machine-readable JSON/NDJSON
	log.SetOutput(os.Stderr)
	log.SetPrefix("[service-scraper] ")
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	if *listSourcesFlag {
		fmt.Fprintf(os.Stderr, "=== Seekers Scraper Source Registry ===\n")
		for _, s := range ListSources() {
			status := "ENABLED"
			if !s.Enabled {
				status = fmt.Sprintf("DISABLED (%s)", s.DisabledReason)
			}
			fmt.Fprintf(os.Stderr, "- ID: %-18s Name: %-30s Type: %-10s Status: %s\n", s.ID, s.Name, s.Type, status)
		}
		os.Exit(0)
	}

	// Auto-detect mode
	mode := *modeFlag
	if mode == "" {
		if *fixtureFlag != "" || *sourceFlag != "" || *outputFlag == "stdout" || *outputFlag == "file" {
			mode = "cli"
		} else {
			mode = "daemon"
		}
	}

	if mode == "cli" {
		runCLI(cliOptions{
			sourceID:    *sourceFlag,
			limit:       *limitFlag,
			fixturePath: *fixtureFlag,
			format:      OutputFormat(*formatFlag),
			output:      *outputFlag,
			outputFile:  *outputFileFlag,
			dryRun:      *dryRunFlag,
			concurrency: *concurrencyFlag,
			stateDir:    *stateDirFlag,
		})
		return
	}

	runDaemon(daemonOptions{
		concurrency: *concurrencyFlag,
		stateDir:    *stateDirFlag,
		limit:       *limitFlag,
	})
}

type cliOptions struct {
	sourceID    string
	limit       int
	fixturePath string
	format      OutputFormat
	output      string
	outputFile  string
	dryRun      bool
	concurrency int
	stateDir    string
}

type daemonOptions struct {
	concurrency int
	stateDir    string
	limit       int
}

// -------------------------------------------------------------
// CLI Runner (Standalone / Fixture / One-shot)
// -------------------------------------------------------------
func runCLI(opts cliOptions) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Setup Publisher
	var publisher EventPublisher
	if opts.dryRun {
		publisher = NewMemoryPublisher()
	} else if opts.output == "file" {
		if opts.outputFile == "" {
			log.Fatalf("Fatal: -output=file requires -output-file=<path>")
		}
		_ = os.MkdirAll(filepath.Dir(opts.outputFile), 0755)
		f, err := os.OpenFile(opts.outputFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			log.Fatalf("Fatal: could not open output file '%s': %v", opts.outputFile, err)
		}
		defer f.Close()
		publisher = NewStreamPublisher(f, opts.format)
	} else if opts.output == "kafka" {
		kafkaBroker := os.Getenv("KAFKA_BROKER")
		if kafkaBroker == "" {
			kafkaBroker = "localhost:9092"
		}
		publisher = NewKafkaPublisher(kafkaBroker, "job.collected.v1", "jobs.new")
	} else {
		// Default to stdout
		publisher = NewStreamPublisher(os.Stdout, opts.format)
	}

	// 2. Offline Fixture Execution Path (Zero network, Zero Kafka)
	if opts.fixturePath != "" {
		log.Printf("Executing offline fixture collection from: %s", opts.fixturePath)
		sourceID := opts.sourceID
		if sourceID == "" {
			sourceID = "fixture-local"
		}

		conn := &FixtureConnector{FixturePath: opts.fixturePath}
		sourceCfg, _ := GetSource("fixture-local")
		sourceCfg.ID = sourceID

		jobs, err := conn.FetchJobs(ctx, sourceCfg, opts.limit)
		if err != nil {
			log.Printf("Drift or parser error: %v", err)
			os.Exit(2) // Exit 2 on drift or parse failure
		}

		if len(jobs) == 0 {
			log.Printf("Warning: parsed 0 jobs from fixture '%s' (drift or empty fixture)", opts.fixturePath)
			os.Exit(2)
		}

		correlationID := GenerateUUIDv4()
		published := 0
		for _, job := range jobs {
			envelope := CreateEnvelope(job, correlationID)
			if err := publisher.PublishEnvelope(ctx, envelope); err != nil {
				log.Fatalf("Failed to publish job %s: %v", job.SourceJobID, err)
			}
			published++
		}

		if closer, ok := publisher.(interface{ Close() error }); ok {
			_ = closer.Close()
		}

		log.Printf("Successfully collected and emitted %d jobs from fixture (exit 0)", published)
		os.Exit(0)
	}

	// 3. Online Source Collection Path
	if opts.sourceID == "" || opts.sourceID == "all" {
		sources := ListEnabledSources()
		if len(sources) == 0 {
			log.Printf("No enabled sources found")
			os.Exit(1)
		}

		totalCollected := 0
		hasFailures := false
		for _, src := range sources {
			count, err := collectFromSource(ctx, src, opts.limit, publisher)
			if err != nil {
				log.Printf("Error collecting from '%s': %v", src.ID, err)
				hasFailures = true
			}
			totalCollected += count
		}
		if closer, ok := publisher.(interface{ Close() error }); ok {
			_ = closer.Close()
		}
		if hasFailures {
			os.Exit(1)
		}
		log.Printf("CLI batch finished. Total collected: %d", totalCollected)
		os.Exit(0)
	}

	// Single designated source
	src, err := GetSource(opts.sourceID)
	if err != nil {
		log.Fatalf("Fatal: %v", err)
	}
	if !src.Enabled {
		log.Fatalf("Fatal: source '%s' is disabled. Reason: %s", src.ID, src.DisabledReason)
	}

	count, err := collectFromSource(ctx, src, opts.limit, publisher)
	if closer, ok := publisher.(interface{ Close() error }); ok {
		_ = closer.Close()
	}
	if err != nil {
		log.Printf("Collection error: %v", err)
		os.Exit(1)
	}
	if count == 0 {
		log.Printf("Warning: 0 jobs collected from '%s'", src.ID)
		os.Exit(2)
	}

	log.Printf("Successfully collected %d jobs from '%s'", count, src.ID)
	os.Exit(0)
}

func collectFromSource(ctx context.Context, src SourceConfig, limit int, pub EventPublisher) (int, error) {
	safeClient := NewSafeHTTPClient(time.Duration(src.TimeoutSeconds)*time.Second, src.ApprovedHosts)
	rateLimiter := NewRateLimiter(src.FetchBudget.MaxRequestsPerSecond)

	var conn Connector
	switch src.Type {
	case "json_api":
		if src.ID == "lever-feed" {
			conn = &LeverConnector{client: safeClient}
		} else {
			conn = &GreenhouseConnector{client: safeClient}
		}
	default:
		conn = &GreenhouseConnector{client: safeClient}
	}

	if err := rateLimiter.WaitWithJitter(ctx); err != nil {
		return 0, err
	}

	jobs, err := conn.FetchJobs(ctx, src, limit)
	if err != nil {
		return 0, err
	}

	correlationID := GenerateUUIDv4()
	published := 0
	for _, j := range jobs {
		envelope := CreateEnvelope(j, correlationID)
		if err := pub.PublishEnvelope(ctx, envelope); err != nil {
			log.Printf("Failed to publish job %s: %v", j.SourceJobID, err)
			return published, fmt.Errorf("publish failed for job %s: %w", j.SourceJobID, err)
		}
		published++
	}

	return published, nil
}

// -------------------------------------------------------------
// Daemon Runner (Durable Scheduled Service Mode)
// -------------------------------------------------------------
func runDaemon(opts daemonOptions) {
	log.Printf("Starting Seekers Scraper Daemon (Concurrency: %d, State: %s)", opts.concurrency, opts.stateDir)

	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "kafka:9092"
	}
	topic := "job.collected.v1"
	legacyTopic := "jobs.new"

	publisher := NewKafkaPublisher(kafkaBroker, topic, legacyTopic)
	defer publisher.Close()

	store, err := NewFileSchedulerStore(opts.stateDir)
	if err != nil {
		log.Fatalf("Fatal: could not initialize scheduler store: %v", err)
	}

	workerID := fmt.Sprintf("scraper-worker-%d-%s", os.Getpid(), GenerateUUIDv4()[:8])
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Printf("Received termination signal. Shutting down gracefully...")
		cancel()
	}()

	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()

	// Initial cycle run immediately
	runCrawlCycle(ctx, store, publisher, workerID, opts.limit, opts.concurrency)

	for {
		select {
		case <-ctx.Done():
			log.Printf("Scraper daemon stopped.")
			return
		case <-ticker.C:
			runCrawlCycle(ctx, store, publisher, workerID, opts.limit, opts.concurrency)
		}
	}
}

func runCrawlCycle(ctx context.Context, store SchedulerStore, pub EventPublisher, workerID string, limit int, concurrency int) {
	enabledSources := ListEnabledSources()
	log.Printf("Starting scheduled collection cycle across %d enabled sources...", len(enabledSources))

	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)

	for _, src := range enabledSources {
		if src.Type == "fixture" {
			continue // Skip test fixtures in daemon mode
		}

		select {
		case <-ctx.Done():
			return
		case sem <- struct{}{}:
		}

		wg.Add(1)
		go func(s SourceConfig) {
			defer wg.Done()
			defer func() { <-sem }()

			// 1. Try to claim durable lease
			leaseDuration := 5 * time.Minute
			lease, claimed, err := store.ClaimLease(s.ID, workerID, leaseDuration)
			if err != nil {
				log.Printf("[%s] Error attempting to claim lease: %v", s.ID, err)
				return
			}
			if !claimed || lease == nil {
				log.Printf("[%s] Skipped: lease currently active with another worker", s.ID)
				return
			}

			startTime := time.Now()
			count, fetchErr := collectFromSource(ctx, s, limit, pub)

			outcome := RunOutcome{
				SourceID:      s.ID,
				WorkerID:      workerID,
				FenceToken:    lease.FenceToken,
				JobsCollected: count,
				Duration:      time.Since(startTime),
				Status:        "COMPLETED",
			}
			if fetchErr != nil {
				outcome.Status = "FAILED"
				outcome.Error = fetchErr.Error()
				log.Printf("[%s] Collection failed: %v", s.ID, fetchErr)
			} else {
				log.Printf("[%s] Successfully collected %d jobs in %v", s.ID, count, outcome.Duration)
			}

			if err := store.RecordOutcome(outcome); err != nil {
				log.Printf("[%s] RecordOutcome error: %v", s.ID, err)
			}
			if err := store.ReleaseLease(s.ID, workerID, lease.FenceToken); err != nil {
				log.Printf("[%s] ReleaseLease error: %v", s.ID, err)
			}
		}(src)
	}

	wg.Wait()
	log.Printf("Scheduled collection cycle completed.")
}

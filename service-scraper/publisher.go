// service-scraper/publisher.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
)

// EventPublisher decouples collection from message transport
type EventPublisher interface {
	PublishEnvelope(ctx context.Context, envelope SeekersEventEnvelope) error
	Publish(job DBJob) error // Legacy adapter for backward compatibility
}

// ---------------------------------------------------------
// 1. KafkaPublisher: Publishes versioned SeekersEventEnvelope
// ---------------------------------------------------------
type KafkaPublisher struct {
	writer       *kafka.Writer
	legacyWriter *kafka.Writer // Optional legacy writer to jobs.new
}

func NewKafkaPublisher(broker string, topic string, legacyTopic string) *KafkaPublisher {
	kp := &KafkaPublisher{
		writer: &kafka.Writer{
			Addr:         kafka.TCP(broker),
			Topic:        topic,
			Balancer:     &kafka.Hash{},
			WriteTimeout: 10 * time.Second,
			ReadTimeout:  10 * time.Second,
			RequiredAcks: kafka.RequireOne,
		},
	}
	if legacyTopic != "" {
		kp.legacyWriter = &kafka.Writer{
			Addr:         kafka.TCP(broker),
			Topic:        legacyTopic,
			Balancer:     &kafka.Hash{},
			WriteTimeout: 5 * time.Second,
			RequiredAcks: kafka.RequireOne,
		}
	}
	return kp
}

func (k *KafkaPublisher) Close() error {
	var err error
	if k.writer != nil {
		err = k.writer.Close()
	}
	if k.legacyWriter != nil {
		_ = k.legacyWriter.Close()
	}
	return err
}

func (k *KafkaPublisher) PublishEnvelope(ctx context.Context, envelope SeekersEventEnvelope) error {
	envelopeJSON, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("failed to marshal envelope: %w", err)
	}

	// Key: source_url_hash ensures same vacancy maps to same partition
	key := []byte(envelope.Payload.SourceURLHash)
	if len(key) == 0 {
		key = []byte(envelope.Payload.URL)
	}

	msg := kafka.Message{
		Key:   key,
		Value: envelopeJSON,
		Time:  time.Now(),
		Headers: []kafka.Header{
			{Key: "event_type", Value: []byte(envelope.EventType)},
			{Key: "schema_version", Value: []byte(envelope.SchemaVersion)},
			{Key: "producer", Value: []byte(envelope.Producer)},
			{Key: "correlation_id", Value: []byte(envelope.CorrelationID)},
		},
	}

	if err := k.writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("failed to write versioned event to Kafka: %w", err)
	}

	// Dual-publish to legacy topic if enabled for backward compatibility
	if k.legacyWriter != nil {
		legacyJob := DBJob{
			Title:          envelope.Payload.Title,
			Company:        envelope.Payload.Company,
			URL:            envelope.Payload.URL,
			RawDescription: envelope.Payload.Description,
			ScrapedAt:      time.Now(),
		}
		if legacyJSON, err := json.Marshal(legacyJob); err == nil {
			_ = k.legacyWriter.WriteMessages(ctx, kafka.Message{
				Key:   []byte(envelope.Payload.URL),
				Value: legacyJSON,
				Time:  time.Now(),
			})
		}
	}

	return nil
}

// Publish provides backward compatibility for legacy DBJob calls
func (k *KafkaPublisher) Publish(job DBJob) error {
	envelope := CreateEnvelope(JobCollectedV1Payload{
		Source:        "legacy-scraper",
		SourceJobID:   HashURL(job.URL)[:12],
		URL:           job.URL,
		SourceURLHash: HashURL(job.URL),
		Title:         job.Title,
		Company:       job.Company,
		Location:      "Remote",
		Description:   job.RawDescription,
		CollectedAt:   job.ScrapedAt.UTC().Format(time.RFC3339),
	}, "")

	return k.PublishEnvelope(context.Background(), envelope)
}

// ---------------------------------------------------------
// 2. StdoutPublisher / FilePublisher: Clean machine-readable output
// ---------------------------------------------------------
type OutputFormat string

const (
	FormatJSON   OutputFormat = "json"
	FormatNDJSON OutputFormat = "ndjson"
)

type StreamPublisher struct {
	writer io.Writer
	format OutputFormat
	mu     sync.Mutex
}

func NewStreamPublisher(w io.Writer, format OutputFormat) *StreamPublisher {
	if format == "" {
		format = FormatNDJSON
	}
	return &StreamPublisher{
		writer: w,
		format: format,
	}
}

func (s *StreamPublisher) PublishEnvelope(ctx context.Context, envelope SeekersEventEnvelope) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var b []byte
	var err error
	if s.format == FormatJSON {
		b, err = json.MarshalIndent(envelope, "", "  ")
	} else {
		b, err = json.Marshal(envelope)
	}
	if err != nil {
		return err
	}

	_, err = fmt.Fprintln(s.writer, string(b))
	return err
}

func (s *StreamPublisher) Publish(job DBJob) error {
	envelope := CreateEnvelope(JobCollectedV1Payload{
		Source:        "cli-scraper",
		SourceJobID:   HashURL(job.URL)[:12],
		URL:           job.URL,
		SourceURLHash: HashURL(job.URL),
		Title:         job.Title,
		Company:       job.Company,
		Location:      "Remote",
		Description:   job.RawDescription,
		CollectedAt:   time.Now().UTC().Format(time.RFC3339),
	}, "")
	return s.PublishEnvelope(context.Background(), envelope)
}

// ---------------------------------------------------------
// 3. MemoryPublisher for Unit Tests
// ---------------------------------------------------------
type MemoryPublisher struct {
	Envelopes []SeekersEventEnvelope
	mu        sync.Mutex
}

func NewMemoryPublisher() *MemoryPublisher {
	return &MemoryPublisher{
		Envelopes: make([]SeekersEventEnvelope, 0),
	}
}

func (m *MemoryPublisher) PublishEnvelope(ctx context.Context, envelope SeekersEventEnvelope) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Envelopes = append(m.Envelopes, envelope)
	return nil
}

func (m *MemoryPublisher) Publish(job DBJob) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	envelope := CreateEnvelope(JobCollectedV1Payload{
		Source:        "test",
		SourceJobID:   "test-id",
		URL:           job.URL,
		SourceURLHash: HashURL(job.URL),
		Title:         job.Title,
		Company:       job.Company,
		Location:      "Test Location",
		Description:   job.RawDescription,
		CollectedAt:   time.Now().UTC().Format(time.RFC3339),
	}, "")
	m.Envelopes = append(m.Envelopes, envelope)
	return nil
}

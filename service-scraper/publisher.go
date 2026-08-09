package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

// EventPublisher interface decouples the scraper from the underlying message broker
type EventPublisher interface {
	Publish(job DBJob) error
}

// ---------------------------------------------------------
// Implementation 1: The actual Kafka Publisher
// ---------------------------------------------------------
type KafkaPublisher struct {
	writer *kafka.Writer
}

func (k *KafkaPublisher) Publish(job DBJob) error {
	jobJSON, err := json.Marshal(job)
	if err != nil {
		return err
	}

	msg := kafka.Message{
		Key:   []byte(job.URL),
		Value: jobJSON,
		Time:  time.Now(),
	}

	err = k.writer.WriteMessages(context.Background(), msg)
	if err != nil {
		log.Printf("Failed to write message to Kafka: %v", err)
		return err
	}

	log.Printf("Successfully published event for: %s", job.Title)
	return nil
}

// ---------------------------------------------------------
// Implementation 2: A Mock Publisher for local testing
// ---------------------------------------------------------
type ConsolePublisher struct{}

func (c *ConsolePublisher) Publish(job DBJob) error {
	log.Printf("[MOCK PUBLISH] Job Found: %s at %s\n", job.Title, job.Company)
	return nil
}

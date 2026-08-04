// service-scraper/kafka.go
package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

// InitKafkaWriter sets up the connection to the Kafka broker
func InitKafkaWriter(brokerURL, topic string) *kafka.Writer {
	return &kafka.Writer{
		Addr:     kafka.TCP(brokerURL),
		Topic:    topic,
		Balancer: &kafka.LeastBytes{},
	}
}

// PublishJobEvent serializes the job data and sends it to the Kafka topic
func PublishJobEvent(writer *kafka.Writer, job DBJob) error {
	// Convert the Go struct into a JSON byte array
	jobJSON, err := json.Marshal(job)
	if err != nil {
		return err
	}

	msg := kafka.Message{
		Key:   []byte(job.URL), // Use URL as key so updates to the same job go to the same partition
		Value: jobJSON,
		Time:  time.Now(),
	}

	// Publish the message
	err = writer.WriteMessages(context.Background(), msg)
	if err != nil {
		log.Printf("Failed to write message to Kafka: %v", err)
		return err
	}

	log.Printf("Successfully published event for: %s", job.Title)
	return nil
}

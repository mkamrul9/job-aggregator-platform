// service-scraper/kafka.go
package main

import (
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


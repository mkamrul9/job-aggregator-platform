// service-scraper/db.go
package main

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DBJob represents the structural format saved in MongoDB
type DBJob struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"`
	Title          string             `bson:"title"`
	Company        string             `bson:"company"`
	URL            string             `bson:"url"`
	RawDescription string             `bson:"raw_description"`
	ScrapedAt      time.Time          `bson:"scraped_at"`
}

// InitMongoClient sets up a thread-safe connection pool
func InitMongoClient(uri string) *mongo.Client {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Configure pool parameters automatically optimized for concurrent environments
	clientOptions := options.Client().ApplyURI(uri).
		SetMaxPoolSize(50).
		SetMinPoolSize(10)

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	// Verify the connection is active
	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatalf("Failed to ping MongoDB: %v", err)
	}

	log.Println("Successfully connected to MongoDB with optimized connection pool.")
	return client
}

// InsertJob preserves data safely in our collection
func InsertJob(client *mongo.Client, dbName, collectionName string, job DBJob) error {
	collection := client.Database(dbName).Collection(collectionName)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Ensure we don't duplicate exact jobs by checking the URL
	opts := options.Update().SetUpsert(true)
	filter := bson.M{"url": job.URL}
	update := bson.M{
		"$setOnInsert": bson.M{"scraped_at": time.Now()},
		"$set": bson.M{
			"title":           job.Title,
			"company":         job.Company,
			"raw_description": job.RawDescription,
		},
	}

	_, err := collection.UpdateOne(ctx, filter, update, opts)
	return err
}

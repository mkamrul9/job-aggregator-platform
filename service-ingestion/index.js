// service-ingestion/index.js
const { Kafka } = require('kafkajs');
const { MongoClient } = require('mongodb');

// Environment variables (will be injected by Docker)
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const TOPIC = 'jobs.new';

// Initialize Kafka Client
const kafka = new Kafka({
  clientId: 'job-ingestion-worker',
  brokers: [KAFKA_BROKER],
});
const consumer = kafka.consumer({ groupId: 'mongo-ingestion-group' });

// Initialize MongoDB Client
const mongoClient = new MongoClient(MONGO_URI);

async function run() {
  try {
    // 1. Connect to MongoDB
    await mongoClient.connect();
    const db = mongoClient.db('job_platform');
    const jobsCollection = db.collection('jobs');
    console.log('✅ Connected to MongoDB');

    // 2. Connect to Kafka
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    console.log(`✅ Subscribed to Kafka topic: ${TOPIC}`);

    // 3. Listen for messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          // Parse the JSON buffer sent by the Go scraper
          const jobData = JSON.parse(message.value.toString());
          
          // Upsert the job into MongoDB based on the URL
          await jobsCollection.updateOne(
            { url: jobData.URL },
            { 
              $setOnInsert: { scraped_at: new Date() },
              $set: {
                title: jobData.Title,
                company: jobData.Company,
                raw_description: jobData.RawDescription
              }
            },
            { upsert: true }
          );

          console.log(`💾 Saved to DB: ${jobData.Title} at ${jobData.Company}`);
        } catch (err) {
          console.error('❌ Error processing message:', err);
        }
      },
    });
  } catch (error) {
    console.error('🔥 Fatal Worker Error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdowns
process.on('SIGINT', async () => {
  await consumer.disconnect();
  await mongoClient.close();
  process.exit(0);
});

run();

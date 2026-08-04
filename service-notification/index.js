// service-notification/index.js
const express = require('express');
const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const TOPIC = 'jobs.new';

const app = express();
const port = 4000;

// 1. Configure the Fake SMTP Server (Ethereal Email)
// In production, you would swap this with AWS SES or SendGrid credentials
const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
      user: 'fake_ethereal_user@ethereal.email', // Replace with generated Ethereal creds
      pass: 'fake_ethereal_password'
  }
});

// 2. Initialize Kafka Client
const kafka = new Kafka({ clientId: 'notification-service', brokers: [KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: 'email-notification-group' });

async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false }); // Only notify on NEW jobs

  console.log(`✅ Notification Service listening to: ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const jobData = JSON.parse(message.value.toString());
      
      // Simulated matching logic: 
      // e.g., We queried the DB and found 2 users matching this job's keywords
      const matchedUsers = [
        { email: 'candidateA@example.com', name: 'Alice' }
      ];

      for (const user of matchedUsers) {
        try {
          const info = await transporter.sendMail({
            from: '"Job Aggregator" <alerts@jobaggregator.local>',
            to: user.email,
            subject: `New Job Match: ${jobData.Title} at ${jobData.Company}`,
            text: `Hello ${user.name},\n\nWe found a new job matching your skills!\n\nTitle: ${jobData.Title}\nCompany: ${jobData.Company}\nLink: ${jobData.URL}\n\nGood luck!`
          });
          
          console.log(`📧 Email sent to ${user.email}. Preview: ${nodemailer.getTestMessageUrl(info)}`);
        } catch (error) {
          console.error(`❌ Failed to send email to ${user.email}:`, error);
        }
      }
    },
  });
}

// 3. Simple Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Notification Service is running.' });
});

app.listen(port, async () => {
  console.log(`🚀 Notification Express server running on port ${port}`);
  await startKafkaConsumer().catch(console.error);
});

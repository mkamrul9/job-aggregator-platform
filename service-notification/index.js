// service-notification/index.js
const express = require('express');
const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');
const promClient = require('prom-client');
const http = require('http');
const { Server } = require('socket.io');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const TOPIC = 'jobs.new';
const PORT = process.env.PORT || 4000;
const SOCKET_CORS_ORIGIN = (
  process.env.SOCKET_CORS_ORIGIN || 'http://localhost:4200,http://localhost:3003'
).split(',');

// 1. Prometheus Metrics Setup
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const emailsSentCounter = new promClient.Counter({
  name: 'job_notifications_sent_total',
  help: 'Total number of job match emails sent to users',
  registers: [register],
});

// 2. Transporter configuration
function createTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }
  // Safe default: JSON transport for non-production environments to avoid accidental real sends
  return nodemailer.createTransport({
    jsonTransport: true,
  });
}

function createNotificationApp(customRegister = register) {
  const app = express();
  app.use(express.json());

  // 3. Simple Health Check Endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Notification Service is running.' });
  });

  // 4. Expose the /metrics endpoint for Prometheus to scrape
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', customRegister.contentType);
    res.end(await customRegister.metrics());
  });

  return app;
}

async function processJobNotification(messageValue, { io, transporter, counter = emailsSentCounter, matchedUsers } = {}) {
  if (!messageValue) return null;

  const jobData = JSON.parse(messageValue.toString());

  // 1. Broadcast the new job to all connected clients instantly
  if (io) {
    io.emit('live-job-feed', jobData);
  }

  // 2. Simulated matching logic or passed users
  const recipients = matchedUsers || [
    { email: 'candidateA@example.com', name: 'Alice' },
  ];

  if (transporter) {
    for (const user of recipients) {
      try {
        const info = await transporter.sendMail({
          from: '"Job Aggregator" <alerts@jobaggregator.local>',
          to: user.email,
          subject: `New Job Match: ${jobData.title} at ${jobData.company}`,
          text: `Hello ${user.name},\n\nWe found a new job matching your skills!\n\nTitle: ${jobData.title}\nCompany: ${jobData.company}\nLink: ${jobData.url}\n\nGood luck!`,
        });

        if (counter) {
          counter.inc();
        }

        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log(`📧 Email sent to ${user.email}. Preview: ${previewUrl}`);
        } else {
          console.log(`📧 Notification prepared for ${user.email}`);
        }
      } catch (error) {
        console.error(`❌ Failed to send email to ${user.email}:`, error);
      }
    }
  }

  return jobData;
}

async function startServer() {
  const app = createNotificationApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: SOCKET_CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`🟢 Client Connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`🔴 Client Disconnected: ${socket.id}`));
  });

  const transporter = createTransporter();
  const kafka = new Kafka({ clientId: 'notification-service', brokers: [KAFKA_BROKER] });
  const consumer = kafka.consumer({ groupId: 'email-notification-group' });

  let retries = 5;
  while (retries > 0) {
    try {
      await consumer.connect();
      break;
    } catch (err) {
      console.error(`❌ Kafka connection failed, retries left: ${retries}`, err);
      retries -= 1;
      if (retries === 0) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`✅ Notification Service listening to: ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        await processJobNotification(message.value, {
          io,
          transporter,
          counter: emailsSentCounter,
        });
      } catch (err) {
        console.error('❌ Error processing message:', err);
      }
    },
  });

  server.listen(PORT, () => {
    console.log(`🚀 Notification Express server running on port ${PORT}`);
  });

  process.on('SIGINT', async () => {
    server.close();
    await consumer.disconnect();
    process.exit(0);
  });

  return { server, io };
}

module.exports = {
  createNotificationApp,
  createTransporter,
  processJobNotification,
  startServer,
  register,
  emailsSentCounter,
};

if (require.main === module) {
  startServer().catch(console.error);
}

'use strict';

// service-notification/index.js
const express = require('express');
const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');
const promClient = require('prom-client');
const http = require('http');
const { Server } = require('socket.io');

const { DurableNotificationStore } = require('./src/storage');
const { DeliveryDispatcher } = require('./src/dispatcher');
const { evaluateJobMatch } = require('./src/matcher');
const { createNotificationRouter } = require('./src/routes');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const TOPIC = process.env.KAFKA_TOPIC || 'jobs.new';
const PORT = process.env.PORT || 4000;
const SOCKET_CORS_ORIGIN = (
  process.env.SOCKET_CORS_ORIGIN || 'http://localhost:4200,http://localhost:3003'
).split(',');
const NOTIFICATION_MODE = (process.env.NOTIFICATION_MODE || 'CAPTURE').toUpperCase();

// 1. Prometheus Metrics Setup
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const emailsSentCounter = new promClient.Counter({
  name: 'job_notifications_sent_total',
  help: 'Total number of job match emails sent or captured for candidates',
  registers: [register],
});

const evaluationsCounter = new promClient.Counter({
  name: 'notification_evaluations_total',
  help: 'Total job alert evaluations performed against candidate subscriptions',
  registers: [register],
});

const deliveriesCounter = new promClient.Counter({
  name: 'notification_deliveries_total',
  help: 'Total notification delivery outcomes by status and channel',
  labelNames: ['status', 'channel'],
  registers: [register],
});

// 2. Default Store & Dispatcher Instances
const defaultStore = new DurableNotificationStore();

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

const defaultDispatcher = new DeliveryDispatcher({
  store: defaultStore,
  transporter: createTransporter(),
  mode: NOTIFICATION_MODE,
  metrics: {
    emailsSentCounter,
    deliveriesCounter,
  },
});

/**
 * Creates and configures the Express application.
 */
function createNotificationApp(options = {}) {
  const customRegister = options.register || register;
  const store = options.store || defaultStore;
  const dispatcher = options.dispatcher || defaultDispatcher;

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 3. Health Check Endpoint
  app.get('/health', (req, res) => {
    if (req.query.details === 'true' || req.query.detailed === 'true') {
      const stats = store.getStats();
      return res.status(200).json({
        status: 'Notification Service is running.',
        mode: dispatcher.mode,
        uptime: process.uptime(),
        store: {
          totalDeliveries: stats.totalDeliveries,
          activeSubscriptions: stats.activeSubscriptions,
          suppressions: stats.totalSuppressions,
        },
      });
    }
    res.status(200).json({ status: 'Notification Service is running.' });
  });

  // 4. Prometheus Metrics Endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', customRegister.contentType);
    res.end(await customRegister.metrics());
  });

  // 5. Mount API Routes
  const router = createNotificationRouter({
    store,
    dispatcher,
    metrics: { emailsSentCounter, deliveriesCounter, evaluationsCounter },
  });
  app.use('/api/v1/notifications', router);

  return app;
}

/**
 * Processes a single job event received via Kafka or direct injection.
 */
async function processJobNotification(
  messageValue,
  {
    io,
    transporter,
    counter = emailsSentCounter,
    matchedUsers,
    store = defaultStore,
    dispatcher = defaultDispatcher,
  } = {}
) {
  if (!messageValue) return null;

  let raw;
  try {
    raw = JSON.parse(messageValue.toString());
  } catch (err) {
    console.error('❌ Failed to parse message value JSON:', err);
    return null;
  }

  // Support versioned SeekersEventEnvelope as well as legacy flat message
  const isEnvelope = Boolean(raw && raw.event_type && raw.payload);
  const eventId = isEnvelope ? raw.event_id : raw.id;
  const correlationId = isEnvelope ? raw.correlation_id : null;
  const causationId = isEnvelope ? raw.causation_id : null;
  const jobData = isEnvelope ? raw.payload : raw;

  // 1. Broadcast the new job to connected WebSocket clients (Public stream)
  if (io) {
    io.emit('live-job-feed', jobData);
  }

  // Idempotency check: deduplicate notification evaluation if event already processed
  if (eventId && store && store.hasEventReceipt(eventId)) {
    return jobData;
  }

  // 2. Backward compatibility: if matchedUsers & transporter passed directly (e.g. in legacy tests)
  if (Array.isArray(matchedUsers) && matchedUsers.length > 0 && transporter) {
    for (const user of matchedUsers) {
      try {
        await transporter.sendMail({
          from: '"Job Aggregator" <alerts@jobaggregator.local>',
          to: user.email,
          subject: `New Job Match: ${jobData.title} at ${jobData.company}`,
          text: `Hello ${user.name},\n\nWe found a new job matching your skills!\n\nTitle: ${jobData.title}\nCompany: ${jobData.company}\nLink: ${jobData.url}\n\nGood luck!`,
        });
        if (counter) counter.inc();
        console.log(`📧 Notification prepared for ${user.email}`);
      } catch (error) {
        console.error(`❌ Failed to send email to ${user.email}:`, error);
      }
    }
    return jobData;
  }

  // 3. Durable P11 evaluation: retrieve active subscriptions from store
  const subscriptionsToEvaluate = store ? store.listSubscriptions({ activeOnly: true }) : [];
  evaluationsCounter.inc(subscriptionsToEvaluate.length);

  for (const sub of subscriptionsToEvaluate) {
    const match = evaluateJobMatch(jobData, sub, {
      isSuppressed: (email) => (store ? store.isSuppressed(email) : false),
    });

    if (match.matches) {
      if (dispatcher) {
        await dispatcher.dispatchAlert({
          subscription: sub,
          jobs: [jobData],
          correlationId,
          causationId: eventId,
        });
      }
    }
  }

  // Record receipt in store
  if (eventId && store) {
    store.recordEventReceipt(eventId, isEnvelope ? raw.event_type : 'jobs.new');
  }

  return jobData;
}

/**
 * Boots the server, Socket.io, and Kafka consumer.
 */
async function startServer() {
  const app = createNotificationApp({
    store: defaultStore,
    dispatcher: defaultDispatcher,
  });
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: SOCKET_CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // Support candidate joining their personal room for authenticated notifications
    const candidateId = socket.handshake.auth?.candidateId || socket.handshake.query?.candidateId;
    if (candidateId) {
      socket.join(`candidate:${candidateId}`);
    }
    socket.on('disconnect', () => {});
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
      if (retries === 0) {
        console.warn('⚠️ Starting in standalone mode without Kafka consumer.');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  if (retries > 0) {
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    console.log(`✅ Notification Service listening to: ${TOPIC}`);

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          await processJobNotification(message.value, {
            io,
            transporter,
            counter: emailsSentCounter,
            store: defaultStore,
            dispatcher: defaultDispatcher,
          });
        } catch (err) {
          console.error('❌ Error processing message:', err);
        }
      },
    });
  }

  server.listen(PORT, () => {
    console.log(`🚀 Notification Express server running on port ${PORT} [Mode: ${NOTIFICATION_MODE}]`);
  });

  return { app, server, io, consumer, store: defaultStore, dispatcher: defaultDispatcher };
}

// Auto-start if executed directly
if (require.main === module) {
  startServer().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = {
  createNotificationApp,
  processJobNotification,
  register,
  emailsSentCounter,
  evaluationsCounter,
  deliveriesCounter,
  defaultStore,
  defaultDispatcher,
  startServer,
};

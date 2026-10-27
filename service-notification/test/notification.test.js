// service-notification/test/notification.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const {
  createNotificationApp,
  processJobNotification,
} = require('../index');

describe('service-notification unit tests', () => {
  describe('HTTP endpoints', () => {
    it('GET /health returns 200 and healthy status', async () => {
      const app = createNotificationApp();
      const res = await request(app).get('/health');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, { status: 'Notification Service is running.' });
    });

    it('GET /metrics returns 200 with Prometheus text format', async () => {
      const app = createNotificationApp();
      const res = await request(app).get('/metrics');
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes('job_notifications_sent_total'));
    });
  });

  describe('processJobNotification', () => {
    it('should return null when messageValue is null or undefined', async () => {
      const res = await processJobNotification(null);
      assert.strictEqual(res, null);
    });

    it('should broadcast to socket.io and send match email', async () => {
      let broadcastEvent = null;
      let broadcastData = null;
      const mockIo = {
        emit: (event, data) => {
          broadcastEvent = event;
          broadcastData = data;
        },
      };

      const sentMails = [];
      const mockTransporter = {
        sendMail: async (mailOptions) => {
          sentMails.push(mailOptions);
          return { messageId: 'test-123' };
        },
      };

      let count = 0;
      const mockCounter = {
        inc: () => {
          count += 1;
        },
      };

      const payload = {
        title: 'Full Stack Engineer',
        company: 'Starlight Tech',
        url: 'https://example.com/job/starlight-1',
      };

      const messageValue = Buffer.from(JSON.stringify(payload));
      const result = await processJobNotification(messageValue, {
        io: mockIo,
        transporter: mockTransporter,
        counter: mockCounter,
        matchedUsers: [{ email: 'bob@example.com', name: 'Bob' }],
      });

      assert.strictEqual(result.title, 'Full Stack Engineer');
      assert.strictEqual(broadcastEvent, 'live-job-feed');
      assert.strictEqual(broadcastData.title, 'Full Stack Engineer');
      assert.strictEqual(sentMails.length, 1);
      assert.strictEqual(sentMails[0].to, 'bob@example.com');
      assert.ok(sentMails[0].subject.includes('Full Stack Engineer at Starlight Tech'));
      assert.ok(sentMails[0].text.includes('https://example.com/job/starlight-1'));
      assert.strictEqual(count, 1);
    });

    it('should tolerate mailer failure without throwing', async () => {
      const mockTransporter = {
        sendMail: async () => {
          throw new Error('SMTP connection timed out');
        },
      };

      const payload = {
        title: 'DevOps Engineer',
        company: 'InfraCorp',
        url: 'https://example.com/job/infra-1',
      };

      const messageValue = Buffer.from(JSON.stringify(payload));
      const result = await processJobNotification(messageValue, {
        transporter: mockTransporter,
        matchedUsers: [{ email: 'charlie@example.com', name: 'Charlie' }],
      });

      assert.strictEqual(result.company, 'InfraCorp');
    });
  });
});

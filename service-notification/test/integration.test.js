'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const promClient = require('prom-client');
const { createNotificationApp } = require('../index');
const { DurableNotificationStore } = require('../src/storage');
const { DeliveryDispatcher } = require('../src/dispatcher');

describe('service-notification: full integration test', () => {
  it('executes end-to-end evaluation, local capture, one-click unsubscribe, and suppression lifecycle', async () => {
    const testRegister = new promClient.Registry();
    const testStore = new DurableNotificationStore({ inMemoryOnly: true });

    const emittedEvents = [];
    const testDispatcher = new DeliveryDispatcher({
      store: testStore,
      mode: 'CAPTURE',
      baseUrl: 'https://seekers.work',
      apiOrigin: 'http://localhost:4000',
      onEventEmitted: (evt) => emittedEvents.push(evt),
    });

    const app = createNotificationApp({
      register: testRegister,
      store: testStore,
      dispatcher: testDispatcher,
    });

    // 1. Seed candidate subscriptions
    testStore.saveSubscription({
      id: 'sub-alice-go',
      candidate_id: 'usr_alice',
      email: 'alice@example.com',
      query: 'Go Distributed',
      location: 'Dhaka',
      remote_preference: 'ANY',
      active: true,
      email_verified: true,
    });

    testStore.saveSubscription({
      id: 'sub-bob-remote-only',
      candidate_id: 'usr_bob',
      email: 'bob@example.com',
      query: 'Go Distributed',
      location: 'Dhaka',
      remote_preference: 'FULLY_REMOTE', // Strict remote
      active: true,
      email_verified: true,
    });

    // 2. Evaluate a HYBRID Go job
    const hybridJob = {
      id: 'job-hybrid-001',
      title: 'Senior Go Distributed Engineer',
      company: 'Pathao Engineering',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      status: 'ACTIVE',
      is_expired: false,
      skills: ['Go', 'Kafka'],
    };

    const evalRes = await request(app)
      .post('/api/v1/notifications/evaluate')
      .send(hybridJob);

    assert.strictEqual(evalRes.status, 200);
    assert.strictEqual(evalRes.body.evaluatedSubscriptions, 2);

    const aliceResult = evalRes.body.results.find((r) => r.email === 'alice@example.com');
    const bobResult = evalRes.body.results.find((r) => r.email === 'bob@example.com');

    // Alice matches and is dispatched
    assert.strictEqual(aliceResult.matched, true);
    assert.strictEqual(aliceResult.dispatchResult.status, 'ACCEPTED');

    // Bob is strictly rejected due to HYBRID != FULLY_REMOTE
    assert.strictEqual(bobResult.matched, false);
    assert.strictEqual(bobResult.reason, 'REMOTE_PREFERENCE_MISMATCH');

    // 3. Verify captured email in mailbox
    const capturedRes = await request(app).get('/api/v1/notifications/captured');
    assert.strictEqual(capturedRes.status, 200);
    assert.strictEqual(capturedRes.body.total, 1);
    const capturedEmail = capturedRes.body.items[0];
    assert.strictEqual(capturedEmail.to, 'alice@example.com');
    assert.ok(capturedEmail.subject.includes('Senior Go Distributed Engineer'));
    assert.ok(capturedEmail.headers['List-Unsubscribe']);

    // Verify emitted alert.dispatched.v1 event
    assert.strictEqual(emittedEvents.length, 1);
    const emittedEvent = emittedEvents[0];
    assert.strictEqual(emittedEvent.event_type, 'alert.dispatched.v1');
    assert.strictEqual(emittedEvent.payload.recipient_email, 'alice@example.com');
    assert.strictEqual(emittedEvent.payload.provider_status, 'ACCEPTED');

    // 4. Extract token from unsubscribe header
    const unsubHeader = capturedEmail.headers['List-Unsubscribe'];
    const tokenMatch = unsubHeader.match(/token=([^>&]+)/);
    assert.ok(tokenMatch && tokenMatch[1], 'Unsubscribe token must be present');
    const token = tokenMatch[1];

    // 5. Test safe GET on unsubscribe link (browser prefetch safety: must not mutate state)
    const getUnsubRes = await request(app)
      .get(`/api/v1/notifications/unsubscribe?token=${token}`);
    assert.strictEqual(getUnsubRes.status, 200);
    assert.ok(getUnsubRes.text.includes('Confirm Unsubscribe'));
    // Confirm subscription is still active before form submission
    assert.strictEqual(testStore.getSubscription('sub-alice-go').active, true);
    assert.strictEqual(testStore.isSuppressed('alice@example.com'), false);

    // 6. Test POST to execute unsubscribe
    const postUnsubRes = await request(app)
      .post('/api/v1/notifications/unsubscribe')
      .send({ token });
    assert.strictEqual(postUnsubRes.status, 200);
    assert.strictEqual(postUnsubRes.body.success, true);

    // Confirm subscription is deactivated and email is suppressed
    assert.strictEqual(testStore.getSubscription('sub-alice-go').active, false);
    assert.strictEqual(testStore.isSuppressed('alice@example.com'), true);

    // 7. Re-evaluate same job: Alice should now NOT receive mail
    const evalRes2 = await request(app)
      .post('/api/v1/notifications/evaluate')
      .send(hybridJob);
    assert.strictEqual(evalRes2.status, 200);
    // Because active subscriptions only are evaluated, active count is now 1 (Bob)
    assert.strictEqual(evalRes2.body.evaluatedSubscriptions, 1);

    // 8. Test Provider Webhook (bounce suppression)
    const bounceRes = await request(app)
      .post('/api/v1/notifications/webhooks/provider')
      .send({
        type: 'bounce',
        email: 'charlie.bounced@example.com',
      });
    assert.strictEqual(bounceRes.status, 200);
    assert.strictEqual(bounceRes.body.action, 'SUPPRESSED_BOUNCE');
    assert.strictEqual(testStore.isSuppressed('charlie.bounced@example.com'), true);

    // 9. Check /health detailed endpoint
    const healthRes = await request(app).get('/health?detailed=true');
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.body.mode, 'CAPTURE');
    assert.ok(healthRes.body.store.suppressions >= 2);
  });
});

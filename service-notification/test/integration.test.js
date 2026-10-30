'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const promClient = require('prom-client');
const { createNotificationApp } = require('../index');
const { DurableNotificationStore } = require('../src/storage');
const { DeliveryDispatcher } = require('../src/dispatcher');
const { DurableNotificationWorker } = require('../src/worker');
const { generateUnsubscribeToken } = require('../src/crypto');

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

    const serviceHeaders = {
      'x-service-key': 'seekers-internal-service-p11',
    };

    // 1. Verify access boundaries on protected endpoints
    const unauthCaptured = await request(app).get('/api/v1/notifications/captured');
    assert.strictEqual(unauthCaptured.status, 401);

    const unauthEval = await request(app)
      .post('/api/v1/notifications/evaluate')
      .send({ id: 'probe' });
    assert.strictEqual(unauthEval.status, 401);

    // 2. Seed candidate subscriptions using authenticated route
    const subRes1 = await request(app)
      .post('/api/v1/notifications/subscriptions')
      .set(serviceHeaders)
      .send({
        id: 'sub-alice-go',
        candidate_id: 'usr_alice',
        email: 'alice@example.com',
        query: 'Go Distributed',
        location: 'Dhaka',
        remote_preference: 'ANY',
        active: true,
        email_verified: true,
      });
    assert.strictEqual(subRes1.status, 201);

    const subRes2 = await request(app)
      .post('/api/v1/notifications/subscriptions')
      .set(serviceHeaders)
      .send({
        id: 'sub-bob-remote-only',
        candidate_id: 'usr_bob',
        email: 'bob@example.com',
        query: 'Go Distributed',
        location: 'Dhaka',
        remote_preference: 'FULLY_REMOTE', // Strict remote
        active: true,
        email_verified: true,
      });
    assert.strictEqual(subRes2.status, 201);

    // 3. Evaluate a HYBRID Go job
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
      .set(serviceHeaders)
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

    // 4. Verify captured email in mailbox via authenticated endpoint
    const capturedRes = await request(app)
      .get('/api/v1/notifications/captured')
      .set(serviceHeaders);
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

    // 5. Extract token from unsubscribe header
    const unsubHeader = capturedEmail.headers['List-Unsubscribe'];
    const tokenMatch = unsubHeader.match(/token=([^>&]+)/);
    assert.ok(tokenMatch && tokenMatch[1], 'Unsubscribe token must be present');
    const token = tokenMatch[1];

    // 6. Test safe GET on unsubscribe link (browser prefetch safety: must not mutate state)
    const getUnsubRes = await request(app).get(
      `/api/v1/notifications/unsubscribe?token=${token}`
    );
    assert.strictEqual(getUnsubRes.status, 200);
    assert.ok(getUnsubRes.text.includes('Confirm Unsubscribe'));
    // Confirm subscription is still active before form submission
    assert.strictEqual(testStore.getSubscription('sub-alice-go').active, true);
    assert.strictEqual(
      testStore.isSuppressed('alice@example.com', 'sub-alice-go'),
      false
    );

    // 7. Test RFC 8058 One-Click POST to execute unsubscribe (query token + header/body)
    const postUnsubRes = await request(app)
      .post(`/api/v1/notifications/unsubscribe?token=${token}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('List-Unsubscribe=One-Click');
    assert.strictEqual(postUnsubRes.status, 200);
    assert.strictEqual(postUnsubRes.body.success, true);
    assert.strictEqual(postUnsubRes.body.scope, 'SUBSCRIPTION');

    // Confirm subscription is deactivated and per-subscription suppressed
    assert.strictEqual(testStore.getSubscription('sub-alice-go').active, false);
    assert.strictEqual(testStore.isSubscriptionSuppressed('sub-alice-go'), true);
    assert.strictEqual(
      testStore.isSuppressed('alice@example.com', 'sub-alice-go'),
      true
    );

    // 8. Re-evaluate same job: Alice should now NOT receive mail
    const evalRes2 = await request(app)
      .post('/api/v1/notifications/evaluate')
      .set(serviceHeaders)
      .send(hybridJob);
    assert.strictEqual(evalRes2.status, 200);
    // Because active subscriptions only are evaluated, active count is now 1 (Bob)
    assert.strictEqual(evalRes2.body.evaluatedSubscriptions, 1);

    // 9. Test Provider Webhook: reject unauthenticated webhook
    const unauthWebhook = await request(app)
      .post('/api/v1/notifications/webhooks/provider')
      .send({
        type: 'bounce',
        email: 'charlie.bounced@example.com',
      });
    assert.strictEqual(unauthWebhook.status, 401);

    // Test Provider Webhook: authenticated bounce suppression with replay protection
    const bounceRes = await request(app)
      .post('/api/v1/notifications/webhooks/provider')
      .set('x-webhook-secret', 'seekers-provider-webhook-p11')
      .send({
        id: 'wh-msg-1234',
        type: 'bounce',
        email: 'charlie.bounced@example.com',
      });
    assert.strictEqual(bounceRes.status, 200);
    assert.strictEqual(bounceRes.body.action, 'SUPPRESSED_BOUNCE');
    assert.strictEqual(testStore.isGloballySuppressed('charlie.bounced@example.com'), true);

    // Replayed webhook with same id is safely deduplicated without reprocessing
    const replayBounceRes = await request(app)
      .post('/api/v1/notifications/webhooks/provider')
      .set('x-webhook-secret', 'seekers-provider-webhook-p11')
      .send({
        id: 'wh-msg-1234',
        type: 'bounce',
        email: 'charlie.bounced@example.com',
      });
    assert.strictEqual(replayBounceRes.status, 200);
    assert.strictEqual(replayBounceRes.body.action, 'DUPLICATE_WEBHOOK_IGNORED');

    // 10. Check /health detailed endpoint and gateway-stripped path
    const healthRes = await request(app).get('/health?detailed=true');
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.body.mode, 'CAPTURE');
    assert.ok(healthRes.body.store.suppressions >= 2);

    const strippedHealthRes = await request(app).get('/api/v1/notifications/health');
    assert.strictEqual(strippedHealthRes.status, 200);
  });

  it('strictly bounds unsubscribe permission to the signed scope (request body cannot expand to global)', async () => {
    const testStore = new DurableNotificationStore({ inMemoryOnly: true });
    const testDispatcher = new DeliveryDispatcher({ store: testStore, mode: 'CAPTURE' });
    const app = createNotificationApp({ store: testStore, dispatcher: testDispatcher });

    testStore.saveSubscription({
      id: 'sub-scoped-only',
      candidate_id: 'usr_tariq',
      email: 'tariq@example.com',
      query: 'Rust',
      active: true,
      email_verified: true,
    });

    // 1. Generate token signed strictly with scope='subscription'
    const token = generateUnsubscribeToken({
      subscriptionId: 'sub-scoped-only',
      candidateId: 'usr_tariq',
      email: 'tariq@example.com',
      scope: 'subscription',
    });

    // 2. Client submits POST attempting to expand to scope='all'
    const res = await request(app)
      .post('/api/v1/notifications/unsubscribe')
      .send({
        token,
        scope: 'all', // forged attempt to globally suppress
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.scope, 'SUBSCRIPTION', 'Must remain strictly SUBSCRIPTION');

    // 3. Verify per-subscription suppression is recorded, but GLOBAL suppression is NOT
    assert.strictEqual(testStore.isSubscriptionSuppressed('sub-scoped-only'), true);
    assert.strictEqual(testStore.isGloballySuppressed('tariq@example.com'), false);
  });

  it('executes durable retry recovery and digest delivery via DurableNotificationWorker', async () => {
    const testStore = new DurableNotificationStore({ inMemoryOnly: true });
    const testDispatcher = new DeliveryDispatcher({ store: testStore, mode: 'CAPTURE' });

    testStore.saveSubscription({
      id: 'sub-digest-dan',
      candidate_id: 'usr_dan',
      email: 'dan@example.com',
      query: 'Python',
      location: 'Dhaka',
      remote_preference: 'ANY',
      frequency: 'DAILY',
      active: true,
      email_verified: true,
    });

    const job = {
      id: 'job-py-001',
      title: 'Senior Python Architect',
      company: 'TechCorp',
      location: 'Dhaka',
      remote_eligibility: 'ANY',
      status: 'ACTIVE',
      skills: ['Python'],
    };

    // 1. Dispatching a DAILY frequency subscription buffers into digest
    const dispatchResult = await testDispatcher.dispatchAlert({
      subscription: testStore.getSubscription('sub-digest-dan'),
      jobs: [job],
    });
    assert.strictEqual(dispatchResult.status, 'QUEUED_FOR_DIGEST');
    assert.strictEqual(testStore.listCapturedEmails().length, 0);

    // 2. Worker processDueDigests flushes the digest into an email alert
    const worker = new DurableNotificationWorker({
      store: testStore,
      dispatcher: testDispatcher,
    });
    await worker.runOnce();

    assert.strictEqual(testStore.listCapturedEmails().length, 1);
    const captured = testStore.listCapturedEmails()[0];
    assert.strictEqual(captured.to, 'dan@example.com');
    assert.ok(captured.subject.includes('Senior Python Architect'));
  });
});

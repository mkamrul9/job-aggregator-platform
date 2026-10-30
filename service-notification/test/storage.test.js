'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DurableNotificationStore } = require('../src/storage');

describe('service-notification: storage tests', () => {
  it('operates cleanly in inMemoryOnly mode for isolation', () => {
    const store = new DurableNotificationStore({ inMemoryOnly: true });

    // Subscriptions
    store.saveSubscription({
      id: 'sub-test-1',
      candidate_id: 'cand-1',
      email: 'user1@example.com',
      query: 'React',
      active: true,
    });
    assert.strictEqual(store.getSubscription('sub-test-1').query, 'React');
    assert.strictEqual(store.listSubscriptions({ activeOnly: true }).length, 1);

    store.deactivateSubscription('sub-test-1');
    assert.strictEqual(store.getSubscription('sub-test-1').active, false);
    assert.strictEqual(store.listSubscriptions({ activeOnly: true }).length, 0);

    // Suppressions
    store.addSuppression({ email: 'user1@example.com', reason: 'BOUNCED' });
    assert.strictEqual(store.isSuppressed('user1@example.com'), true);
    assert.strictEqual(store.isSuppressed('USER1@EXAMPLE.COM'), true); // case insensitive

    store.removeSuppression('user1@example.com');
    assert.strictEqual(store.isSuppressed('user1@example.com'), false);

    // Event receipts
    assert.strictEqual(store.hasEventReceipt('evt-999'), false);
    store.recordEventReceipt('evt-999');
    assert.strictEqual(store.hasEventReceipt('evt-999'), true);

    // Deliveries
    store.saveDelivery({
      id: 'del-1',
      dedupeKey: 'sub-test-1:job-1',
      providerStatus: 'ACCEPTED',
    });
    assert.strictEqual(store.findDeliveryByDedupeKey('sub-test-1:job-1').id, 'del-1');
    assert.strictEqual(store.getDelivery('del-1').providerStatus, 'ACCEPTED');

    // Captured emails
    store.recordCapturedEmail({
      id: 'mail-1',
      to: 'user1@example.com',
      subject: 'Job Alert',
      text: 'Hello',
      html: '<p>Hello</p>',
    });
    assert.strictEqual(store.listCapturedEmails().length, 1);
    assert.strictEqual(store.getCapturedEmail('mail-1').to, 'user1@example.com');

    store.clearCapturedEmails();
    assert.strictEqual(store.listCapturedEmails().length, 0);
  });

  it('persists data across store instances using atomic disk writes', () => {
    const tmpDir = path.join(os.tmpdir(), `seekers-store-test-${Date.now()}`);
    const filePath = path.join(tmpDir, 'test-store.json');

    try {
      const storeA = new DurableNotificationStore({ filePath });
      storeA.saveSubscription({
        id: 'sub-disk-1',
        candidate_id: 'cand-disk',
        email: 'disk@example.com',
        query: 'Golang',
        active: true,
      });
      storeA.addSuppression({ email: 'suppressed@example.com', reason: 'UNSUBSCRIBED' });
      storeA.recordEventReceipt('evt-disk-1');

      // Verify file exists on disk
      assert.ok(fs.existsSync(filePath));

      // Create new store pointing to same file and confirm data restored
      const storeB = new DurableNotificationStore({ filePath });
      assert.strictEqual(storeB.getSubscription('sub-disk-1').query, 'Golang');
      assert.strictEqual(storeB.isSuppressed('suppressed@example.com'), true);
      assert.strictEqual(storeB.hasEventReceipt('evt-disk-1'), true);
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it('prevents stale merges from resurrecting paused subscriptions (atomic cross-process consistency)', () => {
    const tmpDir = path.join(os.tmpdir(), `seekers-store-stale-${Date.now()}`);
    const filePath = path.join(tmpDir, 'stale-test.json');

    try {
      // 1. Initial subscription created
      const storeInit = new DurableNotificationStore({ filePath });
      storeInit.saveSubscription({
        id: 'sub-target',
        candidate_id: 'cand-1',
        email: 'target@example.com',
        query: 'Node.js',
        active: true,
      });

      // 2. Two separate store instances opened before either writes
      const storeFresh = new DurableNotificationStore({ filePath });
      const storeStale = new DurableNotificationStore({ filePath });

      // 3. Fresh instance pauses the subscription
      storeFresh.deactivateSubscription('sub-target');

      // 4. Stale instance saves an unrelated delivery
      storeStale.saveDelivery({
        id: 'del-unrelated-001',
        dedupeKey: 'sub-other:job-1',
        providerStatus: 'ACCEPTED',
      });

      // 5. Fresh reader reads the target subscription
      const storeReader = new DurableNotificationStore({ filePath });
      const targetSub = storeReader.getSubscription('sub-target');
      assert.ok(targetSub, 'Subscription must exist');
      assert.strictEqual(
        targetSub.active,
        false,
        'Subscription must remain PAUSED and not resurrected by stale writer'
      );
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it('prevents concurrent double claims on active delivery leases', () => {
    const store = new DurableNotificationStore({ inMemoryOnly: true });
    store.saveDelivery({
      id: 'del-lease-test',
      dedupeKey: 'key-lease-1',
      providerStatus: 'QUEUED',
    });

    // 1. First claim succeeds and leases work for 60 seconds
    const claim1 = store.claimDeliveryForAttempt('del-lease-test', 60000);
    assert.ok(claim1, 'First claim must succeed');
    assert.strictEqual(claim1.providerStatus, 'ATTEMPTING');
    assert.strictEqual(claim1.attemptCount, 1);
    assert.ok(claim1.leaseToken);

    // 2. Immediate second claim must return null (already leased)
    const claim2 = store.claimDeliveryForAttempt('del-lease-test', 60000);
    assert.strictEqual(claim2, null, 'Second consecutive claim must fail while lease is active');
  });

  it('fences out stale workers attempting to save delivery outcomes with expired/mismatched tokens', () => {
    const store = new DurableNotificationStore({ inMemoryOnly: true });
    store.saveDelivery({
      id: 'del-fence-test',
      dedupeKey: 'key-fence-1',
      providerStatus: 'QUEUED',
    });

    const claimed = store.claimDeliveryForAttempt('del-fence-test', 60000);
    const validToken = claimed.leaseToken;
    const staleToken = 'stale-worker-outdated-token';

    // Stale worker save attempt is fenced
    const staleOutcome = store.saveDeliveryOutcome({
      deliveryId: 'del-fence-test',
      leaseToken: staleToken,
      providerStatus: 'ACCEPTED',
    });
    assert.strictEqual(staleOutcome.fenced, true);
    assert.strictEqual(staleOutcome.reason, 'STALE_LEASE_FENCED');
    assert.strictEqual(store.getDelivery('del-fence-test').providerStatus, 'ATTEMPTING');

    // Valid worker save attempt succeeds
    const validOutcome = store.saveDeliveryOutcome({
      deliveryId: 'del-fence-test',
      leaseToken: validToken,
      providerStatus: 'ACCEPTED',
    });
    assert.strictEqual(validOutcome.fenced, false);
    assert.strictEqual(store.getDelivery('del-fence-test').providerStatus, 'ACCEPTED');
  });

  it('manages pending digests and outbox sync tasks reliably', () => {
    const store = new DurableNotificationStore({ inMemoryOnly: true });

    // Digests
    store.addPendingDigestJob({
      subscriptionId: 'sub-digest-1',
      candidateId: 'usr_sarah',
      email: 'sarah@example.com',
      job: { id: 'job-101', title: 'React Lead' },
      frequency: 'DAILY',
      windowKey: '2026-10-30',
    });
    store.addPendingDigestJob({
      subscriptionId: 'sub-digest-1',
      candidateId: 'usr_sarah',
      email: 'sarah@example.com',
      job: { id: 'job-102', title: 'Fullstack TS' },
      frequency: 'DAILY',
      windowKey: '2026-10-30',
    });

    const digest = store.getPendingDigest('sub-digest-1', '2026-10-30');
    assert.strictEqual(digest.jobs.length, 2);
    assert.strictEqual(store.listPendingDigests().length, 1);

    store.clearPendingDigest('sub-digest-1', '2026-10-30');
    assert.strictEqual(store.getPendingDigest('sub-digest-1', '2026-10-30'), null);

    // Sync tasks
    const task = store.recordSyncTask({
      id: 'task-sync-1',
      type: 'ALERT_UNSUBSCRIBE',
      payload: { token: 'sample-token' },
    });
    assert.strictEqual(task.status, 'PENDING');
    assert.strictEqual(store.listPendingSyncTasks().length, 1);

    store.updateSyncTask('task-sync-1', { status: 'CONFIRMED' });
    assert.strictEqual(store.listPendingSyncTasks().length, 0);
  });

  it('bounds retention without pruning unfinished or active deliveries', () => {
    const store = new DurableNotificationStore({ inMemoryOnly: true });

    // Seed 1 QUEUED, 1 RETRY_SCHEDULED, and 1 ACCEPTED
    store.saveDelivery({ id: 'del-active-queued', providerStatus: 'QUEUED' });
    store.saveDelivery({ id: 'del-active-retry', providerStatus: 'RETRY_SCHEDULED', nextRetryAt: new Date(Date.now() + 10000).toISOString() });
    store.saveDelivery({ id: 'del-accepted-1', providerStatus: 'ACCEPTED' });

    assert.ok(store.getDelivery('del-active-queued'));
    assert.ok(store.getDelivery('del-active-retry'));
    assert.ok(store.getDelivery('del-accepted-1'));
  });

  it('backs up corrupted storage file and throws PersistenceCorruptionError', () => {
    const tmpDir = path.join(os.tmpdir(), `seekers-store-corrupt-${Date.now()}`);
    const filePath = path.join(tmpDir, 'corrupt-store.json');

    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(filePath, '{ corrupted json contents !! not valid json');

      assert.throws(() => {
        new DurableNotificationStore({ filePath });
      }, /PersistenceCorruptionError/);

      // Verify backup file was created
      const files = fs.readdirSync(tmpDir);
      const backupFound = files.some((f) => f.includes('corrupt-store.json.corrupt-'));
      assert.ok(backupFound, 'A backup of corrupted file must be created');
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it('strictly isolates global suppression from per-subscription suppression', () => {
    const store = new DurableNotificationStore({ inMemoryOnly: true });

    store.saveSubscription({
      id: 'sub-react',
      candidate_id: 'usr_sarah',
      email: 'sarah@example.com',
      query: 'React',
      active: true,
    });

    store.saveSubscription({
      id: 'sub-python',
      candidate_id: 'usr_sarah',
      email: 'sarah@example.com',
      query: 'Python',
      active: true,
    });

    // Unsubscribe ONLY sub-react
    store.addSubscriptionSuppression({
      subscriptionId: 'sub-react',
      email: 'sarah@example.com',
      candidateId: 'usr_sarah',
      reason: 'UNSUBSCRIBED',
    });

    // sub-react is suppressed
    assert.strictEqual(store.isSubscriptionSuppressed('sub-react'), true);
    assert.strictEqual(store.isSuppressed('sarah@example.com', 'sub-react'), true);
    assert.strictEqual(store.getSubscription('sub-react').active, false);

    // sub-python is NOT suppressed and remains active
    assert.strictEqual(store.isSubscriptionSuppressed('sub-python'), false);
    assert.strictEqual(store.isSuppressed('sarah@example.com', 'sub-python'), false);
    assert.strictEqual(store.getSubscription('sub-python').active, true);
    assert.strictEqual(store.isGloballySuppressed('sarah@example.com'), false);

    // Now trigger global suppression (e.g. bounce)
    store.addGlobalSuppression({
      email: 'sarah@example.com',
      reason: 'BOUNCED',
    });

    // Now both are suppressed because global suppression suppresses all emails to this address
    assert.strictEqual(store.isGloballySuppressed('sarah@example.com'), true);
    assert.strictEqual(store.isSuppressed('sarah@example.com', 'sub-python'), true);
  });
});

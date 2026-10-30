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

  it('coordinates multi-instance concurrent writes without losing subscriptions', () => {
    const tmpDir = path.join(os.tmpdir(), `seekers-store-multi-${Date.now()}`);
    const filePath = path.join(tmpDir, 'shared-store.json');

    try {
      // Both instances initialized pointing to same file before either writes
      const storeA = new DurableNotificationStore({ filePath });
      const storeB = new DurableNotificationStore({ filePath });

      storeA.saveSubscription({
        id: 'sub-a',
        candidate_id: 'cand-a',
        email: 'a@example.com',
        query: 'Frontend',
        active: true,
      });

      storeB.saveSubscription({
        id: 'sub-b',
        candidate_id: 'cand-b',
        email: 'b@example.com',
        query: 'Backend',
        active: true,
      });

      // Fresh reader instance must see both A and B
      const storeC = new DurableNotificationStore({ filePath });
      assert.ok(storeC.getSubscription('sub-a'), 'sub-a must be present');
      assert.ok(storeC.getSubscription('sub-b'), 'sub-b must be present');
      assert.strictEqual(storeC.getSubscription('sub-a').query, 'Frontend');
      assert.strictEqual(storeC.getSubscription('sub-b').query, 'Backend');
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
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

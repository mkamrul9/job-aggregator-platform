'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PersistenceCorruptionError extends Error {
  constructor(message, originalError, backupPath) {
    super(message);
    this.name = 'PersistenceCorruptionError';
    this.originalError = originalError;
    this.backupPath = backupPath;
  }
}

class DurableNotificationStore {
  /**
   * @param {Object} options
   * @param {string} [options.filePath] - Absolute or relative path to store file
   * @param {boolean} [options.inMemoryOnly=false] - For test isolation
   */
  constructor({ filePath, inMemoryOnly = false } = {}) {
    this.inMemoryOnly = inMemoryOnly;
    this.filePath =
      filePath ||
      process.env.NOTIFICATIONS_STORE_PATH ||
      path.join(__dirname, '..', 'data', 'notifications_store.json');

    this.isCorrupted = false;
    this.corruptionError = null;

    this.state = {
      version: 2,
      deliveries: {},                 // id -> DeliveryRecord
      event_receipts: {},             // eventId -> EventReceipt
      global_suppressions: {},        // email.toLowerCase() -> GlobalSuppressionRecord
      subscription_suppressions: {},  // subscriptionId -> SubscriptionSuppressionRecord
      subscriptions: {},              // subscriptionId -> SubscriptionRecord
      captured_emails: [],            // Array of CapturedEmailRecord
      digests: {},                    // key -> DigestRecord
      sync_tasks: {},                 // id -> OutboxSyncTask
    };

    if (!this.inMemoryOnly) {
      this._initStore();
    }
  }

  _initStore() {
    if (!fs.existsSync(this.filePath)) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return;
    }
    // Verify file is readable and valid JSON on initialization
    this._readFromDiskDirectly();
  }

  _readFromDiskDirectly() {
    if (this.inMemoryOnly || !fs.existsSync(this.filePath)) {
      return this.state;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return this.state;

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const loaded = {
          version: parsed.version || 2,
          deliveries: parsed.deliveries || {},
          event_receipts: parsed.event_receipts || {},
          global_suppressions: parsed.global_suppressions || parsed.suppressions || {},
          subscription_suppressions: parsed.subscription_suppressions || {},
          subscriptions: parsed.subscriptions || {},
          captured_emails: Array.isArray(parsed.captured_emails) ? parsed.captured_emails : [],
          digests: parsed.digests || {},
          sync_tasks: parsed.sync_tasks || {},
        };
        this.state = loaded;
        return loaded;
      }
      return this.state;
    } catch (err) {
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.filePath, backupPath);
      } catch (copyErr) {}
      this.isCorrupted = true;
      this.corruptionError = err;
      throw new PersistenceCorruptionError(
        `Durable store file at ${this.filePath} is corrupted: ${err.message}. A safety backup was saved to ${backupPath}.`,
        err,
        backupPath
      );
    }
  }

  _readState() {
    if (this.inMemoryOnly) {
      return this.state;
    }
    return this._readFromDiskDirectly();
  }

  /**
   * Executes a mutating function inside an exclusive cross-process lock.
   * Reads fresh disk state, applies mutation, atomically flushes, and releases lock.
   */
  _withLock(mutatorFn) {
    if (this.inMemoryOnly) {
      return mutatorFn(this.state);
    }
    if (this.isCorrupted) {
      throw new Error(
        `Persistence operation blocked: Store at ${this.filePath} is corrupted. Resolve corruption before writing.`
      );
    }

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const lockPath = `${this.filePath}.lock`;
    const maxWaitMs = 5000;
    const startTime = Date.now();
    let lockFd = null;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        lockFd = fs.openSync(lockPath, 'wx');
        break;
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Check for stale lockfile (> 5 seconds old)
          try {
            const stats = fs.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > 5000) {
              try { fs.unlinkSync(lockPath); } catch (uErr) {}
              continue;
            }
          } catch (sErr) {}

          // Spin wait with synchronous delay (e.g. 5ms)
          const spinStart = Date.now();
          while (Date.now() - spinStart < 5) {}
          continue;
        }
        throw err;
      }
    }

    if (lockFd === null) {
      throw new Error(`Failed to acquire store lock at ${lockPath} after ${maxWaitMs}ms`);
    }

    try {
      // 1. Read fresh state from disk
      const diskState = this._readFromDiskDirectly();

      // 2. Execute mutation on fresh disk state
      const result = mutatorFn(diskState);

      // 3. Atomically write updated diskState to temp file and rename
      const tempPath = `${this.filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      const serialized = JSON.stringify(diskState, null, 2);
      fs.writeFileSync(tempPath, serialized, 'utf8');
      fs.renameSync(tempPath, this.filePath);

      // 4. Update memory reference
      this.state = diskState;

      return result;
    } finally {
      try {
        fs.closeSync(lockFd);
        fs.unlinkSync(lockPath);
      } catch (cleanupErr) {}
    }
  }

  // ─── EVENT RECEIPTS (Idempotency) ──────────────────────────────────────────

  hasEventReceipt(eventId) {
    if (!eventId) return false;
    const state = this._readState();
    return Boolean(state.event_receipts[eventId]);
  }

  recordEventReceipt(eventId, eventType = 'job.ingested.v1', status = 'PROCESSED') {
    if (!eventId) return;
    return this._withLock((state) => {
      state.event_receipts[eventId] = {
        eventId,
        eventType,
        status,
        receivedAt: new Date().toISOString(),
      };

      // Bound receipts retention (max 10000)
      const keys = Object.keys(state.event_receipts);
      if (keys.length > 10000) {
        const oldestKeys = keys.slice(0, keys.length - 10000);
        for (const k of oldestKeys) {
          delete state.event_receipts[k];
        }
      }
    });
  }

  // ─── DELIVERIES & STATE MACHINE ─────────────────────────────────────────────

  saveDelivery(delivery) {
    if (!delivery || !delivery.id) {
      throw new Error('Delivery record must contain a valid id');
    }
    return this._withLock((state) => {
      const now = new Date().toISOString();
      const existing = state.deliveries[delivery.id] || {};
      state.deliveries[delivery.id] = {
        ...existing,
        ...delivery,
        updatedAt: now,
        createdAt: existing.createdAt || now,
      };

      // Bound deliveries retention without deleting active work
      const deliveryEntries = Object.entries(state.deliveries);
      if (deliveryEntries.length > 5000) {
        const completed = deliveryEntries.filter(
          ([, d]) => d.providerStatus === 'ACCEPTED' || d.providerStatus === 'FAILED_TERMINAL'
        );
        completed.sort((a, b) => new Date(a[1].createdAt) - new Date(b[1].createdAt));
        const toRemoveCount = deliveryEntries.length - 5000;
        const canRemove = completed.slice(0, toRemoveCount);
        for (const [k] of canRemove) {
          delete state.deliveries[k];
        }
      }

      return state.deliveries[delivery.id];
    });
  }

  getDelivery(id) {
    const state = this._readState();
    return state.deliveries[id] || null;
  }

  findDeliveryByDedupeKey(dedupeKey) {
    if (!dedupeKey) return null;
    const state = this._readState();
    return Object.values(state.deliveries).find((d) => d.dedupeKey === dedupeKey) || null;
  }

  listDeliveries({ limit = 50, candidateId, status } = {}) {
    const state = this._readState();
    let list = Object.values(state.deliveries);
    if (candidateId) {
      list = list.filter((d) => d.candidateId === candidateId);
    }
    if (status) {
      list = list.filter((d) => d.providerStatus === status);
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.slice(0, limit);
  }

  /**
   * Atomically claims an eligible delivery for attempt with a lease and fencing token.
   * Only QUEUED, due RETRY_SCHEDULED, or expired ATTEMPTING deliveries can be claimed.
   */
  claimDeliveryForAttempt(deliveryId, leaseDurationMs = 60000) {
    return this._withLock((state) => {
      const delivery = state.deliveries[deliveryId];
      if (!delivery) return null;

      const now = Date.now();
      const nowIso = new Date(now).toISOString();

      const isQueued = delivery.providerStatus === 'QUEUED';
      const isRetryDue =
        delivery.providerStatus === 'RETRY_SCHEDULED' &&
        delivery.nextRetryAt &&
        delivery.nextRetryAt <= nowIso;
      const isLeaseExpired =
        delivery.providerStatus === 'ATTEMPTING' &&
        delivery.leaseExpiresAt &&
        delivery.leaseExpiresAt <= nowIso;

      if (!isQueued && !isRetryDue && !isLeaseExpired) {
        // Already leased with active unexpired lease, or accepted/failed
        return null;
      }

      delivery.attemptCount = (delivery.attemptCount || 0) + 1;
      delivery.leaseToken = `${delivery.id}:${delivery.attemptCount}:${now}`;
      delivery.providerStatus = 'ATTEMPTING';
      delivery.leasedAt = nowIso;
      delivery.leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();
      delivery.updatedAt = nowIso;

      return { ...delivery };
    });
  }

  /**
   * Updates delivery outcome while enforcing the fencing token against late workers.
   */
  saveDeliveryOutcome({
    deliveryId,
    leaseToken,
    providerStatus,
    providerResponse,
    error,
    nextRetryAt,
  }) {
    return this._withLock((state) => {
      const delivery = state.deliveries[deliveryId];
      if (!delivery) return null;

      // Fencing check: if delivery has a leaseToken and the supplied token differs, fence out
      if (leaseToken && delivery.leaseToken && delivery.leaseToken !== leaseToken) {
        return { fenced: true, reason: 'STALE_LEASE_FENCED', delivery };
      }

      const now = new Date().toISOString();
      delivery.providerStatus = providerStatus;
      delivery.updatedAt = now;
      if (providerResponse) delivery.providerResponse = providerResponse;
      if (error) delivery.error = error;
      if (nextRetryAt) delivery.nextRetryAt = nextRetryAt;
      if (providerStatus === 'ACCEPTED') {
        delivery.acceptedAt = now;
      }

      return { fenced: false, delivery };
    });
  }

  findDueRetries(nowMs = Date.now()) {
    const state = this._readState();
    const nowIso = new Date(nowMs).toISOString();
    return Object.values(state.deliveries).filter((d) => {
      // 1. Scheduled retries due
      if (d.providerStatus === 'RETRY_SCHEDULED' && d.nextRetryAt && d.nextRetryAt <= nowIso) {
        return true;
      }
      // 2. Expired lease from crashed worker
      if (d.providerStatus === 'ATTEMPTING' && d.leaseExpiresAt && d.leaseExpiresAt <= nowIso) {
        return true;
      }
      return false;
    });
  }

  // ─── SUPPRESSIONS (Global vs Per-Subscription Scope) ─────────────────────────

  isGloballySuppressed(email) {
    if (!email) return false;
    const state = this._readState();
    return Boolean(state.global_suppressions[email.toLowerCase().trim()]);
  }

  isSubscriptionSuppressed(subscriptionId) {
    if (!subscriptionId) return false;
    const state = this._readState();
    return Boolean(state.subscription_suppressions[subscriptionId]);
  }

  isSuppressed(email, subscriptionId = null) {
    if (this.isGloballySuppressed(email)) return true;
    if (subscriptionId && this.isSubscriptionSuppressed(subscriptionId)) return true;
    return false;
  }

  addGlobalSuppression({ email, reason = 'BOUNCED', source = 'WEBHOOK' }) {
    if (!email) throw new Error('email is required to add global suppression');
    return this._withLock((state) => {
      const normalized = email.toLowerCase().trim();
      state.global_suppressions[normalized] = {
        email: normalized,
        reason, // BOUNCED | COMPLAINT | GLOBAL_OPTOUT | ADMIN
        source, // WEBHOOK | TOKEN_UNSUBSCRIBE | ADMIN
        scope: 'GLOBAL',
        createdAt: new Date().toISOString(),
      };
      return state.global_suppressions[normalized];
    });
  }

  addSubscriptionSuppression({
    subscriptionId,
    email,
    candidateId,
    reason = 'UNSUBSCRIBED',
    source = 'TOKEN_UNSUBSCRIBE',
  }) {
    if (!subscriptionId) throw new Error('subscriptionId is required for subscription suppression');
    return this._withLock((state) => {
      const normalized = (email || '').toLowerCase().trim();
      state.subscription_suppressions[subscriptionId] = {
        subscriptionId,
        email: normalized,
        candidateId: candidateId || null,
        reason,
        source,
        scope: 'SUBSCRIPTION',
        createdAt: new Date().toISOString(),
      };
      // Also deactivate the local subscription entry
      if (state.subscriptions[subscriptionId]) {
        state.subscriptions[subscriptionId].active = false;
        state.subscriptions[subscriptionId].updatedAt = new Date().toISOString();
      }
      return state.subscription_suppressions[subscriptionId];
    });
  }

  removeGlobalSuppression(email) {
    if (!email) return false;
    return this._withLock((state) => {
      const normalized = email.toLowerCase().trim();
      if (state.global_suppressions[normalized]) {
        delete state.global_suppressions[normalized];
        return true;
      }
      return false;
    });
  }

  addSuppression(arg, reason = 'BOUNCED', source = 'LEGACY') {
    if (typeof arg === 'object' && arg !== null) {
      return this.addGlobalSuppression(arg);
    }
    return this.addGlobalSuppression({ email: arg, reason, source });
  }

  removeSuppression(email) {
    return this.removeGlobalSuppression(email);
  }

  listSuppressions() {
    return this.listGlobalSuppressions();
  }

  listGlobalSuppressions() {
    const state = this._readState();
    return Object.values(state.global_suppressions);
  }

  listSubscriptionSuppressions() {
    const state = this._readState();
    return Object.values(state.subscription_suppressions);
  }

  // ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────

  saveSubscription(subscription) {
    if (!subscription || !subscription.id) {
      throw new Error('Subscription must contain an id');
    }
    return this._withLock((state) => {
      const now = new Date().toISOString();
      const existing = state.subscriptions[subscription.id] || {};
      state.subscriptions[subscription.id] = {
        ...existing,
        ...subscription,
        email: (subscription.email || existing.email || '').toLowerCase().trim(),
        active:
          subscription.active !== undefined
            ? Boolean(subscription.active)
            : existing.active !== undefined
            ? existing.active
            : true,
        email_verified:
          subscription.email_verified !== undefined
            ? Boolean(subscription.email_verified)
            : existing.email_verified !== undefined
            ? existing.email_verified
            : true,
        updatedAt: now,
        createdAt: existing.createdAt || now,
      };
      return state.subscriptions[subscription.id];
    });
  }

  getSubscription(id) {
    const state = this._readState();
    return state.subscriptions[id] || null;
  }

  listSubscriptions({ activeOnly = false } = {}) {
    const state = this._readState();
    let list = Object.values(state.subscriptions);
    if (activeOnly) {
      list = list.filter((s) => s.active);
    }
    return list;
  }

  deactivateSubscription(id) {
    return this._withLock((state) => {
      if (state.subscriptions[id]) {
        state.subscriptions[id].active = false;
        state.subscriptions[id].updatedAt = new Date().toISOString();
        return true;
      }
      return false;
    });
  }

  // ─── DIGEST MANAGEMENT ──────────────────────────────────────────────────────

  addPendingDigestJob({ subscriptionId, candidateId, email, job, frequency = 'DAILY', windowKey }) {
    return this._withLock((state) => {
      if (!state.digests) state.digests = {};
      const key = `${subscriptionId}:${windowKey}`;
      if (!state.digests[key]) {
        state.digests[key] = {
          subscriptionId,
          candidateId,
          email,
          frequency,
          windowKey,
          jobs: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      const exists = state.digests[key].jobs.some((j) => j.id === job.id);
      if (!exists) {
        state.digests[key].jobs.push(job);
        state.digests[key].updatedAt = new Date().toISOString();
      }
      return state.digests[key];
    });
  }

  getPendingDigest(subscriptionId, windowKey) {
    const state = this._readState();
    if (!state.digests) return null;
    return state.digests[`${subscriptionId}:${windowKey}`] || null;
  }

  clearPendingDigest(subscriptionId, windowKey) {
    return this._withLock((state) => {
      if (!state.digests) return false;
      const key = `${subscriptionId}:${windowKey}`;
      if (state.digests[key]) {
        delete state.digests[key];
        return true;
      }
      return false;
    });
  }

  listPendingDigests() {
    const state = this._readState();
    if (!state.digests) return [];
    return Object.values(state.digests).filter((d) => d.jobs && d.jobs.length > 0);
  }

  // ─── OUTBOX SYNC TASKS ──────────────────────────────────────────────────────

  recordSyncTask({ id = crypto.randomUUID(), type, payload, status = 'PENDING', nextRetryAt }) {
    return this._withLock((state) => {
      if (!state.sync_tasks) state.sync_tasks = {};
      state.sync_tasks[id] = {
        id,
        type,
        payload,
        status, // PENDING | CONFIRMED | FAILED
        attemptCount: 0,
        nextRetryAt: nextRetryAt || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return state.sync_tasks[id];
    });
  }

  listPendingSyncTasks(nowIso = new Date().toISOString()) {
    const state = this._readState();
    if (!state.sync_tasks) return [];
    return Object.values(state.sync_tasks).filter((t) => {
      return t.status === 'PENDING' && (!t.nextRetryAt || t.nextRetryAt <= nowIso);
    });
  }

  updateSyncTask(id, { status, error, response, nextRetryAt }) {
    return this._withLock((state) => {
      if (!state.sync_tasks || !state.sync_tasks[id]) return null;
      const task = state.sync_tasks[id];
      task.status = status || task.status;
      task.attemptCount = (task.attemptCount || 0) + 1;
      task.updatedAt = new Date().toISOString();
      if (error) task.error = error;
      if (response) task.response = response;
      if (nextRetryAt) task.nextRetryAt = nextRetryAt;
      return task;
    });
  }

  // ─── CAPTURED EMAILS (Local Mailbox) ────────────────────────────────────────

  recordCapturedEmail(emailData) {
    return this._withLock((state) => {
      const record = {
        id: emailData.id || crypto.randomUUID(),
        to: emailData.to,
        from: emailData.from,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        headers: emailData.headers || {},
        metadata: emailData.metadata || {},
        capturedAt: new Date().toISOString(),
      };
      state.captured_emails.push(record);

      // Bound captured emails size (max 500)
      if (state.captured_emails.length > 500) {
        state.captured_emails = state.captured_emails.slice(-500);
      }
      return record;
    });
  }

  listCapturedEmails({ limit = 50, to } = {}) {
    const state = this._readState();
    let list = [...state.captured_emails];
    if (to) {
      const target = to.toLowerCase().trim();
      list = list.filter((m) => m.to && m.to.toLowerCase().includes(target));
    }
    list.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
    return list.slice(0, limit);
  }

  getCapturedEmail(id) {
    const state = this._readState();
    return state.captured_emails.find((m) => m.id === id) || null;
  }

  clearCapturedEmails() {
    return this._withLock((state) => {
      state.captured_emails = [];
    });
  }

  // ─── STATS & DIAGNOSTICS ────────────────────────────────────────────────────

  getStats() {
    const state = this._readState();
    const deliveries = Object.values(state.deliveries);
    const byStatus = {};
    for (const d of deliveries) {
      byStatus[d.providerStatus] = (byStatus[d.providerStatus] || 0) + 1;
    }

    const globalCount = Object.keys(state.global_suppressions).length;
    const subscriptionCount = Object.keys(state.subscription_suppressions).length;

    return {
      totalDeliveries: deliveries.length,
      deliveriesByStatus: byStatus,
      globalSuppressions: globalCount,
      subscriptionSuppressions: subscriptionCount,
      totalSuppressions: globalCount + subscriptionCount,
      totalSubscriptions: Object.keys(state.subscriptions).length,
      activeSubscriptions: Object.values(state.subscriptions).filter((s) => s.active).length,
      totalCapturedEmails: state.captured_emails.length,
      totalEventReceipts: Object.keys(state.event_receipts).length,
    };
  }
}

module.exports = {
  DurableNotificationStore,
  PersistenceCorruptionError,
};

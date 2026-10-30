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
      global_suppressions: {},        // email.toLowerCase() -> GlobalSuppressionRecord (Bounced, Complaint, Global Opt-out)
      subscription_suppressions: {},  // subscriptionId -> SubscriptionSuppressionRecord (Per-query Unsubscribe)
      subscriptions: {},              // subscriptionId -> SubscriptionRecord
      captured_emails: [],            // Array of CapturedEmailRecord
    };

    if (!this.inMemoryOnly) {
      this._load();
    }
  }

  _load() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return;

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.state = {
          version: parsed.version || 2,
          deliveries: parsed.deliveries || {},
          event_receipts: parsed.event_receipts || {},
          global_suppressions: parsed.global_suppressions || parsed.suppressions || {},
          subscription_suppressions: parsed.subscription_suppressions || {},
          subscriptions: parsed.subscriptions || {},
          captured_emails: Array.isArray(parsed.captured_emails) ? parsed.captured_emails : [],
        };
      }
    } catch (err) {
      // Quarantine corrupted store to avoid silent destruction of data
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.filePath, backupPath);
      } catch (copyErr) {
        // Log backup failure
      }
      this.isCorrupted = true;
      this.corruptionError = err;
      throw new PersistenceCorruptionError(
        `Durable store file at ${this.filePath} is corrupted: ${err.message}. A safety backup was saved to ${backupPath}.`,
        err,
        backupPath
      );
    }
  }

  _syncFromDisk() {
    if (this.inMemoryOnly || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return;
      const diskState = JSON.parse(raw);
      if (diskState && typeof diskState === 'object') {
        // Merge disk state into memory state
        this.state.deliveries = { ...diskState.deliveries, ...this.state.deliveries };
        this.state.event_receipts = { ...diskState.event_receipts, ...this.state.event_receipts };
        this.state.global_suppressions = {
          ...(diskState.global_suppressions || diskState.suppressions || {}),
          ...this.state.global_suppressions,
        };
        this.state.subscription_suppressions = {
          ...(diskState.subscription_suppressions || {}),
          ...this.state.subscription_suppressions,
        };
        this.state.subscriptions = { ...diskState.subscriptions, ...this.state.subscriptions };

        // Merge captured emails preserving uniqueness by ID
        const seenIds = new Set(this.state.captured_emails.map((m) => m.id));
        const fromDisk = Array.isArray(diskState.captured_emails) ? diskState.captured_emails : [];
        for (const mail of fromDisk) {
          if (!seenIds.has(mail.id)) {
            this.state.captured_emails.push(mail);
            seenIds.add(mail.id);
          }
        }
      }
    } catch (err) {
      // If concurrent write in flight, continue with current memory state
    }
  }

  _flush() {
    if (this.inMemoryOnly) return;
    if (this.isCorrupted) {
      throw new Error(
        `Persistence operation blocked: Store at ${this.filePath} is corrupted. Resolve corruption before writing.`
      );
    }

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${this.filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const serialized = JSON.stringify(this.state, null, 2);

    // Atomic disk sync: write to temp file then rename
    fs.writeFileSync(tempPath, serialized, 'utf8');
    fs.renameSync(tempPath, this.filePath);
  }

  // ─── EVENT RECEIPTS (Idempotency) ──────────────────────────────────────────

  hasEventReceipt(eventId) {
    if (!eventId) return false;
    this._syncFromDisk();
    return Boolean(this.state.event_receipts[eventId]);
  }

  recordEventReceipt(eventId, eventType = 'job.ingested.v1', status = 'PROCESSED') {
    if (!eventId) return;
    this._syncFromDisk();
    this.state.event_receipts[eventId] = {
      eventId,
      eventType,
      status,
      receivedAt: new Date().toISOString(),
    };

    // Bound receipts retention (max 5000)
    const keys = Object.keys(this.state.event_receipts);
    if (keys.length > 5000) {
      const oldestKeys = keys.slice(0, keys.length - 5000);
      for (const k of oldestKeys) {
        delete this.state.event_receipts[k];
      }
    }

    this._flush();
  }

  // ─── DELIVERIES & STATE MACHINE ─────────────────────────────────────────────

  saveDelivery(delivery) {
    if (!delivery || !delivery.id) {
      throw new Error('Delivery record must contain a valid id');
    }
    this._syncFromDisk();
    const now = new Date().toISOString();
    const existing = this.state.deliveries[delivery.id] || {};
    this.state.deliveries[delivery.id] = {
      ...existing,
      ...delivery,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };

    // Bound deliveries retention (max 5000)
    const keys = Object.keys(this.state.deliveries);
    if (keys.length > 5000) {
      const oldestKeys = keys.slice(0, keys.length - 5000);
      for (const k of oldestKeys) {
        delete this.state.deliveries[k];
      }
    }

    this._flush();
    return this.state.deliveries[delivery.id];
  }

  getDelivery(id) {
    this._syncFromDisk();
    return this.state.deliveries[id] || null;
  }

  findDeliveryByDedupeKey(dedupeKey) {
    if (!dedupeKey) return null;
    this._syncFromDisk();
    return Object.values(this.state.deliveries).find((d) => d.dedupeKey === dedupeKey) || null;
  }

  listDeliveries({ limit = 50, candidateId, status } = {}) {
    this._syncFromDisk();
    let list = Object.values(this.state.deliveries);
    if (candidateId) {
      list = list.filter((d) => d.candidateId === candidateId);
    }
    if (status) {
      list = list.filter((d) => d.providerStatus === status);
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.slice(0, limit);
  }

  claimDeliveryForAttempt(deliveryId, leaseDurationMs = 300000) {
    this._syncFromDisk();
    const delivery = this.state.deliveries[deliveryId];
    if (!delivery) return null;

    const now = Date.now();
    delivery.providerStatus = 'ATTEMPTING';
    delivery.attemptCount = (delivery.attemptCount || 0) + 1;
    delivery.leasedAt = new Date(now).toISOString();
    delivery.leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();
    delivery.updatedAt = new Date(now).toISOString();

    this._flush();
    return delivery;
  }

  findDueRetries(nowMs = Date.now()) {
    this._syncFromDisk();
    const nowIso = new Date(nowMs).toISOString();
    return Object.values(this.state.deliveries).filter((d) => {
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
    this._syncFromDisk();
    return Boolean(this.state.global_suppressions[email.toLowerCase().trim()]);
  }

  isSubscriptionSuppressed(subscriptionId) {
    if (!subscriptionId) return false;
    this._syncFromDisk();
    return Boolean(this.state.subscription_suppressions[subscriptionId]);
  }

  isSuppressed(email, subscriptionId = null) {
    if (this.isGloballySuppressed(email)) return true;
    if (subscriptionId && this.isSubscriptionSuppressed(subscriptionId)) return true;
    return false;
  }

  addGlobalSuppression({ email, reason = 'BOUNCED', source = 'WEBHOOK' }) {
    if (!email) throw new Error('email is required to add global suppression');
    this._syncFromDisk();
    const normalized = email.toLowerCase().trim();
    this.state.global_suppressions[normalized] = {
      email: normalized,
      reason, // BOUNCED | COMPLAINT | GLOBAL_OPTOUT | ADMIN
      source, // WEBHOOK | TOKEN_UNSUBSCRIBE | ADMIN
      scope: 'GLOBAL',
      createdAt: new Date().toISOString(),
    };
    this._flush();
    return this.state.global_suppressions[normalized];
  }

  addSubscriptionSuppression({
    subscriptionId,
    email,
    candidateId,
    reason = 'UNSUBSCRIBED',
    source = 'TOKEN_UNSUBSCRIBE',
  }) {
    if (!subscriptionId) throw new Error('subscriptionId is required for subscription suppression');
    this._syncFromDisk();
    const normalized = (email || '').toLowerCase().trim();
    this.state.subscription_suppressions[subscriptionId] = {
      subscriptionId,
      email: normalized,
      candidateId: candidateId || null,
      reason,
      source,
      scope: 'SUBSCRIPTION',
      createdAt: new Date().toISOString(),
    };
    // Also deactivate the local subscription entry
    if (this.state.subscriptions[subscriptionId]) {
      this.state.subscriptions[subscriptionId].active = false;
      this.state.subscriptions[subscriptionId].updatedAt = new Date().toISOString();
    }
    this._flush();
    return this.state.subscription_suppressions[subscriptionId];
  }

  removeGlobalSuppression(email) {
    if (!email) return false;
    this._syncFromDisk();
    const normalized = email.toLowerCase().trim();
    if (this.state.global_suppressions[normalized]) {
      delete this.state.global_suppressions[normalized];
      this._flush();
      return true;
    }
    return false;
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
    this._syncFromDisk();
    return Object.values(this.state.global_suppressions);
  }

  listSubscriptionSuppressions() {
    this._syncFromDisk();
    return Object.values(this.state.subscription_suppressions);
  }

  // ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────

  saveSubscription(subscription) {
    if (!subscription || !subscription.id) {
      throw new Error('Subscription must contain an id');
    }
    this._syncFromDisk();
    const now = new Date().toISOString();
    const existing = this.state.subscriptions[subscription.id] || {};
    this.state.subscriptions[subscription.id] = {
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
    this._flush();
    return this.state.subscriptions[subscription.id];
  }

  getSubscription(id) {
    this._syncFromDisk();
    return this.state.subscriptions[id] || null;
  }

  listSubscriptions({ activeOnly = false } = {}) {
    this._syncFromDisk();
    let list = Object.values(this.state.subscriptions);
    if (activeOnly) {
      list = list.filter((s) => s.active);
    }
    return list;
  }

  deactivateSubscription(id) {
    this._syncFromDisk();
    if (this.state.subscriptions[id]) {
      this.state.subscriptions[id].active = false;
      this.state.subscriptions[id].updatedAt = new Date().toISOString();
      this._flush();
      return true;
    }
    return false;
  }

  // ─── CAPTURED EMAILS (Local Mailbox) ────────────────────────────────────────

  recordCapturedEmail(emailData) {
    this._syncFromDisk();
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
    this.state.captured_emails.push(record);

    // Bound captured emails size (max 500)
    if (this.state.captured_emails.length > 500) {
      this.state.captured_emails = this.state.captured_emails.slice(-500);
    }
    this._flush();
    return record;
  }

  listCapturedEmails({ limit = 50, to } = {}) {
    this._syncFromDisk();
    let list = [...this.state.captured_emails];
    if (to) {
      const target = to.toLowerCase().trim();
      list = list.filter((m) => m.to && m.to.toLowerCase().includes(target));
    }
    list.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
    return list.slice(0, limit);
  }

  getCapturedEmail(id) {
    this._syncFromDisk();
    return this.state.captured_emails.find((m) => m.id === id) || null;
  }

  clearCapturedEmails() {
    this._syncFromDisk();
    this.state.captured_emails = [];
    this._flush();
  }

  // ─── STATS & DIAGNOSTICS ────────────────────────────────────────────────────

  getStats() {
    this._syncFromDisk();
    const deliveries = Object.values(this.state.deliveries);
    const byStatus = {};
    for (const d of deliveries) {
      byStatus[d.providerStatus] = (byStatus[d.providerStatus] || 0) + 1;
    }

    const globalCount = Object.keys(this.state.global_suppressions).length;
    const subscriptionCount = Object.keys(this.state.subscription_suppressions).length;

    return {
      totalDeliveries: deliveries.length,
      deliveriesByStatus: byStatus,
      globalSuppressions: globalCount,
      subscriptionSuppressions: subscriptionCount,
      totalSuppressions: globalCount + subscriptionCount,
      totalSubscriptions: Object.keys(this.state.subscriptions).length,
      activeSubscriptions: Object.values(this.state.subscriptions).filter((s) => s.active).length,
      totalCapturedEmails: this.state.captured_emails.length,
      totalEventReceipts: Object.keys(this.state.event_receipts).length,
    };
  }

  reset() {
    this.state = {
      version: 2,
      deliveries: {},
      event_receipts: {},
      global_suppressions: {},
      subscription_suppressions: {},
      subscriptions: {},
      captured_emails: [],
    };
    this.isCorrupted = false;
    this.corruptionError = null;
    this._flush();
  }
}

module.exports = {
  DurableNotificationStore,
  PersistenceCorruptionError,
};

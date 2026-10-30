'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DurableNotificationStore {
  /**
   * @param {Object} options
   * @param {string} [options.filePath] - Absolute or relative path to store file
   * @param {boolean} [options.inMemoryOnly=false] - For ultra-fast test isolation
   */
  constructor({ filePath, inMemoryOnly = false } = {}) {
    this.inMemoryOnly = inMemoryOnly;
    this.filePath = filePath || process.env.NOTIFICATIONS_STORE_PATH || path.join(__dirname, '..', 'data', 'notifications_store.json');

    this.state = {
      version: 1,
      deliveries: {},       // id -> DeliveryRecord
      event_receipts: {},   // eventId -> EventReceipt
      suppressions: {},     // email.toLowerCase() -> SuppressionRecord
      subscriptions: {},    // subscriptionId -> SubscriptionRecord
      captured_emails: [],  // Array of CapturedEmailRecord
    };

    if (!this.inMemoryOnly) {
      this._load();
    }
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = {
            version: parsed.version || 1,
            deliveries: parsed.deliveries || {},
            event_receipts: parsed.event_receipts || {},
            suppressions: parsed.suppressions || {},
            subscriptions: parsed.subscriptions || {},
            captured_emails: Array.isArray(parsed.captured_emails) ? parsed.captured_emails : [],
          };
        }
      }
    } catch (err) {
      console.warn(`[DurableNotificationStore] Warning: Could not read existing store from ${this.filePath}: ${err.message}. Initializing empty store.`);
    }
  }

  _flush() {
    if (this.inMemoryOnly) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this.filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      const serialized = JSON.stringify(this.state, null, 2);
      fs.writeFileSync(tempPath, serialized, 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[DurableNotificationStore] Error persisting store to ${this.filePath}:`, err);
    }
  }

  // ─── EVENT RECEIPTS ─────────────────────────────────────────────────────────

  hasEventReceipt(eventId) {
    if (!eventId) return false;
    return Boolean(this.state.event_receipts[eventId]);
  }

  recordEventReceipt(eventId, eventType = 'job.ingested.v1', status = 'PROCESSED') {
    if (!eventId) return;
    this.state.event_receipts[eventId] = {
      eventId,
      eventType,
      status,
      receivedAt: new Date().toISOString(),
    };
    this._flush();
  }

  // ─── DELIVERIES ─────────────────────────────────────────────────────────────

  saveDelivery(delivery) {
    if (!delivery || !delivery.id) {
      throw new Error('Delivery record must contain a valid id');
    }
    const now = new Date().toISOString();
    const existing = this.state.deliveries[delivery.id] || {};
    this.state.deliveries[delivery.id] = {
      ...existing,
      ...delivery,
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };
    this._flush();
    return this.state.deliveries[delivery.id];
  }

  getDelivery(id) {
    return this.state.deliveries[id] || null;
  }

  findDeliveryByDedupeKey(dedupeKey) {
    if (!dedupeKey) return null;
    return Object.values(this.state.deliveries).find((d) => d.dedupeKey === dedupeKey) || null;
  }

  listDeliveries({ limit = 50, candidateId, status } = {}) {
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

  // ─── SUPPRESSIONS ───────────────────────────────────────────────────────────

  isSuppressed(email) {
    if (!email) return false;
    return Boolean(this.state.suppressions[email.toLowerCase().trim()]);
  }

  getSuppression(email) {
    if (!email) return null;
    return this.state.suppressions[email.toLowerCase().trim()] || null;
  }

  addSuppression({ email, candidateId, subscriptionId, reason = 'UNSUBSCRIBED', source = 'TOKEN_UNSUBSCRIBE' }) {
    if (!email) throw new Error('email is required to add suppression');
    const normalized = email.toLowerCase().trim();
    this.state.suppressions[normalized] = {
      email: normalized,
      candidateId: candidateId || null,
      subscriptionId: subscriptionId || null,
      reason, // UNSUBSCRIBED | BOUNCED | COMPLAINT
      source, // TOKEN_UNSUBSCRIBE | WEBHOOK | MANUAL
      createdAt: new Date().toISOString(),
    };
    this._flush();
    return this.state.suppressions[normalized];
  }

  removeSuppression(email) {
    if (!email) return false;
    const normalized = email.toLowerCase().trim();
    if (this.state.suppressions[normalized]) {
      delete this.state.suppressions[normalized];
      this._flush();
      return true;
    }
    return false;
  }

  listSuppressions() {
    return Object.values(this.state.suppressions);
  }

  // ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────

  saveSubscription(subscription) {
    if (!subscription || !subscription.id) {
      throw new Error('Subscription must contain an id');
    }
    const now = new Date().toISOString();
    const existing = this.state.subscriptions[subscription.id] || {};
    this.state.subscriptions[subscription.id] = {
      ...existing,
      ...subscription,
      email: (subscription.email || existing.email || '').toLowerCase().trim(),
      active: subscription.active !== undefined ? Boolean(subscription.active) : (existing.active !== undefined ? existing.active : true),
      updatedAt: now,
      createdAt: existing.createdAt || now,
    };
    this._flush();
    return this.state.subscriptions[subscription.id];
  }

  getSubscription(id) {
    return this.state.subscriptions[id] || null;
  }

  listSubscriptions({ activeOnly = false } = {}) {
    let list = Object.values(this.state.subscriptions);
    if (activeOnly) {
      list = list.filter((s) => s.active);
    }
    return list;
  }

  deactivateSubscription(id) {
    if (this.state.subscriptions[id]) {
      this.state.subscriptions[id].active = false;
      this.state.subscriptions[id].updatedAt = new Date().toISOString();
      this._flush();
      return true;
    }
    return false;
  }

  // ─── CAPTURED EMAILS ────────────────────────────────────────────────────────

  recordCapturedEmail(emailData) {
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
    // Keep max 500 captured emails in memory/disk to bound storage
    if (this.state.captured_emails.length > 500) {
      this.state.captured_emails = this.state.captured_emails.slice(-500);
    }
    this._flush();
    return record;
  }

  listCapturedEmails({ limit = 50, to } = {}) {
    let list = [...this.state.captured_emails];
    if (to) {
      const target = to.toLowerCase().trim();
      list = list.filter((m) => m.to && m.to.toLowerCase().includes(target));
    }
    list.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
    return list.slice(0, limit);
  }

  getCapturedEmail(id) {
    return this.state.captured_emails.find((m) => m.id === id) || null;
  }

  clearCapturedEmails() {
    this.state.captured_emails = [];
    this._flush();
  }

  // ─── STATS & UTILS ──────────────────────────────────────────────────────────

  getStats() {
    const deliveries = Object.values(this.state.deliveries);
    const byStatus = {};
    for (const d of deliveries) {
      byStatus[d.providerStatus] = (byStatus[d.providerStatus] || 0) + 1;
    }

    return {
      totalDeliveries: deliveries.length,
      deliveriesByStatus: byStatus,
      totalSuppressions: Object.keys(this.state.suppressions).length,
      totalSubscriptions: Object.keys(this.state.subscriptions).length,
      activeSubscriptions: Object.values(this.state.subscriptions).filter((s) => s.active).length,
      totalCapturedEmails: this.state.captured_emails.length,
      totalEventReceipts: Object.keys(this.state.event_receipts).length,
    };
  }

  reset() {
    this.state = {
      version: 1,
      deliveries: {},
      event_receipts: {},
      suppressions: {},
      subscriptions: {},
      captured_emails: [],
    };
    this._flush();
  }
}

module.exports = {
  DurableNotificationStore,
};

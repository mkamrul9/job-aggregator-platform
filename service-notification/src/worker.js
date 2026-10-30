'use strict';

class DurableNotificationWorker {
  /**
   * @param {Object} options
   * @param {import('./storage').DurableNotificationStore} options.store
   * @param {import('./dispatcher').DeliveryDispatcher} options.dispatcher
   * @param {string} [options.userServiceUrl]
   * @param {number} [options.intervalMs=2000]
   */
  constructor({
    store,
    dispatcher,
    userServiceUrl = process.env.USER_SERVICE_URL,
    intervalMs = 2000,
  }) {
    this.store = store;
    this.dispatcher = dispatcher;
    this.userServiceUrl = userServiceUrl;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.isRunning = false;
    this.isProcessing = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(async () => {
      await this.runOnce().catch((err) => {
        console.error('[NotificationWorker] Loop error:', err.message);
      });
    }, this.intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Executes a single pass over due retries, pending preference syncs, and digests.
   */
  async runOnce() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.processDueRetries();
      await this.processPendingSyncTasks();
      await this.processDueDigests();
    } finally {
      this.isProcessing = false;
    }
  }

  async processDueRetries() {
    const dueDeliveries = this.store.findDueRetries(Date.now());
    for (const delivery of dueDeliveries) {
      const claimed = this.store.claimDeliveryForAttempt(delivery.id, 60000);
      if (!claimed) continue; // Already leased or fenced

      const subscription = claimed.storedSubscription || this.store.getSubscription(claimed.subscriptionId);
      const jobs = claimed.storedJobs || [];

      if (!subscription || jobs.length === 0) {
        this.store.saveDeliveryOutcome({
          deliveryId: claimed.id,
          leaseToken: claimed.leaseToken,
          providerStatus: 'FAILED_TERMINAL',
          error: 'Stored job or subscription payload missing for retry recovery',
        });
        continue;
      }

      await this.dispatcher.executeDeliveryAttempt({
        delivery: claimed,
        subscription,
        jobs,
        correlationId: claimed.correlationId,
        causationId: claimed.causationId,
      });
    }
  }

  async processPendingSyncTasks() {
    const pendingTasks = this.store.listPendingSyncTasks();
    if (!this.userServiceUrl || pendingTasks.length === 0) return;

    for (const task of pendingTasks) {
      if (task.type === 'ALERT_UNSUBSCRIBE') {
        try {
          const res = await fetch(`${this.userServiceUrl}/users/alerts/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: task.payload.token }),
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            this.store.updateSyncTask(task.id, { status: 'CONFIRMED' });
          } else {
            const backoffMs = Math.min(30000, 1000 * Math.pow(2, task.attemptCount || 1));
            this.store.updateSyncTask(task.id, {
              status: 'PENDING',
              error: `HTTP ${res.status}`,
              nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
            });
          }
        } catch (err) {
          const backoffMs = Math.min(30000, 1000 * Math.pow(2, task.attemptCount || 1));
          this.store.updateSyncTask(task.id, {
            status: 'PENDING',
            error: err.message,
            nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
          });
        }
      }
    }
  }

  async processDueDigests() {
    const pendingDigests = this.store.listPendingDigests();
    for (const digest of pendingDigests) {
      const subscription = this.store.getSubscription(digest.subscriptionId);
      if (subscription && subscription.active && digest.jobs.length > 0) {
        await this.dispatcher.dispatchAlert({
          subscription: { ...subscription, frequency: 'IMMEDIATE' }, // Flush buffered jobs
          jobs: digest.jobs,
        });
      }
      this.store.clearPendingDigest(digest.subscriptionId, digest.windowKey);
    }
  }
}

module.exports = {
  DurableNotificationWorker,
};


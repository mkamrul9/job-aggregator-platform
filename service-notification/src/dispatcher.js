'use strict';

const crypto = require('crypto');
const { generateUnsubscribeToken } = require('./crypto');
const { renderAlertHtml, renderAlertText } = require('./templates');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class DeliveryDispatcher {
  /**
   * @param {Object} options
   * @param {import('./storage').DurableNotificationStore} options.store
   * @param {Object} [options.transporter] - Nodemailer transport
   * @param {string} [options.mode='CAPTURE'] - 'CAPTURE' or 'SMTP'
   * @param {string} [options.baseUrl='https://seekers.work']
   * @param {string} [options.apiOrigin='http://localhost:4000']
   * @param {Object} [options.metrics] - Prometheus metrics objects
   * @param {Function} [options.onEventEmitted] - Callback when alert.dispatched.v1 is created
   */
  constructor({
    store,
    transporter = null,
    mode = process.env.NOTIFICATION_MODE || 'CAPTURE',
    baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://seekers.work',
    apiOrigin = process.env.NOTIFICATION_API_ORIGIN || 'http://localhost:4000',
    metrics = {},
    onEventEmitted = null,
  }) {
    this.store = store;
    this.transporter = transporter;
    this.mode = mode.toUpperCase();
    this.baseUrl = baseUrl;
    this.apiOrigin = apiOrigin;
    this.metrics = metrics;
    this.onEventEmitted = onEventEmitted;

    if (this.mode === 'SMTP' && !this.transporter) {
      throw new Error(
        'DeliveryDispatcher configured for SMTP mode without a valid Nodemailer transporter. Explicit configuration is required.'
      );
    }
  }

  /**
   * Dispatches an alert email for matching jobs to a candidate subscription.
   *
   * @param {Object} options
   * @param {Object} options.subscription
   * @param {Array<Object>|Object} options.jobs
   * @param {string} [options.correlationId]
   * @param {string} [options.causationId]
   * @param {number} [options.maxAttempts=3]
   * @returns {Promise<Object>} Delivery result
   */
  async dispatchAlert({ subscription, jobs, correlationId, causationId, maxAttempts = 3 }) {
    if (!subscription || typeof subscription !== 'object') {
      return { status: 'SKIPPED_INVALID_SUBSCRIPTION', delivery: null };
    }

    // 1. Strict Final Dispatch Boundary: Active Consent & Verification Checks
    if (subscription.active !== true) {
      return { status: 'SKIPPED_PAUSED', reason: 'Subscription is paused', delivery: null };
    }

    if (subscription.email_verified !== true && subscription.emailVerified !== true) {
      return { status: 'SKIPPED_UNVERIFIED', reason: 'Email is not verified', delivery: null };
    }

    const email = (subscription.email || '').toLowerCase().trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      return { status: 'SKIPPED_INVALID_EMAIL', delivery: null };
    }

    const jobList = Array.isArray(jobs) ? jobs : [jobs];
    if (jobList.length === 0) {
      return { status: 'SKIPPED_NO_JOBS', delivery: null };
    }

    // 2. Strict Suppression Check (Global vs Per-Subscription)
    const isGlobal = this.store.isGloballySuppressed(email);
    const isSubUnsub = this.store.isSubscriptionSuppressed(subscription.id);

    if (isGlobal || isSubUnsub) {
      const skipStatus = isGlobal ? 'SKIPPED_SUPPRESSED' : 'SKIPPED_UNSUBSCRIBED';
      const reasonMsg = isGlobal
        ? 'Recipient address is globally suppressed (bounced or complained)'
        : 'Candidate unsubscribed from this alert subscription';

      const deliveryId = crypto.randomUUID();
      const deliveryRecord = this.store.saveDelivery({
        id: deliveryId,
        subscriptionId: subscription.id,
        candidateId: subscription.candidate_id || subscription.candidateId || subscription.userId || 'usr_anon',
        recipientEmail: email,
        eligibleJobIds: jobList.map((j) => j.id),
        channel: 'EMAIL',
        templateVersion: 'v1.0.0',
        providerStatus: skipStatus,
        attemptCount: 0,
        maxAttempts,
        error: reasonMsg,
        providerReceipt: null,
      });

      this._emitDispatchedEvent({
        deliveryId,
        subscription,
        recipientEmail: email,
        jobList,
        providerStatus: skipStatus,
        correlationId,
        causationId,
      });

      return { status: skipStatus, delivery: deliveryRecord };
    }

    // 3. Documented Multi-Job Logical Deduplication Key
    const sortedJobIds = jobList.map((j) => j.id).filter(Boolean).sort().join(',');
    const dateWindow = new Date().toISOString().substring(0, 10);
    const dedupeKey = `sub:${subscription.id}:jobs:${sortedJobIds}:v${subscription.version || 1}:${dateWindow}`;

    const existingDelivery = this.store.findDeliveryByDedupeKey(dedupeKey);
    if (existingDelivery) {
      const now = Date.now();
      const isLeaseActive =
        existingDelivery.providerStatus === 'ATTEMPTING' &&
        existingDelivery.leaseExpiresAt &&
        new Date(existingDelivery.leaseExpiresAt).getTime() > now;

      if (['ACCEPTED', 'RETRY_SCHEDULED'].includes(existingDelivery.providerStatus) || isLeaseActive) {
        return {
          status: 'SKIPPED_DUPLICATE',
          delivery: existingDelivery,
          reason: 'Alert for this job set already dispatched or actively in-flight',
        };
      }
    }

    // 4. Generate purpose-scoped unsubscribe token
    const token = generateUnsubscribeToken({
      subscriptionId: subscription.id,
      candidateId: subscription.candidate_id || subscription.candidateId || subscription.userId || 'usr_anon',
      email,
    });
    const unsubscribeUrl = `${this.apiOrigin}/api/v1/notifications/unsubscribe?token=${token}`;

    // 5. Render accessible HTML and plain text templates
    const html = renderAlertHtml({
      jobs: jobList,
      subscription,
      unsubscribeUrl,
      baseUrl: this.baseUrl,
    });
    const text = renderAlertText({
      jobs: jobList,
      subscription,
      unsubscribeUrl,
      baseUrl: this.baseUrl,
    });

    const deliveryId = existingDelivery ? existingDelivery.id : crypto.randomUUID();
    const querySubject = subscription.query ? `"${subscription.query}"` : 'Your Preferences';
    const subject =
      jobList.length === 1
        ? `New Job Match: ${jobList[0].title} at ${jobList[0].company}`
        : `Seekers Alert: ${jobList.length} new jobs matching ${querySubject}`;

    const headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@seekers.work?subject=unsubscribe:${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Seekers-Delivery-Id': deliveryId,
      'X-Seekers-Subscription-Id': subscription.id,
    };

    // 6. Record ATTEMPTING state with 5-minute lease
    const now = Date.now();
    const currentAttempt = (existingDelivery?.attemptCount || 0) + 1;
    let deliveryRecord = this.store.saveDelivery({
      id: deliveryId,
      dedupeKey,
      subscriptionId: subscription.id,
      candidateId: subscription.candidate_id || subscription.candidateId || subscription.userId || 'usr_anon',
      recipientEmail: email,
      eligibleJobIds: jobList.map((j) => j.id),
      channel: 'EMAIL',
      templateVersion: 'v1.0.0',
      providerStatus: 'ATTEMPTING',
      attemptCount: currentAttempt,
      maxAttempts,
      leasedAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + 300000).toISOString(),
      lastAttemptAt: new Date(now).toISOString(),
      error: null,
      providerReceipt: null,
    });

    // 7. Dispatch via CAPTURE (Safe local mailbox) or SMTP Relay
    try {
      if (this.mode === 'CAPTURE' || !this.transporter) {
        const captured = this.store.recordCapturedEmail({
          id: deliveryId,
          to: email,
          from: '"Seekers Job Alerts" <alerts@seekers.work>',
          subject,
          text,
          html,
          headers,
          metadata: {
            deliveryId,
            subscriptionId: subscription.id,
            candidateId: deliveryRecord.candidateId,
            jobIds: jobList.map((j) => j.id),
          },
        });

        deliveryRecord = this.store.saveDelivery({
          id: deliveryId,
          providerStatus: 'ACCEPTED',
          leasedAt: null,
          leaseExpiresAt: null,
          providerReceipt: {
            mode: 'CAPTURE',
            messageId: captured.id,
            timestamp: captured.capturedAt,
          },
        });

        this._recordMetrics('ACCEPTED');

        this._emitDispatchedEvent({
          deliveryId,
          subscription,
          recipientEmail: email,
          jobList,
          providerStatus: 'ACCEPTED',
          correlationId,
          causationId,
        });

        return { status: 'ACCEPTED', mode: 'CAPTURE', delivery: deliveryRecord, capturedId: captured.id };
      }

      // Mode === 'SMTP': Transmit via configured SMTP relay
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"Seekers Job Alerts" <alerts@seekers.work>',
        to: email,
        subject,
        text,
        html,
        headers,
      });

      deliveryRecord = this.store.saveDelivery({
        id: deliveryId,
        providerStatus: 'ACCEPTED',
        leasedAt: null,
        leaseExpiresAt: null,
        providerReceipt: {
          mode: 'SMTP',
          messageId: info.messageId,
          response: info.response,
        },
      });

      this._recordMetrics('ACCEPTED');

      this._emitDispatchedEvent({
        deliveryId,
        subscription,
        recipientEmail: email,
        jobList,
        providerStatus: 'ACCEPTED',
        correlationId,
        causationId,
      });

      return { status: 'ACCEPTED', mode: 'SMTP', delivery: deliveryRecord };
    } catch (sendErr) {
      const isTransient = this._isTransientError(sendErr);
      const isAmbiguous = this._isAmbiguousError(sendErr);

      let finalStatus = 'FAILED_TERMINAL';
      let nextRetryAt = null;

      if (isAmbiguous) {
        finalStatus = 'AMBIGUOUS_UNKNOWN';
      } else if (isTransient && currentAttempt < maxAttempts) {
        finalStatus = 'RETRY_SCHEDULED';
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, currentAttempt - 1) + Math.floor(Math.random() * 200));
        nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      }

      deliveryRecord = this.store.saveDelivery({
        id: deliveryId,
        providerStatus: finalStatus,
        nextRetryAt,
        error: sendErr.message,
        providerReceipt: {
          code: sendErr.code,
          responseCode: sendErr.responseCode,
          transient: isTransient,
          ambiguous: isAmbiguous,
        },
      });

      this._recordMetrics(finalStatus);

      this._emitDispatchedEvent({
        deliveryId,
        subscription,
        recipientEmail: email,
        jobList,
        providerStatus: 'REJECTED',
        correlationId,
        causationId,
      });

      return {
        status: finalStatus,
        delivery: deliveryRecord,
        error: sendErr.message,
        isTransient,
        isAmbiguous,
        nextRetryAt,
      };
    }
  }

  _isTransientError(err) {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '').toUpperCase();
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN' || code === 'ESOCKET') {
      return true;
    }
    if (msg.includes('rate limit') || msg.includes('timeout') || msg.includes('429') || msg.includes('503')) {
      return true;
    }
    return false;
  }

  _isAmbiguousError(err) {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    return msg.includes('socket hung up after headers') || msg.includes('write epipe') || msg.includes('ambiguous');
  }

  _recordMetrics(status) {
    if (this.metrics.emailsSentCounter && status === 'ACCEPTED') {
      this.metrics.emailsSentCounter.inc();
    }
    if (this.metrics.deliveriesCounter) {
      this.metrics.deliveriesCounter.inc({ status: status.toLowerCase(), channel: 'email' });
    }
  }

  _emitDispatchedEvent({
    deliveryId,
    subscription,
    recipientEmail,
    jobList,
    providerStatus,
    correlationId,
    causationId,
  }) {
    // Map internal status to schema-compatible enum: ACCEPTED, REJECTED, SKIPPED_UNSUBSCRIBED
    let contractStatus = 'REJECTED';
    if (providerStatus === 'ACCEPTED') contractStatus = 'ACCEPTED';
    if (providerStatus === 'SKIPPED_UNSUBSCRIBED') contractStatus = 'SKIPPED_UNSUBSCRIBED';

    const event = {
      event_id: crypto.randomUUID(),
      event_type: 'alert.dispatched.v1',
      schema_version: '1.0.0',
      producer: 'service-notification',
      timestamp: new Date().toISOString(),
      correlation_id: correlationId || crypto.randomUUID(),
      causation_id: causationId || null,
      payload: {
        alert_id: deliveryId,
        candidate_id: subscription.candidate_id || subscription.candidateId || subscription.userId || 'usr_anon',
        recipient_email: recipientEmail,
        job_count: jobList.length,
        matching_job_ids: jobList.map((j) => j.id).filter(Boolean),
        delivery_channel: 'EMAIL',
        provider_status: contractStatus,
        dispatched_at: new Date().toISOString(),
      },
    };

    if (typeof this.onEventEmitted === 'function') {
      try {
        this.onEventEmitted(event);
      } catch (err) {
        console.error('[DeliveryDispatcher] Error in onEventEmitted callback:', err);
      }
    }

    return event;
  }
}

module.exports = {
  DeliveryDispatcher,
};

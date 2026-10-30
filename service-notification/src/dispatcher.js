'use strict';

const crypto = require('crypto');
const { generateUnsubscribeToken } = require('./crypto');
const { renderAlertHtml, renderAlertText } = require('./templates');

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
  }

  /**
   * Dispatches an alert email for matching jobs to a candidate subscription.
   *
   * @param {Object} options
   * @param {Object} options.subscription
   * @param {Array<Object>|Object} options.jobs
   * @param {string} [options.correlationId]
   * @param {string} [options.causationId]
   * @returns {Promise<Object>} Delivery result
   */
  async dispatchAlert({ subscription, jobs, correlationId, causationId }) {
    const jobList = Array.isArray(jobs) ? jobs : [jobs];
    if (jobList.length === 0) {
      return { status: 'SKIPPED_NO_JOBS', delivery: null };
    }

    const email = (subscription.email || '').toLowerCase().trim();
    if (!email) {
      return { status: 'SKIPPED_NO_EMAIL', delivery: null };
    }

    // 1. Check suppression (unsubscribed, complaint, bounced)
    if (this.store.isSuppressed(email)) {
      const deliveryId = crypto.randomUUID();
      const deliveryRecord = this.store.saveDelivery({
        id: deliveryId,
        subscriptionId: subscription.id,
        candidateId: subscription.candidate_id || subscription.candidateId || subscription.userId || 'usr_anon',
        recipientEmail: email,
        eligibleJobIds: jobList.map((j) => j.id),
        channel: 'EMAIL',
        templateVersion: 'v1.0.0',
        providerStatus: 'SKIPPED_UNSUBSCRIBED',
        attemptCount: 0,
        maxAttempts: 3,
        error: 'Recipient address is suppressed/unsubscribed',
        providerReceipt: null,
      });

      this._emitDispatchedEvent({
        deliveryId,
        subscription,
        recipientEmail: email,
        jobList,
        providerStatus: 'SKIPPED_UNSUBSCRIBED',
        correlationId,
        causationId,
      });

      return { status: 'SKIPPED_UNSUBSCRIBED', delivery: deliveryRecord };
    }

    // 2. Logical deduplication check
    const primaryJobId = jobList[0].id || 'unknown';
    const dedupeKey = `sub:${subscription.id}:job:${primaryJobId}`;
    const existingDelivery = this.store.findDeliveryByDedupeKey(dedupeKey);
    if (existingDelivery && ['ACCEPTED', 'ATTEMPTING'].includes(existingDelivery.providerStatus)) {
      return {
        status: 'SKIPPED_DUPLICATE',
        delivery: existingDelivery,
        reason: 'Alert for this job already dispatched or in-flight',
      };
    }

    // 3. Generate purpose-scoped unsubscribe token
    const token = generateUnsubscribeToken({
      subscriptionId: subscription.id,
      candidateId: subscription.candidate_id || subscription.candidateId || subscription.userId || 'usr_anon',
      email,
    });
    const unsubscribeUrl = `${this.apiOrigin}/api/v1/notifications/unsubscribe?token=${token}`;

    // 4. Render HTML and text
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

    const deliveryId = crypto.randomUUID();
    const querySubject = subscription.query ? `"${subscription.query}"` : 'Your Preferences';
    const subject = jobList.length === 1
      ? `New Job Match: ${jobList[0].title} at ${jobList[0].company}`
      : `Seekers Alert: ${jobList.length} new jobs matching ${querySubject}`;

    const headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@seekers.work?subject=unsubscribe:${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Seekers-Delivery-Id': deliveryId,
      'X-Seekers-Subscription-Id': subscription.id,
    };

    // Save initial delivery state
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
      attemptCount: 1,
      maxAttempts: 3,
      lastAttemptAt: new Date().toISOString(),
      error: null,
      providerReceipt: null,
    });

    // 5. Send via Transporter or Local Capture
    try {
      if (this.mode === 'CAPTURE' || !this.transporter) {
        // Safe Local Mailbox Capture (zero real email, zero external network dependency)
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

      // Mode === 'SMTP': Transmit via configured SMTP
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
      const newStatus = isTransient ? 'REJECTED' : 'REJECTED'; // alert.dispatched.v1 schema requires ACCEPTED | REJECTED | SKIPPED_UNSUBSCRIBED

      deliveryRecord = this.store.saveDelivery({
        id: deliveryId,
        providerStatus: newStatus,
        error: sendErr.message,
        providerReceipt: {
          code: sendErr.code,
          responseCode: sendErr.responseCode,
          transient: isTransient,
        },
      });

      this._recordMetrics(newStatus);

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
        status: newStatus,
        delivery: deliveryRecord,
        error: sendErr.message,
        isTransient,
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
    // Contract-conforming alert.dispatched.v1 event envelope
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
        provider_status: providerStatus, // 'ACCEPTED' | 'REJECTED' | 'SKIPPED_UNSUBSCRIBED'
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

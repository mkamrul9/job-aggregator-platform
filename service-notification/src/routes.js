'use strict';

const express = require('express');
const { verifyUnsubscribeToken } = require('./crypto');
const { evaluateJobMatch } = require('./matcher');
const { escapeHtml } = require('./templates');

/**
 * Creates the notification routes router.
 *
 * @param {Object} options
 * @param {import('./storage').DurableNotificationStore} options.store
 * @param {import('./dispatcher').DeliveryDispatcher} options.dispatcher
 * @param {Object} [options.metrics]
 * @returns {express.Router}
 */
function createNotificationRouter({ store, dispatcher, metrics = {} }) {
  const router = express.Router();

  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.env.NOTIFICATION_MODE && process.env.NOTIFICATION_MODE.toUpperCase() === 'SMTP');

  // ─── AUTHENTICATION MIDDLEWARE ──────────────────────────────────────────────

  function requireAdminOrServiceAuth(req, res, next) {
    // Unsafe demo bypass flags are strictly forbidden in production mode
    if (!isProduction && process.env.NOTIFICATION_ALLOW_ANON_DEMO === 'true') {
      return next();
    }

    const adminKey = req.headers['x-admin-key'];
    const serviceKey = req.headers['x-service-key'];
    const authHeader = req.headers['authorization'];

    const configuredKey =
      process.env.NOTIFICATION_ADMIN_KEY || process.env.INTERNAL_SERVICE_KEY;

    if (isProduction) {
      if (!configuredKey || configuredKey === 'seekers-internal-service-p11') {
        return res.status(500).json({
          error: 'CONFIGURATION_ERROR',
          message:
            'NOTIFICATION_ADMIN_KEY or INTERNAL_SERVICE_KEY must be configured in production mode. Default keys are strictly prohibited.',
        });
      }
      if (
        (adminKey && adminKey === configuredKey) ||
        (serviceKey && serviceKey === configuredKey) ||
        (authHeader && authHeader === `Bearer ${configuredKey}`)
      ) {
        return next();
      }
      return res.status(401).json({
        error: 'UNAUTHORIZED_ACCESS',
        message: 'Valid admin or internal service credentials required.',
      });
    }

    // In isolated local dev/test mode, accept configured key or dev fallback key
    const expectedKey = configuredKey || 'seekers-internal-service-p11';
    if (
      (adminKey && adminKey === expectedKey) ||
      (serviceKey && serviceKey === expectedKey) ||
      (authHeader && authHeader === `Bearer ${expectedKey}`)
    ) {
      return next();
    }

    return res.status(401).json({
      error: 'UNAUTHORIZED_ACCESS',
      message: 'Valid admin or internal service credentials required.',
    });
  }

  function requireWebhookAuth(req, res, next) {
    if (!isProduction && process.env.NOTIFICATION_ALLOW_ANON_DEMO === 'true' && !process.env.PROVIDER_WEBHOOK_SECRET) {
      return next();
    }

    const configuredSecret = process.env.PROVIDER_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;

    if (isProduction) {
      if (!configuredSecret || configuredSecret === 'seekers-provider-webhook-p11') {
        return res.status(500).json({
          error: 'CONFIGURATION_ERROR',
          message:
            'PROVIDER_WEBHOOK_SECRET must be configured in production mode. Default secrets are strictly prohibited.',
        });
      }
      if (providedSecret && providedSecret === configuredSecret) {
        return next();
      }
      return res.status(401).json({
        error: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Provider webhook signature or secret verification failed.',
      });
    }

    const expectedSecret = configuredSecret || 'seekers-provider-webhook-p11';
    if (providedSecret && providedSecret === expectedSecret) {
      return next();
    }

    return res.status(401).json({
      error: 'INVALID_WEBHOOK_SIGNATURE',
      message: 'Provider webhook signature or secret verification failed.',
    });
  }

  // ─── CAPTURED MAILBOX ENDPOINTS (Protected) ─────────────────────────────────

  router.get('/captured', requireAdminOrServiceAuth, (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    const to = req.query.to ? String(req.query.to) : undefined;
    const items = store.listCapturedEmails({ limit, to });
    res.json({
      total: items.length,
      mode: dispatcher.mode,
      items,
    });
  });

  router.get('/captured/:id', requireAdminOrServiceAuth, (req, res) => {
    const item = store.getCapturedEmail(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'CAPTURED_EMAIL_NOT_FOUND' });
    }
    res.json(item);
  });

  router.delete('/captured', requireAdminOrServiceAuth, (req, res) => {
    store.clearCapturedEmails();
    res.json({ success: true, message: 'Captured mailbox cleared.' });
  });

  // ─── ONE-CLICK UNSUBSCRIBE FLOW (Public, Scoped, RFC 8058) ──────────────────

  // GET: Browser confirmation page (GET is safe/idempotent, won't unsubscribe on link prefetch)
  router.get('/unsubscribe', (req, res) => {
    const token = req.query.token;
    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unsubscribe Error - Seekers</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h1 style="color: #ef4444;">Invalid Unsubscribe Request</h1>
          <p>No unsubscribe token was provided in the link.</p>
        </body>
        </html>
      `);
    }

    const verification = verifyUnsubscribeToken(token);
    if (!verification.valid) {
      const msg =
        verification.error === 'TOKEN_EXPIRED'
          ? 'This unsubscribe link has expired. Please manage your alerts in your Seekers account settings.'
          : 'This unsubscribe link is invalid or has been modified.';
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unsubscribe Error - Seekers</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h1 style="color: #ef4444;">Unable to Unsubscribe</h1>
          <p>${escapeHtml(msg)}</p>
        </body>
        </html>
      `);
    }

    const safeEmail = escapeHtml(verification.email);
    const safeToken = escapeHtml(token);
    const isGlobalScope = verification.scope === 'all';
    const descriptionText = isGlobalScope
      ? `Are you sure you want to stop receiving <strong>all job alerts</strong> sent to <strong>${safeEmail}</strong>?`
      : `Are you sure you want to stop receiving job alerts for this subscription sent to <strong>${safeEmail}</strong>?`;

    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Unsubscribe - Seekers</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
          h1 { margin-top: 0; font-size: 20px; color: #38bdf8; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
          .btn-confirm { background: #ef4444; color: #ffffff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; width: 100%; }
          .btn-confirm:hover { background: #dc2626; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Unsubscribe from Seekers Alerts</h1>
          <p>${descriptionText}</p>
          <form method="POST" action="/api/v1/notifications/unsubscribe">
            <input type="hidden" name="token" value="${safeToken}" />
            <button type="submit" class="btn-confirm" id="confirm-unsub-btn">Confirm Unsubscribe</button>
          </form>
        </div>
      </body>
      </html>
    `);
  });

  // POST: Execute unsubscribe (Supports RFC 8058 One-Click POST & JSON API)
  router.post('/unsubscribe', async (req, res) => {
    // RFC 8058 sends token in URL query parameter and 'List-Unsubscribe=One-Click' in body
    const token = req.body?.token || req.query?.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    const verification = verifyUnsubscribeToken(token);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: verification.error || 'INVALID_TOKEN',
      });
    }

    // Strict capability boundary: The signed scope is the MAXIMUM authority granted.
    // A request body cannot expand 'subscription' into 'all'.
    const isGlobalOptOut = verification.scope === 'all';

    if (isGlobalOptOut) {
      store.addGlobalSuppression({
        email: verification.email,
        reason: 'GLOBAL_OPTOUT',
        source: 'TOKEN_UNSUBSCRIBE',
      });
    } else {
      // Scoped per-subscription unsubscribe
      store.addSubscriptionSuppression({
        subscriptionId: verification.subscriptionId,
        email: verification.email,
        candidateId: verification.candidateId,
        reason: 'UNSUBSCRIBED',
        source: 'TOKEN_UNSUBSCRIBE',
      });
    }

    // Record outbox sync task for durable preference bridge
    let syncStatus = 'LOCAL_PERSISTED_ONLY';
    const syncTask = store.recordSyncTask({
      type: 'ALERT_UNSUBSCRIBE',
      payload: {
        token,
        subscriptionId: verification.subscriptionId,
        candidateId: verification.candidateId,
        email: verification.email,
        scope: isGlobalOptOut ? 'all' : 'subscription',
      },
    });

    // Attempt immediate synchronous bridge to authoritative service-user if configured
    const userServiceUrl = process.env.USER_SERVICE_URL;
    if (userServiceUrl) {
      try {
        const syncRes = await fetch(`${userServiceUrl}/users/alerts/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(3000),
        });
        if (syncRes.ok) {
          syncStatus = 'CONFIRMED';
          if (syncTask) {
            store.updateSyncTask(syncTask.id, { status: 'CONFIRMED' });
          }
        } else {
          syncStatus = 'PENDING_RETRY';
          if (syncTask) {
            store.updateSyncTask(syncTask.id, {
              status: 'PENDING',
              error: `HTTP ${syncRes.status}`,
              nextRetryAt: new Date(Date.now() + 5000).toISOString(),
            });
          }
        }
      } catch (err) {
        syncStatus = 'PENDING_RETRY';
        if (syncTask) {
          store.updateSyncTask(syncTask.id, {
            status: 'PENDING',
            error: err.message,
            nextRetryAt: new Date(Date.now() + 5000).toISOString(),
          });
        }
      }
    }

    // Check if client expects HTML or JSON
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
    if (acceptsHtml && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      const confirmationMsg = isGlobalOptOut
        ? 'You have been unsubscribed from all job alerts across your account.'
        : 'You have been unsubscribed from this job alert. You will no longer receive emails for this query.';

      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unsubscribed - Seekers</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h1 style="color: #10b981;">Successfully Unsubscribed</h1>
          <p style="color: #94a3b8;">${confirmationMsg}</p>
        </body>
        </html>
      `);
    }

    return res.status(200).json({
      success: true,
      message: isGlobalOptOut
        ? 'Successfully unsubscribed from all job alerts.'
        : 'Successfully unsubscribed from this job alert query.',
      subscription_id: verification.subscriptionId,
      email: verification.email,
      scope: isGlobalOptOut ? 'GLOBAL' : 'SUBSCRIPTION',
      sync_status: syncStatus,
    });
  });

  // ─── PROVIDER WEBHOOKS (Protected & Authenticated) ──────────────────────────

  router.post('/webhooks/provider', requireWebhookAuth, (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'INVALID_WEBHOOK_PAYLOAD' });
    }

    const eventId = body.id || body.eventId || body.messageId || body.mail?.messageId;
    const eventType = (body.type || body.eventType || body.notificationType || '').toLowerCase();
    const email = body.email || body.recipient || body.mail?.destination?.[0];

    if (!email) {
      return res.status(400).json({ error: 'MISSING_RECIPIENT_EMAIL' });
    }

    // Replay & Deduplication Protection
    const dedupeKey = eventId
      ? `webhook:${eventId}`
      : `webhook:${eventType}:${email.toLowerCase().trim()}:${body.timestamp || ''}`;

    if (store.hasEventReceipt(dedupeKey)) {
      return res.status(200).json({ success: true, action: 'DUPLICATE_WEBHOOK_IGNORED', dedupeKey });
    }

    store.recordEventReceipt(dedupeKey, 'provider.webhook');

    if (eventType.includes('bounce') || body.bounce) {
      store.addGlobalSuppression({
        email,
        reason: 'BOUNCED',
        source: 'WEBHOOK',
      });
      return res.status(200).json({ success: true, action: 'SUPPRESSED_BOUNCE', email });
    }

    if (eventType.includes('complaint') || body.complaint) {
      store.addGlobalSuppression({
        email,
        reason: 'COMPLAINT',
        source: 'WEBHOOK',
      });
      return res.status(200).json({ success: true, action: 'SUPPRESSED_COMPLAINT', email });
    }

    res.status(200).json({ success: true, action: 'IGNORED_EVENT_TYPE', eventType });
  });

  // ─── SUBSCRIPTIONS & EVALUATION (Protected) ─────────────────────────────────

  router.get('/subscriptions', requireAdminOrServiceAuth, (req, res) => {
    const activeOnly = req.query.active === 'true';
    const subs = store.listSubscriptions({ activeOnly });
    res.json({ total: subs.length, subscriptions: subs });
  });

  router.post('/subscriptions', requireAdminOrServiceAuth, (req, res) => {
    const sub = req.body;
    if (!sub || !sub.id || !sub.email) {
      return res.status(400).json({ error: 'Subscription id and email are required' });
    }
    const saved = store.saveSubscription(sub);
    res.status(201).json(saved);
  });

  router.get('/suppressions', requireAdminOrServiceAuth, (req, res) => {
    res.json({
      global_suppressions: store.listGlobalSuppressions(),
      subscription_suppressions: store.listSubscriptionSuppressions(),
    });
  });

  router.post('/evaluate', requireAdminOrServiceAuth, async (req, res) => {
    const job = req.body;
    if (!job || !job.id) {
      return res.status(400).json({ error: 'Job payload with id is required' });
    }

    const subscriptions = store.listSubscriptions({ activeOnly: true });
    const results = [];

    for (const sub of subscriptions) {
      const match = evaluateJobMatch(job, sub, {
        isSuppressed: (email, subId) => store.isSuppressed(email, subId),
      });

      if (match.matches) {
        const dispatchResult = await dispatcher.dispatchAlert({
          subscription: sub,
          jobs: [job],
        });
        results.push({
          subscriptionId: sub.id,
          candidateId: sub.candidate_id || sub.userId,
          email: sub.email,
          matched: true,
          dispatchResult,
        });
      } else {
        results.push({
          subscriptionId: sub.id,
          candidateId: sub.candidate_id || sub.userId,
          email: sub.email,
          matched: false,
          reason: match.reason,
        });
      }
    }

    res.json({
      jobId: job.id,
      evaluatedSubscriptions: subscriptions.length,
      results,
    });
  });

  return router;
}

module.exports = {
  createNotificationRouter,
};

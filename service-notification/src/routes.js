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

  // ─── AUTHENTICATION MIDDLEWARE ──────────────────────────────────────────────

  function requireAdminOrServiceAuth(req, res, next) {
    if (process.env.NOTIFICATION_ALLOW_ANON_DEMO === 'true') {
      return next();
    }
    const adminKey = req.headers['x-admin-key'];
    const serviceKey = req.headers['x-service-key'];
    const authHeader = req.headers['authorization'];
    const expectedKey =
      process.env.NOTIFICATION_ADMIN_KEY ||
      process.env.INTERNAL_SERVICE_KEY ||
      'seekers-internal-service-p11';

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
    const webhookSecret =
      process.env.PROVIDER_WEBHOOK_SECRET || 'seekers-provider-webhook-p11';
    const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;

    if (process.env.NOTIFICATION_ALLOW_ANON_DEMO === 'true' && !process.env.PROVIDER_WEBHOOK_SECRET) {
      return next();
    }

    if (providedSecret && providedSecret === webhookSecret) {
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
          <p>Are you sure you want to stop receiving job alerts for this subscription sent to <strong>${safeEmail}</strong>?</p>
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

    // Distinguish per-subscription unsubscribe from global email suppression
    const isGlobalOptOut = verification.scope === 'all' || req.body?.scope === 'all';

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

    // Synchronize to authoritative service-user if URL configured
    const userServiceUrl = process.env.USER_SERVICE_URL;
    if (userServiceUrl) {
      try {
        fetch(`${userServiceUrl}/users/alerts/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(2000),
        }).catch(() => {});
      } catch (e) {
        // Asynchronous bridge
      }
    }

    // Check if client expects HTML or JSON
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
    if (acceptsHtml && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unsubscribed - Seekers</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h1 style="color: #10b981;">Successfully Unsubscribed</h1>
          <p style="color: #94a3b8;">You have been unsubscribed from this job alert. You will no longer receive emails for this query.</p>
        </body>
        </html>
      `);
    }

    return res.status(200).json({
      success: true,
      message: 'Unsubscribed successfully.',
      subscription_id: verification.subscriptionId,
      email: verification.email,
      scope: isGlobalOptOut ? 'GLOBAL' : 'SUBSCRIPTION',
    });
  });

  // ─── PROVIDER WEBHOOKS (Protected & Authenticated) ──────────────────────────

  router.post('/webhooks/provider', requireWebhookAuth, (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'INVALID_WEBHOOK_PAYLOAD' });
    }

    const eventType = (body.type || body.eventType || body.notificationType || '').toLowerCase();
    const email = body.email || body.recipient || body.mail?.destination?.[0];

    if (!email) {
      return res.status(400).json({ error: 'MISSING_RECIPIENT_EMAIL' });
    }

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

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { DurableNotificationStore } = require('./src/storage');
const { DeliveryDispatcher } = require('./src/dispatcher');
const { evaluateJobMatch } = require('./src/matcher');
const { verifyUnsubscribeToken } = require('./src/crypto');

const DEFAULT_EVENTS_PATH = path.join(__dirname, 'fixtures', 'sample-events.json');
const DEFAULT_SUBS_PATH = path.join(__dirname, 'fixtures', 'sample-subscriptions.json');

// Initialize standalone store (can use custom path or default)
const store = new DurableNotificationStore();
const dispatcher = new DeliveryDispatcher({
  store,
  mode: 'CAPTURE',
  baseUrl: 'https://seekers.work',
  apiOrigin: 'http://localhost:4000',
});

function printUsage() {
  console.log(`
========================================================================
   SEEKERS NOTIFICATION SERVICE — STANDALONE CLI & SHOWCASE (P11)
========================================================================

Usage: node cli.js <command> [options]

Commands:
  replay [eventsFile] [--subs <file>]   Replay versioned job events against subscriptions
  captured [--limit <n>]                List emails captured in local demonstration mailbox
  captured-show <id>                    Inspect full plain text and HTML of a captured email
  captured-clear                        Clear all captured emails from demonstration mailbox
  unsubscribe <token>                   Execute one-click unsubscribe using signed token
  verify-token <token>                  Inspect signature and payload of an unsubscribe token
  suppress <email> [reason]             Manually add an email to the suppression list
  stats                                 Print store statistics, deliveries, and suppressions
  help                                  Show this help message

Examples:
  node cli.js replay
  node cli.js captured --limit 5
  node cli.js stats
========================================================================
  `);
}

async function commandReplay(eventsFile, subsFile) {
  const resolvedEventsPath = eventsFile ? path.resolve(eventsFile) : DEFAULT_EVENTS_PATH;
  const resolvedSubsPath = subsFile ? path.resolve(subsFile) : DEFAULT_SUBS_PATH;

  if (!fs.existsSync(resolvedEventsPath)) {
    console.error(`❌ Events file not found at: ${resolvedEventsPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(resolvedSubsPath)) {
    console.error(`❌ Subscriptions file not found at: ${resolvedSubsPath}`);
    process.exit(1);
  }

  const rawEvents = JSON.parse(fs.readFileSync(resolvedEventsPath, 'utf8'));
  const rawSubs = JSON.parse(fs.readFileSync(resolvedSubsPath, 'utf8'));

  const events = Array.isArray(rawEvents) ? rawEvents : [rawEvents];
  const subscriptions = Array.isArray(rawSubs) ? rawSubs : [rawSubs];

  // Load subscriptions into store
  for (const sub of subscriptions) {
    store.saveSubscription(sub);
  }

  console.log(`\n🚀 Loaded ${subscriptions.length} subscriptions into durable store.`);
  console.log(`📡 Replaying ${events.length} ingested job events in CAPTURE mode...\n`);

  let totalEvaluated = 0;
  let totalDispatched = 0;
  let totalSkipped = 0;

  for (const event of events) {
    const job = event.payload || event;
    const eventId = event.event_id || event.id;

    console.log(`────────────────────────────────────────────────────────────────────────`);
    console.log(`📄 Job Ingestion: [${job.id || 'N/A'}] "${job.title}" at ${job.company}`);
    console.log(`   Location: ${job.location || 'Remote'} | Remote: ${job.remote_eligibility || 'N/A'} | Status: ${job.status || 'ACTIVE'}`);

    // Check duplicate event receipt
    if (eventId && store.hasEventReceipt(eventId)) {
      console.log(`   ⚠️ Idempotency check: Event ${eventId} was already processed. Skipping re-evaluation.`);
      continue;
    }

    for (const sub of subscriptions) {
      totalEvaluated += 1;
      const match = evaluateJobMatch(job, sub, {
        isSuppressed: (email) => store.isSuppressed(email),
      });

      if (match.matches) {
        const dispatchResult = await dispatcher.dispatchAlert({
          subscription: sub,
          jobs: [job],
          causationId: eventId,
        });

        if (dispatchResult.status === 'ACCEPTED') {
          totalDispatched += 1;
          console.log(`   ✔ MATCH: Candidate ${sub.email} (${sub.candidate_id})`);
          console.log(`     → Dispatched to Mailbox (Captured ID: ${dispatchResult.capturedId})`);
        } else {
          totalSkipped += 1;
          console.log(`   ⏭️ SKIPPED (${dispatchResult.status}): Candidate ${sub.email}`);
        }
      } else {
        totalSkipped += 1;
        console.log(`   ✖ NO MATCH: ${sub.email} — Reason: ${match.reason}`);
      }
    }

    if (eventId) {
      store.recordEventReceipt(eventId, event.event_type || 'job.ingested.v1');
    }
  }

  console.log(`\n========================================================================`);
  console.log(`🏁 REPLAY COMPLETE`);
  console.log(`   Total Evaluations: ${totalEvaluated}`);
  console.log(`   Dispatched to Mailbox: ${totalDispatched}`);
  console.log(`   Skipped / No Match: ${totalSkipped}`);
  console.log(`   View captured emails with: node cli.js captured`);
  console.log(`========================================================================\n`);
}

function commandCaptured(limit = 20) {
  const items = store.listCapturedEmails({ limit });
  console.log(`\n📬 CAPTURED DEMO MAILBOX (${items.length} messages)`);
  console.log(`────────────────────────────────────────────────────────────────────────`);

  if (items.length === 0) {
    console.log(`(Mailbox is empty. Run 'node cli.js replay' to generate alerts.)\n`);
    return;
  }

  items.forEach((item, index) => {
    console.log(`[${index + 1}] ID: ${item.id}`);
    console.log(`    To:      ${item.to}`);
    console.log(`    Subject: ${item.subject}`);
    console.log(`    Time:    ${item.capturedAt}`);
    console.log(`────────────────────────────────────────────────────────────────────────`);
  });
  console.log(`Inspect full email with: node cli.js captured-show <id>\n`);
}

function commandCapturedShow(id) {
  if (!id) {
    console.error(`❌ Please specify a captured email ID.`);
    process.exit(1);
  }
  const item = store.getCapturedEmail(id);
  if (!item) {
    console.error(`❌ No captured email found with ID: ${id}`);
    process.exit(1);
  }

  console.log(`\n========================================================================`);
  console.log(`📧 EMAIL INSPECTION: ${item.id}`);
  console.log(`========================================================================`);
  console.log(`To:      ${item.to}`);
  console.log(`From:    ${item.from}`);
  console.log(`Subject: ${item.subject}`);
  console.log(`Date:    ${item.capturedAt}`);
  console.log(`Headers:`);
  console.log(`  List-Unsubscribe: ${item.headers['List-Unsubscribe']}`);
  console.log(`  List-Unsubscribe-Post: ${item.headers['List-Unsubscribe-Post']}`);
  console.log(`────────────────────────────────────────────────────────────────────────`);
  console.log(`PLAIN TEXT ALTERNATIVE:\n`);
  console.log(item.text);
  console.log(`────────────────────────────────────────────────────────────────────────`);
  console.log(`HTML BODY PREVIEW (First 500 chars):\n`);
  console.log(item.html.substring(0, 500) + '...\n');
}

function commandCapturedClear() {
  store.clearCapturedEmails();
  console.log(`\n✔ Captured demo mailbox cleared successfully.\n`);
}

function commandVerifyToken(token) {
  if (!token) {
    console.error(`❌ Please provide an unsubscribe token.`);
    process.exit(1);
  }
  console.log(`\n🔍 Verifying Unsubscribe Token:`);
  console.log(`   Token: ${token}`);
  const result = verifyUnsubscribeToken(token);
  console.log(`   Result:`, result);
  console.log(``);
}

function commandUnsubscribe(token) {
  if (!token) {
    console.error(`❌ Please provide an unsubscribe token.`);
    process.exit(1);
  }
  const verification = verifyUnsubscribeToken(token);
  if (!verification.valid) {
    console.error(`❌ Token verification failed: ${verification.error}`);
    process.exit(1);
  }

  store.deactivateSubscription(verification.subscriptionId);
  store.addSuppression({
    email: verification.email,
    candidateId: verification.candidateId,
    subscriptionId: verification.subscriptionId,
    reason: 'UNSUBSCRIBED',
    source: 'CLI_UNSUBSCRIBE',
  });

  console.log(`\n✔ Successfully unsubscribed recipient: ${verification.email}`);
  console.log(`  Deactivated Subscription: ${verification.subscriptionId}`);
  console.log(`  Added to Suppression List.\n`);
}

function commandSuppress(email, reason = 'MANUAL') {
  if (!email) {
    console.error(`❌ Please provide an email to suppress.`);
    process.exit(1);
  }
  store.addSuppression({ email, reason, source: 'CLI' });
  console.log(`\n✔ Added ${email} to suppression list (Reason: ${reason}).\n`);
}

function commandStats() {
  const stats = store.getStats();
  console.log(`\n📊 SEEKERS NOTIFICATION STORE STATISTICS`);
  console.log(`========================================================================`);
  console.log(`Active Subscriptions:    ${stats.activeSubscriptions} / ${stats.totalSubscriptions}`);
  console.log(`Suppressed Emails:       ${stats.totalSuppressions}`);
  console.log(`Captured Emails:         ${stats.totalCapturedEmails}`);
  console.log(`Event Receipts:          ${stats.totalEventReceipts}`);
  console.log(`Total Deliveries Logged: ${stats.totalDeliveries}`);
  console.log(`Deliveries by Status:   `, stats.deliveriesByStatus);
  console.log(`========================================================================\n`);
}

// ─── CLI Entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command.toLowerCase()) {
    case 'replay': {
      let eventsFile = null;
      let subsFile = null;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--subs' && args[i + 1]) {
          subsFile = args[i + 1];
          i += 1;
        } else if (!eventsFile) {
          eventsFile = args[i];
        }
      }
      await commandReplay(eventsFile, subsFile);
      break;
    }
    case 'captured': {
      let limit = 20;
      const limitIdx = args.indexOf('--limit');
      if (limitIdx !== -1 && args[limitIdx + 1]) {
        limit = parseInt(args[limitIdx + 1], 10);
      }
      commandCaptured(limit);
      break;
    }
    case 'captured-show': {
      commandCapturedShow(args[1]);
      break;
    }
    case 'captured-clear': {
      commandCapturedClear();
      break;
    }
    case 'verify-token': {
      commandVerifyToken(args[1]);
      break;
    }
    case 'unsubscribe': {
      commandUnsubscribe(args[1]);
      break;
    }
    case 'suppress': {
      commandSuppress(args[1], args[2]);
      break;
    }
    case 'stats': {
      commandStats();
      break;
    }
    case 'help':
    default: {
      printUsage();
      break;
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}

module.exports = {
  commandReplay,
  commandCaptured,
  commandCapturedShow,
  commandCapturedClear,
  commandUnsubscribe,
  commandVerifyToken,
  commandSuppress,
  commandStats,
};


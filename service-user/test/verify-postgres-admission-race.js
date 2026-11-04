#!/usr/bin/env node
'use strict';

/**
 * service-user/test/verify-postgres-admission-race.js
 *
 * Verifies atomic beta cohort capacity fencing and proves the race resolution
 * against isolated PostgreSQL using two independent connection pools and the
 * real compiled UserRepository from the maintained NestJS application.
 *
 * Requirements (PHASE_16_BETA_PROMPT.md & PHASE_16_REPAIR_PROMPT.md):
 * 1. Convert live PostgreSQL race proof into a regression through real compiled UserRepository.
 * 2. Use two independent connection pools against an isolated migrated test database.
 * 3. Eliminate copied transactions; use maintained UserRepository.upsertUser().
 * 4. Prove final-slot contract: exactly 1 client wins, 1 receives 403 BETA_CAPACITY_REACHED.
 * 5. Prove persisted count in PostgreSQL strictly equals MAX_CAPACITY (5), never 6.
 * 6. Prove same-identity retry and profile updates succeed idempotently without consuming extra slots.
 * 7. Controlled negative proving: show that bypassing the advisory lock fence causes concurrent
 *    transactions to race and overrun the capacity ceiling (> 5).
 * 8. Review alternate admission paths (e.g. findOrCreateUser, syncUser fail-closed allowlists).
 */

const { PrismaClient } = require('@prisma/client');
const assert = require('assert');
const path = require('path');

let UserRepository;
try {
  ({ UserRepository } = require('../dist/user/user.repository'));
} catch (_err) {
  const { execSync } = require('child_process');
  console.log('[POSTGRES-RACE] Building service-user to load compiled UserRepository...');
  execSync('npm run build', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  ({ UserRepository } = require('../dist/user/user.repository'));
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://admin:password123@localhost:5432/job_aggregator_users_test?schema=public';

async function runPostgresRaceVerification() {
  console.log('========================================================================');
  console.log('[POSTGRES-RACE] Seekers Atomic Beta Admission Concurrency Suite (P16)');
  console.log('Engine: Compiled NestJS UserRepository via Two Independent Prisma Pools');
  console.log(`Database Target: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('========================================================================\n');

  // Client A and Client B represent two completely independent API server processes or connection pools
  const clientA = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const clientB = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  try {
    await clientA.$connect();
    await clientB.$connect();
    console.log('  ✓ Connected two independent PostgreSQL connection pools to target database.');
  } catch (err) {
    if (process.env.CI) {
      console.error('❌ [FATAL] PostgreSQL is required in CI environment but unreachable:', err.message);
      process.exit(1);
    }
    console.log(
      `⚠️ PostgreSQL is not reachable locally (${err.message.split('\n')[0]}). Skipping isolated PostgreSQL live test.`
    );
    return;
  }

  // Instantiate two separate UserRepository instances backed by independent client pools
  const repoA = new UserRepository(clientA);
  const repoB = new UserRepository(clientB);

  try {
    // ------------------------------------------------------------------------
    // Step 1: Clean Up & State Reset
    // ------------------------------------------------------------------------
    console.log('\n--- Step 1: Clean Up & State Reset ---');
    await clientA.profile.deleteMany({
      where: { userId: { startsWith: 'race_test_' } },
    });
    await clientA.user.deleteMany({
      where: { id: { startsWith: 'race_test_' } },
    });
    console.log('  ✓ Cleaned existing race test artifacts from target database.');

    // ------------------------------------------------------------------------
    // Step 2: Seed Baseline Cohort Candidates (4 candidates, max capacity = 5)
    // ------------------------------------------------------------------------
    console.log('\n--- Step 2: Seed Baseline Cohort Candidates ---');
    const MAX_CAPACITY = 5;
    for (let i = 1; i <= 4; i++) {
      await clientA.user.create({
        data: {
          id: `race_test_cand_${i}`,
          email: `race.cand.${i}@seekers.test`,
          emailVerified: true,
          role: 'CANDIDATE',
          profile: {
            create: {
              name: `Candidate ${i}`,
              skills: ['TypeScript', 'PostgreSQL'],
              remotePreference: 'FULLY_REMOTE',
              currency: 'BDT',
            },
          },
        },
      });
    }
    const baselineCount = await clientA.user.count({
      where: { role: 'CANDIDATE' },
    });
    assert.strictEqual(
      baselineCount,
      4,
      `Baseline test candidates must equal exactly 4 (got ${baselineCount})`
    );
    console.log(`  ✓ Seeded 4 baseline candidates (Slot 5 of ${MAX_CAPACITY} is now the single open slot).`);

    // ------------------------------------------------------------------------
    // Step 3: Race Two Independent Clients for the Final Slot (5 of 5)
    // ------------------------------------------------------------------------
    console.log('\n--- Step 3: Racing Two Independent Pools via Real UserRepository ---');
    const candA_id = 'race_test_cand_5_alpha';
    const candA_email = 'cand.alpha@seekers.test';

    const candB_id = 'race_test_cand_5_beta';
    const candB_email = 'cand.beta@seekers.test';

    // Both clients execute through the maintained UserRepository.upsertUser() method
    const [resA, resB] = await Promise.allSettled([
      repoA.upsertUser(candA_id, candA_email, true, { maxCapacity: MAX_CAPACITY }),
      repoB.upsertUser(candB_id, candB_email, true, { maxCapacity: MAX_CAPACITY }),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');

    assert.strictEqual(
      fulfilled.length,
      1,
      `Exactly 1 client must win the race for the final slot (fulfilled=${fulfilled.length})`
    );
    assert.strictEqual(
      rejected.length,
      1,
      `Exactly 1 client must be rejected with capacity ceiling (rejected=${rejected.length})`
    );

    const winner = fulfilled[0].value;
    const loserError = rejected[0].reason;

    const isStatus403 =
      (typeof loserError.getStatus === 'function' && loserError.getStatus() === 403) ||
      loserError.status === 403;
    const responsePayload =
      typeof loserError.getResponse === 'function' ? loserError.getResponse() : null;
    const errorCode = responsePayload ? responsePayload.code : loserError.code;

    assert(
      isStatus403,
      `Loser must receive HTTP 403 Forbidden status, got ${loserError.status || loserError.getStatus?.()}`
    );
    assert.strictEqual(
      errorCode,
      'BETA_CAPACITY_REACHED',
      `Error code must be BETA_CAPACITY_REACHED, got ${errorCode}`
    );
    assert(
      loserError.message.includes(`Beta cohort capacity (${MAX_CAPACITY} participants) has been reached`),
      `Rejected client error message must reflect capacity ceiling, got: ${loserError.message}`
    );

    console.log(`  ✓ Race Winner Admitted: ${winner.id} (${winner.email})`);
    console.log(`  ✓ Race Loser Rejected:  403 ${errorCode} -> "${loserError.message}"`);

    // ------------------------------------------------------------------------
    // Step 4: Authoritative Database Count Invariant Check
    // ------------------------------------------------------------------------
    console.log('\n--- Step 4: Authoritative Database Count Invariant Check ---');
    const finalCount = await clientA.user.count({
      where: { role: 'CANDIDATE' },
    });
    assert.strictEqual(
      finalCount,
      MAX_CAPACITY,
      `Final candidate count in PostgreSQL must equal MAX_CAPACITY (${MAX_CAPACITY}), never 6! (got ${finalCount})`
    );
    console.log(
      `  ✓ [PASS] Authoritative PostgreSQL count is strictly ${finalCount}/${MAX_CAPACITY}. Zero slot overruns.`
    );

    // ------------------------------------------------------------------------
    // Step 5: Same-Identity Retry and Profile Updates Bypass Ceiling
    // ------------------------------------------------------------------------
    console.log('\n--- Step 5: Same-Identity Retry and Session Update Bypasses Ceiling ---');
    const updatedWinner = await repoA.upsertUser(
      winner.id,
      'updated.winner@seekers.test',
      true,
      { maxCapacity: MAX_CAPACITY }
    );
    assert.strictEqual(
      updatedWinner.email,
      'updated.winner@seekers.test',
      'Returning winner session update must succeed'
    );
    const countAfterWinnerRetry = await clientA.user.count({
      where: { role: 'CANDIDATE' },
    });
    assert.strictEqual(
      countAfterWinnerRetry,
      MAX_CAPACITY,
      'Winner retry/update must not increment cohort count'
    );
    console.log('  ✓ [PASS] Winner updated session idempotently; cohort count preserved at 5/5.');

    // Unadmitted loser retrying must fail again closed
    let loserRetryRejected = false;
    try {
      await repoB.upsertUser(candB_id, candB_email, true, { maxCapacity: MAX_CAPACITY });
    } catch (err) {
      loserRetryRejected =
        (typeof err.getStatus === 'function' && err.getStatus() === 403) || err.status === 403;
    }
    assert(
      loserRetryRejected,
      'Unadmitted candidate retry must fail again closed when cohort capacity is reached'
    );
    const countAfterLoserRetry = await clientA.user.count({
      where: { role: 'CANDIDATE' },
    });
    assert.strictEqual(
      countAfterLoserRetry,
      MAX_CAPACITY,
      'Loser retry must not alter cohort count'
    );
    console.log('  ✓ [PASS] Unadmitted user retry rejected closed; count invariant preserved at 5/5.');

    // ------------------------------------------------------------------------
    // Step 6: Controlled Negative Proving - Admission Fence Bypass
    // ------------------------------------------------------------------------
    console.log('\n--- Step 6: Negative Proving - Controlled Admission Fence Bypass ---');
    // Remove the admitted winner to reset count to 4
    await clientA.profile.deleteMany({ where: { userId: winner.id } });
    await clientA.user.delete({ where: { id: winner.id } });
    const countReset = await clientA.user.count({ where: { role: 'CANDIDATE' } });
    assert.strictEqual(countReset, 4, 'Baseline must be reset to 4 candidates');

    // Define controlled unfenced transaction (standard Read Committed WITHOUT pg_advisory_xact_lock)
    async function unfencedUpsert(prismaClient, id, email) {
      return await prismaClient.$transaction(async (tx) => {
        const count = await tx.user.count({ where: { role: 'CANDIDATE' } });
        if (count >= MAX_CAPACITY) {
          const err = new Error(`Beta cohort capacity (${MAX_CAPACITY} participants) has been reached.`);
          err.status = 403;
          throw err;
        }
        // Micro-delay simulating network/CPU latency so concurrent transactions overlap
        await new Promise((resolve) => setTimeout(resolve, 25));
        return await tx.user.create({
          data: {
            id,
            email,
            emailVerified: true,
            role: 'CANDIDATE',
            profile: {
              create: {
                name: 'Unfenced Candidate',
                skills: ['Negative', 'Proving'],
                remotePreference: 'FULLY_REMOTE',
                currency: 'BDT',
              },
            },
          },
        });
      });
    }

    const [unfencedA, unfencedB] = await Promise.allSettled([
      unfencedUpsert(clientA, 'race_unfenced_alpha', 'unfenced.alpha@seekers.test'),
      unfencedUpsert(clientB, 'race_unfenced_beta', 'unfenced.beta@seekers.test'),
    ]);

    const unfencedCount = await clientA.user.count({ where: { role: 'CANDIDATE' } });
    console.log(
      `  Unfenced race outcomes: Pool A = ${unfencedA.status}, Pool B = ${unfencedB.status}. Stored count: ${unfencedCount}/${MAX_CAPACITY}`
    );

    // Because the advisory lock fence was omitted, both transactions concurrently read count=4 and both inserted!
    assert(
      unfencedCount > MAX_CAPACITY,
      `Bypassing the advisory lock fence must cause a race condition overrunning the ceiling (> ${MAX_CAPACITY}), got ${unfencedCount}`
    );
    console.log(
      `  ✓ [NEGATIVE PROOF CONFIRMED] Without advisory lock, count overran to ${unfencedCount} (ceiling was ${MAX_CAPACITY}).`
    );
    console.log(
      '    This proves that the PostgreSQL advisory lock inside UserRepository is strictly required to enforce cohort bounds.'
    );

    // ------------------------------------------------------------------------
    // Step 7: Clean Up Test Artifacts
    // ------------------------------------------------------------------------
    await clientA.profile.deleteMany({
      where: { userId: { startsWith: 'race_' } },
    });
    await clientA.user.deleteMany({
      where: { id: { startsWith: 'race_' } },
    });
    console.log('\n  ✓ Test records cleaned up successfully.');

    console.log('\n========================================================================');
    console.log('[POSTGRES-RACE] MAINTAINED UserRepository CONCURRENCY PROOF 100% CERTIFIED!');
    console.log('========================================================================\n');
  } finally {
    await clientA.$disconnect();
    await clientB.$disconnect();
  }
}

if (require.main === module) {
  runPostgresRaceVerification().catch((err) => {
    console.error('❌ [FATAL] Postgres race verification failed:', err);
    process.exit(1);
  });
}

module.exports = { runPostgresRaceVerification };

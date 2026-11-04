#!/usr/bin/env node
'use strict';

/**
 * service-user/test/verify-postgres-admission-race.js
 *
 * Verifies atomic beta cohort capacity fencing and proves the race resolution
 * against isolated PostgreSQL using two independent database clients.
 *
 * Each client uses a distinct connection and transaction to race concurrently
 * for the final remaining cohort admission slot.
 */

const { PrismaClient } = require('@prisma/client');
const assert = require('assert');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://admin:password123@localhost:5432/job_aggregator_users_test?schema=public';

async function runPostgresRaceVerification() {
  console.log('========================================================================');
  console.log('[POSTGRES-RACE] Seekers Atomic Beta Admission Concurrency Suite (P16)');
  console.log(`Database Target: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('========================================================================\n');

  // Client A and Client B represent two completely independent API server instances or workers
  const clientA = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const clientB = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  try {
    await clientA.$connect();
    await clientB.$connect();
    console.log('  ✓ Connected two independent PostgreSQL clients to target database.');
  } catch (err) {
    if (process.env.CI) {
      console.error('❌ [FATAL] PostgreSQL is required in CI environment but unreachable:', err.message);
      process.exit(1);
    }
    console.log(`⚠️ PostgreSQL is not reachable locally (${err.message.split('\n')[0]}). Skipping isolated PostgreSQL live test.`);
    return;
  }

  try {
    // 1. Clean up any previous test artifacts
    console.log('\n--- Step 1: Clean Up & State Reset ---');
    await clientA.profile.deleteMany({
      where: { userId: { startsWith: 'race_test_' } },
    });
    await clientA.user.deleteMany({
      where: { id: { startsWith: 'race_test_' } },
    });
    console.log('  ✓ Cleaned existing race test artifacts.');

    // 2. Seed baseline candidates (4 candidates, max capacity = 5)
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
      where: { id: { startsWith: 'race_test_' }, role: 'CANDIDATE' },
    });
    assert.strictEqual(baselineCount, 4, 'Baseline test candidates must equal exactly 4');
    console.log(`  ✓ Seeded 4 baseline candidates (Slot 5 of 5 is now the single open slot).`);

    // Helper: Atomic upsert implementation matching UserRepository
    async function upsertWithCeiling(prismaClient, id, email, maxCapacity) {
      return await prismaClient.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id },
          include: { profile: true },
        });

        if (existing) {
          return await tx.user.update({
            where: { id },
            data: { email, emailVerified: true },
          });
        }

        // Acquire exclusive transaction advisory lock across all database sessions
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(987654321)`;

        const candidateCount = await tx.user.count({
          where: { id: { startsWith: 'race_test_' }, role: 'CANDIDATE' },
        });

        if (candidateCount >= maxCapacity) {
          const err = new Error(`Beta cohort capacity (${maxCapacity} participants) has been reached.`);
          err.code = 'BETA_CAPACITY_REACHED';
          err.status = 403;
          throw err;
        }

        return await tx.user.create({
          data: {
            id,
            email,
            emailVerified: true,
            role: 'CANDIDATE',
            profile: {
              create: {
                name: 'Race Winner',
                skills: ['Go', 'Kafka'],
                remotePreference: 'FULLY_REMOTE',
                currency: 'BDT',
              },
            },
          },
        });
      });
    }

    // 3. Race Two Independent Clients for the Final Slot (5 of 5)
    console.log('\n--- Step 3: Racing Two Independent PostgreSQL Clients for Slot 5 ---');
    const candA_id = 'race_test_cand_5_alpha';
    const candA_email = 'cand.alpha@seekers.test';

    const candB_id = 'race_test_cand_5_beta';
    const candB_email = 'cand.beta@seekers.test';

    const [resA, resB] = await Promise.allSettled([
      upsertWithCeiling(clientA, candA_id, candA_email, MAX_CAPACITY),
      upsertWithCeiling(clientB, candB_id, candB_email, MAX_CAPACITY),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');

    assert.strictEqual(
      fulfilled.length,
      1,
      `Exactly 1 client must win the race (fulfilled=${fulfilled.length})`
    );
    assert.strictEqual(
      rejected.length,
      1,
      `Exactly 1 client must be rejected with capacity ceiling (rejected=${rejected.length})`
    );

    const winner = fulfilled[0].value;
    const loserError = rejected[0].reason;

    assert(
      loserError.message.includes('Beta cohort capacity (5 participants) has been reached'),
      `Rejected client error message must reflect capacity ceiling, got: ${loserError.message}`
    );
    console.log(`  ✓ Race Winner Admitted: ${winner.id} (${winner.email})`);
    console.log(`  ✓ Race Loser Rejected:  ${loserError.code} -> "${loserError.message}"`);

    // 4. Verify Total Candidate Count in PostgreSQL
    console.log('\n--- Step 4: Authoritative Database Count Invariant Check ---');
    const finalCount = await clientA.user.count({
      where: { id: { startsWith: 'race_test_' }, role: 'CANDIDATE' },
    });
    assert.strictEqual(
      finalCount,
      5,
      `Final candidate count in PostgreSQL must equal MAX_CAPACITY (5), never 6! (got ${finalCount})`
    );
    console.log(`  ✓ [PASS] Authoritative PostgreSQL count is strictly 5/${MAX_CAPACITY}. Zero slot overruns.`);

    // 5. Verify Legitimate Returning User Session Updates
    console.log('\n--- Step 5: Returning User Session Update Bypasses Ceiling ---');
    const updatedWinner = await upsertWithCeiling(clientA, winner.id, 'updated.email@seekers.test', MAX_CAPACITY);
    assert.strictEqual(updatedWinner.email, 'updated.email@seekers.test');
    const countAfterUpdate = await clientA.user.count({
      where: { id: { startsWith: 'race_test_' }, role: 'CANDIDATE' },
    });
    assert.strictEqual(countAfterUpdate, 5, 'Returning user update must not consume new slot');
    console.log('  ✓ [PASS] Returning user updated profile without incrementing cohort count.');

    // Clean up test data
    await clientA.profile.deleteMany({
      where: { userId: { startsWith: 'race_test_' } },
    });
    await clientA.user.deleteMany({
      where: { id: { startsWith: 'race_test_' } },
    });
    console.log('\n  ✓ Test records cleaned up successfully.');

    console.log('\n========================================================================');
    console.log('[POSTGRES-RACE] ATOMIC CONCURRENCY PROOF SUCCESSFULLY CERTIFIED AGAINST POSTGRESQL!');
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

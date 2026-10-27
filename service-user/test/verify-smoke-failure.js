/**
 * Regression Verification Suite for standalone-smoke.js Error Handling
 *
 * Proves that standalone-smoke.js cannot produce false-positive passes:
 * - Unreachable NestJS API causes immediate non-zero exit code (1)
 * - Unreachable Firebase Auth Emulator causes immediate non-zero exit code (1)
 * - Unconditional "all checks passed" message is NEVER printed on failure
 */

const { spawn } = require('child_process');
const path = require('path');

const smokeScript = path.join(__dirname, 'standalone-smoke.js');

function runSmokeProcess(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [smokeScript], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      resolve({ code, stdout, stderr, combined: stdout + stderr });
    });
  });
}

async function verify() {
  console.log('====================================================');
  console.log('  Verifying standalone-smoke.js Negative Error Paths');
  console.log('====================================================\n');

  let failed = false;

  // Test 1: Unreachable service-user API
  console.log('Testing Case 1: Unreachable service-user API (http://localhost:59998)...');
  const res1 = await runSmokeProcess({
    API_BASE: 'http://localhost:59998',
    FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  });

  if (res1.code !== 0) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Exited with non-zero code ${res1.code} as expected`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected non-zero exit code but got 0`);
    failed = true;
  }

  if (res1.combined.includes('Cannot reach service-user')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Error output accurately reported unreachable service-user`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected error message not found in output`);
    failed = true;
  }

  if (!res1.combined.includes('All') && !res1.combined.includes('passed cleanly')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m False-positive pass message was NOT printed`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m False-positive pass message was inappropriately printed!`);
    failed = true;
  }

  // Test 2: Unreachable Firebase Auth Emulator (with mocked or real API)
  console.log('\nTesting Case 2: Unreachable Firebase Auth Emulator (localhost:59999)...');
  const http = require('http');
  // Start a tiny temporary HTTP mock for /users/health and /users/profile to reach the emulator check
  const dummyServer = http.createServer((req, res) => {
    if (req.url === '/users/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', service: 'service-user' }));
    } else if (req.url === '/users/profile') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => dummyServer.listen(0, '127.0.0.1', resolve));
  const dummyPort = dummyServer.address().port;

  const res2 = await runSmokeProcess({
    API_BASE: `http://127.0.0.1:${dummyPort}`,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:59999',
  });

  dummyServer.close();

  if (res2.code !== 0) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Exited with non-zero code ${res2.code} when emulator unreachable`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected non-zero exit code when emulator unreachable, got 0`);
    failed = true;
  }

  if (res2.combined.includes('Firebase Auth Emulator required but unreachable')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Error output accurately reported missing/unreachable emulator`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected emulator error message not found in output`);
    failed = true;
  }

  if (res2.combined.includes('Unit and schema verification passed')) {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m False claim "Unit and schema verification passed" was printed!`);
    failed = true;
  } else {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m False claim "Unit and schema verification passed" was NOT printed`);
  }

  console.log('\n----------------------------------------------------');
  if (failed) {
    console.error('\x1b[31m✖ Smoke test error-handling verification failed.\x1b[0m');
    process.exit(1);
  }

  console.log('\x1b[32m✔ All negative smoke error-handling tests verified successfully!\x1b[0m');
}

verify().catch((err) => {
  console.error('Fatal error verifying smoke tests:', err);
  process.exit(1);
});

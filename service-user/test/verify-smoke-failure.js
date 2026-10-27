/**
 * Regression Verification Suite for standalone-smoke.js Error Handling
 *
 * Proves that standalone-smoke.js cannot produce false-positive passes:
 * - Unreachable NestJS API causes immediate non-zero exit code (1)
 * - Unreachable Firebase Auth Emulator causes immediate non-zero exit code (1)
 * - Stalled API server (hung connection) triggers request timeout and exits with code 1
 * - Stalled Emulator triggers request timeout and exits with code 1
 * - Failed assertions cause explicit non-zero exit code (1)
 * - Interrupted / destroyed socket responses reject and exit with code 1
 * - Unconditional "all checks passed" message is NEVER printed on failure
 * - Harness watchdog distinguishes true child exit from harness kill
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const smokeScript = path.join(__dirname, 'standalone-smoke.js');

function runSmokeProcess(env, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let killedByHarness = false;
    const child = spawn(process.execPath, [smokeScript], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      killedByHarness = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        killedByHarness,
        stdout,
        stderr,
        combined: stdout + stderr,
      });
    });
  });
}

async function verify() {
  console.log('====================================================');
  console.log('  Verifying standalone-smoke.js Negative Error Paths');
  console.log('====================================================\n');

  let failed = false;

  // -----------------------------------------------------------------
  // Test 1: Unreachable service-user API
  // -----------------------------------------------------------------
  console.log('Testing Case 1: Unreachable service-user API (http://localhost:59998)...');
  const res1 = await runSmokeProcess({
    API_BASE: 'http://localhost:59998',
    FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
  });

  if (res1.code !== 0 && !res1.killedByHarness) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Exited with non-zero code ${res1.code} as expected`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected clean non-zero exit code, got code=${res1.code}, killedByHarness=${res1.killedByHarness}`);
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

  // -----------------------------------------------------------------
  // Test 2: Unreachable Firebase Auth Emulator
  // -----------------------------------------------------------------
  console.log('\nTesting Case 2: Unreachable Firebase Auth Emulator (localhost:59999)...');
  const dummyApi = http.createServer((req, res) => {
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

  await new Promise((resolve) => dummyApi.listen(0, '127.0.0.1', resolve));
  const dummyApiPort = dummyApi.address().port;

  const res2 = await runSmokeProcess({
    API_BASE: `http://127.0.0.1:${dummyApiPort}`,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:59999',
  });

  dummyApi.close();

  if (res2.code !== 0 && !res2.killedByHarness) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Exited with non-zero code ${res2.code} when emulator unreachable`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected clean non-zero exit code, got code=${res2.code}, killedByHarness=${res2.killedByHarness}`);
    failed = true;
  }

  if (res2.combined.includes('Firebase Auth Emulator required but unreachable')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Error output accurately reported missing/unreachable emulator`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected emulator error message not found in output`);
    failed = true;
  }

  if (!res2.combined.includes('Unit and schema verification passed')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m False claim "Unit and schema verification passed" was NOT printed`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m False claim "Unit and schema verification passed" was printed!`);
    failed = true;
  }

  // -----------------------------------------------------------------
  // Test 3: Stalled API Server (Hung Connection -> Timeout -> Code 1)
  // -----------------------------------------------------------------
  console.log('\nTesting Case 3: Stalled API Server (simulates hung connection timeout)...');
  const hungServer = http.createServer((_req, _res) => {
    // Deliberately hold connection open without sending response
  });
  await new Promise((resolve) => hungServer.listen(0, '127.0.0.1', resolve));
  const hungPort = hungServer.address().port;

  const res3 = await runSmokeProcess(
    {
      API_BASE: `http://127.0.0.1:${hungPort}`,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      REQUEST_TIMEOUT_MS: '1500',
    },
    5000,
  );

  hungServer.close();

  if (res3.code !== 0 && !res3.killedByHarness) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Stalled API caused natural non-zero exit code ${res3.code} (not killed by harness)`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected process to timeout and exit 1 on its own, got code=${res3.code}, killedByHarness=${res3.killedByHarness}`);
    failed = true;
  }

  if (res3.combined.includes('timed out')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Stalled request correctly logged timeout error`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected timeout error message in output`);
    failed = true;
  }

  // -----------------------------------------------------------------
  // Test 4: Stalled Firebase Auth Emulator
  // -----------------------------------------------------------------
  console.log('\nTesting Case 4: Stalled Firebase Auth Emulator (hung emulator connection)...');
  const healthyApi = http.createServer((req, res) => {
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
  await new Promise((resolve) => healthyApi.listen(0, '127.0.0.1', resolve));
  const healthyApiPort = healthyApi.address().port;

  const hungEmulator = http.createServer((_req, _res) => {
    // Deliberately hold emulator connection open
  });
  await new Promise((resolve) => hungEmulator.listen(0, '127.0.0.1', resolve));
  const hungEmulatorPort = hungEmulator.address().port;

  const res4 = await runSmokeProcess(
    {
      API_BASE: `http://127.0.0.1:${healthyApiPort}`,
      FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${hungEmulatorPort}`,
      REQUEST_TIMEOUT_MS: '1500',
    },
    5000,
  );

  healthyApi.close();
  hungEmulator.close();

  if (res4.code !== 0 && !res4.killedByHarness) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Stalled emulator caused natural non-zero exit code ${res4.code}`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected natural exit on emulator timeout, got code=${res4.code}, killedByHarness=${res4.killedByHarness}`);
    failed = true;
  }

  // -----------------------------------------------------------------
  // Test 5: Failed Assertion (HTTP 500 on Health Endpoint)
  // -----------------------------------------------------------------
  console.log('\nTesting Case 5: Failed assertion handling (API returns HTTP 500)...');
  const errorApi = http.createServer((req, res) => {
    if (req.url === '/users/health') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Internal Server Error' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => errorApi.listen(0, '127.0.0.1', resolve));
  const errorApiPort = errorApi.address().port;

  const res5 = await runSmokeProcess({
    API_BASE: `http://127.0.0.1:${errorApiPort}`,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    REQUEST_TIMEOUT_MS: '2000',
  });

  errorApi.close();

  if (res5.code !== 0 && !res5.killedByHarness) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Assertion failure resulted in non-zero exit code ${res5.code}`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected assertion failure to exit non-zero, got code=${res5.code}`);
    failed = true;
  }

  if (res5.combined.includes('[FAIL]')) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Assertion failure logged [FAIL] marker as required`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected [FAIL] marker in assertion failure output`);
    failed = true;
  }

  // -----------------------------------------------------------------
  // Test 6: Interrupted / Destroyed socket response midway
  // -----------------------------------------------------------------
  console.log('\nTesting Case 6: Interrupted / aborted HTTP response...');
  const abortApi = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"status":');
    res.destroy(); // Abruptly destroy socket
  });
  await new Promise((resolve) => abortApi.listen(0, '127.0.0.1', resolve));
  const abortPort = abortApi.address().port;

  const res6 = await runSmokeProcess({
    API_BASE: `http://127.0.0.1:${abortPort}`,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    REQUEST_TIMEOUT_MS: '2000',
  });

  abortApi.close();

  if (res6.code !== 0 && !res6.killedByHarness) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m Abrupt socket termination caused natural non-zero exit code ${res6.code}`);
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m Expected socket error to exit non-zero, got code=${res6.code}, killedByHarness=${res6.killedByHarness}`);
    failed = true;
  }

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log('\n----------------------------------------------------');
  if (failed) {
    console.error('\x1b[31m✖ Smoke test error-handling verification failed.\x1b[0m');
    process.exit(1);
  }

  console.log('\x1b[32m✔ All 6 negative smoke error-handling tests verified successfully!\x1b[0m');
}

verify().catch((err) => {
  console.error('Fatal error verifying smoke tests:', err);
  process.exit(1);
});

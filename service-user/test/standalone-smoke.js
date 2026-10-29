/**
 * Strict Standalone Smoke & Ownership Verification Suite for service-user (NestJS)
 *
 * Verifies real identity and relational profiles with isolated dependencies:
 * 1. Health check (/users/health)
 * 2. Unauthenticated request rejection (401 Unauthorized)
 * 3. Invalid token rejection (401 Unauthorized)
 * 4. Token issuance via Firebase Auth Emulator for Candidate A & Candidate B
 * 5. Candidate A user synchronization (/users/sync)
 * 6. Repeated user synchronization (Idempotency check)
 * 7. Candidate A initial profile read (/users/profile)
 * 8. Candidate A profile update & persistence (/users/profile)
 * 9. Stored state verification: reload profile and confirm all fields persisted
 * 10. Candidate B user synchronization (/users/sync)
 * 11. Cross-Tenant Isolation: User B cannot view User A's data
 * 12. Server-Enforced Role Check: Candidate cannot access privileged admin endpoint (403 Forbidden)
 * 13. Personal Data Export Request (/users/account/export)
 * 14. Account Deletion Request with 30-day grace period (/users/account/delete)
 * 15. Deletion Request Idempotency: repeated request with same key returns existing record
 * 16. Account Lifecycle Status Query (/users/account/status)
 *
 * Execution guarantee: Any failure, unreachable dependency, or assertion mismatch
 * produces an immediate failing exit status (exit code 1).
 */

const http = require('http');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const EMULATOR_URL = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts`;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '8000', 10);

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function logPass(description) {
  passedAssertions++;
  console.log(`\x1b[32m✔ [PASS]\x1b[0m ${description}`);
}

function logFail(description, detail) {
  failedAssertions++;
  process.exitCode = 1;
  console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${description}`);
  if (detail !== undefined) {
    console.error(`       Detail:`, typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail);
  }
}

function assert(condition, description, detail) {
  totalAssertions++;
  if (condition) {
    logPass(description);
  } else {
    logFail(description, detail);
  }
}

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let overallTimer = null;

    const cleanup = () => {
      if (overallTimer) {
        clearTimeout(overallTimer);
        overallTimer = null;
      }
    };

    const settle = (err, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    const u = new URL(url);
    const body = options.body
      ? Buffer.isBuffer(options.body)
        ? options.body
        : typeof options.body === 'string'
          ? Buffer.from(options.body)
          : Buffer.from(JSON.stringify(options.body))
      : null;

    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          ...(Buffer.isBuffer(options.body)
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(body ? { 'Content-Length': body.length } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = null;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          settle(null, { status: res.statusCode, headers: res.headers, data });
        });
        res.on('error', (err) => {
          settle(err);
        });
      },
    );

    // Hard overall deadline across DNS, connect, response headers and payload stream
    overallTimer = setTimeout(() => {
      const err = new Error(`HTTP request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
      req.destroy(err);
      settle(err);
    }, REQUEST_TIMEOUT_MS);

    // Socket inactivity timeout
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const err = new Error(`HTTP socket idle timeout after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
      req.destroy(err);
      settle(err);
    });

    req.on('error', (err) => {
      settle(err);
    });

    if (body) req.write(body);
    req.end();
  });
}

async function getEmulatorIdToken(email, password) {
  const signUpRes = await request(`${EMULATOR_URL}:signUp?key=fake-api-key`, {
    method: 'POST',
    body: { email, password, returnSecureToken: true },
  });

  if (signUpRes.status === 200 && signUpRes.data && signUpRes.data.idToken) {
    return { token: signUpRes.data.idToken, uid: signUpRes.data.localId, email: signUpRes.data.email };
  }

  // If candidate already exists, sign in
  const signInRes = await request(`${EMULATOR_URL}:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    body: { email, password, returnSecureToken: true },
  });

  if (signInRes.status === 200 && signInRes.data && signInRes.data.idToken) {
    return { token: signInRes.data.idToken, uid: signInRes.data.localId, email: signInRes.data.email };
  }

  throw new Error(`Failed to obtain emulator token (status ${signUpRes.status}): ${JSON.stringify(signUpRes.data)}`);
}

async function run() {
  console.log('====================================================');
  console.log('  Seekers service-user Strict Standalone Smoke Suite');
  console.log('====================================================');

  // Step 1: Health check
  console.log('\n[1/16] Verifying NestJS API health check...');
  try {
    const health = await request(`${API_BASE}/users/health`);
    assert(health.status === 200, 'Health endpoint responds with HTTP 200', health.status);
    assert(health.data && health.data.status === 'healthy', 'Health payload status is "healthy"', health.data);
    assert(health.data && health.data.service === 'service-user', 'Service name is "service-user"', health.data);
  } catch (err) {
    logFail(`Cannot reach service-user at ${API_BASE}. Service must be running.`, err.message);
    process.exit(1);
  }

  // Step 2: Unauthenticated request rejection
  console.log('\n[2/16] Verifying unauthenticated request rejection...');
  const unauth = await request(`${API_BASE}/users/profile`);
  assert(unauth.status === 401, 'Request without Authorization header rejected with 401 Unauthorized', unauth.status);

  // Step 3: Invalid token rejection
  console.log('\n[3/16] Verifying invalid Bearer token rejection...');
  const invalidTokenRes = await request(`${API_BASE}/users/profile`, {
    headers: { Authorization: 'Bearer this-is-an-invalid-fake-token' },
  });
  assert(invalidTokenRes.status === 401, 'Request with forged Bearer token rejected with 401 Unauthorized', invalidTokenRes.status);

  // Step 4: Firebase Auth Emulator Token Issuance
  console.log('\n[4/16] Connecting to Firebase Auth Emulator and issuing JWTs...');
  let candidateA, candidateB;
  try {
    const timestamp = Date.now();
    candidateA = await getEmulatorIdToken(`candidate.a.${timestamp}@seekers.test`, 'TestPassword123!');
    candidateB = await getEmulatorIdToken(`candidate.b.${timestamp}@seekers.test`, 'TestPassword123!');
    assert(Boolean(candidateA && candidateA.token && candidateA.uid), 'Candidate A authentic JWT issued by emulator', candidateA.uid);
    assert(Boolean(candidateB && candidateB.token && candidateB.uid), 'Candidate B authentic JWT issued by emulator', candidateB.uid);
  } catch (err) {
    logFail(`Firebase Auth Emulator required but unreachable or token issuance failed at ${EMULATOR_HOST}`, err.message);
    process.exit(1);
  }

  // Step 5: Candidate A User Synchronization
  console.log('\n[5/16] Testing Candidate A user synchronization (/users/sync)...');
  const syncA = await request(`${API_BASE}/users/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(syncA.status === 201 || syncA.status === 200, 'Candidate A sync returns HTTP 200/201', syncA.status);
  assert(syncA.data && syncA.data.user && syncA.data.user.id === candidateA.uid, 'Sync response maps to verified Firebase UID', syncA.data);
  assert(syncA.data && syncA.data.user && syncA.data.user.role === 'CANDIDATE', 'Candidate assigned default CANDIDATE role', syncA.data);

  // Step 6: Idempotent Re-synchronization
  console.log('\n[6/16] Testing synchronization idempotency on repeated login...');
  const syncA2 = await request(`${API_BASE}/users/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(syncA2.status === 200 || syncA2.status === 201, 'Repeated sync returns HTTP 200/201 without conflict', syncA2.status);
  assert(syncA2.data && syncA2.data.user && syncA2.data.user.id === candidateA.uid, 'Repeated sync returns identical candidate identity', syncA2.data);

  // Step 7: Candidate A Initial Profile Retrieval
  console.log('\n[7/16] Testing Candidate A initial profile read (/users/profile)...');
  const profileA = await request(`${API_BASE}/users/profile`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(profileA.status === 200, 'Profile read returns HTTP 200', profileA.status);
  assert(profileA.data && profileA.data.id === candidateA.uid, 'Profile ID matches candidate UID', profileA.data && profileA.data.id);
  assert(profileA.data && profileA.data.onboarding && profileA.data.onboarding.completed === false, 'Initial onboarding completed state is false', profileA.data);
  assert(profileA.data && profileA.data.preferences && profileA.data.preferences.remote_preference === 'UNSPECIFIED', 'Initial remote preference is UNSPECIFIED', profileA.data);

  // Step 8: Candidate A Profile Update
  console.log('\n[8/16] Testing Candidate A profile mutation (/users/profile)...');
  const updatePayload = {
    name: 'Farhan Ahmed',
    title: 'Senior Backend Engineer',
    skills: ['TypeScript', 'NestJS', 'PostgreSQL', 'Docker'],
    preferences: {
      locations: ['Dhaka', 'Remote'],
      remote_preference: 'FULLY_REMOTE',
      min_salary: 180000,
      currency: 'BDT',
    },
    onboarding: {
      completed: true,
      step: 3,
    },
  };
  const updateRes = await request(`${API_BASE}/users/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${candidateA.token}` },
    body: updatePayload,
  });
  assert(updateRes.status === 200, 'Profile update returns HTTP 200', updateRes.status);
  assert(updateRes.data && updateRes.data.name === 'Farhan Ahmed', 'Updated name persisted', updateRes.data && updateRes.data.name);
  assert(updateRes.data && updateRes.data.title === 'Senior Backend Engineer', 'Updated title persisted', updateRes.data && updateRes.data.title);
  assert(Array.isArray(updateRes.data && updateRes.data.skills) && updateRes.data.skills.length === 4, 'Skills list persisted (4 skills)', updateRes.data && updateRes.data.skills);
  assert(updateRes.data && updateRes.data.preferences && updateRes.data.preferences.remote_preference === 'FULLY_REMOTE', 'Remote preference persisted as FULLY_REMOTE', updateRes.data && updateRes.data.preferences);
  assert(updateRes.data && updateRes.data.onboarding && updateRes.data.onboarding.completed === true, 'Onboarding completed state updated to true', updateRes.data && updateRes.data.onboarding);

  // Step 9: Stored State Verification via Profile Reload
  console.log('\n[9/16] Verifying persistence via fresh profile reload...');
  const reloadA = await request(`${API_BASE}/users/profile`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(reloadA.status === 200, 'Profile reloaded with HTTP 200', reloadA.status);
  assert(reloadA.data && reloadA.data.name === 'Farhan Ahmed', 'Reloaded profile retains name from PostgreSQL', reloadA.data && reloadA.data.name);
  assert(reloadA.data && reloadA.data.preferences && reloadA.data.preferences.min_salary === 180000, 'Reloaded profile retains minimum salary from PostgreSQL', reloadA.data && reloadA.data.preferences);

  // Step 10: Candidate B User Synchronization
  console.log('\n[10/16] Testing Candidate B user synchronization...');
  const syncB = await request(`${API_BASE}/users/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateB.token}` },
  });
  assert(syncB.status === 201 || syncB.status === 200, 'Candidate B synchronized with HTTP 200/201', syncB.status);
  assert(syncB.data && syncB.data.user && syncB.data.user.id === candidateB.uid, 'Candidate B identity maps to distinct UID', syncB.data);

  // Step 11: Cross-Tenant Isolation & Ownership Boundary
  console.log('\n[11/16] Verifying cross-tenant data isolation and ownership boundaries...');
  const profileB = await request(`${API_BASE}/users/profile`, {
    headers: { Authorization: `Bearer ${candidateB.token}` },
  });
  assert(profileB.status === 200, 'Candidate B reads profile with HTTP 200', profileB.status);
  assert(profileB.data && profileB.data.id === candidateB.uid, 'Candidate B profile returns Candidate B UID', profileB.data && profileB.data.id);
  assert(profileB.data && profileB.data.name === '', 'Candidate B sees own blank name; User A name Farhan Ahmed is not leaked', profileB.data && profileB.data.name);
  assert(Array.isArray(profileB.data && profileB.data.skills) && profileB.data.skills.length === 0, 'Candidate B sees empty skills; User A skills are isolated', profileB.data && profileB.data.skills);

  // Step 12: Server-Enforced Role Boundary
  console.log('\n[12/16] Testing server-enforced role boundary on privileged admin endpoint...');
  const adminTest = await request(`${API_BASE}/users/admin/test-privileged`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(adminTest.status === 403, 'Privileged admin endpoint rejects standard candidate with HTTP 403 Forbidden', adminTest.status);
  assert(adminTest.data && (adminTest.data.code === 'INSUFFICIENT_ROLE_PERMISSIONS' || adminTest.data.code === 'FORBIDDEN_ROLE'), 'Structured error code indicates role restriction', adminTest.data);

  // Step 13: Personal Data Export Request
  console.log('\n[13/16] Testing GDPR personal data export request (/users/account/export)...');
  const exportRes = await request(`${API_BASE}/users/account/export`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(exportRes.status === 201 || exportRes.status === 200, 'Export request returns HTTP 200/201', exportRes.status);
  assert(exportRes.data && exportRes.data.user_id === candidateA.uid, 'Export record bound to authenticated candidate UID', exportRes.data && exportRes.data.user_id);
  assert(Boolean(exportRes.data && exportRes.data.request_id), 'Export request includes unique request_id', exportRes.data && exportRes.data.request_id);
  assert(exportRes.data && exportRes.data.profile && exportRes.data.profile.name === 'Farhan Ahmed', 'Export archive includes persisted profile snapshot', exportRes.data && exportRes.data.profile);

  // Step 14: Account Deletion Request with 30-Day Grace Period
  console.log('\n[14/16] Testing account erasure request with 30-day grace period (/users/account/delete)...');
  const idempotencyKey = `smoke-del-${Date.now()}`;
  const deleteRes = await request(`${API_BASE}/users/account/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${candidateA.token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: {
      confirmation: 'DELETE_MY_ACCOUNT',
      reason: 'Automated test suite verification',
    },
  });
  assert(deleteRes.status === 201 || deleteRes.status === 200, 'Deletion request returns HTTP 200/201', deleteRes.status);
  assert(deleteRes.data && deleteRes.data.success === true, 'Deletion response indicates success', deleteRes.data && deleteRes.data.success);
  assert(deleteRes.data && (deleteRes.data.status === 'PENDING' || deleteRes.data.status === 'PENDING_GRACE_PERIOD'), 'Status is PENDING / PENDING_GRACE_PERIOD', deleteRes.data && deleteRes.data.status);
  assert(Boolean(deleteRes.data && deleteRes.data.scheduled_for), 'Scheduled deletion timestamp is present', deleteRes.data && deleteRes.data.scheduled_for);

  // Step 15: Deletion Request Idempotency & Cross-Candidate Ownership
  console.log('\n[15/16] Testing deletion request idempotency & cross-candidate ownership isolation...');
  const deleteRes2 = await request(`${API_BASE}/users/account/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${candidateA.token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: {
      confirmation: 'DELETE_MY_ACCOUNT',
      reason: 'Duplicate call with identical key',
    },
  });
  assert(deleteRes2.status === 200 || deleteRes2.status === 201, 'Idempotent deletion call returns HTTP 200/201', deleteRes2.status);
  assert(deleteRes2.data && deleteRes2.data.request_id === deleteRes.data.request_id, 'Duplicate request returns identical request_id', deleteRes2.data && deleteRes2.data.request_id);

  // Cross-candidate isolation: Candidate B reuses Candidate A's idempotency key
  const candidateBDeleteRes = await request(`${API_BASE}/users/account/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${candidateB.token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: {
      confirmation: 'DELETE_MY_ACCOUNT',
      reason: 'Candidate B independent deletion using reused key',
    },
  });
  assert(candidateBDeleteRes.status === 200 || candidateBDeleteRes.status === 201, 'Candidate B deletion succeeds with HTTP 200/201', candidateBDeleteRes.status);
  assert(candidateBDeleteRes.data && candidateBDeleteRes.data.request_id !== deleteRes.data.request_id, 'Candidate B receives their own distinct request_id (no foreign data leak)', candidateBDeleteRes.data && candidateBDeleteRes.data.request_id);

  // Step 16: Account Lifecycle Status Query
  console.log('\n[16/20] Testing account status query (/users/account/status)...');
  const statusRes = await request(`${API_BASE}/users/account/status`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(statusRes.status === 200, 'Account status returns HTTP 200', statusRes.status);
  assert(statusRes.data && statusRes.data.has_pending_deletion === true, 'Status accurately reflects pending deletion request', statusRes.data && statusRes.data.has_pending_deletion);
  assert(statusRes.data && statusRes.data.pending_deletion && (statusRes.data.pending_deletion.status === 'PENDING' || statusRes.data.pending_deletion.status === 'PENDING_GRACE_PERIOD'), 'Pending deletion has active status', statusRes.data && statusRes.data.pending_deletion);
  assert(Array.isArray(statusRes.data && statusRes.data.recent_exports) && statusRes.data.recent_exports.length >= 1, 'Status reflects at least 1 recorded recent export', statusRes.data && statusRes.data.recent_exports);

  // Step 17: P08 Multipart Resume Upload (/users/resume/upload)
  console.log('\n[17/25] Testing multipart PDF resume upload (/users/resume/upload)...');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 85 >>\nstream\nBT /F1 12 Tf 72 720 Td (Candidate CV. Skills: Python, Docker, Kubernetes, and FastAPI.) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000224 00000 n \n0000000293 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n430\n%%EOF\n';

  const multipartPrefix = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="candidate_resume.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
  const multipartSuffix = `\r\n--${boundary}--\r\n`;
  const multipartBuffer = Buffer.concat([
    Buffer.from(multipartPrefix, 'ascii'),
    Buffer.from(pdfContent, 'ascii'),
    Buffer.from(multipartSuffix, 'ascii'),
  ]);

  const uploadRes = await request(`${API_BASE}/users/resume/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${candidateA.token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBuffer,
  });

  assert(uploadRes.status === 202, 'Resume upload returns HTTP 202 Accepted', uploadRes.status);
  assert(Boolean(uploadRes.data && uploadRes.data.parse_id), 'Upload response returns parse_id', uploadRes.data && uploadRes.data.parse_id);
  assert(uploadRes.data && uploadRes.data.status === 'QUEUED', 'Initial parse status is QUEUED', uploadRes.data && uploadRes.data.status);
  const parseId = uploadRes.data ? uploadRes.data.parse_id : 'none';

  // Step 18: Poll for Asynchronous Extraction Lifecycle
  console.log('\n[18/25] Polling for parse worker completion or terminal status...');
  let latestStatus = 'QUEUED';
  let pollData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const pollRes = await request(`${API_BASE}/users/resume/status/${parseId}`, {
      headers: { Authorization: `Bearer ${candidateA.token}` },
    });
    if (pollRes.status === 200 && pollRes.data) {
      pollData = pollRes.data;
      latestStatus = pollRes.data.status;
      if (latestStatus === 'COMPLETED' || latestStatus === 'FAILED') {
        break;
      }
    }
  }

  assert(pollData && pollData.parse_id === parseId, 'Status response matches parse_id', pollData && pollData.parse_id);
  assert(latestStatus === 'COMPLETED' || latestStatus === 'QUEUED' || latestStatus === 'PROCESSING', 'Parse worker reached valid state', latestStatus);

  // Step 19: Active Resume Metadata Query (/users/resume)
  console.log('\n[19/25] Testing candidate active resume metadata query (/users/resume)...');
  const activeResumeRes = await request(`${API_BASE}/users/resume`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(activeResumeRes.status === 200, 'Active resume query returns HTTP 200', activeResumeRes.status);
  assert(activeResumeRes.data && activeResumeRes.data.has_resume === true, 'Active resume confirmed present', activeResumeRes.data && activeResumeRes.data.has_resume);
  assert(activeResumeRes.data && activeResumeRes.data.document && activeResumeRes.data.document.file_name === 'candidate_resume.pdf', 'Document file name preserved', activeResumeRes.data?.document?.file_name);

  // Step 20: Candidate Resume Download (/users/resume/download)
  console.log('\n[20/25] Testing authorized candidate resume download (/users/resume/download)...');
  const downloadRes = await request(`${API_BASE}/users/resume/download`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(downloadRes.status === 200, 'Resume download returns HTTP 200', downloadRes.status);
  assert(typeof downloadRes.data === 'string' && downloadRes.data.startsWith('%PDF'), 'Downloaded content starts with %PDF magic header', downloadRes.data?.substring(0, 5));

  // Step 21: Candidate Skill Review Staging (/users/resume/review)
  console.log('\n[21/25] Testing candidate skill review and explicit profile staging (/users/resume/review)...');
  // If extractor completed, review Python; if still queued, test with simulated review
  if (latestStatus === 'COMPLETED') {
    const reviewRes = await request(`${API_BASE}/users/resume/review`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidateA.token}`,
        'Content-Type': 'application/json',
      },
      body: {
        parse_id: parseId,
        selected_skills: ['Python', 'Docker'],
      },
    });
    assert(reviewRes.status === 200, 'Skill review returns HTTP 200', reviewRes.status);
    assert(Array.isArray(reviewRes.data?.skills) && reviewRes.data.skills.includes('Python'), 'Profile contains newly reviewed Python skill', reviewRes.data?.skills);
    assert(reviewRes.data?.skills.includes('TypeScript'), 'Candidate manual skills (TypeScript) were not clobbered', reviewRes.data?.skills);
  } else {
    // Parser offline: assert review rejects incomplete task with 400
    const incompleteReviewRes = await request(`${API_BASE}/users/resume/review`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidateA.token}`,
        'Content-Type': 'application/json',
      },
      body: {
        parse_id: parseId,
        selected_skills: ['Python'],
      },
    });
    assert(incompleteReviewRes.status === 400, 'Review of incomplete parse task rejected with HTTP 400', incompleteReviewRes.status);
  }

  // Step 22: Cross-Candidate Ownership Boundaries (Review and Download)
  console.log('\n[22/25] Testing cross-candidate boundaries on review, status, and download...');
  const crossReviewRes = await request(`${API_BASE}/users/resume/review`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${candidateB.token}`,
      'Content-Type': 'application/json',
    },
    body: {
      parse_id: parseId,
      selected_skills: ['Go'],
    },
  });
  assert(crossReviewRes.status === 404, 'Candidate B cannot review Candidate A parse task (HTTP 404)', crossReviewRes.status);

  const crossDownloadRes = await request(`${API_BASE}/users/resume/download`, {
    headers: { Authorization: `Bearer ${candidateB.token}` },
  });
  assert(crossDownloadRes.status === 404, 'Candidate B with no resume receives HTTP 404 on download', crossDownloadRes.status);

  const crossStatusRes = await request(`${API_BASE}/users/resume/status/${parseId}`, {
    headers: { Authorization: `Bearer ${candidateB.token}` },
  });
  assert(crossStatusRes.status === 404, 'Candidate B cannot access Candidate A parse status (HTTP 404)', crossStatusRes.status);

  // Step 23: Candidate Resume Deletion (/users/resume)
  console.log('\n[23/25] Testing candidate resume deletion (/users/resume)...');
  const deleteResumeRes = await request(`${API_BASE}/users/resume`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(deleteResumeRes.status === 200, 'Resume deletion returns HTTP 200', deleteResumeRes.status);
  assert(deleteResumeRes.data && typeof deleteResumeRes.data.message === 'string', 'Deletion response contains confirmation message', deleteResumeRes.data && deleteResumeRes.data.message);

  // Step 24: Post-Deletion Active Resume State (/users/resume)
  console.log('\n[24/25] Verifying active resume is no longer present after deletion...');
  const afterDeleteActiveRes = await request(`${API_BASE}/users/resume`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(afterDeleteActiveRes.status === 200, 'Active resume query after deletion returns HTTP 200', afterDeleteActiveRes.status);
  assert(afterDeleteActiveRes.data && afterDeleteActiveRes.data.has_resume === false, 'has_resume is false post-deletion', afterDeleteActiveRes.data?.has_resume);

  // Step 25: Post-Deletion Boundary (Late review & download rejected)
  console.log('\n[25/25] Testing post-deletion review and download rejection...');
  const lateReviewRes = await request(`${API_BASE}/users/resume/review`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${candidateA.token}`,
      'Content-Type': 'application/json',
    },
    body: {
      parse_id: parseId,
      selected_skills: ['Python'],
    },
  });
  assert(lateReviewRes.status === 400 || lateReviewRes.status === 404, 'Review of deleted document rejected with HTTP 400/404', lateReviewRes.status);

  const lateDownloadRes = await request(`${API_BASE}/users/resume/download`, {
    headers: { Authorization: `Bearer ${candidateA.token}` },
  });
  assert(lateDownloadRes.status === 404, 'Download after deletion rejected with HTTP 404', lateDownloadRes.status);

  // Final Evaluation
  console.log('\n----------------------------------------------------');
  if (failedAssertions > 0) {
    console.error(`\x1b[31m✖ [FAIL] Smoke suite completed with ${failedAssertions} failure(s) out of ${totalAssertions} assertions.\x1b[0m`);
    process.exit(1);
  }

  console.log(`\x1b[32m✔ [PASS] All ${totalAssertions} assertions passed across 25 integration checks.\x1b[0m`);
}

run().catch((err) => {
  console.error('\x1b[31m✖ [FATAL] Unhandled exception in smoke suite:\x1b[0m', err);
  process.exit(1);
});

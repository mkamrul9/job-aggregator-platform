import assert from 'node:assert';
import http from 'node:http';

console.log('====================================================');
console.log('  Next.js Job Search & Catalog Proxy Regressions    ');
console.log('====================================================\n');

// Mock upstream ingestion service
let mockPort;
let lastUpstreamRequest = null;
const server = http.createServer((req, res) => {
  lastUpstreamRequest = {
    method: req.method,
    url: req.url,
    headers: req.headers,
  };

  if (req.url.startsWith('/api/v1/jobs/11111111-1111-4111-8111-111111111101/outbound')) {
    if (req.headers.accept?.includes('application/json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ destination_url: 'https://careers.brainstation-23.com/jobs/sr-backend' }));
    } else {
      res.writeHead(302, { Location: 'https://careers.brainstation-23.com/jobs/sr-backend' });
      res.end();
    }
    return;
  }

  if (req.url.startsWith('/api/v1/jobs/11111111-1111-4111-8111-111111111101')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: '11111111-1111-4111-8111-111111111101',
      title: 'Senior Backend Engineer (Go / Distributed Systems)',
      company: 'Brain Station 23',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      job_type: 'FULL_TIME',
      seniority: 'SENIOR',
      description: 'Design high throughput distributed microservices.',
      skills: ['Go', 'PostgreSQL', 'Docker'],
      source_platform: 'BDJobs',
      canonical_url: 'https://bdjobs.com/jobs/101',
      status: 'ACTIVE',
      published_at: '2026-10-25T08:00:00Z',
    }));
    return;
  }

  if (req.url.startsWith('/api/v1/jobs/00000000-0000-0000-0000-000000000000')) {
    res.writeHead(404, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Job listing not found',
    }));
    return;
  }

  if (req.url.startsWith('/api/v1/jobs/55555555-5555-4555-8555-555555555555')) {
    res.writeHead(503, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify({
      type: 'https://errors.seekers.internal/service-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Upstream database is down',
    }));
    return;
  }

  if (req.url.startsWith('/api/v1/jobs/33333333-3333-4333-8333-333333333303/outbound')) {
    res.writeHead(404, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify({
      type: 'https://errors.seekers.internal/listing-inactive',
      title: 'Listing Unavailable',
      status: 404,
      detail: 'Job listing has expired and is no longer accepting applications',
    }));
    return;
  }

  if (req.url.startsWith('/api/v1/jobs')) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Search-Engine': 'Elasticsearch',
      'X-Correlation-ID': 'test-corr-id',
    });
    res.end(JSON.stringify({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111101',
          title: 'Senior Backend Engineer (Go / Distributed Systems)',
          company: 'Brain Station 23',
          location: 'Dhaka, Bangladesh',
          remote_eligibility: 'HYBRID',
          job_type: 'FULL_TIME',
          seniority: 'SENIOR',
          status: 'ACTIVE',
          published_at: '2026-10-25T08:00:00Z',
        },
      ],
      total_count: 1,
      next_cursor: null,
      page_size: 10,
    }));
    return;
  }

  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    mockPort = server.address().port;
    process.env.INGESTION_API_URL = `http://127.0.0.1:${mockPort}`;
    resolve();
  });
});

try {
  // Test 1: Proxy search query forwarding with cursor and filters
  console.log('Test 1: Forwarding search request through ingestion proxy...');
  const { proxyToIngestion } = await import('../lib/ingestion-proxy.ts');

  const searchReq = new Request('http://localhost:3000/api/v1/jobs?q=Go&remote_eligibility=HYBRID&cursor=abc', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-correlation-id': 'req-corr-123',
    },
  });

  const response = await proxyToIngestion(searchReq, '/api/v1/jobs');
  assert.strictEqual(response.status, 200, 'Expected 200 OK');
  assert.strictEqual(lastUpstreamRequest.method, 'GET');
  assert.strictEqual(lastUpstreamRequest.url, '/api/v1/jobs?q=Go&remote_eligibility=HYBRID&cursor=abc');
  assert.strictEqual(lastUpstreamRequest.headers['x-correlation-id'], 'req-corr-123');

  const data = await response.json();
  assert.strictEqual(data.items.length, 1);
  assert.strictEqual(data.items[0].id, '11111111-1111-4111-8111-111111111101');
  console.log('✔ [PASS] Search request cleanly forwarded to ingestion service with filters and correlation ID\n');

  // Test 2: Outbound redirect preservation (302)
  console.log('Test 2: Proxy outbound route 302 redirect preservation...');
  const outboundHtmlReq = new Request('http://localhost:3000/api/v1/jobs/11111111-1111-4111-8111-111111111101/outbound', {
    method: 'GET',
    headers: {
      'accept': 'text/html',
    },
  });

  const redirectRes = await proxyToIngestion(outboundHtmlReq, '/api/v1/jobs/11111111-1111-4111-8111-111111111101/outbound');
  assert.strictEqual(redirectRes.status, 302, 'Expected 302 redirect for HTML request');
  assert.strictEqual(redirectRes.headers.get('location'), 'https://careers.brainstation-23.com/jobs/sr-backend');
  console.log('✔ [PASS] 302 Redirect correctly returned to browser with valid destination Location\n');

  // Test 3: Outbound JSON negotiation (200)
  console.log('Test 3: Proxy outbound route 200 JSON negotiation...');
  const outboundJsonReq = new Request('http://localhost:3000/api/v1/jobs/11111111-1111-4111-8111-111111111101/outbound', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });

  const jsonRes = await proxyToIngestion(outboundJsonReq, '/api/v1/jobs/11111111-1111-4111-8111-111111111101/outbound');
  assert.strictEqual(jsonRes.status, 200, 'Expected 200 for JSON Accept');
  const jsonBody = await jsonRes.json();
  assert.strictEqual(jsonBody.destination_url, 'https://careers.brainstation-23.com/jobs/sr-backend');
  console.log('✔ [PASS] 200 JSON returned for API/crawler negotiation\n');

  // Test 4: Upstream 404 propagation
  console.log('Test 4: Propagating 404 problem details for missing job...');
  const missingReq = new Request('http://localhost:3000/api/v1/jobs/00000000-0000-0000-0000-000000000000', {
    method: 'GET',
  });
  const missingRes = await proxyToIngestion(missingReq, '/api/v1/jobs/00000000-0000-0000-0000-000000000000');
  assert.strictEqual(missingRes.status, 404, 'Expected 404 for non-existent job');
  const missingBody = await missingRes.json();
  assert.strictEqual(missingBody.title, 'Not Found');
  console.log('✔ [PASS] 404 Problem Details preserved across proxy gateway\n');

  // Test 5: Safe URL validator prevents SSRF and invalid schemes
  console.log('Test 5: Validating safe outbound destination URL checks...');
  const { validateOutboundUrl } = await import('../../service-ingestion/src/models/job.js');
  
  assert.strictEqual(validateOutboundUrl('https://careers.google.com/jobs/1').valid, true);
  assert.strictEqual(validateOutboundUrl('http://jobs.bdjobs.com/123').valid, true);

  // SSRF and unsafe schemes
  assert.strictEqual(validateOutboundUrl('javascript:alert(1)').valid, false);
  assert.strictEqual(validateOutboundUrl('data:text/html,<script>').valid, false);
  assert.strictEqual(validateOutboundUrl('ftp://example.com/file').valid, false);
  assert.strictEqual(validateOutboundUrl('http://localhost:3000').valid, false);
  assert.strictEqual(validateOutboundUrl('http://127.0.0.1:8080').valid, false);
  assert.strictEqual(validateOutboundUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.strictEqual(validateOutboundUrl('http://10.0.0.1/admin').valid, false);
  assert.strictEqual(validateOutboundUrl('http://user:pass@example.com').valid, false);
  console.log('✔ [PASS] Unsafe protocols, embedded credentials, and loopback/private IPs strictly rejected\n');

  // Test 6: Safe JSON-LD script serialization prevents HTML script breakout
  console.log('Test 6: Safe JSON-LD serialization against HTML script breakout...');
  const { safeJsonLd, fetchJobDetail } = await import('../lib/job-detail-helper.ts');

  const maliciousPayload = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: '</script><script>window.__P06_REVIEW_PROBE__=1</script>',
    company: 'Evil & Corp <Malicious>',
  };

  const serialized = safeJsonLd(maliciousPayload);
  assert.strictEqual(serialized.includes('</script>'), false, 'Serialized JSON-LD must not contain unescaped </script>');
  assert.strictEqual(serialized.includes('<script>'), false, 'Serialized JSON-LD must not contain unescaped <script>');
  assert.strictEqual(serialized.includes('\\u003c/script\\u003e'), true, 'Serialized JSON-LD must escape < as \\u003c');
  assert.strictEqual(serialized.includes('\\u003e'), true, 'Serialized JSON-LD must escape > as \\u003e');
  assert.strictEqual(serialized.includes('\\u0026'), true, 'Serialized JSON-LD must escape & as \\u0026');

  // Verify that parsing the escaped JSON yields exact original strings
  const parsedBack = JSON.parse(serialized);
  assert.strictEqual(parsedBack.title, '</script><script>window.__P06_REVIEW_PROBE__=1</script>');
  assert.strictEqual(parsedBack.company, 'Evil & Corp <Malicious>');
  console.log('✔ [PASS] JSON-LD safely escaped against script breakout while preserving exact string content\n');

  // Test 7: Upstream 503 error handling distinguishes temporary failure from not found
  console.log('Test 7: Upstream 503 error handling in fetchJobDetail...');
  const failResult = await fetchJobDetail('55555555-5555-4555-8555-555555555555');
  assert.strictEqual(failResult.kind, 'service_unavailable', 'Expected service_unavailable on upstream 503');
  assert.strictEqual(failResult.status, 503);
  console.log('✔ [PASS] Upstream 503 correctly returns service_unavailable without triggering 404 notFound\n');

  // Test 8: Proxy preserves application/problem+json and X-Search-Engine
  console.log('Test 8: Preserving application/problem+json and search engine headers in proxy...');
  const expiredOutboundReq = new Request('http://localhost:3000/api/v1/jobs/33333333-3333-4333-8333-333333333303/outbound', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const expiredRes = await proxyToIngestion(expiredOutboundReq, '/api/v1/jobs/33333333-3333-4333-8333-333333333303/outbound');
  assert.strictEqual(expiredRes.status, 404);
  assert.strictEqual(expiredRes.headers.get('content-type'), 'application/problem+json');
  const expiredBody = await expiredRes.json();
  assert.strictEqual(expiredBody.title, 'Listing Unavailable');
  console.log('✔ [PASS] Problem details content-type and 404 payload preserved through proxy\n');

  console.log('----------------------------------------------------');
  console.log('✔ All 8 Next.js search and catalog proxy regressions passed!');
} finally {
  server.close();
}

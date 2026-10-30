'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { escapeHtml, renderAlertHtml, renderAlertText } = require('../src/templates');

describe('service-notification: template tests', () => {
  it('escapes dangerous HTML characters to prevent XSS injection', () => {
    const dangerousStr = '<script>alert("pwned")</script> & "quote" \'apostrophe\'';
    const escaped = escapeHtml(dangerousStr);

    assert.ok(!escaped.includes('<script>'));
    assert.ok(!escaped.includes('</script>'));
    assert.ok(escaped.includes('&lt;script&gt;'));
    assert.ok(escaped.includes('&amp;'));
    assert.ok(escaped.includes('&quot;quote&quot;'));
    assert.ok(escaped.includes('&#39;apostrophe&#39;'));
  });

  it('renders responsive HTML email with deep links, disclosure, and unsubscribe URL', () => {
    const job = {
      id: 'job-xss-test',
      title: 'Full Stack Developer <img src=x onerror=alert(1)>',
      company: 'TechCorp & Sons',
      location: 'Dhaka',
      remote_eligibility: 'HYBRID',
      description: 'Building modern apps with React & Node.',
    };

    const subscription = {
      query: 'Full Stack & Cloud',
    };

    const unsubscribeUrl = 'https://seekers.work/api/v1/notifications/unsubscribe?token=sample-token-123';
    const html = renderAlertHtml({
      jobs: [job],
      subscription,
      unsubscribeUrl,
      baseUrl: 'https://seekers.work',
    });

    // Verify XSS prevention
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('TechCorp &amp; Sons'));

    // Verify required links and disclosures
    assert.ok(html.includes('https://seekers.work/jobs/job-xss-test'));
    assert.ok(html.includes(unsubscribeUrl));
    assert.ok(html.includes('Full Stack &amp; Cloud'));
    assert.ok(html.includes('Unsubscribe with one click'));
    assert.ok(html.includes('Manage Alert Preferences'));
  });

  it('renders plain-text alternative with readable format and full links', () => {
    const job = {
      id: 'job-txt-test',
      title: 'Principal Architect',
      company: 'DataFlow Systems',
      location: 'Remote',
      remote_eligibility: 'FULLY_REMOTE',
      description: 'Distributed ledger development.',
    };

    const subscription = {
      query: 'Principal Architect',
    };

    const unsubscribeUrl = 'https://seekers.work/api/v1/notifications/unsubscribe?token=sample-token-123';
    const text = renderAlertText({
      jobs: [job],
      subscription,
      unsubscribeUrl,
      baseUrl: 'https://seekers.work',
    });

    assert.ok(text.includes('Principal Architect'));
    assert.ok(text.includes('DataFlow Systems'));
    assert.ok(text.includes('https://seekers.work/jobs/job-txt-test'));
    assert.ok(text.includes(unsubscribeUrl));
    assert.ok(text.includes('Unsubscribe from this alert with one click:'));
  });
});


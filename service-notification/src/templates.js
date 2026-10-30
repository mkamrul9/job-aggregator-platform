'use strict';

/**
 * Escapes characters for HTML output to prevent XSS.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders an accessible, responsive HTML email alert for matching jobs.
 *
 * @param {Object} options
 * @param {Object|Array<Object>} options.jobs - Array of matching jobs or single job
 * @param {Object} options.subscription - Subscription criteria
 * @param {string} options.unsubscribeUrl - Signed one-click unsubscribe URL
 * @param {string} [options.baseUrl='https://seekers.work'] - Base web application URL
 * @returns {string} Fully rendered HTML
 */
function renderAlertHtml({ jobs, subscription, unsubscribeUrl, baseUrl = 'https://seekers.work' }) {
  const jobList = Array.isArray(jobs) ? jobs : [jobs];
  const queryEscaped = escapeHtml(subscription.query || 'Engineering Roles');
  const safeBaseUrl = escapeHtml(baseUrl);
  const safeUnsubUrl = escapeHtml(unsubscribeUrl);

  const jobCards = jobList
    .map((job) => {
      const titleEsc = escapeHtml(job.title || 'Software Engineering Role');
      const companyEsc = escapeHtml(job.company || 'Confidential Company');
      const locationEsc = escapeHtml(job.location || 'Remote');
      const remoteEsc = escapeHtml(job.remote_eligibility || job.workplace_type || 'Hybrid');
      const snippetEsc = escapeHtml(
        (job.description || '').substring(0, 180) + ((job.description || '').length > 180 ? '...' : '')
      );
      const safeJobLink = `${safeBaseUrl}/jobs/${encodeURIComponent(job.id || '')}`;

      return `
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
          <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #f8fafc;">
            <a href="${safeJobLink}" style="color: #60a5fa; text-decoration: none;">${titleEsc}</a>
          </h2>
          <div style="font-size: 14px; color: #94a3b8; margin-bottom: 12px;">
            <strong style="color: #e2e8f0;">${companyEsc}</strong> &bull; ${locationEsc} (${remoteEsc})
          </div>
          ${snippetEsc ? `<p style="font-size: 13px; line-height: 1.5; color: #cbd5e1; margin: 0 0 16px 0;">${snippetEsc}</p>` : ''}
          <div style="text-align: left;">
            <a href="${safeJobLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;">
              View Opportunity &rarr;
            </a>
          </div>
        </div>
      `;
    })
    .join('\n');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Job Matches on Seekers</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #0f172a; padding: 0 16px;">
          <!-- Header -->
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #334155;">
              <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #38bdf8;">
                SEEKERS
              </span>
              <span style="font-size: 13px; color: #64748b; margin-left: 8px;">
                Direct Verified Engineering Roles
              </span>
            </td>
          </tr>

          <!-- Reason Disclosure Banner -->
          <tr>
            <td style="padding: 20px 0 16px 0;">
              <div style="background-color: #1e1b4b; border-left: 4px solid #818cf8; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #c7d2fe;">
                You are receiving this alert because of your active subscription for: <strong>&ldquo;${queryEscaped}&rdquo;</strong>.
              </div>
            </td>
          </tr>

          <!-- Job Cards -->
          <tr>
            <td>
              ${jobCards}
            </td>
          </tr>

          <!-- Footer & One-Click Unsubscribe -->
          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #334155; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6;">
              <p style="margin: 0 0 8px 0;">
                Seekers Platform &bull; Real-time, direct, authentic engineering job aggregator.
              </p>
              <p style="margin: 0;">
                Don&rsquo;t want to receive alerts for this query?
                <a href="${safeUnsubUrl}" style="color: #94a3b8; text-decoration: underline;">
                  Unsubscribe with one click
                </a>
                &bull;
                <a href="${safeBaseUrl}/alerts" style="color: #94a3b8; text-decoration: underline;">
                  Manage Alert Preferences
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Renders a clean plain-text alternative email for matching jobs.
 *
 * @param {Object} options
 * @param {Object|Array<Object>} options.jobs
 * @param {Object} options.subscription
 * @param {string} options.unsubscribeUrl
 * @param {string} [options.baseUrl='https://seekers.work']
 * @returns {string} Plain text
 */
function renderAlertText({ jobs, subscription, unsubscribeUrl, baseUrl = 'https://seekers.work' }) {
  const jobList = Array.isArray(jobs) ? jobs : [jobs];
  const query = subscription.query || 'Engineering Roles';

  const lines = [
    'SEEKERS - DIRECT VERIFIED ENGINEERING ROLES',
    '============================================',
    '',
    `You are receiving this job alert because you subscribed to: "${query}".`,
    '',
    '--------------------------------------------',
  ];

  for (const job of jobList) {
    const title = job.title || 'Engineering Role';
    const company = job.company || 'Confidential Company';
    const location = job.location || 'Remote';
    const remote = job.remote_eligibility || job.workplace_type || 'Hybrid';
    const jobUrl = `${baseUrl}/jobs/${job.id || ''}`;

    lines.push(`Title:    ${title}`);
    lines.push(`Company:  ${company}`);
    lines.push(`Location: ${location} (${remote})`);
    if (job.description) {
      const snippet = job.description.substring(0, 180).replace(/\n/g, ' ');
      lines.push(`Summary:  ${snippet}...`);
    }
    lines.push(`Link:     ${jobUrl}`);
    lines.push('--------------------------------------------');
  }

  lines.push('');
  lines.push('Unsubscribe from this alert with one click:');
  lines.push(unsubscribeUrl);
  lines.push('');
  lines.push(`Manage all your alert preferences: ${baseUrl}/alerts`);

  return lines.join('\n');
}

module.exports = {
  escapeHtml,
  renderAlertHtml,
  renderAlertText,
};

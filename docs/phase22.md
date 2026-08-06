# Phase 22: Next.js Portal (Job Search UI & Elasticsearch Proxy)

## Overview
In this phase, we completed the core functional requirement of the frontend candidate portal: the Job Search engine. To guarantee stringent security against malicious indexing drops or data scraping, we intentionally insulated the Elasticsearch container. Instead of direct client-to-database access, we built a highly secure Next.js API Proxy Route to securely orchestrate fuzzy search queries on behalf of the frontend UI.

## Implementation Details

1. **Elasticsearch Node.js Client (`@elastic/elasticsearch`):**
   - Installed the official Elasticsearch library into the Next.js runtime.
   - Configured the client instance to dynamically route to the `ES_NODE` environment variable, enabling seamless connection within our Docker network (`http://elasticsearch:9200`) while allowing local fallback (`localhost`).

2. **Next.js API Proxy (`app/api/search/route.ts`):**
   - Engineered a server-side App Router API handler (`GET`).
   - Parsed the `q` (query) string parameter to dynamically build an Elasticsearch request body.
   - Utilized a `multi_match` query targeting the `title` and `raw_description` fields, specifically assigning a 3x (`^3`) relevancy boost to title matches.
   - Enabled `fuzziness: 'AUTO'` to provide resilient typo-tolerance for candidate queries.
   - Cleanly mapped the complex nested Elasticsearch `result.hits.hits` response into a sanitized, flattened array before transmitting it back to the client.

3. **Job Search UI (`components/JobSearch.tsx`):**
   - Developed a responsive, state-driven search component leveraging React hooks (`useState`, `React.FormEvent`).
   - Styled the search bar and individual job result cards elegantly using Tailwind CSS.
   - Implemented loading states and empty-result handlers for optimized user feedback.
   - Mapped the returned `Job[]` array to render the Job Title, Company, a truncated description (`line-clamp-3`), and an external hyperlink to the actual application URL.

4. **Dashboard Assembly (`app/page.tsx`):**
   - Refactored the core dashboard layout into a dual-column CSS grid (`grid md:grid-cols-2`).
   - Housed the User Management stack (`AuthComponent` and `ResumeUpload`) securely on the left, while dedicating the expansive right column to the new `JobSearch` interface.

## Impact
The platform is now end-to-end operational. Candidates can interact securely via the Next.js frontend to execute complex, typo-tolerant full-text searches across our massive scraped dataset without ever exposing the underlying Elasticsearch infrastructure to the public internet.

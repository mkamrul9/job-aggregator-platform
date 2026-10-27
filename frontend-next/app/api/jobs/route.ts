import { NextResponse } from 'next/server';
import { Client } from '@elastic/elasticsearch';

interface JobSource {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  raw_description?: string;
  skills?: string[];
  [key: string]: unknown;
}

// In production, this would be an internal Docker URL (e.g., http://elasticsearch:9200)
// For local Next.js dev outside of Docker, it's localhost
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const esClient = new Client({ node: ES_NODE });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  const from = (page - 1) * limit;

  try {
    let result;

    if (query) {
      // Perform a fuzzy full-text search against the job title and description
      result = await esClient.search<JobSource>({
        index: 'jobs_index',
        from,
        size: limit,
        query: {
          multi_match: {
            query: query,
            fields: ['title^3', 'raw_description'], // Boost the title field weight by 3x
            fuzziness: 'AUTO' // Handles minor typos gracefully
          }
        }
      });
    } else {
      // No query — return all recent jobs
      result = await esClient.search<JobSource>({
        index: 'jobs_index',
        from,
        size: limit,
        query: { match_all: {} },
        sort: [{ _doc: { order: 'desc' } }]
      });
    }

    // Map the Elasticsearch response into a clean array for the frontend
    const hits = result.hits.hits
      .map((hit) => hit._source)
      .filter((doc): doc is JobSource => doc !== undefined);
    const total = typeof result.hits.total === 'number'
      ? result.hits.total
      : result.hits.total?.value ?? 0;

    return NextResponse.json({ jobs: hits, total, page, limit }, { status: 200 });
  } catch (error) {
    console.error('Elasticsearch query error:', error);
    return NextResponse.json({ error: 'Internal Search Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { Client } from '@elastic/elasticsearch';

// In production, this would be an internal Docker URL (e.g., http://elasticsearch:9200)
// For local Next.js dev outside of Docker, it's localhost
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const esClient = new Client({ node: ES_NODE });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    // Perform a fuzzy full-text search against the job title and description
    const result = await esClient.search({
      index: 'jobs_index',
      query: {
        multi_match: {
          query: query,
          fields: ['title^3', 'raw_description'], // Boost the title field weight by 3x
          fuzziness: 'AUTO' // Handles minor typos gracefully
        }
      }
    });

    // Map the messy Elasticsearch response into a clean array for the frontend
    const hits = (result.hits.hits as any[]).map((hit: any) => hit._source);
    
    return NextResponse.json({ jobs: hits }, { status: 200 });
  } catch (error) {
    console.error('Elasticsearch querying error:', error);
    return NextResponse.json({ error: 'Internal Search Error' }, { status: 500 });
  }
}

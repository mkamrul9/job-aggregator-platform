// frontend-next/app/api/jobs/route.ts
import { NextRequest } from 'next/server';
import { proxyToIngestion } from '../../../lib/ingestion-proxy';

export async function GET(request: NextRequest) {
  return proxyToIngestion(request, '/api/v1/jobs');
}

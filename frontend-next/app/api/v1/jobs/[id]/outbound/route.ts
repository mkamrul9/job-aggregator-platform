// frontend-next/app/api/v1/jobs/[id]/outbound/route.ts
import { NextRequest } from 'next/server';
import { proxyToIngestion } from '../../../../../../lib/ingestion-proxy';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return proxyToIngestion(request, `/api/v1/jobs/${id}/outbound`);
}

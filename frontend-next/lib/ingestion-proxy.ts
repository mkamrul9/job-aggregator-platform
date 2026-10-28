// frontend-next/lib/ingestion-proxy.ts
import { NextRequest, NextResponse } from 'next/server.js';

const INGESTION_API_URL = process.env.INGESTION_API_URL || 'http://localhost:5000';

export async function proxyToIngestion(request: NextRequest, subpath: string) {
  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const targetUrl = `${INGESTION_API_URL}${subpath}${queryString ? `?${queryString}` : ''}`;
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'Accept': request.headers.get('accept') || 'application/json',
        'X-Correlation-ID': correlationId,
      },
      redirect: 'manual', // do not auto-follow redirects, preserve 302 Location
      cache: 'no-store',
    });

    // If upstream issued a redirect (e.g. 302 outbound link)
    if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
      const location = upstreamRes.headers.get('location') || '/';
      return NextResponse.redirect(location, {
        status: upstreamRes.status,
        headers: {
          'X-Correlation-ID': correlationId,
        },
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    const searchEngine = upstreamRes.headers.get('x-search-engine');
    const proxyHeaders: Record<string, string> = {
      'X-Correlation-ID': correlationId,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };
    if (searchEngine) {
      proxyHeaders['X-Search-Engine'] = searchEngine;
    }

    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      const data = await upstreamRes.json();
      if (contentType.includes('application/problem+json')) {
        proxyHeaders['Content-Type'] = 'application/problem+json';
      }
      return NextResponse.json(data, {
        status: upstreamRes.status,
        headers: proxyHeaders,
      });
    }

    const text = await upstreamRes.text();
    return new NextResponse(text, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': contentType,
        'X-Correlation-ID': correlationId,
      },
    });
  } catch (error) {
    console.error(`Ingestion proxy error for ${targetUrl}:`, error);
    return NextResponse.json(
      {
        type: 'https://errors.seekers.internal/service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Catalog and search service is currently unreachable',
      },
      {
        status: 503,
        headers: { 'X-Correlation-ID': correlationId },
      }
    );
  }
}

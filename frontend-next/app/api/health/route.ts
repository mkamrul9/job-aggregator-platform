export async function GET() {
  return Response.json({
    status: 'UP',
    service: 'frontend-next',
    timestamp: new Date().toISOString(),
  });
}

import { backendUrl, proxyHeaders } from '../../_proxy';

function unavailableResponse() {
  return Response.json(
    { code: 'AGENT_MAIL_BACKEND_UNREACHABLE', message: '无法连接 Agent Mail 本地服务。' },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  const url = backendUrl('/api/auth/start');
  if (!url) {
    return Response.json(
      { code: 'AGENT_MAIL_BACKEND_NOT_CONFIGURED', message: 'Agent Mail 本地服务尚未连接。请先启动 Egg.js 服务。' },
      { status: 503 },
    );
  }
  try {
    const body = await request.text();
    const response = await fetch(url, { method: 'POST', headers:proxyHeaders(request,true), body: body || '{}' });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return unavailableResponse();
  }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 });

  const url = backendUrl(`/api/auth/status?sessionId=${encodeURIComponent(sessionId)}`);
  if (!url) {
    return Response.json(
      { code: 'AGENT_MAIL_BACKEND_NOT_CONFIGURED', message: 'Agent Mail 本地服务尚未连接。' },
      { status: 503 },
    );
  }
  try {
    const response = await fetch(url, { headers:proxyHeaders(request) });
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return unavailableResponse();
  }
}

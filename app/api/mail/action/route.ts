import { backendUrl, proxyHeaders } from '../../_proxy';

export async function POST(request: Request) {
  const url = backendUrl('/api/mail/action');
  if (!url) return Response.json({ message: 'Agent Mail 本地服务尚未连接。' }, { status: 503 });
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: proxyHeaders(request, true),
      body: await request.text(),
    });
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ message: '无法连接 Agent Mail 本地服务。' }, { status: 503 });
  }
}

import { proxyHeaders } from '../_proxy';

export async function PUT(request: Request) {
  const backend = process.env.AGENT_MAIL_BACKEND_URL;
  if (!backend) {
    return Response.json(
      { code: 'AGENT_MAIL_BACKEND_NOT_CONFIGURED', message: 'Agent Mail 本地服务尚未配置。' },
      { status: 503 },
    );
  }
  try {
    const payload = await request.json() as { aliasId?:string; workspace?:string; labels?:string[] };
    if (!payload.aliasId || !payload.workspace || !Array.isArray(payload.labels)) {
      return Response.json({ code: 'INVALID_LABEL_REQUEST', message: '标签请求参数不完整。' }, { status: 400 });
    }
    const response = await fetch(
      new URL(`/api/aliases/${encodeURIComponent(payload.aliasId)}/labels`, backend),
      {
        method: 'PUT',
        headers: proxyHeaders(request, true),
        body: JSON.stringify({ workspace:payload.workspace, labels:payload.labels }),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type':'application/json', 'cache-control':'no-store' },
    });
  } catch {
    return Response.json(
      { code: 'AGENT_MAIL_BACKEND_UNREACHABLE', message: '无法连接 Agent Mail 本地服务。' },
      { status: 503 },
    );
  }
}

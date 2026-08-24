export function backendUrl(path:string) {
  const origin = process.env.AGENT_MAIL_BACKEND_URL;
  return origin ? new URL(path, origin) : null;
}

export function proxyHeaders(request:Request, json=false) {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  if (json) headers.set('content-type', 'application/json');
  return headers;
}

export function backendUnavailable() {
  return Response.json({ code:'AGENT_MAIL_BACKEND_UNREACHABLE', message:'无法连接 Agent Mail 本地服务。' }, { status:503 });
}

function backendUrl(path: string) {
  const origin = process.env.AGENT_MAIL_BACKEND_URL;
  return origin ? new URL(path, origin) : null;
}

export async function POST(request: Request) {
  const payload = await request.json() as { id?:string; workspace?:string; starred?:boolean };
  if (!payload.id || !/^msg_[A-Za-z0-9_-]+$/.test(payload.id)) {
    return Response.json({ message: '无效的邮件标识。' }, { status: 400 });
  }
  const url = backendUrl(`/api/messages/${encodeURIComponent(payload.id)}/star`);
  if (!url) return Response.json({ message: 'Agent Mail 本地服务尚未连接。' }, { status: 503 });
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspace: payload.workspace, starred: payload.starred }),
    });
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ message: '无法连接 Agent Mail 本地服务。' }, { status: 503 });
  }
}

function backendUrl(path: string) {
  const origin = process.env.AGENT_MAIL_BACKEND_URL;
  return origin ? new URL(path, origin) : null;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^msg_[A-Za-z0-9_-]+$/.test(id)) {
    return Response.json({ code: 'INVALID_MESSAGE_ID', message: '无效的邮件标识。' }, { status: 400 });
  }

  const url = backendUrl(`/api/messages/${encodeURIComponent(id)}`);
  if (!url) {
    return Response.json(
      { code: 'AGENT_MAIL_BACKEND_NOT_CONFIGURED', message: 'Agent Mail 本地服务尚未连接。' },
      { status: 503 },
    );
  }
  try {
    const response = await fetch(url);
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json(
      { code: 'AGENT_MAIL_BACKEND_UNREACHABLE', message: '无法连接 Agent Mail 本地服务。' },
      { status: 503 },
    );
  }
}

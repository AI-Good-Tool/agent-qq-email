import { env } from 'cloudflare:workers';
import { ensureDatabase } from '../../../../db/bootstrap';

export async function POST() {
  await ensureDatabase(env.DB);
  const id = crypto.randomUUID();
  const state = crypto.randomUUID().replaceAll('-','');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await env.DB.prepare('INSERT INTO qr_sessions (id,state,status,expires_at,created_at) VALUES (?,?,?,?,?)').bind(id,state,'pending',expiresAt,Date.now()).run();
  const appId = process.env.WECHAT_APP_ID;
  const redirectUri = process.env.WECHAT_REDIRECT_URI;
  const qrUrl = appId && redirectUri
    ? `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
    : `${new URL('/wechat/demo-authorize', 'https://yunyouhe.local').toString()}?state=${state}`;
  return Response.json({ sessionId:id, state, qrUrl, expiresAt, mode: appId ? 'wechat-open-platform' : 'demo' });
}

export async function GET(request: Request) {
  await ensureDatabase(env.DB);
  const id = new URL(request.url).searchParams.get('sessionId');
  if (!id) return Response.json({ error:'sessionId is required' }, { status:400 });
  const session = await env.DB.prepare('SELECT id,status,expires_at AS expiresAt FROM qr_sessions WHERE id = ?').bind(id).first<{id:string;status:string;expiresAt:number}>();
  if (!session) return Response.json({ error:'session not found' }, { status:404 });
  if (session.expiresAt < Date.now() && session.status === 'pending') {
    await env.DB.prepare("UPDATE qr_sessions SET status = 'expired' WHERE id = ?").bind(id).run();
    session.status = 'expired';
  }
  return Response.json(session);
}

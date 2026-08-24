import { env } from 'cloudflare:workers';
import { ensureDatabase } from '../../../../db/bootstrap';

type TokenResponse = { access_token?:string; refresh_token?:string; openid?:string; unionid?:string; errcode?:number; errmsg?:string };
type UserResponse = { nickname?:string; openid?:string; unionid?:string; errcode?:number; errmsg?:string };

function page(title:string, detail:string, ok=false) {
  const color = ok ? '#17b26a' : '#d14343';
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="margin:0;background:#f6f8f7;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#26302b"><main style="max-width:420px;margin:12vh auto;background:white;border:1px solid #e7ece9;border-radius:18px;padding:32px;text-align:center"><div style="width:48px;height:48px;border-radius:50%;margin:0 auto 18px;background:${color};color:white;display:grid;place-items:center;font-size:24px">${ok?'✓':'!'}</div><h1 style="font-size:21px;margin:0 0 10px">${title}</h1><p style="font-size:14px;color:#7f8984;line-height:1.7">${detail}</p></main><script>if(window.opener){window.opener.postMessage({type:'yunyouhe-wechat-callback',ok:${ok}},location.origin)}</script></body></html>`, { status:ok?200:400, headers:{'content-type':'text/html; charset=utf-8'} });
}

async function encrypt(value:string, secret:string) {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...cipher))}`;
}

export async function GET(request:Request) {
  await ensureDatabase(env.DB);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return page('微信连接失败', '授权回调缺少必要参数，请返回云邮盒重新扫码。');
  const session = await env.DB.prepare("SELECT id,status,expires_at AS expiresAt FROM qr_sessions WHERE state = ?").bind(state).first<{id:string;status:string;expiresAt:number}>();
  if (!session || session.status !== 'pending' || session.expiresAt < Date.now()) return page('二维码已失效', '请返回云邮盒刷新二维码后重新扫码。');
  const appId = process.env.WECHAT_APP_ID;
  const secret = process.env.WECHAT_APP_SECRET;
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!appId || !secret || !encryptionKey) return page('微信连接未配置', '管理员尚未完成微信开放平台配置。');

  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.search = new URLSearchParams({appid:appId,secret,code,grant_type:'authorization_code'}).toString();
  const token = await fetch(tokenUrl).then(r=>r.json<TokenResponse>());
  if (!token.access_token || !token.openid || !token.refresh_token) return page('微信连接失败', `微信授权未完成（${token.errcode ?? 'unknown'}），请重新扫码。`);
  const profileUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  profileUrl.search = new URLSearchParams({access_token:token.access_token,openid:token.openid,lang:'zh_CN'}).toString();
  const profile = await fetch(profileUrl).then(r=>r.json<UserResponse>());
  if (!profile.openid) return page('微信连接失败', `无法读取微信账号资料（${profile.errcode ?? 'unknown'}）。`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.openid)));
  const id = `wx-${Array.from(digest.slice(0,10), byte=>byte.toString(16).padStart(2,'0')).join('')}`;
  const encryptedRefreshToken = await encrypt(token.refresh_token, encryptionKey);
  const nickname = profile.nickname?.trim() || '微信用户';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO wechat_accounts (id,nickname,email,openid,unionid,avatar_color,status,refresh_token_encrypted,created_at,last_synced_at) VALUES (?,?,?,?,?,'#17b26a','online',?,?,?) ON CONFLICT(openid) DO UPDATE SET nickname=excluded.nickname,unionid=excluded.unionid,status='online',refresh_token_encrypted=excluded.refresh_token_encrypted,last_synced_at=excluded.last_synced_at`).bind(id,nickname,null,token.openid,token.unionid ?? profile.unionid ?? null,encryptedRefreshToken,Date.now(),Date.now()),
    env.DB.prepare("UPDATE qr_sessions SET status = 'confirmed' WHERE id = ?").bind(session.id),
  ]);
  return page('微信连接成功', '账号已经添加到云邮盒，可以返回电脑继续绑定邮箱。', true);
}

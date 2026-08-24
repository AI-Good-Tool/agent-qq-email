import { env } from 'cloudflare:workers';
import { ensureDatabase } from '../../../db/bootstrap';

export async function GET(request: Request) {
  const backend = process.env.AGENT_MAIL_BACKEND_URL;
  if (backend) {
    try {
      const response = await fetch(new URL('/api/dashboard', backend));
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
  const db = env.DB;
  await ensureDatabase(db);
  const url = new URL(request.url);
  const account = url.searchParams.get('account');
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q')?.trim();
  const clauses:string[]=[];
  const values:unknown[]=[];
  if (account && account !== 'all') { clauses.push('e.wechat_account_id = ?'); values.push(account); }
  if (category && category !== 'all') { clauses.push('e.category = ?'); values.push(category); }
  if (status === 'unread') clauses.push('e.is_read = 0');
  if (status === 'starred') clauses.push('e.is_starred = 1');
  if (search) { clauses.push('(e.sender_name LIKE ? OR e.subject LIKE ? OR e.preview LIKE ?)'); const pattern=`%${search}%`; values.push(pattern,pattern,pattern); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const shanghaiDayStart = Math.floor((Date.now() + 8 * 60 * 60 * 1000) / 86_400_000) * 86_400_000 - 8 * 60 * 60 * 1000;
  const [accountResult,emailResult,stats] = await Promise.all([
    db.prepare(`SELECT a.id, a.nickname AS name, a.email, a.avatar_color AS color, a.status, COUNT(CASE WHEN e.is_read = 0 THEN 1 END) AS unread FROM wechat_accounts a LEFT JOIN emails e ON e.wechat_account_id = a.id GROUP BY a.id ORDER BY a.created_at`).all(),
    db.prepare(`SELECT e.id, e.sender_name AS sender, e.subject, e.preview, e.wechat_account_id AS accountId, e.category, e.received_at AS receivedAt, e.is_read AS isRead, e.is_starred AS isStarred FROM emails e ${where} ORDER BY e.received_at DESC LIMIT 200`).bind(...values).all(),
    db.prepare('SELECT COUNT(*) AS total, COUNT(CASE WHEN is_read = 0 THEN 1 END) AS unread, COUNT(CASE WHEN received_at >= ? THEN 1 END) AS today, (SELECT COUNT(*) FROM wechat_accounts) AS accounts FROM emails').bind(shanghaiDayStart).first(),
  ]);
  return Response.json({ accounts:accountResult.results, emails:emailResult.results, stats });
}

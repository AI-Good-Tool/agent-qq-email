const accountSeed = [
  ['wx-lin','林墨 · 工作号','linmo@wechat.com','#20b26b'],
  ['wx-life','林墨 · 生活号','molin@foxmail.com','#6e7ed8'],
  ['wx-team','星野团队','hello@xingye.cn','#e79a3b'],
] as const;

const emailSeed = [
  ['mail-1','wx-lin','张宁','zhangning@example.com','产品周会纪要与本周待办','附件中是今天讨论的需求优先级，请大家在周四前确认…','工作',0,1],
  ['mail-2','wx-lin','Figma','notifications@figma.com','You have 6 new comments','Mia and 3 others left comments in “Mobile dashboard”…','通知',0,0],
  ['mail-3','wx-life','招商银行','notice@cmbchina.com','您的八月信用卡电子账单','本期应还金额 ¥4,281.70，还款日为 2026 年 9 月 9 日…','账单',0,0],
  ['mail-4','wx-team','Notion','team@notion.so','Workspace activity summary','Here is what your team accomplished this week in 星野设计…','订阅',1,0],
  ['mail-5','wx-team','陈屿','chenyu@example.com','Re: 秋季发布会视觉方案','第二版的色彩方向很好，我在源文件里补充了三个修改建议…','工作',1,1],
  ['mail-6','wx-life','少数派','newsletter@sspai.com','本周效率工具精选 Vol. 128','本周我们体验了 12 款新工具，这是最值得关注的 5 款…','订阅',1,0],
  ['mail-7','wx-lin','腾讯企业邮','security@exmail.qq.com','安全提醒：新增登录设备','您的邮箱于上海市在一台新设备上登录，如非本人操作…','通知',1,0],
  ['mail-8','wx-lin','王安','wangan@example.com','项目报价单已更新','已经按昨晚确认的范围更新报价和排期，请查收附件…','工作',1,0],
] as const;

export async function ensureDatabase(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS wechat_accounts (id TEXT PRIMARY KEY NOT NULL, nickname TEXT NOT NULL, email TEXT NOT NULL, avatar_color TEXT DEFAULT '#17b26a' NOT NULL, status TEXT DEFAULT 'online' NOT NULL, refresh_token_encrypted TEXT, created_at INTEGER NOT NULL, last_synced_at INTEGER)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wechat_accounts_email ON wechat_accounts(email)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wechat_accounts_status ON wechat_accounts(status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS emails (id TEXT PRIMARY KEY NOT NULL, wechat_account_id TEXT NOT NULL REFERENCES wechat_accounts(id) ON DELETE CASCADE, sender_name TEXT NOT NULL, sender_address TEXT, subject TEXT NOT NULL, preview TEXT DEFAULT '' NOT NULL, category TEXT DEFAULT '通知' NOT NULL, received_at INTEGER NOT NULL, is_read INTEGER DEFAULT 0 NOT NULL, is_starred INTEGER DEFAULT 0 NOT NULL, raw_message_id TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_account_received ON emails(wechat_account_id, received_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails(is_read, received_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS qr_sessions (id TEXT PRIMARY KEY NOT NULL, state TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'pending' NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`),
  ]);

  const existing = await db.prepare('SELECT COUNT(*) AS count FROM wechat_accounts').first<{ count:number }>();
  if ((existing?.count ?? 0) > 0) return;
  const now = Date.now();
  await db.batch(accountSeed.map(row => db.prepare('INSERT INTO wechat_accounts (id,nickname,email,avatar_color,status,created_at,last_synced_at) VALUES (?,?,?,?,?,?,?)').bind(row[0],row[1],row[2],row[3],'online',now,now)));
  await db.batch(emailSeed.map((row,index) => db.prepare('INSERT INTO emails (id,wechat_account_id,sender_name,sender_address,subject,preview,category,received_at,is_read,is_starred) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(row[0],row[1],row[2],row[3],row[4],row[5],row[6],now-index*36_000_000,row[7],row[8])));
  await db.prepare('PRAGMA optimize').run();
}

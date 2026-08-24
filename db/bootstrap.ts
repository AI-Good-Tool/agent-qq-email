export async function ensureDatabase(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS wechat_accounts (id TEXT PRIMARY KEY NOT NULL, nickname TEXT NOT NULL, email TEXT, openid TEXT UNIQUE NOT NULL, unionid TEXT, avatar_color TEXT DEFAULT '#17b26a' NOT NULL, status TEXT DEFAULT 'online' NOT NULL, refresh_token_encrypted TEXT, created_at INTEGER NOT NULL, last_synced_at INTEGER)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wechat_accounts_email ON wechat_accounts(email)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wechat_accounts_openid ON wechat_accounts(openid)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wechat_accounts_status ON wechat_accounts(status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS emails (id TEXT PRIMARY KEY NOT NULL, wechat_account_id TEXT NOT NULL REFERENCES wechat_accounts(id) ON DELETE CASCADE, sender_name TEXT NOT NULL, sender_address TEXT, subject TEXT NOT NULL, preview TEXT DEFAULT '' NOT NULL, category TEXT DEFAULT '通知' NOT NULL, received_at INTEGER NOT NULL, is_read INTEGER DEFAULT 0 NOT NULL, is_starred INTEGER DEFAULT 0 NOT NULL, raw_message_id TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_account_received ON emails(wechat_account_id, received_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_unread ON emails(is_read, received_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS qr_sessions (id TEXT PRIMARY KEY NOT NULL, state TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'pending' NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`),
  ]);
  await db.prepare('PRAGMA optimize').run();
}

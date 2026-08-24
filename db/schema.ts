import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const wechatAccounts = sqliteTable('wechat_accounts', {
  id: text('id').primaryKey(), nickname: text('nickname').notNull(), email: text('email'),
  openid: text('openid').notNull(), unionid: text('unionid'),
  avatarColor: text('avatar_color').notNull().default('#17b26a'),
  status: text('status', { enum: ['online','offline','expired'] }).notNull().default('online'),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
}, table => [uniqueIndex('idx_wechat_accounts_email').on(table.email), uniqueIndex('idx_wechat_accounts_openid').on(table.openid), index('idx_wechat_accounts_status').on(table.status)]);

export const emails = sqliteTable('emails', {
  id: text('id').primaryKey(),
  wechatAccountId: text('wechat_account_id').notNull().references(() => wechatAccounts.id, { onDelete: 'cascade' }),
  senderName: text('sender_name').notNull(), senderAddress: text('sender_address'), subject: text('subject').notNull(),
  preview: text('preview').notNull().default(''),
  category: text('category', { enum: ['工作','订阅','账单','通知'] }).notNull().default('通知'),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false), rawMessageId: text('raw_message_id'),
}, table => [index('idx_emails_account_received').on(table.wechatAccountId, table.receivedAt), index('idx_emails_received').on(table.receivedAt), index('idx_emails_unread').on(table.isRead, table.receivedAt), index('idx_emails_category').on(table.category)]);

export const qrSessions = sqliteTable('qr_sessions', {
  id: text('id').primaryKey(), state: text('state').notNull().unique(),
  status: text('status', { enum: ['pending','scanned','confirmed','expired'] }).notNull().default('pending'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

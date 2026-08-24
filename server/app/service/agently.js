'use strict';

const { Service } = require('egg');
const { execFile, spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { mkdirSync } = require('fs');
const { dirname } = require('path');
const { promisify } = require('util');
const { DatabaseSync } = require('node:sqlite');

const execFileAsync = promisify(execFile);
const AUTH_LIFETIME_MS = 5 * 60 * 1000;
const COLORS = [ '#17b26a', '#6e7ed8', '#e79a3b', '#2e9e89', '#a66dd4' ];

class AgentlyService extends Service {
  cliEnvironment(workspace = this.config.agently.workspace) {
    return { ...process.env, AGENTLY_WORKSPACE: workspace };
  }

  async run(args, workspace = this.config.agently.workspace, timeout = this.config.agently.timeout) {
    const { stdout } = await execFileAsync(this.config.agently.cliPath, args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: this.cliEnvironment(workspace),
    });
    return JSON.parse(stdout.trim());
  }

  async listAllMessages(workspace, folder = 'inbox') {
    const messages = [];
    const seenCursors = new Set();
    let cursor;
    do {
      const args = [ 'message', '+list', '--limit', '50', '--dir', folder ];
      if (cursor) args.push('--cursor', cursor);
      const result = await this.run(args, workspace);
      if (!result.ok) throw new Error('Agent Mail CLI returned an unsuccessful response.');
      messages.push(...(result.data?.data || []));
      const pagination = result.data?.pagination;
      const nextCursor = pagination?.has_more ? pagination.next_cursor : null;
      if (!nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
    return messages;
  }

  database() {
    if (this.app.agentMailDatabase) return this.app.agentMailDatabase;
    const file = this.config.agently.databasePath;
    mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS mail_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_synced_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS mail_auth_workspaces (
        workspace TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_synced_at INTEGER,
        FOREIGN KEY(connection_id) REFERENCES mail_connections(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS mail_aliases (
        workspace TEXT NOT NULL,
        alias_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        is_primary INTEGER NOT NULL,
        synced_at INTEGER NOT NULL,
        PRIMARY KEY(workspace, alias_id)
      );
      CREATE TABLE IF NOT EXISTS mail_messages (
        workspace TEXT NOT NULL,
        message_id TEXT NOT NULL,
        folder TEXT NOT NULL,
        alias_id TEXT NOT NULL,
        sender_name TEXT,
        sender_email TEXT,
        recipients_json TEXT NOT NULL,
        subject TEXT,
        snippet TEXT,
        received_at TEXT,
        is_read INTEGER NOT NULL,
        has_attachments INTEGER NOT NULL,
        synced_at INTEGER NOT NULL,
        PRIMARY KEY(workspace, message_id, folder)
      );
      CREATE TABLE IF NOT EXISTS message_stars (
        workspace TEXT NOT NULL,
        message_id TEXT NOT NULL,
        starred_at INTEGER NOT NULL,
        PRIMARY KEY(workspace, message_id)
      );
      CREATE TABLE IF NOT EXISTS mail_alias_labels (
        workspace TEXT NOT NULL,
        alias_id TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(workspace, alias_id, label)
      );
      CREATE INDEX IF NOT EXISTS idx_mail_aliases_connection ON mail_aliases(connection_id, email);
      CREATE INDEX IF NOT EXISTS idx_mail_messages_received ON mail_messages(folder, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mail_alias_labels_label ON mail_alias_labels(label);
    `);
    this.app.agentMailDatabase = db;
    return db;
  }

  ensureInitialWorkspace() {
    const db = this.database();
    if (db.prepare('SELECT COUNT(*) AS count FROM mail_auth_workspaces').get().count) return;
    const now = Date.now();
    db.prepare('INSERT INTO mail_connections (id, name, created_at) VALUES (?, ?, ?)')
      .run('conn_codex', '已连接微信', now);
    db.prepare('INSERT INTO mail_auth_workspaces (workspace, connection_id, created_at) VALUES (?, ?, ?)')
      .run(this.config.agently.workspace, 'conn_codex', now);
  }

  resolveAlias(message, aliases) {
    const primary = aliases.find(item => item.is_primary) || aliases[0];
    const recipient = (message.to || []).find(item => aliases.some(alias => alias.email === item.email));
    return aliases.find(alias => alias.email === recipient?.email) || primary;
  }

  saveWorkspaceSnapshot(workspace, aliases, messages, folder) {
    const db = this.database();
    const workspaceRow = db.prepare('SELECT connection_id FROM mail_auth_workspaces WHERE workspace = ?').get(workspace);
    if (!workspaceRow) throw new Error('授权工作区不存在。');
    const connectionId = workspaceRow.connection_id;
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM mail_aliases WHERE workspace = ?').run(workspace);
      db.prepare('DELETE FROM mail_messages WHERE workspace = ? AND folder = ?').run(workspace, folder);
      const addAlias = db.prepare(`
        INSERT INTO mail_aliases (workspace, alias_id, connection_id, email, name, is_primary, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const alias of aliases) {
        addAlias.run(workspace, alias.alias_id, connectionId, alias.email,
          alias.name || alias.email, alias.is_primary ? 1 : 0, now);
      }
      const addMessage = db.prepare(`
        INSERT INTO mail_messages (
          workspace, message_id, folder, alias_id, sender_name, sender_email,
          recipients_json, subject, snippet, received_at, is_read, has_attachments, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const message of messages) {
        const alias = this.resolveAlias(message, aliases);
        addMessage.run(workspace, message.message_id, folder, alias?.alias_id || '',
          message.from?.name || message.from?.email || '未知发件人', message.from?.email || '',
          JSON.stringify(message.to || []), message.subject || '(无主题)', message.snippet || '',
          message.created_at, message.is_read ? 1 : 0, message.has_attachments ? 1 : 0, now);
      }
      const primary = aliases.find(item => item.is_primary) || aliases[0];
      if (primary) {
        db.prepare('UPDATE mail_connections SET name = ?, last_synced_at = ? WHERE id = ?')
          .run(primary.name || primary.email.split('@')[0], now, connectionId);
      }
      db.prepare('UPDATE mail_auth_workspaces SET last_synced_at = ? WHERE workspace = ?').run(now, workspace);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async syncWorkspace(workspace, folder = 'inbox') {
    const [ meResult, messages ] = await Promise.all([
      this.run([ '+me' ], workspace),
      this.listAllMessages(workspace, folder),
    ]);
    if (!meResult.ok) throw new Error('Agent Mail CLI returned an unsuccessful response.');
    this.saveWorkspaceSnapshot(workspace, meResult.data?.aliases || [], messages, folder);
  }

  buildDashboard(folder, source, selectedAccountId = 'all') {
    const db = this.database();
    const connectionRows = db.prepare('SELECT * FROM mail_connections ORDER BY created_at').all();
    const aliasRows = db.prepare(`
      SELECT a.*, COALESCE(SUM(CASE WHEN m.is_read = 0 AND m.folder = 'inbox' THEN 1 ELSE 0 END), 0) AS unread
      FROM mail_aliases a
      LEFT JOIN mail_messages m ON m.workspace = a.workspace AND m.alias_id = a.alias_id
      GROUP BY a.workspace, a.alias_id
      ORDER BY a.connection_id, a.is_primary DESC, a.email
    `).all();
    const stars = new Set(db.prepare('SELECT workspace, message_id FROM message_stars').all()
      .map(item => `${item.workspace}:${item.message_id}`));
    const aliasLabels = new Map();
    for (const item of db.prepare('SELECT workspace, alias_id, label FROM mail_alias_labels ORDER BY created_at, label').all()) {
      const key = `${item.workspace}:${item.alias_id}`;
      if (!aliasLabels.has(key)) aliasLabels.set(key, []);
      aliasLabels.get(key).push(item.label);
    }
    const selectedAlias = selectedAccountId === 'all' ? null : aliasRows.find(item => `${item.workspace}:${item.alias_id}` === selectedAccountId);
    const messageRows = selectedAlias ? db.prepare(`
      SELECT * FROM mail_messages WHERE folder = ? AND workspace = ? AND alias_id = ? ORDER BY received_at DESC
    `).all(folder, selectedAlias.workspace, selectedAlias.alias_id) : db.prepare(`
      SELECT * FROM mail_messages WHERE folder = ? ORDER BY received_at DESC
    `).all(folder);

    const accounts = aliasRows.map((item, index) => ({
      id: `${item.workspace}:${item.alias_id}`,
      aliasId: item.alias_id,
      workspace: item.workspace,
      connectionId: item.connection_id,
      name: item.name || item.email,
      email: item.email,
      unread: Number(item.unread),
      color: COLORS[index % COLORS.length],
      status: source === 'agently-cli' ? 'online' : 'cached',
      labels: aliasLabels.get(`${item.workspace}:${item.alias_id}`) || [],
    }));
    const connections = connectionRows.map((item, index) => {
      const linked = accounts.filter(account => account.connectionId === item.id);
      return {
        id: item.id,
        name: item.name,
        aliasCount: linked.length,
        unread: linked.reduce((sum, account) => sum + account.unread, 0),
        color: COLORS[index % COLORS.length],
        status: linked.some(account => account.status === 'online') ? 'online' : 'cached',
        aliases: linked,
      };
    });
    const emails = messageRows.map(item => ({
      id: `${item.workspace}:${item.message_id}`,
      messageId: item.message_id,
      workspace: item.workspace,
      connectionId: accounts.find(account => account.workspace === item.workspace)?.connectionId || '',
      sender: item.sender_name || item.sender_email || '未知发件人',
      senderAddress: item.sender_email || '',
      subject: item.subject || '(无主题)',
      preview: item.snippet || '',
      accountId: `${item.workspace}:${item.alias_id}`,
      category: folder === 'sent' ? '已发送' : folder === 'trash' ? '垃圾箱' : '通知',
      receivedAt: new Date(item.received_at).getTime(),
      isRead: item.is_read ? 1 : 0,
      isStarred: stars.has(`${item.workspace}:${item.message_id}`) ? 1 : 0,
      hasAttachments: Boolean(item.has_attachments),
    }));
    const contactMap = new Map();
    for (const row of db.prepare("SELECT sender_name, sender_email FROM mail_messages WHERE folder = 'inbox' AND sender_email != '' ORDER BY received_at DESC").all()) {
      if (!contactMap.has(row.sender_email)) contactMap.set(row.sender_email, { name: row.sender_name || row.sender_email, email: row.sender_email });
    }
    const today = new Date().toDateString();
    return {
      connections,
      accounts,
      emails,
      contacts: Array.from(contactMap.values()),
      stats: {
        total: emails.length,
        unread: emails.filter(item => !item.isRead).length,
        accounts: connections.length,
        aliases: accounts.length,
        today: emails.filter(item => new Date(item.receivedAt).toDateString() === today).length,
      },
      source,
      folder,
      selectedAccountId: selectedAlias ? `${selectedAlias.workspace}:${selectedAlias.alias_id}` : 'all',
    };
  }

  async dashboard(folder = 'inbox', requestedAccount = 'default') {
    if (![ 'inbox', 'sent', 'trash' ].includes(folder)) folder = 'inbox';
    this.ensureInitialWorkspace();
    const db = this.database();
    const workspaces = db.prepare('SELECT workspace FROM mail_auth_workspaces ORDER BY created_at').all();
    let selectedAccountId = requestedAccount || 'default';
    let selectedAlias = selectedAccountId === 'all' ? null : db.prepare(`
      SELECT workspace, alias_id FROM mail_aliases
      WHERE workspace || ':' || alias_id = ?
    `).get(selectedAccountId);
    if (selectedAccountId !== 'all' && !selectedAlias) {
      selectedAlias = db.prepare(`
        SELECT workspace, alias_id FROM mail_aliases
        ORDER BY connection_id, is_primary DESC, email LIMIT 1
      `).get();
      selectedAccountId = selectedAlias ? `${selectedAlias.workspace}:${selectedAlias.alias_id}` : 'default';
    }
    const workspacesToSync = selectedAccountId === 'all' ? workspaces : [
      { workspace:selectedAlias?.workspace || workspaces[0]?.workspace },
    ].filter(item => item.workspace);
    const syncResults = await Promise.all(workspacesToSync.map(async item => {
      try {
        await this.syncWorkspace(item.workspace, folder);
        return true;
      } catch (error) {
        this.ctx.logger.warn('[agently] workspace %s sync failed: %s', item.workspace, error.message);
        return false;
      }
    }));
    const synced = syncResults.filter(Boolean).length;
    if (selectedAccountId === 'default') {
      selectedAlias = db.prepare(`
        SELECT workspace, alias_id FROM mail_aliases
        ORDER BY connection_id, is_primary DESC, email LIMIT 1
      `).get();
      selectedAccountId = selectedAlias ? `${selectedAlias.workspace}:${selectedAlias.alias_id}` : 'all';
    }
    const dashboard = this.buildDashboard(folder, synced ? 'agently-cli' : 'sqlite-cache', selectedAccountId);
    if (!synced && !dashboard.accounts.length) throw new Error('没有可用的 Agent Mail 授权。');
    return dashboard;
  }

  assertWorkspace(workspace) {
    if (!workspace || !this.database().prepare('SELECT 1 FROM mail_auth_workspaces WHERE workspace = ?').get(workspace)) {
      throw new Error('邮箱授权工作区不存在。');
    }
  }

  async readMessage(messageId, workspace) {
    if (!/^msg_[A-Za-z0-9_-]+$/.test(messageId)) throw new Error('无效的邮件标识。');
    this.assertWorkspace(workspace);
    const result = await this.run([ 'message', '+read', '--id', messageId ], workspace);
    if (!result.ok) throw new Error('Agent Mail CLI returned an unsuccessful response.');
    return { ...result.data, workspace, source: 'agently-cli' };
  }

  setStar(messageId, workspace, starred) {
    if (!/^msg_[A-Za-z0-9_-]+$/.test(messageId)) throw new Error('无效的邮件标识。');
    this.assertWorkspace(workspace);
    const db = this.database();
    if (starred) {
      db.prepare('INSERT OR REPLACE INTO message_stars (workspace, message_id, starred_at) VALUES (?, ?, ?)')
        .run(workspace, messageId, Date.now());
    } else {
      db.prepare('DELETE FROM message_stars WHERE workspace = ? AND message_id = ?').run(workspace, messageId);
    }
    return { ok: true, starred };
  }

  setAliasLabels(workspace, aliasId, labels) {
    this.assertWorkspace(workspace);
    const db = this.database();
    const alias = db.prepare('SELECT 1 FROM mail_aliases WHERE workspace = ? AND alias_id = ?').get(workspace, aliasId);
    if (!alias) throw new Error('邮箱账号不存在。');
    const normalized = Array.from(new Set((Array.isArray(labels) ? labels : [])
      .map(label => String(label).trim())
      .filter(Boolean)));
    if (normalized.length > 8) throw new Error('每个邮箱最多设置 8 个标签。');
    if (normalized.some(label => label.length > 16)) throw new Error('单个标签不能超过 16 个字符。');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM mail_alias_labels WHERE workspace = ? AND alias_id = ?').run(workspace, aliasId);
      const insert = db.prepare('INSERT INTO mail_alias_labels (workspace, alias_id, label, created_at) VALUES (?, ?, ?, ?)');
      const now = Date.now();
      for (const label of normalized) insert.run(workspace, aliasId, label, now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { ok: true, labels: normalized };
  }

  async mailAction(payload) {
    const { action, workspace, body, confirmationToken } = payload;
    this.assertWorkspace(workspace);
    let args;
    if (action === 'trash' || action === 'delete') {
      if (!/^msg_[A-Za-z0-9_-]+$/.test(payload.messageId || '')) throw new Error('无效的邮件标识。');
      args = [ 'message', action === 'trash' ? '+trash' : '+delete', '--id', payload.messageId ];
    } else if (action === 'send') {
      if (!body?.trim()) throw new Error('邮件正文不能为空。');
      const recipients = Array.isArray(payload.to) ? payload.to : String(payload.to || '').split(/[;,\s]+/).filter(Boolean);
      if (!recipients.length || !payload.subject?.trim()) throw new Error('请填写收件人和主题。');
      args = [ 'message', '+send' ];
      for (const recipient of recipients) args.push('--to', recipient);
      args.push('--subject', payload.subject.trim(), '--body', body.trim(), '--body-format', 'plain');
    } else if (action === 'reply') {
      if (!body?.trim()) throw new Error('邮件正文不能为空。');
      if (!/^msg_[A-Za-z0-9_-]+$/.test(payload.messageId || '')) throw new Error('无效的回复邮件标识。');
      args = [ 'message', '+reply', '--id', payload.messageId, '--body', body.trim(), '--body-format', 'plain' ];
    } else {
      throw new Error('不支持的邮件操作。');
    }
    if (confirmationToken) args.push('--confirmation-token', confirmationToken);
    return this.run(args, workspace);
  }

  async registerAuthWorkspace(workspace, targetConnectionId) {
    const db = this.database();
    let connectionId = targetConnectionId;
    if (connectionId && !db.prepare('SELECT 1 FROM mail_connections WHERE id = ?').get(connectionId)) {
      throw new Error('目标微信账号不存在。');
    }
    if (!connectionId) {
      connectionId = `conn_${randomUUID()}`;
      db.prepare('INSERT INTO mail_connections (id, name, created_at) VALUES (?, ?, ?)')
        .run(connectionId, '新微信账号', Date.now());
    }
    db.prepare(`
      INSERT OR REPLACE INTO mail_auth_workspaces (workspace, connection_id, created_at)
      VALUES (?, ?, ?)
    `).run(workspace, connectionId, Date.now());
    try {
      await this.syncWorkspace(workspace, 'inbox');
    } catch (error) {
      db.prepare('DELETE FROM mail_auth_workspaces WHERE workspace = ?').run(workspace);
      if (!targetConnectionId) db.prepare('DELETE FROM mail_connections WHERE id = ?').run(connectionId);
      throw error;
    }
  }

  async startAuth(targetConnectionId = null) {
    const now = Date.now();
    for (const [ id, item ] of this.app.authSessions) {
      if (item.status !== 'pending' && item.status !== 'syncing' && now - item.createdAt > AUTH_LIFETIME_MS) this.app.authSessions.delete(id);
    }
    const active = Array.from(this.app.authSessions.values()).find(item => [ 'pending', 'syncing' ].includes(item.status));
    if (active) return active;
    const session = {
      id: randomUUID(),
      workspace: `yunyouhe-${randomUUID()}`,
      targetConnectionId,
      status: 'pending',
      authUrl: null,
      error: null,
      createdAt: now,
      expiresAt: now + AUTH_LIFETIME_MS,
      child: null,
      expiryTimer: null,
    };
    this.app.authSessions.set(session.id, session);
    const child = spawn(this.config.agently.cliPath, [ 'auth', 'login' ], {
      env: this.cliEnvironment(session.workspace),
      stdio: [ 'ignore', 'pipe', 'pipe' ],
    });
    session.child = child;
    const consume = chunk => {
      const match = chunk.toString().match(/https:\/\/agent\.qq\.com\/[^\s\x1b]+/);
      if (match && !session.authUrl) session.authUrl = match[0];
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.on('error', error => { session.status = 'failed'; session.error = error.message; });
    child.on('exit', async code => {
      if (session.expiryTimer) clearTimeout(session.expiryTimer);
      session.child = null;
      if (session.status !== 'pending') return;
      if (code !== 0) {
        session.status = 'failed';
        session.error = `agently-cli exited with ${code}`;
        return;
      }
      session.status = 'syncing';
      try {
        await this.registerAuthWorkspace(session.workspace, session.targetConnectionId);
        session.status = 'confirmed';
      } catch (error) {
        session.status = 'failed';
        session.error = error.message;
      }
    });
    session.expiryTimer = setTimeout(() => {
      if (session.status !== 'pending') return;
      session.status = 'expired';
      session.error = '授权二维码已过期。';
      if (session.child && !session.child.killed) session.child.kill();
    }, AUTH_LIFETIME_MS);
    session.expiryTimer.unref();
    for (let attempt = 0; attempt < 30 && !session.authUrl && session.status === 'pending'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!session.authUrl && session.status === 'pending') {
      child.kill();
      session.status = 'failed';
      session.error = 'CLI did not return an authorization URL.';
    }
    return session;
  }
}

module.exports = AgentlyService;

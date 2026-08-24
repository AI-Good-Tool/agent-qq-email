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

class AgentlyService extends Service {
  async run(args, timeout = this.config.agently.timeout) {
    const { stdout } = await execFileAsync(this.config.agently.cliPath, args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, AGENTLY_WORKSPACE: this.config.agently.workspace },
    });
    return JSON.parse(stdout.trim());
  }

  async listAllMessages() {
    const messages = [];
    const seenCursors = new Set();
    let cursor;

    do {
      const args = [ 'message', '+list', '--limit', '50' ];
      if (cursor) args.push('--cursor', cursor);
      const result = await this.run(args);
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
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        is_primary INTEGER NOT NULL,
        synced_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        sender_name TEXT,
        sender_email TEXT,
        subject TEXT,
        snippet TEXT,
        received_at TEXT,
        is_read INTEGER NOT NULL,
        has_attachments INTEGER NOT NULL,
        synced_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_account_received
        ON messages(account_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_unread
        ON messages(is_read, received_at DESC);
    `);
    this.app.agentMailDatabase = db;
    return db;
  }

  resolveAccount(message, aliases, primary) {
    const recipient = (message.to || []).find(item => aliases.some(alias => alias.email === item.email));
    return aliases.find(alias => alias.email === recipient?.email) || primary;
  }

  toDashboard(aliases, messages, source) {
    const primary = aliases.find(item => item.is_primary) || aliases[0];
    const accounts = aliases.map((item, index) => ({
      id: item.alias_id,
      name: item.name || item.email,
      email: item.email,
      unread: messages.filter(message => !message.is_read
        && this.resolveAccount(message, aliases, primary)?.alias_id === item.alias_id).length,
      color: [ '#17b26a', '#6e7ed8', '#e79a3b', '#2e9e89' ][index % 4],
      status: source === 'agently-cli' ? 'online' : 'cached',
    }));
    const emails = messages.map(item => ({
      id: item.message_id,
      sender: item.from?.name || item.from?.email || '未知发件人',
      senderAddress: item.from?.email || '',
      subject: item.subject || '(无主题)',
      preview: item.snippet || '',
      accountId: this.resolveAccount(item, aliases, primary)?.alias_id || '',
      category: '通知',
      receivedAt: new Date(item.created_at).getTime(),
      isRead: item.is_read ? 1 : 0,
      isStarred: 0,
      hasAttachments: Boolean(item.has_attachments),
    }));
    const today = new Date().toDateString();
    return {
      accounts,
      emails,
      stats: {
        total: emails.length,
        unread: emails.filter(item => !item.isRead).length,
        accounts: accounts.length,
        today: emails.filter(item => new Date(item.receivedAt).toDateString() === today).length,
      },
      source,
    };
  }

  saveSnapshot(aliases, messages) {
    const db = this.database();
    const primary = aliases.find(item => item.is_primary) || aliases[0];
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM accounts; DELETE FROM messages;');
      const addAccount = db.prepare(`
        INSERT INTO accounts (id, email, name, is_primary, synced_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const item of aliases) {
        addAccount.run(item.alias_id, item.email, item.name || item.email, item.is_primary ? 1 : 0, now);
      }

      const addMessage = db.prepare(`
        INSERT INTO messages (
          id, account_id, sender_name, sender_email, subject, snippet,
          received_at, is_read, has_attachments, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of messages) {
        const alias = this.resolveAccount(item, aliases, primary);
        addMessage.run(
          item.message_id,
          alias?.alias_id || '',
          item.from?.name || item.from?.email || '未知发件人',
          item.from?.email || '',
          item.subject || '(无主题)',
          item.snippet || '',
          item.created_at,
          item.is_read ? 1 : 0,
          item.has_attachments ? 1 : 0,
          now,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  loadSnapshot() {
    const db = this.database();
    const accountRows = db.prepare('SELECT * FROM accounts ORDER BY is_primary DESC, email').all();
    if (!accountRows.length) return null;
    const aliases = accountRows.map(item => ({
      alias_id: item.id,
      email: item.email,
      name: item.name,
      is_primary: Boolean(item.is_primary),
    }));
    const messages = db.prepare('SELECT * FROM messages ORDER BY received_at DESC').all().map(item => ({
      message_id: item.id,
      from: { name: item.sender_name, email: item.sender_email },
      to: [ { email: aliases.find(alias => alias.alias_id === item.account_id)?.email || '' } ],
      subject: item.subject,
      snippet: item.snippet,
      created_at: item.received_at,
      is_read: Boolean(item.is_read),
      has_attachments: Boolean(item.has_attachments),
    }));
    return this.toDashboard(aliases, messages, 'sqlite-cache');
  }

  async dashboard() {
    try {
      const [ meResult, messages ] = await Promise.all([ this.run([ '+me' ]), this.listAllMessages() ]);
      if (!meResult.ok) throw new Error('Agent Mail CLI returned an unsuccessful response.');
      const aliases = meResult.data?.aliases || [];
      this.saveSnapshot(aliases, messages);
      return this.toDashboard(aliases, messages, 'agently-cli');
    } catch (error) {
      const cached = this.loadSnapshot();
      if (cached) return cached;
      throw error;
    }
  }

  async startAuth() {
    const now = Date.now();
    for (const [ id, item ] of this.app.authSessions) {
      if (item.status !== 'pending' && now - item.createdAt > AUTH_LIFETIME_MS) {
        this.app.authSessions.delete(id);
      }
    }

    const active = Array.from(this.app.authSessions.values()).find(item => item.status === 'pending');
    if (active) return active;

    const session = {
      id: randomUUID(),
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
      env: { ...process.env, AGENTLY_WORKSPACE: this.config.agently.workspace },
      stdio: [ 'ignore', 'pipe', 'pipe' ],
    });
    session.child = child;
    const consume = chunk => {
      const match = chunk.toString().match(/https:\/\/agent\.qq\.com\/[^\s\x1b]+/);
      if (match && !session.authUrl) session.authUrl = match[0];
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.on('error', error => {
      session.status = 'failed';
      session.error = error.message;
    });
    child.on('exit', code => {
      if (session.expiryTimer) clearTimeout(session.expiryTimer);
      session.child = null;
      if (session.status !== 'pending') return;
      session.status = code === 0 ? 'confirmed' : 'failed';
      if (code !== 0) session.error = `agently-cli exited with ${code}`;
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

"""SQLite 数据层。表结构与旧版 Egg.js 服务保持一致，可直接沿用旧数据库文件。"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

LABEL_COLORS = ["#c96442", "#5a7ea8", "#7f8f4e", "#a8677f", "#c08a3e", "#4f8f88", "#8a6fb0", "#6b6a65"]

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS message_reads (
  workspace TEXT NOT NULL,
  message_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY(workspace, message_id)
);
CREATE TABLE IF NOT EXISTS mail_labels (
  name TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


class Database:
    """单连接 + 自动提交模式。所有调用都在事件循环线程中执行，事务用 transaction() 显式开启。"""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._conn: Optional[sqlite3.Connection] = None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self.path), isolation_level=None, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.executescript(SCHEMA)
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(mail_auth_workspaces)")}
            if "status" not in columns:
                conn.execute("ALTER TABLE mail_auth_workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'online'")
            if "status_message" not in columns:
                conn.execute("ALTER TABLE mail_auth_workspaces ADD COLUMN status_message TEXT")
            if "checked_at" not in columns:
                conn.execute("ALTER TABLE mail_auth_workspaces ADD COLUMN checked_at INTEGER")
            # 旧版本的标签只存在于邮箱上，补建标签定义并分配颜色
            existing = conn.execute("SELECT COUNT(*) FROM mail_labels").fetchone()[0]
            orphans = conn.execute(
                "SELECT label, MIN(created_at) AS created_at FROM mail_alias_labels "
                "WHERE label NOT IN (SELECT name FROM mail_labels) GROUP BY label ORDER BY MIN(created_at), label"
            ).fetchall()
            for index, row in enumerate(orphans):
                conn.execute("INSERT OR IGNORE INTO mail_labels (name, color, created_at) VALUES (?, ?, ?)",
                             (row["label"], LABEL_COLORS[(existing + index) % len(LABEL_COLORS)], row["created_at"]))
            self._conn = conn
        return self._conn

    def all(self, sql: str, *params) -> list:
        return self.conn.execute(sql, params).fetchall()

    def one(self, sql: str, *params) -> Optional[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchone()

    def run(self, sql: str, *params) -> sqlite3.Cursor:
        return self.conn.execute(sql, params)

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self.conn
        if conn.in_transaction:
            yield conn
            return
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        conn.execute("COMMIT")

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

"""封装腾讯 Agent Mail 官方 agently-cli：同步邮件、读取正文、收发删除、扫码授权。"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .config import Settings
from .db import LABEL_COLORS, Database

log = logging.getLogger("yunyouhe.agently")

AUTH_LIFETIME_SECONDS = 5 * 60
COLORS = ["#c96442", "#5a7ea8", "#7f8f4e", "#a8677f", "#c08a3e", "#4f8f88"]
AUTH_EXPIRED_MESSAGE = "授权已失效，请重新扫码。"
FOLDERS = ("inbox", "sent", "trash")
MESSAGE_ID = re.compile(r"^msg_[A-Za-z0-9_-]+$")
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_LABELS_PER_ALIAS = 8
MAX_LABEL_LENGTH = 16
AUTH_URL = re.compile(r"https://agent\.qq\.com/[^\s\x1b\"'<>]+")


def now_ms() -> int:
    return int(time.time() * 1000)


def parse_json(text: str) -> Optional[dict]:
    try:
        value = json.loads((text or "").strip())
        return value if isinstance(value, dict) else None
    except ValueError:
        return None


def to_timestamp(value: Any) -> int:
    if not value:
        return 0
    if isinstance(value, (int, float)):
        return int(value if value > 10 ** 11 else value * 1000)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(text).timestamp() * 1000)
    except ValueError:
        return 0


def as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


class ServiceError(Exception):
    """可直接展示给用户的业务错误。"""

    def __init__(self, message: str, kind: str = "cli", status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.status = status


class AuthSession:
    def __init__(self, target_connection_id: Optional[str]) -> None:
        self.id = str(uuid.uuid4())
        self.workspace = f"yunyouhe-{uuid.uuid4()}"
        self.target_connection_id = target_connection_id
        self.status = "pending"
        self.auth_url: Optional[str] = None
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.expires_at = self.created_at + AUTH_LIFETIME_SECONDS
        self.process: Optional[asyncio.subprocess.Process] = None
        self.expiry_handle: Optional[asyncio.TimerHandle] = None
        self.task: Optional[asyncio.Task] = None

    def public(self) -> dict:
        return {
            "sessionId": self.id,
            "status": self.status,
            "authUrl": self.auth_url,
            "expiresAt": int(self.expires_at * 1000),
            "message": self.error,
        }

    def kill(self) -> None:
        if self.process and self.process.returncode is None:
            try:
                self.process.kill()
            except ProcessLookupError:
                pass


class AgentlyService:
    def __init__(self, settings: Settings, db: Database) -> None:
        self.settings = settings
        self.db = db
        self.auth_sessions: Dict[str, AuthSession] = {}

    # ---------- CLI ----------
    def cli_env(self, workspace: str) -> dict:
        env = dict(os.environ)
        env["AGENTLY_WORKSPACE"] = workspace
        return env

    async def run(self, args: List[str], workspace: str, timeout: Optional[int] = None) -> dict:
        try:
            proc = await asyncio.create_subprocess_exec(
                self.settings.cli_path, *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL,
                env=self.cli_env(workspace),
            )
        except (FileNotFoundError, PermissionError):
            raise ServiceError(f"找不到 agently-cli（{self.settings.cli_path}），请先在服务器安装官方 CLI。", status=503)
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout or self.settings.cli_timeout)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()
            raise ServiceError("Agent Mail CLI 响应超时，请稍后重试。", status=503)
        out = stdout.decode("utf-8", "replace")
        result = parse_json(out)
        if proc.returncode != 0:
            error = as_dict((result or {}).get("error"))
            kind = error.get("type") or "cli"
            message = error.get("message") or stderr.decode("utf-8", "replace").strip()[-300:] \
                or f"agently-cli 退出码 {proc.returncode}"
            if kind == "auth":
                message = AUTH_EXPIRED_MESSAGE
                self.mark_workspace(workspace, "expired", AUTH_EXPIRED_MESSAGE)
            raise ServiceError(message, kind=kind, status=503)
        if result is None:
            raise ServiceError("Agent Mail CLI 返回了无法解析的结果。", status=503)
        if result.get("ok") is False and as_dict(result.get("error")).get("type") == "auth":
            self.mark_workspace(workspace, "expired", AUTH_EXPIRED_MESSAGE)
            raise ServiceError(AUTH_EXPIRED_MESSAGE, kind="auth", status=503)
        return result

    def mark_workspace(self, workspace: str, status: str, message: Optional[str] = None) -> None:
        self.db.run(
            "UPDATE mail_auth_workspaces SET status = ?, status_message = ?, checked_at = ? "
            "WHERE workspace = ? AND status != 'removed'",
            status, message, now_ms(), workspace,
        )

    async def list_all_messages(self, workspace: str, folder: str) -> List[dict]:
        messages: List[dict] = []
        seen = set()
        cursor: Optional[str] = None
        while True:
            args = ["message", "+list", "--limit", "50", "--dir", folder]
            if cursor:
                args += ["--cursor", cursor]
            result = await self.run(args, workspace)
            if not result.get("ok"):
                raise ServiceError("Agent Mail CLI 返回了失败结果。", status=503)
            data = as_dict(result.get("data"))
            messages.extend(item for item in (data.get("data") or []) if isinstance(item, dict))
            pagination = as_dict(data.get("pagination"))
            next_cursor = pagination.get("next_cursor") if pagination.get("has_more") else None
            if not next_cursor or next_cursor in seen:
                break
            seen.add(next_cursor)
            cursor = next_cursor
        return messages

    # ---------- 工作区与快照 ----------
    def ensure_initial_workspace(self) -> None:
        if self.db.one("SELECT 1 FROM app_meta WHERE key = 'initial_workspace_seeded'"):
            return
        workspace = self.settings.initial_workspace
        if workspace and not self.db.one("SELECT COUNT(*) AS c FROM mail_auth_workspaces")["c"]:
            ts = now_ms()
            self.db.run("INSERT INTO mail_connections (id, name, created_at) VALUES (?, ?, ?)",
                        "conn_initial", "已连接微信", ts)
            self.db.run("INSERT INTO mail_auth_workspaces (workspace, connection_id, created_at) VALUES (?, ?, ?)",
                        workspace, "conn_initial", ts)
        self.db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initial_workspace_seeded', '1')")
        self.dedupe_workspaces()

    @staticmethod
    def resolve_alias(message: dict, aliases: List[dict]) -> Optional[dict]:
        if not aliases:
            return None
        primary = next((a for a in aliases if a.get("is_primary")), aliases[0])
        emails = {a.get("email") for a in aliases}
        recipient = next((r for r in (message.get("to") or []) if isinstance(r, dict) and r.get("email") in emails), None)
        if recipient:
            return next((a for a in aliases if a.get("email") == recipient.get("email")), primary)
        return primary

    def save_snapshot(self, workspace: str, aliases: List[dict], messages: List[dict], folder: str) -> None:
        row = self.db.one("SELECT connection_id, created_at FROM mail_auth_workspaces WHERE workspace = ?", workspace)
        if not row:
            raise ServiceError("授权工作区不存在。")
        connection_id = row["connection_id"]
        # 同一邮箱被更新的授权接管后，旧授权不再写入该邮箱，避免重新扫码后出现重复账号
        claimed = {r["email"] for r in self.db.all(
            "SELECT DISTINCT a.email FROM mail_aliases a JOIN mail_auth_workspaces w ON w.workspace = a.workspace "
            "WHERE a.workspace != ? AND w.status != 'removed' AND w.created_at > ?",
            workspace, row["created_at"],
        )}
        ts = now_ms()
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM mail_aliases WHERE workspace = ?", (workspace,))
            conn.execute("DELETE FROM mail_messages WHERE workspace = ? AND folder = ?", (workspace, folder))
            for alias in aliases:
                if alias.get("email") in claimed or not alias.get("alias_id") or not alias.get("email"):
                    continue
                conn.execute(
                    "INSERT OR REPLACE INTO mail_aliases (workspace, alias_id, connection_id, email, name, is_primary, synced_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (workspace, alias["alias_id"], connection_id, alias["email"], alias.get("name") or alias["email"],
                     1 if alias.get("is_primary") else 0, ts),
                )
            for message in messages:
                if not message.get("message_id"):
                    continue
                alias = self.resolve_alias(message, aliases)
                if alias and alias.get("email") in claimed:
                    continue
                sender = as_dict(message.get("from"))
                conn.execute(
                    "INSERT OR REPLACE INTO mail_messages (workspace, message_id, folder, alias_id, sender_name, sender_email, "
                    "recipients_json, subject, snippet, received_at, is_read, has_attachments, synced_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (workspace, message["message_id"], folder, (alias or {}).get("alias_id", ""),
                     sender.get("name") or sender.get("email") or "未知发件人", sender.get("email") or "",
                     json.dumps(message.get("to") or [], ensure_ascii=False), message.get("subject") or "(无主题)",
                     message.get("snippet") or "", message.get("created_at"),
                     1 if message.get("is_read") else 0, 1 if message.get("has_attachments") else 0, ts),
                )
            primary = next((a for a in aliases if a.get("is_primary")), aliases[0] if aliases else None)
            if primary and primary.get("email"):
                conn.execute("UPDATE mail_connections SET name = ?, last_synced_at = ? WHERE id = ?",
                             (primary.get("name") or primary["email"].split("@")[0], ts, connection_id))
            conn.execute(
                "UPDATE mail_auth_workspaces SET last_synced_at = ?, status = 'online', status_message = NULL, checked_at = ? "
                "WHERE workspace = ?", (ts, ts, workspace),
            )

    async def sync_workspace(self, workspace: str, folder: str = "inbox") -> None:
        me, messages = await asyncio.gather(
            self.run(["+me"], workspace),
            self.list_all_messages(workspace, folder),
        )
        if not me.get("ok"):
            raise ServiceError("Agent Mail CLI 返回了失败结果。", status=503)
        aliases = [a for a in (as_dict(me.get("data")).get("aliases") or []) if isinstance(a, dict)]
        self.save_snapshot(workspace, aliases, messages, folder)

    # ---------- 看板 ----------
    def build_dashboard(self, folder: str, source: str, selected_account_id: str = "all") -> dict:
        db = self.db
        connection_rows = db.all("SELECT * FROM mail_connections ORDER BY created_at")
        alias_rows = db.all(
            "SELECT a.*, w.status AS auth_status, w.status_message, w.last_synced_at AS workspace_synced_at, "
            "COALESCE(SUM(CASE WHEN m.is_read = 0 AND m.folder = 'inbox' AND r.message_id IS NULL THEN 1 ELSE 0 END), 0) AS unread, "
            "COUNT(m.message_id) AS message_count "
            "FROM mail_aliases a JOIN mail_auth_workspaces w ON w.workspace = a.workspace "
            "LEFT JOIN mail_messages m ON m.workspace = a.workspace AND m.alias_id = a.alias_id "
            "LEFT JOIN message_reads r ON r.workspace = m.workspace AND r.message_id = m.message_id "
            "GROUP BY a.workspace, a.alias_id ORDER BY a.connection_id, a.is_primary DESC, a.email"
        )
        stars = {(r["workspace"], r["message_id"]) for r in db.all("SELECT workspace, message_id FROM message_stars")}
        reads = {(r["workspace"], r["message_id"]) for r in db.all("SELECT workspace, message_id FROM message_reads")}
        labels: Dict[str, List[str]] = {}
        for r in db.all("SELECT al.workspace, al.alias_id, al.label FROM mail_alias_labels al "
                        "LEFT JOIN mail_labels l ON l.name = al.label ORDER BY l.created_at, al.label"):
            labels.setdefault(f"{r['workspace']}:{r['alias_id']}", []).append(r["label"])

        selected = None
        if selected_account_id != "all":
            selected = next((r for r in alias_rows if f"{r['workspace']}:{r['alias_id']}" == selected_account_id), None)
        if selected is not None:
            message_rows = db.all(
                "SELECT * FROM mail_messages WHERE folder = ? AND workspace = ? AND alias_id = ? ORDER BY received_at DESC",
                folder, selected["workspace"], selected["alias_id"],
            )
        else:
            message_rows = db.all("SELECT * FROM mail_messages WHERE folder = ? ORDER BY received_at DESC", folder)

        all_accounts = []
        for index, r in enumerate(alias_rows):
            account_id = f"{r['workspace']}:{r['alias_id']}"
            all_accounts.append({
                "id": account_id,
                "aliasId": r["alias_id"],
                "workspace": r["workspace"],
                "connectionId": r["connection_id"],
                "name": r["name"] or r["email"],
                "email": r["email"],
                "unread": int(r["unread"] or 0),
                "messageCount": int(r["message_count"] or 0),
                "color": COLORS[index % len(COLORS)],
                "status": r["auth_status"] or "online",
                "statusMessage": r["status_message"] or "",
                "lastSyncedAt": r["workspace_synced_at"],
                "labels": labels.get(account_id, []),
            })
        accounts = [a for a in all_accounts if a["status"] != "removed"]
        archived = [a for a in all_accounts if a["status"] == "removed"]
        workspace_connection = {a["workspace"]: a["connectionId"] for a in all_accounts}

        connections = []
        for index, r in enumerate(connection_rows):
            linked = [a for a in accounts if a["connectionId"] == r["id"]]
            if not linked:
                continue
            connections.append({
                "id": r["id"],
                "name": r["name"],
                "aliasCount": len(linked),
                "unread": sum(a["unread"] for a in linked),
                "color": COLORS[index % len(COLORS)],
                "status": "online" if any(a["status"] == "online" for a in linked) else "expired",
            })

        category = {"sent": "已发送", "trash": "垃圾箱"}.get(folder, "收件")
        emails = [{
            "id": f"{r['workspace']}:{r['message_id']}",
            "messageId": r["message_id"],
            "workspace": r["workspace"],
            "connectionId": workspace_connection.get(r["workspace"], ""),
            "sender": r["sender_name"] or r["sender_email"] or "未知发件人",
            "senderAddress": r["sender_email"] or "",
            "recipients": json.loads(r["recipients_json"] or "[]"),
            "subject": r["subject"] or "(无主题)",
            "preview": r["snippet"] or "",
            "accountId": f"{r['workspace']}:{r['alias_id']}",
            "category": category,
            "receivedAt": to_timestamp(r["received_at"]),
            "isRead": bool(r["is_read"]) or (r["workspace"], r["message_id"]) in reads,
            "isStarred": (r["workspace"], r["message_id"]) in stars,
            "hasAttachments": bool(r["has_attachments"]),
        } for r in message_rows]

        contacts: Dict[str, dict] = {}
        for r in db.all("SELECT sender_name, sender_email FROM mail_messages WHERE folder = 'inbox' "
                        "AND sender_email != '' ORDER BY received_at DESC"):
            contacts.setdefault(r["sender_email"], {"name": r["sender_name"] or r["sender_email"], "email": r["sender_email"]})

        return {
            "connections": connections,
            "accounts": accounts,
            "archivedAccounts": archived,
            "emails": emails,
            "contacts": list(contacts.values()),
            "labels": self.list_labels(),
            "stats": {
                "total": len(emails),
                "unread": sum(1 for e in emails if not e["isRead"]),
                "accounts": len(connections),
                "aliases": len(accounts),
            },
            "source": source,
            "folder": folder,
            "selectedAccountId": f"{selected['workspace']}:{selected['alias_id']}" if selected is not None else "all",
        }

    def _first_active_alias(self):
        return self.db.one(
            "SELECT a.workspace, a.alias_id, w.status FROM mail_aliases a "
            "JOIN mail_auth_workspaces w ON w.workspace = a.workspace AND w.status != 'removed' "
            "ORDER BY a.connection_id, a.is_primary DESC, a.email LIMIT 1"
        )

    async def dashboard(self, folder: str = "inbox", requested: str = "default", sync: bool = True, label: str = "") -> dict:
        if folder not in FOLDERS:
            folder = "inbox"
        self.ensure_initial_workspace()
        workspaces = [r["workspace"] for r in self.db.all(
            "SELECT workspace FROM mail_auth_workspaces WHERE status != 'removed' ORDER BY created_at")]
        selected_id = requested or "default"
        selected = None
        if selected_id != "all":
            selected = self.db.one(
                "SELECT a.workspace, a.alias_id, w.status FROM mail_aliases a "
                "JOIN mail_auth_workspaces w ON w.workspace = a.workspace WHERE a.workspace || ':' || a.alias_id = ?",
                selected_id,
            )
            if selected is None:
                selected = self._first_active_alias()
                selected_id = f"{selected['workspace']}:{selected['alias_id']}" if selected else "default"

        if selected_id == "all" and label and label not in ("all", "untagged"):
            # 按标签查看时只同步带该标签的邮箱，比“全部邮箱”快
            labeled = {r["workspace"] for r in self.db.all("SELECT DISTINCT workspace FROM mail_alias_labels WHERE label = ?", label)}
            targets = [w for w in workspaces if w in labeled]
        elif selected_id == "all":
            targets = workspaces
        elif selected is not None:
            targets = [] if selected["status"] == "removed" else [selected["workspace"]]
        else:
            targets = workspaces[:1]

        synced = 0
        if sync and targets:
            async def sync_one(workspace: str) -> bool:
                try:
                    await self.sync_workspace(workspace, folder)
                    return True
                except ServiceError as error:
                    log.warning("workspace %s sync failed: %s", workspace, error.message)
                    if error.kind != "auth":
                        self.mark_workspace(workspace, "error", f"同步失败：{error.message}")
                    return False
            synced = sum(await asyncio.gather(*(sync_one(w) for w in targets)))

        if selected_id == "default":
            selected = self._first_active_alias()
            selected_id = f"{selected['workspace']}:{selected['alias_id']}" if selected else "all"
        return self.build_dashboard(folder, "agently-cli" if synced else "sqlite-cache", selected_id)

    def assert_workspace(self, workspace: Optional[str], allow_removed: bool = True):
        row = self.db.one("SELECT status FROM mail_auth_workspaces WHERE workspace = ?", workspace) if workspace else None
        if not row:
            raise ServiceError("邮箱授权工作区不存在。")
        if not allow_removed and row["status"] == "removed":
            raise ServiceError("该邮箱账号已删除，仅保留了本地邮件记录，无法执行此操作。")
        return row

    async def check_workspaces(self) -> dict:
        workspaces = [r["workspace"] for r in self.db.all(
            "SELECT workspace FROM mail_auth_workspaces WHERE status != 'removed'")]

        async def check(workspace: str) -> None:
            try:
                result = await self.run(["+me"], workspace)
                if not result.get("ok"):
                    raise ServiceError(as_dict(result.get("error")).get("message") or "Agent Mail CLI 返回了失败结果。")
                self.mark_workspace(workspace, "online")
            except ServiceError as error:
                if error.kind != "auth":
                    self.mark_workspace(workspace, "error", f"检测失败：{error.message}")

        await asyncio.gather(*(check(w) for w in workspaces))
        rows = self.db.all("SELECT workspace, status, status_message FROM mail_auth_workspaces WHERE status != 'removed'")
        return {"ok": True, "workspaces": [
            {"workspace": r["workspace"], "status": r["status"], "statusMessage": r["status_message"]} for r in rows]}

    async def logout_workspace(self, workspace: str) -> None:
        try:
            await self.run(["auth", "logout"], workspace)
        except ServiceError as error:
            log.warning("workspace %s logout failed: %s", workspace, error.message)

    def delete_workspace_rows(self, workspace: str) -> None:
        for table in ("mail_messages", "mail_aliases", "mail_alias_labels", "message_stars", "message_reads", "mail_auth_workspaces"):
            self.db.run(f"DELETE FROM {table} WHERE workspace = ?", workspace)

    def delete_orphan_connections(self) -> None:
        self.db.run("DELETE FROM mail_connections WHERE id NOT IN (SELECT connection_id FROM mail_auth_workspaces)")

    def dedupe_workspaces(self) -> List[str]:
        """同一邮箱存在于多个授权时只保留最新扫码的授权，标签与星标迁移过去。"""
        rows = self.db.all(
            "SELECT a.workspace, a.alias_id, a.email FROM mail_aliases a "
            "JOIN mail_auth_workspaces w ON w.workspace = a.workspace "
            "ORDER BY CASE WHEN w.status = 'removed' THEN 1 ELSE 0 END, w.created_at DESC"
        )
        owners: Dict[str, Any] = {}
        by_workspace: Dict[str, list] = {}
        for r in rows:
            owners.setdefault(r["email"], r)
            by_workspace.setdefault(r["workspace"], []).append(r)
        removed: List[str] = []
        with self.db.transaction() as conn:
            for workspace, aliases in by_workspace.items():
                superseded = [a for a in aliases if owners[a["email"]]["workspace"] != workspace]
                if not superseded:
                    continue
                for alias in superseded:
                    owner = owners[alias["email"]]
                    conn.execute(
                        "INSERT OR IGNORE INTO mail_alias_labels (workspace, alias_id, label, created_at) "
                        "SELECT ?, ?, label, created_at FROM mail_alias_labels WHERE workspace = ? AND alias_id = ?",
                        (owner["workspace"], owner["alias_id"], workspace, alias["alias_id"]),
                    )
                    conn.execute(
                        "UPDATE OR IGNORE message_stars SET workspace = ? WHERE workspace = ? AND message_id IN "
                        "(SELECT message_id FROM mail_messages WHERE workspace = ? AND alias_id = ?)",
                        (owner["workspace"], workspace, workspace, alias["alias_id"]),
                    )
                if len(superseded) == len(aliases):
                    self.delete_workspace_rows(workspace)
                    removed.append(workspace)
                    continue
                for alias in superseded:
                    for table in ("mail_messages", "mail_aliases", "mail_alias_labels"):
                        conn.execute(f"DELETE FROM {table} WHERE workspace = ? AND alias_id = ?", (workspace, alias["alias_id"]))
            self.delete_orphan_connections()
        for workspace in removed:
            asyncio.ensure_future(self.logout_workspace(workspace))
        return removed

    async def remove_workspaces(self, workspaces: List[str], mode: str) -> dict:
        if mode not in ("account", "all"):
            raise ServiceError("无效的删除方式。")
        items = list(dict.fromkeys(str(w) for w in workspaces if w))
        if not items:
            raise ServiceError("请选择要删除的邮箱账号。")
        statuses = [self.assert_workspace(w)["status"] for w in items]
        with self.db.transaction() as conn:
            for workspace in items:
                if mode == "all":
                    self.delete_workspace_rows(workspace)
                else:
                    conn.execute("UPDATE mail_auth_workspaces SET status = 'removed', status_message = NULL, checked_at = ? "
                                 "WHERE workspace = ?", (now_ms(), workspace))
            self.delete_orphan_connections()
        await asyncio.gather(*(self.logout_workspace(w) for w, s in zip(items, statuses) if s != "removed"))
        return {"ok": True, "removed": len(items), "mode": mode}

    # ---------- 邮件 ----------
    async def read_message(self, message_id: str, workspace: str) -> dict:
        if not MESSAGE_ID.match(message_id or ""):
            raise ServiceError("无效的邮件标识。")
        self.assert_workspace(workspace, allow_removed=False)
        result = await self.run(["message", "+read", "--id", message_id], workspace)
        if not result.get("ok"):
            raise ServiceError("Agent Mail CLI 返回了失败结果。", status=503)
        data = as_dict(result.get("data"))
        self.db.run("UPDATE mail_messages SET is_read = 1 WHERE workspace = ? AND message_id = ?", workspace, message_id)
        self.db.run("INSERT OR REPLACE INTO message_reads (workspace, message_id, read_at) VALUES (?, ?, ?)",
                    workspace, message_id, now_ms())
        return {**data, "workspace": workspace, "source": "agently-cli"}

    def set_star(self, message_id: str, workspace: str, starred: bool) -> dict:
        if not MESSAGE_ID.match(message_id or ""):
            raise ServiceError("无效的邮件标识。")
        self.assert_workspace(workspace)
        if starred:
            self.db.run("INSERT OR REPLACE INTO message_stars (workspace, message_id, starred_at) VALUES (?, ?, ?)",
                        workspace, message_id, now_ms())
        else:
            self.db.run("DELETE FROM message_stars WHERE workspace = ? AND message_id = ?", workspace, message_id)
        return {"ok": True, "starred": starred}

    def set_alias_labels(self, workspace: str, alias_id: str, labels: List[str]) -> dict:
        self.assert_workspace(workspace)
        if not self.db.one("SELECT 1 FROM mail_aliases WHERE workspace = ? AND alias_id = ?", workspace, alias_id):
            raise ServiceError("邮箱账号不存在。")
        normalized = list(dict.fromkeys(self.normalize_label(label) for label in labels if str(label).strip()))
        if len(normalized) > MAX_LABELS_PER_ALIAS:
            raise ServiceError(f"每个邮箱最多设置 {MAX_LABELS_PER_ALIAS} 个标签。")
        ts = now_ms()
        with self.db.transaction() as conn:
            for label in normalized:
                self._ensure_label(label)
            conn.execute("DELETE FROM mail_alias_labels WHERE workspace = ? AND alias_id = ?", (workspace, alias_id))
            for label in normalized:
                conn.execute("INSERT INTO mail_alias_labels (workspace, alias_id, label, created_at) VALUES (?, ?, ?, ?)",
                             (workspace, alias_id, label, ts))
        return {"ok": True, "labels": normalized}

    def mark_read(self, items: List[dict]) -> dict:
        """一键已读：先记录到本地（立即生效、同步后也不会被覆盖），再在后台通过官方 CLI 打开邮件同步已读状态。"""
        targets = []
        for item in items[:2000]:
            workspace, message_id = str(item.get("workspace") or ""), str(item.get("messageId") or "")
            if MESSAGE_ID.match(message_id) and workspace:
                targets.append((workspace, message_id))
        targets = list(dict.fromkeys(targets))
        ts = now_ms()
        with self.db.transaction() as conn:
            for workspace, message_id in targets:
                conn.execute("INSERT OR REPLACE INTO message_reads (workspace, message_id, read_at) VALUES (?, ?, ?)",
                             (workspace, message_id, ts))
                conn.execute("UPDATE mail_messages SET is_read = 1 WHERE workspace = ? AND message_id = ?", (workspace, message_id))
        active = {r["workspace"] for r in self.db.all("SELECT workspace FROM mail_auth_workspaces WHERE status = 'online'")}
        remote = [t for t in targets if t[0] in active]
        if remote:
            asyncio.ensure_future(self._remote_mark_read(remote))
        return {"ok": True, "marked": len(targets)}

    async def _remote_mark_read(self, targets: List[tuple]) -> None:
        semaphore = asyncio.Semaphore(3)

        async def one(workspace: str, message_id: str) -> None:
            async with semaphore:
                try:
                    await self.run(["message", "+read", "--id", message_id], workspace)
                except ServiceError as error:
                    log.info("remote mark read %s failed: %s", message_id, error.message)

        await asyncio.gather(*(one(w, m) for w, m in targets))

    # ---------- 标签 ----------
    @staticmethod
    def normalize_label(value: Any) -> str:
        label = str(value or "").strip()
        if not label:
            raise ServiceError("标签名称不能为空。")
        if len(label) > MAX_LABEL_LENGTH:
            raise ServiceError(f"标签名称不能超过 {MAX_LABEL_LENGTH} 个字符。")
        if any(ch in label for ch in "/\\,，"):
            raise ServiceError("标签名称不能包含斜杠或逗号。")
        return label

    def _next_color(self) -> str:
        used = [r["color"] for r in self.db.all("SELECT color FROM mail_labels")]
        # 优先使用还没被占用的颜色，都用过后选使用次数最少的
        return min(LABEL_COLORS, key=lambda color: (used.count(color), LABEL_COLORS.index(color)))

    def _ensure_label(self, name: str, color: Optional[str] = None) -> None:
        if not self.db.one("SELECT 1 FROM mail_labels WHERE name = ?", name):
            self.db.run("INSERT INTO mail_labels (name, color, created_at) VALUES (?, ?, ?)",
                        name, color if color and HEX_COLOR.match(color) else self._next_color(), now_ms())

    def list_labels(self) -> List[dict]:
        rows = self.db.all(
            "SELECT l.name, l.color, l.created_at, "
            "(SELECT COUNT(*) FROM mail_alias_labels al "
            " JOIN mail_aliases a ON a.workspace = al.workspace AND a.alias_id = al.alias_id "
            " JOIN mail_auth_workspaces w ON w.workspace = al.workspace AND w.status != 'removed' "
            " WHERE al.label = l.name) AS alias_count "
            "FROM mail_labels l ORDER BY l.created_at, l.name"
        )
        return [{"name": r["name"], "color": r["color"], "createdAt": r["created_at"], "aliasCount": r["alias_count"]} for r in rows]

    def _label_dict(self, name: str) -> dict:
        return next((item for item in self.list_labels() if item["name"] == name), {})

    def create_label(self, name: str, color: Optional[str] = None) -> dict:
        label = self.normalize_label(name)
        if self.db.one("SELECT 1 FROM mail_labels WHERE name = ?", label):
            raise ServiceError("标签已存在。")
        if color and not HEX_COLOR.match(color):
            raise ServiceError("无效的标签颜色。")
        self._ensure_label(label, color)
        return self._label_dict(label)

    def _set_label_aliases(self, label: str, aliases: List[dict]) -> None:
        targets = []
        for item in aliases:
            workspace, alias_id = str(item.get("workspace") or ""), str(item.get("aliasId") or "")
            if not self.db.one("SELECT 1 FROM mail_aliases WHERE workspace = ? AND alias_id = ?", workspace, alias_id):
                raise ServiceError("邮箱账号不存在。")
            targets.append((workspace, alias_id))
        targets = list(dict.fromkeys(targets))
        for workspace, alias_id in targets:
            count = self.db.one("SELECT COUNT(*) AS c FROM mail_alias_labels WHERE workspace = ? AND alias_id = ? AND label != ?",
                                workspace, alias_id, label)["c"]
            if count >= MAX_LABELS_PER_ALIAS:
                email = self.db.one("SELECT email FROM mail_aliases WHERE workspace = ? AND alias_id = ?", workspace, alias_id)["email"]
                raise ServiceError(f"{email} 已有 {MAX_LABELS_PER_ALIAS} 个标签，无法再添加。")
        self.db.run("DELETE FROM mail_alias_labels WHERE label = ?", label)
        ts = now_ms()
        for workspace, alias_id in targets:
            self.db.run("INSERT INTO mail_alias_labels (workspace, alias_id, label, created_at) VALUES (?, ?, ?, ?)",
                        workspace, alias_id, label, ts)

    def update_label(self, name: str, new_name: Optional[str] = None, color: Optional[str] = None,
                     aliases: Optional[List[dict]] = None) -> dict:
        row = self.db.one("SELECT * FROM mail_labels WHERE name = ?", name)
        if not row:
            raise ServiceError("标签不存在。")
        if color is not None and not HEX_COLOR.match(color):
            raise ServiceError("无效的标签颜色。")
        target = self.normalize_label(new_name) if new_name is not None else name
        with self.db.transaction() as conn:
            if target != name:
                if self.db.one("SELECT 1 FROM mail_labels WHERE name = ?", target):
                    raise ServiceError("已存在同名标签。")
                conn.execute("INSERT INTO mail_labels (name, color, created_at) VALUES (?, ?, ?)",
                             (target, row["color"], row["created_at"]))
                conn.execute("UPDATE mail_alias_labels SET label = ? WHERE label = ?", (target, name))
                conn.execute("DELETE FROM mail_labels WHERE name = ?", (name,))
            if color is not None:
                conn.execute("UPDATE mail_labels SET color = ? WHERE name = ?", (color, target))
            if aliases is not None:
                self._set_label_aliases(target, aliases)
        return self._label_dict(target)

    def delete_label(self, name: str) -> dict:
        if not self.db.one("SELECT 1 FROM mail_labels WHERE name = ?", name):
            raise ServiceError("标签不存在。")
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM mail_alias_labels WHERE label = ?", (name,))
            conn.execute("DELETE FROM mail_labels WHERE name = ?", (name,))
        return {"ok": True}

    async def mail_action(self, payload: dict) -> dict:
        action = payload.get("action")
        workspace = payload.get("workspace") or ""
        body = (payload.get("body") or "").strip()
        message_id = payload.get("messageId") or ""
        self.assert_workspace(workspace, allow_removed=False)
        if action in ("trash", "delete"):
            if not MESSAGE_ID.match(message_id):
                raise ServiceError("无效的邮件标识。")
            args = ["message", "+trash" if action == "trash" else "+delete", "--id", message_id]
        elif action == "send":
            if not body:
                raise ServiceError("邮件正文不能为空。")
            to = payload.get("to")
            recipients = [str(r).strip() for r in to] if isinstance(to, list) else re.split(r"[;,，；\s]+", str(to or ""))
            recipients = [r for r in recipients if r]
            subject = (payload.get("subject") or "").strip()
            if not recipients or not subject:
                raise ServiceError("请填写收件人和主题。")
            args = ["message", "+send"]
            for recipient in recipients:
                args += ["--to", recipient]
            args += ["--subject", subject, "--body", body, "--body-format", "plain"]
        elif action == "reply":
            if not body:
                raise ServiceError("邮件正文不能为空。")
            if not MESSAGE_ID.match(message_id):
                raise ServiceError("无效的回复邮件标识。")
            args = ["message", "+reply", "--id", message_id, "--body", body, "--body-format", "plain"]
        else:
            raise ServiceError("不支持的邮件操作。")
        if payload.get("confirmationToken"):
            args += ["--confirmation-token", str(payload["confirmationToken"])]
        result = await self.run(args, workspace)
        if action in ("trash", "delete") and not as_dict(result.get("data")).get("confirmation_required") and result.get("ok") is not False:
            self.db.run("DELETE FROM mail_messages WHERE workspace = ? AND message_id = ? AND folder != 'trash'"
                        if action == "trash" else
                        "DELETE FROM mail_messages WHERE workspace = ? AND message_id = ?", workspace, message_id)
        return result

    # ---------- 扫码授权 ----------
    async def register_auth_workspace(self, workspace: str, target_connection_id: Optional[str]) -> None:
        connection_id = target_connection_id
        if connection_id and not self.db.one("SELECT 1 FROM mail_connections WHERE id = ?", connection_id):
            raise ServiceError("目标微信账号不存在。")
        if not connection_id:
            connection_id = f"conn_{uuid.uuid4()}"
            self.db.run("INSERT INTO mail_connections (id, name, created_at) VALUES (?, ?, ?)",
                        connection_id, "新微信账号", now_ms())
        self.db.run("INSERT OR REPLACE INTO mail_auth_workspaces (workspace, connection_id, created_at) VALUES (?, ?, ?)",
                    workspace, connection_id, now_ms())
        try:
            await self.sync_workspace(workspace, "inbox")
        except Exception:
            self.db.run("DELETE FROM mail_auth_workspaces WHERE workspace = ?", workspace)
            if not target_connection_id:
                self.db.run("DELETE FROM mail_connections WHERE id = ?", connection_id)
            raise
        try:
            self.dedupe_workspaces()
        except Exception as error:  # noqa: BLE001
            log.warning("dedupe after auth %s failed: %s", workspace, error)

    async def _watch_auth(self, session: AuthSession) -> None:
        proc = session.process
        assert proc is not None
        buffer = {"text": ""}

        async def consume(stream: Optional[asyncio.StreamReader]) -> None:
            if stream is None:
                return
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    return
                buffer["text"] = (buffer["text"] + chunk.decode("utf-8", "replace"))[-8192:]
                if not session.auth_url:
                    match = AUTH_URL.search(buffer["text"])
                    if match:
                        session.auth_url = match.group(0)

        await asyncio.gather(consume(proc.stdout), consume(proc.stderr))
        code = await proc.wait()
        if session.expiry_handle:
            session.expiry_handle.cancel()
        if session.status != "pending":
            return
        if code != 0:
            session.status = "failed"
            session.error = f"官方登录程序已退出（退出码 {code}）。"
            return
        session.status = "syncing"
        try:
            await self.register_auth_workspace(session.workspace, session.target_connection_id)
            session.status = "confirmed"
        except ServiceError as error:
            session.status = "failed"
            session.error = error.message
        except Exception as error:  # noqa: BLE001
            session.status = "failed"
            session.error = str(error)

    def _expire(self, session: AuthSession) -> None:
        if session.status != "pending":
            return
        session.status = "expired"
        session.error = "授权二维码已过期。"
        session.kill()

    async def start_auth(self, target_connection_id: Optional[str] = None) -> AuthSession:
        now = time.time()
        for key, item in list(self.auth_sessions.items()):
            if item.status not in ("pending", "syncing") and now - item.created_at > AUTH_LIFETIME_SECONDS:
                del self.auth_sessions[key]
        active = next((s for s in self.auth_sessions.values() if s.status in ("pending", "syncing")), None)
        if active:
            return active
        session = AuthSession(target_connection_id)
        self.auth_sessions[session.id] = session
        try:
            session.process = await asyncio.create_subprocess_exec(
                self.settings.cli_path, "auth", "login",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL,
                env=self.cli_env(session.workspace),
            )
        except (FileNotFoundError, PermissionError):
            session.status = "failed"
            session.error = f"找不到 agently-cli（{self.settings.cli_path}），请先在服务器安装官方 CLI。"
            return session
        loop = asyncio.get_event_loop()
        session.expiry_handle = loop.call_later(AUTH_LIFETIME_SECONDS, self._expire, session)
        session.task = asyncio.ensure_future(self._watch_auth(session))
        for _ in range(50):
            if session.auth_url or session.status != "pending":
                break
            await asyncio.sleep(0.1)
        if not session.auth_url and session.status == "pending":
            session.kill()
            session.status = "failed"
            session.error = "官方 CLI 没有返回授权地址，请稍后重试。"
        return session

    def get_auth_session(self, session_id: str) -> Optional[AuthSession]:
        return self.auth_sessions.get(session_id or "")

    def shutdown(self) -> None:
        for session in self.auth_sessions.values():
            if session.expiry_handle:
                session.expiry_handle.cancel()
            session.kill()

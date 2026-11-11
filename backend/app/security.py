"""控制台登录：HMAC 签名 Token 与登录失败限流。"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from typing import Dict, Optional

LOGIN_WINDOW_SECONDS = 10 * 60
LOGIN_BLOCK_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 5


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def safe_equal(left: object, right: object) -> bool:
    return hmac.compare_digest(str(left).encode("utf-8"), str(right).encode("utf-8"))


def _signature(payload: str, secret: str) -> str:
    return _b64encode(hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())


def create_token(username: str, secret: str, ttl_seconds: int) -> str:
    now = int(time.time())
    body = {"sub": username, "iat": now, "exp": now + ttl_seconds, "jti": str(uuid.uuid4())}
    payload = _b64encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    return f"{payload}.{_signature(payload, secret)}"


def verify_token(token: str, secret: str) -> dict:
    parts = str(token or "").split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("INVALID_TOKEN")
    payload, supplied = parts
    if not safe_equal(supplied, _signature(payload, secret)):
        raise ValueError("INVALID_TOKEN")
    data = json.loads(_b64decode(payload).decode("utf-8"))
    if not data.get("sub") or not data.get("exp") or int(data["exp"]) <= int(time.time()):
        raise ValueError("EXPIRED_TOKEN")
    return data


class LoginLimiter:
    """按来源 IP 记录失败次数，10 分钟内失败 5 次锁定 15 分钟。"""

    def __init__(self) -> None:
        self._attempts: Dict[str, dict] = {}

    def _prune(self, now: float) -> None:
        if len(self._attempts) <= 1000:
            return
        for key in list(self._attempts):
            item = self._attempts[key]
            if item["blocked_until"] <= now and now - item["first"] > LOGIN_WINDOW_SECONDS:
                del self._attempts[key]

    def retry_after(self, key: str) -> Optional[int]:
        now = time.time()
        self._prune(now)
        item = self._attempts.get(key)
        if not item:
            return None
        if item["blocked_until"] > now:
            return int(item["blocked_until"] - now) + 1
        if now - item["first"] > LOGIN_WINDOW_SECONDS:
            del self._attempts[key]
        return None

    def fail(self, key: str) -> None:
        now = time.time()
        item = self._attempts.get(key) or {"failures": 0, "first": now, "blocked_until": 0.0}
        item["failures"] += 1
        if item["failures"] >= LOGIN_MAX_FAILURES:
            item["blocked_until"] = now + LOGIN_BLOCK_SECONDS
        self._attempts[key] = item

    def succeed(self, key: str) -> None:
        self._attempts.pop(key, None)

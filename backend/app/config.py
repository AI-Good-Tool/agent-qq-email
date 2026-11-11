"""运行配置：读取项目根目录的 .env，再由环境变量覆盖。"""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


def load_env_file(path: Path) -> None:
    """简易 .env 解析：已存在的环境变量优先，不会被文件覆盖。"""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


def _path(name: str, default: Path) -> Path:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    candidate = Path(value).expanduser()
    return candidate if candidate.is_absolute() else (PROJECT_ROOT / candidate)


def load_or_create_secret(file: Path) -> str:
    try:
        value = file.read_text(encoding="utf-8").strip()
        if len(value) >= 32:
            return value
    except FileNotFoundError:
        pass
    file.parent.mkdir(parents=True, exist_ok=True)
    value = secrets.token_urlsafe(48)
    fd = os.open(str(file), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(value + "\n")
    return value


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    data_dir: Path
    database_path: Path
    static_dir: Path
    dashboard_username: str
    dashboard_password: str
    token_secret: str
    token_ttl_seconds: int
    cli_path: str
    initial_workspace: str
    cli_timeout: int
    api_docs: bool


def load_settings() -> Settings:
    load_env_file(PROJECT_ROOT / ".env")
    # agently-cli 是 Node 程序：宝塔/systemd 环境里 PATH 往往不含 Node 目录，可通过 EXTRA_PATH 补充
    extra_path = os.environ.get("EXTRA_PATH", "").strip()
    if extra_path:
        os.environ["PATH"] = os.pathsep.join([extra_path, os.environ.get("PATH", "")])
    data_dir = _path("DATA_DIR", PROJECT_ROOT / "data")
    data_dir.mkdir(parents=True, exist_ok=True)
    secret = os.environ.get("DASHBOARD_TOKEN_SECRET", "").strip()
    if len(secret) < 32:
        secret = load_or_create_secret(data_dir / "dashboard-token.secret")
    return Settings(
        host=os.environ.get("HOST", "127.0.0.1").strip() or "127.0.0.1",
        port=_int("PORT", 1265),
        data_dir=data_dir,
        database_path=_path("SQLITE_PATH", data_dir / "agent-mail.sqlite"),
        static_dir=_path("STATIC_DIR", PROJECT_ROOT / "frontend" / "dist"),
        dashboard_username=os.environ.get("DASHBOARD_USERNAME", "admin").strip() or "admin",
        dashboard_password=os.environ.get("DASHBOARD_PASSWORD", "abadmin123ab") or "abadmin123ab",
        token_secret=secret,
        token_ttl_seconds=_int("TOKEN_TTL_DAYS", 30) * 24 * 60 * 60,
        cli_path=os.environ.get("AGENTLY_CLI_PATH", "agently-cli").strip() or "agently-cli",
        initial_workspace=os.environ.get("AGENTLY_WORKSPACE", "").strip(),
        cli_timeout=_int("AGENTLY_TIMEOUT", 30),
        api_docs=os.environ.get("API_DOCS", "").strip() in ("1", "true", "yes"),
    )


settings = load_settings()

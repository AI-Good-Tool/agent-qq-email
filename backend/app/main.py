"""云邮盒 API 与前端静态资源服务（单进程）。"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__
from .agently import AgentlyService, ServiceError
from .config import settings
from .db import Database
from .security import LoginLimiter, create_token, safe_equal, verify_token

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("yunyouhe")

database = Database(settings.database_path)
agently = AgentlyService(settings, database)
limiter = LoginLimiter()


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: Optional[dict] = None) -> None:
        super().__init__(message)
        self.status, self.code, self.message, self.headers = status, code, message, headers


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.conn  # 启动时建表/升级表结构，尽早暴露数据库权限问题
    log.info("云邮盒 %s 已启动：http://%s:%s  数据库：%s", __version__, settings.host, settings.port, settings.database_path)
    if settings.dashboard_password == "abadmin123ab":
        log.warning("仍在使用默认控制台密码，请在 .env 中修改 DASHBOARD_PASSWORD。")
    yield
    agently.shutdown()
    database.close()


app = FastAPI(
    title="云邮盒 API",
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.api_docs else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.api_docs else None,
)


@app.exception_handler(ApiError)
async def handle_api_error(_: Request, error: ApiError):
    return JSONResponse({"code": error.code, "message": error.message}, status_code=error.status, headers=error.headers)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, error: RequestValidationError):
    return JSONResponse({"code": "BAD_REQUEST", "message": "请求参数不正确。"}, status_code=400)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def require_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    try:
        if scheme.lower() != "bearer" or not token.strip():
            raise ValueError("MISSING_TOKEN")
        return verify_token(token.strip(), settings.token_secret)
    except Exception:
        raise ApiError(401, "UNAUTHORIZED", "登录状态已失效，请重新登录。")


def service_call(code: str):
    """把 ServiceError 转换为统一的 JSON 错误。"""
    def wrap(error: ServiceError) -> ApiError:
        return ApiError(error.status, code, error.message)
    return wrap


# ---------- 请求体 ----------
class LoginBody(BaseModel):
    username: str = ""
    password: str = ""


class StarBody(BaseModel):
    workspace: str
    starred: bool = False


class LabelsBody(BaseModel):
    workspace: str
    labels: List[str] = []


class MailActionBody(BaseModel):
    action: str
    workspace: str
    messageId: Optional[str] = None
    to: Union[List[str], str, None] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    confirmationToken: Optional[str] = None


class LabelCreateBody(BaseModel):
    name: str
    color: Optional[str] = None


class LabelAlias(BaseModel):
    workspace: str
    aliasId: str


class LabelUpdateBody(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    aliases: Optional[List[LabelAlias]] = None


class MessageRef(BaseModel):
    workspace: str
    messageId: str


class MarkReadBody(BaseModel):
    messages: List[MessageRef] = []


class RemoveBody(BaseModel):
    workspaces: List[str] = []
    mode: str = "account"


class AuthStartBody(BaseModel):
    connectionId: Optional[str] = None


# ---------- 公共接口 ----------
@app.get("/health")
async def health():
    return {"ok": True, "service": "yunyouhe", "version": __version__}


@app.post("/api/login")
async def login(body: LoginBody, request: Request):
    key = request.client.host if request.client else "unknown"
    retry_after = limiter.retry_after(key)
    if retry_after:
        raise ApiError(429, "LOGIN_RATE_LIMITED", f"登录尝试过多，请在 {max(1, -(-retry_after // 60))} 分钟后重试。",
                       {"Retry-After": str(retry_after)})
    if not safe_equal(body.username, settings.dashboard_username) or not safe_equal(body.password, settings.dashboard_password):
        limiter.fail(key)
        raise ApiError(401, "INVALID_CREDENTIALS", "账号或密码错误。")
    limiter.succeed(key)
    return {
        "token": create_token(settings.dashboard_username, settings.token_secret, settings.token_ttl_seconds),
        "user": {"username": settings.dashboard_username},
        "expiresIn": settings.token_ttl_seconds,
    }


# ---------- 需要登录的接口 ----------
api = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


@api.get("/session")
async def session(user: dict = Depends(require_user)):
    return {"authenticated": True, "user": {"username": user["sub"]}}


@api.get("/dashboard")
async def dashboard(folder: str = "inbox", account: str = "default", sync: int = 1, label: str = ""):
    try:
        return await agently.dashboard(folder, account, sync=bool(sync), label=label)
    except ServiceError as error:
        raise ApiError(503, "AGENTLY_CLI_UNAVAILABLE", error.message)


@api.get("/messages/{message_id}")
async def message_detail(message_id: str, workspace: str = ""):
    try:
        return await agently.read_message(message_id, workspace)
    except ServiceError as error:
        raise ApiError(400 if error.message.startswith("无效") else error.status, "MESSAGE_DETAIL_UNAVAILABLE", error.message)


@api.post("/messages/{message_id}/star")
async def set_star(message_id: str, body: StarBody):
    try:
        return agently.set_star(message_id, body.workspace, body.starred)
    except ServiceError as error:
        raise ApiError(400, "STAR_UPDATE_FAILED", error.message)


@api.put("/aliases/{alias_id}/labels")
async def set_labels(alias_id: str, body: LabelsBody):
    try:
        return agently.set_alias_labels(body.workspace, alias_id, body.labels)
    except ServiceError as error:
        raise ApiError(400, "ALIAS_LABEL_UPDATE_FAILED", error.message)


@api.post("/mail/mark-read")
async def mark_read(body: MarkReadBody):
    return agently.mark_read([{"workspace": m.workspace, "messageId": m.messageId} for m in body.messages])


@api.get("/labels")
async def list_labels():
    return {"labels": agently.list_labels()}


@api.post("/labels")
async def create_label(body: LabelCreateBody):
    try:
        return agently.create_label(body.name, body.color)
    except ServiceError as error:
        raise ApiError(400, "LABEL_CREATE_FAILED", error.message)


@api.put("/labels/{name}")
async def update_label(name: str, body: LabelUpdateBody):
    try:
        aliases = None if body.aliases is None else [{"workspace": a.workspace, "aliasId": a.aliasId} for a in body.aliases]
        return agently.update_label(name, body.name, body.color, aliases)
    except ServiceError as error:
        raise ApiError(400, "LABEL_UPDATE_FAILED", error.message)


@api.delete("/labels/{name}")
async def delete_label(name: str):
    try:
        return agently.delete_label(name)
    except ServiceError as error:
        raise ApiError(400, "LABEL_DELETE_FAILED", error.message)


@api.post("/mail/action")
async def mail_action(body: MailActionBody):
    try:
        return await agently.mail_action(body.model_dump() if hasattr(body, "model_dump") else body.dict())
    except ServiceError as error:
        raise ApiError(400, "MAIL_ACTION_FAILED", error.message)


@api.post("/workspaces/remove")
async def remove_workspaces(body: RemoveBody):
    try:
        return await agently.remove_workspaces(body.workspaces, body.mode)
    except ServiceError as error:
        raise ApiError(400, "WORKSPACE_REMOVE_FAILED", error.message)


@api.post("/workspaces/check")
async def check_workspaces():
    try:
        return await agently.check_workspaces()
    except ServiceError as error:
        raise ApiError(503, "WORKSPACE_CHECK_FAILED", error.message)


@api.post("/auth/start")
async def start_auth(body: Optional[AuthStartBody] = None):
    session = await agently.start_auth((body.connectionId if body else None) or None)
    if session.status == "failed":
        return JSONResponse(session.public(), status_code=503)
    return session.public()


@api.get("/auth/status")
async def auth_status(sessionId: str = ""):
    session = agently.get_auth_session(sessionId)
    if not session:
        raise ApiError(404, "AUTH_SESSION_NOT_FOUND", "授权会话不存在。")
    return session.public()


app.include_router(api)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], include_in_schema=False)
async def api_not_found(path: str):
    raise ApiError(404, "NOT_FOUND", "接口不存在。")


# ---------- 前端静态资源（单页应用） ----------
static_dir: Path = settings.static_dir
index_file = static_dir / "index.html"
if (static_dir / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")


@app.get("/{path:path}", include_in_schema=False)
async def spa(path: str):
    if path:
        candidate = (static_dir / path).resolve()
        try:
            candidate.relative_to(static_dir.resolve())
        except ValueError:
            candidate = None
        if candidate is not None and candidate.is_file():
            return FileResponse(str(candidate))
    if index_file.is_file():
        return FileResponse(str(index_file), headers={"Cache-Control": "no-cache"})
    return JSONResponse({"code": "FRONTEND_NOT_BUILT", "message": "前端尚未构建，请先执行 npm run build。"}, status_code=404)

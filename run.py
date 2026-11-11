#!/usr/bin/env python3
"""云邮盒启动入口：python3 run.py（宝塔 Python 项目的启动命令也填它）。"""
import glob
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))

if sys.version_info < (3, 8):
    sys.exit("云邮盒需要 Python 3.8 及以上版本，当前为 %s" % sys.version.split()[0])


def find_venv_python():
    """依赖装在虚拟环境里：用系统 python3 启动时，自动切换到已安装依赖的虚拟环境。"""
    candidates = [os.path.join(ROOT, ".venv", "bin", "python")]
    # 宝塔「Python 项目」为每个项目创建的虚拟环境
    candidates += sorted(glob.glob("/www/server/pyporject_evn/*yunyouhe*/bin/python3"))
    # 虚拟环境里的 python 通常是指向系统解释器的软链接，所以按虚拟环境目录判断是否已在其中
    current_env = os.path.realpath(sys.prefix)
    for python in candidates:
        env_dir = os.path.dirname(os.path.dirname(python))
        if os.access(python, os.X_OK) and os.path.realpath(env_dir) != current_env:
            return python
    return None


try:
    import uvicorn  # noqa: E402
except ImportError:
    venv_python = None if os.environ.get("YUNYOUHE_REEXEC") else find_venv_python()
    if venv_python:
        os.environ["YUNYOUHE_REEXEC"] = "1"
        os.execv(venv_python, [venv_python, os.path.abspath(__file__)] + sys.argv[1:])
    sys.exit(
        "\n当前 Python（%s）没有安装云邮盒的依赖。\n\n"
        "请任选一种方式：\n"
        "  1. 一键安装并后台运行（推荐）：\n"
        "       bash deploy/baota/install.sh\n"
        "  2. 只安装依赖，然后手动启动：\n"
        "       python3 -m venv .venv && .venv/bin/pip install -r requirements.txt\n"
        "       .venv/bin/python run.py\n"
        "  3. 使用宝塔「Python 项目」：在宝塔界面启动项目，不要在终端直接运行 python3 run.py。\n"
        % sys.executable
    )

from app.config import settings  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=1,  # 扫码授权会话保存在进程内存中，必须单进程运行
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
        access_log=os.environ.get("ACCESS_LOG", "") in ("1", "true"),
    )

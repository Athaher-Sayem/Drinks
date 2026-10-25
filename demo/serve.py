"""Start only the isolated loopback demo; never a production deployment entry point."""

import json
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import password_hash  # noqa: E402


def main():
    subprocess.run(
        [sys.executable, str(ROOT / "demo/import_catalog.py"), "--confirm-demo"], check=True
    )
    local = ROOT / "demo/.local"
    local.mkdir(exist_ok=True)
    access_file = local / "access.json"
    if not access_file.exists():
        values = {
            "secret_key": secrets.token_hex(32),
            "owner_email": "owner@demo.example.com",
            "owner_password": secrets.token_urlsafe(24),
        }
        with access_file.open("x", encoding="utf-8") as stream:
            json.dump(values, stream, indent=2)
        access_file.chmod(0o600)
    values = json.loads(access_file.read_text(encoding="utf-8"))
    app = create_app(
        Settings(
            _env_file=None,
            environment="development",
            database_url=f"sqlite:///{(local / 'general-store-demo.db').as_posix()}",
            secret_key=values["secret_key"],
            cookie_name="general_store_demo",
            allowed_origins=["http://127.0.0.1:5176", "http://127.0.0.1:4174"],
        )
    )
    with app.state.session_factory() as db:
        if not db.scalar(select(User).where(User.email == values["owner_email"])):
            db.add(
                User(
                    name="Demo store owner",
                    email=values["owner_email"],
                    role="admin",
                    password_hash=password_hash.hash(values["owner_password"]),
                )
            )
            db.commit()
    print("Local demo access is in ignored demo/.local/access.json. Do not publish that file.")
    uvicorn.run(app, host="127.0.0.1", port=8004, access_log=False, proxy_headers=False)
    app.state.engine.dispose()


if __name__ == "__main__":
    main()

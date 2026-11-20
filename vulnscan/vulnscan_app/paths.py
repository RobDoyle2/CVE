"""Where the app keeps its files. Everything stays on this machine."""
import os
import sys
from pathlib import Path

from . import APP_NAME


def data_dir() -> Path:
    """Per-user folder: %APPDATA%\\VulnScan on Windows, ~/.vulnscan elsewhere.

    VULNSCAN_HOME overrides it (used by tests and the self-test)."""
    override = os.environ.get("VULNSCAN_HOME")
    if override:
        p = Path(override)
    elif sys.platform == "win32" and os.environ.get("APPDATA"):
        p = Path(os.environ["APPDATA"]) / APP_NAME
    elif sys.platform == "darwin":
        p = Path.home() / "Library" / "Application Support" / APP_NAME
    else:
        p = Path.home() / ".vulnscan"
    p.mkdir(parents=True, exist_ok=True)
    return p


def db_path() -> Path:
    return data_dir() / "vulns.db"


def settings_path() -> Path:
    return data_dir() / "settings.json"


def static_dir() -> Path:
    # PyInstaller unpacks bundled files under sys._MEIPASS.
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    p = base / "vulnscan_app" / "static"
    if not p.exists():
        p = Path(__file__).resolve().parent / "static"
    return p

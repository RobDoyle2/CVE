"""Stores the NVD API key and GitHub token securely on this machine.

Windows: encrypted with DPAPI (the same protection Windows uses for saved
passwords), so the file is only readable by the same Windows user account.
Other systems: the OS keyring if the 'keyring' package is available, otherwise
a file readable only by the current user.

Secrets are never sent to the browser in full; the UI only sees a masked hint.
"""
import base64
import json
import os
import sys

from .paths import data_dir

NAMES = ("NVD_API_KEY", "GITHUB_TOKEN")
_FILE = "secrets.json"


# ---------------- Windows DPAPI via ctypes (no extra dependency) ----------------
if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _to_blob(data: bytes) -> _BLOB:
        buf = ctypes.create_string_buffer(data, len(data))
        return _BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _from_blob(blob: _BLOB) -> bytes:
        out = ctypes.string_at(blob.pbData, blob.cbData)
        ctypes.windll.kernel32.LocalFree(blob.pbData)
        return out

    def _protect(data: bytes) -> bytes:
        out = _BLOB()
        if not ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(_to_blob(data)), "VulnScan", None, None, None, 0x1, ctypes.byref(out)):
            raise OSError("CryptProtectData failed")
        return _from_blob(out)

    def _unprotect(data: bytes) -> bytes:
        out = _BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(
                ctypes.byref(_to_blob(data)), None, None, None, None, 0x1, ctypes.byref(out)):
            raise OSError("CryptUnprotectData failed")
        return _from_blob(out)
else:
    def _protect(data: bytes) -> bytes:
        return data

    def _unprotect(data: bytes) -> bytes:
        return data


def _keyring():
    if sys.platform == "win32":
        return None
    try:
        import keyring  # type: ignore
        keyring.get_keyring()
        from keyring.backends import fail  # type: ignore
        if isinstance(keyring.get_keyring(), fail.Keyring):
            return None
        return keyring
    except Exception:
        return None


def _path():
    return data_dir() / _FILE


def _load_file() -> dict:
    try:
        return json.loads(_path().read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_file(d: dict) -> None:
    p = _path()
    p.write_text(json.dumps(d), encoding="utf-8")
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass


def get(name: str) -> str:
    # An environment variable (as in the original scripts) wins if set.
    env = os.environ.get(name, "")
    if env:
        return env
    kr = _keyring()
    if kr:
        try:
            return kr.get_password("VulnScan", name) or ""
        except Exception:
            pass
    raw = _load_file().get(name)
    if not raw:
        return ""
    try:
        return _unprotect(base64.b64decode(raw)).decode("utf-8")
    except Exception:
        return ""


def set(name: str, value: str) -> None:  # noqa: A001 - mirrors keyring API
    if name not in NAMES:
        raise ValueError("unknown secret")
    value = (value or "").strip()
    kr = _keyring()
    if kr:
        try:
            if value:
                kr.set_password("VulnScan", name, value)
            else:
                kr.delete_password("VulnScan", name)
            return
        except Exception:
            pass
    d = _load_file()
    if value:
        d[name] = base64.b64encode(_protect(value.encode("utf-8"))).decode("ascii")
    else:
        d.pop(name, None)
    _save_file(d)


def masked(name: str) -> dict:
    v = get(name)
    if not v:
        return {"set": False, "hint": ""}
    return {"set": True, "hint": ("•" * 8) + v[-4:] if len(v) > 8 else "•" * 8,
            "from_env": bool(os.environ.get(name))}

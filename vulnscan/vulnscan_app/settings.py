"""Settings saved to settings.json in the app's data folder and reloaded on start."""
import copy
import json
import re
import threading

from .paths import settings_path

DEFAULT_SOURCES = [
    {"id": "nvd", "name": "NVD (NIST)", "type": "json", "adapter": "nvd", "enabled": True,
     "url": "https://services.nvd.nist.gov/rest/json/cves/2.0",
     "note": "Uses your NVD API key if set. Incremental by last-modified date."},
    {"id": "cisa_kev", "name": "CISA Known Exploited", "type": "json", "adapter": "cisa_kev", "enabled": True,
     "url": "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
     "note": "Marks CVEs that are exploited in the wild."},
    {"id": "github", "name": "GitHub Advisory Database", "type": "json", "adapter": "github", "enabled": True,
     "url": "https://api.github.com/advisories",
     "note": "Uses your GitHub token if set. Reviewed advisories."},
    {"id": "redhat", "name": "Red Hat Security Data", "type": "json", "adapter": "redhat", "enabled": True,
     "url": "https://access.redhat.com/hydra/rest/securitydata/cve.json",
     "note": "Red Hat 'Important' is shown as HIGH, 'Moderate' as MEDIUM."},
    {"id": "euvd", "name": "EU Vulnerability Database (ENISA)", "type": "json", "adapter": "euvd", "enabled": True,
     "url": "https://euvdservices.enisa.europa.eu/api/",
     "note": "A supplement; it has gaps. Fetches newly published entries."},
    {"id": "osv", "name": "OSV (osv.dev)", "type": "json", "adapter": "osv", "enabled": False,
     "url": "https://api.osv.dev/v1/query", "mapping": {"packages": ""},
     "note": "Placeholder: needs a list of packages to check (ecosystem:name@version per line)."},
    {"id": "oracle", "name": "Oracle Critical Patch Update", "type": "web", "adapter": "oracle", "enabled": False,
     "url": "https://www.oracle.com/security-alerts/", "mapping": {"sections": "java"},
     "note": "Quarterly. Reads the latest update's risk matrices for the sections listed (default: Java)."},
    {"id": "ncsc_ie", "name": "NCSC Ireland alerts", "type": "web", "adapter": "generic", "enabled": False,
     "url": "https://www.ncsc.gov.ie/news/", "mapping": {"link_pattern": ""},
     "note": "Placeholder: records the CVE IDs mentioned on the NCSC news and alerts page."},
    {"id": "aws", "name": "AWS Security Bulletins", "type": "rss", "adapter": "generic", "enabled": False,
     "url": "https://aws.amazon.com/security/security-bulletins/rss/feed/",
     "note": "Placeholder: RSS feed of AWS bulletins."},
]

DEFAULTS = {
    "app_title": "VulnScan",
    "tagline": "Today's security vulnerabilities, ranked by what matters most.",
    "first_scan_days": 30,
    "phone_access": False,
    "sources": DEFAULT_SOURCES,
}

TYPES = ("json", "rss", "web")
_lock = threading.RLock()


def _slug(name, taken):
    base = re.sub(r"[^a-z0-9]+", "_", (name or "source").lower()).strip("_")[:24] or "source"
    s, i = base, 2
    while s in taken:
        s, i = f"{base}_{i}", i + 1
    return s


def load():
    with _lock:
        try:
            data = json.loads(settings_path().read_text(encoding="utf-8"))
        except Exception:
            data = {}
        out = copy.deepcopy(DEFAULTS)
        out.update({k: v for k, v in data.items() if k in DEFAULTS})
        return validate(out)


def validate(s):
    s["app_title"] = str(s.get("app_title") or DEFAULTS["app_title"])[:60]
    s["tagline"] = str(s.get("tagline") if s.get("tagline") is not None else DEFAULTS["tagline"])[:200]
    try:
        s["first_scan_days"] = max(1, min(120, int(s.get("first_scan_days") or 30)))
    except (TypeError, ValueError):
        s["first_scan_days"] = 30
    s["phone_access"] = bool(s.get("phone_access"))
    clean, taken = [], set()
    builtin_ids = {d["id"]: d for d in DEFAULT_SOURCES}
    for src in s.get("sources") or []:
        if not isinstance(src, dict):
            continue
        sid = str(src.get("id") or "")
        if not sid or sid in taken or not re.fullmatch(r"[a-z0-9_]{1,40}", sid):
            sid = _slug(src.get("name"), taken | set(builtin_ids))
        taken.add(sid)
        adapter = src.get("adapter") or "generic"
        if sid in builtin_ids:
            adapter = builtin_ids[sid]["adapter"]
        elif adapter != "generic":
            adapter = "generic"  # only the built-in rows use built-in adapters
        typ = src.get("type") if src.get("type") in TYPES else "json"
        mapping = src.get("mapping") if isinstance(src.get("mapping"), dict) else {}
        url = str(src.get("url") or "").strip()
        if url and not re.match(r"^https?://", url, re.I):
            url = "https://" + url
        clean.append({
            "id": sid, "name": str(src.get("name") or sid)[:80], "type": typ, "adapter": adapter,
            "url": url[:500], "enabled": bool(src.get("enabled")),
            "mapping": {str(k)[:40]: str(v)[:5000] for k, v in mapping.items()},
            "note": str(src.get("note") or "")[:300],
        })
    s["sources"] = clean
    return s


def save(s):
    with _lock:
        s = validate(dict(s))
        p = settings_path()
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(s, indent=2), encoding="utf-8")
        tmp.replace(p)
        return s


def reset():
    return save(copy.deepcopy(DEFAULTS))

"""SQLite storage. Same common record shape and tables as collector.py:

vulns(source, vuln_id, aliases, title, summary, severity_score, severity_label,
      affected, exploited, published, modified, url)  PRIMARY KEY (source, vuln_id)
last_run(source, ts)
"""
import json
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from .paths import db_path

FIELDS = ("source", "vuln_id", "aliases", "title", "summary", "severity_score",
          "severity_label", "affected", "exploited", "published", "modified", "url")

_lock = threading.RLock()


def connect(path=None):
    con = sqlite3.connect(str(path or db_path()), check_same_thread=False, timeout=30)
    try:
        con.execute("PRAGMA journal_mode=WAL")  # lets the table be read while a scan writes
    except sqlite3.DatabaseError:
        pass
    con.execute("""CREATE TABLE IF NOT EXISTS vulns (
        source TEXT, vuln_id TEXT, aliases TEXT, title TEXT, summary TEXT,
        severity_score REAL, severity_label TEXT, affected TEXT,
        exploited INTEGER DEFAULT 0, published TEXT, modified TEXT, url TEXT,
        PRIMARY KEY (source, vuln_id))""")
    con.execute("CREATE TABLE IF NOT EXISTS last_run (source TEXT PRIMARY KEY, ts TEXT)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_vulns_dates ON vulns(modified, published)")
    con.commit()
    return con


def blank(source, vuln_id):
    return dict(source=source, vuln_id=vuln_id, aliases="", title="", summary="",
                severity_score=None, severity_label="", affected="", exploited=0,
                published="", modified="", url="")


def save(con, rec):
    rec = {k: rec.get(k, "") for k in FIELDS}
    if not rec["vuln_id"]:
        return False
    if rec["severity_score"] in ("", None):
        rec["severity_score"] = None
    else:
        try:
            rec["severity_score"] = float(rec["severity_score"])
        except (TypeError, ValueError):
            rec["severity_score"] = None
    rec["severity_label"] = normalise_label(rec["severity_label"], rec["severity_score"])
    rec["exploited"] = 1 if rec["exploited"] else 0
    for k in ("aliases", "title", "summary", "affected", "published", "modified", "url"):
        v = rec[k]
        if v is None:
            rec[k] = ""
        elif not isinstance(v, str):
            rec[k] = json.dumps(v)
    with _lock:
        con.execute("""INSERT OR REPLACE INTO vulns VALUES
            (:source,:vuln_id,:aliases,:title,:summary,:severity_score,:severity_label,
             :affected,:exploited,:published,:modified,:url)""", rec)
    return True


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000")


def get_last(con, source, default_days=30):
    row = con.execute("SELECT ts FROM last_run WHERE source=?", (source,)).fetchone()
    if row and row[0]:
        return row[0]
    return (datetime.now(timezone.utc) - timedelta(days=default_days)).strftime("%Y-%m-%dT%H:%M:%S.000")


def set_last(con, source, ts=None):
    with _lock:
        con.execute("INSERT OR REPLACE INTO last_run VALUES (?,?)", (source, ts or now_iso()))


def last_runs(con):
    return dict(con.execute("SELECT source, ts FROM last_run").fetchall())


def clear_source(con, source):
    with _lock:
        con.execute("DELETE FROM vulns WHERE source=?", (source,))
        con.execute("DELETE FROM last_run WHERE source=?", (source,))
        con.commit()


# ---------------------------------------------------------------- labels ----
_LABEL_MAP = {
    "CRITICAL": "CRITICAL", "HIGH": "HIGH", "IMPORTANT": "HIGH",  # Red Hat "important"
    "MEDIUM": "MEDIUM", "MODERATE": "MEDIUM", "LOW": "LOW", "NONE": "NONE",
}


def label_from_score(score):
    if score is None:
        return ""
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    if score > 0:
        return "LOW"
    return "NONE"


def normalise_label(label, score=None):
    lab = (label or "").strip().upper()
    if lab in _LABEL_MAP:
        return _LABEL_MAP[lab]
    return label_from_score(score) if score is not None else ""


# ------------------------------------------------------------- exploited ----
CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}", re.I)


def mark_exploited_from_kev(con):
    """Flag every record whose CVE (its ID or an alias) is in CISA KEV or that
    another source reports as exploited. Runs after each scan."""
    with _lock:
        exploited = {r[0].upper() for r in con.execute(
            "SELECT vuln_id FROM vulns WHERE exploited=1 AND vuln_id LIKE 'CVE-%'")}
        for (aliases,) in con.execute("SELECT aliases FROM vulns WHERE exploited=1 AND aliases != ''"):
            exploited.update(m.upper() for m in CVE_RE.findall(aliases))
        if not exploited:
            return 0
        n = 0
        rows = con.execute("SELECT rowid, vuln_id, aliases FROM vulns WHERE exploited=0").fetchall()
        for rowid, vid, aliases in rows:
            ids = {vid.upper()} | {m.upper() for m in CVE_RE.findall(aliases or "")}
            if ids & exploited:
                con.execute("UPDATE vulns SET exploited=1 WHERE rowid=?", (rowid,))
                n += 1
        con.commit()
        return n


# ------------------------------------------------------------------ query ----
SEVERITY_SETS = {
    "critical": ("CRITICAL",),
    "high": ("CRITICAL", "HIGH"),
    "all": None,
}


def build_where(filters):
    f = filters or {}
    where, params = [], []
    days = int(f.get("days") or 7)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    where.append("(substr(modified,1,10) >= ? OR substr(published,1,10) >= ?)")
    params += [cutoff, cutoff]
    sev = SEVERITY_SETS.get(f.get("severity") or "high")
    if sev:
        # As in report.py: known exploited items always count, whatever their score.
        where.append("(exploited = 1 OR severity_label IN (%s))" % ",".join("?" * len(sev)))
        params += list(sev)
    if f.get("exploited_only"):
        where.append("exploited = 1")
    src = f.get("source") or ""
    if src:
        where.append("source = ?")
        params.append(src)
    q = (f.get("q") or "").strip()
    if q:
        for word in q.split()[:6]:
            like = "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where.append("(vuln_id LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\' OR "
                         "affected LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')")
            params += [like] * 5
    return " AND ".join(where), params


ORDER = """ORDER BY exploited DESC,
    CASE severity_label WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2
                        WHEN 'LOW' THEN 3 ELSE 4 END,
    severity_score IS NULL, severity_score DESC,
    COALESCE(NULLIF(modified,''), published) DESC"""


def affected_text(raw, limit=160):
    """Turn the stored affected JSON into a short readable string."""
    if not raw:
        return ""
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return raw[:limit]
    parts = []
    for item in data if isinstance(data, list) else [data]:
        if isinstance(item, str):
            s = item
            if s.startswith("cpe:2.3:"):
                bits = s.split(":")
                vendor, product = bits[3:5] if len(bits) > 4 else ("", "")
                version = bits[5] if len(bits) > 5 and bits[5] not in ("*", "-") else ""
                name = product if product.startswith(vendor) else f"{vendor} {product}"
                s = f"{name} {version}".replace("_", " ").strip()
            parts.append(s)
        elif isinstance(item, dict):
            name = item.get("package") or item.get("product") or item.get("name") or ""
            rng = item.get("range") or item.get("version") or ""
            parts.append((str(name) + " " + str(rng)).strip())
    out, seen = [], set()
    for p in parts:
        p = p.strip()
        if p and p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
    text = "; ".join(out)
    return text if len(text) <= limit else text[:limit - 1] + "…"


def query(con, filters, limit=None, offset=0):
    where, params = build_where(filters)
    sql = f"""SELECT vuln_id, source, exploited, severity_label, severity_score, affected,
                     title, summary, published, modified, url, aliases
              FROM vulns WHERE {where} {ORDER}"""
    if limit:
        sql += " LIMIT ? OFFSET ?"
        params = params + [int(limit), int(offset)]
    rows = []
    for r in con.execute(sql, params):
        title = r[6] or ""
        summary = (r[7] or "").replace("\r", " ").replace("\n", " ").strip()
        rows.append({
            "id": r[0], "source": r[1], "exploited": bool(r[2]), "severity": r[3] or "",
            "score": r[4], "affected": affected_text(r[5]),
            "summary": (title + " - " + summary if title and summary and not summary.startswith(title)
                        else title or summary)[:400],
            "published": (r[8] or "")[:10], "modified": (r[9] or "")[:10],
            "url": r[10] or "", "aliases": r[11] or "",
        })
    return rows


def count(con, filters):
    where, params = build_where(filters)
    return con.execute(f"SELECT COUNT(*), COALESCE(SUM(exploited),0) FROM vulns WHERE {where}", params).fetchone()


def totals(con):
    total = con.execute("SELECT COUNT(*) FROM vulns").fetchone()[0]
    by_source = dict(con.execute("SELECT source, COUNT(*) FROM vulns GROUP BY source").fetchall())
    return total, by_source


def summary(con, days=7):
    """The report.py one-liner for a time window."""
    total, _ = totals(con)
    n, exploited = count(con, {"days": days, "severity": "high"})
    return {"total": total, "matching": n, "exploited": exploited, "days": days,
            "text": f"{total:,} records in database, {n:,} exploited or critical/high in the last "
                    f"{days} days ({exploited:,} known exploited)."}

"""Builds the phone-friendly web version of VulnScan (used by the Pages workflow).

Collects every source (as the desktop Scan does), then writes a static site:
  index.html, web.js, style.css, icon.svg
  data/meta.json   when it was collected, per-source ok/FAIL, totals
  data/core.json   exploited or critical/high records from the last 30 days
  data/rest.json   everything else from the last 30 days (loaded only for "Everything")
  report.pdf / report.xlsx   the default view (last 7 days, critical and high)
Usage: python tools/build_web.py OUTPUT_DIR
"""
import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
out = Path(sys.argv[1]).resolve()
os.environ.setdefault("VULNSCAN_HOME", tempfile.mkdtemp(prefix="vsweb-"))

from vulnscan_app import adapters, exporter, settings, store  # noqa: E402

WEB_SOURCES = {"nvd", "cisa_kev", "github", "redhat", "euvd", "oracle", "ncsc_ie", "aws"}
SEV = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", ""]

con = store.connect()
sources = [dict(s, enabled=s["id"] in WEB_SOURCES) for s in settings.DEFAULT_SOURCES]
status = []
for src in [s for s in sources if s["enabled"]]:
    ctx = adapters.Ctx(con, src, log=lambda m, n=src["name"]: print(f"   {n}: {m}", flush=True), first_days=30)
    t0 = time.time()
    try:
        adapters.adapter_for(src)(ctx)
        con.commit()
        status.append({"id": src["id"], "name": src["name"], "status": "ok", "count": ctx.saved, "error": ""})
        print(f"ok    {src['name']}: {ctx.saved:,} in {time.time() - t0:.0f}s", flush=True)
    except Exception as e:  # noqa: BLE001 - a failed source never stops the others
        con.commit()
        status.append({"id": src["id"], "name": src["name"], "status": "fail", "count": ctx.saved, "error": str(e)[:400]})
        print(f"FAIL  {src['name']}: {e}", flush=True)
store.mark_exploited_from_kev(con)

src_ids = [s["id"] for s in sources if s["enabled"]]
URL_TEMPLATES = {"nvd": "https://nvd.nist.gov/vuln/detail/{}", "cisa_kev": "https://nvd.nist.gov/vuln/detail/{}",
                 "redhat": "https://access.redhat.com/security/cve/{}", "euvd": "https://euvd.enisa.europa.eu/vulnerability/{}"}


def pack(r):
    """Compact row: [id, source#, exploited, severity#, score, affected, summary, published, modified, url, aliases]"""
    tmpl = URL_TEMPLATES.get(r["source"])
    url = "" if tmpl and r["url"] == tmpl.format(r["id"]) else r["url"]
    summary = r["summary"]
    return [r["id"], src_ids.index(r["source"]) if r["source"] in src_ids else -1, 1 if r["exploited"] else 0,
            SEV.index(r["severity"]) if r["severity"] in SEV else 5,
            r["score"], r["affected"][:90], summary[:170] + ("…" if len(summary) > 170 else ""),
            r["published"], r["modified"], url, r["aliases"][:60]]


core = store.query(con, {"days": 30, "severity": "high"})
everything = store.query(con, {"days": 30, "severity": "all"})
core_keys = {(r["source"], r["id"]) for r in core}
rest = [r for r in everything if (r["source"], r["id"]) not in core_keys]

shutil.rmtree(out, ignore_errors=True)
(out / "data").mkdir(parents=True)
for name in ("style.css", "icon.svg"):
    shutil.copy(ROOT / "vulnscan_app" / "static" / name, out / name)
for name in ("index.html", "web.js"):
    shutil.copy(ROOT / "web" / name, out / name)

total, by_source = store.totals(con)
meta = {
    "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "sources": [dict(s, records=by_source.get(s["id"], 0)) for s in status],
    "source_ids": src_ids, "source_names": [next(s["name"] for s in sources if s["id"] == i) for i in src_ids],
    "url_templates": URL_TEMPLATES, "severities": SEV, "total": total,
    "core_rows": len(core), "rest_rows": len(rest),
}
(out / "data" / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
(out / "data" / "core.json").write_text(json.dumps([pack(r) for r in core], separators=(",", ":")), encoding="utf-8")
(out / "data" / "rest.json").write_text(json.dumps([pack(r) for r in rest], separators=(",", ":")), encoding="utf-8")

default_rows = store.query(con, {"days": 7, "severity": "high"})
summ = store.summary(con, 7)
(out / "report.pdf").write_bytes(exporter.to_pdf(default_rows, summ, {"days": 7, "severity": "high"}, "VulnScan"))
(out / "report.xlsx").write_bytes(exporter.to_xlsx(default_rows, summ, {"days": 7, "severity": "high"}, "VulnScan"))
for f in sorted(out.rglob("*")):
    if f.is_file():
        print(f"{f.relative_to(out)}: {f.stat().st_size:,} bytes")
print(summ["text"])

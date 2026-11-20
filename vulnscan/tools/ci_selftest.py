"""CI helper: runs the built VulnScan program with every source switched on,
against the live feeds, and prints an ok/FAIL line per source.
Usage: python tools/ci_selftest.py dist/VulnScan.exe OUTPUT_DIR"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vulnscan_app import settings  # noqa: E402

exe, outdir = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
outdir.mkdir(parents=True, exist_ok=True)
home = Path(tempfile.mkdtemp(prefix="vshome-"))
sources = []
for s in settings.DEFAULT_SOURCES:
    s = dict(s, enabled=True, mapping=dict(s.get("mapping") or {}))
    if s["id"] == "osv":
        s["mapping"]["packages"] = "PyPI:requests@2.19.0\nnpm:lodash@4.17.15"
    sources.append(s)
(home / "settings.json").write_text(json.dumps({"first_scan_days": 7, "sources": sources}))
out = outdir / "selftest.json"
env = dict(os.environ, VULNSCAN_HOME=str(home))
proc = subprocess.run([str(exe), "--selftest", str(out)], env=env, timeout=1800)
if (home / "error.log").exists():
    print((home / "error.log").read_text())
if not out.exists():
    sys.exit(f"self-test wrote no results (exit code {proc.returncode})")
d = json.loads(out.read_text())
print(f"page served: {d['index_ok']} | xlsx bytes: {d['export_xlsx_bytes']:,} | pdf bytes: {d['export_pdf_bytes']:,}")
for s in d["scan"]["sources"]:
    print(f"{s['status'].upper() if s['status'] == 'fail' else s['status']:5} {s['name']:36} {s['message']} {s['error']}")
print(d["summary"]["text"])
for kind in ("pdf", "xlsx"):
    shutil.copy(out.with_suffix("." + kind), outdir / f"sample-report.{kind}")
ok = d["index_ok"] and d["export_pdf_bytes"] > 1000 and d["export_xlsx_bytes"] > 1000
sys.exit(0 if ok else 1)

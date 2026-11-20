"""Command-line collector, as in the original collector.py: pulls every enabled
source into vulns.db (in the app's data folder) and prints ok/FAIL per source.
Keys come from the NVD_API_KEY / GITHUB_TOKEN environment variables or the app's settings."""
from vulnscan_app import adapters, settings, store
from vulnscan_app.paths import db_path

if __name__ == "__main__":
    con = store.connect()
    cfg = settings.load()
    for src in [s for s in cfg["sources"] if s["enabled"]]:
        ctx = adapters.Ctx(con, src, log=lambda m, n=src["name"]: print(f"      {n}: {m}"),
                           first_days=cfg["first_scan_days"])
        try:
            result = adapters.adapter_for(src)(ctx)
            if result != adapters.KEEP_LAST:
                store.set_last(con, src["id"], result if isinstance(result, str) else None)
            con.commit()
            print("ok   ", src["id"], ctx.saved)
        except Exception as e:  # noqa: BLE001
            con.commit()
            print("FAIL ", src["id"], e)
    store.mark_exploited_from_kev(con)
    n = con.execute("SELECT COUNT(*) FROM vulns").fetchone()[0]
    print(n, "records in", db_path())

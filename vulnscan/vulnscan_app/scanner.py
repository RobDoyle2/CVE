"""Runs every enabled source, one after another. A failed source never stops the
others; its error text is kept so it can be shown and copied."""
import threading
import time
import traceback
from datetime import datetime

from . import adapters, settings, store


class Scanner:
    def __init__(self, con):
        self.con = con
        self.lock = threading.Lock()
        self.thread = None
        self.cancel = False
        self.state = {"running": False, "started": None, "finished": None, "sources": [], "log": []}

    # ---------------------------------------------------------------- scan ----
    def start(self, only=None):
        with self.lock:
            if self.state["running"]:
                return False
            cfg = settings.load()
            srcs = [s for s in cfg["sources"] if s["enabled"] and (not only or s["id"] in only)]
            self.cancel = False
            self.state = {
                "running": True, "started": datetime.now().isoformat(timespec="seconds"), "finished": None,
                "sources": [{"id": s["id"], "name": s["name"], "status": "waiting", "message": "",
                             "saved": 0, "error": ""} for s in srcs],
                "log": [],
            }
            self.thread = threading.Thread(target=self._run, args=(srcs, cfg), daemon=True)
            self.thread.start()
            return True

    def stop(self):
        self.cancel = True

    def _run(self, srcs, cfg):
        session = adapters.new_session()
        try:
            for i, src in enumerate(srcs):
                st = self.state["sources"][i]
                if self.cancel:
                    st.update(status="skipped", message="scan stopped")
                    continue
                st["status"] = "running"
                t0 = time.time()

                def log(msg, st=st):
                    st["message"] = msg

                ctx = adapters.Ctx(self.con, src, session=session, log=log,
                                   first_days=cfg["first_scan_days"], cancelled=lambda: self.cancel)
                try:
                    result = adapters.adapter_for(src)(ctx)
                    if result != adapters.KEEP_LAST:
                        store.set_last(self.con, src["id"], result if isinstance(result, str) else None)
                    self.con.commit()
                    st.update(status="ok", saved=ctx.saved,
                              message=f"{ctx.saved:,} records in {time.time() - t0:.0f}s"
                                      + (f" - {st['message']}" if "next scan" in st["message"] else ""))
                except Exception as e:  # noqa: BLE001 - any failure is reported, never fatal
                    self.con.commit()  # keep whatever was saved before the failure
                    err = str(e) if isinstance(e, adapters.AdapterError) else f"{e.__class__.__name__}: {e}"
                    st.update(status="fail", saved=ctx.saved, error=err[:600], message="")
                    self.state["log"].append(f"{src['name']}: {traceback.format_exc(limit=3)}")
            try:
                n = store.mark_exploited_from_kev(self.con)
                if n:
                    self.state["log"].append(f"marked {n} records as known exploited from CISA KEV")
            except Exception as e:  # noqa: BLE001
                self.state["log"].append(f"exploited marking failed: {e}")
        finally:
            self.state["running"] = False
            self.state["finished"] = datetime.now().isoformat(timespec="seconds")

    # ---------------------------------------------------------------- test ----
    def test_source(self, src, first_days=30, con=None):
        """Fetch a source once, without saving, and say whether it worked."""
        msgs = []
        ctx = adapters.Ctx(con or self.con, src, test=True, log=msgs.append, first_days=first_days)
        t0 = time.time()
        try:
            adapters.adapter_for(src)(ctx)
        except Exception as e:  # noqa: BLE001
            err = str(e) if isinstance(e, adapters.AdapterError) else f"{e.__class__.__name__}: {e}"
            return {"ok": False, "error": err[:600], "log": msgs[-5:]}
        sample = [{k: r.get(k) for k in ("vuln_id", "title", "severity_label", "severity_score", "published")}
                  for r in ctx.samples]
        ok = ctx.saved > 0
        return {"ok": ok, "count": ctx.saved, "seconds": round(time.time() - t0, 1), "sample": sample,
                "log": msgs[-5:],
                "error": "" if ok else "It answered but no vulnerability records were found. Check the URL and mapping."}

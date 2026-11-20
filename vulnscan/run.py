"""VulnScan launcher - this is what the double-click program runs.

Starts the local server and opens the app window (Microsoft Edge in app mode on
Windows, otherwise the default browser). Closing the window quits the app after
a short delay, unless phone access is switched on.

Options:  --no-window   don't open a window (e.g. for phone-only use)
          --selftest F  run every enabled source once, write results to F, exit
"""
import argparse
import json
import os
import subprocess
import sys
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

IDLE_QUIT_SECONDS = 180


def message_box(text, title="VulnScan"):
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, text, title, 0x10)
            return
        except Exception:
            pass
    print(text, file=sys.stderr)


def already_running(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=1.5) as r:
            return json.loads(r.read()).get("app") == "VulnScan"
    except Exception:
        return False


def open_window(url):
    if sys.platform == "win32":
        from vulnscan_app.paths import data_dir
        candidates = [Path(os.environ.get(v, "")) / "Microsoft/Edge/Application/msedge.exe"
                      for v in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        for exe in candidates:
            if exe.is_file():
                try:
                    subprocess.Popen([str(exe), f"--app={url}", "--no-first-run", "--no-default-browser-check",
                                      f"--user-data-dir={data_dir() / 'window'}", "--window-size=1280,860"],
                                     close_fds=True)
                    return
                except OSError:
                    break
    webbrowser.open(url)


def selftest(out_path):
    """Scan every enabled source once and write a JSON report (used by CI)."""
    from vulnscan_app import server, store
    app, httpd = server.serve()
    url = f"http://127.0.0.1:{app.port}"
    report = {"port": app.port}
    with urllib.request.urlopen(url + "/", timeout=10) as r:
        report["index_ok"] = r.status == 200 and b"VulnScan" in r.read()
    app.scanner.start()
    while app.scanner.state["running"]:
        time.sleep(1)
    report["scan"] = app.scanner.state
    report["summary"] = store.summary(store.connect(), 7)
    for kind in ("xlsx", "pdf"):
        with urllib.request.urlopen(f"{url}/api/export.{kind}?days=7&severity=high", timeout=120) as r:
            body = r.read()
            report[f"export_{kind}_bytes"] = len(body)
            Path(out_path).with_suffix("." + kind).write_bytes(body)
    Path(out_path).write_text(json.dumps(report, indent=2), encoding="utf-8")
    httpd.shutdown()


def main():
    ap = argparse.ArgumentParser(prog="VulnScan")
    ap.add_argument("--no-window", action="store_true")
    ap.add_argument("--selftest", metavar="FILE")
    ap.add_argument("--port", type=int, default=0)
    args = ap.parse_args()

    if args.selftest:
        selftest(args.selftest)
        return

    from vulnscan_app import server, settings
    from vulnscan_app.paths import data_dir
    port = args.port or int(os.environ.get("VULNSCAN_PORT") or server.DEFAULT_PORT)
    if already_running(port):
        open_window(f"http://127.0.0.1:{port}/")
        return
    app, httpd = server.serve(port if not args.port else args.port)
    url = f"http://127.0.0.1:{app.port}/"
    print(f"VulnScan is running at {url}  (data folder: {data_dir()})")
    if not args.no_window:
        open_window(url)
    start = time.time()
    while not app.quit_event.wait(5):
        idle_since = app.last_ping or start
        if (not args.no_window and not settings.load()["phone_access"]
                and not app.scanner.state["running"] and time.time() - idle_since > IDLE_QUIT_SECONDS):
            break  # the window was closed
    httpd.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        try:
            from vulnscan_app.paths import data_dir
            (data_dir() / "error.log").write_text(traceback.format_exc(), encoding="utf-8")
        except Exception:
            pass
        message_box("VulnScan could not start:\n\n" + traceback.format_exc(limit=3))
        sys.exit(1)

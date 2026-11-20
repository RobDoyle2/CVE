"""Command-line report, as in the original report.py: exploited or critical/high
records from the last 7 days, worst first, written to report.csv."""
import csv
import sys

from vulnscan_app import store

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 7

if __name__ == "__main__":
    con = store.connect()
    f = {"days": DAYS, "severity": "high"}
    rows = store.query(con, f)
    with open("report.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["ID", "Source", "Exploited", "Severity", "Score",
                    "Affected product", "Summary", "Published", "Modified", "Link"])
        for r in rows:
            w.writerow([r["id"], r["source"], "YES" if r["exploited"] else "", r["severity"], r["score"],
                        r["affected"][:120], r["summary"][:200], r["published"], r["modified"], r["url"]])
    print(store.summary(con, DAYS)["text"], "Written to report.csv")

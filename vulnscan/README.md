# VulnScan

Today's security vulnerabilities, ranked by what matters most.

VulnScan collects vulnerabilities from public sources into one local database and shows the worst first:
known-exploited items, then critical, then high. It is a desktop program for Windows: double-click it, press **Scan**, and read the results. A phone on the same home Wi-Fi can open it too (see below). It uses public data only, and everything stays on your computer.

## Using it

1. Double-click **VulnScan.exe**. The first time, Windows SmartScreen may say "Windows protected your PC", because the program isn't code-signed. Click **More info**, then **Run anyway**.
2. It opens in its own window. Press **Scan**. Each source shows a live line: **ok** with a count, or **FAIL** with the error text. A failed source never stops the others. Select its error text to copy it.
3. The first scan looks back 30 days and can take a few minutes, mostly waiting for the NVD. Later scans only fetch what changed.
4. Use the filter bar to narrow the table. Filters only change what you see; nothing is fetched again. The count shows, for example, *Showing 35 of 1,200*.
5. **Export Excel** or **Export PDF** saves exactly the rows the filters show. The file goes to your Downloads folder.
6. Closing the window quits VulnScan after a few minutes. You can also use **Settings → Quit VulnScan**.

### Settings

* **Sources:** switch each source on or off, edit its address, **Test** it, delete it, or **Add source**. Changes save automatically. **Reset to defaults** restores the list, but keeps your keys and data.
* **Your own sources** need no code:
  * **JSON API:** open **Mapping** and enter dotted paths, for example `data.items` for the list and `cve.id` for the ID. In the URL, `{since}` is replaced with the last scan date.
  * **RSS feed:** needs only the address. CVE IDs in each item are picked up automatically.
  * **Web page:** records every CVE ID on the page. It can optionally follow links that match a pattern.
* **API keys:** the NVD API key and GitHub token are optional, but make scans much faster. They are encrypted with your Windows account (DPAPI) and only the last 4 characters are ever shown.
  * NVD key: free from nvd.nist.gov → Developers → Request an API Key.
  * GitHub token: GitHub → Settings → Developer settings → Personal access tokens. It needs no permissions.
* **Use on your phone:** tick *Allow my phone to connect*, then scan the QR code with the phone (same Wi-Fi). The link contains a private key, and without it the phone gets "Access denied". When Windows asks about the firewall, allow **private networks only**. From the phone you can scan, filter, export and change sources. Keys, phone access and Quit can only be changed on the computer. **Make a new link** stops the old link working. The connection is plain HTTP on your home network, which suits public data, but don't turn this on over public Wi-Fi.

### Where things are stored

`%APPDATA%\VulnScan\`: `vulns.db` (SQLite: the common record table `vulns` keyed on source + ID, plus `last_run`), `settings.json`, `secrets.json` (encrypted keys) and `error.log` if startup ever fails.

## Sources

| Source | Default | How it is read |
|---|---|---|
| NVD (NIST) | on | CVE API 2.0, by last-modified date (split into 120-day windows), 2,000 per page, retries when busy |
| CISA Known Exploited | on | The full KEV JSON file each scan. Every matching CVE from any source is flagged **exploited** |
| GitHub Advisory Database | on | `GET /advisories`, by modified date, oldest first, page links followed |
| Red Hat Security Data | on | `cve.json?after=` by public date. "Important" is shown as HIGH, "Moderate" as MEDIUM |
| EU Vulnerability Database (ENISA) | on | `/api/search` by date range, falling back to the latest/critical/exploited lists |
| OSV | off | Placeholder: list packages as `ecosystem:name@version` under Mapping |
| Oracle Critical Patch Update | off | Reads the latest quarterly update's risk matrices (default section: Java) |
| NCSC Ireland | off | Placeholder: records CVE IDs found on the page |
| AWS Security Bulletins | off | Placeholder: RSS feed |

## Command line (the original scripts)

`collector.py` and `report.py` still work and use the same database:

```
pip install -r requirements.txt
python collector.py        # ok / FAIL per source
python report.py           # writes report.csv (exploited or critical/high, last 7 days)
python run.py              # the app itself, without building
```

## Building the .exe

**Automatically:** every push that changes `vulnscan/` runs the *VulnScan Windows build* workflow in GitHub Actions. It:

1. runs the tests;
2. builds `VulnScan.exe`;
3. checks every source's live address and field names;
4. runs the built program against the live feeds.

Download **VulnScan-windows** from the run's *Artifacts* section. The *selftest-results* artifact holds that run's per-source results and a sample PDF and Excel report.

**On a Windows PC:** install Python 3.12 from python.org (tick *Add Python to PATH*), then double-click `build_windows.bat`. The program appears at `dist\VulnScan.exe`.

**Mac:** the same `pyinstaller packaging/vulnscan.spec` command works on a Mac and produces a Mac program. It is not built automatically yet.

## Tests

```
pip install -r requirements.txt -r requirements-build.txt
python -m pytest tests -q
```

## Not in this version

* Merging the same vulnerability reported by several sources into one line.
* Full OSV, NCSC Ireland and AWS adapters. They exist as switched-off placeholders.
* Comparing against a software inventory, and the "Only things we run" filter.

"""Live check of every source's web address and field names (used by CI).

For each source it fetches a small sample, then lists the fields the adapter
reads that are missing from the real response. Exit code is 0 either way;
the output is the report."""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import requests  # noqa: E402

from vulnscan_app.adapters import USER_AGENT, parse_feed  # noqa: E402

S = requests.Session()
S.headers["User-Agent"] = USER_AGENT
NOW = datetime.now(timezone.utc)
results = []


def check(name, url, expect_top=(), expect_item=(), items=lambda d: d, **kw):
    line = {"source": name, "url": url}
    try:
        r = S.get(url, timeout=90, **kw)
        line["http"] = r.status_code
        if r.status_code >= 400:
            line["result"] = "FAIL"
            line["detail"] = r.text[:300]
            return results.append(line)
        d = r.json()
        miss_top = [k for k in expect_top if k not in d] if isinstance(d, dict) else []
        lst = items(d)
        line["items"] = len(lst) if isinstance(lst, list) else None
        first = lst[0] if isinstance(lst, list) and lst else {}
        miss_item = [k for k in expect_item if _missing(first, k)]
        line["top_level_keys"] = sorted(d.keys())[:30] if isinstance(d, dict) else f"list[{len(d)}]"
        line["item_keys"] = sorted(first.keys())[:60] if isinstance(first, dict) else str(type(first))
        line["missing_fields"] = miss_top + miss_item
        line["result"] = "ok" if not (miss_top or miss_item) and lst else "CHECK"
    except Exception as e:  # noqa: BLE001
        line["result"] = "FAIL"
        line["detail"] = f"{e.__class__.__name__}: {e}"[:300]
    results.append(line)


def _missing(obj, dotted):
    cur = obj
    for p in dotted.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return True
        cur = cur[p]
    return False


fmt = "%Y-%m-%dT%H:%M:%S.000Z"
nvd_hdr = {"apiKey": os.environ["NVD_API_KEY"]} if os.environ.get("NVD_API_KEY") else {}
check("NVD", "https://services.nvd.nist.gov/rest/json/cves/2.0",
      ("resultsPerPage", "startIndex", "totalResults", "vulnerabilities"),
      ("cve.id", "cve.published", "cve.lastModified", "cve.descriptions", "cve.metrics"),
      items=lambda d: d.get("vulnerabilities"), headers=nvd_hdr,
      params={"lastModStartDate": (NOW - timedelta(days=1)).strftime(fmt), "lastModEndDate": NOW.strftime(fmt),
              "resultsPerPage": 5})
check("CISA KEV", "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      ("catalogVersion", "vulnerabilities"),
      ("cveID", "vendorProject", "product", "vulnerabilityName", "dateAdded", "shortDescription",
       "requiredAction", "knownRansomwareCampaignUse"), items=lambda d: d.get("vulnerabilities"))
gh_hdr = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
if os.environ.get("GITHUB_TOKEN"):
    gh_hdr["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
check("GitHub advisories", "https://api.github.com/advisories", (),
      ("ghsa_id", "cve_id", "summary", "description", "severity", "published_at", "updated_at", "html_url",
       "vulnerabilities", "identifiers", "cvss_severities"), headers=gh_hdr,
      params={"modified": ">=" + (NOW - timedelta(days=2)).strftime("%Y-%m-%d"), "per_page": 5,
              "sort": "updated", "direction": "asc"})
for form in (">=" + (NOW - timedelta(days=2)).strftime("%Y-%m-%d"),
             (NOW - timedelta(days=2)).strftime("%Y-%m-%d") + ".." + NOW.strftime("%Y-%m-%d")):
    check("GitHub modified " + form, "https://api.github.com/advisories", (), ("ghsa_id", "updated_at"),
          headers=gh_hdr, params={"modified": form, "per_page": 5, "sort": "updated", "direction": "asc"})
check("Red Hat", "https://access.redhat.com/hydra/rest/securitydata/cve.json", (),
      ("CVE", "severity", "public_date", "bugzilla_description", "affected_packages", "resource_url"),
      params={"after": (NOW - timedelta(days=7)).strftime("%Y-%m-%d"), "per_page": 5, "page": 1})
since = (NOW - timedelta(days=3)).strftime("%Y-%m-%d")
for label, params in (("EUVD search by update date", {"fromUpdatedDate": since, "toUpdatedDate": NOW.strftime("%Y-%m-%d")}),
                      ("EUVD search by publish date", {"fromDate": since, "toDate": NOW.strftime("%Y-%m-%d")})):
    check(label, "https://euvdservices.enisa.europa.eu/api/search", ("items",),
          ("id", "description", "datePublished", "dateUpdated", "baseScore", "aliases", "enisaIdProduct"),
          items=lambda d: d.get("items") if isinstance(d, dict) else d, params=dict(params, size=5, page=0))
# Does the EUVD search really filter by date? Compare totals for different ranges.
euvd_totals = {}
for label, params in (("no dates", {}), ("updated last 1 day", {"fromUpdatedDate": (NOW - timedelta(days=1)).strftime("%Y-%m-%d"), "toUpdatedDate": NOW.strftime("%Y-%m-%d")}),
                      ("updated last 7 days", {"fromUpdatedDate": (NOW - timedelta(days=7)).strftime("%Y-%m-%d"), "toUpdatedDate": NOW.strftime("%Y-%m-%d")}),
                      ("published last 7 days", {"fromDate": (NOW - timedelta(days=7)).strftime("%Y-%m-%d"), "toDate": NOW.strftime("%Y-%m-%d")})):
    try:
        j = S.get("https://euvdservices.enisa.europa.eu/api/search", params=dict(params, size=3, page=0), timeout=60).json()
        euvd_totals[label] = (j.get("total"), [(i.get("id"), i.get("datePublished"), i.get("dateUpdated")) for i in j.get("items", [])])
    except Exception as e:  # noqa: BLE001
        euvd_totals[label] = str(e)[:200]
results.append({"source": "EUVD totals by date range", "result": "info", "detail": json.dumps(euvd_totals)[:1500]})
for ep in ("lastvulnerabilities", "exploitedvulnerabilities", "criticalvulnerabilities"):
    check("EUVD " + ep, "https://euvdservices.enisa.europa.eu/api/" + ep, (),
          ("id", "description", "datePublished", "dateUpdated", "baseScore", "aliases"))
check("OSV", "https://api.osv.dev/v1/vulns/GHSA-j8r2-6x86-q33q", ("id", "aliases", "summary", "published", "modified"),
      (), items=lambda d: [d])
# Feeds and pages
for name, url, kind in (("AWS bulletins RSS", "https://aws.amazon.com/security/security-bulletins/rss/feed/", "rss"),
                        ("NCSC Ireland news", "https://www.ncsc.gov.ie/news/", "web"),
                        ("Oracle security alerts", "https://www.oracle.com/security-alerts/", "web")):
    line = {"source": name, "url": url}
    try:
        r = S.get(url, timeout=60)
        line["http"] = r.status_code
        if kind == "rss":
            entries = parse_feed(r.text)
            line["items"] = len(entries)
            line["first"] = entries[0] if entries else None
            line["result"] = "ok" if entries else "CHECK"
        else:
            links = sorted(set(re.findall(r'href="([^"#]*(?:alert|advisor|cpu[a-z]{3}\d{4})[^"]*)"', r.text, re.I)))[:25]
            line["matching_links"] = links
            if "ncsc" in url:
                line["all_links"] = sorted(set(re.findall(r'href="([^"#]+)"', r.text)))[:120]
                line["feeds"] = re.findall(r'<link[^>]+(?:rss|atom)[^>]*>', r.text, re.I)[:5]
                line["page_start"] = r.text[:600]
            line["cve_ids_on_page"] = len(set(re.findall(r"CVE-\d{4}-\d{4,}", r.text)))
            line["result"] = "ok" if r.status_code < 400 else "FAIL"
    except Exception as e:  # noqa: BLE001
        line["result"] = "FAIL"
        line["detail"] = f"{e.__class__.__name__}: {e}"[:300]
    results.append(line)

# Probe likely NCSC Ireland alert addresses (status code and CVE IDs found).
probe = {}
for path in ("alerts/", "advisories/", "news/", "feed/", "rss.xml", "index.xml", "feed.xml", "emailsfrom/", "pdfs/"):
    try:
        r = S.get("https://www.ncsc.gov.ie/" + path, timeout=30)
        probe[path] = (r.status_code, r.headers.get("Content-Type", "")[:40],
                       len(set(re.findall(r"CVE-\d{4}-\d{4,}", r.text))), len(r.text))
    except Exception as e:  # noqa: BLE001
        probe[path] = str(e)[:100]
results.append({"source": "NCSC Ireland address probe", "result": "info", "detail": json.dumps(probe)})

for line in results:
    print(f"{line['result']:6} {line['source']:32} HTTP {line.get('http', '-')}  items={line.get('items', '-')}"
          + (f"  MISSING {line['missing_fields']}" if line.get("missing_fields") else "")
          + (f"  {line['detail']}" if line.get("detail") else ""))
print()
print(json.dumps(results, indent=1, default=str)[:60000])

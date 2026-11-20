"""Source adapters. Each converts one feed into the common record shape.

Built-in adapters follow collector.py (NVD, CISA KEV, GitHub, Red Hat, EUVD)
plus Oracle, OSV and generic JSON / RSS / web-page adapters, so a new source
can be added from the Settings screen with a field mapping and no code.
"""
import html
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import requests

from . import __version__, secrets_store, store

USER_AGENT = f"VulnScan/{__version__} (public vulnerability feed reader)"
CVE_RE = re.compile(r"CVE-\d{4}-\d{4,}", re.I)


class AdapterError(Exception):
    pass


# Returned by an adapter that stopped early, so the next scan starts from the
# same point and nothing is skipped.
KEEP_LAST = "keep-last"


class Ctx:
    """What an adapter gets: the source settings, an HTTP session, a save()
    function and a log() function for progress lines."""

    def __init__(self, con, source, session=None, test=False, log=None,
                 first_days=30, cancelled=None):
        self.con = con
        self.source = source
        self.key = source["id"]
        self.session = session or new_session()
        self.test = test
        self.first_days = first_days
        self._log = log or (lambda msg: None)
        self._cancelled = cancelled or (lambda: False)
        self.saved = 0
        self.samples = []

    @property
    def url(self):
        return (self.source.get("url") or "").strip()

    @property
    def mapping(self):
        return self.source.get("mapping") or {}

    def log(self, msg):
        self._log(msg)

    def check_cancel(self):
        if self._cancelled():
            raise AdapterError("cancelled")

    def since(self):
        """ISO timestamp of the last successful run (or N days ago on first run)."""
        if self.test:
            return (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S.000")
        return store.get_last(self.con, self.key, self.first_days)

    def save(self, rec):
        if not rec.get("vuln_id"):
            return
        rec["source"] = self.key
        if self.test:
            if len(self.samples) < 3:
                self.samples.append(rec)
            self.saved += 1
            return
        if store.save(self.con, rec):
            self.saved += 1

    def get(self, url, **kw):
        self.check_cancel()
        kw.setdefault("timeout", 60)
        try:
            return self.session.get(url, **kw)
        except requests.RequestException as e:
            raise AdapterError(network_error(url, e)) from None


def new_session():
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def network_error(url, e):
    """A short, plain-English reason, plus the technical detail to paste back."""
    host = re.sub(r"^https?://([^/]+).*$", r"\1", url)
    detail = str(e)
    if isinstance(e, requests.exceptions.ProxyError) or "Tunnel connection failed" in detail:
        why = "the connection was blocked by a proxy or firewall"
    elif isinstance(e, requests.exceptions.SSLError):
        why = "the secure connection failed (a company proxy or antivirus may be inspecting traffic)"
    elif isinstance(e, requests.exceptions.Timeout):
        why = "the site took too long to answer"
    elif isinstance(e, requests.exceptions.ConnectionError):
        why = "could not connect (no internet connection, or the site is down)"
    else:
        why = e.__class__.__name__
    m = re.search(r"\(Caused by (.+)\)\s*$", detail)
    tail = (m.group(1) if m else detail)[-160:]
    return f"Could not reach {host}: {why}. [{e.__class__.__name__}: {tail}]"


def http_error(r):
    body = (r.text or "").strip()
    try:
        j = json.loads(body)
        body = j.get("message") or j.get("error") or body if isinstance(j, dict) else body
    except ValueError:
        body = strip_html(body)
    hint = {401: "the key or token was rejected", 403: "access refused (check the key, or rate limit reached)",
            404: "address not found - check the URL", 429: "too many requests - try again later"}.get(r.status_code, "")
    return AdapterError(f"HTTP {r.status_code} from {r.url.split('?')[0]}"
                        + (f" ({hint})" if hint else "") + f": {str(body)[:220]}")


def get_json(ctx, url, retries=3, **kw):
    """GET with retries for the rate-limit and busy responses public APIs give."""
    delay = 6
    for attempt in range(retries + 1):
        ctx.check_cancel()
        kw.setdefault("timeout", 60)
        try:
            r = ctx.session.get(url, **kw)
        except requests.RequestException as e:
            if attempt >= min(retries, 1) or isinstance(e, requests.exceptions.ProxyError):
                raise AdapterError(network_error(url, e))
            ctx.log("network error, retrying in 5s")
            time.sleep(5)
            continue
        if r.status_code in (429, 500, 502, 503, 504) or (r.status_code == 403 and "nvd" in url):
            if attempt == retries:
                raise http_error(r)
            wait = int(r.headers.get("Retry-After") or delay) if str(r.headers.get("Retry-After", "")).isdigit() else delay
            ctx.log(f"HTTP {r.status_code}, waiting {wait}s and retrying")
            time.sleep(min(wait, 60))
            delay *= 2
            continue
        if r.status_code >= 400:
            raise http_error(r)
        try:
            return r, r.json()
        except ValueError:
            raise AdapterError(f"{url.split('?')[0]} did not return JSON (content type {r.headers.get('Content-Type')})")
    raise AdapterError("unreachable")


# ------------------------------------------------------------ date helpers ----
_DATE_FORMATS = (
    "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
    "%b %d, %Y, %I:%M:%S %p", "%b %d, %Y, %H:%M:%S", "%b %d, %Y", "%d %b %Y", "%d %B %Y",
    "%B %d, %Y", "%Y-%B-%d", "%d/%m/%Y",
)


def norm_date(value):
    """Return 'YYYY-MM-DDTHH:MM:SS' (UTC) or 'YYYY-MM-DD', or '' if unparseable."""
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)):
        ts = value / 1000 if value > 1e11 else value
        return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    s = str(value).strip().replace(" ", " ")
    m = re.match(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$", s)
    if m:
        if m.group(4) and m.group(4) != "Z":
            try:
                dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                pass
        return f"{m.group(1)}T{m.group(2)}"
    if re.match(r"^([A-Za-z]{3},\s*)?\d{1,2} [A-Za-z]{3} \d{4} \d", s):  # RFC 822 (RSS)
        try:
            dt = parsedate_to_datetime(s)
            if dt.tzinfo:
                dt = dt.astimezone(timezone.utc)
            return dt.strftime("%Y-%m-%dT%H:%M:%S")
        except (TypeError, ValueError, IndexError):
            pass
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo:
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S")
    except ValueError:
        pass
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%dT%H:%M:%S") if "%H" in fmt or "%I" in fmt else dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = re.search(r"\d{4}-\d{2}-\d{2}", s)
    return m.group(0) if m else ""


def strip_html(s, limit=None):
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s or "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:limit] if limit else s


def score_of(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


# ===================================================================== NVD ====
def pull_nvd(ctx):
    """NVD CVE API 2.0, incremental by last-modified date.
    lastModStartDate/lastModEndDate must be sent together and span at most 120 days."""
    key = secrets_store.get("NVD_API_KEY")
    headers = {"apiKey": key} if key else {}
    pause = 0.8 if key else 6.5  # NVD: 50 requests/30s with a key, 5 without
    url = ctx.url or "https://services.nvd.nist.gov/rest/json/cves/2.0"
    start = datetime.strptime(ctx.since()[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    run_end = datetime.now(timezone.utc)
    if not key:
        ctx.log("no NVD API key set - running at the slower public rate")
    fmt = "%Y-%m-%dT%H:%M:%S.000Z"
    total_seen = 0
    while start < run_end:
        end = min(start + timedelta(days=119), run_end)
        index = 0
        while True:
            params = {"lastModStartDate": start.strftime(fmt), "lastModEndDate": end.strftime(fmt),
                      "startIndex": index, "resultsPerPage": 20 if ctx.test else 2000}
            _, data = get_json(ctx, url, params=params, headers=headers, timeout=120)
            for item in data.get("vulnerabilities", []):
                ctx.save(nvd_record(item["cve"]))
            got = data.get("resultsPerPage", 0) or len(data.get("vulnerabilities", []))
            index += got
            total = data.get("totalResults", 0)
            total_seen = max(total_seen, total)
            ctx.log(f"{min(index, total):,} of {total:,} changed records")
            if ctx.test or got == 0 or index >= total:
                break
            time.sleep(pause)
        if ctx.test:
            break
        start = end
    return run_end.strftime("%Y-%m-%dT%H:%M:%S.000")


def nvd_record(c):
    rec = store.blank("nvd", c["id"])
    rec["summary"] = next((d["value"] for d in c.get("descriptions", []) if d.get("lang") == "en"), "")
    rec["published"] = norm_date(c.get("published", ""))
    rec["modified"] = norm_date(c.get("lastModified", ""))
    rec["url"] = "https://nvd.nist.gov/vuln/detail/" + c["id"]
    if c.get("cisaExploitAdd"):
        rec["exploited"] = 1
        rec["title"] = c.get("cisaVulnerabilityName", "")
    metrics = c.get("metrics", {})
    for key in ("cvssMetricV31", "cvssMetricV40", "cvssMetricV30", "cvssMetricV2"):
        if metrics.get(key):
            lst = metrics[key]
            m = next((x for x in lst if x.get("type") == "Primary"), lst[0])
            data = m.get("cvssData", {})
            rec["severity_score"] = data.get("baseScore")
            rec["severity_label"] = data.get("baseSeverity") or m.get("baseSeverity", "")
            break
    cpes = []
    for conf in c.get("configurations", []):
        for node in conf.get("nodes", []):
            for match in node.get("cpeMatch", []):
                if match.get("vulnerable"):
                    cpes.append(match["criteria"])
    if not cpes:  # newer records carry CNA-supplied product data instead
        for a in c.get("affected", []) or []:
            for d in a.get("affectedData", []) or []:
                name = " ".join(x for x in (d.get("vendor"), d.get("product")) if x and x != "n/a")
                if name:
                    cpes.append(name)
    rec["affected"] = json.dumps(cpes[:50])
    return rec


# =============================================================== CISA KEV ====
def pull_cisa_kev(ctx):
    url = ctx.url or "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
    _, data = get_json(ctx, url)
    vulns = data.get("vulnerabilities")
    if vulns is None:
        raise AdapterError("KEV file has no 'vulnerabilities' list - the format may have changed")
    ctx.log(f"catalogue version {data.get('catalogVersion', '?')}, {len(vulns):,} entries")
    for v in vulns:
        rec = store.blank("cisa_kev", v["cveID"])
        rec["title"] = v.get("vulnerabilityName", "")
        summary = v.get("shortDescription", "")
        if v.get("knownRansomwareCampaignUse") == "Known":
            summary = "[Used in ransomware] " + summary
        if v.get("requiredAction"):
            summary += " Action: " + v["requiredAction"]
        rec["summary"] = summary
        rec["affected"] = json.dumps([(v.get("vendorProject", "") + " " + v.get("product", "")).strip()])
        rec["exploited"] = 1
        rec["published"] = norm_date(v.get("dateAdded", ""))
        rec["url"] = "https://nvd.nist.gov/vuln/detail/" + v["cveID"]
        ctx.save(rec)
        if ctx.test and ctx.saved >= 20:
            break


# ================================================================= GitHub ====
def _next_link(r):
    link = r.headers.get("Link", "")
    m = re.search(r'<([^>]+)>;\s*rel="next"', link)
    return m.group(1) if m else None


def pull_github(ctx):
    """GitHub global advisories, oldest change first, so that if the page cap or
    rate limit stops a run the next run carries on from the last advisory saved."""
    token = secrets_store.get("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = "Bearer " + token
    else:
        ctx.log("no GitHub token set - limited to 60 requests an hour")
    run_start = store.now_iso()
    since = ctx.since()[:10]
    url = ctx.url or "https://api.github.com/advisories"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # GitHub rejects "DATE..*" (HTTP 422, seen live), so ">=DATE" is used,
    # with a closed range as a fallback.
    date_forms = [">=" + since, f"{since}..{today}"]
    params = {"modified": date_forms.pop(0), "per_page": 10 if ctx.test else 100,
              "sort": "updated", "direction": "asc"}
    max_pages = 1 if ctx.test else (60 if token else 15)
    page, newest = 0, ""
    while url and page < max_pages:
        try:
            r, data = get_json(ctx, url, params=params, headers=headers, retries=1)
        except AdapterError as e:
            if page == 0 and "HTTP 422" in str(e) and date_forms:
                params["modified"] = date_forms.pop(0)
                ctx.log("retrying with date range " + params["modified"])
                continue
            raise
        if not isinstance(data, list):
            raise AdapterError(f"unexpected GitHub response: {str(data)[:200]}")
        for a in data:
            rec = github_record(a)
            ctx.save(rec)
            newest = max(newest, rec["modified"])
        page += 1
        ctx.log(f"page {page}: {ctx.saved:,} advisories")
        url, params = _next_link(r), None
        if url and r.headers.get("X-RateLimit-Remaining") == "0":
            ctx.log("GitHub rate limit reached - the rest will be fetched on the next scan")
            return newest[:10] + "T00:00:00.000" if newest else KEEP_LAST
    if url:
        ctx.log(f"stopped after {page} pages - the rest will be fetched on the next scan")
        return newest[:10] + "T00:00:00.000" if newest else KEEP_LAST
    return run_start


def github_record(a):
    rec = store.blank("github", a["ghsa_id"])
    ids = [i.get("value") for i in a.get("identifiers", []) or [] if i.get("type") == "CVE"]
    if a.get("cve_id") and a["cve_id"] not in ids:
        ids.insert(0, a["cve_id"])
    rec["aliases"] = ", ".join(i for i in ids if i)
    rec["title"] = a.get("summary", "") or ""
    rec["summary"] = (a.get("description") or "")[:2000]
    rec["severity_label"] = (a.get("severity") or "").upper()
    if rec["severity_label"] == "MODERATE":
        rec["severity_label"] = "MEDIUM"
    sev = a.get("cvss_severities") or {}
    score = None
    for k in ("cvss_v4", "cvss_v3"):
        score = score or score_of((sev.get(k) or {}).get("score"))
    score = score or score_of((a.get("cvss") or {}).get("score"))
    rec["severity_score"] = score or None
    rec["published"] = norm_date(a.get("published_at", ""))
    rec["modified"] = norm_date(a.get("updated_at", ""))
    rec["url"] = a.get("html_url", "")
    affected = []
    for v in a.get("vulnerabilities", []) or []:
        fixed = v.get("first_patched_version")
        if isinstance(fixed, dict):
            fixed = fixed.get("identifier")
        pkg = v.get("package") or {}
        affected.append({"package": pkg.get("name"), "ecosystem": pkg.get("ecosystem"),
                         "range": v.get("vulnerable_version_range"), "fixed": fixed})
    rec["affected"] = json.dumps(affected)
    return rec


# ================================================================ Red Hat ====
_RH_SEV = {"critical": "CRITICAL", "important": "HIGH", "moderate": "MEDIUM", "low": "LOW"}


def pull_redhat(ctx):
    """Red Hat Security Data API. 'after' filters on the public date, so this picks
    up newly published CVEs; Red Hat's later re-scoring of old CVEs is not re-fetched."""
    run_start = store.now_iso()
    url = ctx.url or "https://access.redhat.com/hydra/rest/securitydata/cve.json"
    since = ctx.since()[:10]
    per_page = 20 if ctx.test else 500
    for page in range(1, 41):
        _, data = get_json(ctx, url, params={"after": since, "per_page": per_page, "page": page})
        if not isinstance(data, list):
            raise AdapterError(f"unexpected Red Hat response: {str(data)[:200]}")
        for v in data:
            if not v.get("CVE"):
                continue
            rec = store.blank("redhat", v["CVE"])
            rec["title"] = v.get("bugzilla_description", "") or ""
            rec["severity_label"] = _RH_SEV.get((v.get("severity") or "").lower(), (v.get("severity") or "").upper())
            rec["severity_score"] = score_of(v.get("cvss3_score"))
            rec["published"] = norm_date(v.get("public_date", ""))
            rec["affected"] = json.dumps(v.get("affected_packages", []) or [])
            rec["url"] = "https://access.redhat.com/security/cve/" + v["CVE"]
            ctx.save(rec)
        ctx.log(f"{ctx.saved:,} CVEs")
        if ctx.test or len(data) < per_page:
            break
    return run_start


# =================================================================== EUVD ====
EUVD_BASE = "https://euvdservices.enisa.europa.eu/api/"


def _euvd_items(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("items", "content", "results", "data"):
            if isinstance(data.get(k), list):
                return data[k]
    raise AdapterError(f"unexpected EUVD response: {str(data)[:200]}")


def euvd_record(v, exploited=False):
    vid = v.get("id") or v.get("euvdId") or ""
    rec = store.blank("euvd", vid)
    aliases = v.get("aliases") or ""
    if isinstance(aliases, list):
        aliases = ", ".join(aliases)
    rec["aliases"] = ", ".join(a.strip() for a in re.split(r"[\n,]+", aliases) if a.strip())
    rec["summary"] = v.get("description", "") or ""
    rec["severity_score"] = score_of(v.get("baseScore"))
    rec["published"] = norm_date(v.get("datePublished", ""))
    rec["modified"] = norm_date(v.get("dateUpdated", ""))
    if exploited or v.get("exploitedSince"):
        rec["exploited"] = 1
    products = []
    for p in v.get("enisaIdProduct", []) or []:
        name = ((p.get("product") or {}).get("name") or "") if isinstance(p, dict) else str(p)
        ver = p.get("product_version", "") if isinstance(p, dict) else ""
        products.append({"product": name, "version": ver})
    if not products:
        for p in v.get("enisaIdVendor", []) or []:
            if isinstance(p, dict):
                products.append({"product": (p.get("vendor") or {}).get("name", "")})
    rec["affected"] = json.dumps(products)
    rec["url"] = "https://euvd.enisa.europa.eu/vulnerability/" + vid
    return rec


def pull_euvd(ctx):
    run_start = store.now_iso()
    base = ctx.url or EUVD_BASE
    if not base.endswith("/"):
        base = base.rsplit("/", 1)[0] + "/"
    since = ctx.since()[:10]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    size = 10 if ctx.test else 100
    used = None
    # The search endpoint takes a date range. Publish date is used: checked live,
    # EUVD re-dates thousands of old entries a day (11,492 "updated" in a week vs
    # 4,356 newly published), so update date mostly brings back old items.
    # If search fails, the three fixed "latest" lists are used instead.
    max_pages = 150
    for date_from, date_to in (("fromDate", "toDate"), ("fromUpdatedDate", "toUpdatedDate")):
        try:
            for page in range(0, max_pages):
                _, data = get_json(ctx, base + "search", retries=1,
                                   params={date_from: since, date_to: today, "size": size, "page": page})
                items = _euvd_items(data)
                for v in items:
                    ctx.save(euvd_record(v))
                total = data.get("total") if isinstance(data, dict) else None
                ctx.log(f"search ({date_from}) page {page + 1}: {ctx.saved:,}" + (f" of {total:,}" if total else ""))
                if ctx.test or len(items) < size:
                    break
                time.sleep(0.3)
            else:
                ctx.log(f"stopped at {max_pages * size:,} items - the rest are skipped")
            used = date_from
            break
        except AdapterError as e:
            ctx.log(f"search by {date_from} failed: {str(e)[:160]}")
    for name, exploited in (("exploitedvulnerabilities", True), ("criticalvulnerabilities", False),
                            ("lastvulnerabilities", False)):
        if used and name != "exploitedvulnerabilities":
            continue
        try:
            _, data = get_json(ctx, base + name, retries=1)
            for v in _euvd_items(data):
                ctx.save(euvd_record(v, exploited=exploited))
            ctx.log(f"{name}: ok")
        except AdapterError as e:
            if not used:
                raise
            ctx.log(f"{name} failed: {str(e)[:160]}")
    return run_start


# ================================================================= Oracle ====
_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug",
                                       "sep", "oct", "nov", "dec"), 1)}


def parse_oracle_cpu(page_html, page_url, sections):
    """Parse the risk matrices of an Oracle Critical Patch Update page.
    sections: list of lower-case words; a matrix is kept if its name contains one."""
    revs = re.findall(r"<td>\s*(\d{4}-[A-Za-z]+-\d{1,2})\s*</td>\s*<td>\s*Rev\s*\d+", page_html)
    dates = sorted(d for d in (norm_date(r) for r in revs) if d)
    published = dates[0] if dates else ""
    modified = dates[-1] if dates else ""
    if not published:
        m = re.search(r"cpu([a-z]{3})(\d{4})", page_url)
        if m:
            published = f"{m.group(2)}-{_MONTHS.get(m.group(1), 1):02d}-15"
    out = []
    parts = re.split(r"<!--\s*START (.+?) RISK MATRIX\s*-->", page_html)
    for i in range(1, len(parts), 2):
        name, body = parts[i].strip(), parts[i + 1]
        body = re.split(r"<!--\s*END ", body)[0]
        if sections and not any(s in name.lower() for s in sections):
            continue
        tbody = body.split("<tbody>", 1)[-1]
        for row in re.findall(r"(?is)<tr>(.*?)</tr>", tbody):
            cells = [strip_html(c) for c in re.findall(r"(?is)<t[hd][^>]*>(.*?)</t[hd]>", row)]
            if not cells or not CVE_RE.fullmatch(cells[0]):
                continue
            cve = cells[0].upper()
            rec = store.blank("oracle", cve)
            product, component = cells[1] if len(cells) > 1 else "", cells[2] if len(cells) > 2 else ""
            rec["title"] = f"{product}: {component}".strip(": ")
            remote = cells[4] if len(cells) > 4 else ""
            versions = cells[-2] if len(cells) > 6 else ""
            rec["summary"] = (f"{name} ({component}). Remotely exploitable without authentication: {remote}. "
                              f"Affected supported versions: {versions}").strip()
            rec["severity_score"] = score_of(cells[5]) if len(cells) > 5 else None
            rec["affected"] = json.dumps([versions or product])
            rec["published"], rec["modified"] = published, modified
            rec["url"] = page_url
            out.append(rec)
    return out


def pull_oracle(ctx):
    listing = ctx.url or "https://www.oracle.com/security-alerts/"
    r = ctx.get(listing)
    if r.status_code >= 400:
        raise http_error(r)
    links = re.findall(r'href="([^"]*?/security-alerts/cpu[a-z]{3}\d{4}\.html)"', r.text)
    if not links:
        raise AdapterError("no Critical Patch Update link found on the Oracle security alerts page")
    url = links[0] if links[0].startswith("http") else "https://www.oracle.com" + links[0]
    ctx.log("latest update: " + url.rsplit("/", 1)[-1])
    page = ctx.get(url, timeout=120)
    if page.status_code >= 400:
        raise http_error(page)
    sections = [s.strip().lower() for s in str(ctx.mapping.get("sections", "java")).split(",") if s.strip()]
    recs = parse_oracle_cpu(page.text, url, sections)
    if not recs:
        raise AdapterError("no CVE rows found in the risk matrices - the page layout may have changed")
    for rec in recs:
        ctx.save(rec)
    ctx.log(f"{len(recs)} CVEs in sections: {', '.join(sections) or 'all'}")


# ==================================================================== OSV ====
def pull_osv(ctx):
    """OSV needs a list of packages to check, one per line: ecosystem:name@version
    (e.g. PyPI:requests@2.19.0). Uses POST /v1/query for each."""
    lines = [l.strip() for l in str(ctx.mapping.get("packages", "")).splitlines() if l.strip()]
    if not lines:
        raise AdapterError("add packages to check (ecosystem:name@version, one per line) in this source's mapping")
    url = ctx.url or "https://api.osv.dev/v1/query"
    for line in lines[: 3 if ctx.test else 500]:
        m = re.match(r"^([^:]+):(.+?)(?:@(.+))?$", line)
        if not m:
            ctx.log(f"skipped '{line}' - use ecosystem:name@version")
            continue
        body = {"package": {"ecosystem": m.group(1), "name": m.group(2)}}
        if m.group(3):
            body["version"] = m.group(3)
        ctx.check_cancel()
        try:
            r = ctx.session.post(url, json=body, timeout=60)
        except requests.RequestException as e:
            raise AdapterError(network_error(url, e)) from None
        if r.status_code >= 400:
            raise http_error(r)
        for v in r.json().get("vulns", []) or []:
            rec = store.blank("osv", v["id"])
            rec["aliases"] = ", ".join(v.get("aliases", []) or [])
            rec["title"] = v.get("summary", "")
            rec["summary"] = (v.get("details") or "")[:2000]
            dbs = v.get("database_specific") or {}
            rec["severity_label"] = (dbs.get("severity") or "").upper()
            rec["published"] = norm_date(v.get("published"))
            rec["modified"] = norm_date(v.get("modified"))
            rec["affected"] = json.dumps([{"package": line}])
            rec["url"] = "https://osv.dev/vulnerability/" + v["id"]
            ctx.save(rec)
    ctx.log(f"{ctx.saved:,} vulnerabilities for {len(lines)} packages")


# ======================================================== generic: JSON ====
def dig(obj, path):
    """Follow a dotted path such as 'data.items' or 'metrics.0.score'."""
    if path in (None, ""):
        return obj
    cur = obj
    for part in str(path).split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return None
        if cur is None:
            return None
    return cur


MAP_FIELDS = ("vuln_id", "aliases", "title", "summary", "severity_score", "severity_label",
              "affected", "exploited", "published", "modified", "url")


def fill_placeholders(url, ctx):
    since = ctx.since()
    return (url.replace("{since}", since[:10]).replace("{since_iso}", since)
               .replace("{today}", datetime.now(timezone.utc).strftime("%Y-%m-%d")))


def pull_generic_json(ctx):
    run_start = store.now_iso()
    if not ctx.url:
        raise AdapterError("no URL set")
    m = ctx.mapping
    _, data = get_json(ctx, fill_placeholders(ctx.url, ctx), retries=1)
    items = dig(data, m.get("items_path", ""))
    if isinstance(items, dict):
        items = list(items.values())
    if not isinstance(items, list):
        raise AdapterError(f"'items_path' ({m.get('items_path') or 'top level'}) is not a list in the response")
    for it in items:
        rec = store.blank(ctx.key, "")
        for f in MAP_FIELDS:
            path = m.get(f)
            if path:
                val = dig(it, path)
                if isinstance(val, (list, dict)) and f not in ("affected",):
                    val = ", ".join(str(x) for x in val) if isinstance(val, list) else json.dumps(val)
                rec[f] = val if val is not None else rec[f]
        rec["vuln_id"] = str(rec["vuln_id"] or "")
        if not rec["vuln_id"]:
            found = CVE_RE.search(json.dumps(it))
            rec["vuln_id"] = found.group(0).upper() if found else ""
        rec["published"] = norm_date(rec["published"])
        rec["modified"] = norm_date(rec["modified"])
        rec["severity_score"] = score_of(rec["severity_score"])
        rec["exploited"] = 1 if str(rec["exploited"]).lower() in ("1", "true", "yes", "known") else 0
        if isinstance(rec["affected"], (list, dict)):
            rec["affected"] = json.dumps(rec["affected"] if isinstance(rec["affected"], list) else [rec["affected"]])
        elif rec["affected"]:
            rec["affected"] = json.dumps([str(rec["affected"])])
        ctx.save(rec)
    ctx.log(f"{ctx.saved:,} of {len(items):,} items had an ID")
    return run_start


# ========================================================= generic: RSS ====
def _local(tag):
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(el, *names):
    for c in el:
        if _local(c.tag) in names:
            if _local(c.tag) == "link" and c.get("href"):
                return c.get("href")
            return (c.text or "").strip()
    return ""


def parse_feed(text):
    """RSS 2.0 or Atom -> list of dicts with title, link, summary, date, guid."""
    if "<!DOCTYPE" in text[:2000].upper() and "<!ENTITY" in text.upper():
        raise AdapterError("feed contains entity declarations - refused for safety")
    root = ET.fromstring(text.encode("utf-8") if isinstance(text, str) else text)
    entries = [e for e in root.iter() if _local(e.tag) in ("item", "entry")]
    out = []
    for e in entries:
        out.append({
            "title": strip_html(_child_text(e, "title")),
            "link": _child_text(e, "link"),
            "summary": strip_html(_child_text(e, "description", "summary", "content", "encoded"), 2000),
            "date": _child_text(e, "pubdate", "published", "updated", "date"),
            "updated": _child_text(e, "updated", "modified"),
            "guid": _child_text(e, "guid", "id"),
        })
    return out


def pull_generic_rss(ctx):
    if not ctx.url:
        raise AdapterError("no URL set")
    r = ctx.get(fill_placeholders(ctx.url, ctx))
    if r.status_code >= 400:
        raise http_error(r)
    try:
        entries = parse_feed(r.text)
    except ET.ParseError as e:
        raise AdapterError(f"not a valid RSS/Atom feed: {e}")
    for e in entries[: 20 if ctx.test else None]:
        cves = list(dict.fromkeys(c.upper() for c in CVE_RE.findall(e["title"] + " " + e["summary"])))
        vid = e["guid"] or e["link"] or e["title"]
        rec = store.blank(ctx.key, vid[:200])
        rec["aliases"] = ", ".join(cves)
        rec["title"] = e["title"]
        rec["summary"] = e["summary"]
        rec["published"] = norm_date(e["date"])
        rec["modified"] = norm_date(e["updated"]) or rec["published"]
        rec["url"] = e["link"]
        text = (e["title"] + " " + e["summary"]).lower()
        if re.search(r"\bactively exploited\b|\bexploited in the wild\b|\bknown exploited\b", text):
            rec["exploited"] = 1
        for word in ("critical", "high"):
            if re.search(rf"\b{word}\b(-| )?(severity|risk)?", text):
                rec["severity_label"] = word.upper()
                break
        ctx.save(rec)
    ctx.log(f"{len(entries)} feed items")


# ==================================================== generic: web page ====
def pull_generic_web(ctx):
    """Fetch a page and record every CVE ID found on it, with nearby text as the summary.
    Optional mapping 'link_pattern': a regex for links on the page to follow (up to 10)."""
    if not ctx.url:
        raise AdapterError("no URL set")
    pages = [ctx.url]
    r = ctx.get(ctx.url)
    if r.status_code >= 400:
        raise http_error(r)
    texts = {ctx.url: r.text}
    pat = ctx.mapping.get("link_pattern")
    if pat:
        from urllib.parse import urljoin
        links = list(dict.fromkeys(urljoin(ctx.url, h) for h in re.findall(r'href="([^"]+)"', r.text)
                                   if re.search(pat, h)))[: 2 if ctx.test else 10]
        for l in links:
            rr = ctx.get(l)
            if rr.status_code < 400:
                texts[l] = rr.text
                pages.append(l)
    existing = dict(ctx.con.execute("SELECT vuln_id, published FROM vulns WHERE source=?", (ctx.key,)).fetchall())
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    seen = set()
    for page_url, page_html in texts.items():
        title = strip_html((re.search(r"(?is)<title>(.*?)</title>", page_html) or [None, ""])[1])
        text = strip_html(page_html)
        for m in CVE_RE.finditer(text):
            cve = m.group(0).upper()
            if cve in seen:
                continue
            seen.add(cve)
            rec = store.blank(ctx.key, cve)
            rec["title"] = title[:200]
            rec["summary"] = text[max(0, m.start() - 150): m.end() + 250]
            rec["published"] = existing.get(cve) or today  # first time we saw it
            rec["url"] = page_url
            ctx.save(rec)
    if not seen:
        ctx.log("no CVE IDs found on the page")
    ctx.log(f"{len(seen)} CVE IDs on {len(texts)} page(s)")


# ---------------------------------------------------------------------------
BUILTIN = {
    "nvd": pull_nvd,
    "cisa_kev": pull_cisa_kev,
    "github": pull_github,
    "redhat": pull_redhat,
    "euvd": pull_euvd,
    "oracle": pull_oracle,
    "osv": pull_osv,
}
GENERIC = {"json": pull_generic_json, "rss": pull_generic_rss, "web": pull_generic_web}


def adapter_for(source):
    a = source.get("adapter") or "generic"
    if a in BUILTIN:
        return BUILTIN[a]
    return GENERIC.get(source.get("type") or "json", pull_generic_json)

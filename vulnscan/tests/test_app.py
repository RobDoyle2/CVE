"""Offline tests: adapters against sample responses, storage, filters, exports,
settings and the server's access rules. Run with:  python -m pytest tests"""
import io
import json
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIX = Path(__file__).parent / "fixtures"

os.environ["VULNSCAN_HOME"] = tempfile.mkdtemp(prefix="vulnscan-test-")
os.environ.pop("NVD_API_KEY", None)
os.environ.pop("GITHUB_TOKEN", None)

from vulnscan_app import adapters, exporter, secrets_store, server, settings, store  # noqa: E402

TODAY = datetime.now(timezone.utc)
D = lambda days: (TODAY - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000")  # noqa: E731


class FakeResp:
    def __init__(self, data=None, text=None, status=200, headers=None, url="https://example.test/x"):
        self._data, self.status_code, self.headers, self.url = data, status, headers or {}, url
        self.text = text if text is not None else json.dumps(data)

    def json(self):
        if self._data is None:
            raise ValueError("no json")
        return self._data


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.headers = {}

    def get(self, url, **kw):
        self.calls.append((url, kw))
        r = self.responses.pop(0)
        r.url = url
        return r

    post = get


@pytest.fixture()
def con(tmp_path):
    return store.connect(tmp_path / "t.db")


def ctx_for(con, sid, responses, **kw):
    src = next(s for s in settings.DEFAULT_SOURCES if s["id"] == sid) if sid in {
        s["id"] for s in settings.DEFAULT_SOURCES} else kw.pop("source")
    sess = FakeSession(responses)
    return adapters.Ctx(con, dict(src, mapping=dict(src.get("mapping") or {}, **kw.pop("mapping", {}))),
                        session=sess, **kw), sess


# ------------------------------------------------------------------ adapters --
NVD_ITEM = {"cve": {
    "id": "CVE-2026-1111", "published": D(1), "lastModified": D(0),
    "descriptions": [{"lang": "en", "value": "Remote code execution in Widget."}],
    "cisaExploitAdd": "2026-11-18", "cisaVulnerabilityName": "Widget RCE",
    "metrics": {"cvssMetricV31": [{"type": "Secondary", "cvssData": {"baseScore": 8.0, "baseSeverity": "HIGH"}},
                                   {"type": "Primary", "cvssData": {"baseScore": 9.8, "baseSeverity": "CRITICAL"}}]},
    "configurations": [{"nodes": [{"cpeMatch": [{"vulnerable": True, "criteria": "cpe:2.3:a:acme:widget:1.0:*:*:*:*:*:*:*"}]}]}]}}
NVD_V2 = {"cve": {"id": "CVE-2012-3466", "published": "2012-10-22T23:55:06.057", "lastModified": D(0),
                  "descriptions": [{"lang": "en", "value": "old"}],
                  "metrics": {"cvssMetricV2": [{"type": "Primary", "cvssData": {"baseScore": 4.4}, "baseSeverity": "MEDIUM"}]},
                  "affected": [{"affectedData": [{"vendor": "GNOME", "product": "gnome-keyring"}]}]}}


def test_nvd_paging_and_mapping(con, monkeypatch):
    monkeypatch.setattr(adapters.time, "sleep", lambda s: None)
    ctx, sess = ctx_for(con, "nvd", [
        FakeResp({"resultsPerPage": 1, "totalResults": 2, "vulnerabilities": [NVD_ITEM]}),
        FakeResp({"resultsPerPage": 1, "totalResults": 2, "vulnerabilities": [NVD_V2]}),
    ])
    ctx.first_days = 3
    adapters.pull_nvd(ctx)
    assert ctx.saved == 2
    p = sess.calls[0][1]["params"]
    assert p["lastModStartDate"].endswith(".000Z") and p["lastModEndDate"].endswith(".000Z")
    assert sess.calls[1][1]["params"]["startIndex"] == 1
    row = con.execute("SELECT severity_score, severity_label, exploited, affected, title FROM vulns WHERE vuln_id='CVE-2026-1111'").fetchone()
    assert row[:3] == (9.8, "CRITICAL", 1) and "widget" in row[3] and row[4] == "Widget RCE"
    row = con.execute("SELECT severity_label, affected FROM vulns WHERE vuln_id='CVE-2012-3466'").fetchone()
    assert row[0] == "MEDIUM" and "gnome-keyring" in row[1]


def test_nvd_splits_long_ranges(con, monkeypatch):
    monkeypatch.setattr(adapters.time, "sleep", lambda s: None)
    store.set_last(con, "nvd", D(200))
    empty = {"resultsPerPage": 0, "totalResults": 0, "vulnerabilities": []}
    ctx, sess = ctx_for(con, "nvd", [FakeResp(empty), FakeResp(empty)])
    adapters.pull_nvd(ctx)
    assert len(sess.calls) == 2  # 200 days -> two windows of at most 120 days


def test_nvd_retries_busy(con, monkeypatch):
    monkeypatch.setattr(adapters.time, "sleep", lambda s: None)
    ctx, sess = ctx_for(con, "nvd", [FakeResp(text="busy", status=503),
                                     FakeResp({"resultsPerPage": 0, "totalResults": 0, "vulnerabilities": []})])
    adapters.pull_nvd(ctx)
    assert len(sess.calls) == 2


def test_kev(con):
    data = {"catalogVersion": "2026.11.19", "vulnerabilities": [
        {"cveID": "CVE-2026-2222", "vendorProject": "Acme", "product": "Gateway", "vulnerabilityName": "Acme Gateway Auth Bypass",
         "dateAdded": TODAY.strftime("%Y-%m-%d"), "shortDescription": "Bypass.", "knownRansomwareCampaignUse": "Known",
         "requiredAction": "Patch."}]}
    ctx, _ = ctx_for(con, "cisa_kev", [FakeResp(data)])
    adapters.pull_cisa_kev(ctx)
    r = con.execute("SELECT exploited, affected, summary FROM vulns").fetchone()
    assert r[0] == 1 and "Acme Gateway" in r[1] and "ransomware" in r[2]


GH_ADV = {"ghsa_id": "GHSA-aaaa-bbbb-cccc", "cve_id": "CVE-2026-3333", "summary": "Prototype pollution in foo",
          "description": "long text", "severity": "moderate", "published_at": "2026-11-18T10:00:00Z",
          "updated_at": "2026-11-19T10:00:00Z", "html_url": "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          "cvss_severities": {"cvss_v3": {"score": 6.5}, "cvss_v4": {"score": None}},
          "identifiers": [{"type": "GHSA", "value": "GHSA-aaaa-bbbb-cccc"}, {"type": "CVE", "value": "CVE-2026-3333"}],
          "vulnerabilities": [{"package": {"ecosystem": "npm", "name": "foo"}, "vulnerable_version_range": "< 1.2.3",
                               "first_patched_version": "1.2.3"}]}


def test_github_pagination(con):
    page1 = FakeResp([GH_ADV], headers={"Link": '<https://api.github.com/advisories?after=X>; rel="next"'})
    page2 = FakeResp([dict(GH_ADV, ghsa_id="GHSA-2222-2222-2222", severity="critical", cvss_severities=None,
                           cvss={"score": 9.1})])
    ctx, sess = ctx_for(con, "github", [page1, page2])
    adapters.pull_github(ctx)
    assert ctx.saved == 2 and sess.calls[1][0].endswith("after=X")
    rows = dict(con.execute("SELECT vuln_id, severity_label FROM vulns").fetchall())
    assert rows == {"GHSA-aaaa-bbbb-cccc": "MEDIUM", "GHSA-2222-2222-2222": "CRITICAL"}
    assert sess.calls[0][1]["params"]["modified"].startswith(">=")


def test_github_falls_back_on_rejected_date(con):
    ctx, sess = ctx_for(con, "github", [FakeResp({"message": "The date input is invalid."}, status=422), FakeResp([GH_ADV])])
    adapters.pull_github(ctx)
    assert ctx.saved == 1 and ".." in sess.calls[1][1]["params"]["modified"]


def test_redhat_severity_mapping(con):
    data = [{"CVE": "CVE-2026-4444", "severity": "important", "public_date": "2026-11-19T00:00:00Z",
             "bugzilla_description": "kernel: use after free", "cvss3_score": "7.8", "affected_packages": ["kernel-0:5.14"],
             "resource_url": "https://access.redhat.com/hydra/rest/securitydata/cve/CVE-2026-4444.json"}]
    ctx, _ = ctx_for(con, "redhat", [FakeResp(data)])
    adapters.pull_redhat(ctx)
    r = con.execute("SELECT severity_label, severity_score, url FROM vulns").fetchone()
    assert r == ("HIGH", 7.8, "https://access.redhat.com/security/cve/CVE-2026-4444")


EUVD_ITEM = {"id": "EUVD-2026-5555", "description": "Bug", "datePublished": "Nov 18, 2026, 3:04:05 PM",
             "dateUpdated": "Nov 19, 2026, 1:00:00 AM", "baseScore": 9.1, "aliases": "CVE-2026-5555\nGHSA-x\n",
             "enisaIdProduct": [{"id": "p", "product": {"name": "Router"}, "product_version": "<2.0"}]}


def test_euvd_search(con):
    ctx, sess = ctx_for(con, "euvd", [FakeResp({"items": [EUVD_ITEM], "total": 1}), FakeResp([dict(EUVD_ITEM, id="EUVD-2026-6666")])])
    adapters.pull_euvd(ctx)
    r = con.execute("SELECT aliases, severity_label, published, affected FROM vulns WHERE vuln_id='EUVD-2026-5555'").fetchone()
    assert r[0] == "CVE-2026-5555, GHSA-x" and r[1] == "CRITICAL" and r[2] == "2026-11-18T15:04:05" and "Router" in r[3]
    assert "search" in sess.calls[0][0] and "fromDate" in sess.calls[0][1]["params"]
    assert con.execute("SELECT exploited FROM vulns WHERE vuln_id='EUVD-2026-6666'").fetchone()[0] == 1


def test_euvd_falls_back_to_latest_lists(con, monkeypatch):
    monkeypatch.setattr(adapters.time, "sleep", lambda s: None)
    bad = lambda: FakeResp(text="nope", status=400)  # noqa: E731
    ctx, sess = ctx_for(con, "euvd", [bad(), bad(), FakeResp([EUVD_ITEM]), FakeResp([]), FakeResp([])])
    adapters.pull_euvd(ctx)
    assert ctx.saved == 1 and sess.calls[2][0].endswith("exploitedvulnerabilities")


def test_oracle_parser():
    html_text = (FIX / "oracle_cpu_java.html").read_text()
    recs = adapters.parse_oracle_cpu(html_text, "https://www.oracle.com/security-alerts/cpuoct2026.html", ["java"])
    assert len(recs) > 20 and all(r["vuln_id"].startswith("CVE-") for r in recs)
    first = recs[0]
    assert first["severity_score"] == 7.5 and "Java" in first["title"] and first["published"] == "2026-10-20"
    assert not any(r["vuln_id"] == "CVE-2026-00001" for r in recs)  # MySQL section filtered out
    assert any(r["vuln_id"] == "CVE-2026-00001" for r in adapters.parse_oracle_cpu(html_text, "u", []))


def test_generic_json_mapping(con):
    src = {"id": "custom", "name": "Custom", "type": "json", "adapter": "generic",
           "url": "https://example.test/feed?since={since}",
           "mapping": {"items_path": "data.list", "vuln_id": "ident", "title": "t", "severity_score": "s.score",
                       "published": "when", "exploited": "kev", "affected": "prods"}}
    data = {"data": {"list": [{"ident": "X-1", "t": "Thing", "s": {"score": "9.9"}, "when": "2026-11-19", "kev": True,
                               "prods": ["a", "b"]},
                              {"t": "mentions CVE-2026-7777 only"}]}}
    ctx, sess = ctx_for(con, None, [FakeResp(data)], source=src)
    adapters.pull_generic_json(ctx)
    assert "since=20" in sess.calls[0][0]
    rows = {r[0]: r for r in con.execute("SELECT vuln_id, severity_label, exploited, affected FROM vulns")}
    assert rows["X-1"][1:3] == ("CRITICAL", 1) and json.loads(rows["X-1"][3]) == ["a", "b"]
    assert "CVE-2026-7777" in rows


RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>b</title>
<item><title>CVE-2026-8888 - Critical issue in Thing</title><link>https://example.test/b1</link>
<description>&lt;p&gt;Actively exploited.&lt;/p&gt;</description><pubDate>Wed, 19 Nov 2026 10:00:00 GMT</pubDate><guid>b1</guid></item>
</channel></rss>"""
ATOM = """<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Bulletin</title><link href="https://e.test/a"/>
<id>a1</id><updated>2026-11-19T10:00:00Z</updated><summary>About CVE-2026-9999</summary></entry></feed>"""


def test_rss_and_atom(con):
    src = {"id": "aws", "name": "AWS", "type": "rss", "adapter": "generic", "url": "https://e.test/rss", "mapping": {}}
    ctx, _ = ctx_for(con, None, [FakeResp(text=RSS)], source=src)
    adapters.pull_generic_rss(ctx)
    r = con.execute("SELECT vuln_id, aliases, exploited, severity_label, published, summary FROM vulns").fetchone()
    assert r[:5] == ("b1", "CVE-2026-8888", 1, "CRITICAL", "2026-11-19T10:00:00") and "<p>" not in r[5]
    ctx, _ = ctx_for(con, None, [FakeResp(text=ATOM)], source=dict(src, id="atom"))
    adapters.pull_generic_rss(ctx)
    assert con.execute("SELECT aliases FROM vulns WHERE source='atom'").fetchone()[0] == "CVE-2026-9999"


def test_rss_refuses_entities(con):
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><rss><channel><item><title>&a;</title></item></channel></rss>'
    src = {"id": "x", "name": "x", "type": "rss", "adapter": "generic", "url": "https://e.test/rss", "mapping": {}}
    ctx, _ = ctx_for(con, None, [FakeResp(text=bomb)], source=src)
    with pytest.raises(adapters.AdapterError):
        adapters.pull_generic_rss(ctx)


def test_web_page(con):
    src = {"id": "ncsc_ie", "name": "n", "type": "web", "adapter": "generic", "url": "https://e.test/", "mapping": {}}
    page = "<html><title>Alerts</title><body><p>Patch CVE-2026-1234 now.</p><script>CVE-2000-0001</script></body></html>"
    ctx, _ = ctx_for(con, None, [FakeResp(text=page)], source=src)
    adapters.pull_generic_web(ctx)
    assert [r[0] for r in con.execute("SELECT vuln_id FROM vulns")] == ["CVE-2026-1234"]


def test_osv_needs_packages(con):
    ctx, _ = ctx_for(con, "osv", [])
    with pytest.raises(adapters.AdapterError, match="packages"):
        adapters.pull_osv(ctx)
    ctx, sess = ctx_for(con, "osv", [FakeResp({"vulns": [{"id": "GHSA-1", "aliases": ["CVE-2018-18074"], "summary": "s",
                                                          "published": "2018-10-29T19:47:00Z", "modified": D(1),
                                                          "database_specific": {"severity": "HIGH"}}]})],
                        mapping={"packages": "PyPI:requests@2.19.0"})
    adapters.pull_osv(ctx)
    assert sess.calls[0][1]["json"] == {"package": {"ecosystem": "PyPI", "name": "requests"}, "version": "2.19.0"}
    assert ctx.saved == 1


def test_norm_date():
    assert adapters.norm_date("2026-11-19T10:00:00.123") == "2026-11-19T10:00:00"
    assert adapters.norm_date("2026-11-19T10:00:00+01:00") == "2026-11-19T09:00:00"
    assert adapters.norm_date("Nov 19, 2026, 1:02:03 PM") == "2026-11-19T13:02:03"
    assert adapters.norm_date("2026-October-20") == "2026-10-20"
    assert adapters.norm_date("garbage") == ""


# ------------------------------------------------------------- store/query --
def seed(con):
    recent, old = D(1), D(20)
    rows = [("nvd", "CVE-2026-0001", "", "HIGH", 7.5, 0, recent), ("nvd", "CVE-2026-0002", "", "CRITICAL", 9.8, 0, recent),
            ("nvd", "CVE-2026-0003", "", "LOW", 2.0, 0, recent), ("nvd", "CVE-2026-0004", "", "MEDIUM", 5.0, 0, recent),
            ("github", "GHSA-1", "CVE-2026-0004", "HIGH", 8.0, 0, old), ("cisa_kev", "CVE-2026-0004", "", "", None, 1, recent)]
    for src, vid, al, lab, sc, ex, dt in rows:
        r = store.blank(src, vid)
        r.update(aliases=al, severity_label=lab, severity_score=sc, exploited=ex, modified=dt,
                 summary=f"widget {vid}", affected=json.dumps(["cpe:2.3:a:acme:widget_pro:1:*"]))
        store.save(con, r)
    con.commit()


def test_query_filters_and_order(con):
    seed(con)
    assert store.mark_exploited_from_kev(con) == 2  # nvd CVE-4 and github GHSA-1 (alias)
    ids = [r["id"] for r in store.query(con, {"days": 7, "severity": "high"})]
    assert ids == ["CVE-2026-0004", "CVE-2026-0004", "CVE-2026-0002", "CVE-2026-0001"]  # exploited first, then critical, then high
    assert [r["id"] for r in store.query(con, {"days": 7, "severity": "critical"})] == ["CVE-2026-0004", "CVE-2026-0004", "CVE-2026-0002"]
    assert len(store.query(con, {"days": 30, "severity": "all"})) == 6
    assert [r["id"] for r in store.query(con, {"days": 30, "severity": "all", "exploited_only": True, "source": "github"})] == ["GHSA-1"]
    assert [r["id"] for r in store.query(con, {"days": 7, "severity": "all", "q": "CVE-2026-0003"})] == ["CVE-2026-0003"]
    assert store.query(con, {"days": 7, "severity": "all", "q": "100%"}) == []
    assert store.query(con, {"days": 7})[0]["affected"] == "acme widget pro 1"
    s = store.summary(con, 7)
    assert s["total"] == 6 and s["matching"] == 4 and s["exploited"] == 2


def test_save_is_idempotent(con):
    seed(con)
    seed(con)
    assert con.execute("SELECT COUNT(*) FROM vulns").fetchone()[0] == 6


# ----------------------------------------------------------------- exports --
def test_exports(con):
    seed(con)
    store.mark_exploited_from_kev(con)
    rows = store.query(con, {"days": 7})
    summ = store.summary(con, 7)
    x = exporter.to_xlsx(rows, summ, {"days": 7}, "VulnScan")
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(x))
    ws = wb["Vulnerabilities"]
    assert ws.freeze_panes == "A2" and ws["C2"].value == "YES" and ws["A2"].fill.fgColor.rgb.endswith("F8D7DA")
    assert ws.column_dimensions["G"].width == 70
    pdf = exporter.to_pdf(rows, summ, {"days": 7}, "VulnScan")
    assert pdf.startswith(b"%PDF") and len(pdf) > 1500


# ---------------------------------------------------------------- settings --
def test_settings_roundtrip_and_validation():
    s = settings.reset()
    assert [x["id"] for x in s["sources"]][:5] == ["nvd", "cisa_kev", "github", "redhat", "euvd"]
    assert not any(x["enabled"] for x in s["sources"] if x["id"] in ("osv", "oracle", "ncsc_ie", "aws"))
    s["sources"].append({"name": "My Feed!", "type": "rss", "url": "example.test/rss", "enabled": True, "adapter": "nvd"})
    s["sources"].append({"id": "nvd", "name": "dup"})
    saved = settings.save(s)
    mine = saved["sources"][-2]
    assert mine["id"] == "my_feed" and mine["adapter"] == "generic" and mine["url"] == "https://example.test/rss"
    assert saved["sources"][-1]["id"] != "nvd"
    assert settings.load()["sources"][-2]["name"] == "My Feed!"
    settings.reset()


def test_secrets_masked():
    secrets_store.set("NVD_API_KEY", "abcdef1234567890")
    m = secrets_store.masked("NVD_API_KEY")
    assert m["set"] and m["hint"].endswith("7890") and "abcdef" not in m["hint"]
    assert secrets_store.get("NVD_API_KEY") == "abcdef1234567890"
    secrets_store.set("NVD_API_KEY", "")
    assert not secrets_store.masked("NVD_API_KEY")["set"]


# ------------------------------------------------------------------ server --
@pytest.fixture(scope="module")
def srv():
    app, httpd = server.serve(server.find_port(18765))
    yield app
    httpd.shutdown()


def req(app, path, method="GET", body=None, headers=None, host=None):
    h = {"X-VulnScan": "1"} if method != "GET" else {}
    h.update(headers or {})
    r = urllib.request.Request(f"http://127.0.0.1:{app.port}{path}", method=method,
                               data=json.dumps(body).encode() if body is not None else None, headers=h)
    if host:
        r.add_header("Host", host)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


def test_server_pages_and_api(srv):
    code, body, _ = req(srv, "/")
    assert code == 200 and b"Scan" in body
    code, body, _ = req(srv, "/api/results?days=30&severity=all")
    assert code == 200 and "rows" in json.loads(body)
    code, body, hdr = req(srv, "/api/export.xlsx?days=7")
    assert code == 200 and body[:2] == b"PK" and "attachment" in hdr["Content-Disposition"]
    assert req(srv, "/../secrets.json")[0] == 404


def test_server_blocks_cross_site_and_rebinding(srv):
    assert req(srv, "/api/scan", "POST", {}, headers={"X-VulnScan": ""})[0] == 403  # no custom header
    assert req(srv, "/api/info", host="evil.example:8765")[0] == 403  # DNS rebinding


def test_secrets_never_returned(srv):
    req(srv, "/api/secrets", "POST", {"name": "GITHUB_TOKEN", "value": "ghp_supersecretvalue1234"})
    code, body, _ = req(srv, "/api/settings")
    assert b"supersecret" not in body and b"1234" in body
    req(srv, "/api/secrets", "POST", {"name": "GITHUB_TOKEN", "value": ""})


def test_phone_access_needs_key(srv):
    settings.save(dict(settings.load(), phone_access=True))
    srv.apply_phone_access()
    try:
        lan_port = srv.port + server.LAN_PORT_OFFSET
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(f"http://127.0.0.1:{lan_port}/api/info", timeout=5)
        assert e.value.code == 403
        tok = srv.phone_token()

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        with pytest.raises(urllib.error.HTTPError) as e:
            opener.open(f"http://127.0.0.1:{lan_port}/?k={tok}", timeout=5)
        assert e.value.code == 302 and "vs_k=" in e.value.headers["Set-Cookie"]
        r = urllib.request.Request(f"http://127.0.0.1:{lan_port}/api/info", headers={"Cookie": f"vs_k={tok}"})
        with urllib.request.urlopen(r, timeout=5) as resp:
            assert json.loads(resp.read())["phone"] is True
        r = urllib.request.Request(f"http://127.0.0.1:{lan_port}/api/secrets", method="POST", data=b'{"name":"NVD_API_KEY","value":"x"}',
                                   headers={"Cookie": f"vs_k={tok}", "X-VulnScan": "1"})
        with pytest.raises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(r, timeout=5)
        assert e.value.code == 403  # keys can only be changed on the computer
    finally:
        settings.save(dict(settings.load(), phone_access=False))
        srv.apply_phone_access()


def test_failed_source_does_not_stop_others(srv, monkeypatch):
    calls = []

    def boom(ctx):
        calls.append(ctx.key)
        raise adapters.AdapterError("HTTP 500 from somewhere")

    def fine(ctx):
        calls.append(ctx.key)
        r = store.blank("x", "CVE-2026-0001")
        r["modified"] = D(0)
        ctx.save(r)

    monkeypatch.setitem(adapters.BUILTIN, "nvd", boom)
    monkeypatch.setitem(adapters.BUILTIN, "cisa_kev", fine)
    s = settings.load()
    for src in s["sources"]:
        src["enabled"] = src["id"] in ("nvd", "cisa_kev")
    settings.save(s)
    assert srv.scanner.start()
    srv.scanner.thread.join(10)
    st = {x["id"]: x for x in srv.scanner.state["sources"]}
    assert st["nvd"]["status"] == "fail" and "HTTP 500" in st["nvd"]["error"]
    assert st["cisa_kev"]["status"] == "ok" and st["cisa_kev"]["saved"] == 1
    settings.reset()


def test_network_error_is_short_and_plain(con, monkeypatch):
    import requests
    monkeypatch.setattr(adapters.time, "sleep", lambda s: None)

    class Boom(FakeSession):
        def get(self, url, **kw):
            self.calls.append(url)
            raise requests.exceptions.ConnectionError("Max retries exceeded (Caused by NewConnectionError('refused'))")
    sess = Boom([])
    ctx = adapters.Ctx(con, settings.DEFAULT_SOURCES[1], session=sess)
    with pytest.raises(adapters.AdapterError) as e:
        adapters.pull_cisa_kev(ctx)
    assert "Could not reach www.cisa.gov: could not connect" in str(e.value) and len(str(e.value)) < 400
    assert len(sess.calls) == 2  # one retry, not a long wait

"""
Offline tests for setup_vuln_tracker.py against the local mock.

    python3 -m unittest discover -s azure-devops/tests -v
"""
import contextlib
import csv
import io
import os
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import mock_ado  # noqa: E402
import setup_vuln_tracker as svt  # noqa: E402

FAKE_PAT = "fakeTokenValue1234567890abcdefNOTREAL"


def run(*args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = svt.main(list(args))
    return code, out.getvalue()


class SetupFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        mock_ado.S = mock_ado.State()
        cls.srv = mock_ado.start()
        os.environ["AZDO_TEST_BASE_URL"] = f"http://127.0.0.1:{cls.srv.server_port}"
        os.environ["AZDO_ORG_URL"] = "https://dev.azure.com/testorg"
        os.environ["AZDO_PAT"] = FAKE_PAT

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def test_full_flow(self):
        S = mock_ado.S
        # 1. dry run on an empty org: plans everything, writes nothing
        code, out = run("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertEqual(S.writes, [], "dry run must not write")
        self.assertIn("would create process", out)
        self.assertIn("would create PRIVATE project", out)
        self.assertIn("DENY view/edit on area", out)
        self.assertNotIn(FAKE_PAT, out)

        # 2. apply
        code, out = run("--yes")
        self.assertEqual(code, 0, out)
        self.assertNotIn(FAKE_PAT, out)
        self.assertGreater(len(S.writes), 30, out)
        proj = S.projects["Vulnerability Tracking"]
        self.assertEqual(proj["visibility"], "private")
        pid = proj["id"]
        key = next(iter(S.states))
        visible = [s["name"] for s in S.states[key] if not s["hidden"]]
        self.assertEqual(visible, ["Open", "Assigned", "Fix reported", "Verified", "Closed as exception"])
        self.assertEqual(len(S.rules[key]), 4)
        self.assertEqual(S.tfv[pid]["defaultValue"], "Vulnerability Tracking\\Vulnerabilities")
        names = [g["displayName"] for g in S.groups[pid]]
        self.assertIn("Vulnerability Security Team", names)
        # area ACL: 3 broad groups denied, security group allowed
        area_acl = [v for (ns, tok), v in S.acl.items() if ns == svt.NS_CSS]
        self.assertEqual(len(area_acl), 1)
        aces = list(area_acl[0].values())
        self.assertEqual(sum(1 for a in aces if a["deny"] and not a["allow"]), 3)
        self.assertEqual(sum(1 for a in aces if a["allow"] and not a["deny"]), 1)
        folder = S.queries[pid]["children"][0]
        self.assertEqual(len(folder["children"]), 4)
        self.assertEqual(len(S.dashboards[pid][0]["widgets"]), 8)

        # 3. second run is a no-op
        before = list(S.writes)
        code, out = run("--yes")
        self.assertEqual(code, 0, out)
        self.assertEqual(S.writes, before, "second run must not write:\n" + out)
        self.assertIn("made 0 change(s)", out)

        # 4. dry run after setup reports nothing to do
        code, out = run("--dry-run")
        self.assertIn("would make 0 change(s)", out)

    def test_missing_env(self):
        pat = os.environ.pop("AZDO_PAT")
        try:
            code, out = run("--dry-run")
            self.assertEqual(code, 2)
        finally:
            os.environ["AZDO_PAT"] = pat

    def test_org_url_parsing(self):
        self.assertEqual(svt.parse_org("https://dev.azure.com/my-org/")[1], "my-org")
        self.assertEqual(svt.parse_org("https://my-org.visualstudio.com")[1], "my-org")
        with self.assertRaises(svt.SetupError):
            svt.parse_org("http://dev.azure.com/x")


class SampleCsvTest(unittest.TestCase):
    def test_csv(self):
        path = HERE.parent / "sample-vulnerabilities.csv"
        with path.open(encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))
        self.assertTrue(8 <= len(rows) <= 12)
        states = {s[0] for s in svt.STATES}
        for r in rows:
            self.assertEqual(r["ID"], "")
            self.assertEqual(r["Work Item Type"], "Vulnerability")
            self.assertRegex(r["CVE ID"], r"^CVE-2099-\d{5}$")  # fictional range only
            self.assertIn(r["State"], states)
            self.assertNotIn(r["State"], ("Verified", "Closed as exception"))
            self.assertEqual(r["Area Path"], "Vulnerability Tracking\\Vulnerabilities")
            for f in ("Title", "Asset", "Owner Team", "Severity", "Due Date"):
                self.assertTrue(r[f], f)
            if r["State"] == "Fix reported":
                self.assertTrue(r["Installed Version After"])
            self.assertIn(r["Exploitation Suspected"], ("True", "False"))


if __name__ == "__main__":
    unittest.main()

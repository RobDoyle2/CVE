"""
Minimal, stateful stand-in for the Azure DevOps REST endpoints the setup
script uses. It does NOT reproduce Azure DevOps validation rules; it exists
to test the script's control flow: dry-run makes no writes, a first run
creates everything, a second run makes no writes, and the token never
appears in output.
"""
import base64
import json
import re
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

AGILE = "adcc42ab-9882-485e-a3ed-7678f01f66bc"


def gid():
    return str(uuid.uuid4())


class State:
    def __init__(self):
        self.writes = []
        self.auth_headers = set()
        self.processes = [{"typeId": AGILE, "name": "Agile", "customizationType": "system",
                           "parentProcessTypeId": None}]
        self.fields = [
            {"name": "Severity", "referenceName": "Microsoft.VSTS.Common.Severity", "type": "string"},
            {"name": "Due Date", "referenceName": "Microsoft.VSTS.Scheduling.DueDate", "type": "dateTime"},
            {"name": "Title", "referenceName": "System.Title", "type": "string"},
        ]
        self.lists = []
        self.wits = {}          # pid -> [wit]
        self.wit_fields = {}    # (pid, wit) -> [ref]
        self.states = {}        # (pid, wit) -> [state]
        self.layouts = {}       # (pid, wit) -> layout
        self.rules = {}         # (pid, wit) -> [rule]
        self.projects = {}      # name -> project
        self.areas = {}         # pid -> root node
        self.iterations = {}
        self.tfv = {}
        self.groups = {}        # project id -> [group]
        self.acl = {}           # (ns, token) -> {desc: {allow, deny}}
        self.queries = {}       # pid -> shared root
        self.dashboards = {}


S = State()
NS_ACTIONS = {
    "83e28ad4-2d72-4ceb-97b0-c7726d5502c3": {"GENERIC_READ": 1, "GENERIC_WRITE": 2, "WORK_ITEM_READ": 16,
                                             "WORK_ITEM_WRITE": 32, "WORK_ITEM_SAVE_COMMENT": 1024},
    "bf7bfa03-b2b7-47db-8113-fa2e002cc5b1": {"GENERIC_READ": 1},
    "52d39943-cb85-4d7f-8fa8-c6baac873819": {"GENERIC_READ": 1},
    "71356614-aad7-4757-8f2c-0fb3bff6f680": {"Read": 1, "Contribute": 2},
}


def new_group(pid, name):
    sid = f"S-1-9-1551374245-{uuid.uuid4().int % 10**9}"
    d = "vssgp." + base64.urlsafe_b64encode(sid.encode()).decode().rstrip("=")
    return {"displayName": name, "descriptor": d, "originId": gid(), "_sid": sid,
            "principalName": f"[{pid}]\\{name}"}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj=None, headers=None):
        body = json.dumps(obj).encode() if obj is not None else b""
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n)) if n else None

    def handle_any(self, method):
        S.auth_headers.add(self.headers.get("Authorization"))
        u = urlparse(self.path)
        path = unquote(u.path)
        qs = {k: v[0] for k, v in parse_qs(u.query).items()}
        body = self.body() if method in ("POST", "PUT", "PATCH") else None
        if method in ("PUT", "PATCH", "DELETE") or (method == "POST" and not path.endswith("subjectlookup")):
            S.writes.append(f"{method} {path}")
        try:
            r = route(method, path, qs, body)
        except KeyError as e:
            return self.send(404, {"message": f"not found {e}"})
        if r is None:
            return self.send(404, {"message": "not found"})
        code, obj = r if isinstance(r, tuple) else (200, r)
        self.send(code, obj)

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_PUT(self):
        self.handle_any("PUT")

    def do_PATCH(self):
        self.handle_any("PATCH")

    def do_DELETE(self):
        self.handle_any("DELETE")


def lst(v):
    return {"count": len(v), "value": v}


def route(m, p, qs, b):
    o = "/testorg"
    v = "/vssps/testorg"
    if p == f"{o}/_apis/connectionData":
        return {"authenticatedUser": {"providerDisplayName": "Test User", "id": gid()}}
    if p == f"{o}/_apis/work/processes":
        if m == "GET":
            return lst(S.processes)
        pr = {"typeId": gid(), "name": b["name"], "parentProcessTypeId": b["parentProcessTypeId"],
              "customizationType": "inherited"}
        S.processes.append(pr)
        return pr
    if p == f"{o}/_apis/wit/fields":
        if m == "GET":
            return lst(S.fields)
        S.fields.append({k: b[k] for k in ("name", "referenceName", "type")})
        return b
    if p == f"{o}/_apis/work/processes/lists":
        if m == "GET":
            return lst(S.lists)
        pl = {"id": gid(), "name": b["name"]}
        S.lists.append(pl)
        return pl
    mm = re.fullmatch(rf"{o}/_apis/work/processes/([^/]+)/workitemtypes", p, re.I)
    if mm:
        pid = mm.group(1)
        if m == "GET":
            return lst(S.wits.get(pid, []))
        ref = "Custom." + b["name"]
        S.wits.setdefault(pid, []).append({"name": b["name"], "referenceName": ref})
        k = (pid, ref)
        S.wit_fields[k] = ["System.Title"]
        S.states[k] = [{"id": gid(), "name": n, "stateCategory": c, "customizationType": "system",
                        "hidden": False} for n, c in
                       [("New", "Proposed"), ("Active", "InProgress"), ("Closed", "Completed")]]
        S.layouts[k] = {"pages": [{"id": "page1", "label": "Details", "pageType": "custom", "sections": [
            {"id": f"Section{i}", "groups": []} for i in (1, 2, 3)]}]}
        S.rules[k] = []
        return {"referenceName": ref, "name": b["name"]}
    mm = re.fullmatch(rf"{o}/_apis/work/processes/([^/]+)/workItemTypes/([^/]+)/(.*)", p, re.I)
    if mm:
        k = (mm.group(1), mm.group(2))
        rest = mm.group(3)
        if k not in S.states:
            return None
        if rest == "fields":
            if m == "GET":
                return lst([{"referenceName": r} for r in S.wit_fields[k]])
            assert any(f["referenceName"] == b["referenceName"] for f in S.fields), b
            S.wit_fields[k].append(b["referenceName"])
            return b
        if rest == "states":
            if m == "GET":
                return lst(S.states[k])
            st = dict(b, id=gid(), customizationType="custom", hidden=False)
            S.states[k].append(st)
            return st
        sm = re.fullmatch(r"states/(.+)", rest)
        if sm:
            st = next(s for s in S.states[k] if s["id"] == sm.group(1))
            if m == "PUT":
                st["hidden"] = b["hidden"]
            elif m == "DELETE":
                S.states[k].remove(st)
            return st
        if rest == "layout":
            return S.layouts[k]
        gm = re.fullmatch(r"layout/pages/([^/]+)/sections/([^/]+)/groups", rest)
        if gm:
            page = S.layouts[k]["pages"][0]
            sec = next(s for s in page["sections"] if s["id"] == gm.group(2))
            g = {"id": gid(), "label": b["label"], "controls": []}
            sec["groups"].append(g)
            return g
        cm = re.fullmatch(r"layout/groups/([^/]+)/controls", rest)
        if cm:
            for sec in S.layouts[k]["pages"][0]["sections"]:
                for g in sec["groups"]:
                    if g["id"] == cm.group(1):
                        g["controls"].append({"id": b["id"]})
                        return b
            return None
        if rest == "rules":
            if m == "GET":
                return lst(S.rules[k])
            S.rules[k].append(b)
            return b
    mm = re.fullmatch(rf"{o}/_apis/projects/(.+)", p)
    if mm and m == "GET":
        return S.projects.get(mm.group(1))
    if p == f"{o}/_apis/projects" and m == "POST":
        pid = gid()
        S.projects[b["name"]] = {"id": pid, "name": b["name"], "visibility": b["visibility"],
                                 "capabilities": b["capabilities"],
                                 "defaultTeam": {"id": gid(), "name": b["name"] + " Team"}}
        S.areas[pid] = {"identifier": gid(), "name": b["name"], "children": []}
        S.iterations[pid] = {"identifier": gid(), "name": b["name"]}
        S.groups[pid] = [new_group(pid, n) for n in
                         ("Project Administrators", "Contributors", "Readers", "Build Administrators",
                          "Project Valid Users", b["name"] + " Team")]
        S.queries[pid] = {"id": gid(), "name": "Shared Queries", "children": []}
        S.dashboards[pid] = []
        return 202, {"id": "op1", "status": "queued"}
    if p == f"{o}/_apis/operations/op1":
        return {"status": "succeeded"}
    mm = re.fullmatch(rf"{o}/([^/]+)/_apis/wit/classificationnodes/(areas|iterations)", p)
    if mm:
        pid = mm.group(1)
        root = (S.areas if mm.group(2) == "areas" else S.iterations).get(pid)
        if root is None:
            return None
        if m == "GET":
            return root
        c = {"identifier": gid(), "name": b["name"]}
        root["children"].append(c)
        return c
    mm = re.fullmatch(rf"{o}/([^/]+)/([^/]+)/_apis/work/teamsettings/teamfieldvalues", p)
    if mm:
        if m == "GET":
            return S.tfv.get(mm.group(1), {"defaultValue": "Vulnerability Tracking", "values": []})
        S.tfv[mm.group(1)] = b
        return b
    mm = re.fullmatch(rf"{v}/_apis/graph/descriptors/(.+)", p)
    if mm:
        return {"value": "scp." + mm.group(1)} if mm.group(1) in S.groups else None
    if p == f"{v}/_apis/graph/groups":
        pid = qs["scopeDescriptor"][4:]
        if m == "GET":
            return lst(S.groups[pid])
        g = new_group(pid, b["displayName"])
        S.groups[pid].append(g)
        return g
    if p == f"{v}/_apis/identities":
        return lst([])  # forces the base64 fallback
    mm = re.fullmatch(rf"{v}/_apis/graph/Memberships/(.+)", p)
    if mm:
        return lst([])
    mm = re.fullmatch(rf"{o}/_apis/securitynamespaces/(.+)", p)
    if mm:
        acts = NS_ACTIONS[mm.group(1)]
        return lst([{"namespaceId": mm.group(1), "actions": [{"name": n, "bit": bt} for n, bt in acts.items()]}])
    mm = re.fullmatch(rf"{o}/_apis/accesscontrollists/(.+)", p)
    if mm:
        aces = S.acl.get((mm.group(1), qs["token"]), {})
        return lst([{"token": qs["token"], "acesDictionary": aces}])
    mm = re.fullmatch(rf"{o}/_apis/accesscontrolentries/(.+)", p)
    if mm:
        assert b["token"] and "DRYRUN" not in b["token"], b
        for ace in b["accessControlEntries"]:
            assert ace["descriptor"].startswith("Microsoft.TeamFoundation.Identity;S-1-9-"), ace
            S.acl.setdefault((mm.group(1), b["token"]), {})[ace["descriptor"]] = \
                {"allow": ace["allow"], "deny": ace["deny"]}
        return lst(b["accessControlEntries"])
    mm = re.fullmatch(rf"{o}/([^/]+)/_apis/wit/queries/(.+)", p)
    if mm:
        root = S.queries.get(mm.group(1))
        if root is None:
            return None
        parts = mm.group(2).split("/")
        if m == "GET":
            node = root
            for part in parts[1:]:
                node = next((c for c in node["children"] if c["name"] == part), None)
                if node is None:
                    return None
            return node
        parent = root if parts == ["Shared Queries"] else next(
            c for c in root["children"] if c["id"] == parts[0])
        n = {"id": gid(), "name": b["name"], "children": []}
        parent["children"].append(n)
        return n
    mm = re.fullmatch(rf"{o}/([^/]+)/_apis/dashboard/dashboards", p)
    if mm:
        if m == "GET":
            return lst(S.dashboards[mm.group(1)])
        S.dashboards[mm.group(1)].append({"name": b["name"], "widgets": b["widgets"]})
        return b
    return None


def start():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

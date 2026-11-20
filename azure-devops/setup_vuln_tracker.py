#!/usr/bin/env python3
"""
Vulnerability remediation tracker - Azure DevOps setup script.

Creates (or verifies, if they already exist):
  * an inherited process "Vulnerability Tracking" (parent: Agile)
  * a custom work item type "Vulnerability" with custom fields, states,
    form layout and workflow rules
  * a private project "Vulnerability Tracking" that uses the process
  * an area path "Vulnerabilities" that is hidden from the broad default
    project groups and visible only to a named security group
  * an empty project-level security group
  * shared queries and a project dashboard

The organisation URL and personal access token (PAT) are read from the
environment. The PAT is never printed, logged or written to disk.

    export AZDO_ORG_URL="https://dev.azure.com/<your-org>"
    read -rs AZDO_PAT && export AZDO_PAT      # paste token, press Enter
    python3 setup_vuln_tracker.py --dry-run   # read-only: show the plan
    python3 setup_vuln_tracker.py             # apply (asks for confirmation)

Only the Python 3.9+ standard library is used.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# --------------------------------------------------------------------------
# Configuration. Nothing here is organisation-specific: to target another
# organisation change only AZDO_ORG_URL and AZDO_PAT.
# --------------------------------------------------------------------------
PROJECT_NAME = "Vulnerability Tracking"
PROJECT_DESCRIPTION = "Security-owned tracker for vulnerability remediation per asset."
PROCESS_NAME = "Vulnerability Tracking"
PROCESS_DESCRIPTION = "Inherited from Agile. Adds the Vulnerability work item type."
PARENT_PROCESS_NAME = "Agile"
AGILE_TYPE_ID = "adcc42ab-9882-485e-a3ed-7678f01f66bc"  # fixed id of the system Agile process
WIT_NAME = "Vulnerability"
AREA_NAME = "Vulnerabilities"
SECURITY_GROUP = os.environ.get("AZDO_SECURITY_GROUP", "Vulnerability Security Team")
QUERY_FOLDER = "Vulnerability Tracking"
DASHBOARD_NAME = "Vulnerability Tracking"

# Project groups that are denied view access on the Vulnerabilities area.
# NOT included on purpose:
#   * Project Administrators - would lock out the creator.
#   * Project Valid Users    - every project member, including the security
#                              group, is in it, and a Deny always wins.
BROAD_GROUPS = ["Contributors", "Readers", "Build Administrators"]

VERIFICATION_METHODS = [
    "Authenticated rescan",
    "Unauthenticated rescan",
    "Package version check",
    "Configuration review",
    "Manual test",
]

# key, display name, reference name, type, required on the form, system field?
FIELDS = [
    dict(key="cve", name="CVE ID", ref="Custom.CVEID", type="string", required=True),
    dict(key="asset", name="Asset", ref="Custom.Asset", type="string", required=True),
    dict(key="team", name="Owner Team", ref="Custom.OwnerTeam", type="string", required=True),
    # "Severity" and "Due Date" already exist in every organisation as system
    # fields; field names are unique per organisation, so they are reused.
    dict(key="severity", name="Severity", ref="Microsoft.VSTS.Common.Severity",
         type="string", required=True, system=True),
    dict(key="due", name="Due Date", ref="Microsoft.VSTS.Scheduling.DueDate",
         type="dateTime", required=True, system=True),
    dict(key="fix", name="Required Fix", ref="Custom.RequiredFix", type="string"),
    dict(key="before", name="Installed Version Before", ref="Custom.InstalledVersionBefore", type="string"),
    dict(key="after", name="Installed Version After", ref="Custom.InstalledVersionAfter", type="string"),
    dict(key="vdate", name="Verification Date", ref="Custom.VerificationDate", type="dateTime"),
    dict(key="vmethod", name="Verification Method", ref="Custom.VerificationMethod", type="string",
         picklist="Vulnerability Verification Method"),
    dict(key="exploit", name="Exploitation Suspected", ref="Custom.ExploitationSuspected",
         type="boolean", default=False),
]

# name, category, colour. Order is the workflow order.
STATES = [
    ("Open", "Proposed", "b2b2b2"),
    ("Assigned", "InProgress", "007acc"),
    ("Fix reported", "Resolved", "ff9d00"),
    ("Verified", "Completed", "339933"),
    ("Closed as exception", "Removed", "cc293d"),
]
# Default states a new custom type receives; hidden so "Open" is the initial state.
DEFAULT_STATES_TO_HIDE = {"new", "active", "resolved", "closed", "removed"}

FORM_GROUPS = [
    # label, section index on the Details page, field keys
    ("Vulnerability", 1, ["cve", "asset", "team", "severity", "due", "exploit"]),
    ("Remediation and verification", 2, ["fix", "before", "after", "vdate", "vmethod"]),
]

API = "api-version=7.1"
API_GRAPH = "api-version=7.1-preview.1"
API_DASH = "api-version=7.1-preview.3"

# Well-known security namespace ids (identical in every organisation).
NS_CSS = "83e28ad4-2d72-4ceb-97b0-c7726d5502c3"          # area paths
NS_ITERATION = "bf7bfa03-b2b7-47db-8113-fa2e002cc5b1"
NS_PROJECT = "52d39943-cb85-4d7f-8fa8-c6baac873819"
NS_QUERY_FOLDERS = "71356614-aad7-4757-8f2c-0fb3bff6f680"

PH = "DRYRUN-NEW"  # placeholder id for objects a dry run would create


# --------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------
_SECRET = ""


def redact(text: str) -> str:
    text = str(text)
    if _SECRET:
        text = text.replace(_SECRET, "***")
    return text


def log(msg: str = "") -> None:
    print(redact(msg), flush=True)


def section(title: str) -> None:
    log("")
    log(f"== {title}")


class ApiError(Exception):
    def __init__(self, status: int, method: str, url: str, body: str):
        self.status = status
        super().__init__(redact(f"HTTP {status} on {method} {url}: {body[:600]}"))


class SetupError(Exception):
    pass


# --------------------------------------------------------------------------
# HTTP client
# --------------------------------------------------------------------------
class Client:
    def __init__(self, pat: str, dry_run: bool):
        self._auth = "Basic " + base64.b64encode((":" + pat).encode()).decode()
        self.dry_run = dry_run
        self.changes: list[str] = []

    def request(self, method: str, url: str, body=None, allow_404: bool = False,
                content_type: str = "application/json"):
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(5):
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("Authorization", self._auth)
            req.add_header("Accept", "application/json")
            if data is not None:
                req.add_header("Content-Type", content_type)
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    raw = resp.read().decode("utf-8", errors="replace")
                    # A bad or expired token gets a 203 + HTML sign-in page, not a 401.
                    if resp.status == 203 or raw.lstrip().startswith("<"):
                        raise ApiError(401, method, url, "Not authenticated (got a sign-in page). "
                                       "Check AZDO_PAT, its expiry, its scopes and that it was "
                                       "created for this organisation.")
                    return (json.loads(raw) if raw.strip() else {}), resp.headers
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", errors="replace")
                if e.code == 404 and allow_404:
                    return None, e.headers
                if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                    wait = int(e.headers.get("Retry-After") or 2 ** attempt)
                    log(f"    (HTTP {e.code}, retrying in {wait}s)")
                    time.sleep(wait)
                    continue
                raise ApiError(e.code, method, url, text) from None
            except urllib.error.URLError as e:
                if attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                raise ApiError(0, method, url, f"network error: {e.reason}") from None
        raise ApiError(0, method, url, "retries exhausted")

    # --- reads (always executed, also in dry-run) -------------------------
    def get(self, url: str, allow_404: bool = False):
        if PH in url:
            return None
        return self.request("GET", url, allow_404=allow_404)[0]

    def get_list(self, url: str) -> list:
        if PH in url:
            return []
        out, token = [], None
        while True:
            u = url
            if token:
                u += ("&" if "?" in u else "?") + "continuationToken=" + urllib.parse.quote(token)
            data, headers = self.request("GET", u)
            out.extend(data.get("value", []) if isinstance(data, dict) else data)
            token = headers.get("X-MS-ContinuationToken") if headers else None
            if not token:
                return out

    def post_read(self, url: str, body):
        """POST that does not change anything (lookups)."""
        if PH in url:
            return None
        return self.request("POST", url, body)[0]

    # --- writes (skipped in dry-run) --------------------------------------
    def change(self, description: str, method: str, url: str, body=None, placeholder=None):
        self.changes.append(description)
        if self.dry_run:
            log(f"  [dry-run] would {description}")
            return placeholder if placeholder is not None else {}
        log(f"  + {description}")
        return self.request(method, url, body)[0]


def q(s: str) -> str:
    return urllib.parse.quote(str(s), safe="")


def find(items, name, key="name"):
    for it in items or []:
        if str(it.get(key, "")).lower() == name.lower():
            return it
    return None


# --------------------------------------------------------------------------
# Setup steps
# --------------------------------------------------------------------------
class Setup:
    def __init__(self, client: Client, org_url: str, vssps_url: str):
        self.c = client
        self.org = org_url
        self.vssps = vssps_url
        self.manual: list[str] = []
        self.warnings: list[str] = []
        self.refs = {f["key"]: f["ref"] for f in FIELDS}
        self.process_id = None
        self.wit = None
        self.project = None
        self.project_id = None
        self.area_root = None
        self.area = None
        self.group = None
        self.queries: dict[str, dict] = {}
        self.user = None

    # 0 ---------------------------------------------------------------------
    def check_connection(self):
        section("Connection")
        data = self.c.get(f"{self.org}/_apis/connectionData")
        self.user = data.get("authenticatedUser", {})
        name = self.user.get("providerDisplayName") or self.user.get("customDisplayName") or "?"
        log(f"  organisation : {self.org}")
        log(f"  signed in as : {name}")
        log(f"  mode         : {'DRY RUN (no changes)' if self.c.dry_run else 'APPLY'}")

    # 1 ---------------------------------------------------------------------
    def ensure_process(self):
        section(f"Inherited process '{PROCESS_NAME}'")
        procs = self.c.get_list(f"{self.org}/_apis/work/processes?{API}")
        parent = next((p for p in procs if p.get("typeId") == AGILE_TYPE_ID), None) or \
            next((p for p in procs if p.get("name") == PARENT_PROCESS_NAME
                  and p.get("customizationType") == "system"), None)
        if not parent:
            raise SetupError("System process 'Agile' not found in this organisation.")
        existing = find(procs, PROCESS_NAME)
        if existing:
            if existing.get("parentProcessTypeId") != parent["typeId"]:
                raise SetupError(f"A process named '{PROCESS_NAME}' exists but is not inherited "
                                 "from Agile. Rename it or change PROCESS_NAME.")
            log(f"  = exists (id {existing['typeId']})")
            self.process_id = existing["typeId"]
            return
        r = self.c.change(f"create process '{PROCESS_NAME}' inherited from Agile", "POST",
                          f"{self.org}/_apis/work/processes?{API}",
                          {"name": PROCESS_NAME, "parentProcessTypeId": parent["typeId"],
                           "description": PROCESS_DESCRIPTION},
                          placeholder={"typeId": PH})
        self.process_id = r["typeId"]

    # 2 ---------------------------------------------------------------------
    def ensure_fields(self):
        section("Organisation fields")
        fields = self.c.get_list(f"{self.org}/_apis/wit/fields?{API}")
        by_ref = {f["referenceName"].lower(): f for f in fields}
        by_name = {f["name"].lower(): f for f in fields}
        for spec in FIELDS:
            f = by_ref.get(spec["ref"].lower())
            if f is None and not spec.get("system"):
                f = by_name.get(spec["name"].lower())
                if f is not None:
                    self.warnings.append(
                        f"Field name '{spec['name']}' already exists as {f['referenceName']}; reusing it.")
            if f is not None:
                ftype = str(f.get("type", "")).lower()
                if ftype != spec["type"].lower():
                    raise SetupError(f"Field '{f['name']}' ({f['referenceName']}) exists with type "
                                     f"'{ftype}', expected '{spec['type']}'. Resolve manually.")
                self.refs[spec["key"]] = f["referenceName"]
                log(f"  = {spec['name']:<26} {f['referenceName']}")
                continue
            if spec.get("system"):
                raise SetupError(f"System field {spec['ref']} not found; unexpected for Azure DevOps.")
            picklist_id = self.ensure_picklist(spec["picklist"]) if spec.get("picklist") else None
            body = {"name": spec["name"], "referenceName": spec["ref"], "type": spec["type"],
                    "description": f"Vulnerability tracking: {spec['name']}", "usage": "workItem",
                    "readOnly": False, "canSortBy": True, "isQueryable": True, "isIdentity": False,
                    "isPicklist": bool(picklist_id), "isPicklistSuggested": False}
            if picklist_id:
                body["picklistId"] = picklist_id
            self.c.change(f"create field '{spec['name']}' ({spec['ref']}, {spec['type']})", "POST",
                          f"{self.org}/_apis/wit/fields?{API}", body)

    def ensure_picklist(self, name):
        lists = self.c.get_list(f"{self.org}/_apis/work/processes/lists?{API}")
        existing = find(lists, name)
        if existing:
            log(f"  = picklist '{name}'")
            return existing["id"]
        r = self.c.change(f"create picklist '{name}' ({', '.join(VERIFICATION_METHODS)})", "POST",
                          f"{self.org}/_apis/work/processes/lists?{API}",
                          {"name": name, "type": "String", "items": VERIFICATION_METHODS,
                           "isSuggested": False}, placeholder={"id": PH})
        return r["id"]

    # 3 ---------------------------------------------------------------------
    def wit_url(self, suffix=""):
        return f"{self.org}/_apis/work/processes/{self.process_id}/workItemTypes/{q(self.wit)}{suffix}"

    def ensure_wit(self):
        section(f"Work item type '{WIT_NAME}'")
        wits = self.c.get_list(f"{self.org}/_apis/work/processes/{self.process_id}/workitemtypes?{API}")
        existing = find(wits, WIT_NAME)
        if existing:
            log(f"  = exists ({existing['referenceName']})")
            self.wit = existing["referenceName"]
            return
        r = self.c.change(f"create work item type '{WIT_NAME}'", "POST",
                          f"{self.org}/_apis/work/processes/{self.process_id}/workitemtypes?{API}",
                          {"name": WIT_NAME, "description": "A vulnerability on a specific asset.",
                           "color": "CC293D", "icon": "icon_insect", "isDisabled": False},
                          placeholder={"referenceName": PH})
        self.wit = r["referenceName"]

    def ensure_wit_fields(self):
        section(f"Fields on '{WIT_NAME}'")
        present = {f["referenceName"].lower() for f in self.c.get_list(self.wit_url(f"/fields?{API}"))}
        for spec in FIELDS:
            ref = self.refs[spec["key"]]
            if ref.lower() in present:
                log(f"  = {spec['name']}")
                continue
            body = {"referenceName": ref, "required": bool(spec.get("required")), "allowGroups": False}
            if "default" in spec:
                body["defaultValue"] = spec["default"]
            self.c.change(f"add field '{spec['name']}'" + (" (required)" if spec.get("required") else ""),
                          "POST", self.wit_url(f"/fields?{API}"), body)

    # 4 ---------------------------------------------------------------------
    def ensure_states(self):
        section("Workflow states")
        states = self.c.get_list(self.wit_url(f"/states?{API}"))
        if PH in str(self.wit):
            log("  (new type: its default states New/Active/Closed would be hidden after the adds)")
        for order, (name, category, color) in enumerate(STATES, start=1):
            st = find(states, name)
            if st:
                if st.get("stateCategory", "").lower() != category.lower():
                    self.warnings.append(f"State '{name}' exists in category '{st.get('stateCategory')}'"
                                         f", expected '{category}'. Not changed.")
                if st.get("hidden"):
                    self.manual.append(f"State '{name}' exists but is hidden; unhide it in the process editor.")
                log(f"  = {name} ({st.get('stateCategory')})")
                continue
            try:
                self.c.change(f"add state '{name}' in category {category}", "POST",
                              self.wit_url(f"/states?{API}"),
                              {"name": name, "stateCategory": category, "color": color, "order": order})
            except ApiError as e:
                self.manual.append(f"Could not add state '{name}' ({category}) via the API: {e}. "
                                   "Add it in Organization settings > Process > "
                                   f"{PROCESS_NAME} > {WIT_NAME} > States.")
                log(f"  ! failed: {e}")
        # hide the default states so that "Open" becomes the initial state
        wanted = {s[0].lower() for s in STATES}
        for st in states:
            nm = st["name"]
            if nm.lower() in wanted or st.get("hidden"):
                continue
            if nm.lower() not in DEFAULT_STATES_TO_HIDE:
                self.warnings.append(f"Unexpected state '{nm}' left untouched.")
                continue
            try:
                if st.get("customizationType") == "custom":
                    self.c.change(f"remove default state '{nm}'", "DELETE",
                                  self.wit_url(f"/states/{st['id']}?{API}"))
                else:
                    self.c.change(f"hide default state '{nm}'", "PUT",
                                  self.wit_url(f"/states/{st['id']}?{API}"), {"hidden": True})
            except ApiError as e:
                self.manual.append(f"Could not hide default state '{nm}': {e}. Hide it manually in "
                                   f"Organization settings > Process > {PROCESS_NAME} > {WIT_NAME} > States.")
                log(f"  ! failed: {e}")

    # 5 ---------------------------------------------------------------------
    def ensure_layout(self):
        section("Form layout")
        layout = self.c.get(self.wit_url(f"/layout?{API}")) or {"pages": []}
        placed = set()
        for page in layout.get("pages", []):
            for sec in page.get("sections", []):
                for grp in sec.get("groups", []):
                    for ctl in grp.get("controls", []):
                        placed.add(str(ctl.get("id", "")).lower())
        page = find(layout.get("pages", []), "Details", key="label") or next(
            (p for p in layout.get("pages", []) if p.get("sections")), None)
        if page is None:
            if self.c.dry_run and PH in str(self.wit):
                for label, _, keys in FORM_GROUPS:
                    self.c.change(f"add form group '{label}' with {len(keys)} fields", "POST", "")
            else:
                self.manual.append("Could not find the Details page of the form; add the custom "
                                   "fields to the form manually (Process > Vulnerability > Layout).")
            return
        sections = page.get("sections", [])
        for label, idx, keys in FORM_GROUPS:
            sec = sections[min(idx, len(sections) - 1)]
            grp = None
            for s in sections:
                grp = grp or find(s.get("groups", []), label, key="label")
            if grp is None:
                grp = self.c.change(
                    f"add form group '{label}'", "POST",
                    f"{self.org}/_apis/work/processes/{self.process_id}/workItemTypes/{q(self.wit)}"
                    f"/layout/pages/{page['id']}/sections/{sec['id']}/groups?{API}",
                    {"label": label, "visible": True}, placeholder={"id": PH})
            for key in keys:
                ref = self.refs[key]
                if ref.lower() in placed:
                    continue
                name = next(f["name"] for f in FIELDS if f["key"] == key)
                self.c.change(f"place field '{name}' in group '{label}'", "POST",
                              f"{self.org}/_apis/work/processes/{self.process_id}/workItemTypes/"
                              f"{q(self.wit)}/layout/groups/{grp['id']}/controls?{API}",
                              {"id": ref, "label": name, "visible": True, "readOnly": False})
        log("  layout checked")

    # 6 ---------------------------------------------------------------------
    def ensure_project(self):
        section(f"Project '{PROJECT_NAME}'")
        proj = self.c.get(f"{self.org}/_apis/projects/{q(PROJECT_NAME)}?includeCapabilities=true&{API}",
                          allow_404=True)
        if proj:
            vis = proj.get("visibility")
            log(f"  = exists (id {proj['id']}, visibility {vis})")
            if str(vis).lower() != "private":
                raise SetupError(f"Project exists with visibility '{vis}'. It must be private; "
                                 "change it in Project settings > Overview before re-running.")
            tmpl = proj.get("capabilities", {}).get("processTemplate", {}).get("templateTypeId")
            if tmpl and self.process_id and PH not in self.process_id and tmpl != self.process_id:
                raise SetupError("Project exists but uses a different process. Change it to "
                                 f"'{PROCESS_NAME}' (Organization settings > Process) and re-run.")
            self.project, self.project_id = proj, proj["id"]
            return
        r = self.c.change(f"create PRIVATE project '{PROJECT_NAME}' using process '{PROCESS_NAME}'",
                          "POST", f"{self.org}/_apis/projects?{API}",
                          {"name": PROJECT_NAME, "description": PROJECT_DESCRIPTION,
                           "visibility": "private",
                           "capabilities": {"versioncontrol": {"sourceControlType": "Git"},
                                            "processTemplate": {"templateTypeId": self.process_id}}},
                          placeholder={"id": PH})
        if self.c.dry_run:
            self.project_id = PH
            return
        op_id = r["id"]
        for _ in range(60):
            op = self.c.get(f"{self.org}/_apis/operations/{op_id}?{API}")
            status = op.get("status")
            if status == "succeeded":
                break
            if status in ("failed", "cancelled"):
                raise SetupError(f"Project creation {status}: {op.get('resultMessage')}")
            time.sleep(3)
        else:
            raise SetupError("Timed out waiting for project creation.")
        self.project = self.c.get(f"{self.org}/_apis/projects/{q(PROJECT_NAME)}?{API}")
        self.project_id = self.project["id"]
        log(f"  project id {self.project_id}")

    # 7 ---------------------------------------------------------------------
    def ensure_area(self):
        section(f"Area path '{PROJECT_NAME}\\{AREA_NAME}'")
        base = f"{self.org}/{self.project_id}/_apis/wit/classificationnodes/areas"
        self.area_root = self.c.get(f"{base}?$depth=1&{API}")
        child = find((self.area_root or {}).get("children"), AREA_NAME)
        if child:
            log("  = exists")
            self.area = child
        else:
            self.area = self.c.change(f"create area '{AREA_NAME}'", "POST", f"{base}?{API}",
                                      {"name": AREA_NAME}, placeholder={"identifier": PH})
        # Make the default team file new work items under the protected area.
        area_path = f"{PROJECT_NAME}\\{AREA_NAME}"
        team = (self.project or {}).get("defaultTeam")
        if not team:
            if self.c.dry_run:
                self.c.change(f"set default team's default area to '{area_path}'", "PATCH", "")
            else:
                self.manual.append(f"Set the default team's area to '{area_path}' "
                                   "(Project settings > Team configuration > Areas).")
            return
        url = f"{self.org}/{self.project_id}/{team['id']}/_apis/work/teamsettings/teamfieldvalues?{API}"
        tfv = self.c.get(url) or {}
        if str(tfv.get("defaultValue", "")).lower() == area_path.lower():
            log(f"  = default team area is '{area_path}'")
            return
        self.c.change(f"set default team '{team['name']}' area to '{area_path}' (new items land there)",
                      "PATCH", url, {"defaultValue": area_path,
                                     "values": [{"value": area_path, "includeChildren": True}]})

    # 8 ---------------------------------------------------------------------
    def project_groups(self):
        scope = self.c.get(f"{self.vssps}/_apis/graph/descriptors/{self.project_id}?{API_GRAPH}")
        if not scope:
            return None, []
        sd = scope["value"]
        return sd, self.c.get_list(f"{self.vssps}/_apis/graph/groups?scopeDescriptor={q(sd)}&{API_GRAPH}")

    def ensure_security_group(self):
        section(f"Security group '{SECURITY_GROUP}'")
        sd, groups = self.project_groups()
        g = find(groups, SECURITY_GROUP, key="displayName")
        if g:
            log("  = exists")
            self.group = g
            return groups
        self.group = self.c.change(
            f"create empty project group '{SECURITY_GROUP}'", "POST",
            f"{self.vssps}/_apis/graph/groups?scopeDescriptor={q(sd or PH)}&{API_GRAPH}",
            {"displayName": SECURITY_GROUP,
             "description": "Security team: the only group that can see the Vulnerabilities area "
                            "and set Verified / Closed as exception. Created empty."},
            placeholder={"descriptor": PH, "originId": PH, "displayName": SECURITY_GROUP})
        return groups + [self.group]

    # 9 ---------------------------------------------------------------------
    def identity_descriptor(self, subject_descriptor: str):
        if PH in subject_descriptor:
            return PH
        data = self.c.get(f"{self.vssps}/_apis/identities?subjectDescriptors={q(subject_descriptor)}"
                          f"&queryMembership=None&{API}")
        vals = (data or {}).get("value") or []
        if vals and vals[0] and vals[0].get("descriptor"):
            return vals[0]["descriptor"]
        # Fallback: a vssgp descriptor is base64 of the group SID.
        b64 = subject_descriptor.split(".", 1)[1]
        sid = base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)).decode()
        return "Microsoft.TeamFoundation.Identity;" + sid

    def bits(self, ns_id, names):
        data = self.c.get(f"{self.org}/_apis/securitynamespaces/{ns_id}?{API}")
        ns = (data.get("value") or [data])[0]
        actions = {a["name"]: a["bit"] for a in ns.get("actions", [])}
        missing = [n for n in names if n not in actions and not n.endswith("?")]
        if missing:
            raise SetupError(f"Security namespace {ns_id} lacks actions {missing}")
        return sum(actions.get(n.rstrip("?"), 0) for n in names)

    def ensure_ace(self, ns_id, token, descriptor, who, what, allow=0, deny=0):
        if PH in token or PH in descriptor:
            self.c.change(f"{what} for '{who}'", "POST", "")
            return
        acls = self.c.get_list(f"{self.org}/_apis/accesscontrollists/{ns_id}?token={q(token)}"
                               f"&descriptors={q(descriptor)}&includeExtendedInfo=false&{API}")
        cur_allow = cur_deny = 0
        for acl in acls:
            for d, ace in (acl.get("acesDictionary") or {}).items():
                if d.lower() == descriptor.lower():
                    cur_allow, cur_deny = ace.get("allow", 0), ace.get("deny", 0)
        if (cur_allow & allow) == allow and (cur_deny & deny) == deny and \
                not (cur_allow & deny) and not (cur_deny & allow):
            log(f"  = {what} for '{who}'")
            return
        new_allow = (cur_allow | allow) & ~deny
        new_deny = (cur_deny | deny) & ~allow
        self.c.change(f"{what} for '{who}'", "POST",
                      f"{self.org}/_apis/accesscontrolentries/{ns_id}?{API}",
                      {"token": token, "merge": False,
                       "accessControlEntries": [{"descriptor": descriptor, "allow": new_allow,
                                                 "deny": new_deny, "extendedInfo": {}}]})

    def ensure_permissions(self, groups):
        section("Permissions")
        area_bits = self.bits(NS_CSS, ["GENERIC_READ", "WORK_ITEM_READ", "WORK_ITEM_WRITE",
                                       "WORK_ITEM_SAVE_COMMENT?"])
        root_id = (self.area_root or {}).get("identifier", PH)
        area_token = f"vstfs:///Classification/Node/{root_id}:vstfs:///Classification/Node/" \
                     f"{(self.area or {}).get('identifier', PH)}"
        sec_desc = self.identity_descriptor(self.group["descriptor"])

        for name in BROAD_GROUPS:
            g = find(groups, name, key="displayName")
            if not g:
                if PH in str(self.project_id):
                    self.c.change(f"DENY view/edit on area '{AREA_NAME}' for '{name}'", "POST", "")
                else:
                    self.warnings.append(f"Default group '{name}' not found; no deny set for it.")
                continue
            self.ensure_ace(NS_CSS, area_token, self.identity_descriptor(g["descriptor"]), name,
                            f"DENY view/edit on area '{AREA_NAME}'", deny=area_bits)
        self.ensure_ace(NS_CSS, area_token, sec_desc, SECURITY_GROUP,
                        f"ALLOW view/edit on area '{AREA_NAME}'", allow=area_bits)
        self.ensure_ace(NS_PROJECT, f"$PROJECT:vstfs:///Classification/TeamProject/{self.project_id}",
                        sec_desc, SECURITY_GROUP, "ALLOW 'View project-level information'",
                        allow=self.bits(NS_PROJECT, ["GENERIC_READ"]))
        it_root = self.c.get(f"{self.org}/{self.project_id}/_apis/wit/classificationnodes/iterations"
                             f"?$depth=0&{API}") or {}
        self.ensure_ace(NS_ITERATION, f"vstfs:///Classification/Node/{it_root.get('identifier', PH)}",
                        sec_desc, SECURITY_GROUP, "ALLOW view on iterations",
                        allow=self.bits(NS_ITERATION, ["GENERIC_READ"]))
        self.sec_desc = sec_desc

    # 10 --------------------------------------------------------------------
    def ensure_rules(self):
        section("Workflow rules")
        st = self.refs
        group_value = self.group.get("originId", PH)
        rules = [
            ("VT: only security can set Verified",
             [{"conditionType": "whenCurrentUserIsNotMemberOfGroup", "value": group_value}],
             [{"actionType": "disallowValue", "targetField": "System.State", "value": "Verified"}]),
            ("VT: only security can close as exception",
             [{"conditionType": "whenCurrentUserIsNotMemberOfGroup", "value": group_value}],
             [{"actionType": "disallowValue", "targetField": "System.State",
               "value": "Closed as exception"}]),
            ("VT: evidence required for Verified",
             [{"conditionType": "whenStateChangedTo", "value": "Verified"}],
             [{"actionType": "makeRequired", "targetField": st[k], "value": ""}
              for k in ("after", "vdate", "vmethod")]),
            ("VT: installed version required for Fix reported",
             [{"conditionType": "whenStateChangedTo", "value": "Fix reported"}],
             [{"actionType": "makeRequired", "targetField": st["after"], "value": ""}]),
        ]
        existing = self.c.get_list(self.wit_url(f"/rules?{API}"))
        for name, conds, actions in rules:
            if find(existing, name):
                log(f"  = {name}")
                continue
            try:
                self.c.change(f"add rule '{name}'", "POST", self.wit_url(f"/rules?{API}"),
                              {"name": name, "conditions": conds, "actions": actions,
                               "isDisabled": False})
            except ApiError as e:
                log(f"  ! failed: {e}")
                self.manual.append(
                    f"Rule '{name}' could not be created via the API ({e.status}). Create it in "
                    f"Organization settings > Process > {PROCESS_NAME} > {WIT_NAME} > Rules "
                    "(see README, 'Manual steps').")

    # 11 --------------------------------------------------------------------
    def wiql(self, where, order="[Microsoft.VSTS.Scheduling.DueDate] ASC"):
        r = self.refs
        cols = ", ".join(f"[{c}]" for c in [
            "System.Id", "System.Title", r["cve"], r["asset"], r["team"], r["severity"], r["due"],
            "System.State", "System.AssignedTo"])
        order = order.replace("Microsoft.VSTS.Scheduling.DueDate", r["due"])
        return (f"SELECT {cols} FROM WorkItems WHERE [System.TeamProject] = @project "
                f"AND [System.WorkItemType] = '{WIT_NAME}' "
                f"AND [System.AreaPath] UNDER '{PROJECT_NAME}\\{AREA_NAME}' AND {where} ORDER BY {order}")

    def ensure_queries(self):
        section(f"Shared queries in 'Shared Queries/{QUERY_FOLDER}'")
        r = self.refs
        open_states = "[System.State] NOT IN ('Verified', 'Closed as exception')"
        wanted = [
            ("Overdue", self.wiql(f"[{r['due']}] < @Today AND {open_states}")),
            ("Awaiting verification", self.wiql("[System.State] = 'Fix reported'")),
            ("Exploitation suspected", self.wiql(f"[{r['exploit']}] = True AND {open_states}")),
            ("Open items by owner team", self.wiql(
                open_states, order=f"[{r['team']}] ASC, [{r['severity']}] ASC, [{r['due']}] ASC")),
        ]
        base = f"{self.org}/{self.project_id}/_apis/wit/queries"
        shared = self.c.get(f"{base}/Shared%20Queries?{API}") or {"id": PH}
        folder = self.c.get(f"{base}/Shared%20Queries/{q(QUERY_FOLDER)}?$depth=1&{API}", allow_404=True)
        if not folder:
            folder = self.c.change(f"create query folder '{QUERY_FOLDER}'", "POST",
                                   f"{base}/Shared%20Queries?{API}",
                                   {"name": QUERY_FOLDER, "isFolder": True},
                                   placeholder={"id": PH, "children": []})
        else:
            log("  = folder exists")
        for name, wiql in wanted:
            ex = find(folder.get("children"), name)
            if ex:
                log(f"  = {name}")
                self.queries[name] = ex
                continue
            self.queries[name] = self.c.change(f"create query '{name}'", "POST",
                                               f"{base}/{folder['id']}?{API}",
                                               {"name": name, "wiql": wiql},
                                               placeholder={"id": PH, "name": name})
        self.ensure_ace(NS_QUERY_FOLDERS, f"$/{self.project_id}/{shared['id']}/{folder['id']}",
                        getattr(self, "sec_desc", PH), SECURITY_GROUP,
                        f"ALLOW read on query folder '{QUERY_FOLDER}'",
                        allow=self.bits(NS_QUERY_FOLDERS, ["Read"]))

    # 12 --------------------------------------------------------------------
    def ensure_dashboard(self):
        section(f"Dashboard '{DASHBOARD_NAME}'")
        url = f"{self.org}/{self.project_id}/_apis/dashboard/dashboards?{API_DASH}"
        if find(self.c.get_list(url), DASHBOARD_NAME):
            log("  = exists (widgets left as they are)")
            return
        tile = "ms.vss-dashboards-web.Microsoft.VisualStudioOnline.Dashboards.QueryScalarWidget"
        listw = "ms.vss-dashboards-web.Microsoft.VisualStudioOnline.Dashboards.QueryResultsWidget"
        r = self.refs
        columns = [{"referenceName": "System.Id", "name": "ID"},
                   {"referenceName": "System.Title", "name": "Title"},
                   {"referenceName": r["asset"], "name": "Asset"},
                   {"referenceName": r["team"], "name": "Owner Team"},
                   {"referenceName": r["severity"], "name": "Severity"},
                   {"referenceName": r["due"], "name": "Due Date"},
                   {"referenceName": "System.State", "name": "State"}]
        widgets = []
        names = ["Overdue", "Awaiting verification", "Exploitation suspected", "Open items by owner team"]
        for i, name in enumerate(names):
            qid = self.queries.get(name, {}).get("id", PH)
            widgets.append({
                "name": name, "contributionId": tile,
                "position": {"row": 1, "column": 1 + i}, "size": {"rowSpan": 1, "columnSpan": 1},
                "settingsVersion": {"major": 1, "minor": 0, "patch": 0},
                "settings": json.dumps({"queryId": qid, "queryName": name, "lastArtifactName": name,
                                        "colorRules": [{"isEnabled": i < 3, "backgroundColor": "#cc293d",
                                                        "thresholdCount": 0, "operator": ">"}]})})
            widgets.append({
                "name": name, "contributionId": listw,
                "position": {"row": 2 + 3 * (i // 2), "column": 1 + 4 * (i % 2)},
                "size": {"rowSpan": 3, "columnSpan": 4},
                "settingsVersion": {"major": 1, "minor": 0, "patch": 0},
                "settings": json.dumps({"query": {"queryId": qid, "queryName": name},
                                        "selectedColumns": columns, "lastArtifactName": name,
                                        "sortColumns": []})})
        self.c.change(f"create project dashboard '{DASHBOARD_NAME}' with {len(widgets)} widgets "
                      "(4 count tiles + 4 result lists)", "POST", url,
                      {"name": DASHBOARD_NAME, "description": "Vulnerability remediation overview",
                       "dashboardScope": "project", "widgets": widgets})

    # 13 --------------------------------------------------------------------
    def report_membership(self, groups):
        section("Project membership (read-only check)")
        if PH in str(self.project_id):
            log("  (project not created yet - nothing to check)")
            return
        _, groups = self.project_groups()
        for g in sorted(groups, key=lambda x: x.get("displayName", "")):
            if g.get("displayName") == "Project Valid Users":
                continue
            mem = self.c.get_list(f"{self.vssps}/_apis/graph/Memberships/{q(g['descriptor'])}"
                                  f"?direction=down&{API_GRAPH}")
            descs = [m["memberDescriptor"] for m in mem]
            names = []
            if descs:
                look = self.c.post_read(f"{self.vssps}/_apis/graph/subjectlookup?{API_GRAPH}",
                                        {"lookupKeys": [{"descriptor": d} for d in descs]}) or {}
                for d in descs:
                    s = (look.get("value") or {}).get(d, {})
                    names.append(s.get("displayName") or s.get("principalName") or d)
            log(f"  {g['displayName']:<32} {', '.join(names) if names else '(no direct members)'}")
        log("  Expected: you in Project Administrators and the default team; the team inside")
        log("  Contributors; nobody else. Organisation-level Project Collection Administrators")
        log("  can always see every project (see README).")

    # ----------------------------------------------------------------------
    def run(self):
        self.check_connection()
        self.ensure_process()
        self.ensure_fields()
        self.ensure_wit()
        self.ensure_wit_fields()
        self.ensure_states()
        self.ensure_layout()
        self.ensure_project()
        self.ensure_area()
        groups = self.ensure_security_group()
        self.ensure_permissions(groups)
        self.ensure_rules()
        self.ensure_queries()
        self.ensure_dashboard()
        self.report_membership(groups)


# --------------------------------------------------------------------------
def parse_org(url: str):
    url = url.strip().rstrip("/")
    m = re.fullmatch(r"https://dev\.azure\.com/([A-Za-z0-9][A-Za-z0-9-]*)", url)
    if m:
        return url, m.group(1)
    m = re.fullmatch(r"https://([A-Za-z0-9][A-Za-z0-9-]*)\.visualstudio\.com", url)
    if m:
        return url, m.group(1)
    raise SetupError("AZDO_ORG_URL must look like https://dev.azure.com/<org> "
                     "or https://<org>.visualstudio.com")


def main(argv=None):
    global _SECRET
    ap = argparse.ArgumentParser(description="Set up the vulnerability remediation tracker in Azure DevOps.")
    ap.add_argument("--dry-run", action="store_true",
                    help="read-only: print what would be created, change nothing")
    ap.add_argument("--yes", action="store_true",
                    help="skip the interactive confirmation (apply mode only)")
    args = ap.parse_args(argv)

    org_env = os.environ.get("AZDO_ORG_URL", "")
    pat = os.environ.get("AZDO_PAT", "")
    if not org_env or not pat:
        log("ERROR: set AZDO_ORG_URL and AZDO_PAT in the environment (see README).")
        return 2
    _SECRET = pat
    try:
        if os.environ.get("AZDO_TEST_BASE_URL"):  # local mock server, used by tests only
            base = os.environ["AZDO_TEST_BASE_URL"].rstrip("/")
            org_url, org = base + "/testorg", "testorg"
            vssps = base + "/vssps/testorg"
        else:
            org_url, org = parse_org(org_env)
            vssps = f"https://vssps.dev.azure.com/{org}"

        if not args.dry_run and not args.yes:
            log(f"This will CHANGE the Azure DevOps organisation '{org}' ({org_url}).")
            log("Run with --dry-run first to see the plan.")
            if input(f"Type the organisation name '{org}' to continue: ").strip() != org:
                log("Aborted. Nothing changed.")
                return 1

        setup = Setup(Client(pat, args.dry_run), org_url, vssps)
        setup.run()
    except (ApiError, SetupError) as e:
        log("")
        log(f"ERROR: {e}")
        log("Stopped. Steps already completed are kept; re-running the script is safe.")
        return 1
    except KeyboardInterrupt:
        log("Interrupted.")
        return 130

    section("Summary")
    c = setup.c
    verb = "would make" if c.dry_run else "made"
    log(f"  {verb} {len(c.changes)} change(s)")
    for w in setup.warnings:
        log(f"  WARNING: {w}")
    if setup.manual:
        log("  MANUAL STEPS REQUIRED:")
        for m in setup.manual:
            log(f"   - {m}")
    log("  Always manual (see README): add people to the security group; set the project")
    log("  dashboard/query permissions if your organisation changed the defaults.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

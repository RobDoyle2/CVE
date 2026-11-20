# Vulnerability remediation tracker: Azure DevOps setup

This folder sets up a security-owned vulnerability tracker in Azure DevOps. Everything in it uses **sample data only**.

| File | Purpose |
|---|---|
| `setup_vuln_tracker.py` | Idempotent setup script with a dry-run mode. Uses only the Python standard library. |
| `sample-vulnerabilities.csv` | 10 fictional work items for **Boards > Queries > Import work items**. |
| `TEST-CHECKLIST.md` | Checks that people outside the security group cannot see the project or the area. |
| `tests/` | Offline tests that run the script against a local mock of the API. |

## What the script creates

| # | Item | Details |
|---|---|---|
| 1 | Inherited process **Vulnerability Tracking** | Parent: Agile. |
| 2 | Work item type **Vulnerability** | Red bug icon. Two form groups: *Vulnerability* and *Remediation and verification*. |
| 3 | Fields | **CVE ID**, **Asset**, **Owner Team**, **Required Fix**, **Installed Version Before** and **Installed Version After** are text fields. **Verification Date** is a date. **Verification Method** is a pick list. **Exploitation Suspected** is a yes/no field (shown as True/False, default False). **Severity** and **Due Date** reuse the built-in fields; see the note below. CVE ID, Asset, Owner Team, Severity and Due Date are required. |
| 4 | States | **Open** (Proposed, the initial state), **Assigned** (In Progress), **Fix reported** (Resolved), **Verified** (Completed), **Closed as exception** (Removed). The type's default states (New, Active, Closed) are hidden. |
| 5 | Workflow rules | Only the security group can set **Verified** or **Closed as exception**. Moving to **Verified** requires Installed Version After, Verification Date and Verification Method. Moving to **Fix reported** requires Installed Version After. |
| 6 | Private project **Vulnerability Tracking** | Uses the process above. The creator is its only member, which is the Azure DevOps default; the script then lists group members so you can confirm this. |
| 7 | Area **Vulnerability Tracking\Vulnerabilities** | **Deny** view and edit for *Contributors*, *Readers* and *Build Administrators*. **Allow** for the security group. The default team's default area is set to this area, so new items are protected from the start. |
| 8 | Project group **Vulnerability Security Team** | Created **empty**. It is also given *View project-level information*, read access to iterations and read access to the query folder. Without these its members could not open the project. |
| 9 | Shared queries in *Shared Queries/Vulnerability Tracking* | **Overdue** (Due Date before today, not Verified or Closed as exception), **Awaiting verification** (Fix reported), **Exploitation suspected** (= True, still open), **Open items by owner team** (sorted by Owner Team, then Severity, then Due Date). |
| 10 | Project dashboard **Vulnerability Tracking** | A count tile and a result list for each query. |

**Why Severity and Due Date are not new custom fields.** Field names must be unique across an organisation. Every organisation already has *Severity* (`Microsoft.VSTS.Common.Severity`, values `1 - Critical` to `4 - Low`) and *Due Date* (`Microsoft.VSTS.Scheduling.DueDate`). A new field with either name would be rejected, so the script adds the built-in fields to the type. The same applies to any other field: if a field with the same name already exists in your work organisation, the script reuses it if its type matches. If the type differs, the script stops; it never guesses.

## Why the REST API and not the Azure CLI

The script calls the **Azure DevOps REST API (version 7.1)** directly. I chose this because:

- **The CLI can't do most of the setup.** The `azure-devops` extension has commands for projects, area paths, security groups and some permissions. It has no commands for inherited processes, custom fields, states, form layout, rules or dashboards. Those steps would need `az devops invoke`, which is the same REST API with an extra layer on top.
- **Idempotency needs exact reads.** Each step reads the current state, compares it with the target, and changes only what differs. Permission entries are compared bit by bit.
- **Token handling is simpler.** `az devops login` stores the token in a keyring or file. The REST approach only reads the token from an environment variable.
- **No dependencies.** It runs on any machine with Python 3.9 or later, with no CLI, extension or pip packages to install and keep in step.

## Prerequisites

1. **Python 3.9 or later.** Run `python3 --version` to check.
2. **An account that is a member of *Project Collection Administrators*** in the target organisation. Token scopes limit what a token can do. They do not grant permissions the account lacks. Creating processes, organisation-level fields and projects needs collection administrator rights.
3. **Network access** to `dev.azure.com` and `vssps.dev.azure.com`. The second host is used for groups and identities.
4. **A personal access token (PAT)** created in the target organisation with these scopes:

| Scope (as shown in *User settings > Personal access tokens > Custom defined*) | Used for |
|---|---|
| **Work Items: Read, write & manage** | Process, fields, pick list, work item type, states, layout, rules, area paths, team area, queries |
| **Project and Team: Read, write & manage** | Creating and reading the project, team settings |
| **Graph: Read & manage** | Creating the security group, reading groups and memberships |
| **Identity: Read** | Turning groups into the identity descriptors that permissions use |
| **Security: Manage** | Reading and setting permissions on the area, project, iterations and query folder |
| **Team Dashboard: Read & manage** | Creating the dashboard |

Give the token the shortest practical expiry, for example 1 day, and revoke it when you are done. A dry run needs only the read parts of these scopes, but it is simplest to use one token.

## How to run

```bash
cd azure-devops
export AZDO_ORG_URL="https://dev.azure.com/<your-personal-org>"
read -rs AZDO_PAT && export AZDO_PAT     # paste the token, press Enter (nothing is echoed)

python3 setup_vuln_tracker.py --dry-run  # read-only: lists every change it would make
python3 setup_vuln_tracker.py            # applies; asks you to type the org name first
```

- **Dry run** only reads from the organisation. Each line starting `[dry-run] would …` is a change; `=` means the item already exists and is left alone.
- **Apply** asks you to type the organisation name before it changes anything. `--yes` skips that prompt; use it only in automation you trust.
- **Re-running is safe.** Existing items are detected and skipped; a second run reports `made 0 change(s)`. If a run stops halfway, fix the cause and run it again.
- The token is read from `AZDO_PAT`, sent only in the `Authorization` header, and never printed, logged or written to disk. Any error text is scrubbed of the token. Clear it afterwards with `unset AZDO_PAT`.
- Optional: `AZDO_SECURITY_GROUP="Your Group Name"` changes the security group name. The default is *Vulnerability Security Team*.

### Import the sample data

1. Open the project and go to **Boards > Queries**.
2. Choose **Import work items**, select `sample-vulnerabilities.csv`, and choose **Import**.
3. Review the grid, then choose **Save items**.

The sample file uses the fictional CVE range `CVE-2099-xxxxx`, made-up asset names (`demo-*`, `fake-*`, `test-*`) and made-up teams. Every row is tagged `sample`. All rows are in Open, Assigned or Fix reported. They cannot be imported as Verified because the importing account is not in the (empty) security group, which is the rule working as intended. Due dates are spread around 20 Nov 2026, so some items appear as overdue.

## Pointing it at a different organisation (e.g. work)

Change **only** the two environment variables. Nothing in the script is tied to an organisation.

```bash
export AZDO_ORG_URL="https://dev.azure.com/<work-org>"   # or https://<work-org>.visualstudio.com
read -rs AZDO_PAT && export AZDO_PAT                      # a PAT created in the WORK org
python3 setup_vuln_tracker.py --dry-run                   # always dry-run first
```

Before applying in a shared organisation, read the dry-run output for:

- **`WARNING: Field name … already exists`.** Someone else's field will be reused. Make sure its meaning matches.
- **`ERROR: … exists with type …`.** A clash the script will not resolve. Rename it in the script's `FIELDS` list or agree a change with the organisation owners.
- **Organisation fields are shared by every project.** The `Custom.*` fields and the pick list are created at organisation level and are visible in other projects' field lists. They contain no data.

## What cannot be done (reliably) through the API: manual steps

The script lists every manual step it needs at the end of its output under `MANUAL STEPS REQUIRED`. These are the known ones:

1. **Adding people to the security group: always manual, on purpose.** Go to *Project settings > Permissions > Vulnerability Security Team > Members > Add*. Keeping this as a human decision is deliberate.
2. **Do not add security analysts to *Contributors* or *Readers*.** In Azure DevOps a **Deny always wins over an Allow**. Anyone in both the security group and a denied group will lose access to the area. The security group already has what it needs to open the project. Analysts also need an organisation access level: *Basic*, or *Stakeholder*, which allows limited work-item editing.
3. **Organisation administrators can always see every project.** *Project Collection Administrators* (and the organisation owner) cannot be denied access. Review who is in that group in *Organization settings > Permissions*. No API or setting changes this.
4. **Where my API knowledge is unconfirmed.** I could not check Microsoft's documentation from the build environment. These four parts rely on API behaviour I could not confirm. The script handles each defensively: it reports a failure as a manual step instead of improvising.
   - **Group-restricted state rules (*only security can set Verified / Closed as exception*).** The rule condition `whenCurrentUserIsNotMemberOfGroup` exists, but the group reference format is not clearly documented. The script uses the group's ID. If the rule is rejected, or does not block a non-member in testing, create it by hand: *Organization settings > Process > Vulnerability Tracking > Vulnerability > Rules > New rule*, condition **Current user is not member of group** → *[Vulnerability Tracking]\Vulnerability Security Team*, action **Restrict the transition to state** → *Verified*. Repeat for *Closed as exception*.
   - **Verified in the Completed category.** Azure DevOps may allow only one Completed state, or refuse to hide the default *Closed* state. If so, the script reports it. The fallback is to keep *Closed* hidden and put *Verified* in Completed by hand, or leave Verified in Resolved. That is a design decision for you, not something to guess.
   - **Dashboard widget settings.** Their format is not formally documented. If a widget shows **Configure**, open it, pick the matching query from *Shared Queries/Vulnerability Tracking*, and save.
   - **CSV value formats.** Dates are `YYYY-MM-DD`; Exploitation Suspected is `True`/`False`. If the import grid flags a value, it shows which one.
5. **Optional chart by Owner Team.** On the dashboard, add a **Chart for work items** widget using *Open items by owner team*, grouped by **Owner Team**.
6. **Giving engineering access later.** Engineers currently cannot see the area at all, which is what was asked. If they should move items to *Fix reported* themselves, create a separate group (e.g. *Vulnerability Fixers*) with an Allow on the area. Keep them out of the security group; the state rules already stop them setting Verified.

## Running the offline tests

```bash
python3 -m unittest discover -s tests -v
```

The tests start a local mock of the API endpoints the script uses. They check that a dry run writes nothing and a first run creates everything. A second run must make zero changes, and the token must never appear in output. They also validate the sample CSV. They do **not** prove the real service accepts every request; only the first real run against your personal organisation does that.

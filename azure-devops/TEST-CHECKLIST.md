# Access test checklist

Goal: prove that someone **outside** the security group cannot see the project or the *Vulnerabilities* area, and that a security group member can.

## Setup (personal organisation only)

- [ ] Import `sample-vulnerabilities.csv` so there are items to (not) see. Note one work item ID, e.g. `#12`.
- [ ] Create or reuse **two spare Microsoft accounts** (not your work account), *TestOutsider* and *TestContributor*. Add both to the organisation with access level **Basic** (*Organization settings > Users*).
- [ ] Do **not** add either account to the project yet.
- [ ] Test in a private browser window for each account, so cached sign-ins do not mix.

## A. Organisation member who is not in the project (TestOutsider)

- [ ] The organisation home page does **not** list *Vulnerability Tracking*.
- [ ] Opening `https://dev.azure.com/<org>/Vulnerability%20Tracking` directly shows *not found / no permission*.
- [ ] Opening `https://dev.azure.com/<org>/Vulnerability%20Tracking/_workitems/edit/<ID>` shows *does not exist or you do not have permission*.
- [ ] Organisation-wide search for `CVE-2099` returns **no** results.
- [ ] The *Vulnerability Tracking* dashboard URL is not accessible.

## B. Project member outside the security group (TestContributor)

Add TestContributor to the project's **Contributors** group, then test:

- [ ] The project opens. Expected, since they are a member.
- [ ] *Boards > Work items* and *Boards > Backlogs* show **no** Vulnerability items.
- [ ] A new query `Area Path Under Vulnerability Tracking\Vulnerabilities` returns **0** results.
- [ ] The shared queries under *Vulnerability Tracking* return **0** results, or cannot be opened.
- [ ] Opening work item `#<ID>` directly shows *does not exist or you do not have permission*.
- [ ] The area picker on a new work item does **not** offer *Vulnerabilities*.
- [ ] Search for `CVE-2099` inside the project returns **no** results.
- [ ] Dashboard count tiles show **0**, or show an access message, not the real counts.
- [ ] *Optional:* *Boards > Analytics views* and Power BI/OData return no Vulnerability items.

Then repeat B with TestContributor moved from **Contributors** to **Readers**.

## C. Deny-wins check (shows why analysts must not be in Contributors)

- [ ] Add TestContributor to **both** *Contributors* and *Vulnerability Security Team*.
- [ ] Expected: they still **cannot** see the items, because Deny beats Allow. This confirms the rule in the README.

## D. Security group member (positive test)

- [ ] Remove TestContributor from *Contributors* and *Readers*, so they are **only** in *Vulnerability Security Team*.
- [ ] The project opens, and the sample items and queries are visible.
- [ ] They can move an item from **Fix reported** to **Verified**. The form demands Installed Version After, Verification Date and Verification Method.

## E. State rule check (only security sets Verified)

- [ ] As **yourself** (Project Administrator, *not* in the security group), try to move an item to **Verified**. Expected: blocked by the rule.
- [ ] As yourself, moving **Assigned → Fix reported** works once Installed Version After is filled.
- [ ] If either result differs, follow manual step 4 in the README.

## F. Clean up

- [ ] Remove TestOutsider and TestContributor from the security group, the project groups and the organisation.
- [ ] Revoke the PAT used for setup.
- [ ] Record the results (date, tester, pass/fail per line) before repeating the checklist in the work organisation.

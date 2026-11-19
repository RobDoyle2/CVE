# Production-readiness review

Review of the application after stages 1–5, carried out as if preparing for an enterprise production environment. Items marked **Fixed** were corrected during this review; **Open** items must be addressed before production use.

## Summary

The application is a well-structured demonstration and a sound foundation, but it **is not suitable for production or for real corporate data** in its GitHub Pages form. The blockers are architectural and expected (no authentication, per-browser storage, no backend for monitoring/AI) rather than code-quality problems. The code was designed so these can be replaced without rewriting the UI or business logic.

## What was tested

| Check | Result |
|---|---|
| Unit tests (`npm test`): version maths, validation, store/integrity/transactions, assessment engine expectations for every sample CVE, CSV/XLSX, import/export round trip, reports, ingestion, AI layer, backup validation | 38/38 pass |
| End-to-end (`npm run test:e2e`, headless Chromium): every page loads without console errors, 15 user workflows, mobile layout | 26/26 pass |
| XLSX files opened with an independent reader (Python openpyxl) | Pass |
| Scale test (`node tests/perf/scale.mjs`): 410 apps, 3,021 software, 2,012 CVEs | Full assessment in ~0.75 s (was ~16 s before the fix below) |
| Browsers | Chromium (= Microsoft Edge / Google Chrome engine) tested. Firefox and Safari **not tested** in this environment. |

## Findings

### Code quality
| # | Finding | Status |
|---|---|---|
| Q1 | Clear layering: views → DataStore → provider; pure services; schemas as single source of truth. | Good |
| Q2 | No build step, no runtime dependencies, ES modules with lazy-loaded views. | Good |
| Q3 | Some views are long (300–400 lines) and build HTML with template strings. Acceptable now; adopt a component framework only if the UI grows substantially. | Open (low) |
| Q4 | Page filter IDs clashed with form field IDs (found by e2e test in stage 3). | Fixed |

### Performance
| # | Finding | Status |
|---|---|---|
| P1 | Assessment engine compared every CVE with every software record (O(CVEs × software)); 16 s at enterprise scale. | **Fixed** – candidate index by canonical vendor/product, memoised normalisation, cached impact per software: ~0.75 s with identical results. |
| P2 | Table sorting recomputed relationship lookups inside every comparison. | **Fixed** – sort keys computed once per render. |
| P3 | Large tables rendered every row. | **Fixed** – tables paginate in pages of 100 ("Show more"). |
| P4 | All data is loaded into the browser at start-up. Fine for thousands of records; at larger scale queries/filtering must move server-side (API pagination). | Open (AWS) |

### User experience & accessibility
| # | Finding | Status |
|---|---|---|
| U1 | Consistent Monday.com-style layout, colour-coded pills always paired with text, responsive down to phone width (tested at 390 px). | Good |
| U2 | Keyboard: sortable headers, expand buttons, modals (Esc to close, focus restored). Full WCAG 2.2 audit with a screen reader not yet performed. | Open (medium) |
| U3 | No undo for deletes (confirmation dialog shows cascading impact instead). Soft-delete recommended in the backend. | Open (low) |

### Data structures, relationships & validation
| # | Finding | Status |
|---|---|---|
| D1 | Normalised many-to-many model with join tables, natural-key uniqueness and FK-style integrity (cascade / set null / restrict). | Good |
| D2 | Browser validation is a usability aid only; a malicious user can bypass it. | Open – re-implement in the API (shared schema definitions). |
| D3 | Restoring a backup did not validate content. | **Fixed** – full schema + referential validation before restore. |
| D4 | Software version strings are heuristically compared; distribution back-ports (e.g. RHEL `-el8` builds) cannot be detected from version alone. The engine says so in its verification steps. | Open – integrate vendor OVAL/CSAF data or scanner output. |
| D5 | Vendor/product matching relies on names + aliases; CPE identifiers are supported but optional. | Open – encourage CPE/PURL capture, or import SBOMs (CycloneDX/SPDX). |

### Security
| # | Finding | Status |
|---|---|---|
| S1 | **No authentication or authorisation.** User switcher is cosmetic. | **Open – blocker** |
| S2 | All rendered data passes through HTML escaping; external links restricted to http(s) with `noopener noreferrer`; e2e test confirms injected `<script>`/`onerror` payloads do not execute on 12 pages. | Good |
| S3 | Notification links from stored data were not restricted. | **Fixed** – only internal `#/` links rendered. |
| S4 | Content-Security-Policy: scripts self-only, `connect-src 'self'`, no framing/objects. `style-src 'unsafe-inline'` allowed for chart widths. | Good / Open (low) – serve CSP as an HTTP header from CloudFront and remove inline styles. |
| S5 | CSV/Excel exports neutralise formula injection; XLSX cells are never formulas. | Good |
| S6 | No secrets in code; AI/monitoring designed for backend-held credentials; AI payloads exclude names, emails and account numbers (unit-tested). | Good |
| S7 | Data in `localStorage` is unencrypted and readable by anyone using the browser profile. | Open – blocker for real data |
| S8 | Audit log is browser-local and editable. | Open – blocker; needs append-only server-side log. |
| S9 | GitHub Pages sites from public repos are public. | Open – keep fictional data only; use private hosting on AWS. |

### Error handling
| # | Finding | Status |
|---|---|---|
| E1 | Writes are transactional (snapshot rollback on failure); imports and ingestion are all-or-nothing. | Good |
| E2 | Storage quota/unavailable storage handled (warning + in-memory fallback). | Good |
| E3 | Unhandled errors were only logged to the console. | **Fixed** – global handlers show a toast. |

### GitHub Pages compatibility
Relative paths only, hash routing (deep links survive refresh), `.nojekyll`, no server features required. Opening `index.html` directly from disk (`file://`) is not supported by browsers for ES modules — use Pages or a local web server.

## Architectural decisions that will matter when moving to AWS

1. **Synchronous reads from an in-memory cache.** Views call `store.all()` synchronously. With an API this still works for moderate volumes (load at start-up), but for large datasets list pages should switch to paged, filtered API queries. Mitigation: views already go through `DataStore`; add `query()` methods incrementally.
2. **Computed findings.** The engine runs in the browser on demand. In AWS run it server-side (Lambda) after CVE/inventory changes and store findings for reporting, history and notifications; keep the same module (pure JavaScript, Node-compatible).
3. **Client-side IDs** (`APP-011` = max + 1) can collide with concurrent users. Let the database generate IDs (sequences/UUIDs).
4. **Whole-snapshot persistence and last-write-wins.** Needs optimistic concurrency (`updatedAt`/ETag checks) with a shared backend.
5. **Roles in the browser.** Must be replaced by IdP groups mapped to backend authorisation on every API call.
6. **CSP `connect-src 'self'`.** If the API is on a different origin, add it explicitly (prefer same origin behind CloudFront `/api/*`).
7. **Hash routing** is fine on CloudFront; optionally move to history routing with a CloudFront function for rewrites.

## Update: real NVD data (NVD CVE API 2.0 via GitHub Actions)

| Item | Status |
|---|---|
| Real CVE data | NVD changes fetched by `scripts/fetch-nvd.mjs` in GitHub Actions every 6 hours, published as same-site JSON; imported from Monitoring Sources. Verified end to end against the live NVD API (2 days, 6,344 CVEs: 259 relevant to the sample inventory, import in under 1 s). |
| Secrets | Optional `NVD_API_KEY` is an Actions secret; never written to the feed (unit-tested). |
| CORS/CSP | Not needed: the browser reads its own origin. (NVD does send `Access-Control-Allow-Origin: *`, verified, but a key could not be used safely from the browser.) |
| Data model | CVEs now hold every affected product (`affectedProducts`), NVD analysis status and CNA fallback data; the engine evaluates each product. Previously only the first product was kept (for Log4Shell that was a Siemens firmware rather than Apache Log4j). |
| Matching fixes found with real data | Explicit CPE release versions (e.g. OpenShift `4.12`) were dropped and would have been compared exactly; now treated as release lines. Vendor names repeated in product names are handled, without cross-vendor generic matches (e.g. "Debian Linux" vs "Amazon Linux"). |
| Open | Browser storage limit (~2,000 CVEs); no historical backfill; CNA RPM/package versions need verification; CISA KEV live feed next. |

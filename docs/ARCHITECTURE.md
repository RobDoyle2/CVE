# Architecture

## Overview

The Vulnerability Management Tool is a **static single-page application** written in plain HTML, CSS and JavaScript (ES modules). It has no build step and no runtime dependencies, so it can be served by GitHub Pages today and by Amazon S3 + CloudFront later.

```
Browser
 ├── index.html                 Application shell (sidebar, top bar, view container)
 ├── css/                       Design tokens, layout, components, print styles
 └── js/
     ├── app.js                 Bootstrap: store → session → router → views
     ├── core/                  Framework-free infrastructure
     │   ├── config.js          App configuration (no secrets)
     │   ├── store.js           DataStore + persistence providers (Local / Memory / API)
     │   ├── session.js         Demo user & role switching (NOT authentication)
     │   └── router.js          Hash router (#/applications/APP-001)
     ├── models/                Entity schemas, relations and controlled vocabularies
     ├── data/                  Fictional sample dataset
     ├── services/              Pure business logic (testable in Node)
     ├── ui/                    Rendering helpers: components, forms, tables, modal, toast
     └── views/                 One module per navigation section (lazy-loaded)
```

### Layering rules

1. **Views never touch storage directly.** They call `DataStore`, which delegates persistence to a *provider*.
2. **Services are pure.** Version matching, validation, the assessment engine, CSV/XLSX and feed parsing do not use the DOM, so they run unchanged in Node (unit tests) and could be reused in AWS Lambda.
3. **Schemas are the single source of truth** for fields, validation rules, CSV templates and relationships (`js/models/schemas.js`).

### Persistence providers

| Provider | Used for | Notes |
|---|---|---|
| `LocalStorageProvider` | GitHub Pages demo | Stores one JSON snapshot in this browser only. |
| `MemoryProvider` | Unit tests, storage-blocked browsers | Nothing persisted. |
| `ApiProvider` | Future AWS backend | REST calls per change (`POST/PATCH/DELETE /{collection}`); auth via SSO session cookie. |

Writes are expressed as a list of changes (`create/update/delete`) so the API provider can send them to a backend, while the local provider simply saves the snapshot.

## GitHub Pages limitations

| Limitation | Consequence | Mitigation now | Long-term fix |
|---|---|---|---|
| Static hosting only - no server code | No scheduled jobs, no server-side validation, no database | All logic runs in the browser; monitoring is simulated with bundled sample feeds | AWS Lambda + EventBridge + RDS |
| No authentication / authorisation | Anyone with the URL can open the site; roles are cosmetic | Demo user switcher clearly labelled; **fictional data only** | Cognito / corporate SSO, server-side authorisation |
| Data stored per browser | Team members do not share data | JSON backup export/import, CSV import/export | Shared database behind an API |
| Cannot hold secrets | No API keys for NVD or AI services | No keys in code; integration layer designed for a backend proxy | Secrets Manager, backend-only calls |
| Cross-origin restrictions (CORS) and CSP | Browser cannot reliably call third-party feeds | CSP `connect-src 'self'` blocks it deliberately | Backend fetches feeds |
| Public repositories publish everything | Source and sample data are visible | Fictional data only | Private hosting on AWS |
| ES modules need HTTP | Opening `index.html` via `file://` does not work in Chrome/Edge | Use GitHub Pages or `python3 -m http.server` | n/a |

See `README.md` for the full migration plan.

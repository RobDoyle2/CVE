// Minimal hash router. Hash routing works on GitHub Pages without server
// rewrite rules (deep links such as #/applications/APP-001 survive refresh).
// On AWS (CloudFront) this can later move to history-API routing.

export class Router {
  constructor({ onRoute }) {
    this.routes = [];
    this.onRoute = onRoute;
    window.addEventListener('hashchange', () => this.resolve());
  }

  add(pattern, view, meta = {}) {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    this.routes.push({ pattern, regex, keys, view, meta });
    return this;
  }

  current() {
    const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
    const [path, queryString = ''] = hash.split('?');
    return { path, query: Object.fromEntries(new URLSearchParams(queryString)) };
  }

  resolve() {
    const { path, query } = this.current();
    for (const r of this.routes) {
      const m = path.match(r.regex);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        this.onRoute({ route: r, params, query, path });
        return;
      }
    }
    this.onRoute({ route: null, params: {}, query, path });
  }

  go(path) {
    if (window.location.hash === `#${path}`) this.resolve();
    else window.location.hash = path;
  }
}

// Application bootstrap: data store, session, navigation and routing.
import { APP_CONFIG } from './core/config.js';
import { DataStore, LocalStorageProvider, MemoryProvider } from './core/store.js';
import { Session } from './core/session.js';
import { Router } from './core/router.js';
import { buildSampleSnapshot } from './data/sample-data.js';
import { icons } from './ui/icons.js';
import { esc } from './ui/dom.js';
import { toast } from './ui/toast.js';

// Navigation definition. `load` lazily imports the view module so only the
// code for the visited page is downloaded.
export const NAV = [
  { group: 'Overview' },
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', load: () => import('./views/dashboard.js') },
  { group: 'Inventory' },
  { path: '/applications', label: 'Applications', icon: 'apps', load: () => import('./views/applications.js'), count: 'applications' },
  { path: '/software', label: 'Software Inventory', icon: 'package', load: () => import('./views/software.js'), count: 'software' },
  { path: '/infrastructure', label: 'Infrastructure', icon: 'server', load: () => import('./views/infrastructure.js') },
  { path: '/review', label: 'Review Queue', icon: 'inbox', load: () => import('./views/review.js'), count: 'pendingReview' },
  { group: 'Vulnerability Management' },
  { path: '/vulnerabilities', label: 'Vulnerabilities (CVEs)', icon: 'bug', load: () => import('./views/vulnerabilities.js'), count: 'vulnerabilities' },
  { path: '/assessments', label: 'Impact Assessments', icon: 'target', load: () => import('./views/assessments.js') },
  { path: '/monitoring', label: 'Monitoring Sources', icon: 'radar', load: () => import('./views/monitoring.js') },
  { group: 'Insight & Administration' },
  { path: '/reports', label: 'Reports', icon: 'report', load: () => import('./views/reports.js') },
  { path: '/data', label: 'Import / Export', icon: 'upload', load: () => import('./views/data.js') },
  { path: '/settings', label: 'Settings', icon: 'settings', load: () => import('./views/settings.js') },
];

// Detail routes reuse the section's module.
const DETAIL_ROUTES = [
  { path: '/applications/:id', section: '/applications' },
  { path: '/software/:id', section: '/software' },
  { path: '/infrastructure/:id', section: '/infrastructure' },
  { path: '/vulnerabilities/:id', section: '/vulnerabilities' },
  { path: '/assessments/:id', section: '/assessments' },
];

function safeStorage() {
  try {
    const s = window.localStorage;
    const probe = '__vmt_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

async function main() {
  const storage = safeStorage();
  const seed = () => buildSampleSnapshot(APP_CONFIG.schemaVersion);
  const provider = storage
    ? new LocalStorageProvider({ storage, key: APP_CONFIG.storageKey, seed, schemaVersion: APP_CONFIG.schemaVersion })
    : new MemoryProvider({ seed, schemaVersion: APP_CONFIG.schemaVersion });

  let session;
  const store = new DataStore(provider, { getUser: () => (session ? session.user.name : 'system') });
  await store.init();
  session = new Session({ store, storage, key: APP_CONFIG.sessionKey });

  const appEl = document.getElementById('app');
  const navEl = document.getElementById('nav');
  const viewEl = document.getElementById('view');
  const titleEl = document.getElementById('topbar-title');
  const menuBtn = document.getElementById('menu-toggle');
  menuBtn.innerHTML = icons.menu;
  menuBtn.addEventListener('click', () => {
    const open = appEl.classList.toggle('nav-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  document.getElementById('sidebar-footer').innerHTML =
    `v${esc(APP_CONFIG.version)} · ${esc(provider.describe())}`;

  if (!storage) toast('Browser storage is unavailable: changes will be lost when you close this tab.', 'warn', 8000);

  const renderNav = (activeSection) => {
    navEl.innerHTML = NAV.map((item) => {
      if (item.group) return `<div class="nav-group-label">${esc(item.group)}</div>`;
      const n = item.count === 'pendingReview'
        ? ['applications', 'software'].reduce((t, c) => t + store.find(c, (r) => r.reviewStatus === 'Pending review').length, 0)
        : item.count ? store.count(item.count) : null;
      const count = n !== null ? `<span class="nav-count">${n}</span>` : '';
      const active = item.path === activeSection ? 'active' : '';
      return `<a href="#${item.path}" class="${active}" ${active ? 'aria-current="page"' : ''}>${icons[item.icon]}<span>${esc(item.label)}</span>${count}</a>`;
    }).join('');
  };

  const renderTopbar = () => {
    const host = document.getElementById('topbar-actions');
    const users = store.all('users');
    const unread = store.all('notifications').filter((n) => !n.read).length;
    host.innerHTML = `
      <a class="icon-btn bell" href="#/monitoring?tab=notifications" aria-label="Notifications (${unread} unread)" title="Notifications">
        ${icons.bell}${unread ? `<span class="badge-count">${unread}</span>` : ''}
      </a>
      <div class="user-select">
        <label for="current-user" class="user-select-label">Demo user</label>
        <select id="current-user" class="select" title="Switch sample user (demonstration only - not authentication)">
          ${users.map((u) => `<option value="${esc(u.id)}" ${u.id === session.userId ? 'selected' : ''}>${esc(u.name)} (${esc(u.role)})</option>`).join('')}
        </select>
      </div>`;
    host.querySelector('#current-user').addEventListener('change', (e) => session.setUser(e.target.value));
  };

  let cleanup = null;
  let lastRoute = null;

  const mount = async ({ route, params, query, path }) => {
    lastRoute = { route, params, query, path };
    appEl.classList.remove('nav-open');
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    if (!route) {
      viewEl.innerHTML = `<div class="card"><h2>Page not found</h2><p>No page exists at <code>${esc(path)}</code>.</p><a class="btn" href="#/dashboard">Go to dashboard</a></div>`;
      return;
    }
    const navItem = NAV.find((n) => n.path === route.meta.section);
    renderNav(route.meta.section);
    titleEl.textContent = navItem ? navItem.label : 'Vulnerability Management Tool';
    document.title = `${navItem ? navItem.label : ''} · ${APP_CONFIG.name}`;
    try {
      const mod = await navItem.load();
      if (lastRoute.path !== path) return; // user navigated away while loading
      viewEl.innerHTML = '';
      const ctx = {
        store, session, router, params, query, path, config: APP_CONFIG,
        setTitle: (t) => { titleEl.textContent = t; },
        refreshChrome: () => { renderNav(route.meta.section); renderTopbar(); },
      };
      cleanup = await mod.render(viewEl, ctx);
      viewEl.focus({ preventScroll: true });
    } catch (err) {
      console.error(err);
      viewEl.innerHTML = `<div class="notice danger"><strong>Something went wrong loading this page.</strong><br>${esc(err.message)}</div>`;
    }
  };

  const router = new Router({ onRoute: mount });
  for (const item of NAV.filter((n) => n.path)) router.add(item.path, item.load, { section: item.path });
  for (const d of DETAIL_ROUTES) router.add(d.path, null, { section: d.section });

  store.subscribe((evt) => {
    renderNav(lastRoute && lastRoute.route ? lastRoute.route.meta.section : '');
    renderTopbar();
    if (evt.type === 'reset' && lastRoute) mount(lastRoute);
  });
  session.onChange(() => {
    renderTopbar();
    if (lastRoute) mount(lastRoute);
    toast(`Now acting as ${session.user.name} (${session.user.role}).`, 'success', 2500);
  });

  renderTopbar();
  router.resolve();

  // Expose for debugging and automated tests only.
  window.__vmt = { store, session, router };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('view').innerHTML =
    `<div class="notice danger"><strong>The application failed to start.</strong><br>${esc(err.message)}</div>`;
});

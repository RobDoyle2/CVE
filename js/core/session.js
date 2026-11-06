// Demonstration session handling.
//
// IMPORTANT: this is NOT authentication. In the GitHub Pages build anyone can
// pick any sample user; roles only demonstrate the intended workflow. Real
// access control must be enforced by the backend (e.g. Amazon Cognito /
// corporate SSO via SAML/OIDC, with authorisation checked on every API call).
import { ROLES } from '../models/lookups.js';

export class Session {
  constructor({ store, storage, key }) {
    this.store = store;
    this.storage = storage;
    this.key = key;
    this.listeners = new Set();
    let saved = null;
    try { saved = storage && storage.getItem(key); } catch { saved = null; }
    const users = store.all('users');
    this.userId = users.some((u) => u.id === saved) ? saved : (users[0] && users[0].id);
  }

  get user() {
    return this.store.get('users', this.userId) || { id: 'anonymous', name: 'Anonymous', role: 'Viewer' };
  }

  setUser(id) {
    this.userId = id;
    try { this.storage && this.storage.setItem(this.key, id); } catch { /* ignore */ }
    for (const fn of this.listeners) fn(this.user);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  can(permission) {
    const role = ROLES[this.user.role];
    return !!role && role.can.includes(permission);
  }

  /** Can the user create/edit inventory records (directly or as a submission)? */
  canContribute() {
    return this.can('write') || this.can('submit');
  }
}

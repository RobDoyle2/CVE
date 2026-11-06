// Data access layer.
//
// Every read and write in the UI goes through DataStore. DataStore delegates
// persistence to a *provider*, so swapping browser storage for a backend REST
// API (AWS API Gateway + Lambda + RDS) means writing a new provider - not
// rewriting the views.
//
// Provider interface:
//   load()                         -> Promise<snapshot>
//   applyChanges(changes, snapshot) -> Promise<void>
//   reset()                        -> Promise<snapshot>
// where snapshot = { schemaVersion, savedAt, collections: { [name]: Record[] } }
// and change = { type: 'create'|'update'|'delete', collection, id, record? }

import { SCHEMAS, RELATIONS, COLLECTIONS } from '../models/schemas.js';
import { validateRecord, ValidationError } from '../services/validation.js';

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const NO_AUDIT = new Set(['auditLog', 'notifications']);
const AUDIT_LIMIT = 2000;

function emptySnapshot(schemaVersion) {
  const collections = {};
  for (const c of COLLECTIONS) collections[c] = [];
  return { schemaVersion, savedAt: null, collections };
}

/** Keeps data in memory only (used by tests and as a fallback). */
export class MemoryProvider {
  constructor({ seed, schemaVersion = 1 } = {}) {
    this.seed = seed;
    this.schemaVersion = schemaVersion;
  }
  async load() {
    return this.seed ? clone(this.seed()) : emptySnapshot(this.schemaVersion);
  }
  async applyChanges() { /* nothing to persist */ }
  async reset() { return this.load(); }
  describe() { return 'In-memory (not persisted)'; }
}

/**
 * Stores a snapshot in browser localStorage. This is a demonstration-mode
 * convenience: data lives only in the current browser profile. Use JSON
 * export/import (Settings) to move data, and a backend provider for real use.
 */
export class LocalStorageProvider {
  constructor({ storage, key, seed, schemaVersion, migrate = null }) {
    this.migrate = migrate;
    this.storage = storage;
    this.key = key;
    this.seed = seed;
    this.schemaVersion = schemaVersion;
    this.lastError = null;
  }
  async load() {
    try {
      const raw = this.storage && this.storage.getItem(this.key);
      if (raw) {
        const snap = JSON.parse(raw);
        if (snap && snap.schemaVersion === this.schemaVersion && snap.collections) {
          // Ensure newly introduced collections exist
          for (const c of COLLECTIONS) if (!Array.isArray(snap.collections[c])) snap.collections[c] = [];
          if (this.migrate && this.migrate(snap).length) await this.applyChanges([{ type: 'migrate' }], snap);
          return snap;
        }
      }
    } catch (err) {
      this.lastError = err;
    }
    const seeded = clone(this.seed());
    if (this.migrate) this.migrate(seeded);
    await this.applyChanges([], seeded);
    return seeded;
  }
  async applyChanges(_changes, snapshot) {
    if (!this.storage) return;
    snapshot.savedAt = new Date().toISOString();
    try {
      this.storage.setItem(this.key, JSON.stringify(snapshot));
    } catch (err) {
      this.lastError = err;
      throw new Error(`Unable to save data in browser storage (${err.name}). Export a backup and reduce data volume.`);
    }
  }
  async reset() {
    if (this.storage) this.storage.removeItem(this.key);
    return this.load();
  }
  describe() { return 'Browser local storage (this browser only)'; }
  /** Approximate usage: browsers typically allow about 5 million characters per site. */
  usage(snapshot) {
    const used = JSON.stringify(snapshot).length;
    return { used, limit: 5000000, fraction: used / 5000000 };
  }
}

/**
 * Future provider for a backend API. Not used in the GitHub Pages build.
 * Expected endpoints: GET /{collection}, POST /{collection},
 * PATCH /{collection}/{id}, DELETE /{collection}/{id}. Authentication uses an
 * HTTP-only session cookie or a short-lived token from the identity provider -
 * never a long-lived key embedded in this code.
 */
export class ApiProvider {
  constructor({ baseUrl, fetchImpl = (...a) => fetch(...a) }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }
  async request(method, path, body) {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
  async load() {
    const snap = emptySnapshot(1);
    await Promise.all(COLLECTIONS.map(async (c) => { snap.collections[c] = await this.request('GET', `/${c}`); }));
    return snap;
  }
  async applyChanges(changes) {
    for (const ch of changes) {
      if (ch.type === 'create') await this.request('POST', `/${ch.collection}`, ch.record);
      else if (ch.type === 'update') await this.request('PATCH', `/${ch.collection}/${encodeURIComponent(ch.id)}`, ch.record);
      else if (ch.type === 'delete') await this.request('DELETE', `/${ch.collection}/${encodeURIComponent(ch.id)}`);
    }
  }
  async reset() { throw new Error('Reset is not available against a shared backend.'); }
  describe() { return `Backend API (${this.baseUrl})`; }
}

export class DataStore {
  constructor(provider, { now = () => new Date().toISOString(), getUser = () => 'system' } = {}) {
    this.provider = provider;
    this.now = now;
    this.getUser = getUser;
    this.snapshot = null;
    this.listeners = new Set();
    this._batch = null;
  }

  async init() {
    this.snapshot = await this.provider.load();
    return this;
  }

  // ---------- Reads (synchronous, from cache) ----------
  all(collection) {
    this._assert(collection);
    return this.snapshot.collections[collection];
  }
  get(collection, id) {
    if (id === null || id === undefined || id === '') return null;
    return this.all(collection).find((r) => r.id === id) || null;
  }
  find(collection, predicate) {
    return this.all(collection).filter(predicate);
  }
  count(collection) {
    return this.all(collection).length;
  }

  nextId(collection) {
    const schema = SCHEMAS[collection];
    const prefix = schema.idPrefix;
    const pad = schema.idPad || 3;
    let max = 0;
    for (const r of this.all(collection)) {
      const m = String(r.id || '').match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}-${String(max + 1).padStart(pad, '0')}`;
  }

  // ---------- Writes ----------
  async create(collection, data, { validate = true, audit = true } = {}) {
    this._assert(collection);
    const schema = SCHEMAS[collection];
    const record = clone(data);
    const userAssigned = schema.fields.find((f) => f.key === 'id' && f.userAssignedId);
    if (userAssigned) {
      record.id = String(record.id || '').trim().toUpperCase();
    } else if (!record.id) {
      record.id = this.nextId(collection);
    }
    if (this.get(collection, record.id)) {
      throw new ValidationError({ id: `${schema.label} ${record.id} already exists.` }, `${record.id} already exists`);
    }
    if (validate) this._validateOrThrow(collection, record);
    const ts = this.now();
    record.createdAt = record.createdAt || ts;
    record.updatedAt = ts;
    if (schema.fields.some((f) => f.key === 'submittedBy')) record.lastModified = ts;
    return this._run(async (changes) => {
      this.all(collection).push(record);
      changes.push({ type: 'create', collection, id: record.id, record });
      if (audit) this._audit(changes, 'create', collection, record.id, this._describe(collection, record));
      return record;
    });
  }

  async update(collection, id, patch, { validate = true, audit = true } = {}) {
    const existing = this.get(collection, id);
    if (!existing) throw new Error(`${collection} ${id} not found`);
    const schema = SCHEMAS[collection];
    const next = { ...clone(existing), ...clone(patch), id };
    if (validate) this._validateOrThrow(collection, next, id);
    const changedFields = Object.keys(patch).filter((k) => JSON.stringify(existing[k]) !== JSON.stringify(next[k]));
    next.updatedAt = this.now();
    if (schema.fields.some((f) => f.key === 'submittedBy')) next.lastModified = next.updatedAt;
    return this._run(async (changes) => {
      const list = this.all(collection);
      list[list.indexOf(existing)] = next;
      changes.push({ type: 'update', collection, id, record: next });
      if (audit && changedFields.length) {
        this._audit(changes, 'update', collection, id, `Changed: ${changedFields.join(', ')}`);
      }
      return next;
    });
  }

  /** Describe what deleting a record would affect, without changing anything. */
  removalImpact(collection, id) {
    const impact = { cascade: [], nullify: [], restrict: [] };
    const visit = (coll, recId) => {
      for (const rel of RELATIONS.filter((r) => r.target === coll)) {
        for (const child of this.all(rel.collection).filter((r) => r[rel.field] === recId)) {
          const entry = { collection: rel.collection, id: child.id, field: rel.field };
          if (rel.onDelete === 'cascade') {
            if (!impact.cascade.some((e) => e.collection === entry.collection && e.id === entry.id)) {
              impact.cascade.push(entry);
              visit(rel.collection, child.id);
            }
          } else if (rel.onDelete === 'nullify') impact.nullify.push(entry);
          else impact.restrict.push(entry);
        }
      }
    };
    visit(collection, id);
    return impact;
  }

  async remove(collection, id, { audit = true } = {}) {
    const existing = this.get(collection, id);
    if (!existing) throw new Error(`${collection} ${id} not found`);
    const impact = this.removalImpact(collection, id);
    if (impact.restrict.length) {
      const first = impact.restrict[0];
      throw new Error(`Cannot delete ${id}: it is still referenced by ${impact.restrict.length} ${SCHEMAS[first.collection].plural.toLowerCase()} record(s) (e.g. ${first.id}).`);
    }
    return this._run(async (changes) => {
      for (const n of impact.nullify) {
        const rec = this.get(n.collection, n.id);
        if (rec) {
          const updated = { ...rec, [n.field]: null, updatedAt: this.now() };
          const list = this.all(n.collection);
          list[list.indexOf(rec)] = updated;
          changes.push({ type: 'update', collection: n.collection, id: n.id, record: updated });
        }
      }
      for (const c of impact.cascade) {
        const list = this.all(c.collection);
        const idx = list.findIndex((r) => r.id === c.id);
        if (idx >= 0) list.splice(idx, 1);
        changes.push({ type: 'delete', collection: c.collection, id: c.id });
      }
      const list = this.all(collection);
      list.splice(list.indexOf(existing), 1);
      changes.push({ type: 'delete', collection, id });
      if (audit) {
        const extra = impact.cascade.length ? ` (also removed ${impact.cascade.length} linked record(s))` : '';
        this._audit(changes, 'delete', collection, id, `${this._describe(collection, existing)}${extra}`);
      }
      return impact;
    });
  }

  /**
   * Run several writes as one unit: persisted together, rolled back together.
   * Used by CSV import and feed ingestion.
   */
  async transaction(fn) {
    if (this._batch) return fn(this);
    const backup = clone(this.snapshot);
    this._batch = [];
    try {
      const result = await fn(this);
      const changes = this._batch;
      this._batch = null;
      await this.provider.applyChanges(changes, this.snapshot);
      this._emit({ type: 'batch', count: changes.length });
      return result;
    } catch (err) {
      this._batch = null;
      this.snapshot = backup;
      throw err;
    }
  }

  // ---------- Settings (singleton record) ----------
  getSettings() {
    return this.get('settings', 'app') || { id: 'app' };
  }
  async updateSettings(patch) {
    if (!this.get('settings', 'app')) return this.create('settings', { id: 'app', ...patch }, { validate: false });
    return this.update('settings', 'app', patch, { validate: false });
  }

  // ---------- Whole-dataset operations ----------
  exportSnapshot() {
    const snap = clone(this.snapshot);
    snap.exportedAt = this.now();
    return snap;
  }

  /**
   * Check every record in a snapshot against the schemas and relationships.
   * Returns a list of problems (empty when the snapshot is valid).
   */
  static async validateSnapshot(snap, limit = 20) {
    const problems = [];
    const tmp = await new DataStore(new MemoryProvider({ seed: () => snap })).init();
    const checked = ['awsAccounts', 'infrastructure', 'applications', 'applicationInfrastructure', 'software', 'deployments', 'vulnerabilities', 'assessmentReviews', 'monitoringSources'];
    for (const c of checked) {
      const ids = new Set();
      for (const r of tmp.all(c)) {
        if (problems.length >= limit) return problems;
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) { problems.push(`${c}: record without a valid id`); continue; }
        if (ids.has(r.id)) problems.push(`${c} ${r.id}: duplicate id`);
        ids.add(r.id);
        const { valid, errors } = validateRecord(c, r, { store: tmp, existingId: r.id });
        if (!valid) problems.push(`${c} ${r.id}: ${Object.values(errors)[0]}`);
      }
    }
    return problems;
  }

  async importSnapshot(snap) {
    if (!snap || typeof snap !== 'object' || !snap.collections || typeof snap.collections !== 'object') throw new Error('This file is not a valid data backup.');
    if (snap.schemaVersion !== this.snapshot.schemaVersion) {
      throw new Error(`Backup schema version ${snap.schemaVersion} does not match this application (${this.snapshot.schemaVersion}).`);
    }
    for (const c of COLLECTIONS) {
      if (snap.collections[c] !== undefined && !Array.isArray(snap.collections[c])) throw new Error(`Backup collection "${c}" is not a list.`);
    }
    const problems = await DataStore.validateSnapshot(snap);
    if (problems.length) throw new Error(`Backup failed validation (${problems.length}${problems.length >= 20 ? '+' : ''} problem(s)), e.g. ${problems.slice(0, 3).join('; ')}`);
    const next = { schemaVersion: snap.schemaVersion, savedAt: null, collections: {} };
    for (const c of COLLECTIONS) next.collections[c] = Array.isArray(snap.collections[c]) ? snap.collections[c] : [];
    const backup = this.snapshot;
    this.snapshot = next;
    try {
      await this.provider.applyChanges([{ type: 'replace-all' }], this.snapshot);
    } catch (err) {
      this.snapshot = backup;
      throw err;
    }
    this._emit({ type: 'reset' });
  }

  async reset() {
    this.snapshot = await this.provider.reset();
    this._emit({ type: 'reset' });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- Internals ----------
  _assert(collection) {
    if (!this.snapshot) throw new Error('DataStore not initialised');
    if (!this.snapshot.collections[collection]) throw new Error(`Unknown collection: ${collection}`);
  }

  _validateOrThrow(collection, record, existingId) {
    const { valid, errors } = validateRecord(collection, record, { store: this, existingId });
    if (!valid) throw new ValidationError(errors, Object.values(errors)[0]);
  }

  async _run(mutator) {
    if (this._batch) return mutator(this._batch);
    const backup = clone(this.snapshot);
    const changes = [];
    try {
      const result = await mutator(changes);
      await this.provider.applyChanges(changes, this.snapshot);
      this._emit({ type: 'change', changes });
      return result;
    } catch (err) {
      this.snapshot = backup;
      throw err;
    }
  }

  _audit(changes, action, collection, recordId, summary) {
    if (NO_AUDIT.has(collection)) return;
    const log = this.snapshot.collections.auditLog;
    const entry = {
      id: `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: this.now(),
      user: this.getUser(),
      action,
      collection,
      recordId,
      summary,
    };
    log.push(entry);
    if (log.length > AUDIT_LIMIT) log.splice(0, log.length - AUDIT_LIMIT);
    changes.push({ type: 'create', collection: 'auditLog', id: entry.id, record: entry });
  }

  _describe(collection, r) {
    return r.name || r.title || r.accountName || [r.vendor, r.product, r.version].filter(Boolean).join(' ') || r.id;
  }

  _emit(evt) {
    for (const fn of this.listeners) {
      try { fn(evt); } catch (err) { console.error(err); }
    }
  }
}

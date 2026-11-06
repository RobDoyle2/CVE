// Idempotent data migrations for snapshots already saved in a browser.
// Each migration runs once; applied IDs are recorded in snapshot.migrations.
// (A backend would use database migrations instead.)

const MIGRATIONS = [
  {
    id: '2026-11-nvd-feed',
    description: 'Point the NVD monitoring source at the published GitHub Actions feed and clear invented sample check history.',
    apply(snap) {
      for (const src of snap.collections.monitoringSources || []) {
        if (src.type === 'NVD API' && !src.feedUrl) src.feedUrl = 'feeds/nvd/index.json';
        if (/simulated/i.test(src.lastStatus || '') && src.id && /^SRC-00[1-5]$/.test(src.id) && !src.feedCheckpoint) {
          src.lastSuccessfulCheck = '';
          src.lastDetectedUpdate = '';
          src.lastStatus = 'Not yet checked';
        }
      }
    },
  },
];

/** Apply pending migrations in place. Returns the IDs applied. */
export function applyMigrations(snap) {
  if (!snap || !snap.collections) return [];
  const done = new Set(snap.migrations || []);
  const applied = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    m.apply(snap);
    applied.push(m.id);
  }
  snap.migrations = [...done, ...applied];
  return applied;
}

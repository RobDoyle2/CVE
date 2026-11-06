// Application-wide configuration.
// No secrets belong here: this file is shipped to every browser.
export const APP_CONFIG = Object.freeze({
  name: 'Vulnerability Management Tool',
  version: '0.6.0',
  // Bump when the stored data shape changes; LocalStorageProvider discards
  // (or in future migrates) snapshots written with a different version.
  schemaVersion: 1,
  storageKey: 'vmt.data.v1',
  sessionKey: 'vmt.session.v1',
  // 'local'  - data held in the browser (GitHub Pages demonstration mode)
  // 'api'    - data served by a backend REST API (future AWS deployment)
  dataMode: 'local',
  apiBaseUrl: null,
});

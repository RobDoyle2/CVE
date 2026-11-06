// Relationship queries over the normalised data model. Pure functions of the
// store's read API, so they translate directly into SQL joins later.
import { isProduction } from '../models/lookups.js';

const uniqBy = (arr, key = (x) => x.id) => {
  const seen = new Set();
  return arr.filter((x) => { const k = key(x); if (!x || seen.has(k)) return false; seen.add(k); return true; });
};

export function infrastructureForApp(store, appId) {
  const ids = store.find('applicationInfrastructure', (l) => l.applicationId === appId).map((l) => l.infrastructureId);
  // Infrastructure referenced only via deployments is included too.
  for (const d of store.find('deployments', (x) => x.applicationId === appId && x.infrastructureId)) ids.push(d.infrastructureId);
  return uniqBy(ids.map((id) => store.get('infrastructure', id)).filter(Boolean));
}

export function awsAccountsForInfrastructure(store, infraList) {
  return uniqBy(infraList.map((i) => store.get('awsAccounts', i.awsAccountId)).filter(Boolean));
}

export function awsAccountsForApp(store, appId) {
  return awsAccountsForInfrastructure(store, infrastructureForApp(store, appId));
}

export function deploymentsForApp(store, appId) {
  return store.find('deployments', (d) => d.applicationId === appId).map((d) => ({
    ...d,
    software: store.get('software', d.softwareId),
    infrastructure: store.get('infrastructure', d.infrastructureId),
  }));
}

export function softwareForApp(store, appId) {
  return uniqBy(deploymentsForApp(store, appId).map((d) => d.software).filter(Boolean));
}

export function deploymentsForSoftware(store, softwareId) {
  return store.find('deployments', (d) => d.softwareId === softwareId).map((d) => ({
    ...d,
    application: store.get('applications', d.applicationId),
    infrastructure: store.get('infrastructure', d.infrastructureId),
  }));
}

export function applicationsForSoftware(store, softwareId) {
  return uniqBy(deploymentsForSoftware(store, softwareId).map((d) => d.application).filter(Boolean));
}

export function environmentsForSoftware(store, softwareId) {
  return Array.from(new Set(deploymentsForSoftware(store, softwareId).map((d) => d.environment).filter(Boolean)));
}

export function applicationsForInfrastructure(store, infraId) {
  const ids = store.find('applicationInfrastructure', (l) => l.infrastructureId === infraId).map((l) => l.applicationId);
  for (const d of store.find('deployments', (x) => x.infrastructureId === infraId)) ids.push(d.applicationId);
  return uniqBy(ids.map((id) => store.get('applications', id)).filter(Boolean));
}

export function infrastructureForAccount(store, accountId) {
  return store.find('infrastructure', (i) => i.awsAccountId === accountId);
}

export function applicationsForAccount(store, accountId) {
  return uniqBy(infrastructureForAccount(store, accountId).flatMap((i) => applicationsForInfrastructure(store, i.id)));
}

/** Summarise clusters (derived from infrastructure records). */
export function clusterSummary(store) {
  const map = new Map();
  for (const i of store.all('infrastructure')) {
    if (!i.clusterName || i.clusterType === 'None') continue;
    const key = i.clusterName;
    if (!map.has(key)) map.set(key, { name: key, type: i.clusterType, platform: i.hostingPlatform, environments: new Set(), accounts: new Set(), regions: new Set(), namespaces: [], apps: new Set() });
    const c = map.get(key);
    c.environments.add(i.environment);
    if (i.awsAccountId) c.accounts.add(i.awsAccountId);
    c.regions.add(i.region);
    if (i.namespace) c.namespaces.push({ namespace: i.namespace, infraId: i.id });
    for (const a of applicationsForInfrastructure(store, i.id)) c.apps.add(a.id);
  }
  return [...map.values()].map((c) => ({ ...c, environments: [...c.environments], accounts: [...c.accounts], regions: [...c.regions], apps: [...c.apps] }));
}

export function hasProduction(envs) {
  return envs.some(isProduction);
}

/** Replace the set of infrastructure links for an application (inside a transaction). */
export async function syncAppInfrastructure(store, appId, infraIds) {
  const wanted = new Set(infraIds);
  const current = store.find('applicationInfrastructure', (l) => l.applicationId === appId);
  for (const link of current) {
    if (!wanted.has(link.infrastructureId)) await store.remove('applicationInfrastructure', link.id);
  }
  const have = new Set(current.map((l) => l.infrastructureId));
  for (const id of wanted) {
    if (!have.has(id)) await store.create('applicationInfrastructure', { applicationId: appId, infrastructureId: id });
  }
}

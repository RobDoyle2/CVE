// Shared view behaviours: delete confirmation, deployment editing, permission guards.
import { esc } from '../ui/dom.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openRecordForm } from '../ui/form.js';
import { SCHEMAS } from '../models/schemas.js';

export async function confirmAndDelete(store, collection, id, label) {
  const impact = store.removalImpact(collection, id);
  if (impact.restrict.length) {
    const kinds = [...new Set(impact.restrict.map((r) => SCHEMAS[r.collection].plural.toLowerCase()))];
    toast(`Cannot delete ${label}: still referenced by ${impact.restrict.length} ${kinds.join(', ')} record(s). Reassign them first.`, 'error', 6000);
    return false;
  }
  const grouped = {};
  for (const c of impact.cascade) grouped[c.collection] = (grouped[c.collection] || 0) + 1;
  const lines = Object.entries(grouped).map(([c, n]) => `<li>${n} ${esc(SCHEMAS[c].plural.toLowerCase())}</li>`);
  if (impact.nullify.length) lines.push(`<li>${impact.nullify.length} deployment(s) will lose their infrastructure reference</li>`);
  const ok = await confirmDialog({
    title: `Delete ${label}?`,
    message: `<p>This permanently removes <strong>${esc(label)}</strong>.</p>${lines.length ? `<p>The following linked records will also be updated or removed:</p><ul>${lines.join('')}</ul>` : ''}`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  try {
    await store.remove(collection, id);
    toast(`${label} deleted.`);
    return true;
  } catch (err) {
    toast(err.message, 'error', 6000);
    return false;
  }
}

/** Add or edit a deployment (application <-> software <-> infrastructure link). */
export function openDeploymentForm({ store, deployment = {}, title = 'Add software deployment', onSaved }) {
  return openRecordForm({
    title,
    collection: 'deployments',
    record: deployment,
    store,
    intro: 'A deployment records that an application uses a specific software version, optionally on a specific infrastructure target. Use separate deployments where versions differ between environments.',
    onSubmit: async (data) => {
      if (data.infrastructureId && !data.environment) {
        const infra = store.get('infrastructure', data.infrastructureId);
        if (infra) data.environment = infra.environment;
      }
      if (deployment.id) await store.update('deployments', deployment.id, data);
      else await store.create('deployments', data);
      toast('Deployment saved.');
      if (onSaved) onSaved();
    },
  });
}

export function readOnlyNotice(session) {
  return session.canContribute() ? '' : `<div class="notice mb-2">You are viewing as <strong>${esc(session.user.name)}</strong> (${esc(session.user.role)}) - editing is disabled for this role.</div>`;
}

export function guard(session, permission) {
  if (session.can(permission)) return true;
  toast(`Your role (${session.user.role}) does not allow this action.`, 'error');
  return false;
}

// Team contribution workflow: submission and review metadata.
// Contributors' records go into "Pending review"; analysts/administrators'
// records are approved on save. Enforced server-side in a future backend.
import { todayIso } from '../ui/dom.js';

export const WORKFLOW_COLLECTIONS = ['applications', 'software'];

export function onCreate(data, session) {
  const user = session.user;
  const reviewer = session.can('review');
  return {
    ...data,
    submittedBy: user.name,
    submittedDate: todayIso(),
    reviewStatus: reviewer ? 'Approved' : 'Pending review',
    reviewedBy: reviewer ? user.name : '',
  };
}

export function onEdit(data, existing, session) {
  if (session.can('review')) {
    return { ...data, reviewStatus: existing.reviewStatus === 'Approved' ? 'Approved' : existing.reviewStatus || 'Approved' };
  }
  // A contributor's change requires fresh review.
  return { ...data, reviewStatus: 'Pending review', reviewedBy: '' };
}

export function reviewPatch(decision, session) {
  return { reviewStatus: decision, reviewedBy: session.user.name };
}

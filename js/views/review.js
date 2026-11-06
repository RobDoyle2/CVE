import { esc, fmtDate } from '../ui/dom.js';
import { pageHeader, reviewPill, emptyState, button } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { reviewPatch } from '../services/workflow.js';

const OPEN = ['Pending review', 'Changes requested', 'Draft'];

export function render(el, ctx) {
  const { store, session } = ctx;
  const reviewer = session.can('review');
  const mine = (r) => r.submittedBy === session.user.name;
  const items = [
    ...store.all('applications').map((r) => ({ kind: 'Application', collection: 'applications', href: `#/applications/${r.id}`, label: r.name, r })),
    ...store.all('software').map((r) => ({ kind: 'Software', collection: 'software', href: `#/software/${r.id}`, label: `${r.vendor} ${r.product} ${r.version || '(version unknown)'}`, r })),
  ];
  const queue = items.filter((i) => OPEN.includes(i.r.reviewStatus) && (reviewer || mine(i.r)));
  const recent = items.filter((i) => !OPEN.includes(i.r.reviewStatus) && i.r.submittedBy && (reviewer || mine(i.r)))
    .sort((a, b) => String(b.r.lastModified).localeCompare(String(a.r.lastModified))).slice(0, 10);

  el.innerHTML = `
    ${pageHeader({ title: 'Review Queue', subtitle: reviewer ? 'Submissions from team members awaiting approval before they are treated as verified inventory.' : 'Your submissions and their review status.' })}
    <div class="notice mb-2">Submission metadata (<em>submitted by, submission date, review status, reviewed by, last modified</em>) is recorded on every application and software record. In this demonstration the user is chosen from sample users; in production it would come from corporate single sign-on and approvals would be enforced by the backend.</div>
    <div class="card flush">
      <div class="card-header"><h3>Awaiting review (${queue.length})</h3></div>
      ${queue.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Type</th><th>Record</th><th>Submitted by</th><th>Submitted</th><th>Status</th><th class="actions">${reviewer ? 'Decision' : ''}</th></tr></thead><tbody>
        ${queue.map((i) => `<tr>
          <td>${esc(i.kind)}</td>
          <td><a class="row-link" href="${esc(i.href)}">${esc(i.label)}</a><div class="small muted mono">${esc(i.r.id)}</div></td>
          <td>${esc(i.r.submittedBy || '—')}</td>
          <td>${fmtDate(i.r.submittedDate)}</td>
          <td>${reviewPill(i.r.reviewStatus)}</td>
          <td class="actions">${reviewer ? `
            ${button('Approve', { size: 'sm', variant: 'primary', attrs: `data-decide="Approved" data-coll="${i.collection}" data-id="${esc(i.r.id)}"` })}
            ${button('Request changes', { size: 'sm', attrs: `data-decide="Changes requested" data-coll="${i.collection}" data-id="${esc(i.r.id)}"` })}
            ${button('Reject', { size: 'sm', variant: 'danger', attrs: `data-decide="Rejected" data-coll="${i.collection}" data-id="${esc(i.r.id)}"` })}` : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>` : emptyState('Nothing awaiting review.')}
    </div>
    <div class="card flush mt-2">
      <div class="card-header"><h3>Recently decided</h3></div>
      ${recent.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Type</th><th>Record</th><th>Submitted by</th><th>Status</th><th>Reviewed by</th></tr></thead><tbody>
        ${recent.map((i) => `<tr><td>${esc(i.kind)}</td><td><a href="${esc(i.href)}">${esc(i.label)}</a></td><td>${esc(i.r.submittedBy)}</td><td>${reviewPill(i.r.reviewStatus)}</td><td>${esc(i.r.reviewedBy || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('No decisions yet.')}
    </div>`;

  el.querySelectorAll('[data-decide]').forEach((b) => b.addEventListener('click', async () => {
    const rec = store.get(b.dataset.coll, b.dataset.id);
    if (rec.submittedBy === session.user.name && b.dataset.decide === 'Approved') {
      toast('You cannot approve your own submission (segregation of duties).', 'error');
      return;
    }
    await store.update(b.dataset.coll, b.dataset.id, reviewPatch(b.dataset.decide, session), { validate: false });
    toast(`${rec.name || rec.product}: ${b.dataset.decide}.`);
    render(el, ctx);
    ctx.refreshChrome();
  }));
}

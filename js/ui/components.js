// Reusable rendering helpers. Every helper escapes its inputs.
import { esc } from './dom.js';
import { icons } from './icons.js';
import { isProduction } from '../models/lookups.js';

const SEV_CLASS = { Critical: 'sev-critical', High: 'sev-high', Medium: 'sev-medium', Low: 'sev-low', None: 'sev-none' };
const CRIT_CLASS = { Critical: 'red', High: 'orange', Medium: 'yellow', Low: 'green' };
const ASSESS_CLASS = {
  'Confirmed affected': 'red',
  'Potentially affected': 'orange',
  'Requires investigation': 'purple',
  'Unable to determine': 'grey',
  'Not affected': 'green',
  'No inventory match': 'outline',
};
const REVIEW_CLASS = { Approved: 'green', 'Pending review': 'yellow', 'Changes requested': 'orange', Rejected: 'red', Draft: 'grey' };
const VERIFY_CLASS = { Verified: 'green', Unverified: 'red', 'Needs review': 'yellow' };
const PRIORITY_CLASS = { P1: 'red', P2: 'orange', P3: 'yellow', P4: 'blue' };

export const severityPill = (s) => `<span class="pill ${SEV_CLASS[s] || 'sev-none'}">${esc(s || 'None')}</span>`;
export const criticalityPill = (c) => `<span class="pill ${CRIT_CLASS[c] || 'grey'}">${esc(c || '—')}</span>`;
export const assessmentPill = (s) => `<span class="pill ${ASSESS_CLASS[s] || 'grey'}">${esc(s)}</span>`;
export const reviewPill = (s) => (s ? `<span class="pill ${REVIEW_CLASS[s] || 'grey'}">${esc(s)}</span>` : '<span class="muted">—</span>');
export const verificationPill = (s) => `<span class="pill ${VERIFY_CLASS[s] || 'grey'}">${esc(s || 'Unknown')}</span>`;
export const priorityPill = (p, label) => (p ? `<span class="pill ${PRIORITY_CLASS[p] || 'grey'}" title="Rule-based investigation priority">${esc(p)}${label ? ` · ${esc(label)}` : ''}</span>` : '<span class="muted">—</span>');
export const boolPill = (b, yes = 'Yes', no = 'No') => (b ? `<span class="pill teal">${esc(yes)}</span>` : `<span class="pill outline">${esc(no)}</span>`);

export function envTag(env) {
  return `<span class="tag ${isProduction(env) ? 'prod' : 'grey'}">${esc(env)}</span>`;
}
export const envTags = (envs = []) => (envs.length ? envs.map(envTag).join('') : '<span class="muted">—</span>');

export function statCard({ label, value, foot = '', color = 'var(--accent)', href = '' }) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="card stat-card" style="--stat-color:${esc(color)}" ${href ? `href="${esc(href)}"` : ''}>
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(value)}</div>
      ${foot ? `<div class="stat-foot">${esc(foot)}</div>` : ''}
    </${tag}>`;
}

/**
 * Horizontal bar chart. Each row shows label, bar and value as text so the
 * chart never depends on colour alone. Hover title gives the exact figure.
 */
export function barChart(rows, { max, unit = '' } = {}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return emptyState('No data to display.');
  return `<div class="bar-chart" role="list">${rows.map((r) => {
    const pct = top ? Math.round((r.value / top) * 100) : 0;
    const label = r.href ? `<a href="${esc(r.href)}">${esc(r.label)}</a>` : esc(r.label);
    return `<div class="bar-row" role="listitem" title="${esc(`${r.label}: ${r.value}${unit}`)}">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${esc(r.color || 'var(--accent)')}"></div></div>
        <div class="bar-value">${esc(r.value)}${esc(unit)}</div>
      </div>`;
  }).join('')}</div>`;
}

export function emptyState(message, icon = icons.inbox) {
  return `<div class="empty">${icon}<div>${esc(message)}</div></div>`;
}

export function pageHeader({ title, subtitle = '', actions = '', crumbs = '' }) {
  return `<div class="page-header">
      <div>
        ${crumbs ? `<div class="breadcrumbs">${crumbs}</div>` : ''}
        <h1>${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </div>`;
}

export function button(label, { variant = '', icon = '', attrs = '', size = '' } = {}) {
  return `<button type="button" class="btn ${variant ? `btn-${variant}` : ''} ${size ? `btn-${size}` : ''}" ${attrs}>${icon ? icons[icon] : ''}${esc(label)}</button>`;
}

export function selectFilter(id, label, options, value = '') {
  return `<label class="sr-only" for="${esc(id)}">${esc(label)}</label>
    <select class="select" id="${esc(id)}">
      <option value="">${esc(label)}: all</option>
      ${options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const text = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${esc(text)}</option>`;
      }).join('')}
    </select>`;
}

export const SEVERITY_COLORS = {
  Critical: 'var(--sev-critical)', High: 'var(--sev-high)', Medium: 'var(--sev-medium)', Low: 'var(--sev-low)', None: 'var(--sev-none)',
};
export const ASSESSMENT_COLORS = {
  'Confirmed affected': 'var(--st-red)', 'Potentially affected': 'var(--st-orange)', 'Requires investigation': 'var(--st-purple)',
  'Unable to determine': 'var(--st-grey)', 'Not affected': 'var(--st-green)',
};

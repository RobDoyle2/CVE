import { esc } from '../ui/dom.js';

export function renderPlaceholder(el, { title, description, planned = [] }) {
  el.innerHTML = `
    <div class="page-header"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div></div>
    <div class="card placeholder-card">
      <h2>Coming in a later development stage</h2>
      <p>This section is part of the navigation design and will be implemented incrementally.</p>
      ${planned.length ? `<ul class="mini-list" style="max-width:520px;margin:0 auto;text-align:left">${planned.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    </div>`;
}

// Sortable, optionally expandable data table with event delegation.
import { esc } from './dom.js';
import { icons } from './icons.js';
import { emptyState } from './components.js';

export class TableController {
  /**
   * @param {HTMLElement} el container
   * @param {{columns:Array<{key:string,label:string,render?:(r)=>string,sort?:(r)=>any,className?:string,sortable?:boolean}>,
   *          getRows:()=>Array, expand?:(r)=>string, rowKey?:string, empty?:string, initialSort?:{key:string,dir:1|-1},
   *          rowClass?:(r)=>string, caption?:string}} opts
   */
  constructor(el, opts) {
    this.el = el;
    this.opts = { rowKey: 'id', empty: 'No records match the current filters.', pageSize: 100, ...opts };
    this.limit = this.opts.pageSize;
    this.sort = opts.initialSort || null;
    this.expanded = new Set();
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th.sortable')) { e.preventDefault(); this.onClick(e); }
    });
  }

  sortedRows() {
    const rows = [...this.opts.getRows()];
    if (!this.sort) return rows;
    const col = this.opts.columns.find((c) => c.key === this.sort.key);
    if (!col) return rows;
    const acc = col.sort || ((r) => r[col.key]);
    // Compute each sort key once per render (keys can involve relationship lookups).
    const keyed = rows.map((r) => ({ r, k: acc(r) }));
    return keyed.sort((x, y) => {
      const va = x.k; const vb = y.k;
      if (va === vb) return 0;
      if (va === undefined || va === null || va === '') return 1;
      if (vb === undefined || vb === null || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * this.sort.dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * this.sort.dir;
    }).map((x) => x.r);
  }

  render() {
    const { columns, expand, rowKey, empty, rowClass, caption } = this.opts;
    const rows = this.sortedRows();
    if (!rows.length) {
      this.el.innerHTML = emptyState(empty);
      return rows;
    }
    const colCount = columns.length + (expand ? 1 : 0);
    const head = `${expand ? '<th style="width:32px"><span class="sr-only">Expand</span></th>' : ''}${columns.map((c) => {
      const sortable = c.sortable !== false && c.key !== 'actions';
      const active = this.sort && this.sort.key === c.key;
      const aria = sortable ? `aria-sort="${active ? (this.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}"` : '';
      return `<th class="${sortable ? 'sortable' : ''} ${c.className || ''}" ${sortable ? `data-sort="${esc(c.key)}" tabindex="0"` : ''} ${aria} scope="col">${esc(c.label)}${active ? (this.sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>`;
    }).join('')}`;
    const visible = rows.slice(0, this.limit);
    const body = visible.map((r) => {
      const id = r[rowKey];
      const isOpen = expand && this.expanded.has(id);
      const main = `<tr class="${isOpen ? 'row-expanded' : ''} ${rowClass ? rowClass(r) : ''}" data-row="${esc(id)}">
          ${expand ? `<td><button class="expand-btn" data-expand="${esc(id)}" aria-expanded="${isOpen}" aria-label="Show details for ${esc(id)}">${icons.chevron}</button></td>` : ''}
          ${columns.map((c) => `<td class="${c.className || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}
        </tr>`;
      const detail = isOpen ? `<tr class="detail-row"><td colspan="${colCount}">${expand(r)}</td></tr>` : '';
      return main + detail;
    }).join('');
    this.el.innerHTML = `<div class="table-wrap"><table class="data">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${rows.length > visible.length
      ? `<div class="text-right mt-1"><span class="small muted">Showing ${visible.length} of ${rows.length}</span> <button type="button" class="btn btn-sm" data-more>Show ${Math.min(this.opts.pageSize, rows.length - visible.length)} more</button></div>` : ''}`;
    return rows;
  }

  onClick(e) {
    if (e.target.closest('[data-more]')) {
      this.limit += this.opts.pageSize;
      this.render();
      return;
    }
    const th = e.target.closest('th[data-sort]');
    if (th && this.el.contains(th)) {
      const key = th.dataset.sort;
      this.sort = this.sort && this.sort.key === key ? { key, dir: -this.sort.dir } : { key, dir: 1 };
      this.render();
      return;
    }
    const btn = e.target.closest('[data-expand]');
    if (btn && this.el.contains(btn)) {
      const id = btn.dataset.expand;
      if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
      this.render();
      const again = this.el.querySelector(`[data-expand="${CSS.escape(id)}"]`);
      if (again) again.focus();
    }
  }
}

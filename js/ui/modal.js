import { esc } from './dom.js';
import { icons } from './icons.js';

let openCount = 0;

/**
 * Open a modal dialog.
 * @param {{title:string, body:string|HTMLElement, size?:'wide'|'narrow', actions?:Array<{label,variant?,onClick?:(close)=>any, close?:boolean, id?:string}>, onClose?:Function}} opts
 * @returns {{el:HTMLElement, close:Function}}
 */
export function openModal({ title, body, size = '', actions = [], onClose }) {
  const host = document.getElementById('modal-host');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const titleId = `modal-title-${++openCount}`;
  backdrop.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="modal-header">
        <h2 id="${titleId}">${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close dialog">${icons.close}</button>
      </div>
      <div class="modal-body"></div>
      ${actions.length ? '<div class="modal-footer"></div>' : ''}
    </div>`;
  const bodyEl = backdrop.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  const previouslyFocused = document.activeElement;
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('[data-close]').addEventListener('click', close);

  const footer = backdrop.querySelector('.modal-footer');
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${a.variant ? `btn-${a.variant}` : ''}`;
    btn.textContent = a.label;
    if (a.id) btn.id = a.id;
    btn.addEventListener('click', async () => {
      if (a.onClick) {
        btn.disabled = true;
        try {
          const result = await a.onClick(close);
          if (result !== false && a.close !== false) close();
        } finally {
          btn.disabled = false;
        }
      } else {
        close();
      }
    });
    footer.appendChild(btn);
  }
  host.appendChild(backdrop);
  const first = backdrop.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-footer .btn-primary');
  (first || backdrop.querySelector('[data-close]')).focus();
  return { el: backdrop, body: bodyEl, close };
}

/** Promise-based confirmation dialog. */
export function confirmDialog({ title = 'Please confirm', message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let decided = false;
    openModal({
      title,
      size: 'narrow',
      body: `<div>${message}</div>`,
      onClose: () => { if (!decided) resolve(false); },
      actions: [
        { label: 'Cancel', onClick: () => { decided = true; resolve(false); } },
        { label: confirmLabel, variant: danger ? 'danger-solid' : 'primary', onClick: () => { decided = true; resolve(true); } },
      ],
    });
  });
}

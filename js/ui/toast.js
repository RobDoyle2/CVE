import { esc } from './dom.js';

export function toast(message, type = 'success', ms = 3800) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = esc(message);
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

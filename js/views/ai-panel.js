// AI assistance panel shown on the impact assessment page.
import { esc, fmtDateTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { AiService, AI_TASKS, AiDisabledError, buildAiRequest } from '../services/ai-service.js';
import { openModal } from '../ui/modal.js';

export function renderAiPanel(host, result, store) {
  const settings = store.getSettings();
  const svc = AiService.fromSettings(settings);
  const modeLabel = { disabled: 'Disabled', simulated: 'Simulated (no AI model)', backend: 'Enterprise backend' }[svc.mode] || svc.mode;
  host.innerHTML = `
    <div class="card mt-2">
      <div class="card-header"><h3>${icons.sparkles} AI assistance</h3><span class="tag grey">${esc(modeLabel)}</span>
        <div class="actions"><button class="btn btn-sm btn-ghost" id="ai-payload">View data that would be sent</button></div></div>
      ${svc.enabled ? `<div class="flex flex-wrap">${Object.entries(AI_TASKS).map(([k, t]) => `<button class="btn btn-sm" data-ai="${k}">${esc(t.label)}</button>`).join('')}</div>`
        : '<p class="small muted mb-0">AI assistance is disabled. An administrator can enable a simulated demonstration or configure the enterprise AI backend in <a href="#/settings">Settings → Integrations</a>.</p>'}
      <div id="ai-out"></div>
    </div>`;
  host.querySelector('#ai-payload').addEventListener('click', () => {
    openModal({
      title: 'AI request payload (data minimised)',
      size: 'wide',
      body: `<p class="small">This is the exact payload the browser would send to the organisation's backend for the "Summarise potential business impact" task. Owner names, contact details, AWS account numbers and notes are excluded. The backend adds the provider credentials - the browser never holds them.</p>
        <pre class="code-block">${esc(JSON.stringify(buildAiRequest('summariseImpact', result), null, 2))}</pre>`,
      actions: [{ label: 'Close', variant: 'primary' }],
    });
  });
  host.querySelectorAll('[data-ai]').forEach((b) => b.addEventListener('click', async () => {
    const out = host.querySelector('#ai-out');
    out.innerHTML = '<p class="small muted mt-2">Working…</p>';
    try {
      const r = await svc.run(b.dataset.ai, result);
      out.innerHTML = `<div class="notice warn mt-2"><strong>${r.simulated ? 'SIMULATED OUTPUT - no AI model was used.' : 'AI-generated output.'}</strong> ${esc(r.disclaimer)}</div>
        <div class="card mt-1" style="background:var(--surface-2)">
          <div class="small muted">${esc(r.taskLabel)} · ${esc(fmtDateTime(r.generatedAt))}${r.model ? ` · model: ${esc(r.model)}` : ''}</div>
          <pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0 0">${esc(r.output)}</pre>
        </div>`;
    } catch (err) {
      out.innerHTML = `<div class="notice ${err instanceof AiDisabledError ? '' : 'danger'} mt-2">${esc(err.message)}</div>`;
    }
  }));
}

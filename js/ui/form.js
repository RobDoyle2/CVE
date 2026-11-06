// Schema-driven forms. Field definitions come from js/models/schemas.js so
// the form, validation and CSV import always agree.
import { esc } from './dom.js';
import { fieldsFor } from '../models/schemas.js';
import { openModal } from './modal.js';
import { ValidationError } from '../services/validation.js';
import { toast } from './toast.js';

export function refLabel(collection, r) {
  if (!r) return '';
  switch (collection) {
    case 'applications': return `${r.name} (${r.id})`;
    case 'awsAccounts': return `${r.accountName} - ${r.accountId}`;
    case 'infrastructure': return `${r.name} (${r.environment})`;
    case 'software': return `${r.vendor} ${r.product} ${r.version || '(version unknown)'} (${r.id})`;
    case 'vulnerabilities': return `${r.id} - ${r.title}`;
    default: return r.name || r.id;
  }
}

function fieldInput(f, value, store) {
  const id = `f-${f.key}`;
  const common = `id="${id}" name="${esc(f.key)}" ${f.required ? 'aria-required="true"' : ''}`;
  switch (f.type) {
    case 'textarea':
      return `<textarea class="input" rows="3" ${common} maxlength="${f.maxLength || ''}">${esc(value ?? '')}</textarea>`;
    case 'urllist':
      return `<textarea class="input" rows="3" ${common}>${esc(Array.isArray(value) ? value.join('\n') : (value ?? ''))}</textarea>`;
    case 'select':
      return `<select class="select" ${common}>
          <option value="">Select…</option>
          ${f.options.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>`;
    case 'multiselect': {
      const vals = Array.isArray(value) ? value : [];
      return `<div class="check-list" id="${id}" role="group">${f.options.map((o) => `
          <label><input type="checkbox" name="${esc(f.key)}" value="${esc(o)}" ${vals.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}
        </div>`;
    }
    case 'boolean':
      return `<label class="toggle"><input type="checkbox" ${common} ${value ? 'checked' : ''}> Yes</label>`;
    case 'number':
      return `<input class="input" type="number" ${common} value="${esc(value ?? '')}" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 'any'}">`;
    case 'date':
      return `<input class="input" type="date" ${common} value="${esc(value ?? '')}">`;
    case 'ref': {
      const rows = store.all(f.ref);
      return `<select class="select" ${common}>
          <option value="">${f.required ? 'Select…' : '(none)'}</option>
          ${rows.map((r) => `<option value="${esc(r.id)}" ${r.id === value ? 'selected' : ''}>${esc(refLabel(f.ref, r))}</option>`).join('')}
        </select>`;
    }
    default:
      return `<input class="input" type="${f.type === 'url' ? 'url' : 'text'}" ${common} value="${esc(value ?? '')}" maxlength="${f.maxLength || ''}">`;
  }
}

export function renderFields(fields, record, store) {
  return fields.map((f) => `
    <div class="form-field ${f.full || f.type === 'multiselect' || f.type === 'textarea' ? 'full' : ''}" data-field="${esc(f.key)}">
      <label for="f-${esc(f.key)}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
      ${fieldInput(f, record[f.key], store)}
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}
      <div class="error" role="alert"></div>
    </div>`).join('');
}

export function readFields(formEl, fields) {
  const data = {};
  for (const f of fields) {
    if (f.type === 'multiselect') {
      data[f.key] = Array.from(formEl.querySelectorAll(`input[name="${f.key}"]:checked`)).map((i) => i.value);
      continue;
    }
    const input = formEl.querySelector(`[name="${f.key}"]`);
    if (!input) continue;
    if (f.type === 'boolean') data[f.key] = input.checked;
    else if (f.type === 'number') data[f.key] = input.value === '' ? null : Number(input.value);
    else if (f.type === 'urllist') data[f.key] = input.value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'ref') data[f.key] = input.value || null;
    else data[f.key] = input.value.trim();
  }
  return data;
}

export function showErrors(formEl, errors = {}) {
  formEl.querySelectorAll('.form-field').forEach((el) => {
    const key = el.dataset.field;
    const msg = errors[key];
    el.classList.toggle('invalid', !!msg);
    el.querySelector('.error').textContent = msg || '';
  });
  const general = formEl.querySelector('.form-general-error');
  const unplaced = Object.entries(errors).filter(([k]) => !formEl.querySelector(`.form-field[data-field="${k}"]`)).map(([, v]) => v);
  if (general) {
    general.textContent = unplaced.join(' ');
    general.classList.toggle('hidden', !unplaced.length);
  }
  const firstInvalid = formEl.querySelector('.form-field.invalid input, .form-field.invalid select, .form-field.invalid textarea');
  if (firstInvalid) firstInvalid.focus();
}

/**
 * Open a modal form for a schema-backed record.
 * extra: { html, read(formEl) -> object } for relationship editors.
 * onSubmit(data) should persist; throwing ValidationError shows field errors.
 */
export function openRecordForm({ title, collection, record = {}, store, onSubmit, exclude = [], include = null, extra = null, intro = '' }) {
  let fields = fieldsFor(collection).filter((f) => !f.readonly || (f.userAssignedId && !record.id));
  fields = fields.filter((f) => !exclude.includes(f.key));
  if (include) fields = fields.filter((f) => include.includes(f.key));
  const form = document.createElement('form');
  form.noValidate = true;
  form.innerHTML = `
    ${intro ? `<div class="notice mb-2">${intro}</div>` : ''}
    <div class="notice danger form-general-error hidden mb-2" role="alert"></div>
    <div class="form-grid">${renderFields(fields, record, store)}${extra ? extra.html : ''}</div>`;
  const submit = async () => {
    const data = { ...readFields(form, fields), ...(extra && extra.read ? extra.read(form) : {}) };
    try {
      await onSubmit(data);
      return true;
    } catch (err) {
      if (err instanceof ValidationError) {
        showErrors(form, err.errors);
      } else {
        showErrors(form, { _record: err.message });
        console.error(err);
      }
      toast('Please correct the highlighted fields.', 'error');
      return false;
    }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); });
  return openModal({
    title,
    body: form,
    size: 'wide',
    actions: [
      { label: 'Cancel' },
      { label: 'Save', variant: 'primary', onClick: submit },
    ],
  });
}

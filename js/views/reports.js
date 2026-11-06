import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Reports',
    description: 'Reporting and Excel export.',
    planned: 'Executive summary;Excel exports'.split(';'),
  });
}

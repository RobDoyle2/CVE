import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Settings',
    description: 'Application configuration.',
    planned: 'Data management;Integration settings'.split(';'),
  });
}

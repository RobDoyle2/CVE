import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Applications',
    description: 'Inventory of applications and services.',
    planned: 'Application records, ownership and criticality;Links to infrastructure and software'.split(';'),
  });
}

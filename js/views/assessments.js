import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Impact Assessments',
    description: 'Cross-reference CVEs against the inventory.',
    planned: 'Evidence-based matching engine;Impact by application and environment'.split(';'),
  });
}

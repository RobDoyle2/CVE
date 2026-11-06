import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Monitoring Sources',
    description: 'Vulnerability intelligence sources.',
    planned: 'NVD, CISA KEV and vendor advisories configuration'.split(';'),
  });
}

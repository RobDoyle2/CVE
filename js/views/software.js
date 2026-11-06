import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Software Inventory',
    description: 'Software components and versions used by applications.',
    planned: 'Vendor, product and version records;Verification status and review dates'.split(';'),
  });
}

import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Vulnerabilities (CVEs)',
    description: 'Register of vulnerabilities being tracked.',
    planned: 'CVE register with CVSS and exploitation status'.split(';'),
  });
}

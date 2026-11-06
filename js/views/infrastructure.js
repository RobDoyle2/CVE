import { renderPlaceholder } from './placeholder.js';

export function render(el) {
  renderPlaceholder(el, {
    title: 'Infrastructure',
    description: 'AWS accounts, Kubernetes and OpenShift clusters.',
    planned: 'AWS accounts and regions;Clusters and namespaces'.split(';'),
  });
}

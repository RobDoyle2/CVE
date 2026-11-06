// AI integration layer.
//
// The browser NEVER talks to an AI provider directly and NEVER holds an API
// key. In production, the browser calls the organisation's backend
// (e.g. POST /api/ai/{task} on API Gateway); the backend authenticates the
// user, applies data-minimisation and logging, retrieves the provider key from
// AWS Secrets Manager and calls an approved service (e.g. Azure OpenAI or
// Amazon Bedrock).
//
// Modes:
//   disabled  - default; AI features are switched off
//   simulated - deterministic, locally generated text for demonstrating the UX.
//               Clearly labelled; no AI model is involved.
//   backend   - calls the configured backend endpoint (same-origin or added to
//               the Content-Security-Policy connect-src)
//
// AI output is advisory. It is never written back as assessment status or as
// evidence; analysts must verify and record decisions themselves.

export const AI_TASKS = {
  interpret: {
    label: 'Interpret vulnerability description',
    instructions: 'Explain in plain English what the vulnerability allows an attacker to do, the preconditions required, and which configurations are likely relevant. Do not speculate beyond the supplied text; say when information is missing.',
  },
  identifyProducts: {
    label: 'Identify potentially relevant products',
    instructions: 'From the vulnerability description and affected product data, list product names, components or packages that could embed or redistribute the vulnerable code. Mark each as "stated in source" or "inferred".',
  },
  compareInventory: {
    label: 'Compare vendor information with inventory',
    instructions: 'Compare the vendor-supplied affected products/versions with the supplied inventory items. For each item state whether the vendor data supports a match, contradicts it, or is insufficient, quoting the data used. Do not assign probabilities.',
  },
  summariseImpact: {
    label: 'Summarise potential business impact',
    instructions: 'Summarise the potential business impact for the supplied applications using only the supplied criticality, environment and exposure attributes. Highlight uncertainty and data gaps.',
  },
  recommendPriorities: {
    label: 'Recommend investigation priorities',
    instructions: 'Suggest an order of investigation for the supplied findings with a one-line justification each, referencing severity, exploitation status, environment and exposure. Do not present confidence scores.',
  },
};

export const AI_DISCLAIMER = 'AI-generated content is advisory only. It may be incomplete or wrong, is not evidence that a vulnerability exists or does not exist, and must be verified by an analyst before any decision is recorded.';

export class AiDisabledError extends Error {
  constructor() { super('AI assistance is disabled. An administrator can enable it in Settings → Integrations.'); this.name = 'AiDisabledError'; }
}

/**
 * Build the minimised request payload for a task. Only technical attributes
 * required for the task are included - no owner names, email addresses, AWS
 * account numbers or free-text notes.
 */
export function buildAiRequest(task, result) {
  if (!AI_TASKS[task]) throw new Error(`Unknown AI task: ${task}`);
  const { cve, findings } = result;
  const vulnerability = {
    id: cve.id, title: cve.title, description: cve.description, severity: cve.severity, cvssScore: cve.cvssScore,
    vendor: cve.vendor, product: cve.product, affectedVersions: cve.affectedVersions, fixedVersions: cve.fixedVersions,
    exploitationStatus: cve.exploitationStatus, exploitAvailability: cve.exploitAvailability,
  };
  const inventory = findings.map((f) => ({
    ref: f.softwareId,
    vendor: f.software.vendor, product: f.software.product, version: f.software.version || null, category: f.software.category,
    engineStatus: f.status, matchType: f.match.type, versionCheck: f.version.result,
    applications: f.impact.applications.map((a) => ({ ref: a.id, criticality: a.criticality, internetFacing: a.internetFacing, environments: a.environments })),
  }));
  const input = { vulnerability };
  if (task !== 'interpret') input.inventory = inventory;
  return {
    task,
    instructions: AI_TASKS[task].instructions,
    guardrails: [
      'Use only the supplied data.',
      'Do not output probabilities, percentages or confidence scores.',
      'State clearly when information is insufficient.',
      'Output is advisory and will be reviewed by a security analyst.',
    ],
    input,
  };
}

function simulate(task, request) {
  const v = request.input.vulnerability;
  const inv = request.input.inventory || [];
  const lines = [];
  switch (task) {
    case 'interpret':
      lines.push(`${v.id} affects ${v.vendor} ${v.product} (${v.affectedVersions || 'versions not specified'}).`);
      lines.push(`Severity is ${v.severity}${v.cvssScore ? ` (CVSS ${v.cvssScore})` : ''}; exploitation status: ${v.exploitationStatus}.`);
      lines.push(`Description summary: ${v.description.split('. ')[0]}.`);
      if (!v.affectedVersions) lines.push('Affected versions are not provided - the vendor advisory must be consulted.');
      break;
    case 'identifyProducts':
      lines.push(`Stated in source: ${v.vendor} ${v.product}.`);
      lines.push('Inferred (verify): container base images, appliances or bundled distributions that ship this component.');
      break;
    case 'compareInventory':
      if (!inv.length) lines.push('No inventory items were supplied - nothing to compare.');
      for (const i of inv) lines.push(`${i.ref} ${i.vendor} ${i.product} ${i.version || '(no version)'}: version check "${i.versionCheck}", match type "${i.matchType}" - ${i.versionCheck === 'in-range' ? 'vendor data supports a match' : i.versionCheck === 'out-of-range' ? 'vendor data contradicts a match' : 'insufficient data'}.`);
      break;
    case 'summariseImpact': {
      const apps = inv.flatMap((i) => i.applications);
      const prod = apps.filter((a) => a.environments.includes('Production'));
      lines.push(`${apps.length} application deployment(s) are linked to matched software; ${prod.length} include production.`);
      if (prod.some((a) => a.internetFacing)) lines.push('At least one internet-facing production application is in scope, increasing potential exposure.');
      const crit = [...new Set(prod.map((a) => a.criticality))];
      if (crit.length) lines.push(`Business criticality of production applications in scope: ${crit.join(', ')}.`);
      lines.push('Impact cannot be confirmed until versions and configurations are verified.');
      break;
    }
    case 'recommendPriorities': {
      const order = [...inv].sort((a, b) => (b.applications.some((x) => x.environments.includes('Production')) - a.applications.some((x) => x.environments.includes('Production'))));
      order.forEach((i, n) => lines.push(`${n + 1}. ${i.ref} ${i.product} ${i.version || ''} - ${i.engineStatus}; ${i.applications.some((x) => x.environments.includes('Production')) ? 'production deployment' : 'non-production only'}.`));
      if (!order.length) lines.push('No findings to prioritise.');
      break;
    }
    default:
      break;
  }
  return lines.join('\n');
}

export class AiService {
  constructor({ mode = 'disabled', endpoint = '', fetchImpl = (...a) => fetch(...a) } = {}) {
    this.mode = mode;
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
  }

  static fromSettings(settings, opts = {}) {
    return new AiService({ mode: settings.aiProvider || 'disabled', endpoint: settings.aiBackendEndpoint || '', ...opts });
  }

  get enabled() { return this.mode === 'simulated' || this.mode === 'backend'; }

  async run(task, result) {
    const request = buildAiRequest(task, result);
    const base = { task, taskLabel: AI_TASKS[task].label, mode: this.mode, request, disclaimer: AI_DISCLAIMER, generatedAt: new Date().toISOString() };
    if (this.mode === 'simulated') return { ...base, simulated: true, output: simulate(task, request) };
    if (this.mode !== 'backend') throw new AiDisabledError();
    if (!/^https:\/\//.test(this.endpoint) && !this.endpoint.startsWith('/')) throw new Error('The AI backend endpoint must be an https:// URL or a same-origin path.');
    const res = await this.fetch(`${this.endpoint.replace(/\/$/, '')}/${task}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`AI backend returned ${res.status}.`);
    const body = await res.json();
    if (!body || typeof body.output !== 'string') throw new Error('AI backend response was not in the expected format ({ output: string }).');
    return { ...base, simulated: false, output: body.output, model: body.model || 'not reported' };
  }
}

export function normalizeDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let candidate = raw;
  try {
    candidate = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw).hostname || raw;
  } catch {}
  return candidate.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

export function queryKey({ provider = 'unknown', domain, scope = 'domain', entry = 'overview', page = 1 } = {}) {
  return [provider, normalizeDomain(domain), scope, entry, Number(page) || 1].join('|');
}

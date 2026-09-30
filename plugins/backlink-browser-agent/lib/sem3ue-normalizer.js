import { normalizeDomain, queryKey } from './domain.js';
import { evaluateAuthority } from './qualification.js';

function firstResponse(capture, predicate) {
  return (capture && Array.isArray(capture.responses) ? capture.responses : []).find(function(response) {
    return response && response.json && predicate(response);
  });
}

function toIso(epochSeconds) {
  if (!Number.isFinite(Number(epochSeconds)) || Number(epochSeconds) <= 0) return null;
  return new Date(Number(epochSeconds) * 1000).toISOString();
}

function hostname(value) {
  try { return new URL(value).hostname; } catch { return null; }
}

function stableFingerprint(response) {
  if (!response || !response.url) return null;
  try {
    const url = new URL(response.url);
    const allowed = ['action', 'type', 'target', 'target_type', 'display_page', 'display_filter', 'sort_field', 'sort_type'];
    const params = new URLSearchParams();
    for (const key of allowed) if (url.searchParams.has(key)) params.set(key, url.searchParams.get(key));
    const query = params.toString();
    return (response.method || 'GET') + ' ' + url.pathname + (query ? '?' + query : '');
  } catch {
    return (response.method || 'GET') + ' ' + response.url;
  }
}

export function normalizeBacklink(row, index) {
  const rel = [];
  if (row.nofollow) rel.push('nofollow');
  if (row.sponsored) rel.push('sponsored');
  if (row.ugc) rel.push('ugc');
  return {
    index: index + 1,
    sourceDomain: normalizeDomain(hostname(row.source_url)),
    sourceUrl: row.source_url || null,
    sourceTitle: row.source_title || null,
    targetUrl: row.target_url || null,
    targetTitle: row.target_title || null,
    anchorText: row.anchor || row.image_alt || '',
    pageAuthorityScore: Number.isFinite(row.page_ascore) ? row.page_ascore : null,
    domainAuthorityScore: Number.isFinite(row.domain_ascore) ? row.domain_ascore : null,
    language: row.lang || null,
    platform: Array.isArray(row.platform) ? row.platform : [],
    placement: row.position || null,
    linkType: row.image ? 'image' : row.text ? 'text' : row.form ? 'form' : row.frame ? 'frame' : 'unknown',
    follow: !row.nofollow,
    rel: rel,
    isNew: Boolean(row.newlink),
    isLost: Boolean(row.lostlink),
    lostReason: row.lost_due || null,
    firstSeen: toIso(row.first_seen),
    lastSeen: toIso(row.last_seen),
    sourceHttpStatus: Number.isFinite(row.response_code) ? row.response_code : null,
    sourceBytes: Number.isFinite(row.source_size) ? row.source_size : null,
    externalLinksOnSource: Number.isFinite(row.external_link_num) ? row.external_link_num : null,
    internalLinksOnSource: Number.isFinite(row.internal_link_num) ? row.internal_link_num : null,
    sourceIp: row.ip || null,
    mobile: Boolean(row.mobile),
    sitewide: Boolean(row.sitewide),
    redirected: Boolean(row.redirect),
    canonical: Boolean(row.canonical)
  };
}

export function normalizeSem3ueCapture(options) {
  const sourceCapture = options.backlinksCapture || {};
  const backlinksCapture = Object.assign({}, sourceCapture, {
    responses: (sourceCapture.responses || []).map(function(response) {
      if (response.json) return response;
      let json = null;
      try { json = response.body ? JSON.parse(response.body) : null; } catch {}
      return Object.assign({}, response, { json: json });
    })
  });
  const visibleOverview = options.visibleOverview || {};
  const reportResponse = firstResponse(backlinksCapture, function(response) {
    return response.json && response.json.backlinks && Array.isArray(response.json.backlinks.data);
  });
  if (!reportResponse) throw new Error('Sem3ue backlink report response was not found');

  const ascoreResponse = firstResponse(backlinksCapture, function(response) { return /\/overview\/ascore(?:\?|$)/.test(response.url); });
  const countersResponse = firstResponse(backlinksCapture, function(response) { return /\/overview\/counters(?:\?|$)/.test(response.url); });
  const report = reportResponse.json.backlinks;
  const ascore = ascoreResponse && ascoreResponse.json.data || {};
  const counters = countersResponse && countersResponse.json.data || {};
  const domain = normalizeDomain(report.target || options.domain);
  const page = Math.floor((Number(report.offset) || 0) / (Number(report.limit) || 100)) + 1;
  const records = report.data.map(normalizeBacklink);
  const total = Number(report.total_avail || report.total || records.length);
  const pageSize = Number(report.limit || records.length);

  const overview = {
    authorityScore: Number.isFinite(ascore.ascore) ? ascore.ascore : visibleOverview.authorityScore ?? null,
    authorityLabel: visibleOverview.authorityLabel || null,
    authorityLabelRaw: visibleOverview.authorityLabelRaw || visibleOverview.authorityLabel || null,
    authorityLabelAvailable: Boolean(visibleOverview.authorityLabelRaw || visibleOverview.authorityLabel),
    organicTraffic: visibleOverview.organicTraffic ?? null,
    paidTraffic: visibleOverview.paidTraffic ?? null,
    referringDomains: counters.domains ?? visibleOverview.referringDomains ?? null,
    organicKeywords: visibleOverview.organicKeywords ?? null,
    paidKeywords: visibleOverview.paidKeywords ?? null,
    backlinksDisplayed: visibleOverview.backlinksDisplayed ?? null,
    aiVisibility: visibleOverview.aiVisibility ?? null,
    aiMentions: visibleOverview.aiMentions ?? null,
    aiCitedPages: visibleOverview.aiCitedPages ?? null
  };
  const qualification = evaluateAuthority(overview);

  return {
    version: '1.0',
    provider: 'semrush-via-3ue',
    domain: domain,
    normalizedDomain: domain,
    scope: 'domain',
    queriedAt: backlinksCapture.capturedAt || new Date().toISOString(),
    sourcePages: {
      overview: 'https://sem.3ue.co/analytics/overview/?q=' + encodeURIComponent(domain),
      backlinks: 'https://sem.3ue.co/analytics/backlinks/backlinks/?q=' + encodeURIComponent(domain) + '&searchType=domain&ba_rpp=blog&page=' + page
    },
    overview: overview,
    qualification: qualification,
    backlinkSummary: {
      total: counters.total ?? null,
      referringDomains: counters.domains ?? null,
      referringIps: counters.ip ?? null,
      referringClassC: counters.ipclassc ?? null,
      follow: counters.follow ?? null,
      nofollow: counters.nofollow ?? null,
      sponsored: counters.sponsored ?? null,
      ugc: counters.ugc ?? null,
      text: counters.text ?? null,
      image: counters.image ?? null,
      links: counters.links ?? null,
      blogFilteredTotal: total
    },
    backlinks: records,
    pagination: {
      page: page,
      pageSize: pageSize,
      returned: records.length,
      total: total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total
    },
    queryLedger: {
      queryKey: queryKey({ provider: 'semrush-via-3ue', domain: domain, scope: 'domain', entry: 'overview', page: page }),
      normalizedDomain: domain,
      provider: 'semrush-via-3ue',
      checkedAt: backlinksCapture.capturedAt || new Date().toISOString(),
      entry: 'overview+blog_backlinks',
      cacheable: true
    },
    requestFingerprints: (backlinksCapture.responses || []).filter(function(response) {
      return response.json && (/\/analytics\/backlinks\/webapi2\//.test(response.url) || /\/analytics\/backlinks\/webapi2\?/.test(response.url));
    }).map(stableFingerprint).filter(Boolean),
    dataQuality: {
      responseStatus: reportResponse.json.status || null,
      limited: Boolean(reportResponse.json.is_limited),
      expectedOnPage: Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)),
      returnedOnPage: records.length,
      completePage: records.length === Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))
    },
    manualRequired: false
  };
}

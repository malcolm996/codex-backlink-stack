import { normalizeDomain } from './domain.js';

function asArray(value) { return Array.isArray(value) ? value : []; }

function pageKey(page, index) {
  return String(page.source_url || page.sourceUrl || page.url || page.sourceDomain || 'page-' + index);
}

function analysisLinks(page) {
  const analysis = page.comment_analysis || page.commentAnalysis || page.analysis || page;
  return asArray(analysis.comment && analysis.comment.links || analysis.links);
}

export function aggregateExpansionDomains(candidatePages = [], options = {}) {
  const minCandidatePages = Math.max(1, Number(options.minCandidatePages || 2));
  const excluded = new Set(asArray(options.excludeDomains).map(normalizeDomain).filter(Boolean));
  const map = new Map();
  asArray(candidatePages).forEach(function(page, index) {
    const pageId = pageKey(page, index);
    const seenOnPage = new Set();
    for (const link of analysisLinks(page)) {
      const domain = normalizeDomain(link.domain || link.href || '');
      if (!domain || excluded.has(domain)) continue;
      const record = map.get(domain) || {
        source_domain: domain,
        occurrence_count: 0,
        candidate_page_count: 0,
        candidate_pages: [],
        sample_urls: [],
        first_discovered_at: null,
        last_seen_at: null
      };
      record.occurrence_count += 1;
      if (!seenOnPage.has(domain)) {
        seenOnPage.add(domain);
        record.candidate_page_count += 1;
        record.candidate_pages.push(pageId);
      }
      if (link.href && record.sample_urls.length < 10 && !record.sample_urls.includes(link.href)) record.sample_urls.push(link.href);
      const foundAt = page.checkedAt || page.checked_at || null;
      if (foundAt && (!record.first_discovered_at || foundAt < record.first_discovered_at)) record.first_discovered_at = foundAt;
      if (foundAt && (!record.last_seen_at || foundAt > record.last_seen_at)) record.last_seen_at = foundAt;
      map.set(domain, record);
    }
  });
  return Array.from(map.values()).filter(item => item.candidate_page_count >= minCandidatePages)
    .sort((a, b) => b.candidate_page_count - a.candidate_page_count || b.occurrence_count - a.occurrence_count)
    .map(item => Object.assign(item, { eligible_for_expansion: true }));
}

function semrushTotal(metrics) {
  return Number(metrics && (metrics.backlinkSummary && metrics.backlinkSummary.total || metrics.backlinkSummary && metrics.backlinkSummary.blogFilteredTotal || metrics.total)) || 0;
}

export function enrichExpansionDomains(domains, semrushByDomain = {}, options = {}) {
  const minAs = options.minAuthorityScore == null ? null : Number(options.minAuthorityScore);
  const minTraffic = options.minOrganicTraffic == null ? null : Number(options.minOrganicTraffic);
  return asArray(domains).map(function(item) {
    const metrics = semrushByDomain[item.source_domain] || semrushByDomain[normalizeDomain(item.source_domain)] || null;
    const summary = metrics && metrics.backlinkSummary || {};
    const total = semrushTotal(metrics);
    const blog = Number(summary.blogFilteredTotal || (metrics.pagination && metrics.pagination.total)) || 0;
    const authorityScore = metrics && metrics.overview ? Number(metrics.overview.authorityScore) : null;
    const organicTraffic = metrics && metrics.overview ? Number(metrics.overview.organicTraffic) : null;
    const blogRatio = total > 0 ? blog / total : null;
    const passesFallback = (minAs == null || (Number.isFinite(authorityScore) && authorityScore >= minAs)) &&
      (minTraffic == null || (Number.isFinite(organicTraffic) && organicTraffic >= minTraffic));
    return Object.assign({}, item, {
      semrush_checked: Boolean(metrics),
      authority_score: Number.isFinite(authorityScore) ? authorityScore : null,
      organic_traffic: Number.isFinite(organicTraffic) ? organicTraffic : null,
      blog_backlinks: blog,
      backlink_total: total || null,
      blog_backlink_ratio: blogRatio,
      passes_fallback_filter: passesFallback
    });
  });
}


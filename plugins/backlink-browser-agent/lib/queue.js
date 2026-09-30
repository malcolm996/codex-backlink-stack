import { normalizeDomain } from './domain.js';

export const QUEUE_STATES = Object.freeze({
  PENDING: '待采',
  FETCHED: '已抓',
  HAS_FORM: '有表单',
  NO_FORM: '无表单',
  PUBLISHED: '已发',
  SKIPPED: '跳过'
});

const TRANSITIONS = new Map([
  [QUEUE_STATES.PENDING, new Set([QUEUE_STATES.FETCHED, QUEUE_STATES.SKIPPED])],
  [QUEUE_STATES.FETCHED, new Set([QUEUE_STATES.HAS_FORM, QUEUE_STATES.NO_FORM, QUEUE_STATES.SKIPPED])],
  [QUEUE_STATES.HAS_FORM, new Set([QUEUE_STATES.PUBLISHED, QUEUE_STATES.SKIPPED])],
  [QUEUE_STATES.NO_FORM, new Set([QUEUE_STATES.SKIPPED])],
  [QUEUE_STATES.PUBLISHED, new Set()],
  [QUEUE_STATES.SKIPPED, new Set()]
]);

function now() { return new Date().toISOString(); }

export function sourceUrlKey(value) {
  try {
    const url = new URL(String(value));
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.hostname = url.hostname.replace(/^www\./, '');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function cleanSourceUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

export function createQueueItem({ sourceUrl, discoveredFrom = null, discoveredAt = now(), sourceDomain = null, status = QUEUE_STATES.PENDING, ...rest } = {}) {
  const key = sourceUrlKey(sourceUrl);
  if (!key) throw new Error('source_url_required');
  return Object.assign({
    queueId: key,
    source_url: cleanSourceUrl(sourceUrl),
    source_domain: normalizeDomain(sourceDomain || key),
    discovered_from: discoveredFrom,
    first_discovered_at: discoveredAt,
    last_checked_at: null,
    status,
    status_history: [{ status, at: discoveredAt, reason: 'created' }]
  }, rest);
}

export function canTransition(from, to) {
  return from === to || Boolean(TRANSITIONS.get(from) && TRANSITIONS.get(from).has(to));
}

export function transitionQueueItem(item, status, patch = {}) {
  if (!item || !item.source_url) throw new Error('queue_item_required');
  if (!Object.values(QUEUE_STATES).includes(status)) throw new Error('invalid_queue_state');
  const from = item.status || QUEUE_STATES.PENDING;
  if (!canTransition(from, status)) throw new Error('invalid_queue_transition:' + from + '->' + status);
  const at = patch.checkedAt || now();
  const next = Object.assign({}, item, patch, { status, last_checked_at: patch.last_checked_at || at });
  next.status_history = [...(Array.isArray(item.status_history) ? item.status_history : []), { status, at, reason: patch.reason || null }];
  return next;
}

export function applyCommentAnalysis(item, analysis) {
  const fetched = transitionQueueItem(item, QUEUE_STATES.FETCHED, {
    checkedAt: analysis && analysis.checkedAt,
    comment_analysis: analysis
  });
  return transitionQueueItem(fetched, analysis && analysis.comment && analysis.comment.hasCommentForm ? QUEUE_STATES.HAS_FORM : QUEUE_STATES.NO_FORM, {
    reason: analysis && analysis.comment && analysis.comment.hasCommentForm ? 'comment_form_found' : 'comment_form_not_found',
    comment_analysis: analysis
  });
}

export function markPublished(item, details = {}) {
  if (item && item.status === QUEUE_STATES.PUBLISHED) throw new Error('already_published');
  return transitionQueueItem(item, QUEUE_STATES.PUBLISHED, Object.assign({ reason: 'manual_submit_confirmed' }, details));
}

export function markSkipped(item, reason = 'manual_skip') {
  return transitionQueueItem(item, QUEUE_STATES.SKIPPED, { reason });
}

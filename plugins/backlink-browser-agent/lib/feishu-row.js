import { normalizeDomain } from './domain.js';
import { evaluateAuthority } from './qualification.js';

// Reader-facing Feishu headers are Chinese. Internal JSON keys remain stable.
export const FEISHU_PRODUCT_FIELDS = Object.freeze([
  '类型', '来源URL', '来源域名', '发现来源', '链接策略', '链接形式', '目标URL', '锚文本',
  '是否Dofollow', '首次发现时间', '最近发现时间', '来源页HTTP状态', '页面AS', '域名AS',
  'AS标签', 'AS查询状态', '评论容器', '评论表单', '评论数量', '最新评论时间',
  '带链接评论数', '链接位置', '建议填入位置', '需要验证码', '需要登录', '需要Google登录', '是否Noindex',
  '假链接信号', '综合评分', '评分等级', '是否可发', '跳过原因', '队列状态', '发链成功'
]);

export const FEISHU_ELIGIBLE_FIELDS = Object.freeze([
  '来源URL', '来源域名', '产品', '类型', '发现来源', '链接策略', '链接形式', '目标URL', '锚文本',
  '是否Dofollow', '首次发现时间', '最近发现时间', '来源页HTTP状态', '页面AS', '域名AS',
  'AS标签', 'AS查询状态', '评论容器', '评论表单', '评论数量', '最新评论时间',
  '带链接评论数', '链接位置', '建议填入位置', '需要验证码', '需要登录', '需要Google登录', '是否Noindex',
  '假链接信号', '综合评分', '评分等级', '是否可发', '跳过原因', '队列状态', '发链成功'
]);

// Published results are intentionally kept in a separate spreadsheet per product.
// Do not merge these fields into the discovery or qualification tables.
export const FEISHU_PUBLISHED_FIELDS = Object.freeze([
  '来源平台', '来源URL', '文章URL', '目标URL', '锚文本', '提交时间', '提交状态',
  '审核/公开页面URL', '实际rel属性', '回访时间', '回访是否发布成功', '回访证据URL', '备注'
]);

export const FEISHU_DEFAULT_FIELDS = FEISHU_PRODUCT_FIELDS;

function sourceAsLabel(item = {}) {
  return item.as_label || item.asLabel || item.source_authority_label || item.sourceAuthorityLabel || item.source_domain_as_label || null;
}

function sourceAsScore(item = {}) {
  const value = item.domainAuthorityScore ?? item.domain_authority_score ?? item.domainAs;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function pageAsScore(item = {}) {
  const value = item.pageAuthorityScore ?? item.page_authority_score ?? item.pageAs;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function analysisOf(item = {}) {
  return item.comment_analysis || item.commentAnalysis || item.commentAnalysisResult || {};
}

function isBlocked(analysis = {}) {
  const access = analysis.access || {};
  const decision = analysis.decision || {};
  return Boolean(decision.skip || access.requiresCaptcha || access.requiresLogin || access.requiresGoogleLogin);
}

function commentData(item) {
  const analysis = analysisOf(item);
  const comment = analysis.comment || {};
  const access = analysis.access || {};
  const indexing = analysis.indexing || {};
  const quality = analysis.linkQuality || {};
  const decision = analysis.decision || {};
  return { analysis, comment, access, indexing, quality, decision };
}

function valueOrNull(value) { return value === undefined || value === null || value === '' ? null : value; }

export function normalizeProductUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('product_url_required');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('product_url_required');
  url.hash = '';
  const normalized = url.toString();
  if (normalized.length > 255) throw new Error('product_url_too_long');
  return normalized;
}

function publishedValue(item, aliases, fallback = null) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(item || {}, alias) && item[alias] !== undefined && item[alias] !== '') return item[alias];
  }
  return fallback;
}

function normalizeVisitState(value) {
  if (value === true || value === '是' || value === 'yes' || value === 'published') return '是';
  if (value === false || value === '否' || value === 'no' || value === 'not_published') return '否';
  if (value === '待回访') return value;
  return '待回访';
}

export function publishedBacklinkKey(item = {}) {
  const value = publishedValue(item, ['来源URL', 'sourceUrl', 'source_url', 'url', '文章URL', 'articleUrl', 'article_url']);
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(value).trim().replace(/\/$/, '').toLowerCase();
  }
}

export function toPublishedBacklinkRow(item = {}, { productUrl = '' } = {}) {
  const normalizedProductUrl = productUrl ? normalizeProductUrl(productUrl) : null;
  const row = {
    '来源平台': publishedValue(item, ['来源平台', 'sourcePlatform', 'source_platform', 'platform', 'type']),
    '来源URL': publishedValue(item, ['来源URL', 'sourceUrl', 'source_url', 'url']),
    '文章URL': publishedValue(item, ['文章URL', 'articleUrl', 'article_url', 'sourceUrl', 'source_url']),
    '目标URL': publishedValue(item, ['目标URL', 'targetUrl', 'target_url'], normalizedProductUrl),
    '锚文本': publishedValue(item, ['锚文本', 'anchorText', 'anchor_text', 'anchor']),
    '提交时间': publishedValue(item, ['提交时间', 'submittedAt', 'submitted_at']),
    '提交状态': publishedValue(item, ['提交状态', 'submissionStatus', 'submission_status', 'status']),
    '审核/公开页面URL': publishedValue(item, ['审核/公开页面URL', 'evidenceUrl', 'evidence_url', 'publicUrl', 'public_url']),
    '实际rel属性': publishedValue(item, ['实际rel属性', 'relActual', 'rel_actual', 'rel']),
    '回访时间': publishedValue(item, ['回访时间', 'revisitAt', 'revisit_at']),
    '回访是否发布成功': normalizeVisitState(publishedValue(item, ['回访是否发布成功', 'revisitPublishedSuccess', 'revisit_published_success', 'publishedSuccess', 'published_success'], '待回访')),
    '回访证据URL': publishedValue(item, ['回访证据URL', 'revisitEvidenceUrl', 'revisit_evidence_url']),
    '备注': publishedValue(item, ['备注', 'notes', 'note'])
  };
  row.source_url = row['来源URL'];
  row.article_url = row['文章URL'];
  row.target_url = row['目标URL'];
  row.revisit_published_success = row['回访是否发布成功'];
  return row;
}

export function publishedRowValues(fields = FEISHU_PUBLISHED_FIELDS, items = [], options = {}) {
  return [fields, ...items.map(item => {
    const row = item && item['来源URL'] !== undefined && item['回访是否发布成功'] !== undefined
      ? item
      : toPublishedBacklinkRow(item, options);
    return fields.map(field => cell(row[field]));
  })];
}

function placementAdvice(value) {
  if (value === 'author') return '昵称/作者链接';
  if (value === 'content') return '评论正文';
  if (value === 'mixed') return '人工判断';
  return value ? '其他位置，人工判断' : '未发现可用位置';
}

export function toBacklinkRow(item = {}, metrics = {}, { product = '' } = {}) {
  const { analysis, comment, access, indexing, quality, decision } = commentData(item);
  const label = valueOrNull(sourceAsLabel(item));
  const authority = evaluateAuthority({ authorityLabel: label || '' });
  const sourceUrl = item.source_url || item.sourceUrl || item.url || null;
  const row = {
    '类型': Array.isArray(item.platform) ? item.platform[0] || null : item.type || item.platform || null,
    '来源URL': sourceUrl,
    '来源域名': normalizeDomain(item.source_domain || item.sourceDomain || sourceUrl || ''),
    '发现来源': item.discovered_from || item.discoveredFrom || metrics.sourcePages && metrics.sourcePages.backlinks || null,
    '链接策略': item.link_strategy || item.linkStrategy || item.placement || null,
    '链接形式': item.link_format || item.linkFormat || item.linkType || item.link_type || null,
    '目标URL': item.target_url || item.targetUrl || null,
    '锚文本': item.anchor_text || item.anchorText || item.anchor || null,
    '是否Dofollow': item.dofollow ?? item.follow ?? null,
    '首次发现时间': item.first_seen || item.firstSeen || null,
    '最近发现时间': item.last_seen || item.lastSeen || null,
    '来源页HTTP状态': item.source_http_status ?? item.sourceHttpStatus ?? null,
    '页面AS': pageAsScore(item),
    '域名AS': sourceAsScore(item),
    'AS标签': label,
    'AS查询状态': label ? (authority.spamLabelDetected ? '已确认spam' : '已确认非spam') : '待查询',
    '评论容器': comment.commentContainerFound ?? null,
    '评论表单': comment.hasCommentForm ?? null,
    '评论数量': comment.commentCount ?? null,
    '最新评论时间': comment.latestCommentAt || comment.latestCommentAtRaw || null,
    '带链接评论数': comment.commentsWithLinks ?? null,
    '链接位置': comment.linkPlacement || null,
    '建议填入位置': placementAdvice(comment.linkPlacement),
    '需要验证码': access.requiresCaptcha ?? null,
    '需要登录': access.requiresLogin ?? null,
    '需要Google登录': access.requiresGoogleLogin ?? null,
    '是否Noindex': indexing.noindex ?? null,
    '假链接信号': quality.suspected ?? null,
    '综合评分': decision.score ?? (analysis.scoring && analysis.scoring.score) ?? null,
    '评分等级': decision.grade ?? (analysis.scoring && analysis.scoring.grade) ?? null,
    '是否可发': isBlocked(analysis) ? '否' : decision.eligibleForManualReview === true ? '是' : '待判断',
    '跳过原因': Array.isArray(decision.reasons) ? decision.reasons.join('、') : null,
    '队列状态': item.queue_status || item.status || (label ? '待评估' : '待查AS'),
    '发链成功': item.published_success ?? item.publishedSuccess ?? '待回访'
  };
  // Stable internal aliases are retained for API consumers; they are not written
  // unless explicitly included in a fields array.
  row.source_url = row['来源URL'];
  row.source_domain = row['来源域名'];
  row.as_label = row['AS标签'];
  row.comment_analysis = analysisOf(item);
  row.authority_label_raw = row['AS标签'];
  row.authority_score = row['域名AS'];
  row.has_comment_form = row['评论表单'];
  row.comment_count = row['评论数量'];
  row.latest_comment_at = row['最新评论时间'];
  row.comments_with_links = row['带链接评论数'];
  row.link_placement = row['链接位置'];
  row.requires_captcha = row['需要验证码'];
  row.requires_login = row['需要登录'];
  row.requires_google_login = row['需要Google登录'];
  row.noindex = row['是否Noindex'];
  row.fake_link_signal = row['假链接信号'];
  row.composite_score = row['综合评分'];
  row.qualification_status = row['是否可发'];
  row.skip_reason = row['跳过原因'];
  if (product) row['产品'] = product;
  return row;
}

export function toFeishuRows(items = [], metrics = {}, options = {}) {
  return items.map(item => toBacklinkRow(item, metrics, options));
}

function cell(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

export function rowValues(fields = FEISHU_DEFAULT_FIELDS, items = [], metrics = {}, options = {}) {
  return [fields, ...toFeishuRows(items, metrics, options).map(row => fields.map(field => cell(row[field])))];
}

export function eligibleBacklinks(items = [], metrics = {}, options = {}) {
  return items.filter(item => {
    const { analysis, decision } = commentData(item);
    const label = sourceAsLabel(item);
    const authoritySafe = Boolean(label) && !evaluateAuthority({ authorityLabel: label }).spamLabelDetected;
    const hasPageAnalysis = Object.keys(analysis).length > 0;
    const pageSafe = !hasPageAnalysis || (!isBlocked(analysis) && decision.eligibleForManualReview === true);
    return authoritySafe && pageSafe;
  }).map(item => toBacklinkRow(item, metrics, options));
}

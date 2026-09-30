import { normalizeDomain } from './domain.js';

const HTTP_URL = /^https?:\/\//i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fieldKind(field) {
  if (field && (field.visible === false || field.disabled)) return null;
  const value = [field && field.name, field && field.id, field && field.placeholder, field && field.label]
    .map(cleanText).join(' ').toLowerCase();
  if (/e[-_ ]?mail|邮箱/.test(value) || String(field && field.type).toLowerCase() === 'email') return 'email';
  if (/website|web site|url|网址|网站|homepage|主页/.test(value) || String(field && field.type).toLowerCase() === 'url') return 'website';
  if (/author|name|昵称|姓名|名字/.test(value)) return 'name';
  if (/comment|留言|评论|message|内容/.test(value) || /textarea/i.test(String(field && field.tagName || ''))) return 'comment';
  return null;
}

export function isCommentForm(form = {}) {
  const kinds = new Set(asArray(form.fields).map(fieldKind).filter(Boolean));
  return kinds.has('name') && kinds.has('email') && kinds.has('website');
}

function normalizeLink(link, placement = null) {
  if (!link || !HTTP_URL.test(String(link.href || ''))) return null;
  let href = String(link.href);
  try {
    const url = new URL(href);
    url.hash = '';
    href = url.toString();
  } catch {}
  return {
    href,
    domain: normalizeDomain(href),
    text: cleanText(link.text),
    placement: link.placement || placement || 'unknown',
    rel: asArray(link.rel).map(String),
    nofollow: asArray(link.rel).some(value => /nofollow/i.test(value))
  };
}

function placementSummary(links) {
  const summary = { author: 0, content: 0, other: 0 };
  for (const link of links) {
    if (link.placement === 'author') summary.author += 1;
    else if (link.placement === 'content') summary.content += 1;
    else summary.other += 1;
  }
  const active = Object.entries(summary).filter(([, count]) => count > 0).map(([key]) => key);
  return {
    counts: summary,
    primary: active.length === 1 ? active[0] : active.length > 1 ? 'mixed' : null
  };
}

function detectLogin(forms, links, text) {
  const haystack = [text, ...asArray(forms).map(form => [form.action, form.text].join(' ')), ...asArray(links).map(link => link.text)]
    .join(' ').toLowerCase();
  return /登录|登陆|sign[ -]?in|log[ -]?in|members? only|仅限会员|账号/.test(haystack);
}

function detectGoogleLogin(forms, links, text) {
  const haystack = [text, ...asArray(forms).map(form => [form.action, form.text].join(' ')), ...asArray(links).map(link => [link.href, link.text].join(' '))]
    .join(' ').toLowerCase();
  return /accounts\.google\.com|google\s*(login|sign[ -]?in)|sign[ -]?in\s+with\s+google|continue\s+with\s+google|使用 google|谷歌登录/.test(haystack);
}

function detectCaptcha(forms, links, text, snapshot) {
  const providers = new Set(asArray(snapshot.captchaMarkers).map(value => String(value).toLowerCase()));
  const haystack = [text, snapshot.captchaText, ...asArray(forms).map(form => [form.text, form.className].join(' ')), ...asArray(links).map(link => link.href)]
    .join(' ').toLowerCase();
  if (/recaptcha|g-recaptcha/.test(haystack)) providers.add('recaptcha');
  if (/hcaptcha/.test(haystack)) providers.add('hcaptcha');
  if (/turnstile|cf-chl-|cf[-_ ]?challenge|cloudflare challenge/.test(haystack)) providers.add('turnstile');
  if (/captcha|验证码/.test(haystack) && !providers.size) providers.add('unknown');
  return { detected: providers.size > 0, providers: Array.from(providers) };
}

function recencyScore(latestCommentAt, checkedAt) {
  if (!latestCommentAt) return 0;
  const checked = parseDate(checkedAt) || new Date().toISOString();
  const days = Math.max(0, (Date.parse(checked) - Date.parse(latestCommentAt)) / 86400000);
  if (days <= 30) return 12;
  if (days <= 90) return 8;
  if (days <= 180) return 4;
  return 0;
}

function scoreReport({ hasCommentForm, submissionAvailable, commentCount, commentsWithLinks, latestCommentAt, checkedAt, captcha, requiresLogin, requiresGoogleLogin, noindex, fakeLinkSignals }) {
  const requiredPass = hasCommentForm && submissionAvailable;
  const volume = Math.min(20, Math.max(0, Number(commentCount) || 0) * 2);
  const linkEvidence = commentsWithLinks >= 3 ? 35 : commentsWithLinks > 0 ? 12 : 0;
  const penalties = (captcha.detected ? 60 : 0) + (requiresLogin ? 60 : 0) +
    (requiresGoogleLogin ? 60 : 0) + (noindex ? 20 : 0) + (fakeLinkSignals.suspected ? 15 : 0);
  const score = requiredPass ? Math.max(0, Math.min(100, 33 + volume + recencyScore(latestCommentAt, checkedAt) + linkEvidence - penalties)) : 0;
  const blockingReasons = [
    !requiredPass && 'comment_form_required',
    captcha.detected && 'captcha_detected',
    requiresLogin && 'login_required',
    requiresGoogleLogin && 'google_login_required'
  ].filter(Boolean);
  return {
    requiredPass,
    score,
    grade: score >= 75 ? '高' : score >= 50 ? '中' : score > 0 ? '低' : '跳过',
    volumeScore: volume,
    recencyScore: recencyScore(latestCommentAt, checkedAt),
    linkEvidenceScore: linkEvidence,
    penalty: penalties,
    status: blockingReasons.length ? 'skip' : 'review',
    blockingReasons
  };
}

export function analyzeCommentSnapshot(snapshot = {}, options = {}) {
  const forms = asArray(snapshot.forms);
  const rawComments = asArray(snapshot.comments);
  const allComments = rawComments.map((comment, index) => {
    const links = asArray(comment.links).map(link => normalizeLink(link)).filter(Boolean);
    const publishedAtRaw = comment.publishedAt || comment.date || comment.datetime || null;
    return Object.assign({}, comment, {
      index: index + 1,
      text: cleanText(comment.text),
      links,
      publishedAtRaw,
      publishedAt: parseDate(publishedAtRaw)
    });
  });
  const commentLinks = allComments.flatMap(comment => comment.links);
  const linkPlacements = placementSummary(commentLinks);
  const latestDates = allComments.map(comment => comment.publishedAt).filter(Boolean).sort();
  const latestCommentAt = latestDates.length ? latestDates[latestDates.length - 1] : null;
  const latestRawComment = allComments.filter(comment => comment.publishedAt).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)).at(-1);
  const commentForm = forms.find(isCommentForm) || null;
  const captcha = detectCaptcha(forms, snapshot.links, snapshot.text, snapshot);
  const requiresLogin = Boolean(snapshot.requiresLogin) || detectLogin(forms, snapshot.links, snapshot.text);
  const requiresGoogleLogin = Boolean(snapshot.requiresGoogleLogin) || detectGoogleLogin(forms, snapshot.links, snapshot.text);
  const robots = [snapshot.robots, ...asArray(snapshot.metaRobots)].filter(Boolean).join(' ');
  const noindex = Boolean(snapshot.noindex) || /\bnoindex\b/i.test(robots);
  const javascriptLinkCount = Number(snapshot.javascriptLinkCount) || 0;
  const redirectCount = Number(snapshot.redirectCount) || 0;
  const fakeLinkSignals = {
    javascriptLinkCount,
    redirectCount,
    suspected: javascriptLinkCount > 0 || redirectCount > 0 || Boolean(snapshot.suspectedFakeLinks)
  };
  const hasCommentForm = Boolean(commentForm);
  const submissionAvailable = Boolean(commentForm && asArray(commentForm.submitControls).length > 0);
  const commentsWithLinks = allComments.filter(comment => comment.links.length > 0).length;
  const status = hasCommentForm ? 'has_form' : 'no_form';
  const commentContainerFound = rawComments.length > 0 || Boolean(snapshot.commentContainerFound);
  const scoring = scoreReport({ hasCommentForm, submissionAvailable, commentCount: allComments.length, commentsWithLinks,
    latestCommentAt, checkedAt: snapshot.checkedAt, captcha, requiresLogin, requiresGoogleLogin, noindex, fakeLinkSignals });
  return {
    version: '1.0',
    sourceUrl: snapshot.sourceUrl || snapshot.url || null,
    sourceDomain: normalizeDomain(snapshot.sourceUrl || snapshot.url || ''),
    checkedAt: snapshot.checkedAt || new Date().toISOString(),
    title: cleanText(snapshot.title),
    comment: {
      commentContainerFound,
      hasCommentForm,
      status,
      formSelector: commentForm && commentForm.selector || null,
      formFields: commentForm ? Array.from(new Set(asArray(commentForm.fields).map(fieldKind).filter(Boolean))) : [],
      submissionAvailable,
      commentCount: allComments.length,
      latestCommentAt,
      latestCommentAtRaw: latestRawComment && latestRawComment.publishedAtRaw || null,
      commentsWithLinks,
      atLeastThreeCommentsWithLinks: commentsWithLinks >= 3,
      commentsWithThreeOrMoreLinksInOneComment: allComments.filter(comment => comment.links.length >= 3).length,
      linksCount: commentLinks.length,
      linkPlacement: linkPlacements.primary,
      linkPlacementCounts: linkPlacements.counts,
      links: commentLinks,
      comments: allComments.map(comment => ({
        index: comment.index,
        publishedAt: comment.publishedAt,
        publishedAtRaw: comment.publishedAtRaw,
        links: comment.links
      }))
    },
    access: {
      requiresCaptcha: captcha.detected,
      captchaProviders: captcha.providers,
      requiresLogin,
      requiresGoogleLogin
    },
    indexing: { noindex },
    siteAcceptance: {
      status: 'unknown',
      reason: 'requires comparison with the submitted site or offer profile',
      evidence: asArray(snapshot.acceptanceEvidence)
    },
    linkQuality: fakeLinkSignals,
    decision: {
      status: scoring.status,
      eligibleForManualReview: scoring.status === 'review' && scoring.score > 0 && !noindex,
      skip: scoring.status === 'skip',
      score: scoring.score,
      grade: scoring.grade,
      scoring,
      reasons: [
        !hasCommentForm && 'comment_form_not_found',
        hasCommentForm && !submissionAvailable && 'submit_control_not_found',
        captcha.detected && 'captcha_detected',
        requiresLogin && 'login_required',
        requiresGoogleLogin && 'google_login_required',
        noindex && 'noindex_detected',
        fakeLinkSignals.suspected && 'redirect_or_javascript_link_signal'
      ].filter(Boolean)
    },
    scoring
  };
}

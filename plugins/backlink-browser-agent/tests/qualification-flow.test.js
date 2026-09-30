import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeCommentSnapshot } from '../lib/comment-analysis.js';
import { aggregateExpansionDomains, enrichExpansionDomains } from '../lib/expansion.js';
import { applyCommentAnalysis, createQueueItem, markPublished, QUEUE_STATES } from '../lib/queue.js';
import { QueryLedger } from '../lib/query-ledger.js';
import { evaluateAuthority } from '../lib/qualification.js';

test('comment analysis requires a real name/email/website form and records link placement', function() {
  const report = analyzeCommentSnapshot({
    sourceUrl: 'https://example.com/article',
    metaRobots: ['index, follow'],
    forms: [{ selector: '#commentform', submitControls: [{ text: 'Post comment' }], fields: [
      { name: 'author', type: 'text' },
      { name: 'email', type: 'email' },
      { name: 'url', type: 'url' },
      { tagName: 'textarea', name: 'comment' }
    ] }],
    comments: [
      { publishedAt: '2026-09-01T00:00:00Z', links: [{ href: 'https://one.example/', placement: 'author' }] },
      { publishedAt: '2026-09-02T00:00:00Z', links: [{ href: 'https://two.example/', placement: 'content' }] },
      { publishedAt: '2026-09-03T00:00:00Z', links: [{ href: 'https://three.example/', placement: 'content' }] }
    ],
    links: []
  });
  assert.equal(report.comment.hasCommentForm, true);
  assert.equal(report.comment.submissionAvailable, true);
  assert.equal(report.comment.commentCount, 3);
  assert.equal(report.comment.commentsWithLinks, 3);
  assert.equal(report.comment.atLeastThreeCommentsWithLinks, true);
  assert.equal(report.comment.latestCommentAt, '2026-09-03T00:00:00.000Z');
  assert.equal(report.comment.linkPlacement, 'mixed');
  assert.equal(report.comment.linkPlacementCounts.author, 1);
  assert.equal(report.comment.linkPlacementCounts.content, 2);
  assert.equal(report.decision.eligibleForManualReview, true);
  assert.equal(report.decision.status, 'review');
  assert.equal(report.scoring.score > 0, true);
});

test('missing form is a hard skip and captcha/login are hard penalties', function() {
  const noForm = analyzeCommentSnapshot({ sourceUrl: 'https://example.com/no-form', comments: [] });
  assert.equal(noForm.decision.status, 'skip');
  assert.equal(noForm.decision.skip, true);
  assert.equal(noForm.scoring.score, 0);

  const blocked = analyzeCommentSnapshot({ sourceUrl: 'https://example.com/blocked', captchaMarkers: ['cloudflare_challenge'], text: 'Sign in with Google', forms: [{ fields: [
    { name: 'name' }, { name: 'email', type: 'email' }, { name: 'website', type: 'url' }
  ], submitControls: [{ text: 'Submit' }] }] });
  assert.equal(blocked.access.requiresCaptcha, true);
  assert.equal(blocked.access.requiresGoogleLogin, true);
  assert.equal(blocked.decision.status, 'skip');
  assert.equal(blocked.decision.eligibleForManualReview, false);
});

test('missing AS label requires manual review instead of being treated as safe', function() {
  const result = evaluateAuthority({ authorityScore: 37 });
  assert.equal(result.decision, 'manual_review_required');
  assert.equal(result.eligible, false);
  assert.equal(result.authorityLabelAvailable, false);
});

test('expansion only registers domains seen on at least two distinct candidate pages', function() {
  const pages = [
    { source_url: 'https://a.example/post', checkedAt: '2026-09-01T00:00:00Z', comment_analysis: { comment: { links: [
      { href: 'https://seed.example/u' }, { href: 'https://seed.example/u2' }, { href: 'https://one.example/' }
    ] } } },
    { source_url: 'https://b.example/post', checkedAt: '2026-09-02T00:00:00Z', comment_analysis: { comment: { links: [
      { href: 'https://seed.example/other' }, { href: 'https://two.example/' }
    ] } } }
  ];
  const result = aggregateExpansionDomains(pages);
  assert.deepEqual(result.map(item => item.source_domain), ['seed.example']);
  const enriched = enrichExpansionDomains(result, {
    'seed.example': { overview: { authorityScore: 42, organicTraffic: 1000 }, backlinkSummary: { total: 100, blogFilteredTotal: 30 } }
  }, { minAuthorityScore: 30, minOrganicTraffic: 500 });
  assert.equal(enriched[0].candidate_page_count, 2);
  assert.equal(enriched[0].blog_backlink_ratio, 0.3);
  assert.equal(enriched[0].passes_fallback_filter, true);
});

test('queue state machine prevents duplicate publication and ledger enforces daily overview limit', function() {
  const item = createQueueItem({ sourceUrl: 'https://www.example.com/post' });
  const analysis = analyzeCommentSnapshot({ sourceUrl: item.source_url, forms: [{ submitControls: [{ text: 'Submit' }], fields: [{ name: 'name' }, { name: 'email' }, { name: 'website' }] }], comments: [] });
  const ready = applyCommentAnalysis(item, analysis);
  assert.equal(ready.status, QUEUE_STATES.HAS_FORM);
  const published = markPublished(ready, { submittedAt: '2026-09-28T00:00:00Z' });
  assert.equal(published.status, QUEUE_STATES.PUBLISHED);
  assert.throws(() => markPublished(published), /already_published/);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bba-ledger-')), 'ledger.json');
  const ledger = new QueryLedger(file, { dailyOverviewLimit: 2 });
  const query = { provider: 'semrush-via-3ue', domain: 'WWW.Example.com/path', entry: 'overview', page: 1 };
  assert.equal(ledger.check(query).cacheHit, false);
  ledger.record(query, { authorityScore: 1 }, new Date('2026-09-28T01:00:00Z'));
  assert.equal(ledger.check(query, new Date('2026-09-28T02:00:00Z')).cacheHit, true);
  ledger.record({ provider: query.provider, domain: 'second.example', entry: 'overview', page: 1 }, { authorityScore: 2 }, new Date('2026-09-28T03:00:00Z'));
  assert.equal(ledger.check({ provider: query.provider, domain: 'third.example', entry: 'overview', page: 1 }, new Date('2026-09-28T04:00:00Z')).allowed, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSem3ueCapture } from '../lib/sem3ue-normalizer.js';

test('normalizes a minimal blog backlink response without secrets', function() {
  const backlinksCapture = {
    capturedAt: '2026-09-30T00:00:00Z',
    responses: [
      { url: 'https://sem.3ue.co/analytics/backlinks/webapi2/?action=report&key=redacted', json: {
        status: 'SUCCESS',
        backlinks: { target: 'example.com', total: 1, total_avail: 1, limit: 100, offset: 0, data: [
          { source_url: 'https://source.example/post', source_title: 'Example', target_url: 'https://example.com/', anchor: 'Example', platform: ['blog'], position: 'content', nofollow: false, text: true, response_code: 200 }
        ] }
      } },
      { url: 'https://sem.3ue.co/analytics/backlinks/webapi2/overview/ascore?key=redacted', json: { status: 'SUCCESS', data: { ascore: 20 } } },
      { url: 'https://sem.3ue.co/analytics/backlinks/webapi2/overview/counters?key=redacted', json: { status: 'SUCCESS', data: { total: 1, domains: 1, follow: 1 } } }
    ]
  };
  const visibleOverview = { organicTraffic: 1234, authorityLabelRaw: 'Good' };
  const result = normalizeSem3ueCapture({ backlinksCapture: backlinksCapture, visibleOverview: visibleOverview });

  assert.equal(result.domain, 'example.com');
  assert.equal(result.overview.authorityScore, 20);
  assert.equal(result.overview.organicTraffic, 1234);
  assert.equal(result.backlinkSummary.total, 1);
  assert.equal(result.pagination.total, 1);
  assert.equal(result.pagination.returned, 1);
  assert.equal(result.dataQuality.completePage, true);
  assert.equal(result.backlinks[0].sourceDomain, 'source.example');
  assert.equal(result.backlinks[0].follow, true);
  assert.equal(result.backlinks[0].platform[0], 'blog');
  assert.equal(JSON.stringify(result).includes('__gmitm'), false);
  assert.equal(JSON.stringify(result).includes('key='), false);
});

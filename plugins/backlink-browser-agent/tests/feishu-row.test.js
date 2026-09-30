import test from 'node:test';
import assert from 'node:assert/strict';
import { FEISHU_PRODUCT_FIELDS, FEISHU_PUBLISHED_FIELDS, eligibleBacklinks, publishedBacklinkKey, publishedRowValues, rowValues, toBacklinkRow, toPublishedBacklinkRow } from '../lib/feishu-row.js';

test('product rows keep useful reference fields and mark missing source AS for review', function() {
  const row = toBacklinkRow({
    platform: ['blog'],
    sourceUrl: 'https://www.example.com/post',
    sourceDomain: 'www.example.com',
    targetUrl: 'https://aireel.net/',
    anchorText: 'AIReel',
    follow: true,
    pageAuthorityScore: 22,
    domainAuthorityScore: 31,
    firstSeen: '2026-09-01T00:00:00Z',
    sourceHttpStatus: 200
  }, { sourcePages: { backlinks: 'https://sem.3ue.co/backlinks' } });
  assert.equal(row.source_domain, 'example.com');
  assert.equal(row['AS查询状态'], '待查询');
  assert.equal(row['队列状态'], '待查AS');
  assert.equal(row['发链成功'], '待回访');
  assert.equal(row['发现来源'], 'https://sem.3ue.co/backlinks');
  assert.equal(row['建议填入位置'], '未发现可用位置');
  assert.equal(rowValues(FEISHU_PRODUCT_FIELDS, [{ sourceUrl: row.source_url }])[0].includes('AS标签'), true);
});

test('only explicit non-spam AS labels are promoted to the eligible table', function() {
  const items = [
    { sourceUrl: 'https://safe.example/post', sourceDomain: 'safe.example', asLabel: '非常良好' },
    { sourceUrl: 'https://spam.example/post', sourceDomain: 'spam.example', asLabel: 'spam' },
    { sourceUrl: 'https://unknown.example/post', sourceDomain: 'unknown.example' }
  ];
  const eligible = eligibleBacklinks(items, {}, { product: 'aireel' });
  assert.deepEqual(eligible.map(row => row.source_domain), ['safe.example']);
  assert.equal(eligible[0]['AS查询状态'], '已确认非spam');
});

test('published rows default to revisit pending and normalize a stable source key', function() {
  const row = toPublishedBacklinkRow({
    sourceUrl: 'https://SOURCE.example/post/#comment-1',
    targetUrl: 'https://example.com/tool',
    status: 'pending_review'
  }, { productUrl: 'https://example.com' });
  assert.equal(row['来源URL'], 'https://SOURCE.example/post/#comment-1');
  assert.equal(row['目标URL'], 'https://example.com/tool');
  assert.equal(row['回访是否发布成功'], '待回访');
  assert.equal(publishedBacklinkKey(row), 'https://source.example/post');
  assert.equal(publishedRowValues(FEISHU_PUBLISHED_FIELDS, [row]).length, 2);
});

test('published revisit states accept explicit yes and no values', function() {
  assert.equal(toPublishedBacklinkRow({ sourceUrl: 'https://a.example', publishedSuccess: true })['回访是否发布成功'], '是');
  assert.equal(toPublishedBacklinkRow({ sourceUrl: 'https://b.example', revisitPublishedSuccess: false })['回访是否发布成功'], '否');
});

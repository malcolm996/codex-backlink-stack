import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgentServer } from '../bridge/server.js';

test('health and task lifecycle', async function(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-test-'));
  const token = 'test-token';
  const runtime = await createAgentServer({ config: { token: token, leaseSeconds: 2 }, dataDir: dataDir, host: '127.0.0.1', port: 0 });
  t.after(function() { return new Promise(function(resolve) { runtime.server.close(resolve); }); });
  const base = 'http://127.0.0.1:' + runtime.address.port;
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };

  const health = await fetch(base + '/health').then(function(response) { return response.json(); });
  assert.equal(health.ok, true);

  const created = await fetch(base + '/v1/tasks', {
    method: 'POST', headers: headers, body: JSON.stringify({ version: '1.0', type: 'demo', provider: 'test', input: { domain: 'example.com' } })
  }).then(function(response) { return response.json(); });
  assert.equal(created.status, 'queued');

  const leased = await fetch(base + '/v1/tasks/next', { headers: headers }).then(function(response) { return response.json(); });
  assert.equal(leased.taskId, created.taskId);
  assert.equal(leased.status, 'leased');

  await fetch(base + '/v1/tasks/' + created.taskId + '/events', { method: 'POST', headers: headers, body: JSON.stringify({ type: 'task.started', status: 'running' }) });
  await fetch(base + '/v1/tasks/' + created.taskId + '/result', { method: 'POST', headers: headers, body: JSON.stringify({ version: '1.0', status: 'completed', provider: 'test', records: [] }) });

  const finished = await fetch(base + '/v1/tasks/' + created.taskId, { headers: headers }).then(function(response) { return response.json(); });
  assert.equal(finished.status, 'completed');
  assert.equal(finished.result.records.length, 0);
});

test('semrush result is normalized and secrets are omitted', async function(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-sem3ue-test-'));
  const token = 'test-token';
  const runtime = await createAgentServer({ config: { token: token, leaseSeconds: 2 }, dataDir: dataDir, host: '127.0.0.1', port: 0 });
  t.after(function() { return new Promise(function(resolve) { runtime.server.close(resolve); }); });
  const base = 'http://127.0.0.1:' + runtime.address.port;
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  const created = await fetch(base + '/v1/tasks', {
    method: 'POST', headers: headers,
    body: JSON.stringify({ version: '1.0', type: 'domain.backlink_metrics.collect', provider: 'semrush-via-3ue', input: { domain: 'example.com' } })
  }).then(function(response) { return response.json(); });
  await fetch(base + '/v1/tasks/next', { headers: headers });
  const row = {
    response_code: 200, page_ascore: 10, domain_ascore: 20, first_seen: 1700000000, last_seen: 1700000100,
    source_url: 'https://source.example/post', source_title: 'Example', target_url: 'https://example.com/',
    anchor: 'Example', platform: ['blog'], position: 'content', nofollow: false, text: true
  };
  const captures = [
    { url: 'https://sem.3ue.co/analytics/backlinks/webapi2/?action=report&key=secret&__gmitm=secret', body: JSON.stringify({ status: 'SUCCESS', backlinks: { target: 'example.com', total: 1, total_avail: 1, limit: 100, offset: 0, data: [row] } }) },
    { url: 'https://sem.3ue.co/analytics/backlinks/webapi2/overview/ascore?key=secret&__gmitm=secret', body: JSON.stringify({ status: 'SUCCESS', data: { ascore: 20 } }) },
    { url: 'https://sem.3ue.co/analytics/backlinks/webapi2/overview/counters?key=secret&__gmitm=secret', body: JSON.stringify({ status: 'SUCCESS', data: { total: 1, domains: 1, follow: 1 } }) }
  ];
  await fetch(base + '/v1/tasks/' + created.taskId + '/result', {
    method: 'POST', headers: headers,
    body: JSON.stringify({ version: '1.0', status: 'completed', provider: 'semrush-via-3ue', sourceUrl: 'https://sem.3ue.co/analytics/overview/?__gmitm=secret', domain: 'example.com', captures: captures })
  });
  const finished = await fetch(base + '/v1/tasks/' + created.taskId, { headers: headers }).then(function(response) { return response.json(); });
  const text = JSON.stringify(finished.result);
  assert.equal(finished.result.backlinks.length, 1);
  assert.equal(finished.result.overview.authorityScore, 20);
  assert.equal(finished.result.rawCapturesOmitted, true);
  assert.equal(text.includes('__gmitm'), false);
  assert.equal(text.includes('key='), false);
});

test('Semrush overview task admission reserves daily quota and returns cached normalized result', async function(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-quota-test-'));
  const token = 'test-token';
  const runtime = await createAgentServer({ config: { token, dailyOverviewLimit: 1 }, dataDir, host: '127.0.0.1', port: 0 });
  t.after(function() { return new Promise(function(resolve) { runtime.server.close(resolve); }); });
  const base = 'http://127.0.0.1:' + runtime.address.port;
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  const task = function(domain) {
    return { version: '1.0', type: 'domain.backlink_metrics.collect', provider: 'semrush-via-3ue', input: { domain, scope: 'domain', page: 1 } };
  };

  const firstResponse = await fetch(base + '/v1/tasks', { method: 'POST', headers, body: JSON.stringify(task('https://WWW.Example.com/path')) });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  assert.equal(first.status, 'queued');
  assert.equal(first.input.domain, 'https://WWW.Example.com/path');

  const duplicate = await fetch(base + '/v1/tasks', { method: 'POST', headers, body: JSON.stringify(task('example.com')) });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, 'query_in_progress');

  const otherDomain = await fetch(base + '/v1/tasks', { method: 'POST', headers, body: JSON.stringify(task('other.example')) });
  assert.equal(otherDomain.status, 429);
  assert.equal((await otherDomain.json()).error, 'daily_overview_limit_reached');

  const recorded = await fetch(base + '/v1/query-ledger/record', {
    method: 'POST', headers,
    body: JSON.stringify({ provider: 'semrush-via-3ue', domain: 'www.example.com', scope: 'domain', entry: 'overview', result: {
      provider: 'semrush-via-3ue', domain: 'example.com', normalizedDomain: 'example.com', status: 'completed',
      overview: { authorityScore: 40, authorityLabelRaw: 'Very good' }, records: []
    } })
  });
  assert.equal(recorded.status, 201);
  const cachedResponse = await fetch(base + '/v1/tasks', { method: 'POST', headers, body: JSON.stringify(task('https://example.com/another/path')) });
  assert.equal(cachedResponse.status, 200);
  const cached = await cachedResponse.json();
  assert.equal(cached.status, 'completed');
  assert.equal(cached.result.cacheHit, true);
  assert.equal(cached.result.normalizedDomain, 'example.com');
  assert.equal(cached.result.overview.authorityLabelRaw, 'Very good');
});

test('comment analysis and backlink import keep spam rejection and source URL dedupe', async function(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-queue-test-'));
  const token = 'test-token';
  const runtime = await createAgentServer({ config: { token }, dataDir, host: '127.0.0.1', port: 0 });
  t.after(function() { return new Promise(function(resolve) { runtime.server.close(resolve); }); });
  const base = 'http://127.0.0.1:' + runtime.address.port;
  const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
  const analysis = await fetch(base + '/v1/analyze/comment-page', {
    method: 'POST', headers,
    body: JSON.stringify({ sourceUrl: 'https://example.com/post', forms: [{ submitControls: [{ text: 'Submit' }], fields: [
      { name: 'author' }, { name: 'email' }, { name: 'website' }
    ] }], comments: [] })
  }).then(response => response.json());
  assert.equal(analysis.comment.hasCommentForm, true);
  assert.equal(analysis.comment.submissionAvailable, true);

  const rejected = await fetch(base + '/v1/queue/import-backlinks', {
    method: 'POST', headers,
    body: JSON.stringify({ qualification: { spamLabelDetected: true }, backlinks: [{ sourceUrl: 'https://spam.example/post' }] })
  }).then(response => response.json());
  assert.equal(rejected.skipped, true);
  assert.equal(rejected.reason, 'authority_label_contains_spam_signal');

  const imported = await fetch(base + '/v1/queue/import-backlinks', {
    method: 'POST', headers,
    body: JSON.stringify({ qualification: { spamLabelDetected: false }, backlinks: [
      { sourceUrl: 'https://www.example.com/post', sourceDomain: 'www.example.com', follow: true },
      { sourceUrl: 'https://example.com/post', sourceDomain: 'example.com', follow: false }
    ] })
  }).then(response => response.json());
  assert.equal(imported.created.length, 1);
  assert.equal(imported.existing.length, 1);
  assert.equal(imported.created[0].source_domain, 'example.com');
});

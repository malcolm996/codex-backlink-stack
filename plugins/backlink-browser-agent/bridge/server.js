import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TaskStore } from './store.js';
import { normalizeSem3ueCapture } from '../lib/sem3ue-normalizer.js';
import { analyzeCommentSnapshot } from '../lib/comment-analysis.js';
import { aggregateExpansionDomains, enrichExpansionDomains } from '../lib/expansion.js';
import { toFeishuRows, rowValues, eligibleBacklinks, publishedRowValues, publishedBacklinkKey, normalizeProductUrl, FEISHU_DEFAULT_FIELDS, FEISHU_PRODUCT_FIELDS, FEISHU_ELIGIBLE_FIELDS, FEISHU_PUBLISHED_FIELDS } from '../lib/feishu-row.js';
import { FeishuClient } from '../lib/feishu-client.js';
import { QueryLedger } from '../lib/query-ledger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function columnName(number) {
  let value = Math.max(1, Number(number) || 1);
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function sheetItems(payload) {
  return Array.isArray(payload && payload.sheets) ? payload.sheets : Array.isArray(payload && payload.data) ? payload.data : [];
}

async function ensureSheet(feishu, spreadsheetToken, title, { renameDefault = true } = {}) {
  const listed = await feishu.listSheets(spreadsheetToken);
  const sheets = sheetItems(listed);
  const existing = sheets.find(sheet => String(sheet.title || sheet.name || '') === title);
  if (existing) return existing;
  const first = sheets[0];
  if (renameDefault && first && String(first.title || '') === 'Sheet1') {
    await feishu.updateSheet(spreadsheetToken, first.sheet_id, { title });
    return Object.assign({}, first, { title });
  }
  return feishu.createSheet(spreadsheetToken, { title });
}

function normalizeSpreadsheet(file) {
  return file ? {
    title: file.name || file.title,
    spreadsheet_token: file.token || file.spreadsheet_token,
    url: file.url,
    reused: true
  } : null;
}

function pageKey(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return String(value || '').trim().toLowerCase().replace(/\/$/, '');
  }
}

function attachCandidateAnalysis(result) {
  if (!result || !Array.isArray(result.candidatePages) || !Array.isArray(result.backlinks)) return result;
  const byUrl = new Map(result.candidatePages.map(page => [pageKey(page.sourceUrl || page.url), page.commentAnalysis || page.analysis || null]).filter(([, value]) => value));
  if (!byUrl.size) return result;
  return Object.assign({}, result, {
    backlinks: result.backlinks.map(item => {
      const analysis = byUrl.get(pageKey(item.sourceUrl || item.source_url));
      return analysis ? Object.assign({}, item, { commentAnalysis: analysis, comment_analysis: analysis }) : item;
    })
  });
}

async function ensureSpreadsheet(feishu, folderToken, title) {
  const existing = await feishu.findFileByName(title, { folderToken });
  return existing ? normalizeSpreadsheet(existing) : feishu.createSpreadsheet({ title, folderToken });
}

async function replaceSheetValues(feishu, spreadsheetToken, sheet, fields, values, { clearRows = 200 } = {}) {
  const sheetId = sheet.sheet_id || sheet.sheetId || sheet.title || sheet.name;
  const range = sheetId + '!A1:' + columnName(fields.length) + Math.max(values.length, 1);
  // The v2 batch-clear endpoint is not enabled for every tenant. A bounded
  // blank update gives the same replace semantics and removes old headers.
  const blankWidth = Math.max(fields.length, 26);
  const blankHeight = Math.max(values.length, Number(clearRows) || 200);
  const blankRow = Array(blankWidth).fill('');
  await feishu.updateValues(spreadsheetToken, sheetId + '!A1:' + columnName(blankWidth) + blankHeight,
    Array.from({ length: blankHeight }, () => blankRow.slice()));
  await feishu.updateValues(spreadsheetToken, range, values);
  return { range, rowsWritten: Math.max(0, values.length - 1) };
}

async function syncStructuredFeishu({ feishu, result, folderName = '自动化表格', candidateTitle = '外链候选队列', eligibleTitle = '外链表沉淀', product = '' }) {
  const folderResult = await feishu.ensureFolder(folderName, {});
  const folder = folderResult.folder || {};
  const folderToken = folder.token || folder.folder_token;
  const domain = result.normalizedDomain || result.domain || product || '';
  const productName = String(product || domain || '未命名产品').replace(/[\\/:*?\[\]]/g, '').slice(0, 100) || '未命名产品';
  const candidateSpreadsheet = await ensureSpreadsheet(feishu, folderToken, candidateTitle);
  const candidateToken = candidateSpreadsheet.spreadsheet_token || candidateSpreadsheet.token;
  const candidateSheet = await ensureSheet(feishu, candidateToken, productName);
  const candidateRows = rowValues(FEISHU_PRODUCT_FIELDS, result.backlinks, result, { product: productName });
  const candidateWrite = await replaceSheetValues(feishu, candidateToken, candidateSheet, FEISHU_PRODUCT_FIELDS, candidateRows);

  const eligibleSpreadsheet = await ensureSpreadsheet(feishu, folderToken, eligibleTitle);
  const eligibleToken = eligibleSpreadsheet.spreadsheet_token || eligibleSpreadsheet.token;
  const summarySheet = await ensureSheet(feishu, eligibleToken, '外链总表');
  const productSheet = await ensureSheet(feishu, eligibleToken, productName, { renameDefault: false });
  const eligible = eligibleBacklinks(result.backlinks, result, { product: productName });
  const summaryRows = [FEISHU_ELIGIBLE_FIELDS, ...eligible.map(row => FEISHU_ELIGIBLE_FIELDS.map(field => {
    const value = row[field];
    return value === true ? '是' : value === false ? '否' : value == null ? '' : Array.isArray(value) ? value.join(', ') : value;
  }))];
  const productRows = [FEISHU_PRODUCT_FIELDS, ...eligible.map(row => FEISHU_PRODUCT_FIELDS.map(field => {
    const value = row[field];
    return value === true ? '是' : value === false ? '否' : value == null ? '' : Array.isArray(value) ? value.join(', ') : value;
  }))];
  const summaryWrite = await replaceSheetValues(feishu, eligibleToken, summarySheet, FEISHU_ELIGIBLE_FIELDS, summaryRows);
  const productWrite = await replaceSheetValues(feishu, eligibleToken, productSheet, FEISHU_PRODUCT_FIELDS, productRows);
  return {
    folder: { name: folderName, token: folderToken, created: folderResult.created },
    candidateSpreadsheet,
    candidateSheet,
    candidateWrite,
    eligibleSpreadsheet,
    eligibleSheets: { summary: summarySheet, product: productSheet },
    eligibleWrite: summaryWrite,
    productEligibleWrite: productWrite,
    eligibleRows: eligible.length,
    candidateRows: result.backlinks.length
  };
}

function sheetValues(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && payload.valueRange && Array.isArray(payload.valueRange.values)) return payload.valueRange.values;
  if (payload && Array.isArray(payload.values)) return payload.values;
  return [];
}

const publishedFieldAliases = Object.freeze({
  '来源平台': ['来源平台', 'sourcePlatform', 'source_platform', 'platform', 'type'],
  '来源URL': ['来源URL', 'sourceUrl', 'source_url', 'url'],
  '文章URL': ['文章URL', 'articleUrl', 'article_url', 'sourceUrl', 'source_url'],
  '目标URL': ['目标URL', 'targetUrl', 'target_url'],
  '锚文本': ['锚文本', 'anchorText', 'anchor_text', 'anchor'],
  '提交时间': ['提交时间', 'submittedAt', 'submitted_at'],
  '提交状态': ['提交状态', 'submissionStatus', 'submission_status', 'status'],
  '审核/公开页面URL': ['审核/公开页面URL', 'evidenceUrl', 'evidence_url', 'publicUrl', 'public_url'],
  '实际rel属性': ['实际rel属性', 'relActual', 'rel_actual', 'rel'],
  '回访时间': ['回访时间', 'revisitAt', 'revisit_at'],
  '回访是否发布成功': ['回访是否发布成功', 'revisitPublishedSuccess', 'revisit_published_success', 'publishedSuccess', 'published_success'],
  '回访证据URL': ['回访证据URL', 'revisitEvidenceUrl', 'revisit_evidence_url'],
  '备注': ['备注', 'notes', 'note']
});

function hasPublishedField(item, field) {
  return (publishedFieldAliases[field] || []).some(alias => Object.prototype.hasOwnProperty.call(item || {}, alias));
}

function mergePublishedRow(existing, incoming, raw) {
  const merged = Object.assign({}, existing);
  for (const field of FEISHU_PUBLISHED_FIELDS) {
    if (hasPublishedField(raw, field)) merged[field] = incoming[field];
  }
  if (!merged['回访是否发布成功']) merged['回访是否发布成功'] = '待回访';
  return merged;
}

export async function syncPublishedBacklinksFeishu({ feishu, productUrl, records = [], folderName = '自动化表格', sheetTitle = '外链发布记录' }) {
  const normalizedProductUrl = normalizeProductUrl(productUrl);
  if (!Array.isArray(records)) throw new Error('published_records_required');
  const folderResult = await feishu.ensureFolder(folderName, {});
  const folder = folderResult.folder || {};
  const folderToken = folder.token || folder.folder_token;
  const spreadsheet = await ensureSpreadsheet(feishu, folderToken, normalizedProductUrl);
  const spreadsheetToken = spreadsheet.spreadsheet_token || spreadsheet.token;
  const sheet = await ensureSheet(feishu, spreadsheetToken, sheetTitle);
  const sheetId = sheet.sheet_id || sheet.sheetId || sheet.title || sheet.name;
  let existingValues = [];
  try {
    existingValues = sheetValues(await feishu.readValues(spreadsheetToken, sheetId + '!A1:' + columnName(FEISHU_PUBLISHED_FIELDS.length) + '5000'));
  } catch (error) {
    // A newly created sheet can be empty; only propagate non-empty read failures.
    if (!/not.?found|empty|range/i.test(String(error && error.message || ''))) throw error;
  }
  const headers = existingValues[0] && existingValues[0].length ? existingValues[0] : FEISHU_PUBLISHED_FIELDS;
  const headerIndexes = new Map(headers.map((header, index) => [String(header), index]));
  const existingRows = existingValues.slice(1).filter(row => Array.isArray(row) && row.some(value => value !== '' && value != null));
  const byKey = new Map();
  const normalizedRows = [];
  for (const row of existingRows) {
    const object = Object.fromEntries(FEISHU_PUBLISHED_FIELDS.map((field, index) => [field, row[headerIndexes.has(field) ? headerIndexes.get(field) : index] ?? '']));
    const key = publishedBacklinkKey(object);
    if (key) byKey.set(key, normalizedRows.length);
    normalizedRows.push(object);
  }
  let created = 0;
  let updated = 0;
  for (const raw of records) {
    const incoming = Object.assign({}, toPublishedRowForSync(raw, normalizedProductUrl));
    if (!incoming['来源URL']) throw new Error('published_source_url_required');
    const key = publishedBacklinkKey({ '来源URL': incoming['来源URL'] });
    const index = byKey.get(key);
    if (index === undefined) {
      normalizedRows.push(incoming);
      byKey.set(key, normalizedRows.length - 1);
      created += 1;
    } else {
      normalizedRows[index] = mergePublishedRow(normalizedRows[index], incoming, raw);
      updated += 1;
    }
  }
  const values = [FEISHU_PUBLISHED_FIELDS, ...normalizedRows.map(row => FEISHU_PUBLISHED_FIELDS.map(field => {
    const value = row[field];
    return value === true ? '是' : value === false ? '否' : value == null ? '' : Array.isArray(value) ? value.join(', ') : value;
  }))];
  const write = await replaceSheetValues(feishu, spreadsheetToken, sheet, FEISHU_PUBLISHED_FIELDS, values, {
    clearRows: Math.max(200, existingRows.length + 1)
  });
  return {
    productUrl: normalizedProductUrl,
    folder: { name: folderName, token: folderToken, created: folderResult.created },
    spreadsheet,
    sheet,
    write,
    created,
    updated,
    rows: normalizedRows.length,
    fields: FEISHU_PUBLISHED_FIELDS
  };
}

function toPublishedRowForSync(raw, productUrl) {
  // Keep this wrapper local so the row module remains a pure data mapper.
  return publishedRowValues(FEISHU_PUBLISHED_FIELDS, [raw], { productUrl })[1].reduce((row, value, index) => {
    row[FEISHU_PUBLISHED_FIELDS[index]] = value;
    return row;
  }, {});
}

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) }, headers));
  res.end(body);
}

function corsHeaders(req) {
  const origin = req.headers.origin || '';
  const allowed = origin.startsWith('chrome-extension://') || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  return allowed ? {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization,content-type,x-agent-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'vary': 'Origin'
  } : {};
}

async function readJson(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validateTask(body) {
  if (!body || body.version !== '1.0') return 'version must be 1.0';
  if (typeof body.type !== 'string' || !body.type) return 'type is required';
  if (!body.input || typeof body.input !== 'object') return 'input is required';
  return null;
}

function demoRecords(domain, page) {
  const safeDomain = domain || 'example.com';
  const start = (page - 1) * 3;
  return Array.from({ length: 3 }, function(_, index) {
    const n = start + index + 1;
    return {
      sourceUrl: 'https://source' + n + '.example/article-' + n,
      targetUrl: 'https://' + safeDomain + '/landing-' + (((n - 1) % 2) + 1),
      anchor: n % 2 ? safeDomain + ' resource' : 'learn more',
      dofollow: n % 3 !== 0,
      firstSeen: new Date(Date.UTC(2026, 8, Math.min(28, n))).toISOString()
    };
  });
}

export async function createAgentServer(options = {}) {
  const configPath = options.configPath || path.join(here, 'config.local.json');
  const config = options.config || JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const dataDir = options.dataDir || path.join(here, 'data');
  const store = new TaskStore(dataDir, config.leaseSeconds || 120);
  const queryLedger = new QueryLedger(path.join(dataDir, 'query-ledger.json'), { dailyOverviewLimit: config.dailyOverviewLimit || 10 });
  const feishuConfig = config.feishu || {};
  const feishu = new FeishuClient({ appId: feishuConfig.appId, appSecret: feishuConfig.appSecret, baseUrl: feishuConfig.baseUrl });
  const demoPath = path.join(here, 'demo', 'index.html');

  const server = http.createServer(async function(req, res) {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }

    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true, service: 'backlink-browser-agent', version: '0.1.0', now: new Date().toISOString() }, cors);
      }
      if (req.method === 'GET' && (url.pathname === '/demo' || url.pathname === '/demo/')) {
        const html = fs.readFileSync(demoPath);
        res.writeHead(200, Object.assign({ 'content-type': 'text/html; charset=utf-8', 'content-length': html.length }, cors));
        return res.end(html);
      }
      if (req.method === 'GET' && url.pathname === '/demo/api/backlinks') {
        const page = Math.max(1, Math.min(2, Number(url.searchParams.get('page') || 1)));
        const domain = url.searchParams.get('domain') || 'example.com';
        return json(res, 200, { data: { domain, page, totalPages: 2, records: demoRecords(domain, page) } }, cors);
      }

      const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-agent-token'];
      if (!config.token || supplied !== config.token) return json(res, 401, { error: 'unauthorized' }, cors);

      if (req.method === 'POST' && url.pathname === '/v1/tasks') {
        const body = await readJson(req);
        const invalid = validateTask(body);
        if (invalid) return json(res, 400, { error: 'invalid_task', message: invalid }, cors);
        const isSemrushOverview = ['semrush-via-3ue', 'semrushe', 'semrush'].includes(String(body.provider || '').toLowerCase()) &&
          (body.input && (body.input.entry || 'overview') === 'overview');
        let ledgerQuery = null;
        if (isSemrushOverview) {
          ledgerQuery = {
            provider: 'semrush-via-3ue',
            domain: body.input.domain,
            scope: body.input.scope || 'domain',
            entry: 'overview',
            page: 1
          };
          if (!ledgerQuery.domain) return json(res, 400, { error: 'domain_required' }, cors);
          const decision = queryLedger.check(ledgerQuery);
          if (decision.cacheHit) {
            const cachedTask = await store.create(Object.assign({}, body, { taskId: body.taskId || crypto.randomUUID() }));
            const completed = await store.complete(cachedTask.taskId, Object.assign({}, decision.cached.result || {}, {
              status: 'completed',
              cacheHit: true,
              cacheCheckedAt: decision.cached.checkedAt,
              taskId: cachedTask.taskId
            }));
            return json(res, 200, completed, cors);
          }
          if (!decision.allowed) return json(res, decision.inProgress ? 409 : 429, {
            error: decision.reason,
            normalizedDomain: decision.reservation && decision.reservation.normalizedDomain || ledgerQuery.domain,
            used: decision.used,
            limit: decision.limit,
            reservedByTaskId: decision.reservation && decision.reservation.taskId || null
          }, cors);
          body.taskId = body.taskId || crypto.randomUUID();
          const reservation = queryLedger.reserve(ledgerQuery, body.taskId);
          if (!reservation.allowed) return json(res, reservation.inProgress ? 409 : 429, {
            error: reservation.reason,
            used: reservation.used,
            limit: reservation.limit
          }, cors);
          try {
            const task = await store.create(body);
            return json(res, 201, task, cors);
          } catch (error) {
            queryLedger.release(ledgerQuery);
            throw error;
          }
        }
        const task = await store.create(body);
        return json(res, 201, task, cors);
      }
      if (req.method === 'GET' && url.pathname === '/v1/tasks/next') {
        const task = await store.next(url.searchParams.get('workerId') || 'chrome-extension');
        return task ? json(res, 200, task, cors) : json(res, 200, { task: null }, cors);
      }
      if (req.method === 'GET' && url.pathname === '/v1/tasks') return json(res, 200, { tasks: store.list() }, cors);

      if (req.method === 'GET' && url.pathname === '/v1/queue') return json(res, 200, { items: store.queueList() }, cors);
      if (req.method === 'POST' && url.pathname === '/v1/queue') {
        const item = await store.queueCreate(await readJson(req));
        return json(res, 201, item, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/queue/import-backlinks') {
        const body = await readJson(req);
        if (body.qualification && body.qualification.spamLabelDetected) {
          return json(res, 200, { skipped: true, reason: 'authority_label_contains_spam_signal', created: [], existing: [], invalid: 0 }, cors);
        }
        const imported = await store.queueImportBacklinks(body);
        return json(res, 201, Object.assign({ skipped: false }, imported), cors);
      }
      const queueMatch = url.pathname.match(/^\/v1\/queue\/(.+)$/);
      if (req.method === 'GET' && queueMatch) {
        const item = store.queueGet(decodeURIComponent(queueMatch[1]));
        return item ? json(res, 200, item, cors) : json(res, 404, { error: 'queue_not_found' }, cors);
      }
      if (req.method === 'POST' && queueMatch) {
        const body = await readJson(req);
        const item = await store.queueTransition(decodeURIComponent(queueMatch[1]), body.status, body.patch || {});
        return json(res, 200, item, cors);
      }

      const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)$/);
      if (req.method === 'GET' && taskMatch) {
        const task = store.get(decodeURIComponent(taskMatch[1]));
        return task ? json(res, 200, task, cors) : json(res, 404, { error: 'task_not_found' }, cors);
      }
      const eventMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/events$/);
      if (req.method === 'POST' && eventMatch) {
        const event = await store.event(decodeURIComponent(eventMatch[1]), await readJson(req));
        return json(res, 201, event, cors);
      }
      const resultMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/result$/);
      if (req.method === 'POST' && resultMatch) {
        let result = await readJson(req);
        if (result && ['semrush-via-3ue', 'semrushe', 'semrush'].includes(String(result.provider || '').toLowerCase()) && Array.isArray(result.captures)) {
          try {
            const normalized = normalizeSem3ueCapture({
              domain: result.domain,
              backlinksCapture: {
                capturedAt: result.completedAt || new Date().toISOString(),
                responses: result.captures
              },
              visibleOverview: result.visibleOverview || {}
            });
            result = Object.assign({}, result, normalized, { rawCapturesOmitted: true });
            delete result.captures;
            delete result.requestFingerprint;
            result.sourceUrl = normalized.sourcePages.backlinks;
            const domain = normalized.normalizedDomain;
            const query = { provider: 'semrush-via-3ue', domain, scope: 'domain', entry: 'overview', page: 1 };
            if (result.status === 'completed') queryLedger.record(query, result);
            else queryLedger.release(query);
          } catch (error) {
            if (!['manual_required', 'failed'].includes(result.status)) throw error;
            queryLedger.release({ provider: 'semrush-via-3ue', domain: result.domain, scope: 'domain', entry: 'overview', page: 1 });
            result = Object.assign({}, result, { rawCapturesOmitted: true, normalizationError: error.message });
            delete result.captures;
            delete result.requestFingerprint;
          }
        }
        if (result && (result.provider === 'comment-page' || result.provider === 'candidate-page') && result.commentSnapshot) {
          const analysis = analyzeCommentSnapshot(result.commentSnapshot);
          result = Object.assign({}, result, { commentAnalysis: analysis, rawCommentSnapshotOmitted: true });
          delete result.commentSnapshot;
        }
        if (result && Array.isArray(result.candidatePages)) {
          result = Object.assign({}, result, {
            candidatePages: result.candidatePages.map(page => {
              if (page && page.commentAnalysis) return page;
              const analysis = analyzeCommentSnapshot(page || {});
              return Object.assign({}, page, { commentAnalysis: analysis, rawCommentSnapshotOmitted: true });
            })
          });
          result = attachCandidateAnalysis(result);
        }
        let feishuSync = null;
        const autoSyncProvider = ['semrush-via-3ue', 'semrushe', 'semrush'].includes(String(result && result.provider || '').toLowerCase());
        if (autoSyncProvider && Array.isArray(result.backlinks) && feishu.configured() && feishuConfig.enabled !== false) {
          try {
            feishuSync = await syncStructuredFeishu({
              feishu,
              result,
              folderName: '自动化表格',
              candidateTitle: '外链候选队列',
              eligibleTitle: '外链表沉淀',
              product: result.normalizedDomain || result.domain || ''
            });
            result = Object.assign({}, result, {
              feishuSync: { status: 'completed', eligibleRows: feishuSync.eligibleRows, candidateRows: feishuSync.candidateRows }
            });
          } catch (error) {
            feishuSync = { status: 'failed', error: error.message };
            result = Object.assign({}, result, { feishuSync });
          }
        }
        const task = await store.complete(decodeURIComponent(resultMatch[1]), result);
        return json(res, 200, Object.assign({}, task, feishuSync ? { feishuSync } : {}), cors);
      }
      if (req.method === 'GET' && url.pathname === '/v1/query-ledger') {
        return json(res, 200, { entries: queryLedger.list(), dailyOverviewLimit: queryLedger.dailyOverviewLimit }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/query-ledger/check') {
        return json(res, 200, queryLedger.check(await readJson(req)), cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/query-ledger/record') {
        const body = await readJson(req);
        return json(res, 201, queryLedger.record(body, body.result), cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/analyze/comment-page') {
        return json(res, 200, analyzeCommentSnapshot(await readJson(req)), cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/expansion/domains') {
        const body = await readJson(req);
        const options = body.options || {};
        const candidates = aggregateExpansionDomains(body.candidatePages || [], options);
        const enriched = enrichExpansionDomains(candidates, body.semrushByDomain || {}, options);
        return json(res, 200, { candidates: enriched, minCandidatePages: Math.max(1, Number(options.minCandidatePages || 2)) }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/feishu/preview') {
        const body = await readJson(req);
        return json(res, 200, {
          targetType: body.targetType || (config.feishu && config.feishu.targetType) || 'spreadsheet',
          fields: body.fields || FEISHU_DEFAULT_FIELDS,
          rows: toFeishuRows(body.items || [], body.metricsByDomain || {})
        }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/feishu/sync-published') {
        if (!feishu.configured()) return json(res, 503, { error: 'feishu_credentials_missing' }, cors);
        const body = await readJson(req);
        const result = await syncPublishedBacklinksFeishu({
          feishu,
          productUrl: body.productUrl || body.product_url,
          records: body.records || body.items || [],
          folderName: body.folderName || '自动化表格',
          sheetTitle: body.sheetTitle || '外链发布记录'
        });
        return json(res, 201, Object.assign({ ok: true }, result), cors);
      }
      if (req.method === 'GET' && url.pathname === '/v1/feishu/status') {
        return json(res, 200, {
          configured: feishu.configured(),
          enabled: Boolean(feishuConfig.enabled),
          targetType: feishuConfig.targetType || 'spreadsheet',
          appId: feishu.maskedAppId()
        }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/feishu/auth-check') {
        const token = await feishu.getTenantAccessToken();
        return json(res, 200, {
          ok: true,
          configured: true,
          appId: feishu.maskedAppId(),
          tokenExpiresIn: feishu.cachedToken ? Math.max(0, Math.floor((feishu.cachedToken.expiresAt - Date.now()) / 1000)) : null
        }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/feishu/create') {
        if (!feishu.configured()) return json(res, 503, { error: 'feishu_credentials_missing' }, cors);
        const body = await readJson(req);
        const targetType = body.targetType || feishuConfig.targetType || 'spreadsheet';
        if (targetType === 'spreadsheet') {
          const spreadsheet = await feishu.createSpreadsheet({ title: body.title, folderToken: body.folderToken });
          let sheets = null;
          try { sheets = await feishu.listSheets(spreadsheet.spreadsheet_token); } catch (error) { sheets = { error: error.message }; }
          return json(res, 201, { targetType, spreadsheet, sheets }, cors);
        }
        if (targetType === 'bitable') {
          const app = await feishu.createBitable({ name: body.title, folderToken: body.folderToken, timeZone: body.timeZone });
          return json(res, 201, { targetType, app }, cors);
        }
        return json(res, 400, { error: 'unsupported_feishu_target_type' }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/v1/feishu/sync-task') {
        if (!feishu.configured()) return json(res, 503, { error: 'feishu_credentials_missing' }, cors);
        const body = await readJson(req);
        const task = body.taskId ? store.get(body.taskId) : null;
        const result = body.result || task && task.result;
        if (!result || !Array.isArray(result.backlinks)) return json(res, 400, { error: 'normalized_backlinks_result_required' }, cors);
        const structured = await syncStructuredFeishu({
          feishu,
          result,
          folderName: body.folderName || '自动化表格',
          candidateTitle: body.candidateTitle || body.sheetTitle || '外链候选队列',
          eligibleTitle: body.eligibleTitle || '外链表沉淀',
          product: body.product || result.normalizedDomain || result.domain || ''
        });
        let published = null;
        if (Array.isArray(body.publishedRecords) && body.publishedRecords.length) {
          published = await syncPublishedBacklinksFeishu({
            feishu,
            productUrl: body.productUrl || body.product_url || body.product || result.normalizedDomain || result.domain,
            records: body.publishedRecords,
            folderName: body.folderName || '自动化表格',
            sheetTitle: body.publishedSheetTitle || '外链发布记录'
          });
        }
        return json(res, 201, Object.assign({ ok: true, fields: FEISHU_PRODUCT_FIELDS, eligibleFields: FEISHU_ELIGIBLE_FIELDS, publishedFields: FEISHU_PUBLISHED_FIELDS }, structured, published ? { published } : {}), cors);
      }
      return json(res, 404, { error: 'not_found' }, cors);
    } catch (error) {
      const known = ['task_exists', 'task_not_found', 'body_too_large', 'queue_exists', 'queue_not_found', 'source_url_required', 'invalid_queue_state', 'already_published', 'product_url_required', 'product_url_too_long', 'published_records_required', 'published_source_url_required'];
      const status = error instanceof SyntaxError ? 400 : known.includes(error.message) || String(error.message || '').startsWith('invalid_queue_transition:') ? 400 : 500;
      return json(res, status, { error: error.message || 'internal_error' }, cors);
    }
  });

  await new Promise(function(resolve, reject) {
    server.once('error', reject);
    server.listen(options.port ?? config.port ?? 17831, options.host || config.host || '127.0.0.1', resolve);
  });
  return { server, store, config, address: server.address() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const runtime = await createAgentServer();
  const address = runtime.address;
  console.log('Backlink Browser Agent listening on http://' + address.address + ':' + address.port);
}

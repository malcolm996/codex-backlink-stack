import { INSTALL_CONFIG } from './generated_config.js';

const DEFAULTS = {
  bridgeUrl: INSTALL_CONFIG.bridgeUrl || 'http://127.0.0.1:17831',
  token: INSTALL_CONFIG.token || '',
  providerEntryUrl: 'http://127.0.0.1:17831/demo/',
  inputSelector: '#domain',
  submitSelector: '#search',
  nextSelector: '#next',
  captureUrlPatterns: ['/demo/api/backlinks'],
  recordsPath: 'data.records',
  captureMode: 'matched-body',
  maxPages: 2,
  settleMs: 1200,
  quietMode: true,
  dedicatedWindow: true,
  inspectCandidates: true,
  maxCandidatePages: 20
};

const activeTasks = new Map();
let polling = false;
let automationWindowId = null;

async function settings() {
  return Object.assign({}, DEFAULTS, await chrome.storage.local.get(DEFAULTS));
}

async function bridge(path, init = {}) {
  const cfg = await settings();
  const response = await fetch(cfg.bridgeUrl + path, Object.assign({}, init, {
    headers: Object.assign({
      'content-type': 'application/json',
      authorization: 'Bearer ' + cfg.token
    }, init.headers || {})
  }));
  if (!response.ok) throw new Error('bridge_' + response.status);
  return response.json();
}

async function postEvent(taskId, event) {
  try {
    await bridge('/v1/tasks/' + encodeURIComponent(taskId) + '/events', { method: 'POST', body: JSON.stringify(event) });
  } catch (error) {
    console.warn('event delivery failed', error);
  }
}

function extractPath(value, dottedPath) {
  if (!dottedPath) return [];
  return dottedPath.split('.').reduce(function(current, part) {
    return current == null ? undefined : current[part];
  }, value) || [];
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/gmitm|token|auth|session|key|signature|(^|_)sig($|_)|csrf|cookie/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch { return value; }
}

function recordKey(record) {
  if (!record || typeof record !== 'object') return JSON.stringify(record);
  return [record.sourceUrl, record.targetUrl, record.anchor, record.firstSeen].filter(Boolean).join('|') || JSON.stringify(record);
}

async function ensureInjected(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['main_world.js'], world: 'MAIN' });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content_bridge.js'], world: 'ISOLATED' });
}

async function createTaskTab(url, cfg) {
  if (cfg.dedicatedWindow) {
    try {
      if (automationWindowId != null) {
        const existing = await chrome.windows.get(automationWindowId);
        if (existing) return chrome.tabs.create({ windowId: automationWindowId, url, active: false });
      }
    } catch {
      automationWindowId = null;
    }
    const created = await chrome.windows.create({ url, focused: false, state: cfg.quietMode ? 'minimized' : 'normal', type: 'normal' });
    automationWindowId = created.id;
    return created.tabs[0];
  }
  return chrome.tabs.create({ url, active: !cfg.quietMode });
}

function semrushUrlPair(domain, page) {
  const clean = String(domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const encoded = encodeURIComponent(clean);
  const pageNumber = Math.max(1, Number(page) || 1);
  return {
    domain: clean,
    overviewUrl: 'https://sem.3ue.co/analytics/overview/?q=' + encoded,
    backlinksUrl: 'https://sem.3ue.co/analytics/backlinks/backlinks/?q=' + encoded + '&searchType=domain&ba_rpp=blog&page=' + pageNumber
  };
}

function providerTask(task, cfg) {
  const provider = String(task.provider || '').toLowerCase();
  const type = String(task.type || '').toLowerCase();
  if (type === 'candidate.comment.check' || provider === 'comment-page' || provider === 'candidate-page') {
    return {
      entryUrl: task.input && (task.input.entryUrl || task.input.sourceUrl || task.input.url),
      cfg: Object.assign({}, cfg, task.capture || {}, {
        adapter: 'comment-page',
        captureUrlPatterns: [],
        captureMode: 'metadata',
        settleMs: 1800
      })
    };
  }
  if (provider !== 'semrush-via-3ue' && provider !== 'semrushe' && provider !== 'semrush') return { entryUrl: (task.input && task.input.entryUrl) || cfg.providerEntryUrl, cfg: Object.assign({}, cfg, task.capture || {}) };
  const pair = semrushUrlPair(task.input && task.input.domain, task.input && task.input.page);
  return {
    entryUrl: (task.input && task.input.entryUrl) || pair.overviewUrl,
    cfg: Object.assign({}, cfg, task.capture || {}, {
      adapter: 'sem3ue',
      secondaryUrl: pair.backlinksUrl,
      captureUrlPatterns: ['/dpa/rpc', '/analytics/backlinks/webapi2/'],
      captureMode: 'matched-body',
      recordsPath: 'backlinks.data',
      settleMs: 5000,
      domain: pair.domain,
      inspectCandidates: task.input && task.input.inspectCandidates !== undefined ? Boolean(task.input.inspectCandidates) : cfg.inspectCandidates,
      maxCandidatePages: (task.limits && task.limits.maxCandidatePages) || cfg.maxCandidatePages
    })
  };
}

async function launchInTab(tabId, tabUrl) {
  const state = activeTasks.get(tabId);
  if (!state || state.injected) return;
  state.injected = true;
  try {
    await ensureInjected(tabId);
    await chrome.tabs.sendMessage(tabId, { type: 'BBA_RUN_TASK', task: state.task, config: state.cfg });
    if (state.cfg.adapter === 'sem3ue' && !state.reloaded) {
      state.reloaded = true;
      await chrome.tabs.reload(tabId, { bypassCache: true });
    }
  } catch (error) {
    await finalize(tabId, { status: 'manual_required', reason: 'injection_failed:' + error.message, sourceUrl: tabUrl });
  }
}

async function startTask(task) {
  const cfg = await settings();
  const provider = providerTask(task, cfg);
  const entryUrl = provider.entryUrl;
  if (!entryUrl) {
    await bridge('/v1/tasks/' + encodeURIComponent(task.taskId) + '/result', {
      method: 'POST',
      body: JSON.stringify({ status: 'manual_required', reason: 'missing_entry_url', provider: task.provider })
    });
    return;
  }
  const originPattern = new URL(entryUrl).origin + '/*';
  const local = entryUrl.startsWith('http://127.0.0.1') || entryUrl.startsWith('http://localhost');
  const allowed = local || await chrome.permissions.contains({ origins: [originPattern] });
  if (!allowed) {
    await postEvent(task.taskId, { type: 'human_required', status: 'manual_required', reason: 'site_permission_required', origin: originPattern });
    return;
  }
  if (provider.cfg.inspectCandidates && provider.cfg.adapter === 'sem3ue') {
    const candidateAllowed = await chrome.permissions.contains({ origins: ['https://*/*'] });
    if (!candidateAllowed) {
      await postEvent(task.taskId, { type: 'human_required', status: 'manual_required', reason: 'candidate_page_permission_required', origin: 'https://*/*' });
      return;
    }
  }

  const tab = await createTaskTab(entryUrl, cfg);
  activeTasks.set(tab.id, {
    task: task,
    cfg: Object.assign({}, provider.cfg, {
      maxPages: (task.limits && task.limits.maxPages) || cfg.maxPages,
      maxRecords: (task.limits && task.limits.maxRecords) || 1000,
      manualSubmit: !task.execution || task.execution.manualSubmit !== false
    }),
    captures: [],
    records: new Map(),
    startedAt: new Date().toISOString(),
    injected: false,
    reloaded: false,
    visibleOverview: {},
    commentSnapshot: null,
    candidateQueue: [],
    candidateIndex: 0,
    candidatePages: [],
    inspectingCandidates: false
  });
  await postEvent(task.taskId, { type: 'task.started', status: 'running', tabId: tab.id, quiet: cfg.quietMode });
  if (tab.status === 'complete') await launchInTab(tab.id, tab.url);
}

function candidateUrls(state) {
  const seen = new Set();
  return Array.from(state.records.values()).map(record => record.sourceUrl || record.source_url)
    .filter(function(url) {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return /^https?:\/\//i.test(url);
    }).slice(0, Math.max(0, Number(state.cfg.maxCandidatePages) || 0));
}

async function inspectNextCandidate(tabId) {
  const state = activeTasks.get(tabId);
  if (!state) return;
  if (state.candidateIndex >= state.candidateQueue.length) {
    return finalize(tabId, { status: 'completed', pagesVisited: 1, sourceUrl: state.task.input && state.task.input.entryUrl });
  }
  const url = state.candidateQueue[state.candidateIndex++];
  state.cfg = Object.assign({}, state.cfg, { adapter: 'comment-page', captureUrlPatterns: [], captureMode: 'metadata', settleMs: 1800 });
  state.injected = false;
  await postEvent(state.task.taskId, { type: 'candidate.page', index: state.candidateIndex, total: state.candidateQueue.length, url });
  await chrome.tabs.update(tabId, { url });
}

async function finalize(tabId, automation = {}) {
  const state = activeTasks.get(tabId);
  if (!state) return;
  activeTasks.delete(tabId);
  const records = Array.from(state.records.values()).slice(0, state.cfg.maxRecords || 1000);
  const result = {
    version: '1.0',
    status: automation.status || 'completed',
    provider: state.task.provider,
    sourceUrl: sanitizeUrl(automation.sourceUrl),
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    pagination: { pagesVisited: automation.pagesVisited || 1 },
    requestFingerprint: state.captures.map(function(item) { return (item.method || 'GET') + ' ' + item.url; }).slice(0, 100),
    captures: state.captures,
    records: records,
    domain: state.cfg.domain || (state.task.input && state.task.input.domain) || null,
    visibleOverview: state.visibleOverview,
    commentSnapshot: state.commentSnapshot,
    candidatePages: state.candidatePages,
    manual_required: automation.status === 'manual_required',
    reason: automation.reason || null
  };
  await bridge('/v1/tasks/' + encodeURIComponent(state.task.taskId) + '/result', { method: 'POST', body: JSON.stringify(result) });
  if (state.cfg.quietMode && automation.status !== 'manual_required') await chrome.tabs.remove(tabId).catch(function() {});
}

async function poll() {
  if (polling || activeTasks.size) return;
  polling = true;
  try {
    const response = await bridge('/v1/tasks/next?workerId=chrome-extension');
    if (response && response.taskId) await startTask(response);
  } catch (error) {
    console.debug('bridge unavailable', error.message);
  } finally {
    polling = false;
  }
}

chrome.runtime.onInstalled.addListener(async function() {
  await chrome.storage.local.set(await settings());
  chrome.alarms.create('poll-tasks', { periodInMinutes: 0.5 });
  poll();
});
chrome.runtime.onStartup.addListener(function() {
  chrome.alarms.create('poll-tasks', { periodInMinutes: 0.5 });
  poll();
});
chrome.alarms.onAlarm.addListener(function(alarm) { if (alarm.name === 'poll-tasks') poll(); });

chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && activeTasks.has(tabId)) {
    const state = activeTasks.get(tabId);
    state.injected = false;
    await launchInTab(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  const tabId = sender.tab && sender.tab.id;
  if (message && message.type === 'BBA_CAPTURE' && activeTasks.has(tabId)) {
    const state = activeTasks.get(tabId);
    const capture = message.capture;
    state.captures.push(Object.assign({}, capture, {
      url: sanitizeUrl(capture.url),
      body: capture.body && capture.body.length > 2000000 ? capture.body.slice(0, 2000000) : capture.body
    }));
    if (capture.body) {
      try {
        const records = extractPath(JSON.parse(capture.body), state.cfg.recordsPath);
        if (Array.isArray(records)) records.forEach(function(record) { state.records.set(recordKey(record), record); });
      } catch {}
    }
    postEvent(state.task.taskId, { type: 'network.capture', url: capture.url, statusCode: capture.status, bodyCaptured: Boolean(capture.body) });
    sendResponse({ ok: true });
    return true;
  }
  if (message && message.type === 'BBA_AUTOMATION_EVENT' && activeTasks.has(tabId)) {
    const state = activeTasks.get(tabId);
    postEvent(state.task.taskId, message.event);
    if (message.event.type === 'automation.completed') {
      if (state.cfg.adapter === 'comment-page' && state.inspectingCandidates) {
        // The preceding comment_analysis event has already stored this page.
        inspectNextCandidate(tabId).catch(function(error) { finalize(tabId, { status: 'manual_required', reason: 'candidate_navigation_failed:' + error.message, sourceUrl: sender.tab.url }); });
      } else if (state.cfg.adapter === 'sem3ue' && state.cfg.inspectCandidates) {
        state.candidateQueue = candidateUrls(state);
        state.candidateIndex = 0;
        state.inspectingCandidates = state.candidateQueue.length > 0;
        if (state.inspectingCandidates) inspectNextCandidate(tabId).catch(function(error) { finalize(tabId, { status: 'manual_required', reason: 'candidate_inspection_failed:' + error.message, sourceUrl: sender.tab.url }); });
        else finalize(tabId, Object.assign({}, message.event, { sourceUrl: sender.tab.url }));
      } else finalize(tabId, Object.assign({}, message.event, { sourceUrl: sender.tab.url }));
    }
    if (message.event.type === 'automation.navigate' && message.event.url) {
      chrome.tabs.update(tabId, { url: message.event.url }).catch(function() {});
    }
    if (message.event.type === 'automation.overview' && message.event.data) {
      state.visibleOverview = Object.assign({}, state.visibleOverview, message.event.data);
    }
    if (message.event.type === 'automation.comment_analysis' && message.event.data) {
      if (state.inspectingCandidates) state.candidatePages.push(message.event.data);
      else state.commentSnapshot = message.event.data;
    }
    if (message.event.type === 'human_required') {
      chrome.windows.update(sender.tab.windowId, { focused: true, state: 'normal' }).catch(function() {});
      chrome.tabs.update(tabId, { active: true }).catch(function() {});
      finalize(tabId, { status: 'manual_required', reason: message.event.reason, sourceUrl: sender.tab.url, pagesVisited: message.event.pagesVisited });
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message && message.type === 'BBA_POLL_NOW') {
    poll().then(function() { sendResponse({ ok: true }); }).catch(function(error) { sendResponse({ ok: false, error: error.message }); });
    return true;
  }
  if (message && message.type === 'BBA_STATUS') {
    settings().then(function(cfg) { sendResponse({ activeTasks: activeTasks.size, bridgeUrl: cfg.bridgeUrl, quietMode: cfg.quietMode }); });
    return true;
  }
});

setTimeout(poll, 1000);

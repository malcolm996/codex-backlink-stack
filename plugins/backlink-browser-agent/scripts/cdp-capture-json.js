import fs from 'node:fs';
import path from 'node:path';

const targetNeedle = process.argv[2];
const outputPath = path.resolve(process.argv[3] || 'capture.json');
const waitMs = Number(process.argv[4] || 18000);
if (!targetNeedle) throw new Error('Target id or URL fragment is required');

const targets = await fetch('http://127.0.0.1:9223/json/list').then(function(response) { return response.json(); });
const target = targets.find(function(item) {
  return item.id === targetNeedle || item.url.includes(targetNeedle) || item.title.includes(targetNeedle);
});
if (!target) throw new Error('Target not found: ' + targetNeedle);

const socket = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const requests = new Map();
const candidates = new Map();
const completed = [];

socket.addEventListener('message', async function(event) {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message)); else handlers.resolve(message.result);
    return;
  }
  if (message.method === 'Network.requestWillBeSent') {
    const params = message.params;
    requests.set(params.requestId, {
      method: params.request.method,
      requestUrl: sanitizeUrl(params.request.url),
      postData: sanitizePostData(params.request.postData)
    });
  }
  if (message.method === 'Network.responseReceived') {
    const params = message.params;
    if (params.type === 'XHR' || params.type === 'Fetch') {
      candidates.set(params.requestId, Object.assign({}, requests.get(params.requestId), {
        requestId: params.requestId,
        type: params.type,
        url: sanitizeUrl(params.response.url),
        status: params.response.status,
        mimeType: params.response.mimeType
      }));
    }
  }
  if (message.method === 'Network.loadingFinished' && candidates.has(message.params.requestId)) {
    const meta = candidates.get(message.params.requestId);
    candidates.delete(message.params.requestId);
    requests.delete(message.params.requestId);
    try {
      const bodyResult = await command('Network.getResponseBody', { requestId: message.params.requestId });
      const body = bodyResult.base64Encoded ? Buffer.from(bodyResult.body, 'base64').toString('utf8') : bodyResult.body;
      const parsed = tryJson(body);
      completed.push(Object.assign({}, meta, {
        encodedDataLength: message.params.encodedDataLength,
        bodyLength: body.length,
        json: parsed == null ? undefined : redact(parsed),
        textPreview: parsed == null ? body.slice(0, 1000) : undefined
      }));
    } catch (error) {
      completed.push(Object.assign({}, meta, { error: error.message }));
    }
  }
});

await new Promise(function(resolve, reject) {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function command(method, params) {
  return new Promise(function(resolve, reject) {
    id += 1;
    pending.set(id, { resolve: resolve, reject: reject });
    socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
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

function tryJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function sanitizePostData(value) {
  if (!value) return undefined;
  const parsed = tryJson(value);
  if (parsed != null) return redact(parsed);
  try {
    const params = new URLSearchParams(value);
    if (Array.from(params.keys()).length) {
      for (const key of Array.from(params.keys())) {
        if (/password|cookie|token|authorization|secret|session|csrf|gmitm|key|signature|(^|_)sig($|_)/i.test(key)) params.set(key, '[REDACTED]');
      }
      return params.toString();
    }
  } catch {}
  return value.slice(0, 20000);
}

function redact(value, depth = 0) {
  if (depth > 20) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.map(function(item) { return redact(item, depth + 1); });
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /password|cookie|token|authorization|secret|session|csrf|gmitm/i.test(key) ? '[REDACTED]' : redact(item, depth + 1);
  }
  return output;
}

await command('Network.enable', { maxTotalBufferSize: 100000000, maxResourceBufferSize: 10000000 });
await command('Page.enable');
await command('Page.reload', { ignoreCache: true });
await new Promise(function(resolve) { setTimeout(resolve, waitMs); });
const page = await command('Runtime.evaluate', {
  expression: "({title:document.title,url:location.href,textLength:(document.body&&document.body.innerText||'').length})",
  returnByValue: true
});
await new Promise(function(resolve) { setTimeout(resolve, 1000); });

const payload = {
  capturedAt: new Date().toISOString(),
  page: Object.assign({}, redact(page.result.value), { url: sanitizeUrl(page.result.value.url) }),
  responses: completed.sort(function(a, b) { return a.url.localeCompare(b.url); })
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ outputPath: outputPath, responseCount: payload.responses.length, jsonResponses: payload.responses.filter(function(item) { return item.json !== undefined; }).length, page: payload.page }));
socket.close();

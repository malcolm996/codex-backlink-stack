(function() {
  if (window.__BBA_NETWORK_HOOK__) return;
  window.__BBA_NETWORK_HOOK__ = true;
  let config = { patterns: [], captureMode: 'metadata', maxBodyBytes: 2000000 };
  try {
    const stored = sessionStorage.getItem('__BBA_CAPTURE_CONFIG__');
    if (stored) config = Object.assign(config, JSON.parse(stored));
  } catch {}

  function matches(url) {
    if (!config.patterns || !config.patterns.length) return false;
    return config.patterns.some(function(pattern) {
      try {
        return pattern.startsWith('re:') ? new RegExp(pattern.slice(3)).test(url) : url.includes(pattern);
      } catch { return false; }
    });
  }

  function emit(payload) {
    window.postMessage({ source: 'backlink-browser-agent-main', type: 'BBA_CAPTURE', capture: Object.assign({ at: new Date().toISOString() }, payload) }, '*');
  }

  async function inspectResponse(response, requestUrl, method) {
    const url = response.url || requestUrl;
    const matched = matches(url);
    const metadata = { url: url, method: method, status: response.status, contentType: response.headers.get('content-type') || '', matched: matched };
    if (!matched || config.captureMode !== 'matched-body') return emit(metadata);
    try {
      const text = await response.clone().text();
      emit(Object.assign({}, metadata, { body: text.slice(0, config.maxBodyBytes) }));
    } catch (error) {
      emit(Object.assign({}, metadata, { error: error.message }));
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const requestUrl = typeof input === 'string' ? input : (input && input.url) || String(input);
    const response = await originalFetch.apply(this, arguments);
    inspectResponse(response, requestUrl, init.method || (input && input.method) || 'GET');
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__bba = { method: method, url: new URL(String(url), location.href).href };
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('loadend', function() {
      const meta = this.__bba || { method: 'GET', url: location.href };
      const matched = matches(meta.url);
      const payload = { url: meta.url, method: meta.method, status: this.status, contentType: this.getResponseHeader('content-type') || '', matched: matched };
      if (matched && config.captureMode === 'matched-body') {
        try {
          const body = this.responseType === 'json' ? JSON.stringify(this.response) : String(this.responseText || '');
          payload.body = body.slice(0, config.maxBodyBytes);
        } catch (error) { payload.error = error.message; }
      }
      emit(payload);
    }, { once: true });
    return originalSend.apply(this, arguments);
  };

  window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data || event.data.source !== 'backlink-browser-agent-isolated' || event.data.type !== 'BBA_CONFIG') return;
    config = Object.assign({}, config, event.data.config);
    try { sessionStorage.setItem('__BBA_CAPTURE_CONFIG__', JSON.stringify(config)); } catch {}
  });
})();

(function() {
  if (window.__BBA_CONTENT_BRIDGE__) return;
  window.__BBA_CONTENT_BRIDGE__ = true;

  const sleep = function(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); };
  const send = function(event) { return chrome.runtime.sendMessage({ type: 'BBA_AUTOMATION_EVENT', event: event }).catch(function() {}); };

  window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data || event.data.source !== 'backlink-browser-agent-main' || event.data.type !== 'BBA_CAPTURE') return;
    chrome.runtime.sendMessage({ type: 'BBA_CAPTURE', capture: event.data.capture }).catch(function() {});
  });

  async function waitFor(selector, timeoutMs = 15000) {
    if (!selector) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(250);
    }
    return null;
  }

  function setValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value') && Object.getOwnPropertyDescriptor(prototype, 'value').set;
    if (setter) setter.call(element, value); else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function metricValue(value) {
    if (value == null) return null;
    const text = String(value).trim().replace(/,/g, '');
    const match = text.match(/^([\d.]+)\s*([KMB])?$/i);
    if (!match) return text;
    const multiplier = { k: 1000, m: 1000000, b: 1000000000 }[(match[2] || '').toLowerCase()] || 1;
    return Number(match[1]) * multiplier;
  }

  function textOf(element) {
    return element && (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function fieldSnapshot(element) {
    const label = element.labels && element.labels[0] ? textOf(element.labels[0]) : '';
    return {
      tagName: element.tagName,
      type: element.getAttribute('type') || '',
      name: element.getAttribute('name') || '',
      id: element.id || '',
      placeholder: element.getAttribute('placeholder') || '',
      label: label,
      visible: Boolean(element.getClientRects().length),
      disabled: Boolean(element.disabled)
    };
  }

  function linkSnapshot(element, placement) {
    return {
      href: element.href || element.getAttribute('href') || '',
      text: textOf(element),
      placement: placement || 'unknown',
      rel: (element.getAttribute('rel') || '').split(/\s+/).filter(Boolean)
    };
  }

  function findCommentNodes() {
    const selectors = [
      '[role="comment"]',
      'li.comment',
      'article.comment',
      '.comment-item',
      '.comment-list > li',
      '[class~="comment"]',
      '[class*="comment-item"]'
    ];
    const nodes = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element)) continue;
        seen.add(element);
        const className = String(element.className || '').toLowerCase();
        if (/comment-(form|list|content|author|meta|reply|navigation)/.test(className)) continue;
        nodes.push(element);
      }
    }
    return nodes.filter(function(element) {
      return !nodes.some(function(other) {
        return other !== element && other.contains(element) && !other.matches('li.comment, article.comment, [role="comment"], [class~="comment"]');
      });
    });
  }

  function collectCommentSnapshot() {
    const forms = Array.from(document.forms).map(function(form, index) {
      return {
        selector: form.id ? '#' + CSS.escape(form.id) : 'form:nth-of-type(' + (index + 1) + ')',
        action: form.action || '',
        method: form.method || 'get',
        text: Array.from(form.querySelectorAll('button[type="submit"],input[type="submit"]')).map(textOf).join(' ').slice(0, 500),
        fields: Array.from(form.querySelectorAll('input,textarea')).map(fieldSnapshot),
        submitControls: Array.from(form.querySelectorAll('button[type="submit"],input[type="submit"],button:not([type])')).map(function(control) {
          return { text: textOf(control), type: control.getAttribute('type') || 'submit', disabled: Boolean(control.disabled) };
        })
      };
    });
    const comments = findCommentNodes().map(function(node) {
      const authorRoot = node.querySelector('.comment-author,[class*="comment-author"],[class~="author"],[class*="author"]');
      const contentRoot = node.querySelector('.comment-content,[class*="comment-content"],[class~="content"],[class*="comment-body"]');
      const links = Array.from(node.querySelectorAll('a[href]')).map(function(anchor) {
        const placement = authorRoot && authorRoot.contains(anchor) ? 'author' : contentRoot && contentRoot.contains(anchor) ? 'content' : 'other';
        return linkSnapshot(anchor, placement);
      });
      const time = node.querySelector('time[datetime],[data-date],[data-time],[class*="date"],[class*="time"]');
      return {
        text: textOf(node),
        publishedAt: time && (time.getAttribute('datetime') || time.getAttribute('data-date') || time.getAttribute('data-time') || textOf(time)),
        links: links
      };
    });
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const allAnchors = Array.from(document.querySelectorAll('a'));
    const metaRobots = Array.from(document.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')).map(function(meta) { return meta.content || ''; });
    const captchaMarkers = [];
    if (document.querySelector('.g-recaptcha,iframe[src*="recaptcha"]')) captchaMarkers.push('recaptcha');
    if (document.querySelector('.h-captcha,iframe[src*="hcaptcha"]')) captchaMarkers.push('hcaptcha');
    if (document.querySelector('[class*="cf-turnstile"],iframe[src*="challenges.cloudflare.com"]')) captchaMarkers.push('turnstile');
    if (document.querySelector('[id*="cf-chl"],[class*="cf-chl"],[id="challenge-running"],[data-ray]')) captchaMarkers.push('cloudflare_challenge');
    const commentContainerFound = Boolean(document.querySelector([
      '[role="comment"]', '.comment-list', '.comments', '#comments', '#respond',
      '[class*="comment-list"]', '[class*="comments-area"]', '[id*="comment"]'
    ].join(',')));
    return {
      sourceUrl: location.href,
      title: document.title,
      text: textOf(document.body).slice(0, 20000),
      forms: forms,
      comments: comments,
      links: allAnchors.map(function(anchor) { return linkSnapshot(anchor, 'other'); }),
      javascriptLinkCount: allAnchors.filter(function(anchor) { return /^javascript:/i.test(anchor.getAttribute('href') || ''); }).length,
      redirectCount: nav && Number(nav.redirectCount) || 0,
      metaRobots: metaRobots,
      noindex: metaRobots.some(function(value) { return /\bnoindex\b/i.test(value); }),
      captchaMarkers: captchaMarkers,
      commentContainerFound: commentContainerFound
    };
  }

  function visibleOverview() {
    const lines = (document.body && document.body.innerText || '').split(/\n+/).map(function(item) { return item.trim(); }).filter(Boolean);
    const output = {};
    const labels = {
      authorityScore: 'Authority Score',
      organicTraffic: '自然流量',
      paidTraffic: '付费流量',
      referringDomains: '引荐域名',
      organicKeywords: '自然搜索关键词',
      paidKeywords: '付费关键词',
      backlinksDisplayed: '反向链接',
      aiVisibility: 'AI 可见度',
      aiMentions: '提及',
      aiCitedPages: '引用的页面'
    };
    for (const [key, label] of Object.entries(labels)) {
      const index = lines.findIndex(function(item) { return item === label; });
      if (index >= 0) {
        const candidate = lines.slice(index + 1, index + 6).map(metricValue).find(function(value) {
          return typeof value === 'number' && Number.isFinite(value);
        });
        if (candidate != null) output[key] = candidate;
      }
    }
    const authorityIndex = lines.findIndex(function(item) { return item === 'Authority Score'; });
    if (authorityIndex >= 0) {
      const label = lines.slice(authorityIndex + 2, authorityIndex + 5).find(function(item) {
        return item && !/^[\d.,]+(?:\\s*[KMB])?$/i.test(item) && !/^[-+\\d.,%]+$/.test(item);
      });
      if (label) {
        output.authorityLabel = label;
        output.authorityLabelRaw = label;
      }
    }
    return output;
  }

  async function run(task, config) {
    window.postMessage({ source: 'backlink-browser-agent-isolated', type: 'BBA_CONFIG', config: {
      patterns: config.captureUrlPatterns || [], captureMode: config.captureMode || 'metadata', maxBodyBytes: 2000000
    } }, '*');
    await sleep(250);

    if (config.adapter === 'comment-page') {
      await sleep(Number(config.settleMs) || 1800);
      await send({ type: 'automation.comment_analysis', data: collectCommentSnapshot() });
      await send({ type: 'automation.completed', status: 'completed', pagesVisited: 1 });
      return;
    }

    if (config.adapter === 'sem3ue') {
      if (location.pathname.includes('/analytics/overview/')) {
        await sleep(Number(config.settleMs) || 4000);
        const overview = visibleOverview();
        if (Object.keys(overview).length) await send({ type: 'automation.overview', data: overview });
        if (config.secondaryUrl) {
          await send({ type: 'automation.navigate', url: config.secondaryUrl, page: 1 });
          return;
        }
      } else if (location.pathname.includes('/analytics/backlinks/backlinks/')) {
        await sleep(Number(config.settleMs) || 4000);
      } else {
        await sleep(Number(config.settleMs) || 2000);
      }
      await send({ type: 'automation.completed', status: 'completed', pagesVisited: 1 });
      return;
    }

    const domain = (task.input && (task.input.domain || task.input.url)) || '';
    if (config.inputSelector) {
      const input = await waitFor(config.inputSelector);
      if (!input) return send({ type: 'human_required', reason: 'input_not_found:' + config.inputSelector, pagesVisited: 0 });
      input.focus();
      setValue(input, domain);
    }
    if (config.submitSelector) {
      const submit = await waitFor(config.submitSelector);
      if (!submit) return send({ type: 'human_required', reason: 'submit_not_found:' + config.submitSelector, pagesVisited: 0 });
      submit.click();
    }

    let pagesVisited = 1;
    await send({ type: 'automation.page', page: 1, status: 'running' });
    await sleep(Number(config.settleMs) || 1500);
    const maxPages = Math.max(1, Number(config.maxPages) || 1);
    while (config.nextSelector && pagesVisited < maxPages) {
      const next = await waitFor(config.nextSelector, 5000);
      if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true') break;
      next.click();
      pagesVisited += 1;
      await send({ type: 'automation.page', page: pagesVisited, status: 'running' });
      await sleep(Number(config.settleMs) || 1500);
    }
    send({ type: 'automation.completed', status: 'completed', pagesVisited: pagesVisited });
  }

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (!message || message.type !== 'BBA_RUN_TASK') return;
    run(message.task, message.config).catch(function(error) { send({ type: 'human_required', reason: 'automation_error:' + error.message }); });
    sendResponse({ ok: true });
  });
})();

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createQueueItem, sourceUrlKey, transitionQueueItem } from '../lib/queue.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export class TaskStore {
  constructor(dataDir, leaseSeconds = 120) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, 'state.json');
    this.resultsPath = path.join(dataDir, 'results.jsonl');
    this.leaseSeconds = leaseSeconds;
    this.queue = Promise.resolve();
    fs.mkdirSync(dataDir, { recursive: true });
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.statePath)) return { tasks: {}, queue: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return parsed && parsed.tasks ? Object.assign({ queue: {} }, parsed) : { tasks: {}, queue: {} };
    } catch {
      return { tasks: {}, queue: {} };
    }
  }

  async mutate(fn) {
    const operation = this.queue.then(async () => {
      const result = await fn(this.state);
      const tempPath = this.statePath + '.' + process.pid + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2));
      fs.renameSync(tempPath, this.statePath);
      return clone(result);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async create(payload) {
    return this.mutate((state) => {
      const now = new Date().toISOString();
      const id = payload.taskId || crypto.randomUUID();
      if (state.tasks[id]) throw new Error('task_exists');
      const task = Object.assign({}, payload, {
        taskId: id,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        events: []
      });
      state.tasks[id] = task;
      return task;
    });
  }

  async next(workerId = 'chrome-extension') {
    return this.mutate((state) => {
      const nowMs = Date.now();
      for (const task of Object.values(state.tasks)) {
        if (task.status === 'leased' && Date.parse(task.leaseUntil || 0) <= nowMs) {
          task.status = 'queued';
          delete task.leaseUntil;
          delete task.workerId;
        }
      }
      const candidate = Object.values(state.tasks)
        .filter((task) => task.status === 'queued')
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
      if (!candidate) return null;
      candidate.status = 'leased';
      candidate.workerId = workerId;
      candidate.attempts += 1;
      candidate.leaseUntil = new Date(nowMs + this.leaseSeconds * 1000).toISOString();
      candidate.updatedAt = new Date().toISOString();
      return candidate;
    });
  }

  async event(taskId, event) {
    return this.mutate((state) => {
      const task = state.tasks[taskId];
      if (!task) throw new Error('task_not_found');
      const item = Object.assign({ at: new Date().toISOString() }, event);
      task.events.push(item);
      if (task.events.length > 500) task.events.splice(0, task.events.length - 500);
      task.updatedAt = item.at;
      if (event.status) task.status = event.status;
      return item;
    });
  }

  async complete(taskId, result) {
    const completed = await this.mutate((state) => {
      const task = state.tasks[taskId];
      if (!task) throw new Error('task_not_found');
      const now = new Date().toISOString();
      task.status = result.status || 'completed';
      task.result = Object.assign({}, result, { taskId, completedAt: result.completedAt || now });
      task.updatedAt = now;
      delete task.leaseUntil;
      return task;
    });
    fs.appendFileSync(this.resultsPath, JSON.stringify(completed.result) + '\n');
    return completed;
  }

  get(taskId) {
    return clone(this.state.tasks[taskId] || null);
  }

  list() {
    return clone(Object.values(this.state.tasks).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }

  async queueCreate(payload) {
    return this.mutate((state) => {
      state.queue = state.queue || {};
      const item = createQueueItem(payload);
      const key = sourceUrlKey(item.source_url);
      if (state.queue[key]) throw new Error('queue_exists');
      state.queue[key] = item;
      return item;
    });
  }

  async queueImportBacklinks(payload = {}) {
    const backlinks = Array.isArray(payload.backlinks) ? payload.backlinks : [];
    return this.mutate((state) => {
      state.queue = state.queue || {};
      const created = [];
      const existing = [];
      for (const backlink of backlinks) {
        const sourceUrl = backlink.sourceUrl || backlink.source_url;
        if (!sourceUrl) continue;
        const key = sourceUrlKey(sourceUrl);
        if (state.queue[key]) { existing.push(key); continue; }
        const item = createQueueItem({
          sourceUrl: key,
          sourceDomain: backlink.sourceDomain || backlink.source_domain,
          discoveredFrom: payload.discoveredFrom || payload.discovered_from || null,
          sourceTitle: backlink.sourceTitle || backlink.source_title || null,
          targetUrl: backlink.targetUrl || backlink.target_url || null,
          anchorText: backlink.anchorText || backlink.anchor_text || backlink.anchor || '',
          dofollow: backlink.follow ?? backlink.dofollow ?? null,
          rel: backlink.rel || [],
          placement: backlink.placement || null,
          linkType: backlink.linkType || backlink.link_type || null,
          semrushFirstSeen: backlink.firstSeen || backlink.first_seen || null,
          semrushLastSeen: backlink.lastSeen || backlink.last_seen || null
        });
        state.queue[key] = item;
        created.push(item);
      }
      return { created, existing, invalid: backlinks.length - created.length - existing.length };
    });
  }

  queueGet(sourceUrl) {
    return clone((this.state.queue || {})[sourceUrlKey(sourceUrl)] || null);
  }

  queueList() {
    return clone(Object.values(this.state.queue || {}).sort((a, b) => String(b.first_discovered_at).localeCompare(String(a.first_discovered_at))));
  }

  async queueTransition(sourceUrl, status, patch = {}) {
    return this.mutate((state) => {
      const key = sourceUrlKey(sourceUrl);
      const current = (state.queue || {})[key];
      if (!current) throw new Error('queue_not_found');
      const next = transitionQueueItem(current, status, patch);
      state.queue[key] = next;
      return next;
    });
  }
}

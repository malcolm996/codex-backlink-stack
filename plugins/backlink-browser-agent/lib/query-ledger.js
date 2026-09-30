import fs from 'node:fs';
import path from 'node:path';
import { normalizeDomain, queryKey } from './domain.js';

function today(value = new Date()) { return value.toISOString().slice(0, 10); }

export class QueryLedger {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.dailyOverviewLimit = Number(options.dailyOverviewLimit || 10);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return { version: '1.0', entries: {}, reservations: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return parsed && parsed.entries ? Object.assign({ reservations: {} }, parsed) : { version: '1.0', entries: {}, reservations: {} };
    } catch { return { version: '1.0', entries: {}, reservations: {} }; }
  }

  save() {
    const temp = this.filePath + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.filePath);
  }

  key({ provider = 'semrush-via-3ue', domain, scope = 'domain', entry = 'overview', page = 1 } = {}) {
    return queryKey({ provider, domain: normalizeDomain(domain), scope, entry, page });
  }

  get(query) { return this.state.entries[this.key(query)] || null; }

  usage(date = today()) {
    const keys = new Set();
    for (const [key, entry] of Object.entries(this.state.entries)) {
      if (entry.entry === 'overview' && String(entry.checkedAt || '').slice(0, 10) === date) keys.add(key);
    }
    for (const [key, reservation] of Object.entries(this.state.reservations || {})) {
      if (reservation.entry === 'overview' && String(reservation.reservedAt || '').slice(0, 10) === date) keys.add(key);
    }
    return keys.size;
  }

  check(query, at = new Date()) {
    const key = this.key(query);
    const cached = this.state.entries[key] || null;
    if (cached) return { allowed: true, cacheHit: true, key, cached, used: this.usage(today(at)), limit: this.dailyOverviewLimit };
    const reservation = (this.state.reservations || {})[key];
    if (reservation) {
      const ageMs = at.getTime() - Date.parse(reservation.reservedAt || 0);
      if (ageMs >= 0 && ageMs > 30 * 60 * 1000) {
        delete this.state.reservations[key];
        this.save();
      } else {
        return { allowed: false, cacheHit: false, inProgress: true, key, reservation, cached: null, used: this.usage(today(at)), limit: this.dailyOverviewLimit, reason: 'query_in_progress' };
      }
    }
    const used = this.usage(today(at));
    const isOverview = (query.entry || 'overview') === 'overview';
    if (isOverview && used >= this.dailyOverviewLimit) return { allowed: false, cacheHit: false, key, cached: null, used, limit: this.dailyOverviewLimit, reason: 'daily_overview_limit_reached' };
    return { allowed: true, cacheHit: false, key, cached: null, used, limit: this.dailyOverviewLimit };
  }

  reserve(query, taskId, at = new Date()) {
    const decision = this.check(query, at);
    if (!decision.allowed || decision.cacheHit) return decision;
    this.state.reservations = this.state.reservations || {};
    this.state.reservations[decision.key] = {
      key: decision.key,
      taskId,
      provider: query.provider || 'semrush-via-3ue',
      normalizedDomain: normalizeDomain(query.domain),
      scope: query.scope || 'domain',
      entry: query.entry || 'overview',
      reservedAt: at.toISOString()
    };
    this.save();
    return Object.assign({}, decision, { reserved: true });
  }

  record(query, result, at = new Date()) {
    const key = this.key(query);
    const entry = Object.assign({
      key,
      provider: query.provider || 'semrush-via-3ue',
      normalizedDomain: normalizeDomain(query.domain),
      scope: query.scope || 'domain',
      entry: query.entry || 'overview',
      page: Number(query.page || 1),
      checkedAt: at.toISOString()
    }, { result });
    this.state.entries[key] = entry;
    if (this.state.reservations) delete this.state.reservations[key];
    this.save();
    return entry;
  }

  release(query) {
    const key = this.key(query);
    if (this.state.reservations && this.state.reservations[key]) {
      delete this.state.reservations[key];
      this.save();
      return true;
    }
    return false;
  }

  list() { return Object.values(this.state.entries).sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt))); }
}

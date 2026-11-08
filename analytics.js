/**
 * Spending analytics for dsh-pricing.
 *
 * Reads the durable Session logs once, turns every provider-reported usage
 * record into a priced entry (the tariff in force at that record's timestamp),
 * and keeps the result in a compact on-disk index. Queries then aggregate the
 * index by day or by hour of day in any IANA time zone.
 *
 * Forked Sessions carry a copied prefix of their parent's history. Those copied
 * usage records were already paid in the parent, so they are aggregated as
 * `inherited` and never added to the fork's own cost — otherwise a fork would
 * double the parent's spend on every chart.
 *
 * @module dsh-pricing/analytics
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const INDEX_VERSION = 2;
/** Model codes keep the on-disk index small. */
const MODEL_CODES = ['deepseek-flash', 'deepseek-v4-pro'];
const DAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const toMinutes = (hm) => {
  const [hour, minute] = String(hm).split(':').map(Number);
  return hour * 60 + minute;
};

/** Wall-clock parts of an instant in one zone, cached per zone+hour. */
const partsCache = new Map();
function zonedParts(ms, zone) {
  const hourKey = `${zone}|${Math.floor(ms / 3_600_000)}`;
  const cached = partsCache.get(hourKey);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const out = {};
  for (const part of formatter.formatToParts(new Date(ms))) out[part.type] = part.value;
  const value = {
    weekday: DAY_INDEX[out.weekday] ?? 1,
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    date: `${out.year}-${out.month}-${out.day}`,
  };
  partsCache.set(hourKey, value);
  return value;
}

/** Offset of a zone from UTC at one instant. */
function zoneOffset(zone, ms) {
  const parts = zonedParts(ms, zone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(ms / 60_000) * 60_000;
}

/** Absolute instant of a local wall-clock time in one zone. */
function wallInstant(zone, year, month, day, hour, minute) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - zoneOffset(zone, naive);
  return naive - zoneOffset(zone, first);
}

/** "YYYY-MM-DD" local midnight as an absolute instant. */
function dayStart(date, zone) {
  const [year, month, day] = String(date).split('-').map(Number);
  return wallInstant(zone, year, month, day, 0, 0);
}

/** Whether the provider's peak schedule covered one instant. */
function peakAt(peak, ms) {
  if (peak === undefined || peak === null || !Array.isArray(peak.windows) || peak.windows.length === 0) return false;
  const parts = zonedParts(ms, peak.tz ?? 'UTC');
  const days = Array.isArray(peak.days) && peak.days.length > 0 ? peak.days : [1, 2, 3, 4, 5];
  if (!days.includes(parts.weekday)) return false;
  if ((peak.holidays ?? []).includes(parts.date)) return false;
  const minutes = parts.hour * 60 + parts.minute;
  return peak.windows.some((window) => {
    const from = toMinutes(window.from);
    const to = toMinutes(window.to);
    return to > from ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  });
}

/** Decompress every zstd frame of a session log. */
function readLog(file) {
  const raw = readFileSync(file);
  const offsets = [];
  for (let index = 0; index + 4 <= raw.length; index += 1) {
    if (raw.subarray(index, index + 4).equals(ZSTD_MAGIC)) offsets.push(index);
  }
  let text = '';
  for (let index = 0; index < offsets.length; index += 1) {
    const end = index + 1 < offsets.length ? offsets[index + 1] : raw.length;
    try {
      text += zstdDecompressSync(raw.subarray(offsets[index], end)).toString('utf8');
    } catch {
      /* torn trailing frame */
    }
  }
  return text;
}

/** Session titles and inherited-event counts live in the projection cache. */
function readSessionMeta(stateRoot) {
  const meta = new Map();
  const directory = join(stateRoot, 'storages', 'session_projcache', 'sessions');
  let files = [];
  try {
    files = readdirSync(directory);
  } catch {
    return meta;
  }
  for (const name of files) {
    if (!name.endsWith('.json')) continue;
    const record = readJson(join(directory, name));
    const value = record?.record?.rows?.title?.val;
    const title = typeof value === 'string' ? value : value?.text;
    meta.set(name.slice(0, -5), {
      title: typeof title === 'string' && title.length > 0 ? title : undefined,
      inherited: Number(record?.record?.identity?.inheritedEventCount ?? 0),
    });
  }
  return meta;
}

/** List every session log under the DSH home. */
function listLogs(root) {
  const logs = [];
  let groups;
  try {
    groups = readdirSync(root, { withFileTypes: true });
  } catch {
    return logs;
  }
  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const groupPath = join(root, group.name);
    let entries;
    try {
      entries = readdirSync(groupPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = join(groupPath, entry.name);
      let files;
      try {
        files = readdirSync(directory).filter((file) => /^session\.v\d+\.jsonl\.zstd$/u.test(file));
      } catch {
        continue;
      }
      if (files.length === 0) continue;
      logs.push({ key: `${group.name}/${entry.name}`, id: entry.name, project: group.name, file: join(directory, files[0]) });
    }
  }
  return logs;
}

/** Price one usage record. */
function priceUsage(usage, modelIndex, period, snapshot) {
  const table = snapshot.models?.[MODEL_CODES[modelIndex]] ?? snapshot.models?.[MODEL_CODES[0]];
  const uncached = Number(usage.uncachedInputTokens ?? usage.inputTokens ?? 0);
  const cacheRead = Number(usage.cacheReadTokens ?? 0);
  const cacheWrite = Number(usage.cacheWriteTokens ?? 0);
  const output = Number(usage.outputTokens ?? 0);
  const cost = ((uncached + cacheWrite) / 1e6) * (table.input?.[period] ?? 0)
    + (cacheRead / 1e6) * (table.cacheHit?.[period] ?? 0)
    + (output / 1e6) * (table.output?.[period] ?? 0);
  return { cost, uncached, cacheRead, cacheWrite, output };
}

/**
 * Parse one session log into compact priced entries.
 *
 * Records at or below the inherited-event limit are the fork's copied prefix:
 * they are counted separately so a fork never re-bills the parent's work.
 *
 * @param file - session log path.
 * @param fallbackModel - model used until the first request header appears.
 * @param prices - current price snapshot.
 * @param peak - peak schedule of that snapshot.
 * @param inheritedLimit - inherited event count from the projection cache.
 * @returns entries, the inherited aggregate, and the parent session id.
 */
function parseEntries(file, fallbackModel, prices, peak, inheritedLimit) {
  const entries = [];
  const inherited = { cost: 0, requests: 0, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let modelIndex = Math.max(0, MODEL_CODES.indexOf(fallbackModel));
  let parent = null;
  for (const line of readLog(file).split('\n')) {
    if (line.length === 0) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === 'session') {
      if (typeof record.parentSession === 'string') parent = record.parentSession;
      continue;
    }
    if (record.type === 'request/header') {
      const model = record?.data?.header?.config?.model;
      const index = MODEL_CODES.indexOf(model);
      if (index >= 0) modelIndex = index;
      continue;
    }
    const usage = record.type === 'assistant/message'
      ? (record.data?.message?.usage ?? record.data?.usage)
      : record.type === 'compaction/summary'
        ? record.data?.usage
        : null;
    if (usage === undefined || usage === null) continue;
    const at = Number(record.time);
    if (!Number.isFinite(at)) continue;
    const period = peakAt(peak, at) ? 'peak' : 'off';
    const priced = priceUsage(usage, modelIndex, period, prices);
    if (Number(record.seq) <= inheritedLimit) {
      inherited.cost += priced.cost;
      inherited.requests += 1;
      inherited.uncached += priced.uncached;
      inherited.cacheRead += priced.cacheRead;
      inherited.cacheWrite += priced.cacheWrite;
      inherited.output += priced.output;
      continue;
    }
    entries.push([at, Math.round(priced.cost * 1e6) / 1e6, priced.uncached, priced.cacheRead, priced.cacheWrite, priced.output, modelIndex]);
  }
  return { entries, inherited, parent };
}

/**
 * Create the analytics service for one DSH home.
 *
 * @param options.root - DSH sessions root.
 * @param options.stateRoot - DSH home.
 * @param options.stateDir - dsh-pricing state directory for the index file.
 * @param options.getPrices - current price snapshot accessor.
 * @param options.log - diagnostic logger.
 */
export function createAnalytics({ root, stateRoot, stateDir, getPrices, log }) {
  const indexFile = join(stateDir, 'analytics.json');
  const state = { building: false, done: 0, total: 0, error: null, loaded: false };
  let sessions = new Map();

  const save = () => {
    try {
      mkdirSync(dirname(indexFile), { recursive: true });
      const payload = { version: INDEX_VERSION, sessions: Object.fromEntries(sessions) };
      const temporary = `${indexFile}.tmp`;
      writeFileSync(temporary, JSON.stringify(payload), 'utf8');
      renameSync(temporary, indexFile);
    } catch (error) {
      log(`analytics save failed: ${String(error?.message ?? error)}`);
    }
  };

  const load = () => {
    if (state.loaded) return;
    state.loaded = true;
    const stored = readJson(indexFile);
    if (stored?.version !== INDEX_VERSION || typeof stored.sessions !== 'object') return;
    sessions = new Map(Object.entries(stored.sessions));
  };

  const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

  /** Refresh the index; unchanged logs keep their cached entries. */
  const build = async () => {
    if (state.building) return;
    load();
    state.building = true;
    state.error = null;
    try {
      const prices = getPrices();
      const peak = prices.peak;
      const meta = readSessionMeta(stateRoot);
      const logs = listLogs(root);
      state.total = logs.length;
      state.done = 0;
      const fallbackModel = 'deepseek-flash';
      let changed = false;
      for (const item of logs) {
        state.done += 1;
        if (state.done % 5 === 0) await yieldToLoop();
        let stat;
        try {
          stat = statSync(item.file);
        } catch {
          continue;
        }
        const info = meta.get(item.id) ?? meta.get(item.id.replace(/^session-/u, ''));
        const title = info?.title ?? sessions.get(item.key)?.title ?? item.id;
        const inheritedLimit = info?.inherited ?? 0;
        const cached = sessions.get(item.key);
        if (cached !== undefined
          && cached.size === stat.size
          && cached.mtime === stat.mtimeMs
          && cached.title === title
          && cached.inheritedLimit === inheritedLimit) continue;
        let parsed;
        try {
          parsed = parseEntries(item.file, fallbackModel, prices, peak, inheritedLimit);
        } catch (error) {
          log(`analytics parse failed for ${item.key}: ${String(error?.message ?? error)}`);
          continue;
        }
        const { entries, inherited, parent } = parsed;
        sessions.set(item.key, {
          file: item.file,
          size: stat.size,
          mtime: stat.mtimeMs,
          title,
          project: item.project,
          id: item.id,
          firstAt: entries.length > 0 ? entries[0][0] : null,
          lastAt: entries.length > 0 ? entries[entries.length - 1][0] : null,
          inheritedLimit,
          parent,
          inherited,
          entries,
        });
        changed = true;
      }
      if (changed) save();
      log(`analytics index: ${sessions.size} session logs`);
    } catch (error) {
      state.error = String(error?.message ?? error);
      log(`analytics build failed: ${state.error}`);
    } finally {
      state.building = false;
    }
  };

  const bucket = () => ({ cost: 0, requests: 0, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 });

  const add = (target, entry) => {
    target.cost += entry[1];
    target.requests += 1;
    target.uncached += entry[2];
    target.cacheRead += entry[3];
    target.cacheWrite += entry[4];
    target.output += entry[5];
  };

  /** Title of a session by id, falling back to the key. */
  const titleOf = (key) => {
    for (const [candidate, item] of sessions) {
      if (candidate === key || item.id === key) return item.title;
    }
    return key;
  };

  /**
   * Aggregate the index for one query.
   *
   * @param query - local dates, zone, optional session/model filter, sort,
   *   cursor and limit for the session page.
   */
  function query({ from, to, tz, session, model, sort = 'cost', cursor = 0, limit = 50 }) {
    load();
    const zone = tz || 'UTC';
    const modelIndex = model === undefined || model === null || model === '' ? -1 : MODEL_CODES.indexOf(model);
    const start = from ? dayStart(from, zone) : Number.NEGATIVE_INFINITY;
    const end = to ? dayStart(to, zone) + 86_400_000 : Number.POSITIVE_INFINITY;

    const totals = bucket();
    const days = new Map();
    const hours = Array.from({ length: 24 }, () => bucket());
    const rows = [];

    for (const [key, item] of sessions) {
      if (session !== undefined && session !== null && session !== '' && key !== session) continue;
      const row = bucket();
      let seen = false;
      for (const entry of item.entries) {
        if (modelIndex >= 0 && entry[6] !== modelIndex) continue;
        if (entry[0] < start || entry[0] >= end) continue;
        seen = true;
        add(row, entry);
        add(totals, entry);
        const parts = zonedParts(entry[0], zone);
        const day = days.get(parts.date) ?? bucket();
        add(day, entry);
        days.set(parts.date, day);
        add(hours[parts.hour], entry);
      }
      if (!seen) continue;
      rows.push({
        key,
        id: item.id,
        title: item.title,
        project: item.project,
        firstAt: item.firstAt,
        lastAt: item.lastAt,
        parent: item.parent ?? null,
        parentTitle: item.parent === null || item.parent === undefined ? null : titleOf(item.parent),
        inherited: item.inherited ?? null,
        ...row,
      });
    }

    rows.sort((left, right) => (sort === 'date' ? (right.lastAt ?? 0) - (left.lastAt ?? 0) : right.cost - left.cost));
    const page = rows.slice(cursor, cursor + limit);
    return {
      range: { from: from ?? null, to: to ?? null, tz: zone },
      totals,
      days: [...days.entries()]
        .map(([date, value]) => ({ date, ...value }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      hours: hours.map((value, hour) => ({ hour, ...value })),
      sessions: { rows: page, total: rows.length, nextCursor: cursor + page.length < rows.length ? cursor + page.length : null },
      peak: getPrices().peak,
    };
  }

  /** Detail of one session: its whole life, by day and by hour of day. */
  function sessionDetail(key, tz) {
    load();
    const item = sessions.get(key);
    if (item === undefined) return null;
    const zone = tz || 'UTC';
    const totals = bucket();
    const days = new Map();
    const hours = Array.from({ length: 24 }, () => bucket());
    const perModel = new Map();
    for (const entry of item.entries) {
      add(totals, entry);
      const parts = zonedParts(entry[0], zone);
      const day = days.get(parts.date) ?? bucket();
      add(day, entry);
      days.set(parts.date, day);
      add(hours[parts.hour], entry);
      const code = MODEL_CODES[entry[6]] ?? MODEL_CODES[0];
      const acc = perModel.get(code) ?? bucket();
      add(acc, entry);
      perModel.set(code, acc);
    }
    return {
      key: item.id,
      title: item.title,
      project: item.project,
      firstAt: item.firstAt,
      lastAt: item.lastAt,
      parent: item.parent ?? null,
      parentTitle: item.parent === null || item.parent === undefined ? null : titleOf(item.parent),
      inherited: item.inherited ?? null,
      totals,
      days: [...days.entries()].map(([date, value]) => ({ date, ...value })).sort((a, b) => a.date.localeCompare(b.date)),
      hours: hours.map((value, hour) => ({ hour, ...value })),
      models: [...perModel.entries()].map(([model, value]) => ({ model, ...value })),
    };
  }

  return {
    status() {
      load();
      return { building: state.building, done: state.done, total: state.total, sessions: sessions.size, error: state.error };
    },
    ensureBuilt() {
      if (!state.building && !state.loaded) build();
      return this.status();
    },
    build,
    query,
    sessionDetail,
  };
}

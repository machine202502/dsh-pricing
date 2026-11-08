/**
 * Spending analytics for dsh-pricing.
 *
 * Keeps a compact on-disk index of priced usage records per Session and answers
 * range queries bucketed by day or hour of day in any IANA zone. The parsing and
 * pricing itself lives in `ledger.js`, shared with the header chip, so both
 * surfaces account for forked Sessions in exactly the same way.
 *
 * @module dsh-pricing/analytics
 */

import { mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MODEL_CODES,
  addUsage,
  dayStart,
  emptyTotal,
  metaOf,
  parseSessionLog,
  readJson,
  readSessionMeta,
  zonedParts,
} from './ledger.js';

const INDEX_VERSION = 3;

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
      const meta = readSessionMeta(stateRoot);
      const logs = listLogs(root);
      state.total = logs.length;
      state.done = 0;
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
        const info = metaOf(meta, item.id);
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
          parsed = parseSessionLog(item.file, { prices, inheritedLimit });
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
          firstAt: entries.length > 0 ? entries[0].at : null,
          lastAt: entries.length > 0 ? entries[entries.length - 1].at : null,
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

  /** Title of a session by key or id. */
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

    const totals = emptyTotal();
    const days = new Map();
    const hours = Array.from({ length: 24 }, () => emptyTotal());
    const rows = [];

    for (const [key, item] of sessions) {
      if (session !== undefined && session !== null && session !== '' && key !== session) continue;
      const row = emptyTotal();
      let seen = false;
      for (const entry of item.entries) {
        if (modelIndex >= 0 && entry.model !== modelIndex) continue;
        if (entry.at < start || entry.at >= end) continue;
        seen = true;
        addUsage(row, entry, entry.period);
        addUsage(totals, entry, entry.period);
        const parts = zonedParts(entry.at, zone);
        const day = days.get(parts.date) ?? emptyTotal();
        addUsage(day, entry, entry.period);
        days.set(parts.date, day);
        addUsage(hours[parts.hour], entry, entry.period);
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
    const totals = emptyTotal();
    const days = new Map();
    const hours = Array.from({ length: 24 }, () => emptyTotal());
    const perModel = new Map();
    for (const entry of item.entries) {
      addUsage(totals, entry, entry.period);
      const parts = zonedParts(entry.at, zone);
      const day = days.get(parts.date) ?? emptyTotal();
      addUsage(day, entry, entry.period);
      days.set(parts.date, day);
      addUsage(hours[parts.hour], entry, entry.period);
      const code = MODEL_CODES[entry.model] ?? MODEL_CODES[0];
      const acc = perModel.get(code) ?? emptyTotal();
      addUsage(acc, entry, entry.period);
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
      models: [...perModel.entries()].map(([modelName, value]) => ({ model: modelName, ...value })),
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

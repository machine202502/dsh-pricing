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

const INDEX_VERSION = 4;

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
const state = { building: false, done: 0, total: 0, error: null, loaded: false, builtAt: null };
  let sessions = new Map();

  const save = () => {
    try {
      mkdirSync(dirname(indexFile), { recursive: true });
const payload = { version: INDEX_VERSION, builtAt: Date.now(), sessions: Object.fromEntries(sessions) };
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
    state.builtAt = Number(stored.builtAt ?? 0) || null;
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
        const { entries, inherited, parent, header } = parsed;
        sessions.set(item.key, {
          file: item.file,
          size: stat.size,
          mtime: stat.mtimeMs,
          title,
          project: item.project,
          id: header?.id ?? item.id,
          depth: Number(header?.depth ?? 0),
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
      if (state.builtAt === null) state.builtAt = Date.now();
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
  /** Session key for a session id (the map is keyed by directory name). */
  function keyOfId(id) {
    for (const [key, item] of sessions) if (item.id === id) return key;
    return null;
  }

  /** Every descendant session key, depth-first and cycle-safe. */
  function descendantKeys(sessionId) {
    const children = new Map();
    for (const [key, item] of sessions) {
      if (item.parent === null || item.parent === undefined) continue;
      if (Number(item.depth ?? 0) <= 0) continue;
      const list = children.get(item.parent) ?? [];
      list.push(item.id);
      children.set(item.parent, list);
    }
    const out = [];
    const seen = new Set([sessionId]);
    const stack = [sessionId];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const childId of children.get(current) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        const childKey = keyOfId(childId);
        if (childKey === null) continue;
        out.push(childKey);
        stack.push(childId);
      }
    }
    return out;
  }

  /** Spend of every descendant session, optionally sliced by model and instant. */
  function subagentTotals(sessionId, { model = '', sinceAt = null } = {}) {
    load();
    const modelIndex = model === undefined || model === null || model === '' ? -1 : MODEL_CODES.indexOf(model);
    const total = emptyTotal();
    const active = new Set();
    for (const key of descendantKeys(sessionId)) {
      const item = sessions.get(key);
      if (item === undefined) continue;
      for (const entry of item.entries) {
        if (modelIndex >= 0 && entry.model !== modelIndex) continue;
        if (sinceAt !== null && entry.at < sinceAt) continue;
        addUsage(total, entry, entry.period);
        active.add(key);
      }
    }
    return { ...total, sessions: active.size };
  }

  function query({ from, to, tz, session, model, sort = 'cost', cursor = 0, limit = 50, scope, split = false }) {
    load();
    const zone = tz || 'UTC';
    const modelIndex = model === undefined || model === null || model === '' ? -1 : MODEL_CODES.indexOf(model);
    const everything = scope === 'all';
    const start = !everything && from ? dayStart(from, zone) : Number.NEGATIVE_INFINITY;
    const end = !everything && to ? dayStart(to, zone) + 86_400_000 : Number.POSITIVE_INFINITY;

    const totals = emptyTotal();
    const days = new Map();
    const hours = Array.from({ length: 24 }, () => emptyTotal());
    const rows = [];

    // By default a session and all its descendants form one row, so the parent
    // shows the full spend of the chat. With `split` every session gets its own
    // row and parent rows hold only their own requests.
    const byId = new Map();
    for (const [key, item] of sessions) byId.set(item.id, key);
    const rootKeyOf = (key) => {
      let current = key;
      const seen = new Set();
      while (true) {
        if (seen.has(current)) return current;
        seen.add(current);
        const currentItem = sessions.get(current);
        if (Number(currentItem?.depth ?? 0) <= 0) return current;
        const item = sessions.get(current);
        const parentKey = item?.parent === null || item?.parent === undefined ? null : byId.get(item.parent);
        if (parentKey === null || parentKey === undefined || !sessions.has(parentKey)) return current;
        current = parentKey;
      }
    };
    const groups = new Map();
    for (const key of sessions.keys()) {
      const groupKey = split ? key : rootKeyOf(key);
      const list = groups.get(groupKey) ?? [];
      list.push(key);
      groups.set(groupKey, list);
    }

    for (const [groupKey, memberKeys] of groups) {
      if (session !== undefined && session !== null && session !== '' && groupKey !== session) continue;
      const item = sessions.get(groupKey);
      const row = emptyTotal();
      const activeDays = new Set();
      let seen = false;
      let firstAt = null;
      let lastAt = null;
      for (const memberKey of memberKeys) {
        const member = sessions.get(memberKey);
        if (member === undefined) continue;
        if (typeof member.firstAt === 'number' && (firstAt === null || member.firstAt < firstAt)) firstAt = member.firstAt;
        if (typeof member.lastAt === 'number' && (lastAt === null || member.lastAt > lastAt)) lastAt = member.lastAt;
        for (const entry of member.entries) {
          const parts = zonedParts(entry.at, zone);
          activeDays.add(parts.date);
          if (modelIndex >= 0 && entry.model !== modelIndex) continue;
          if (entry.at < start || entry.at >= end) continue;
          seen = true;
          addUsage(row, entry, entry.period);
          addUsage(totals, entry, entry.period);
          const day = days.get(parts.date) ?? emptyTotal();
          addUsage(day, entry, entry.period);
          days.set(parts.date, day);
          addUsage(hours[parts.hour], entry, entry.period);
        }
      }
      if (!seen) continue;
      rows.push({
        key: groupKey,
        id: item?.id ?? groupKey,
        title: item?.title ?? null,
        project: item?.project ?? null,
        firstAt: firstAt ?? item?.firstAt ?? null,
        lastAt: lastAt ?? item?.lastAt ?? null,
        parent: item?.parent ?? null,
        subagent: split ? Number(item?.depth ?? 0) > 0 : false,
        parentExists: item?.parent === null || item?.parent === undefined ? false : [...sessions.values()].some((candidate) => candidate.id === item.parent),
        parentTitle: item?.parent === null || item?.parent === undefined ? null : titleOf(item.parent),
        inherited: item?.inherited ?? null,
        activeDays: activeDays.size,
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
      builtAt: state.builtAt,
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
        parentExists: item.parent === null || item.parent === undefined ? false : [...sessions.values()].some((candidate) => candidate.id === item.parent),
        subagent: Number(item.depth ?? 0) > 0,
      parentTitle: item.parent === null || item.parent === undefined ? null : titleOf(item.parent),
      inherited: item.inherited ?? null,
      totals,
      days: [...days.entries()].map(([date, value]) => ({ date, ...value })).sort((a, b) => a.date.localeCompare(b.date)),
      hours: hours.map((value, hour) => ({ hour, ...value })),
      models: [...perModel.entries()].map(([modelName, value]) => ({ model: modelName, ...value })),
      subagents: subagentTotals(item.id),
    };
  }

  return {
    subagentTotals,
    status() {
      load();
      return { building: state.building, done: state.done, total: state.total, sessions: sessions.size, error: state.error, builtAt: state.builtAt };
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

/**
 * Shared ledger of priced provider usage for dsh-pricing.
 *
 * One parser, one tariff model, one definition of "inherited". Both the header
 * chip (`/session-cost`) and the spending page (`/analytics`) read their numbers
 * through this module, so a forked Session is treated the same way everywhere:
 * the copied prefix is reported separately and never billed twice.
 *
 * LOCAL ONLY. This package is never published.
 *
 * @module dsh-pricing/ledger
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

/** Model ids the price table knows, in index order. */
export const MODEL_CODES = ['deepseek-flash', 'deepseek-v4-pro'];

const DAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Read JSON, returning null on any damage. */
export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const toMinutes = (hm) => {
  const [hour, minute] = String(hm).split(':').map(Number);
  return hour * 60 + minute;
};

/** Wall-clock parts of an instant in one zone, cached per zone+hour. */
const partsCache = new Map();
export function zonedParts(ms, zone) {
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
export function zoneOffset(zone, ms) {
  const parts = zonedParts(ms, zone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(ms / 60_000) * 60_000;
}

/** Absolute instant of a local wall-clock time in one zone. */
export function wallInstant(zone, year, month, day, hour, minute) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - zoneOffset(zone, naive);
  return naive - zoneOffset(zone, first);
}

/** "YYYY-MM-DD" local midnight as an absolute instant. */
export function dayStart(date, zone) {
  const [year, month, day] = String(date).split('-').map(Number);
  return wallInstant(zone, year, month, day, 0, 0);
}

/** Whether the provider's peak schedule covered one instant. */
export function peakAt(peak, ms) {
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
export function readLog(file) {
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

/** Locate the durable log of one session under the DSH home. */
export function findSessionLog(sessionsRoot, sessionId) {
  if (typeof sessionId !== 'string' || !/^session-[0-9a-f-]+$/u.test(sessionId)) return null;
  let groups;
  try {
    groups = readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const directory = join(sessionsRoot, group.name, sessionId);
    if (!existsSync(directory)) continue;
    let files;
    try {
      files = readdirSync(directory).filter((name) => /^session\.v\d+\.jsonl\.zstd$/u.test(name));
    } catch {
      continue;
    }
    if (files.length > 0) return join(directory, files[0]);
  }
  return null;
}

/** Session titles and inherited-event counts live in the projection cache. */
export function readSessionMeta(stateRoot) {
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

/** The meta entry for one session id, tolerating the `session-` prefix mismatch. */
export function metaOf(meta, id) {
  return meta.get(id) ?? meta.get(id.replace(/^session-/u, '')) ?? meta.get(`session-${id}`) ?? null;
}

/** Price one usage record against one tariff period. */
export function priceUsage(usage, modelIndex, period, prices) {
  const table = prices.models?.[MODEL_CODES[modelIndex]] ?? prices.models?.[MODEL_CODES[0]];
  const uncached = Number(usage.uncachedInputTokens ?? usage.inputTokens ?? 0);
  const cacheRead = Number(usage.cacheReadTokens ?? 0);
  const cacheWrite = Number(usage.cacheWriteTokens ?? 0);
  const output = Number(usage.outputTokens ?? 0);
  const cost = ((uncached + cacheWrite) / 1e6) * (table.input?.[period] ?? 0)
    + (cacheRead / 1e6) * (table.cacheHit?.[period] ?? 0)
    + (output / 1e6) * (table.output?.[period] ?? 0);
  return { cost, uncached, cacheRead, cacheWrite, output };
}

/** An empty accumulator of priced usage. */
export function emptyTotal() {
  return { cost: 0, requests: 0, turns: 0, peakRequests: 0, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
}

/** Fold one priced record into an accumulator. */
export function addUsage(total, priced, period) {
  total.cost += priced.cost;
  total.requests += 1;
  total.turns += 1;
  total.uncached += priced.uncached;
  total.cacheRead += priced.cacheRead;
  total.cacheWrite += priced.cacheWrite;
  total.output += priced.output;
  if (period === 'peak') total.peakRequests += 1;
}

/**
 * Parse one session log into priced records.
 *
 * Records at or below `inheritedLimit` are the copied prefix of a forked
 * Session: they belong to the parent's bill and are returned separately.
 *
 * @param file - session log path.
 * @param options.prices - price snapshot (`models`, `peak`).
 * @param options.inheritedLimit - inherited event count, 0 for a plain session.
 * @param options.fallbackModel - model used until the first request header.
 * @returns own entries, the inherited accumulator, parent id and the record list.
 */
export function parseSessionLog(file, { prices, inheritedLimit = 0, fallbackModel = MODEL_CODES[0] } = {}) {
  const entries = [];
  const inherited = emptyTotal();
  let modelIndex = Math.max(0, MODEL_CODES.indexOf(fallbackModel));
  let parent = null;
  const header = { id: null, depth: 0 };
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
      if (typeof record.id === 'string') header.id = record.id;
      header.depth = Number(record.delegationDepth ?? 0);
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
    const period = peakAt(prices.peak, at) ? 'peak' : 'off';
    const priced = priceUsage(usage, modelIndex, period, prices);
    if (Number(record.seq) <= inheritedLimit) {
      addUsage(inherited, priced, period);
      continue;
    }
    entries.push({ at, period, model: modelIndex, ...priced });
  }
  return { entries, inherited, parent, header };
}

/** Sum entries inside a time window, optionally filtered by model. */
export function summarize(entries, { from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY, model = -1 } = {}) {
  const total = emptyTotal();
  for (const entry of entries) {
    if (entry.at < from || entry.at >= to) continue;
    if (model >= 0 && entry.model !== model) continue;
    addUsage(total, entry, entry.period);
  }
  return total;
}

/** Modification identity used to cache a parsed log. */
export function logFingerprint(file) {
  try {
    const stat = statSync(file);
    return `${file}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

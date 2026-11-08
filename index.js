/**
 * Host half of dsh-pricing: keeps the price snapshot fresh and serves it to the
 * browser-side chip over loopback.
 *
 * LOCAL ONLY. This package is never published (private, no remote, no release).
 *
 * Why a host half at all: the GUI runs in a browser context, so it cannot fetch
 * api-docs.deepseek.com itself (CORS, no cookie). The host refreshes the pricing
 * markdown, validates it, caches the last good snapshot and exposes it as JSON.
 * When the network or the page markup fails, the previous snapshot stays in
 * force and the chip says how old it is.
 *
 * @module dsh-pricing
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-pricing';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = join(HERE, 'data', 'pricing.json');
const STATE_DIR = join(process.env.LOCALAPPDATA ?? join(homedir(), '.cache'), 'dsh-pricing');
const CACHE_FILE = join(STATE_DIR, 'prices.json');
const SETTINGS_FILE = join(STATE_DIR, 'settings.json');
const RESETS_FILE = join(STATE_DIR, 'resets.json');
const LOG_FILE = join(STATE_DIR, 'plugin.log');

/** Language choices offered by the settings form; `auto` follows the app locale. */
const LANGUAGES = ['ru', 'en', 'zh', 'auto'];
const DEFAULT_SETTINGS = { language: 'ru' };

/** Price-row labels the official markdown table uses, mapped to our fields. */
const ROW_KINDS = [
  [/cache hit/i, 'cacheHit'],
  [/cache miss|input tokens/i, 'input'],
  [/output/i, 'output'],
];

/** Read a JSON file, returning null instead of throwing on a missing or broken one. */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Write JSON through a temporary file so a crash never leaves half a snapshot. */
function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}

/** Append one diagnostic line; logging never breaks the plugin. */
function log(line) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, { flag: 'a' });
  } catch {
    /* logging must never break activation */
  }
}

/**
 * Parse the official pricing markdown.
 *
 * The page publishes one row per metric and billing period, with the Flash
 * column first and the Pro column second:
 *
 *   | PRICING(2) | 1M INPUT TOKENS / (CACHE MISS) | PEAK | $0.3 | $1.32 |
 *
 * Peak hours live in prose next to the table:
 *
 *   Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday,
 *   excluding Chinese public holidays.
 *
 * @param markdown - the fetched page source.
 * @returns parsed prices and peak schedule, or undefined when nothing matched.
 */
export function parsePricingMarkdown(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return undefined;

  const prices = { flash: {}, pro: {} };
  const row = /^\|\s*PRICING[^|]*\|\s*([^|]+?)\s*\|\s*(OFF-PEAK|PEAK)\s*\|\s*\$([0-9.]+)\s*\|\s*\$([0-9.]+)\s*\|/gm;
  for (const match of markdown.matchAll(row)) {
    const kind = ROW_KINDS.find(([pattern]) => pattern.test(match[1]));
    if (kind === undefined) continue;
    const period = match[2] === 'PEAK' ? 'peak' : 'off';
    prices.flash[kind[1]] ??= {};
    prices.pro[kind[1]] ??= {};
    prices.flash[kind[1]][period] = Number(match[3]);
    prices.pro[kind[1]][period] = Number(match[4]);
  }
  if (Object.keys(prices.flash).length === 0) return undefined;

  const peak = {};
  const sentence = markdown.match(/Peak hours are\s+([^.]+?)\./i);
  if (sentence !== undefined) {
    const windows = [...sentence[1].matchAll(/(\d{2}:\d{2})\s*[-вЂ“]\s*(\d{2}:\d{2})/g)]
      .map((match) => ({ from: match[1], to: match[2] }));
    if (windows.length > 0) {
      peak.windows = windows;
      peak.tz = /UTC/i.test(sentence[1]) ? 'UTC' : 'UTC';
      peak.days = /Monday through Friday/i.test(sentence[1]) ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7];
      peak.multiplier = 2;
      peak.holidays = [];
    }
  }
  return { prices, peak };
}

/** True when every metric of every model carries a positive peak/off pair. */
function pricesComplete(models) {
  return ['deepseek-flash', 'deepseek-v4-pro'].every((id) => {
    const model = models?.[id];
    if (model === undefined) return false;
    return ['cacheHit', 'input', 'output'].every((kind) => {
      const pair = model[kind];
      return pair !== undefined && pair.off > 0 && pair.peak > 0 && pair.peak >= pair.off;
    });
  });
}

/**
 * Fold a parsed page into the snapshot the chip reads.
 *
 * Prices are replaced only as a complete, validated set: half a table (a broken
 * fetch, a redesigned page) must never leave a model with mixed periods.
 */
export function mergeSnapshot(current, parsed, url) {
  if (parsed === undefined) return undefined;
  const models = {
    ...current.models,
    'deepseek-flash': { ...current.models['deepseek-flash'], ...parsed.prices.flash },
    'deepseek-v4-pro': { ...current.models['deepseek-v4-pro'], ...parsed.prices.pro },
  };
  if (!pricesComplete(models)) return undefined;
  return {
    ...current,
    models,
    peak: parsed.peak?.windows?.length ? { ...current.peak, ...parsed.peak } : current.peak,
    source: { ...current.source, url: url ?? current.source.url, fetchedAt: Date.now() },
  };
}

/** The snapshot the chip starts from: last good cache, else the bundled file. */
function loadSnapshot() {
  const cached = readJson(CACHE_FILE);
  if (cached !== null && pricesComplete(cached.models)) return { data: cached, fromCache: true };
  const bundled = readJson(SNAPSHOT_FILE);
  if (bundled === null) throw new Error('dsh-pricing: bundled data/pricing.json is missing');
  return { data: bundled, fromCache: false };
}

/** Read the stored settings, falling back to the defaults on any damage. */
function loadSettings() {
  const stored = readJson(SETTINGS_FILE);
  const language = LANGUAGES.includes(stored?.language) ? stored.language : DEFAULT_SETTINGS.language;
  return { language };
}
function saveSettings(input) {
  const language = LANGUAGES.includes(input?.language) ? input.language : DEFAULT_SETTINGS.language;
  const next = { language };
  writeJson(SETTINGS_FILE, next);
  return next;
}

//#region session spend
const DAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of an instant in one time zone. */
function zoneParts(zone, ms) {
  const out = {};
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone ?? 'UTC',
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (const part of formatter.formatToParts(new Date(ms))) out[part.type] = part.value;
  return {
    weekday: DAY_INDEX[out.weekday] ?? 1,
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    date: `${out.year}-${out.month}-${out.day}`,
  };
}

const toMinutes = (hm) => {
  const [hour, minute] = String(hm).split(':').map(Number);
  return hour * 60 + minute;
};

/** Whether the provider's peak schedule covered one instant. */
function peakAt(peak, ms) {
  if (peak === undefined || peak === null || !Array.isArray(peak.windows) || peak.windows.length === 0) return false;
  const parts = zoneParts(peak.tz, ms);
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

/** Locate the durable session log under the DSH home. */
function findSessionLog(sessionId) {
  if (typeof sessionId !== 'string' || !/^session-[0-9a-f-]+$/u.test(sessionId)) return null;
  const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions');
  let groups;
  try {
    groups = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const directory = join(root, group.name, sessionId);
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

/** Decompress every zstd frame of a session log into one JSONL string. */
function readSessionLog(file) {
  const raw = readFileSync(file);
  const offsets = [];
  for (let index = 0; index + 4 <= raw.length; index += 1) {
    if (raw[index] === 0x28 && raw[index + 1] === 0xb5 && raw[index + 2] === 0x2f && raw[index + 3] === 0xfd) offsets.push(index);
  }
  let text = '';
  for (let index = 0; index < offsets.length; index += 1) {
    const end = index + 1 < offsets.length ? offsets[index + 1] : raw.length;
    try {
      text += zstdDecompressSync(raw.subarray(offsets[index], end)).toString('utf8');
    } catch {
      /* a torn final frame is fine */
    }
  }
  return text;
}

/** One cached parse of a session log, keyed by path/size/mtime. */
const costCache = { key: '', value: null };

/**
 * Actual spend for a session: every provider-reported usage record is priced
 * with the tariff that was in force at that record's own timestamp, so turns
 * recorded during peak stay priced at the peak rate.
 *
 * @param sessionId - session whose durable log to read.
 * @param modelId - tariff to apply (the session's selected model).
 * @param data - current price snapshot.
 */
/** The stored reset marker for one Session, if any. */
function resetOf(sessionId) {
  const stored = readJson(RESETS_FILE);
  const entry = stored !== null && typeof stored === 'object' ? stored[sessionId] : undefined;
  if (entry === undefined || !Number.isFinite(Number(entry.at))) return null;
  return { at: Number(entry.at), requests: Number(entry.requests ?? 0) };
}

/** Write or clear one Session's reset marker. */
function writeReset(sessionId, entry) {
  const stored = readJson(RESETS_FILE);
  const resets = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  if (entry === null) delete resets[sessionId];
  else resets[sessionId] = entry;
  writeJson(RESETS_FILE, resets);
}

/** One accumulator of priced provider usage. */
function emptyTotal() {
  return { cost: 0, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0, turns: 0, peakTurns: 0 };
}

/** Fold one provider usage record into an accumulator. */
function addUsage(total, usage, period, prices) {
  const uncached = Number(usage.uncachedInputTokens ?? usage.inputTokens ?? 0);
  const cacheRead = Number(usage.cacheReadTokens ?? 0);
  const cacheWrite = Number(usage.cacheWriteTokens ?? 0);
  const output = Number(usage.outputTokens ?? 0);
  total.cost += ((uncached + cacheWrite) / 1e6) * (prices.input?.[period] ?? 0);
  total.cost += (cacheRead / 1e6) * (prices.cacheHit?.[period] ?? 0);
  total.cost += (output / 1e6) * (prices.output?.[period] ?? 0);
  total.uncached += uncached;
  total.cacheRead += cacheRead;
  total.cacheWrite += cacheWrite;
  total.output += output;
  total.turns += 1;
  if (period === 'peak') total.peakTurns += 1;
}

/**
 * Actual spend for a Session: every provider-reported usage record is priced
 * with the tariff that was in force at that record's own timestamp, so turns
 * recorded during peak stay priced at the peak rate.
 *
 * Two slices come back: the whole durable log and, when a reset marker exists,
 * everything recorded at or after it.
 *
 * @param sessionId - session whose durable log to read.
 * @param modelId - tariff to apply (the session's selected model).
 * @param data - current price snapshot.
 * @param resetAt - reset marker timestamp in ms, or null.
 */
function sessionCost(sessionId, modelId, data, resetAt) {
  const file = findSessionLog(sessionId);
  if (file === null) return null;
  const prices = data.models?.[modelId] ?? data.models?.['deepseek-flash'];
  if (prices === undefined) return null;
  const stat = statSync(file);
  const key = `${file}|${stat.size}|${stat.mtimeMs}|${modelId}|${resetAt ?? 0}`;
  if (costCache.key === key) return costCache.value;

  const all = emptyTotal();
  const since = emptyTotal();
  for (const line of readSessionLog(file).split('\n')) {
    if (line.length === 0) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = record?.data?.message?.usage ?? record?.data?.usage;
    if (usage === undefined || usage === null) continue;
    const at = Number(record.time);
    const period = Number.isFinite(at) && peakAt(data.peak, at) ? 'peak' : 'off';
    addUsage(all, usage, period, prices);
    if (resetAt !== null && Number.isFinite(at) && at >= resetAt) addUsage(since, usage, period, prices);
  }
  const value = { all, since: resetAt === null ? all : since };
  costCache.key = key;
  costCache.value = value;
  return value;
}
//#endregion


/**
 * Activate the host half: load the snapshot, start the loopback bridge and
 * refresh the page in the background.
 *
 * @param ctx - plugin context; disposal closes the bridge and the timer.
 * @param config - `bridgePort`, `refreshHours`, `sourceUrl`, `officialProviders`, `models`.
 */
export function apply(ctx, config = {}) {
  const port = Number(config.bridgePort ?? 49237);
  const refreshHours = Number(config.refreshHours ?? 6);
  const sourceUrl = String(config.sourceUrl ?? '');
  const guard = {
    officialProviders: Array.isArray(config.officialProviders) ? config.officialProviders : ['deepseek-account'],
    models: Array.isArray(config.models) ? config.models : ['deepseek-flash', 'deepseek-v4-pro'],
  };

  const { data: initial, fromCache } = loadSnapshot();
  const state = {
    data: initial,
    updatedAt: initial.source?.fetchedAt ?? null,
    error: fromCache ? null : 'using the bundled snapshot until the first refresh',
    fromCache,
  };
  log(`start snapshot: ${fromCache ? 'cache' : 'bundled'} models=${Object.keys(initial.models).join(',')}`);

  /** Fetch the official page and swap in a validated snapshot. */
  const refresh = async ({ manual = false } = {}) => {
    if (sourceUrl === '') {
      state.error = 'no sourceUrl configured';
      return state;
    }
    try {
      const response = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'user-agent': 'dsh-pricing/0.1 (+local plugin)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parsePricingMarkdown(await response.text());
      const merged = mergeSnapshot(state.data, parsed, sourceUrl);
      if (merged === undefined) throw new Error('the page did not parse into a complete price table');
      state.data = merged;
      state.updatedAt = merged.source.fetchedAt;
      state.error = null;
      state.fromCache = true;
      writeJson(CACHE_FILE, merged);
      log(`refresh ok${manual ? ' (manual)' : ''}: flash input peak=${merged.models['deepseek-flash'].input.peak}`);
      return state;
    } catch (error) {
      state.error = String(error?.message ?? error);
      log(`refresh failed: ${state.error}`);
      return state;
    }
  };

  const payload = () => ({
    ...state.data,
    updatedAt: state.updatedAt,
    error: state.error,
    fromCache: state.fromCache,
    guard,
    settings: loadSettings(),
  });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'cache-control': 'no-store',
    };
    const json = (code, body) => {
      response.writeHead(code, { ...cors, 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors).end();
      return;
    }
    const path = url.pathname.replace(/\/+$/u, '');
    if (path === '/state' && request.method === 'GET') return json(200, payload());
    if (path === '/refresh' && request.method === 'POST') {
      void refresh({ manual: true }).then(() => json(200, payload()));
      return;
    }
    if (path === '/health') return json(200, { ok: true, port });
    const costPayload = (sessionId, modelId) => {
      const reset = resetOf(sessionId);
      const totals = sessionCost(sessionId, modelId, state.data, reset === null ? null : reset.at);
      return { all: totals?.all ?? null, since: totals?.since ?? null, reset };
    };
    if (path === '/session-cost' && request.method === 'GET') {
      const sessionId = url.searchParams.get('session') ?? '';
      const modelId = url.searchParams.get('model') ?? 'deepseek-flash';
      try {
        return json(200, costPayload(sessionId, modelId));
      } catch (error) {
        return json(500, { error: String(error?.message ?? error) });
      }
    }
    if (path === '/reset' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}');
        const sessionId = String(parsed.session ?? '');
        const modelId = String(parsed.model ?? 'deepseek-flash');
        const totals = sessionCost(sessionId, modelId, state.data, null);
        if (totals === null) return json(404, { error: 'session log not found' });
        writeReset(sessionId, { at: Date.now(), requests: totals.all.turns });
        log('session reset: ' + sessionId + ' at request ' + totals.all.turns);
        return json(200, costPayload(sessionId, modelId));
      } catch (error) {
        return json(400, { error: String(error?.message ?? error) });
      }
    }
    if (path === '/reset/clear' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}');
        const sessionId = String(parsed.session ?? '');
        const modelId = String(parsed.model ?? 'deepseek-flash');
        writeReset(sessionId, null);
        log('session reset cleared: ' + sessionId);
        return json(200, costPayload(sessionId, modelId));
      } catch (error) {
        return json(400, { error: String(error?.message ?? error) });
      }
    }
    if (path === '/settings' && request.method === 'GET') {
      return json(200, { values: loadSettings(), defaults: DEFAULT_SETTINGS, options: LANGUAGES });
    }
    if (path === '/settings' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}');
        const values = saveSettings(parsed);
        log(`settings saved: language=${values.language}`);
        return json(200, { values, defaults: DEFAULT_SETTINGS });
      } catch (error) {
        return json(400, { error: String(error?.message ?? error) });
      }
    }
    return json(404, { error: 'not found' });
  });

  server.on('error', (error) => log(`bridge error: ${String(error?.message ?? error)}`));
  server.listen(port, '127.0.0.1', () => log(`bridge on 127.0.0.1:${port}`));

  const timer = setInterval(() => void refresh(), Math.max(1, refreshHours) * 3_600_000);
  timer.unref?.();

  void refresh();

  ctx.on('dispose', () => {
    clearInterval(timer);
    server.close();
    log('disposed');
  });
}

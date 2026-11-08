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
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createAnalytics } from './analytics.js';
import { findSessionLog, metaOf, parseSessionLog, readSessionMeta, summarize } from './ledger.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-pricing';

const HERE = dirname(fileURLToPath(import.meta.url));
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh');
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

/** Projection metadata is reused across polls instead of re-read per request. */
const metaCache = { at: 0, value: new Map() };
function sessionMeta() {
  if (Date.now() - metaCache.at < 30_000) return metaCache.value;
  metaCache.value = readSessionMeta(DSH_HOME);
  metaCache.at = Date.now();
  return metaCache.value;
}

/** Parsed ledgers are cached by log generation and inherited-event count. */
const ledgerCache = new Map();
function sessionLedger(sessionId, prices) {
  const file = findSessionLog(join(DSH_HOME, 'sessions'), sessionId);
  if (file === null) return null;
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return null;
  }
  const info = metaOf(sessionMeta(), sessionId);
  const inheritedLimit = info?.inherited ?? 0;
  const key = file + '|' + stat.size + '|' + stat.mtimeMs + '|' + inheritedLimit;
  const cached = ledgerCache.get(key);
  if (cached !== undefined) return cached;
  const parsed = parseSessionLog(file, { prices, inheritedLimit });
  const value = { ...parsed, file, title: info?.title ?? sessionId };
  ledgerCache.set(key, value);
  if (ledgerCache.size > 8) ledgerCache.clear();
  return value;
}

/**
 * Actual spend for a Session, from the shared ledger: every provider-reported
 * record is priced with the tariff in force at its own timestamp, the copied
 * prefix of a fork is reported separately, and the reset marker slices the
 * since-reset total.
 */
function sessionCost(sessionId, modelId, data, resetAt) {
  const ledger = sessionLedger(sessionId, data);
  if (ledger === null) return null;
  return {
    all: summarize(ledger.entries),
    since: resetAt === null ? summarize(ledger.entries) : summarize(ledger.entries, { from: resetAt }),
    inherited: ledger.inherited,
    parent: ledger.parent,
    parentTitle: ledger.parent === null ? null : (metaOf(sessionMeta(), ledger.parent)?.title ?? null),
    title: ledger.title,
  };
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

  const analytics = createAnalytics({
    root: join(DSH_HOME, 'sessions'),
    stateRoot: DSH_HOME,
    stateDir: STATE_DIR,
    getPrices: () => state.data,
    log,
  });

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
      return {
        all: totals?.all ?? null,
        since: totals?.since ?? null,
        inherited: totals?.inherited ?? null,
        parent: totals?.parent ?? null,
        parentTitle: totals?.parentTitle ?? null,
        title: totals?.title ?? null,
        reset,
      };
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
    if (path === '/analytics/status' && request.method === 'GET') {
      return json(200, analytics.status());
    }
    if (path === '/analytics/build' && request.method === 'POST') {
      void analytics.build();
      return json(200, analytics.status());
    }
    if (path === '/analytics/session' && request.method === 'GET') {
      try {
        const detail = analytics.sessionDetail(url.searchParams.get('key') ?? '', url.searchParams.get('tz') ?? 'UTC');
        return json(200, { detail });
      } catch (error) {
        return json(500, { error: String(error?.message ?? error) });
      }
    }
    if (path === '/analytics' && request.method === 'GET') {
      try {
        const status = analytics.status();
        if (!status.building && status.sessions === 0) void analytics.build();
        const query = {
          from: url.searchParams.get('from') ?? undefined,
          to: url.searchParams.get('to') ?? undefined,
          tz: url.searchParams.get('tz') ?? undefined,
          session: url.searchParams.get('session') ?? undefined,
          model: url.searchParams.get('model') ?? undefined,
          sort: url.searchParams.get('sort') ?? undefined,
          cursor: Number(url.searchParams.get('cursor') ?? 0),
          limit: Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50))),
        };
        return json(200, { ready: !status.building && status.sessions > 0, status, ...analytics.query(query) });
      } catch (error) {
        return json(500, { error: String(error?.message ?? error) });
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

  // Build the spending index shortly after activation; the page can also ask.
  const buildTimer = setTimeout(() => void analytics.build(), 5_000);
  buildTimer.unref?.();

  // Keeps the analytics index close to the live logs: unchanged files are skipped
  // by size/mtime, so a refresh is a cheap stat pass.
  const analyticsTimer = setInterval(() => void analytics.build(), 5 * 60_000);
  analyticsTimer.unref?.();

  const timer = setInterval(() => void refresh(), Math.max(1, refreshHours) * 3_600_000);
  timer.unref?.();

  void refresh();

  ctx.on('dispose', () => {
    clearInterval(timer);
    server.close();
    log('disposed');
  });
}

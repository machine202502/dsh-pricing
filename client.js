/**
 * Browser half of dsh-pricing: the session-header chip, its card and the
 * language setting.
 *
 * The chip answers one question — "is it expensive right now, and until when" —
 * for the official DeepSeek provider only. Any other provider hides it, because
 * its prices are not this document's.
 *
 * @module dsh-pricing
 */

window.__ModuleLoader__.load({
  id: 'dsh-pricing',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let createPortal = null;
    try {
      createPortal = require('react-dom').createPortal;
    } catch {
      createPortal = null;
    }

    const PORT = 49237;
    const base = `http://127.0.0.1:${PORT}`;
    /** Legacy provider ids that the table bills at the Flash rate. */
    const CANONICAL = { 'deepseek-v4-flash': 'deepseek-flash' };
    const DAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const LANGUAGES = ['ru', 'en', 'zh', 'auto'];
    const LOCALES = { ru: 'ru-RU', en: 'en-US', zh: 'zh-CN' };

    const STRINGS = {
      ru: {
        peakTitle: 'Пиковый тариф',
        offTitle: 'Вне пика',
        peakBadge: 'ПИК',
        providerPeak: 'Пик у провайдера',
        yourTime: 'У вас',
        peakNow: 'Сейчас пик · до {time} ({left})',
        offNow: 'Сейчас вне пика · пик с {time} (через {left})',
        unknown: 'расписание пика неизвестно',
        input: 'вход',
        cache: 'кэш-хит',
        output: 'выход',
        offRow: 'вне пика',
        peakRow: 'пик',
        unit: 'за 1M токенов',
        days: 'Пн–Пт',
        updated: 'обновлено {ago} назад',
        bundled: 'встроенный снимок',
        failed: 'не удалось обновить',
        refresh: 'Обновить сейчас',
        refreshing: 'Обновляю…',
        chipPeakTip: 'Сейчас пиковый тариф',
        chipOffTip: 'Вне пика',
        settingsTitle: 'Язык',
        settingsHint: 'Авто — по языку приложения',
        save: 'Сохранить',
        saved: 'Сохранено',
        saveFailed: 'Не удалось сохранить',
        auto: 'Авто',
        session: 'сессия',
        spendNote: 'по фактическим токенам провайдера',
        tokensInput: 'вход',
        tokensCache: 'кэш',
        tokensOutput: 'выход',
        loading: 'Загрузка…',
      },
      en: {
        peakTitle: 'Peak pricing',
        offTitle: 'Off-peak',
        peakBadge: 'PEAK',
        providerPeak: 'Provider peak',
        yourTime: 'Your time',
        peakNow: 'Peak now · until {time} ({left})',
        offNow: 'Off-peak now · peak at {time} (in {left})',
        unknown: 'peak schedule unknown',
        input: 'input',
        cache: 'cache hit',
        output: 'output',
        offRow: 'off-peak',
        peakRow: 'peak',
        unit: 'per 1M tokens',
        days: 'Mon–Fri',
        updated: 'updated {ago} ago',
        bundled: 'bundled snapshot',
        failed: 'could not refresh',
        refresh: 'Refresh now',
        refreshing: 'Refreshing…',
        chipPeakTip: 'Peak pricing now',
        chipOffTip: 'Off-peak',
        settingsTitle: 'Language',
        settingsHint: 'Auto follows the application language',
        save: 'Save',
        saved: 'Saved',
        saveFailed: 'Could not save',
        auto: 'Auto',
        session: 'session',
        spendNote: 'from provider-reported tokens',
        tokensInput: 'input',
        tokensCache: 'cache',
        tokensOutput: 'output',
        loading: 'Loading…',
      },
      zh: {
        peakTitle: '高峰价格',
        offTitle: '非高峰',
        peakBadge: '高峰',
        providerPeak: 'Provider 高峰',
        yourTime: '你的时间',
        peakNow: '现在高峰 · 到 {time}（还剩 {left}）',
        offNow: '现在非高峰 · {time} 开始高峰（{left} 后）',
        unknown: '未提供高峰时段',
        input: '输入',
        cache: '缓存命中',
        output: '输出',
        offRow: '非高峰',
        peakRow: '高峰',
        unit: '每 1M tokens',
        days: '周一至周五',
        updated: '{ago}前更新',
        bundled: '内置快照',
        failed: '更新失败',
        refresh: '立即刷新',
        refreshing: '刷新中…',
        chipPeakTip: '当前为高峰价格',
        chipOffTip: '非高峰',
        settingsTitle: '语言',
        settingsHint: '自动跟随应用语言',
        save: '保存',
        saved: '已保存',
        saveFailed: '保存失败',
        auto: '自动',
        session: '会话',
        spendNote: '按提供方实际 token 计费',
        tokensInput: '输入',
        tokensCache: '缓存',
        tokensOutput: '输出',
        loading: '加载中…',
      },
    };

    /** Fill `{name}` holes in one localized string. */
    const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (match, key) => (values?.[key] === undefined ? match : String(values[key])));

    const CSS = `
      .dp-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); border-radius: 999px;
        background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
        line-height: 22px; cursor: default; white-space: nowrap; user-select: none; transition: border-color 120ms ease, color 120ms ease; }
      .dp-chip--peak { color: #e5484d; border-color: rgba(229,72,77,.45); background: rgba(229,72,77,.07); }
      .dp-chip--peak .dp-dot { background: #e5484d; }
      .dp-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--dsw-alias-label-tertiary); flex: none; }
      .dp-dot--stale { background: #d9a13b; }
      .dp-sep { color: var(--dsw-alias-label-tertiary); opacity: .6; }
      .dp-strong { color: inherit; font-weight: 500; }
      .dp-mute { color: var(--dsw-alias-label-tertiary); }

      .dp-tip { position: fixed; z-index: 2147483000; width: 348px; box-sizing: border-box;
        padding: 12px 14px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12));
        background: var(--dsw-alias-bg-base, #ffffff); color: var(--dsw-alias-label-primary);
        box-shadow: var(--dsw-elevation-panel, 0 12px 32px rgba(0,0,0,.18)); font-size: 12px; line-height: 17px; }
      .dp-tip-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
      .dp-tip-title { font-weight: 600; font-size: 12.5px; }
      .dp-tip-row { display: flex; justify-content: space-between; gap: 12px; }
      .dp-tip-dim { color: var(--dsw-alias-label-tertiary); }
      .dp-tip-hr { height: 1px; background: var(--dsw-alias-border-l2, rgba(0,0,0,.08)); margin: 8px 0; }
      .dp-status { color: var(--dsw-alias-label-secondary); }
      .dp-status--peak { color: #e5484d; }
      .dp-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      .dp-table th { text-align: right; font-weight: 400; color: var(--dsw-alias-label-tertiary); padding: 0 0 4px; }
      .dp-table th:first-child { text-align: left; }
      .dp-table td { text-align: right; padding: 1px 0; }
      .dp-table td:first-child { text-align: left; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .dp-row--active td { font-weight: 600; }
      .dp-row--active td:first-child { color: #e5484d; }
      .dp-tip-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
      .dp-refresh { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px;
        cursor: pointer; padding: 2px 0; text-decoration: underline; white-space: nowrap; }
      .dp-refresh:hover { color: var(--dsw-alias-label-primary); }
      .dp-refresh:disabled { opacity: .5; cursor: default; }

      .dp-set { display: flex; flex-direction: column; gap: 14px; max-width: 520px; padding: 4px 0 8px; font-size: 13px; }
      .dp-set-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
      .dp-set-hint { margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
      .dp-set-select { height: 32px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1, #dcdcdc); border-radius: 10px;
        background: var(--dsw-alias-bg-base, #fff); color: inherit; font: inherit; outline: none; }
      .dp-set-actions { display: flex; align-items: center; gap: 12px; }
      .dp-set-save { height: 34px; padding: 0 16px; border: none; border-radius: 10px;
        background: var(--dsw-alias-label-primary, #1f1f1f); color: var(--dsw-alias-bg-base, #fff); font: inherit; cursor: pointer; }
      .dp-set-save:disabled { opacity: .45; cursor: default; }
      .dp-set-status { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
      .dp-set-status--error { color: #c0392b; }
    `;

    const ensureStyles = () => {
      if (typeof document === 'undefined') return;
      if (document.querySelector('style[data-plugin="dsh-pricing"]') !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-pricing';
      tag.textContent = CSS;
      document.head.appendChild(tag);
    };

    /** Trim a price to the digits a token price actually needs. */
    const money = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      if (value === 0) return '$0';
      if (value >= 0.1) return `$${String(Number(value.toFixed(2)))}`;
      return `$${String(Number(value.toFixed(4)))}`;
    };

    /** Money for a session total: more digits while the sum is still tiny. */
    const moneySpend = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      if (value === 0) return '$0';
      if (value >= 1) return `$${value.toFixed(2)}`;
      if (value >= 0.01) return `$${value.toFixed(3)}`;
      return `$${value.toFixed(4)}`;
    };

    /** Compact token count: 12.3k, 1.02M. */
    const tokens = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0';
      if (value >= 1e6) return `${String(Number((value / 1e6).toFixed(2)))}M`;
      if (value >= 1e3) return `${String(Number((value / 1e3).toFixed(1)))}k`;
      return String(Math.round(value));
    };

    /** Wall-clock parts of an instant in one time zone. */
    const tzParts = (zone, ms) => {
      const out = {};
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
    };

    /** Offset of a zone from UTC at one instant, in milliseconds. */
    const tzOffset = (zone, ms) => {
      const parts = tzParts(zone, ms);
      return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - ms;
    };

    /** The absolute instant of a wall-clock time in one zone. */
    const instantOfWall = (zone, year, month, day, hour, minute) => {
      const naive = Date.UTC(year, month - 1, day, hour, minute);
      const first = naive - tzOffset(zone, naive);
      return naive - tzOffset(zone, first);
    };

    const toMinutes = (hm) => {
      const [hour, minute] = String(hm).split(':').map(Number);
      return hour * 60 + minute;
    };

    /** Whether the provider's peak schedule covers one instant. */
    const peakAt = (data, ms) => {
      const peak = data?.peak;
      if (peak === undefined || !Array.isArray(peak.windows) || peak.windows.length === 0) return null;
      const zone = peak.tz || 'UTC';
      const parts = tzParts(zone, ms);
      const days = Array.isArray(peak.days) && peak.days.length > 0 ? peak.days : [1, 2, 3, 4, 5];
      if (!days.includes(parts.weekday)) return false;
      if ((peak.holidays ?? []).includes(parts.date)) return false;
      const minutes = parts.hour * 60 + parts.minute;
      return peak.windows.some((window) => {
        const from = toMinutes(window.from);
        const to = toMinutes(window.to);
        return to > from ? minutes >= from && minutes < to : minutes >= from || minutes < to;
      });
    };

    /**
     * The next instant at which the peak state flips. Candidates are the window
     * edges of four consecutive provider-local days; the first one whose state
     * differs from the current state is the boundary the chip counts down to.
     */
    const nextFlip = (data, now) => {
      const peak = data?.peak;
      if (peak === undefined || !Array.isArray(peak.windows)) return null;
      const zone = peak.tz || 'UTC';
      const today = tzParts(zone, now);
      const candidates = [];
      for (let shift = -1; shift <= 2; shift += 1) {
        const date = new Date(Date.UTC(today.year, today.month - 1, today.day + shift));
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        for (const window of peak.windows) {
          const [fromHour, fromMinute] = String(window.from).split(':').map(Number);
          const [toHour, toMinute] = String(window.to).split(':').map(Number);
          const wraps = toMinutes(window.to) <= toMinutes(window.from);
          candidates.push(instantOfWall(zone, year, month, day, fromHour, fromMinute));
          candidates.push(instantOfWall(zone, year, month, day + (wraps ? 1 : 0), toHour, toMinute));
        }
      }
      const current = peakAt(data, now);
      const future = candidates.filter((at) => at > now).sort((left, right) => left - right);
      for (const at of future) {
        const state = peakAt(data, at + 1000);
        if (state !== current) return { at, toPeak: state === true };
      }
      return null;
    };

    /** "2 ч 41 мин" / "2 h 41 min" / "2 小时 41 分钟". */
    const duration = (ms, language) => {
      if (!Number.isFinite(ms) || ms <= 0) return language === 'ru' ? 'меньше минуты' : language === 'zh' ? '不到一分钟' : 'less than a minute';
      const minutes = Math.round(ms / 60000);
      if (minutes < 1) return language === 'ru' ? 'меньше минуты' : language === 'zh' ? '不到一分钟' : 'less than a minute';
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      if (language === 'ru') {
        if (hours === 0) return `${rest} мин`;
        return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
      }
      if (language === 'zh') {
        if (hours === 0) return `${rest} 分钟`;
        return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
      }
      if (hours === 0) return `${rest} min`;
      return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
    };

    /** Local wall-clock time of an instant, e.g. "09:00". */
    const clock = (ms, language) => new Date(ms).toLocaleTimeString(LOCALES[language] ?? 'en-US', { hour: '2-digit', minute: '2-digit' });

    /** "обновлено 5 мин назад". */
    const age = (from, now, language, strings) => {
      if (typeof from !== 'number') return strings.bundled;
      return fill(strings.updated, { ago: duration(now - from, language) });
    };

    /** The provider-local windows rendered in the reader's own time zone. */
    const localWindows = (data, now, language) => {
      const peak = data?.peak;
      if (peak === undefined || !Array.isArray(peak.windows)) return '';
      const zone = peak.tz || 'UTC';
      const today = tzParts(zone, now);
      return peak.windows
        .map((window) => {
          const [fromHour, fromMinute] = String(window.from).split(':').map(Number);
          const [toHour, toMinute] = String(window.to).split(':').map(Number);
          const start = instantOfWall(zone, today.year, today.month, today.day, fromHour, fromMinute);
          const wraps = toMinutes(window.to) <= toMinutes(window.from);
          const end = instantOfWall(zone, today.year, today.month, today.day + (wraps ? 1 : 0), toHour, toMinute);
          return `${clock(start, language)}–${clock(end, language)}`;
        })
        .join(', ');
    };

    const providerWindows = (data) => {
      const peak = data?.peak;
      if (peak === undefined || !Array.isArray(peak.windows)) return '';
      return `${peak.windows.map((window) => `${window.from}–${window.to}`).join(', ')} ${peak.tz || 'UTC'}`;
    };

    const providerZoneLabel = (data) => (data?.peak?.tz === undefined ? 'UTC' : data.peak.tz);

    /** Local UTC offset label, e.g. "UTC+5". */
    const localZoneLabel = (now) => {
      const offset = -new Date(now).getTimezoneOffset() / 60;
      if (offset === 0) return 'UTC';
      return `UTC${offset > 0 ? '+' : ''}${String(Number(offset.toFixed(1)))}`;
    };

    /** Subscribe to one Cordis store, tolerating a store without subscribe. */
    const useStore = (store) => {
      const subscribe = React.useCallback(
        (notify) => {
          if (store === null || store === undefined || typeof store.subscribe !== 'function') return () => {};
          const dispose = store.subscribe(notify);
          return typeof dispose === 'function' ? dispose : () => {};
        },
        [store],
      );
      const snapshot = React.useCallback(() => (store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : null), [store]);
      return React.useSyncExternalStore(subscribe, snapshot, snapshot);
    };

    /** The language an unset preference follows: the application's own locale. */
    const detectLanguage = () => {
      const raw = String((typeof document === 'undefined' ? '' : document.documentElement?.lang) || (typeof navigator === 'undefined' ? '' : navigator.language) || 'en').toLowerCase();
      if (raw.startsWith('ru')) return 'ru';
      if (raw.startsWith('zh')) return 'zh';
      return 'en';
    };

    const resolveLanguage = (settings) => {
      const preference = settings?.language;
      if (preference === 'ru' || preference === 'en' || preference === 'zh') return preference;
      return detectLanguage();
    };

    const loadState = async () => {
      const response = await fetch(`${base}/state`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };

    function PriceTooltip({ data, language, placement, refreshing, now, onRefresh, spend }) {
      const strings = STRINGS[language];
      const peak = peakAt(data, now);
      const flip = nextFlip(data, now);
      const period = peak === true ? 'peak' : 'off';
      const ids = Object.keys(data.models ?? {});
      const zone = providerZoneLabel(data);

      const status = peak === null
        ? strings.unknown
        : peak
          ? fill(strings.peakNow, { time: flip ? clock(flip.at, language) : '—', left: flip ? duration(flip.at - now, language) : '—' })
          : flip
            ? fill(strings.offNow, { time: clock(flip.at, language), left: duration(flip.at - now, language) })
            : strings.offTitle;

      const rows = [];
      for (const id of ids) {
        const model = data.models[id];
        for (const kind of ['off', 'peak']) {
          rows.push(h('tr', {
            key: `${id}-${kind}`,
            className: kind === period ? 'dp-row--active' : undefined,
          },
            h('td', null, `${model.short ?? id} · ${kind === 'peak' ? strings.peakRow : strings.offRow}`),
            h('td', null, money(model.input?.[kind])),
            h('td', null, money(model.cacheHit?.[kind])),
            h('td', null, money(model.output?.[kind])),
          ));
        }
      }

      return h('div', {
        className: 'dp-tip',
        style: { top: `${placement.top}px`, left: `${placement.left}px` },
      },
        h('div', { className: 'dp-tip-head' },
          h('span', { className: 'dp-tip-title' }, peak === true ? strings.peakTitle : strings.offTitle),
          h('span', { className: 'dp-tip-dim' }, strings.unit),
        ),
        h('div', { className: 'dp-tip-row' },
          h('span', { className: 'dp-tip-dim' }, `${strings.providerPeak}: ${providerWindows(data)}`),
        ),
        h('div', { className: 'dp-tip-row' },
          h('span', { className: 'dp-tip-dim' }, `${strings.yourTime} (${localZoneLabel(now)}): ${localWindows(data, now, language)}, ${strings.days}`),
        ),
        h('div', { className: 'dp-tip-hr' }),
        h('div', { className: `dp-status${peak === true ? ' dp-status--peak' : ''}` }, status),
        h('div', { className: 'dp-tip-hr' }),
        h('table', { className: 'dp-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, ''),
              h('th', null, strings.input),
              h('th', null, strings.cache),
              h('th', null, strings.output),
            ),
          ),
          h('tbody', null, rows),
        ),
        h('div', { className: 'dp-tip-hr' }),
        spend !== null && spend.turns > 0
          ? h('div', null,
              h('div', { className: 'dp-tip-row' },
                h('span', null, strings.session),
                h('span', { className: 'dp-strong' }, `${spend.approximate ? '~' : ''}${moneySpend(spend.cost)}`),
              ),
              h('div', { className: 'dp-tip-row' },
                h('span', { className: 'dp-tip-dim' },
                  `${strings.tokensInput} ${tokens(spend.uncached + spend.cacheWrite)} · ${strings.tokensCache} ${tokens(spend.cacheRead)} · ${strings.tokensOutput} ${tokens(spend.output)}`),
              ),
              h('div', { className: 'dp-tip-row' },
                h('span', { className: 'dp-tip-dim' }, strings.spendNote),
              ),
            )
          : null,
        h('div', { className: 'dp-tip-hr' }),
        h('div', { className: 'dp-tip-foot' },
          h('span', { className: 'dp-tip-dim' }, `${age(data.updatedAt, now, language, strings)}${data.error ? ` · ${strings.failed}` : ''}`),
          h('button', {
            type: 'button',
            className: 'dp-refresh',
            disabled: refreshing === true,
            onClick: (event) => {
              event.stopPropagation();
              onRefresh();
            },
          }, refreshing === true ? strings.refreshing : strings.refresh),
        ),
      );
    }

    function PricingChip({ sessionId, sessions }) {
      ensureStyles();
      const [data, setData] = React.useState(null);
      const [now, setNow] = React.useState(() => Date.now());
      const [hovered, setHovered] = React.useState(false);
      const [pinned, setPinned] = React.useState(false);
      const [refreshing, setRefreshing] = React.useState(false);
      const [spendCost, setSpendCost] = React.useState(null);
      const chipRef = React.useRef(null);
      const [placement, setPlacement] = React.useState({ top: 0, left: 0 });

      // The durable projection the model selector writes: { lastUsed, pending }.
      const store = React.useMemo(() => {
        try {
          return sessions?.binding?.(sessionId)?.session?.projections?.faceOf?.('modelSelection') ?? null;
        } catch {
          return null;
        }
      }, [sessions, sessionId]);
      const projection = useStore(store);
      const selection = projection?.pending ?? projection?.lastUsed ?? null;

      React.useEffect(() => {
        let alive = true;
        const load = async () => {
          try {
            const body = await loadState();
            if (alive) setData(body);
          } catch {
            /* the host half may still be starting */
          }
        };
        void load();
        const id = setInterval(load, 5 * 60_000);
        const onSettings = () => void load();
        window.addEventListener('dsh-pricing:settings', onSettings);
        return () => {
          alive = false;
          clearInterval(id);
          window.removeEventListener('dsh-pricing:settings', onSettings);
        };
      }, []);

      React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
      }, []);

      React.useEffect(() => {
        if (!pinned) return undefined;
        const dismiss = () => setPinned(false);
        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
      }, [pinned]);

      // Actual session spend comes from the host: it reads the durable session
      // log, prices each recorded request with the tariff in force at that
      // request's own time and caches the result per log generation.
      React.useEffect(() => {
        if (sessionId === undefined || selection === null) return undefined;
        const tariffModel = CANONICAL[selection.model] ?? selection.model;
        let alive = true;
        const load = async () => {
          try {
            const response = await fetch(`${base}/session-cost?session=${encodeURIComponent(sessionId)}&model=${encodeURIComponent(tariffModel)}`, { cache: 'no-store' });
            if (!response.ok) return;
            const body = await response.json();
            if (alive) setSpendCost(body.cost ?? null);
          } catch {
            /* the host half may still be starting */
          }
        };
        void load();
        const id = setInterval(load, 60_000);
        return () => {
          alive = false;
          clearInterval(id);
        };
      }, [sessionId, selection]);

      const show = hovered || pinned;
      const place = React.useCallback(() => {
        const rect = chipRef.current?.getBoundingClientRect();
        if (rect === undefined) return;
        setPlacement({ top: rect.bottom + 8, left: Math.max(12, Math.min(rect.right - 348, window.innerWidth - 360)) });
      }, []);
      // Place the card under the chip as soon as it opens, and keep it there when
      // the window resizes: the header clips overflow, so the card lives in body
      // coordinates.
      React.useLayoutEffect(() => {
        if (!show) return undefined;
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
      }, [show, place, data]);

      if (data === null || selection === null) return null;

      const language = resolveLanguage(data.settings);
      const strings = STRINGS[language];
      const guard = data.guard ?? {};
      const officialProviders = guard.officialProviders ?? [];
      const guardedModels = guard.models ?? [];
      const providerOk = officialProviders.includes(selection.provider);
      const modelId = CANONICAL[selection.model] ?? selection.model;
      const modelOk = guardedModels.includes(selection.model) && data.models?.[modelId] !== undefined;
      if (!providerOk || !modelOk) return null;

      const peak = peakAt(data, now);
      const period = peak === true ? 'peak' : 'off';
      const flip = nextFlip(data, now);
      const ids = Object.keys(data.models);
      const shown = ids.slice(0, 2);
      const label = shown.map((id) => `${data.models[id].short ?? id} ${money(data.models[id].input?.[period])}`).join(' · ');
      const stale = data.error !== undefined && data.error !== null;
      const spend = spendCost;



      return h('span', { className: 'dp-wrap', style: { position: 'relative', display: 'inline-flex' } },
        h('button', {
          ref: chipRef,
          type: 'button',
          className: `dp-chip${peak === true ? ' dp-chip--peak' : ''}`,
          onMouseEnter: () => { setHovered(true); place(); },
          onMouseLeave: () => setHovered(false),
          onClick: () => { place(); setPinned((value) => !value); },
          onFocus: () => { setHovered(true); place(); },
          onBlur: () => setHovered(false),
          title: peak === true ? strings.chipPeakTip : strings.chipOffTip,
        },
          h('span', { className: `dp-dot${stale ? ' dp-dot--stale' : ''}` }),
          peak === true ? h('span', { className: 'dp-strong' }, strings.peakBadge) : null,
          peak === true ? h('span', { className: 'dp-sep' }, '·') : null,
          h('span', { className: 'dp-strong' }, label),
          peak === true && flip !== null ? h('span', { className: 'dp-mute' }, ` · ${clock(flip.at, language)}`) : null,
          spend !== null && spend.turns > 0 ? h('span', { className: 'dp-sep' }, '·') : null,
          spend !== null && spend.turns > 0 ? h('span', { className: 'dp-mute' }, `${strings.session} ${spend.approximate ? '~' : ''}${moneySpend(spend.cost)}`) : null,
        ),
        show && createPortal !== null
          ? createPortal(h(PriceTooltip, {
              data,
              language,
              placement,
              now,
              refreshing,
              spend,
              onRefresh: async () => {
                setRefreshing(true);
                try {
                  const response = await fetch(`${base}/refresh`, { method: 'POST' });
                  if (response.ok) setData(await response.json());
                } catch {
                  /* keep the shown snapshot */
                } finally {
                  setRefreshing(false);
                  setNow(Date.now());
                }
              },
            }), document.body)
          : null,
      );
    }

    function PricingSettings() {
      ensureStyles();
      const [state, setState] = React.useState({ status: 'loading', values: {}, defaults: {} });
      const [saving, setSaving] = React.useState(false);
      const [notice, setNotice] = React.useState({ text: '', error: false });

      React.useEffect(() => {
        let alive = true;
        fetch(`${base}/settings`, { cache: 'no-store' })
          .then((response) => response.json())
          .then((body) => {
            if (alive) setState({ status: 'ready', values: body.values ?? {}, defaults: body.defaults ?? {} });
          })
          .catch(() => {
            if (alive) setState({ status: 'error', values: {}, defaults: {} });
          });
        return () => {
          alive = false;
        };
      }, []);

      const language = state.values.language ?? state.defaults.language ?? 'ru';
      const language_now = language === 'auto' ? detectLanguage() : language;
      const strings = STRINGS[language_now];

      const save = async () => {
        setSaving(true);
        setNotice({ text: '', error: false });
        try {
          const response = await fetch(`${base}/settings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ language }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
          setState({ status: 'ready', values: body.values ?? {}, defaults: body.defaults ?? {} });
          setNotice({ text: STRINGS[language_now].saved, error: false });
          window.dispatchEvent(new CustomEvent('dsh-pricing:settings'));
        } catch (error) {
          setNotice({ text: `${STRINGS[language_now].saveFailed}: ${String(error?.message ?? error)}`, error: true });
        } finally {
          setSaving(false);
        }
      };

      if (state.status === 'loading') return h('div', { className: 'dp-set' }, h('span', { className: 'dp-tip-dim' }, STRINGS[language_now].loading));

      const options = [
        ['ru', 'Русский'],
        ['en', 'English'],
        ['zh', '中文'],
        ['auto', strings.auto],
      ];

      return h('div', { className: 'dp-set' },
        h('div', { className: 'dp-set-row' },
          h('div', null,
            h('div', null, strings.settingsTitle),
            h('div', { className: 'dp-set-hint' }, strings.settingsHint),
          ),
          h('select', {
            className: 'dp-set-select',
            value: language,
            onChange: (event) => setState((previous) => ({ ...previous, values: { ...previous.values, language: event.target.value } })),
          }, options.map(([value, text]) => h('option', { key: value, value }, text))),
        ),
        h('div', { className: 'dp-set-actions' },
          h('button', { type: 'button', className: 'dp-set-save', onClick: save, disabled: saving === true },
            saving ? '…' : strings.save),
          notice.text ? h('span', { className: `dp-set-status${notice.error ? ' dp-set-status--error' : ''}` }, notice.text) : null,
        ),
      );
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        ensureStyles();
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'pricing',
            order: 500,
            // The slot hands over sessionId and `t`; the sessions service has to
            // come from the plugin scope, so pass it through the entry inject.
            inject: () => ({ sessions: ctx.sessions }),
          },
          (props) => h(PricingChip, props),
        ));

        try {
          ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config',
            key: 'dsh-pricing#pricing',
          }, () => h(PricingSettings)));
        } catch (error) {
          console.warn('dsh-pricing: settings form registration failed', error);
        }
      },
    };
  },
});

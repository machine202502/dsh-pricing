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
  id: '@machine202502/dsh-pricing',
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
        chipOffTipAt: 'Вне пика · пик в {time}',
        settingsTitle: 'Язык',
        settingsHint: 'Авто — по языку приложения',
        save: 'Сохранить',
        saved: 'Сохранено',
        saveFailed: 'Не удалось сохранить',
        auto: 'Авто',
        session: 'сессия',
        sessionTitle: 'Сессия',
        nowTag: 'сейчас',
        spendNote: 'по фактическим токенам провайдера',
        inheritedLine: 'Унаследовано из «{title}»: {cost} · не входит в сумму',
        inheritedPrefix: 'Унаследовано из',
        subagentsLine: 'включая суб-агентов',
        archive: 'архив',
        tokensInput: 'вход',
        tokensCache: 'кэш',
        tokensOutput: 'выход',
        sinceReset: 'С последнего сброса',
        resetButton: 'Сбросить',
        clearReset: 'Снять сброс',
        resetHint: 'Новая точка отсчёта для этого чата: сумма и токены считаются с этого момента',
        resetAt: 'сброшено {when}',
        resetFrom: 'с запроса №{count}',
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
        chipOffTipAt: 'Off-peak · peak at {time}',
        settingsTitle: 'Language',
        settingsHint: 'Auto follows the application language',
        save: 'Save',
        saved: 'Saved',
        saveFailed: 'Could not save',
        auto: 'Auto',
        session: 'session',
        sessionTitle: 'Session',
        nowTag: 'now',
        spendNote: 'from provider-reported tokens',
        inheritedLine: 'Inherited from «{title}»: {cost} · excluded from totals',
        inheritedPrefix: 'Inherited from',
        subagentsLine: 'including sub-agents',
        archive: 'archive',
        tokensInput: 'input',
        tokensCache: 'cache',
        tokensOutput: 'output',
        sinceReset: 'Since the last reset',
        resetButton: 'Reset',
        clearReset: 'Clear reset',
        resetHint: 'A new starting point for this chat: the sum and the tokens count from this moment',
        resetAt: 'reset {when}',
        resetFrom: 'from request #{count}',
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
        chipOffTipAt: '非高峰 · {time} 开始高峰',
        settingsTitle: '语言',
        settingsHint: '自动跟随应用语言',
        save: '保存',
        saved: '已保存',
        saveFailed: '保存失败',
        auto: '自动',
        session: '会话',
        sessionTitle: '会话',
        nowTag: '当前',
        spendNote: '按提供方实际 token 计费',
        inheritedLine: '继承自「{title}」：{cost} · 不计入合计',
        inheritedPrefix: '继承自',
        subagentsLine: '含子代理',
        archive: '归档',
        tokensInput: '输入',
        tokensCache: '缓存',
        tokensOutput: '输出',
        sinceReset: '自上次重置',
        resetButton: '重置',
        clearReset: '清除重置',
        resetHint: '为此会话设定新的起点：金额与 token 从此刻开始计算',
        resetAt: '重置于 {when}',
        resetFrom: '从第 {count} 次请求起',
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
      /* Red is the price signal (peak), blue is the "you are here" signal. */
      .dp-row--peak td { color: #e5484d; }
      .dp-row--peak td:first-child { font-weight: 500; }
      .dp-row--active { background: rgba(47,107,255,.055); }
      .dp-row--active td { font-weight: 600; }
      .dp-row--active td:first-child { color: #2f6bff; }
      .dp-now-dot { display: inline-block; width: 6px; height: 6px; border-radius: 3px; background: #2f6bff; margin-right: 6px; vertical-align: 1px; }
      .dp-now-tag { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 999px; font-size: 10.5px; line-height: 14px;
        font-weight: 500; color: #2f6bff; background: rgba(47,107,255,.1); }
      .dp-tip-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
      .dp-arch { margin-left: 6px; padding: 0 5px; border-radius: 999px; font-size: 10px; line-height: 14px;
        border: 1px dashed var(--dsw-alias-label-tertiary); color: var(--dsw-alias-label-tertiary); }
      .dp-link { border: 0; background: none; padding: 0; font: inherit; color: #2f6bff; cursor: pointer; text-decoration: underline; }
      .dp-link:disabled { color: var(--dsw-alias-label-tertiary); text-decoration: none; cursor: default; }
      .dp-refresh { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px;
        cursor: pointer; padding: 2px 0; text-decoration: underline; white-space: nowrap; }
      .dp-refresh:hover { color: var(--dsw-alias-label-primary); }
      .dp-refresh:disabled { opacity: .5; cursor: default; }
      .dp-tip-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
      .dp-reset { height: 26px; padding: 0 12px; border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.16)); background: transparent; color: var(--dsw-alias-label-primary); }
      .dp-reset:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
      .dp-clear { border: 0; background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 11.5px;
        cursor: pointer; padding: 2px 0; text-decoration: underline; }
      .dp-reset:disabled, .dp-clear:disabled { opacity: .5; cursor: default; }
      .an-page { width: 100%; height: 100%; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.45; }
      .an-content { max-width: 1100px; margin: 0 auto; padding: 26px clamp(16px, 4vw, 40px) 48px; box-sizing: border-box; }
      .an-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
      .an-h1 { font-size: 18px; font-weight: 600; margin: 0; }
      .an-link { border: 0; background: none; color: var(--dsw-alias-label-secondary); font: inherit; cursor: pointer; padding: 0; }
      .an-link:hover { color: var(--dsw-alias-label-primary); }
      .an-sub { margin: 0 0 14px; color: var(--dsw-alias-label-secondary); }
      .an-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-bottom: 14px; }
      .an-presets, .an-seg { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); border-radius: 10px; }
      .an-tab { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
        padding: 5px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
      .an-tab:hover { color: var(--dsw-alias-label-primary); }
      .an-tab--on { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); color: var(--dsw-alias-label-primary); font-weight: 500; }
      .an-custom { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); }
      .an-custom input, .an-selects select { height: 28px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.16));
        border-radius: 8px; background: var(--dsw-alias-bg-base, #fff); color: inherit; font: inherit; font-size: 12px; }
      .an-selects { display: inline-flex; align-items: center; gap: 14px; margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .an-selects label { display: inline-flex; align-items: center; gap: 6px; }
      .an-note { padding: 10px 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .an-note--error { color: #c0392b; }
      .an-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px; }
      .an-card { border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
      .an-kpi-label { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
      .an-kpi-value { font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .an-kpi-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
      .an-chart-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .an-btn { height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.16)); border-radius: 8px;
        background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
      .an-btn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
      .an-btn:disabled { opacity: .5; cursor: default; }
      .an-btn--open { border-color: rgba(47,107,255,.45); color: #2f6bff; }
      .an-btn--open:hover:not(:disabled) { background: rgba(47,107,255,.08); color: #2f6bff; }
      .an-iconbtn { width: 28px; height: 28px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.16)); border-radius: 8px;
        background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
      .an-iconbtn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
      .an-badge--muted { background: transparent; border: 1px dashed var(--dsw-alias-label-tertiary); color: var(--dsw-alias-label-tertiary); }
      .an-toolbar { margin-left: auto; display: inline-flex; align-items: center; gap: 10px; }
      .an-chart-wrap { position: relative; }
      .an-hover { position: absolute; top: -26px; transform: translateX(-50%); z-index: 3; pointer-events: none;
        padding: 2px 8px; border-radius: 6px; background: var(--dsw-alias-label-primary, #1b1b1f); color: var(--dsw-alias-bg-base, #fff);
        font-size: 11px; white-space: nowrap; }
      .an-bar-cell--on .an-bar { opacity: 1; }
      .an-open { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px;
        cursor: pointer; padding: 0; line-height: 18px; }
      .an-open:hover { color: #2f6bff; }
      .an-badge + .an-badge { margin-left: 4px; }
      .an-chart { display: flex; align-items: flex-end; gap: 3px; height: 130px; padding: 6px 0 2px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08)); }
      .an-chart { justify-content: flex-start; }
      .an-bar-cell { flex: 1 1 0; min-width: 4px; max-width: 64px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; cursor: pointer; }
      .an-bar-track { width: 100%; height: 100px; display: flex; align-items: flex-end; }
      .an-bar { width: 100%; min-height: 1px; background: #2f6bff; opacity: .75; border-radius: 3px 3px 0 0; }
      .an-bar-cell:hover .an-bar { opacity: 1; }
      .an-bar-label { font-size: 9.5px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
      .an-table { margin-top: 12px; }
      .an-table-head, .an-table-row { display: grid; grid-template-columns: minmax(0, 1fr) 112px 88px 64px 44px 78px 26px; align-items: center; gap: 8px; width: 100%; }
      .an-table-head { padding: 6px 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08)); }
      .an-table-row { border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 8px 4px; cursor: pointer; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.05)); }
      .an-table-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04)); }
      .an-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .an-right { text-align: right; font-variant-numeric: tabular-nums; }
      .an-strong { font-weight: 600; }
      .an-dim { color: var(--dsw-alias-label-tertiary); }
      .an-more { display: flex; justify-content: center; padding: 12px 0; }
      .an-days { margin-top: 12px; }
      .an-crumbs { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; flex-wrap: wrap; }
      .an-crumb { color: var(--dsw-alias-label-tertiary); }
      .an-crumb--last { color: var(--dsw-alias-label-primary); }
      .an-back { border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); background: transparent; color: var(--dsw-alias-label-secondary);
        font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 8px; cursor: pointer; }
      .an-back:hover { color: var(--dsw-alias-label-primary); }
      .an-arrows { display: inline-flex; gap: 4px; }
      .an-arrow { width: 26px; height: 28px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); background: transparent;
        border-radius: 8px; color: var(--dsw-alias-label-secondary); font: inherit; cursor: pointer; }
      .an-arrow:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
      .an-range { height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.14)); border-radius: 8px;
        background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
      .an-range--open { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
      .an-cal { width: 300px; margin: 0 0 14px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); border-radius: 12px; padding: 10px 12px; }
      .an-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .an-cal-month { font-size: 12.5px; font-weight: 500; text-transform: capitalize; }
      .an-cal-nav { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 16px; cursor: pointer; padding: 0 6px; }
      .an-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .an-cal-week { font-size: 10px; color: var(--dsw-alias-label-tertiary); text-align: center; padding: 2px 0; }
      .an-cal-day { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
        height: 26px; border-radius: 6px; cursor: pointer; }
      .an-cal-day:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
      .an-cal-day--in { background: rgba(47,107,255,.1); color: var(--dsw-alias-label-primary); }
      .an-cal-day--edge { background: #2f6bff; color: #fff; }
      .an-badge { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 999px; font-size: 10px; line-height: 14px;
        color: var(--dsw-alias-label-tertiary); background: rgba(0,0,0,.06); vertical-align: 1px; }
      .an-forkline { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary); flex-wrap: wrap; }
      .an-fork { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 999px; font-size: 10px; line-height: 14px;
        color: var(--dsw-alias-label-tertiary); background: rgba(0,0,0,.06); vertical-align: 1px; }
      .an-sub--fork { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
      .an-day-row { display: grid; grid-template-columns: 90px 120px 1fr; gap: 10px; padding: 6px 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.05)); font-variant-numeric: tabular-nums; }

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

    /**
     * A clock time that names the day when it is not today, e.g. "06:00" but
     * "Mon 06:00". A weekend night's next peak is Monday's, and without the day
     * the chip reads as if the peak starts at an hour that has already passed.
     */
    const dayClock = (ms, now, language) => {
      const text = clock(ms, language);
      if (new Date(ms).toDateString() === new Date(now).toDateString()) return text;
      const weekday = new Date(ms).toLocaleDateString(LOCALES[language] ?? 'en-US', { weekday: 'short' });
      return `${weekday} ${text}`;
    };

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

    /** The language stored in the plugin settings; chip and page share it. */
    let uiLanguage = 'ru';

    const loadState = async () => {
      const response = await fetch(`${base}/state`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      uiLanguage = resolveLanguage(body.settings);
      return body;
    };

    function PriceTooltip({ data, language, placement, refreshing, now, onRefresh, spendAll, spendSince, inherited, parentTitle, parentLive, parentArchived, subagents, reset, resetting, when, onReset, onClearReset, onOpenSession }) {
      const strings = STRINGS[language];
      const spendBlock = (label, spend, extra) => (spend === null || spend.turns === 0
        ? h('div', { className: 'dp-tip-row' },
            h('span', null, label),
            h('span', { className: 'dp-tip-dim' }, '—'),
          )
        : h('div', null,
            h('div', { className: 'dp-tip-row' },
              h('span', null, label),
              h('span', { className: 'dp-strong' }, `${spend.approximate ? '~' : ''}${moneySpend(spend.cost)}`),
            ),
            h('div', { className: 'dp-tip-row' },
              h('span', { className: 'dp-tip-dim' },
                `${strings.tokensInput} ${tokens(spend.uncached + spend.cacheWrite)} · ${strings.tokensCache} ${tokens(spend.cacheRead)} · ${strings.tokensOutput} ${tokens(spend.output)}`),
            ),
            extra !== null && extra !== undefined && extra.sessions > 0
              ? h('div', { className: 'dp-tip-row' },
                  h('span', { className: 'dp-tip-dim' }, `${strings.subagentsLine}: ${moneySpend(extra.cost)} · ${extra.sessions}`),
                )
              : null,
          ));
      const peak = peakAt(data, now);
      const flip = nextFlip(data, now);
      const period = peak === true ? 'peak' : 'off';
      const ids = Object.keys(data.models ?? {});
      const zone = providerZoneLabel(data);

      const status = peak === null
        ? strings.unknown
        : peak
          ? fill(strings.peakNow, { time: flip ? dayClock(flip.at, now, language) : '—', left: flip ? duration(flip.at - now, language) : '—' })
          : flip
            ? fill(strings.offNow, { time: dayClock(flip.at, now, language), left: duration(flip.at - now, language) })
            : strings.offTitle;

      const rows = [];
      for (const id of ids) {
        const model = data.models[id];
        for (const kind of ['off', 'peak']) {
          const active = kind === period;
          rows.push(h('tr', {
            key: `${id}-${kind}`,
            className: [kind === 'peak' ? 'dp-row--peak' : '', active ? 'dp-row--active' : ''].filter(Boolean).join(' ') || undefined,
          },
            h('td', null,
              active ? h('span', { className: 'dp-now-dot' }) : null,
              `${model.short ?? id} · ${kind === 'peak' ? strings.peakRow : strings.offRow}`,
              active ? h('span', { className: 'dp-now-tag' }, strings.nowTag) : null),
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
        spendBlock(strings.sessionTitle, spendAll, subagents),
        h('div', { className: 'dp-tip-hr' }),
        spendBlock(strings.sinceReset, spendSince, subagents === null ? null : { cost: subagents.since, sessions: subagents.sinceSessions }),
        inherited !== null && inherited !== undefined && inherited.requests > 0
          ? h('div', { className: 'dp-tip-row', style: { marginTop: '4px' } },
              h('span', { className: 'dp-tip-dim' }, strings.inheritedPrefix + ' '),
              parentLive === true
                ? h('button', {
                    type: 'button',
                    className: 'dp-link',
                    onClick: (event) => { event.stopPropagation(); onOpenSession(inherited.parent); },
                  }, parentTitle ?? inherited.parent)
                : h('span', null, parentTitle ?? inherited.parent),
              h('span', { className: 'dp-tip-dim' }, ' (' + moneySpend(inherited.cost) + ')'),
              parentArchived === true ? h('span', { className: 'dp-arch' }, strings.archive) : null,
            )
          : null,
        reset !== null
          ? h('div', { className: 'dp-tip-row', style: { marginTop: '4px' } },
              h('span', { className: 'dp-tip-dim' }, `${fill(strings.resetAt, { when: when })}${reset.requests > 0 ? ` · ${fill(strings.resetFrom, { count: reset.requests })}` : ''}`),
            )
          : null,
        h('div', { className: 'dp-tip-actions' },
          h('button', {
            type: 'button',
            className: 'dp-reset',
            title: strings.resetHint,
            disabled: resetting === true,
            onClick: (event) => { event.stopPropagation(); onReset(); },
          }, strings.resetButton),
          reset !== null
            ? h('button', {
                type: 'button',
                className: 'dp-clear',
                disabled: resetting === true,
                onClick: (event) => { event.stopPropagation(); onClearReset(); },
              }, strings.clearReset)
            : null,
        ),
        h('div', { className: 'dp-tip-row' },
          h('span', { className: 'dp-tip-dim', style: { fontSize: '11px' } }, strings.resetHint),
        ),
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

    function PricingChip({ sessionId, sessions, uiWorkspace, workspaces }) {
      ensureStyles();
      const [data, setData] = React.useState(null);
      const [now, setNow] = React.useState(() => Date.now());
      const [hovered, setHovered] = React.useState(false);
      const [pinned, setPinned] = React.useState(false);
      const [refreshing, setRefreshing] = React.useState(false);
      const [cost, setCost] = React.useState(null);
      const [resetting, setResetting] = React.useState(false);
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

      // Archive state decides whether the inherited parent is a link, a plain
      // name, or a name with an "archive" badge.
      const workspaceStore = workspaces?.list;
      const workspaceSnapshot = typeof workspaceStore?.getSnapshot === 'function'
        ? React.useSyncExternalStore(
            (notify) => {
              const dispose = workspaceStore.subscribe?.(notify);
              return typeof dispose === 'function' ? dispose : () => {};
            },
            () => workspaceStore.getSnapshot(),
            () => null,
          )
        : null;
      const archivedSessionIds = new Set(workspaceSnapshot?.archivedSessionIds ?? []);
      const liveSessionIds = new Set(Object.keys(sessions?.list?.getSnapshot?.()?.byId ?? {}));

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
        const dismiss = (event) => {
          // Buttons inside the card must not dismiss it before their click runs.
          if (event.target instanceof Element && event.target.closest('.dp-tip') !== null) return;
          setPinned(false);
        };
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
            if (alive && body !== null && body.all !== undefined) setCost(body);
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
      const stale = data.error !== undefined && data.error !== null;
      const spendAll = cost === null ? null : cost.all;
      const spendSince = cost === null ? null : (cost.since ?? cost.all);
      const reset = cost === null ? null : (cost.reset ?? null);
      const spend = spendSince;
      const when = reset === null ? '' : new Date(reset.at).toLocaleString(LOCALES[language] ?? 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const act = async (route) => {
        if (selection === null) return;
        setResetting(true);
        try {
          const response = await fetch(`${base}${route}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ session: sessionId, model: CANONICAL[selection.model] ?? selection.model }),
          });
          if (response.ok) setCost(await response.json());
        } catch {
          /* keep the previous figures */
        } finally {
          setResetting(false);
        }
      };



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
          title: peak === true
            ? strings.chipPeakTip
            : flip === null
              ? strings.chipOffTip
              : fill(strings.chipOffTipAt, { time: dayClock(flip.at, now, language) }),
        },
          h('span', { className: `dp-dot${stale ? ' dp-dot--stale' : ''}` }),
          peak === true ? h('span', { className: 'dp-strong' }, strings.peakBadge) : null,
          peak === true ? h('span', { className: 'dp-sep' }, '\u00b7') : null,
          h('span', { className: 'dp-strong' }, `${strings.session} ${spend === null ? '\u2014' : (spend.approximate ? '~' : '') + moneySpend(spend.cost)}`),
          peak === true && flip !== null ? h('span', { className: 'dp-mute' }, ` \u00b7 ${dayClock(flip.at, now, language)}`) : null,
        ),
        show && createPortal !== null
          ? createPortal(h(PriceTooltip, {
              data,
              language,
              placement,
              now,
              refreshing,
              spendAll,
              spendSince,
              inherited: cost === null ? null : (cost.inherited ?? null),
              parentTitle: cost === null ? null : (cost.parentTitle ?? null),
              subagents: cost === null ? null : (cost.subagents ?? null),
              parentLive: cost === null || cost.parent === null ? false : (liveSessionIds.has(cost.parent) && !archivedSessionIds.has(cost.parent)),
              parentArchived: cost === null || cost.parent === null ? false : archivedSessionIds.has(cost.parent),
              onOpenSession: (id) => { try { uiWorkspace?.openSession?.(id); } catch { /* navigation unavailable */ } },
              reset,
              resetting,
              when,
              onReset: () => act('/reset'),
              onClearReset: () => act('/reset/clear'),
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

    //#region spending analytics
    /** Page copy, kept beside the chip strings so one language switch drives both. */
    const AN = {
      ru: {
        title: 'Расходы',
        overview: 'Обзор',
        allSessions: 'Все сессии',
        week: 'Неделя',
        month: 'Месяц',
        d30: '30 дней',
        day: 'День',
        custom: 'Свой диапазон',
        refresh: 'Обновить',
        reset: 'Сбросить вид',
        updated: 'обновлено',
        zone: 'Часовой пояс',
        model: 'Модель',
        allModels: 'Все',
        total: 'Всего',
        requests: 'Запросов',
        tokens: 'Токенов',
        sessions: 'Сессий',
        byDays: 'По дням',
        hourly: 'По часам',
        session: 'Сессия',
        date: 'Период',
        cost: 'Стоимость',
        activeDays: 'Дн.',
        back: '← Назад',
        export: 'CSV',
        more: 'Показать ещё',
        empty: 'За выбранный период расходов нет',
        building: 'Считаю индекс журналов…',
        loading: 'Загрузка…',
        input: 'вход',
        cache: 'кэш',
        output: 'выход',
        notFound: 'Сессия не найдена',
        fork: 'форк',
        subagent: 'сабагент',
        archive: 'архив',
        split: 'Разбивка по суб-агентам',
        includeSubagents: 'включая суб-агентов',
        inheritedPrefix: 'Унаследовано из',


        openSession: 'Открыть сессию',
        pickDates: 'Выберите даты',
        allTime: 'всё время',
      },
      en: {
        title: 'Spending',
        overview: 'Overview',
        allSessions: 'All sessions',
        week: 'Week',
        month: 'Month',
        d30: '30 days',
        day: 'Day',
        custom: 'Custom range',
        refresh: 'Refresh',
        reset: 'Reset view',
        updated: 'updated',
        zone: 'Time zone',
        model: 'Model',
        allModels: 'All',
        total: 'Total',
        requests: 'Requests',
        tokens: 'Tokens',
        sessions: 'Sessions',
        byDays: 'By day',
        hourly: 'By hour',
        session: 'Session',
        date: 'Period',
        cost: 'Cost',
        activeDays: 'Days',
        back: '← Back',
        export: 'CSV',
        more: 'Load more',
        empty: 'No spending in this period',
        building: 'Building the session index…',
        loading: 'Loading…',
        input: 'input',
        cache: 'cache',
        output: 'output',
        notFound: 'Session not found',
        fork: 'fork',
        subagent: 'subagent',
        archive: 'archive',
        split: 'Split sub-agent chats',
        includeSubagents: 'including sub-agents',
        inheritedPrefix: 'Inherited from',


        openSession: 'Open session',
        pickDates: 'Pick dates',
        allTime: 'all time',
      },
      zh: {
        title: '费用',
        overview: '概览',
        allSessions: '全部会话',
        week: '周',
        month: '月',
        d30: '30 天',
        day: '日',
        custom: '自定义范围',
        refresh: '刷新',
        reset: '重置视图',
        updated: '更新于',
        zone: '时区',
        model: '模型',
        allModels: '全部',
        total: '合计',
        requests: '请求',
        tokens: 'Token',
        sessions: '会话',
        byDays: '按天',
        hourly: '按小时',
        session: '会话',
        date: '周期',
        cost: '费用',
        activeDays: '天',
        back: '← 返回',
        export: 'CSV',
        more: '加载更多',
        empty: '该时间段没有费用',
        building: '正在建立索引…',
        loading: '加载中…',
        input: '输入',
        cache: '缓存',
        output: '输出',
        notFound: '会话未找到',
        fork: '分叉',
        subagent: '子代理',
        archive: '归档',
        split: '按子代理拆分',
        includeSubagents: '含子代理',
        inheritedPrefix: '继承自',


        openSession: '打开会话',
        pickDates: '选择日期',
        allTime: '全部时间',
      },
    };

    const AN_ZONE = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        return 'UTC';
      }
    })();
    const AN_ZONES = (() => {
      try {
        return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [AN_ZONE];
      } catch {
        return [AN_ZONE];
      }
    })();

    /** Shift a local date by whole days. */
    const anShift = (date, days) => {
      const parts = String(date).split('-').map(Number);
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days)).toISOString().slice(0, 10);
    };

    /** One call to the host analytics bridge. */
    const anApi = async (path, params, method = 'GET') => {
      const url = new URL(base + path);
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      }
      const response = await fetch(url, { method, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    };

    const anMoney = (value) => {
      const amount = Number(value ?? 0);
      if (amount >= 1) return '$' + amount.toFixed(2);
      if (amount >= 0.01) return '$' + amount.toFixed(3);
      return '$' + amount.toFixed(4);
    };
    const anDay = (date) => {
      const parts = String(date ?? '').split('-');
      if (parts.length !== 3) return '—';
      return parts[2] + '.' + parts[1];
    };
    const anCount = (value) => {
      const amount = Number(value ?? 0);
      if (amount >= 1e6) return String(Number((amount / 1e6).toFixed(1))) + 'M';
      if (amount >= 1e3) return String(Number((amount / 1e3).toFixed(1))) + 'k';
      return String(Math.round(amount));
    };
    const anLocalDay = (ms, zone) => (typeof ms === 'number' ? anDay(tzParts(zone, ms).date) : '—');
    const anClock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    /** Sidebar rail icon: three spending columns. */
    function SpendingIcon({ size }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      h('path', { d: 'M4 20V9M10 20V4M16 20v-6M22 20H2' }));
    }

    /**
     * Bars for days or hours with an immediate hover readout: the value appears
     * next to the pointer without the browser tooltip delay.
     */
    function SpendingCharts({ mode, data, onPickDay }) {
      const [hover, setHover] = React.useState(null);
      const items = mode === 'hours'
        ? data.hours.map((item) => ({ key: 'h' + item.hour, label: String(item.hour).padStart(2, '0') + ':00', value: item.cost, requests: item.requests, hour: item.hour }))
        : data.days.map((item) => ({ key: item.date, label: anDay(item.date), value: item.cost, requests: item.requests, date: item.date }));
      const max = Math.max(1, ...items.map((item) => item.value));
      return h('div', { className: 'an-chart-wrap', onMouseLeave: () => setHover(null) },
        hover !== null
          ? h('div', {
              className: 'an-hover',
              style: { left: ((hover.index + 0.5) / Math.max(1, items.length)) * 100 + '%' },
            }, `${hover.label} · ${anMoney(hover.value)} · ${hover.requests}`)
          : null,
        h('div', { className: 'an-chart' }, items.map((item, index) => h('div', {
          key: item.key,
          className: 'an-bar-cell' + (hover !== null && hover.index === index ? ' an-bar-cell--on' : ''),
          onMouseEnter: () => setHover({ index, label: item.label, value: item.value, requests: item.requests }),
          onClick: () => { if (item.date !== undefined) onPickDay(item.date); },
        },
          h('div', { className: 'an-bar-track' }, h('div', { className: 'an-bar', style: { height: (item.value / max) * 100 + '%' } })),
          h('span', { className: 'an-bar-label' }, items.length <= 31 || index % Math.ceil(items.length / 20) === 0 ? item.label : ''),
        ))),
      );
    }

    /** Monday-first calendar: two clicks pick the range. */
    function RangeCalendar({ from, to, onPick, locale }) {
      const initial = from !== '' ? from : to !== '' ? to : new Date().toISOString().slice(0, 10);
      const [cursor, setCursor] = React.useState(() => initial.slice(0, 7));
      const [year, month] = cursor.split('-').map(Number);
      const first = new Date(Date.UTC(year, month - 1, 1));
      const startOffset = (first.getUTCDay() + 6) % 7;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const cells = [];
      for (let index = 0; index < startOffset; index += 1) cells.push(null);
      for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${cursor}-${String(day).padStart(2, '0')}`);
      const shiftMonth = (direction) => {
        const next = new Date(Date.UTC(year, month - 1 + direction, 1));
        setCursor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
      };
      const inRange = (date) => from !== '' && to !== '' && date >= from && date <= to;
      return h('div', { className: 'an-cal' },
        h('div', { className: 'an-cal-head' },
          h('button', { type: 'button', className: 'an-cal-nav', onClick: () => shiftMonth(-1) }, '‹'),
          h('span', { className: 'an-cal-month' }, new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric' })),
          h('button', { type: 'button', className: 'an-cal-nav', onClick: () => shiftMonth(1) }, '›')),
        h('div', { className: 'an-cal-grid' },
          [0, 1, 2, 3, 4, 5, 6].map((offset) => h('span', { key: 'w' + offset, className: 'an-cal-week' },
            new Date(Date.UTC(2024, 0, 1 + offset)).toLocaleDateString(locale, { weekday: 'short' }))),
          cells.map((date, index) => (date === null
            ? h('span', { key: 'e' + index })
            : h('button', {
                key: date,
                type: 'button',
                className: 'an-cal-day'
                  + (date === from ? ' an-cal-day--edge' : '')
                  + (date === to && to !== '' ? ' an-cal-day--edge' : '')
                  + (inRange(date) ? ' an-cal-day--in' : ''),
                onClick: () => onPick(date),
              }, String(Number(date.slice(8)))))),
        ));
    }

    function SpendingPage({ uiWorkspace, sessions, workspaces }) {
      ensureStyles();
      const [language, setLanguage] = React.useState(uiLanguage);
      const strings = { ...STRINGS[language], ...AN[language] };
      const locale = LOCALES[language] ?? 'en-US';
      const [view, setView] = React.useState('overview');
      const [preset, setPreset] = React.useState('week');
      const [shift, setShift] = React.useState(0);
      const [custom, setCustom] = React.useState({ from: '', to: '' });
      const [calendar, setCalendar] = React.useState(false);
      const [zone, setZone] = React.useState(AN_ZONE);
      const [model, setModel] = React.useState('');
      const [focus, setFocus] = React.useState(null);
      const [detail, setDetail] = React.useState(null);
      const [data, setData] = React.useState(null);
      const [status, setStatus] = React.useState(null);
      const [busy, setBusy] = React.useState(true);
      const [error, setError] = React.useState(null);
      const [now, setNow] = React.useState(Date.now());
      const [reload, setReload] = React.useState(0);
      const [history, setHistory] = React.useState([]);
      const [split, setSplit] = React.useState(false);

      // Live session list: only these ids may be opened, everything else is text.
      const listStore = sessions?.list;
      const listSnapshot = typeof listStore?.getSnapshot === 'function'
        ? React.useSyncExternalStore(
            (notify) => {
              const dispose = listStore.subscribe?.(notify);
              return typeof dispose === 'function' ? dispose : () => {};
            },
            () => listStore.getSnapshot(),
            () => null,
          )
        : null;
      const workspaceStore = workspaces?.list;
      const workspaceSnapshot = typeof workspaceStore?.getSnapshot === 'function'
        ? React.useSyncExternalStore(
            (notify) => {
              const dispose = workspaceStore.subscribe?.(notify);
              return typeof dispose === 'function' ? dispose : () => {};
            },
            () => workspaceStore.getSnapshot(),
            () => null,
          )
        : null;
      const archivedIds = React.useMemo(() => new Set(workspaceSnapshot?.archivedSessionIds ?? []), [workspaceSnapshot]);
      const liveIds = React.useMemo(() => new Set(Object.keys(listSnapshot?.byId ?? {})), [listSnapshot]);
      const isArchived = (id) => typeof id === 'string' && archivedIds.has(id);
      const isLive = (id) => typeof id === 'string' && liveIds.has(id) && !archivedIds.has(id);

      React.useEffect(() => {
        let alive = true;

        loadState()
          .then(() => {
            if (alive) setLanguage(uiLanguage);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, []);

      React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
      }, []);

      /** The preset range moved by the navigation arrows. */
      const rangeFor = () => {
        const parts = tzParts(zone, now);
        const pad = (value) => String(value).padStart(2, '0');
        if (preset === 'day') {
          const date = anShift(parts.date, shift);
          return { from: date, to: date };
        }
        if (preset === 'week') {
          const monday = anShift(parts.date, -(parts.weekday - 1) + shift * 7);
          return { from: monday, to: anShift(monday, 6) };
        }
        if (preset === 'month') {
          const base = new Date(Date.UTC(parts.year, parts.month - 1 + shift, 1));
          const year = base.getUTCFullYear();
          const month = base.getUTCMonth() + 1;
          const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
          return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
        }
        if (preset === 'd30') return { from: anShift(parts.date, -29), to: parts.date };
        return custom;
      };

      const allMode = view === 'all';
      const range = focus !== null || allMode ? null : rangeFor();
      const singleDay = range !== null && range.from === range.to;
      const canShift = focus === null && !allMode && (preset === 'day' || preset === 'week' || preset === 'month');
      const hoursMode = singleDay;

      const remember = () => setHistory((previous) => [...previous, { view, preset, shift, custom, focus, split }].slice(-20));
      const goBack = () => {
        setHistory((previous) => {
          const last = previous[previous.length - 1];
          if (last !== undefined) {
            setView(last.view);
            setPreset(last.preset);
            setShift(last.shift);
            setCustom(last.custom);
            setFocus(last.focus);
            setSplit(last.split === true);
            setDetail(null);
          }
          return previous.slice(0, -1);
        });
      };

      React.useEffect(() => {
        let alive = true;
        let timer = null;
        const load = async () => {
          try {
            if (focus !== null) {
              const body = await anApi('/analytics/session', { key: focus, tz: zone });
              if (!alive) return;
              setDetail(body.detail ?? null);
              setStatus(null);
              setBusy(false);
              setError(body.detail === null ? strings.notFound : null);
              return;
            }
            const query = allMode
              ? { scope: 'all', tz: zone, model, limit: 100, split: split ? 1 : 0 }
              : { from: range.from, to: range.to, tz: zone, model, limit: 50, split: split ? 1 : 0 };
            const body = await anApi('/analytics', query);
            if (!alive) return;
            setStatus(body.status ?? null);
            if (body.ready === false) {
              setBusy(true);
              timer = setTimeout(load, 1500);
              return;
            }
            setData(body);
            setBusy(false);
            setError(null);
          } catch (failure) {
            if (!alive) return;
            setBusy(false);
            setError(String(failure?.message ?? failure));
          }
        };
        setBusy(true);
        setError(null);
        void load();
        return () => {
          alive = false;
          if (timer !== null) clearTimeout(timer);
        };
      }, [view, preset, shift, custom.from, custom.to, zone, model, focus, now, reload, split]);

      const loadMore = async () => {
        if (data === null || data.sessions.nextCursor === null) return;
        const query = allMode
          ? { scope: 'all', tz: zone, model, cursor: data.sessions.nextCursor, limit: 100, split: split ? 1 : 0 }
          : { from: range.from, to: range.to, tz: zone, model, cursor: data.sessions.nextCursor, limit: 50, split: split ? 1 : 0 };
        const body = await anApi('/analytics', query);
        setData({
          ...data,
          sessions: {
            rows: [...data.sessions.rows, ...body.sessions.rows],
            total: body.sessions.total,
            nextCursor: body.sessions.nextCursor,
          },
        });
      };

      const refresh = async () => {
        setBusy(true);
        try {
          await anApi('/analytics/build', {}, 'POST');
          for (let attempt = 0; attempt < 120; attempt += 1) {
            const current = await anApi('/analytics/status');
            setStatus(current);
            if (current.building !== true) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          setReload((value) => value + 1);
        } catch (failure) {
          setBusy(false);
          setError(String(failure?.message ?? failure));
        }
      };

      const resetView = () => {
        setView('overview');
        setPreset('week');
        setShift(0);
        setCustom({ from: '', to: '' });
        setCalendar(false);
        setZone(AN_ZONE);
        setModel('');
        setFocus(null);
        setDetail(null);
        setHistory([]);
        setReload((value) => value + 1);
      };

      const openSession = (id) => {
        if (!isLive(id)) return;
        try {
          uiWorkspace?.openSession?.(id);
        } catch {
          /* navigation unavailable */
        }
      };

      const exportCsv = () => {
        const source = focus !== null ? detail : data;
        if (source === null) return;
        const lines = ['date,cost,requests,uncached,cacheRead,cacheWrite,output'];
        for (const item of source.days) {
          lines.push([item.date, item.cost.toFixed(6), item.requests, item.uncached, item.cacheRead, item.cacheWrite, item.output].join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'spending-' + (range === null ? 'all' : range.from + '_' + range.to) + '.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      };

      const detailMode = focus !== null;
      const shown = detailMode ? detail : data;
      const presetList = [['week', strings.week], ['month', strings.month], ['d30', strings.d30], ['day', strings.day], ['custom', strings.custom]];
      const rangeText = range === null || range.from === '' ? '' : singleDay || range.to === ''
        ? anDay(range.from)
        : anDay(range.from) + '–' + anDay(range.to);
      const crumb = detailMode
        ? [strings.title, detail === null ? strings.loading : detail.title]
        : allMode
          ? [strings.title, strings.allSessions]
          : [strings.title, strings[preset] + (rangeText === '' ? '' : ' · ' + rangeText)];
      const updatedAt = data === null || data.builtAt === null || data.builtAt === undefined ? null : data.builtAt;

      return h('div', { className: 'an-page' },
        h('div', { className: 'an-content' },
          h('div', { className: 'an-crumbs' },
            history.length > 0 ? h('button', { type: 'button', className: 'an-back', onClick: goBack }, strings.back) : null,
            crumb.map((part, index) => h('span', { key: part + index, className: index === crumb.length - 1 ? 'an-crumb an-crumb--last' : 'an-crumb' }, part)),
            h('span', { className: 'an-toolbar' },
              h('button', { type: 'button', className: 'an-iconbtn', title: strings.reset, onClick: resetView }, '\u21a9'),
              updatedAt !== null ? h('span', { className: 'an-dim' }, strings.updated + ' ' + anClock(updatedAt)) : null,
              h('button', { type: 'button', className: 'an-btn', onClick: refresh, disabled: busy }, strings.refresh),
            ),
          ),
          h('div', { className: 'an-controls' },
            h('div', { className: 'an-presets' },
              h('button', { type: 'button', className: 'an-tab' + (!allMode ? ' an-tab--on' : ''), onClick: () => { remember(); setView('overview'); setFocus(null); } }, strings.overview),
              h('button', { type: 'button', className: 'an-tab' + (allMode ? ' an-tab--on' : ''), onClick: () => { remember(); setView('all'); setFocus(null); } }, strings.allSessions),
            ),
            !allMode
              ? h('div', { className: 'an-presets' },
                  presetList.map(([value, label]) => h('button', {
                    key: value,
                    type: 'button',
                    className: 'an-tab' + (preset === value && !detailMode ? ' an-tab--on' : ''),
                    onClick: () => {
                      remember();
                      setPreset(value);
                      setShift(0);
                      setFocus(null);
                      setDetail(null);
                      setCalendar(false);
                    },
                  }, label)))
              : null,
            h('button', {
              type: 'button',
              className: 'an-tab' + (split ? ' an-tab--on' : ''),
              onClick: () => { remember(); setSplit(!split); },
            }, strings.split),
            canShift
              ? h('div', { className: 'an-arrows' },
                  h('button', { type: 'button', className: 'an-arrow', onClick: () => { remember(); setShift(shift - 1); } }, '‹'),
                  h('button', { type: 'button', className: 'an-arrow', onClick: () => { remember(); setShift(shift + 1); } }, '›'))
              : null,
            preset === 'custom' && !allMode
              ? h('button', {
                  type: 'button',
                  className: 'an-range' + (calendar ? ' an-range--open' : ''),
                  onClick: () => setCalendar(!calendar),
                }, rangeText === '' ? strings.pickDates : rangeText)
              : null,
            h('div', { className: 'an-selects' },
              h('label', null, strings.zone,
                h('select', { value: zone, onChange: (event) => setZone(event.target.value) },
                  AN_ZONES.map((value) => h('option', { key: value, value }, value)))),
              h('label', null, strings.model,
                h('select', { value: model, onChange: (event) => setModel(event.target.value) },
                  h('option', { value: '' }, strings.allModels),
                  h('option', { value: 'deepseek-flash' }, 'V4.1 Flash'),
                  h('option', { value: 'deepseek-v4-pro' }, 'V4 Pro'))),
            ),
          ),
          preset === 'custom' && !allMode && calendar
            ? h(RangeCalendar, { from: custom.from, to: custom.to, locale, onPick: (date) => setCustom((previous) => {
                if (previous.from === '' || previous.to !== '') return { from: date, to: '' };
                if (date < previous.from) return { from: date, to: previous.from };
                return { from: previous.from, to: date };
              }) })
            : null,
          status !== null && status.building
            ? h('div', { className: 'an-note' }, strings.building + ' ' + status.done + ' / ' + status.total)
            : null,
          error !== null ? h('div', { className: 'an-note an-note--error' }, error) : null,
          shown === null && busy ? h('div', { className: 'an-note' }, strings.loading) : null,
          shown !== null
            ? h('div', null,
                h('div', { className: 'an-kpi' },
                  h('div', { className: 'an-card' },
                    h('span', { className: 'an-kpi-label' }, strings.total),
                    h('span', { className: 'an-kpi-value' }, anMoney(shown.totals.cost)),
                    allMode ? h('span', { className: 'an-kpi-sub' }, strings.allTime) : null),
                  h('div', { className: 'an-card' },
                    h('span', { className: 'an-kpi-label' }, strings.requests),
                    h('span', { className: 'an-kpi-value' }, String(shown.totals.requests))),
                  h('div', { className: 'an-card' },
                    h('span', { className: 'an-kpi-label' }, strings.tokens),
                    h('span', { className: 'an-kpi-value' }, anCount(shown.totals.cacheRead + shown.totals.uncached + shown.totals.output)),
                    h('span', { className: 'an-kpi-sub' }, strings.input + ' ' + anCount(shown.totals.uncached) + ' · ' + strings.cache + ' ' + anCount(shown.totals.cacheRead) + ' · ' + strings.output + ' ' + anCount(shown.totals.output))),
                  h('div', { className: 'an-card' },
                    h('span', { className: 'an-kpi-label' }, strings.sessions),
                    h('span', { className: 'an-kpi-value' }, detailMode ? '1' : String(data === null ? 0 : data.sessions.total))),
                ),
                detailMode && detail !== null
                  ? h('div', { className: 'an-forkline' },
                      detail.subagents !== null && detail.subagents !== undefined && detail.subagents.cost > 0
                        ? h('span', null, `${strings.includeSubagents}: ${anMoney(detail.subagents.cost)} · ${detail.subagents.sessions}`)
                        : null,
                      detail.inherited !== null && detail.inherited.requests > 0
                        ? h('span', null,
                            strings.inheritedPrefix + ' ',
                            isLive(detail.parent)
                              ? h('button', { type: 'button', className: 'dp-link', onClick: () => openSession(detail.parent) }, detail.parentTitle ?? detail.parent)
                              : h('span', null, detail.parentTitle ?? detail.parent),
                            ' (' + anMoney(detail.inherited.cost) + ')',
                            isArchived(detail.parent) ? h('span', { className: 'an-badge an-badge--muted' }, strings.archive) : null)
                        : null,
                      isLive(detail.key)
                        ? h('button', { type: 'button', className: 'an-btn an-btn--open', onClick: () => openSession(detail.key) }, strings.openSession)
                        : null)
                  : null,
                h('div', { className: 'an-chart-head' },
                  h('span', { className: 'an-dim' }, hoursMode ? strings.hourly : strings.byDays),
                  h('button', { type: 'button', className: 'an-tab', onClick: exportCsv }, strings.export),
                ),
                shown.totals.requests === 0
                  ? h('div', { className: 'an-note' }, strings.empty)
                  : h('div', null,
                      h(SpendingCharts, {
                        mode: hoursMode ? 'hours' : 'days',
                        data: shown,
                        onPickDay: (date) => {
                          remember();
                          setView('overview');
                          setFocus(null);
                          setCustom({ from: date, to: date });
                          setPreset('custom');
                          setShift(0);
                        },
                      }),
                      detailMode
                        ? h('div', { className: 'an-days' }, shown.days.map((item) => h('div', { key: item.date, className: 'an-day-row' },
                            h('span', null, anDay(item.date)),
                            h('span', { className: 'an-strong' }, anMoney(item.cost)),
                            h('span', { className: 'an-dim' }, item.requests + ' · ' + anCount(item.uncached + item.cacheRead + item.output)),
                          )))
                        : h('div', { className: 'an-table' },
                            h('div', { className: 'an-table-head' },
                              h('span', null, strings.session),
                              h('span', null, strings.date),
                              h('span', { className: 'an-right' }, strings.cost),
                              h('span', { className: 'an-right' }, strings.requests),
                              h('span', { className: 'an-right' }, strings.activeDays),
                              h('span', { className: 'an-right' }, strings.tokens),
                              h('span', null, '')),
                            data.sessions.rows.map((row) => h('div', {
                              key: row.key,
                              className: 'an-table-row',
                              role: 'button',
                              tabIndex: 0,
                              onClick: () => { remember(); setFocus(row.key); setDetail(null); },
                              onKeyDown: (event) => { if (event.key === 'Enter') { remember(); setFocus(row.key); setDetail(null); } },
                            },
                              h('span', { className: 'an-name' }, row.title || row.id,
                                row.subagent === true
                                  ? h('span', { className: 'an-badge' }, strings.subagent)
                                  : row.parent !== null && row.parent !== undefined
                                    ? h('span', { className: 'an-badge' }, strings.fork)
                                    : null,
                                isArchived(row.id) ? h('span', { className: 'an-badge an-badge--muted' }, strings.archive) : null),
                              h('span', { className: 'an-dim' }, anLocalDay(row.firstAt, zone) + '–' + anLocalDay(row.lastAt, zone)),
                              h('span', { className: 'an-right an-strong' }, anMoney(row.cost)),
                              h('span', { className: 'an-right an-dim' }, String(row.requests)),
                              h('span', { className: 'an-right an-dim' }, String(row.activeDays ?? '—')),
                              h('span', { className: 'an-right an-dim' }, anCount(row.uncached + row.cacheRead + row.output)),
                              isLive(row.id)
                                ? h('button', {
                                    type: 'button',
                                    className: 'an-open',
                                    title: strings.openSession,
                                    onClick: (event) => { event.stopPropagation(); openSession(row.id); },
                                  }, '↗')
                                : h('span', null)),
                            ),
                            data.sessions.nextCursor !== null
                              ? h('div', { className: 'an-more' }, h('button', { type: 'button', className: 'an-tab', onClick: loadMore, disabled: busy }, strings.more))
                              : null),
                    ),
              )
            : null,
        ),
      );
    }
    //#endregion

    return {
      inject: ['slots', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        ensureStyles();
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'pricing',
            order: 500,
            // The slot hands over sessionId and `t`; the sessions service has to
            // come from the plugin scope, so pass it through the entry inject.
            inject: () => ({ sessions: ctx.sessions, uiWorkspace: ctx.uiWorkspace, workspaces: ctx.get?.('workspaces') ?? ctx.workspaces }),
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

        // Spending analytics: a rail section plus its own page, the same
        // pattern the browser panel uses.
        try {
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'spending',
            order: 41,
            label: () => AN[uiLanguage].title,
          }, SpendingIcon));
          ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: 'spending',
            inject: () => ({ uiWorkspace: ctx.uiWorkspace, sessions: ctx.sessions, workspaces: ctx.get?.('workspaces') ?? ctx.workspaces }),
          }, (props) => h(SpendingPage, props)));
        } catch (error) {
          console.warn('dsh-pricing: spending section registration failed', error);
        }
      },
    };
  },
});

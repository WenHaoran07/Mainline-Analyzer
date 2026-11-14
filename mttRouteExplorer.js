/* MODULE: MTT ROUTE EXPLORER - enhanced search, region group, compare/range/overall */
const MttRouteExplorer = (() => {
  const TARGET = { ALL: 0.96, LUZON: 0.97, VISMIN: 0.85 };
  let searchQ = '', exactMode = false, scope = 'ALL', groupBy = 'AUTO';
  let regionFilter = 'ALL', routeFilter = 'ALL', truckerFilter = 'ALL', legType = 'ALL';
  let periodFocus = 'day', dateMode = 'compare';
  let dateA = null, dateB = null, weekA = null, weekB = null, monthA = null, monthB = null;
  let selectedKey = null, selectedKind = 'route';
  let charts = { hist: null, week: null, month: null }, scopeCharts = { daily: null, hist: null, week: null, month: null }, lastMatches = [];

  function pct(v, d) { if (v == null || isNaN(v)) return '—'; return (v * 100).toFixed(d == null ? 2 : d) + '%'; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function weekKey(dk) { return (typeof MttUtils !== 'undefined' && MttUtils.weekKey) ? MttUtils.weekKey(dk) : null; }
  function monthKey(dk) { return dk ? String(dk).slice(0, 7) : null; }
  function weekNum(dk) {
    return (typeof MttUtils !== 'undefined' && MttUtils.excelWeekNum) ? MttUtils.excelWeekNum(dk) : null;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function last7Dates(focus, dates) {
    const sorted = (dates || []).slice().sort();
    if (!focus || !sorted.length) return sorted.slice(-7);
    const idx = sorted.indexOf(focus);
    const end = idx >= 0 ? idx : sorted.length - 1;
    return sorted.slice(Math.max(0, end - 6), end + 1);
  }
  function prevDate(focus, dates) {
    const sorted = (dates || []).slice().sort();
    const idx = sorted.indexOf(focus);
    return idx > 0 ? sorted[idx - 1] : null;
  }
  function formatLongDate(d) {
    if (!d) return '';
    const [y, m, day] = String(d).split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (!y || !m || !day) return d;
    return months[m - 1] + ' ' + day + ', ' + y;
  }
  function formatMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = String(ym).split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (!y || !m) return ym;
    return months[m - 1] + ' ' + y;
  }
  function histHeaders(hist7) {
    return hist7.map(d => {
      const p = String(d).split('-');
      return p.length === 3 ? (parseInt(p[1], 10) + '/' + parseInt(p[2], 10)) : d;
    });
  }
  function isMultiDropRoute(route) {
    const s = String(route || '').trim().toUpperCase();
    if (!s || s === '(BLANK)') return false;
    const parts = s.split(/[-–—_/\s]+/).map(x => x.trim()).filter(Boolean);
    return parts.length >= 3 || s.indexOf('TWO DROP') >= 0 || s.indexOf('TWODROP') >= 0;
  }
  function isBackloadRegion(reg) {
    const u = String(reg || '').trim().toUpperCase();
    return u === 'BACKLOAD' || u === 'BACK LOAD' || u === 'TWO DROPS' || u === 'TWODROPS';
  }
  function allRows() { return typeof MttFileProcessor === 'undefined' ? [] : (MttFileProcessor.getState().storedRows || []).slice(); }
  function allDates() { return typeof MttFileProcessor === 'undefined' ? [] : (MttFileProcessor.getState().storedDates || []).slice().sort(); }
  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    return { total: list.length, yes, no: list.length - yes, rate: list.length ? yes / list.length : null };
  }
  function effectiveGroupMode() {
    if (groupBy === 'REGION' || groupBy === 'ROUTE' || groupBy === 'TRUCKER' || groupBy === 'DC') return groupBy;
    if (scope === 'LUZON' || scope === 'VISMIN') return 'REGION';
    if (selectedKind === 'region' || selectedKind === 'scope') return 'REGION';
    if (selectedKind === 'trucker') return 'TRUCKER';
    if (selectedKind === 'dc') return 'DC';
    return 'ROUTE';
  }
  function baseFilter(rows) {
    let out = rows.slice();
    if (scope === 'LUZON') out = out.filter(r => r.routeType === 'LUZON');
    else if (scope === 'VISMIN') out = out.filter(r => r.routeType === 'VISMIN');
    if (regionFilter && regionFilter !== 'ALL') out = out.filter(r => String(r.region || '').trim() === regionFilter);
    if (routeFilter && routeFilter !== 'ALL') out = out.filter(r => String(r.route || '').trim() === routeFilter);
    if (truckerFilter && truckerFilter !== 'ALL') out = out.filter(r => String(r.trucker || '').trim() === truckerFilter);
    if (legType === 'DIRECT') out = out.filter(r => !isMultiDropRoute(r.route) && !isBackloadRegion(r.region));
    else if (legType === 'MULTIDROP') out = out.filter(r => isMultiDropRoute(r.route) || isBackloadRegion(r.region));
    return out;
  }
  function applyPeriodWindow(rows) {
    if (periodFocus === 'overall') return rows;
    if (periodFocus === 'day') {
      if (dateMode === 'single' && dateA) return rows.filter(r => r.dateKey === dateA);
      if (dateMode === 'compare' && dateA) { const set = new Set([dateA]); if (dateB) set.add(dateB); return rows.filter(r => set.has(r.dateKey)); }
      if (dateMode === 'range' && dateA && dateB) { const a = dateA < dateB ? dateA : dateB, b = dateA < dateB ? dateB : dateA; return rows.filter(r => r.dateKey >= a && r.dateKey <= b); }
      return dateA ? rows.filter(r => r.dateKey === dateA) : rows;
    }
    if (periodFocus === 'week') {
      if (dateMode === 'single' && weekA) return rows.filter(r => weekKey(r.dateKey) === weekA);
      if (dateMode === 'compare' && weekA) { const set = new Set([weekA]); if (weekB) set.add(weekB); return rows.filter(r => set.has(weekKey(r.dateKey))); }
      if (dateMode === 'range' && weekA && weekB) { const a = weekA < weekB ? weekA : weekB, b = weekA < weekB ? weekB : weekA; return rows.filter(r => { const k = weekKey(r.dateKey); return k && k >= a && k <= b; }); }
      return weekA ? rows.filter(r => weekKey(r.dateKey) === weekA) : rows;
    }
    if (periodFocus === 'month') {
      if (dateMode === 'single' && monthA) return rows.filter(r => monthKey(r.dateKey) === monthA);
      if (dateMode === 'compare' && monthA) { const set = new Set([monthA]); if (monthB) set.add(monthB); return rows.filter(r => set.has(monthKey(r.dateKey))); }
      if (dateMode === 'range' && monthA && monthB) { const a = monthA < monthB ? monthA : monthB, b = monthA < monthB ? monthB : monthA; return rows.filter(r => { const k = monthKey(r.dateKey); return k && k >= a && k <= b; }); }
      return monthA ? rows.filter(r => monthKey(r.dateKey) === monthA) : rows;
    }
    return rows;
  }
  function parseSearchIntent(q) {
    const ql = String(q || '').trim().toLowerCase();
    if (!ql) return { type: 'none' };
    if (/^(luzon|luzon\s*route|lz)$/i.test(ql)) return { type: 'scope', scope: 'LUZON', label: 'Luzon Route' };
    if (/^(vismin|vis\s*min|vismin\s*route|vm)$/i.test(ql)) return { type: 'scope', scope: 'VISMIN', label: 'VisMin Route' };
    if (/^(overall|all|slu)$/i.test(ql)) return { type: 'scope', scope: 'ALL', label: 'Overall' };
    return { type: 'text', ql, q: String(q).trim() };
  }
  function matchEntities(rows) {
    const mode = effectiveGroupMode();
    const intent = parseSearchIntent(searchQ);

    const byRoute = new Map(), byRegion = new Map(), byTrucker = new Map(), byDc = new Map();
    const byPlate = new Map(), byTask = new Map();

    function add(map, key, kind, meta, r, extra) {
      const k = (key || '(blank)').trim() || '(blank)';
      if (!map.has(k)) {
        map.set(k, Object.assign({
          key: k, kind: kind, label: k, meta: meta || kind,
          rows: [], region: r.region || '', type: r.routeType || 'OTHER'
        }, extra || {}));
      }
      map.get(k).rows.push(r);
    }

    rows.forEach(r => {
      const rt = (r.route || '(blank)').trim() || '(blank)';
      const rg = (r.region || '(blank)').trim() || '(blank)';
      const tr = (r.trucker || '(blank)').trim() || '(blank)';
      const dc = (r.dcIntended || '(blank)').trim() || '(blank)';
      const pl = (r.plate || '').trim();
      const tk = (r.taskId || '').trim();
      add(byRoute, rt, 'route', rg + ' · ' + (r.routeType || ''), r, { region: rg, type: r.routeType || 'OTHER' });
      add(byRegion, rg, 'region', r.routeType || 'Region', r, { region: rg, type: r.routeType || 'REGION' });
      add(byTrucker, tr, 'trucker', 'Trucker', r, { type: 'TRUCKER' });
      add(byDc, dc, 'dc', 'DC Intended', r, { type: 'DC' });
      if (pl) add(byPlate, pl, 'plate', 'Plate · ' + (r.trucker || ''), r, { type: 'PLATE' });
      if (tk) add(byTask, tk, 'task', 'Task · ' + (r.route || ''), r, { type: 'TASK' });
    });

    // Luzon / VisMin → all regions under that scope (Mainline-style report)
    if (intent.type === 'scope' && (intent.scope === 'LUZON' || intent.scope === 'VISMIN')) {
      const list = [...byRegion.values()]
        .map(m => {
          const scopedRows = m.rows.filter(r => r.routeType === intent.scope);
          return Object.assign({}, m, { rows: scopedRows, meta: intent.label, type: intent.scope });
        })
        .filter(m => m.rows.length > 0);
      list.sort((a, b) => a.label.localeCompare(b.label));
      return list;
    }
    if (intent.type === 'scope' && intent.scope === 'ALL') {
      if (mode === 'REGION') {
        const list = [...byRegion.values()];
        list.sort((a, b) => a.label.localeCompare(b.label));
        return list;
      }
      return [{ key: intent.label, kind: 'scope', scopeVal: 'ALL', label: intent.label, meta: 'Overall', rows: rows }];
    }

    // Empty search: browse by group mode
    if (!searchQ || !String(searchQ).trim()) {
      if ((scope === 'LUZON' || scope === 'VISMIN') && mode === 'REGION') {
        const list = [...byRegion.values()];
        list.sort((a, b) => a.label.localeCompare(b.label));
        return list;
      }
      let list;
      if (mode === 'REGION') list = [...byRegion.values()];
      else if (mode === 'TRUCKER') list = [...byTrucker.values()];
      else if (mode === 'DC') list = [...byDc.values()];
      else list = [...byRoute.values()];
      list.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
      return list;
    }

    // Full-text search across ALL dimensions
    if (intent.type === 'text' && intent.ql) {
      const ql = intent.ql;
      function hits(map, exact) {
        return [...map.values()].filter(m => exact ? m.key.toLowerCase() === ql : m.key.toLowerCase().includes(ql));
      }
      // Also match rows by any field (region inside route meta, etc.)
      function rowFieldHits(map, fields) {
        return [...map.values()].filter(m =>
          m.rows.some(r => fields.some(f => String(r[f] || '').toLowerCase().includes(ql)))
        );
      }

      if (exactMode) {
        const pools = [
          hits(byRoute, true), hits(byRegion, true), hits(byTrucker, true),
          hits(byDc, true), hits(byPlate, true), hits(byTask, true)
        ];
        for (const p of pools) if (p.length) return p.sort((a, b) => b.rows.length - a.rows.length);
        return [];
      }

      // Prefer group mode ranking, but always surface multi-type results when AUTO
      const routeHits = hits(byRoute, false);
      const regionHits = hits(byRegion, false);
      const truckerHits = hits(byTrucker, false);
      const dcHits = hits(byDc, false);
      const plateHits = hits(byPlate, false);
      const taskHits = hits(byTask, false);

      if (mode === 'REGION') {
        const list = regionHits.length ? regionHits : routeHits;
        list.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
        return list;
      }
      if (mode === 'TRUCKER') {
        const list = truckerHits.length ? truckerHits : routeHits;
        list.sort((a, b) => b.rows.length - a.rows.length);
        return list;
      }
      if (mode === 'DC') {
        const list = dcHits.length ? dcHits : routeHits;
        list.sort((a, b) => b.rows.length - a.rows.length);
        return list;
      }
      if (mode === 'ROUTE') {
        const list = routeHits.length ? routeHits : regionHits;
        list.sort((a, b) => b.rows.length - a.rows.length);
        return list;
      }

      // AUTO: merge all match types, tag meta so user sees what kind it is
      const merged = [];
      const pushAll = (arr, kindLabel) => {
        arr.forEach(m => {
          merged.push(Object.assign({}, m, {
            meta: kindLabel + (m.meta ? ' · ' + m.meta : ''),
            _score: m.rows.length + (m.key.toLowerCase() === ql ? 10000 : (m.key.toLowerCase().startsWith(ql) ? 1000 : 0))
          }));
        });
      };
      pushAll(regionHits, 'Region');
      pushAll(routeHits, 'Route');
      pushAll(truckerHits, 'Trucker');
      pushAll(dcHits, 'DC');
      pushAll(plateHits, 'Plate');
      pushAll(taskHits, 'Task');

      // Deduplicate by kind+key
      const seen = new Set();
      const uniq = [];
      merged.sort((a, b) => b._score - a._score || b.rows.length - a.rows.length);
      merged.forEach(m => {
        const id = m.kind + '::' + m.key;
        if (seen.has(id)) return;
        seen.add(id);
        uniq.push(m);
      });
      return uniq.slice(0, 60);
    }

    let list = mode === 'REGION' ? [...byRegion.values()]
      : (mode === 'TRUCKER' ? [...byTrucker.values()]
        : (mode === 'DC' ? [...byDc.values()] : [...byRoute.values()]));
    list.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
    return list;
  }
  function targetFor(t) { return t === 'LUZON' ? TARGET.LUZON : (t === 'VISMIN' ? TARGET.VISMIN : TARGET.ALL); }
  function lastNDates(focus, dates, n) {
    const sorted = (dates || []).slice().sort();
    if (!focus || !sorted.length) return sorted.slice(-n);
    const idx = sorted.indexOf(focus);
    const end = idx >= 0 ? idx : sorted.length - 1;
    return sorted.slice(Math.max(0, end - (n - 1)), end + 1);
  }
  function fmtHms(mins) {
    if (mins == null || isNaN(mins)) return '—';
    const totalSec = Math.max(0, Math.round(Number(mins) * 60));
    return Math.floor(totalSec / 3600) + ':' + String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0') + ':' + String(totalSec % 60).padStart(2, '0');
  }
  function destroyCharts() { Object.keys(charts).forEach(k => { if (charts[k]) { try { charts[k].destroy(); } catch (e) {} charts[k] = null; } }); }
  function rateCls(rate, target) { if (rate == null) return 'rx-muted'; return rate >= target ? 'rx-ok' : 'rx-bad'; }

  function populateSelectors() {
    const rows = baseFilter(allRows()), dates = allDates();
    const regions = [...new Set(rows.map(r => String(r.region || '').trim() || '(blank)'))].sort();
    const routes = [...new Set(rows.map(r => (r.route || '').trim()).filter(Boolean))].sort();
    const weeks = [...new Set(rows.map(r => weekKey(r.dateKey)).filter(Boolean))].sort();
    const months = [...new Set(rows.map(r => monthKey(r.dateKey)).filter(Boolean))].sort();
    function fill(id, items, allLabel, current) {
      const sel = document.getElementById(id); if (!sel) return;
      const prev = current || sel.value;
      sel.innerHTML = '<option value="ALL">' + allLabel + '</option>' + items.map(v => '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>').join('');
      sel.value = (prev && (prev === 'ALL' || items.indexOf(prev) >= 0)) ? prev : 'ALL';
    }
    fill('rxRegion', regions, 'All regions', regionFilter);
    fill('rxRoute', routes, 'All routes', routeFilter);
    const truckers = [...new Set(rows.map(r => String(r.trucker || '').trim() || '(blank)'))].filter(Boolean).sort();
    fill('rxTrucker', truckers, 'All truckers', truckerFilter);
    truckerFilter = (document.getElementById('rxTrucker') || {}).value || truckerFilter || 'ALL';
    function fillDates(id, cur) {
      const sel = document.getElementById(id); if (!sel) return;
      const prev = cur || sel.value;
      sel.innerHTML = dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
      sel.value = (prev && dates.indexOf(prev) >= 0) ? prev : (dates.length ? dates[dates.length - 1] : '');
    }
    fillDates('rxDateA', dateA); fillDates('rxDateB', dateB);
    dateA = (document.getElementById('rxDateA') || {}).value || null;
    dateB = (document.getElementById('rxDateB') || {}).value || null;
    if (dateA && dates.length >= 2) {
      const ia = dates.indexOf(dateA);
      if (ia > 0 && (!dateB || dateB === dateA)) { const selB = document.getElementById('rxDateB'); if (selB) { selB.value = dates[ia - 1]; dateB = dates[ia - 1]; } }
    }
    function fillWeeks(id, cur) {
      const sel = document.getElementById(id); if (!sel) return;
      const prev = cur || sel.value;
      sel.innerHTML = weeks.map(w => { const wn = String(w).match(/W(\d+)/i); return '<option value="' + escapeHtml(w) + '">' + escapeHtml(wn ? ('WK ' + parseInt(wn[1], 10) + ' · ' + w) : w) + '</option>'; }).join('');
      sel.value = (prev && weeks.indexOf(prev) >= 0) ? prev : (weeks.length ? weeks[weeks.length - 1] : '');
    }
    fillWeeks('rxWeek', weekA); fillWeeks('rxWeekB', weekB);
    weekA = (document.getElementById('rxWeek') || {}).value || null;
    weekB = (document.getElementById('rxWeekB') || {}).value || null;
    if (weekA && weeks.length >= 2) {
      const iw = weeks.indexOf(weekA);
      if (iw > 0 && (!weekB || weekB === weekA)) { const sel = document.getElementById('rxWeekB'); if (sel) { sel.value = weeks[iw - 1]; weekB = weeks[iw - 1]; } }
    }
    function fillMonths(id, cur) {
      const sel = document.getElementById(id); if (!sel) return;
      const prev = cur || sel.value;
      sel.innerHTML = months.map(m => '<option value="' + m + '">' + m + '</option>').join('');
      sel.value = (prev && months.indexOf(prev) >= 0) ? prev : (months.length ? months[months.length - 1] : '');
    }
    fillMonths('rxMonth', monthA); fillMonths('rxMonthB', monthB);
    monthA = (document.getElementById('rxMonth') || {}).value || null;
    monthB = (document.getElementById('rxMonthB') || {}).value || null;
    if (monthA && months.length >= 2) {
      const im = months.indexOf(monthA);
      if (im > 0 && (!monthB || monthB === monthA)) { const sel = document.getElementById('rxMonthB'); if (sel) { sel.value = months[im - 1]; monthB = months[im - 1]; } }
    }
  }

  function syncPeriodUI() {
    document.querySelectorAll('[data-rx-period]').forEach(b => b.classList.toggle('active', b.getAttribute('data-rx-period') === periodFocus));
    const isDay = periodFocus === 'day', isWeek = periodFocus === 'week', isMonth = periodFocus === 'month', isOverall = periodFocus === 'overall';
    const needB = !isOverall && dateMode !== 'single';
    [['rxDayWrap', isDay], ['rxDayWrap2', isDay && needB], ['rxWeekWrap', isWeek], ['rxWeekWrap2', isWeek && needB], ['rxMonthWrap', isMonth], ['rxMonthWrap2', isMonth && needB]].forEach(([id, show]) => {
      const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !show);
    });
    function setLab(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
    if (dateMode === 'range') { setLab('rxDateALabel','From day'); setLab('rxDateBLabel','To day'); setLab('rxWeekALabel','From week'); setLab('rxWeekBLabel','To week'); setLab('rxMonthALabel','From month'); setLab('rxMonthBLabel','To month'); }
    else if (dateMode === 'compare') { setLab('rxDateALabel','Focus day'); setLab('rxDateBLabel','Compare day'); setLab('rxWeekALabel','Focus week'); setLab('rxWeekBLabel','Compare week'); setLab('rxMonthALabel','Focus month'); setLab('rxMonthBLabel','Compare month'); }
    else { setLab('rxDateALabel','Day'); setLab('rxWeekALabel','Week'); setLab('rxMonthALabel','Month'); }
    [['rxBlockDay', isDay || isOverall], ['rxBlockWeek', isWeek || isOverall], ['rxBlockMonth', isMonth || isOverall]].forEach(([id, show]) => {
      const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !show);
    });
  }

  function buildPack(match) {
    const rows = match.rows || [];
    const windowRows = applyPeriodWindow(rows);
    const dates = [...new Set(rows.map(r => r.dateKey).filter(Boolean))].sort();
    const focus = dateA && dates.indexOf(dateA) >= 0 ? dateA : (dates[dates.length - 1] || null);
    const compare = dateB && dateB !== focus ? dateB : null;
    let type = match.type || 'OTHER';
    if (match.kind === 'scope') type = match.scopeVal || scope;
    else if (match.kind === 'region') type = scope !== 'ALL' ? scope : 'ALL';
    const target = targetFor(type === 'OTHER' ? scope : type);
    const source = windowRows.length ? windowRows : rows;
    const allSt = stats(source);
    const stA = stats(focus ? rows.filter(r => r.dateKey === focus) : []);
    const stB = stats(compare ? rows.filter(r => r.dateKey === compare) : []);
    const dailyDiff = (stA.rate != null && stB.rate != null) ? stA.rate - stB.rate : null;
    let dailySeries;
    if (periodFocus === 'day' && dateMode === 'range' && dateA && dateB) {
      const a = dateA < dateB ? dateA : dateB, b = dateA < dateB ? dateB : dateA;
      dailySeries = dates.filter(d => d >= a && d <= b).map(d => { const s = stats(rows.filter(r => r.dateKey === d)); return { date: d, rate: s.rate, total: s.total, yes: s.yes, no: s.no }; });
    } else if (periodFocus === 'day' && dateMode === 'compare') {
      dailySeries = [focus, compare].filter(Boolean).map(d => { const s = stats(rows.filter(r => r.dateKey === d)); return { date: d, rate: s.rate, total: s.total, yes: s.yes, no: s.no }; });
    } else if (periodFocus === 'day' && dateMode === 'single') {
      dailySeries = focus ? [{ date: focus, rate: stA.rate, total: stA.total, yes: stA.yes, no: stA.no }] : [];
    } else {
      dailySeries = lastNDates(focus, dates, 14).map(d => { const s = stats(rows.filter(r => r.dateKey === d)); return { date: d, rate: s.rate, total: s.total, yes: s.yes, no: s.no }; });
    }
    const weekMap = new Map();
    rows.forEach(r => { const k = weekKey(r.dateKey); if (!k) return; if (!weekMap.has(k)) weekMap.set(k, []); weekMap.get(k).push(r); });
    let weekSeries = [...weekMap.keys()].sort().map(k => { const s = stats(weekMap.get(k)); return { key: k, label: (String(k).match(/W(\d+)/i) ? 'WK ' + RegExp.$1 : k), rate: s.rate, total: s.total, yes: s.yes, no: s.no }; });
    if (periodFocus === 'week' && dateMode === 'range' && weekA && weekB) { const a = weekA < weekB ? weekA : weekB, b = weekA < weekB ? weekB : weekA; weekSeries = weekSeries.filter(w => w.key >= a && w.key <= b); }
    else if (periodFocus === 'week' && dateMode === 'compare') { const set = new Set([weekA, weekB].filter(Boolean)); weekSeries = weekSeries.filter(w => set.has(w.key)); }
    else if (periodFocus === 'week' && dateMode === 'single' && weekA) weekSeries = weekSeries.filter(w => w.key === weekA);
    const monthMap = new Map();
    rows.forEach(r => { const k = monthKey(r.dateKey); if (!k) return; if (!monthMap.has(k)) monthMap.set(k, []); monthMap.get(k).push(r); });
    let monthSeries = [...monthMap.keys()].sort().map(k => { const s = stats(monthMap.get(k)); return { key: k, label: k, rate: s.rate, total: s.total, yes: s.yes, no: s.no }; });
    if (periodFocus === 'month' && dateMode === 'range' && monthA && monthB) { const a = monthA < monthB ? monthA : monthB, b = monthA < monthB ? monthB : monthA; monthSeries = monthSeries.filter(w => w.key >= a && w.key <= b); }
    else if (periodFocus === 'month' && dateMode === 'compare') { const set = new Set([monthA, monthB].filter(Boolean)); monthSeries = monthSeries.filter(w => set.has(w.key)); }
    else if (periodFocus === 'month' && dateMode === 'single' && monthA) monthSeries = monthSeries.filter(w => w.key === monthA);
    const wkFocus = weekA || (focus ? weekKey(focus) : null);
    const wkSt = stats(wkFocus ? rows.filter(r => weekKey(r.dateKey) === wkFocus) : []);
    const mkFocus = monthA || (focus ? monthKey(focus) : null);
    const moSt = stats(mkFocus ? rows.filter(r => monthKey(r.dateKey) === mkFocus) : []);
    const wkPrevSt = stats(weekB ? rows.filter(r => weekKey(r.dateKey) === weekB) : []);
    const moPrevSt = stats(monthB ? rows.filter(r => monthKey(r.dateKey) === monthB) : []);
    const mode = effectiveGroupMode();
    let breakdown = [];
    const by = new Map();
    if (match.kind === 'region' || match.kind === 'scope' || mode === 'REGION') {
      source.forEach(r => { const k = (r.route || '(blank)').trim() || '(blank)'; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    } else {
      source.forEach(r => { const k = (r.region || '(blank)').trim() || '(blank)'; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    }
    breakdown = [...by.entries()].map(([name, list]) => { const s = stats(list); return { name, total: s.total, yes: s.yes, no: s.no, rate: s.rate }; }).sort((a, b) => b.total - a.total);
    const byT = new Map();
    source.forEach(r => { const t = r.trucker || '(blank)'; if (!byT.has(t)) byT.set(t, []); byT.get(t).push(r); });
    const truckers = [...byT.entries()].map(([name, list]) => { const s = stats(list); return { name, total: s.total, yes: s.yes, no: s.no, rate: s.rate }; }).sort((a, b) => b.total - a.total);
    const lateFocus = source.filter(r => String(r.onTime || '').toUpperCase() === 'NO');
    const plans = source.map(r => Number(r.planTT)).filter(v => v > 0);
    const actuals = source.map(r => Number(r.actualTT)).filter(v => v > 0);
    return {
      key: match.key, kind: match.kind, label: match.label, region: match.region || '', type, target, focus, compare,
      allSt, stA, stB, dailyDiff, dailySeries, weekSeries, monthSeries,
      wkFocus, wkSt, wkPrevSt, wkDiff: (wkSt.rate != null && wkPrevSt.rate != null) ? wkSt.rate - wkPrevSt.rate : null,
      mkFocus, moSt, moPrevSt, moDiff: (moSt.rate != null && moPrevSt.rate != null) ? moSt.rate - moPrevSt.rate : null,
      breakdown, truckers, lateFocus,
      avgPlan: plans.length ? plans.reduce((a, b) => a + b, 0) / plans.length : null,
      avgActual: actuals.length ? actuals.reduce((a, b) => a + b, 0) / actuals.length : null,
      rows, windowRows: source
    };
  }

  function metricCard(label, value, sub, tone) {
    return '<div class="rx-metric' + (tone ? ' rx-m-' + tone : '') + '"><div class="rx-m-label">' + label + '</div><div class="rx-m-value">' + value + '</div>' + (sub ? '<div class="rx-m-sub">' + sub + '</div>' : '') + '</div>';
  }


  /** Build one region row for Explorer scope report */
  function buildRegionReportRow(name, rows, focus, dates, target) {
    const day = rows.filter(r => r.dateKey === focus);
    const st = stats(day);
    const prev = prevDate(focus, dates);
    const prevSt = prev ? stats(rows.filter(r => r.dateKey === prev)) : { rate: null };
    const dailyDiff = (st.rate != null && prevSt.rate != null) ? st.rate - prevSt.rate : null;
    const hist7 = last7Dates(focus, dates);
    const histRates = hist7.map(d => {
      const s = stats(rows.filter(r => r.dateKey === d));
      return { date: d, rate: s.rate, total: s.total, yes: s.yes, no: s.no };
    });
    const wn = weekNum(focus);
    let wkPrevKey = null;
    if (focus) {
      const [y, m, d] = focus.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const pk = dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
      wkPrevKey = weekKey(pk);
    }
    const wkCurrKey = weekKey(focus);
    const wkCurrList = rows.filter(r => weekKey(r.dateKey) === wkCurrKey);
    const wkPrevList = wkPrevKey ? rows.filter(r => weekKey(r.dateKey) === wkPrevKey) : [];
    const wkCurrSt = stats(wkCurrList);
    const wkPrevSt = stats(wkPrevList);
    const weeklyDiff = (wkCurrSt.rate != null && wkPrevSt.rate != null) ? wkCurrSt.rate - wkPrevSt.rate : null;
    const mk = monthKey(focus);
    const monthRows = rows.filter(r => monthKey(r.dateKey) === mk);
    const monthSt = stats(monthRows);
    let wkPrevLabel = 'WK —', wkCurrLabel = 'WK —';
    if (wn != null) wkCurrLabel = 'WK ' + wn;
    if (focus) {
      const [y, m, d] = focus.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const pk = dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
      const pwn = weekNum(pk);
      if (pwn != null) wkPrevLabel = 'WK ' + pwn;
    }
    return {
      name, total: st.total, yes: st.yes, no: st.no, rate: st.rate, target,
      hist7, histRates, dailyDiff,
      wkPrev: wkPrevSt.rate, wkCurr: wkCurrSt.rate, weeklyDiff,
      wkPrevLabel, wkCurrLabel,
      wkCurrTotal: wkCurrSt.total, wkCurrYes: wkCurrSt.yes, wkCurrNo: wkCurrSt.no,
      monthLate: monthSt.no, monthOnTime: monthSt.yes, monthTotal: monthSt.total, monthRate: monthSt.rate
    };
  }

  function rateTd(rate, target) {
    if (rate == null) return '<td class="rx-muted">—</td>';
    const ok = target != null && rate >= target;
    return '<td class="' + (ok ? 'rx-ok' : 'rx-bad') + '">' + pct(rate) + '</td>';
  }

  function bindRegionClicks(root) {
    if (!root) return;
    root.querySelectorAll('[data-rx-region]').forEach(tr => {
      tr.addEventListener('click', () => {
        const reg = tr.getAttribute('data-rx-region');
        if (!reg) return;
        regionFilter = reg;
        selectedKey = reg;
        selectedKind = 'region';
        const rs = document.getElementById('rxRegion');
        if (rs) {
          let ok = false;
          for (let i = 0; i < rs.options.length; i++) if (rs.options[i].value === reg) ok = true;
          if (!ok) {
            const o = document.createElement('option');
            o.value = reg; o.textContent = reg; rs.appendChild(o);
          }
          rs.value = reg;
        }
        run();
      });
    });
  }

  function renderScopeReport(scopeVal, rows, focus, dates) {
    const panel = document.getElementById('rxScopeReport');
    const title = document.getElementById('rxScopeReportTitle');
    const badge = document.getElementById('rxScopeReportBadge');
    const note = document.getElementById('rxScopeReportNote');
    const overallEl = document.getElementById('rxScopeOverallMetrics');
    const dailyBody = document.getElementById('rxScopeDailyBody');
    const histHead = document.getElementById('rxScopeHistHead');
    const histBody = document.getElementById('rxScopeHistBody');
    const weekHead = document.getElementById('rxScopeWeekHead');
    const weekBody = document.getElementById('rxScopeWeekBody');
    const monthBody = document.getElementById('rxScopeMonthBody');
    if (!panel) return;

    if (!scopeVal || (scopeVal !== 'LUZON' && scopeVal !== 'VISMIN') || !rows.length || !focus) {
      panel.classList.add('hidden');
      return;
    }

    const target = targetFor(scopeVal);
    const hist7 = last7Dates(focus, dates);
    const hLabels = histHeaders(hist7);

    const byReg = new Map();
    rows.forEach(r => {
      const reg = String(r.region || '').trim() || '(blank)';
      if (!byReg.has(reg)) byReg.set(reg, []);
      byReg.get(reg).push(r);
    });
    const regionNames = [...byReg.keys()].sort((a, b) => {
      const ua = a.toUpperCase(), ub = b.toUpperCase();
      if (ua === 'TWO DROPS' || ua === 'BACKLOAD') return 1;
      if (ub === 'TWO DROPS' || ub === 'BACKLOAD') return -1;
      return a.localeCompare(b);
    });

    const regionRows = regionNames.map(name => buildRegionReportRow(name, byReg.get(name), focus, dates, target));
    const totalName = scopeVal === 'LUZON' ? 'LUZON ROUTE' : 'VISMIN ROUTE';
    const totalRow = buildRegionReportRow(totalName, rows, focus, dates, target);
    const sample = regionRows[0] || totalRow;

    if (title) title.textContent = (scopeVal === 'LUZON' ? 'LUZON Route' : 'VisMin Route') + ' · Explorer report';
    if (badge) badge.textContent = regionRows.length + ' region(s)';
    if (note) note.textContent = 'Focus day ' + formatLongDate(focus) + ' (' + focus + ') · Click any region row to drill down';

    // Period labels / chips
    const prevD = prevDate(focus, dates);
    const dailyChip = document.getElementById('rxScopeDailyChip');
    const dailyLabel = document.getElementById('rxScopeDailyLabel');
    if (dailyChip) dailyChip.textContent = formatLongDate(focus) + ' · ' + focus;
    if (dailyLabel) {
      dailyLabel.textContent = 'Day: ' + formatLongDate(focus) +
        (prevD ? ' · vs previous day ' + formatLongDate(prevD) + ' (' + prevD + ')' : '');
    }

    const histChip = document.getElementById('rxScopeHistChip');
    const histLabel = document.getElementById('rxScopeHistLabel');
    if (hist7.length) {
      const from = hist7[0], to = hist7[hist7.length - 1];
      if (histChip) histChip.textContent = from + ' → ' + to;
      if (histLabel) histLabel.textContent = '7 days: ' + formatLongDate(from) + ' through ' + formatLongDate(to);
    }

    const weekChip = document.getElementById('rxScopeWeekChip');
    const weekLabelEl = document.getElementById('rxScopeWeekLabel');
    if (weekChip) weekChip.textContent = (sample.wkPrevLabel || 'Prev') + ' vs ' + (sample.wkCurrLabel || 'Current');
    if (weekLabelEl) {
      weekLabelEl.textContent = 'Week comparison: ' + (sample.wkPrevLabel || 'previous week') +
        ' vs ' + (sample.wkCurrLabel || 'current week') + ' (based on focus day ' + focus + ')';
    }

    const monthChip = document.getElementById('rxScopeMonthChip');
    const monthLabelEl = document.getElementById('rxScopeMonthLabel');
    const mk = monthKey(focus);
    if (monthChip) monthChip.textContent = formatMonthLabel(mk) + (mk ? ' · ' + mk : '');
    if (monthLabelEl) {
      monthLabelEl.textContent = 'Month: ' + formatMonthLabel(mk) + ' (month-to-date through ' + formatLongDate(focus) + ')';
    }

    // Overall metrics strip
    if (overallEl) {
      overallEl.innerHTML =
        metricCard('Regions', regionRows.length, totalName, 'neutral') +
        metricCard('Focus day trips', totalRow.total, focus, 'neutral') +
        metricCard('On time', totalRow.yes, pct(totalRow.rate), totalRow.rate != null && totalRow.rate >= target ? 'ok' : 'bad') +
        metricCard('Late', totalRow.no, totalRow.total ? pct(totalRow.no / totalRow.total) : '—', totalRow.no ? 'bad' : 'ok') +
        metricCard('Week rate', pct(totalRow.wkCurr), sample.wkCurrLabel || 'Current week',
          totalRow.wkCurr == null ? 'neutral' : (totalRow.wkCurr >= target ? 'ok' : 'bad')) +
        metricCard('Month rate', pct(totalRow.monthRate), (monthKey(focus) || 'Month'),
          totalRow.monthRate == null ? 'neutral' : (totalRow.monthRate >= target ? 'ok' : 'bad'));
    }

    function rowOpen(name, isTotal) {
      return '<tr class="' + (isTotal ? 'rx-scope-total' : 'rx-region-click') + '"' +
        (isTotal ? '' : ' data-rx-region="' + escapeHtml(name) + '"') + '>';
    }

    // Daily summary
    if (dailyBody) {
      dailyBody.innerHTML = regionRows.map(r => {
        let h = rowOpen(r.name, false);
        h += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
        h += '<td>' + (r.total || 0) + '</td><td>' + (r.yes || 0) + '</td>';
        h += '<td class="' + (r.no ? 'rx-bad' : '') + '">' + (r.no || 0) + '</td>';
        h += '<td>' + pct(target, 0) + '</td>' + rateTd(r.rate, target);
        if (r.dailyDiff == null) h += '<td class="rx-muted">—</td>';
        else h += '<td class="' + (r.dailyDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">' +
          (r.dailyDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(r.dailyDiff * 100).toFixed(2) + 'pp</td>';
        h += '</tr>';
        return h;
      }).join('') + (function () {
        let h = rowOpen(totalRow.name, true);
        h += '<td><strong>' + escapeHtml(totalRow.name) + '</strong></td>';
        h += '<td>' + (totalRow.total || 0) + '</td><td>' + (totalRow.yes || 0) + '</td>';
        h += '<td class="' + (totalRow.no ? 'rx-bad' : '') + '">' + (totalRow.no || 0) + '</td>';
        h += '<td>' + pct(target, 0) + '</td>' + rateTd(totalRow.rate, target);
        if (totalRow.dailyDiff == null) h += '<td class="rx-muted">—</td>';
        else h += '<td class="' + (totalRow.dailyDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">' +
          (totalRow.dailyDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(totalRow.dailyDiff * 100).toFixed(2) + 'pp</td>';
        return h + '</tr>';
      })();
      bindRegionClicks(dailyBody);
    }

    // 7-day history
    if (histHead && histBody) {
      histHead.innerHTML = '<tr><th>Region</th>' +
        (hist7.length ? hLabels.map(l => '<th>' + escapeHtml(l) + '</th>').join('') : '<th>—</th>') +
        '</tr>';
      histBody.innerHTML = regionRows.map(r => {
        let h = rowOpen(r.name, false);
        h += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
        (r.histRates || []).forEach(hr => { h += rateTd(hr.rate, target); });
        if (!(r.histRates || []).length) h += '<td class="rx-muted">—</td>';
        return h + '</tr>';
      }).join('') + (function () {
        let h = rowOpen(totalRow.name, true);
        h += '<td><strong>' + escapeHtml(totalRow.name) + '</strong></td>';
        (totalRow.histRates || []).forEach(hr => { h += rateTd(hr.rate, target); });
        if (!(totalRow.histRates || []).length) h += '<td class="rx-muted">—</td>';
        return h + '</tr>';
      })();
      bindRegionClicks(histBody);
    }

    // Weekly
    if (weekHead) {
      weekHead.innerHTML = '<tr><th>Region</th><th>' + escapeHtml(sample.wkPrevLabel || 'Prev week') +
        '</th><th>' + escapeHtml(sample.wkCurrLabel || 'Current week') +
        '</th><th>Trips (curr)</th><th>On time</th><th>Late</th><th>Weekly diff</th></tr>';
    }
    if (weekBody) {
      weekBody.innerHTML = regionRows.map(r => {
        let h = rowOpen(r.name, false);
        h += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
        h += rateTd(r.wkPrev, target) + rateTd(r.wkCurr, target);
        h += '<td>' + (r.wkCurrTotal || 0) + '</td><td>' + (r.wkCurrYes || 0) + '</td>';
        h += '<td class="' + (r.wkCurrNo ? 'rx-bad' : '') + '">' + (r.wkCurrNo || 0) + '</td>';
        if (r.weeklyDiff == null) h += '<td class="rx-muted">—</td>';
        else h += '<td class="' + (r.weeklyDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">' +
          (r.weeklyDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(r.weeklyDiff * 100).toFixed(2) + 'pp</td>';
        return h + '</tr>';
      }).join('') + (function () {
        const r = totalRow;
        let h = rowOpen(r.name, true);
        h += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
        h += rateTd(r.wkPrev, target) + rateTd(r.wkCurr, target);
        h += '<td>' + (r.wkCurrTotal || 0) + '</td><td>' + (r.wkCurrYes || 0) + '</td>';
        h += '<td class="' + (r.wkCurrNo ? 'rx-bad' : '') + '">' + (r.wkCurrNo || 0) + '</td>';
        if (r.weeklyDiff == null) h += '<td class="rx-muted">—</td>';
        else h += '<td class="' + (r.weeklyDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">' +
          (r.weeklyDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(r.weeklyDiff * 100).toFixed(2) + 'pp</td>';
        return h + '</tr>';
      })();
      bindRegionClicks(weekBody);
    }

    // Monthly
    if (monthBody) {
      monthBody.innerHTML = regionRows.map(r => {
        let h = rowOpen(r.name, false);
        h += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
        h += '<td class="' + (r.monthLate ? 'rx-bad' : '') + '">' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
        h += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
        h += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
        h += rateTd(r.monthRate, target);
        h += '<td>' + pct(target, 0) + '</td></tr>';
        return h;
      }).join('') + (function () {
        const r = totalRow;
        let h = rowOpen(r.name, true);
        h += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
        h += '<td class="' + (r.monthLate ? 'rx-bad' : '') + '">' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
        h += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
        h += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
        h += rateTd(r.monthRate, target);
        h += '<td>' + pct(target, 0) + '</td></tr>';
        return h;
      })();
      bindRegionClicks(monthBody);
    }

    
    // Charts for each section
    const tPct = Math.round(target * 100);
    const regionLabels = regionRows.map(r => r.name);
    makeScopeBarChart(
      'rxScopeChartDaily', 'daily',
      regionLabels,
      regionRows.map(r => r.rate),
      tPct,
      'Daily rate · ' + focus,
      '#E60012'
    );
    // 7-day: line per region (cap to top 8 by trip volume on focus day)
    const topRegions = regionRows.slice().sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 8);
    makeScopeLineChart(
      'rxScopeChartHist', 'hist',
      hLabels,
      topRegions.map(r => ({
        label: r.name,
        data: (r.histRates || []).map(hr => hr.rate)
      })),
      tPct
    );
    // Weekly grouped bar via dual datasets on bar chart - use current week rates
    makeScopeBarChart(
      'rxScopeChartWeek', 'week',
      regionLabels,
      regionRows.map(r => r.wkCurr),
      tPct,
      (sample.wkCurrLabel || 'Current week') + ' rate',
      '#1565C0'
    );
    makeScopeBarChart(
      'rxScopeChartMonth', 'month',
      regionLabels,
      regionRows.map(r => r.monthRate),
      tPct,
      'Month rate · ' + (mk || ''),
      '#6A1B9A'
    );

    panel.classList.remove('hidden');
  }

  function destroyScopeCharts() {
    Object.keys(scopeCharts).forEach(k => {
      if (scopeCharts[k]) { try { scopeCharts[k].destroy(); } catch (e) {} scopeCharts[k] = null; }
    });
  }

  function hideScopeReport() {
    const panel = document.getElementById('rxScopeReport');
    if (panel) panel.classList.add('hidden');
    destroyScopeCharts();
  }

  function makeScopeBarChart(canvasId, key, labels, values, targetPct, title, color) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    if (scopeCharts[key]) { try { scopeCharts[key].destroy(); } catch (e) {} scopeCharts[key] = null; }
    const data = values.map(v => v == null ? null : +(v * 100).toFixed(2));
    scopeCharts[key] = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: title,
            data,
            backgroundColor: data.map(v => v == null ? '#BDBDBD' : (v >= targetPct ? 'rgba(46,125,50,0.75)' : 'rgba(230,0,18,0.75)')),
            borderColor: data.map(v => v == null ? '#9E9E9E' : (v >= targetPct ? '#2E7D32' : '#E60012')),
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Target ' + targetPct + '%',
            data: labels.map(() => targetPct),
            type: 'line',
            borderColor: '#546E7A',
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex === 1) return 'Target: ' + targetPct + '%';
                const v = ctx.parsed.y;
                return (ctx.dataset.label || 'Rate') + ': ' + (v != null ? v.toFixed(2) + '%' : '—');
              }
            }
          }
        },
        scales: {
          y: { min: 40, max: 110, title: { display: true, text: 'Rate %' } },
          x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 16, font: { size: 10 } } }
        }
      }
    });
  }

  function makeScopeLineChart(canvasId, key, labels, seriesList, targetPct) {
    // seriesList: [{ label, data: rates[] }]
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    if (scopeCharts[key]) { try { scopeCharts[key].destroy(); } catch (e) {} scopeCharts[key] = null; }
    const colors = ['#E60012', '#1565C0', '#2E7D32', '#6A1B9A', '#F9A825', '#00838F', '#5D4037', '#C2185B', '#455A64', '#EF6C00'];
    const datasets = seriesList.slice(0, 10).map((s, i) => ({
      label: s.label,
      data: (s.data || []).map(v => v == null ? null : +(v * 100).toFixed(2)),
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length],
      borderWidth: 2,
      tension: 0.25,
      spanGaps: true,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 5
    }));
    datasets.push({
      label: 'Target ' + targetPct + '%',
      data: labels.map(() => targetPct),
      borderColor: '#9E9E9E',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
      fill: false
    });
    scopeCharts[key] = new Chart(el, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                return ctx.dataset.label + ': ' + (v != null ? v.toFixed(2) + '%' : '—');
              }
            }
          }
        },
        scales: {
          y: { min: 40, max: 110, title: { display: true, text: 'Rate %' } },
          x: { ticks: { maxRotation: 40, font: { size: 10 } } }
        }
      }
    });
  }

  function renderMatchList(matches) {
    const el = document.getElementById('rxMatchList'); if (!el) return;
    if (!matches.length) { el.innerHTML = '<div class="rx-empty">No matches for current search / filters.' + (exactMode ? ' <em>(exact)</em>' : '') + '</div>'; return; }
    if (matches.length === 1) {
      const m = matches[0];
      el.innerHTML = '<div class="rx-match-one">Showing <strong>' + escapeHtml(m.label) + '</strong> · ' + m.rows.length + ' trip(s)' + (m.kind === 'region' ? ' · region view' : (m.kind === 'scope' ? ' · scope view' : '')) + '</div>';
      return;
    }
    el.innerHTML = '<div class="rx-match-grid">' + matches.slice(0, 48).map(m => {
      const s = stats(m.rows);
      return '<button type="button" class="rx-match-card' + (selectedKey === m.key ? ' active' : '') + '" data-rx-key="' + escapeHtml(m.key) + '" data-rx-kind="' + escapeHtml(m.kind) + '"><span class="rx-mc-route">' + escapeHtml(m.label) + '</span><span class="rx-mc-meta">' + escapeHtml(m.meta || m.kind) + (m.kind && m.meta && m.meta.indexOf(m.kind) < 0 ? '' : '') + '</span><span class="rx-mc-stats">' + s.total + ' trips · ' + pct(s.rate) + '</span></button>';
    }).join('') + (matches.length > 48 ? '<div class="section-note">+' + (matches.length - 48) + ' more</div>' : '') + '</div>';
    el.querySelectorAll('[data-rx-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedKey = btn.getAttribute('data-rx-key');
        selectedKind = btn.getAttribute('data-rx-kind') || 'route';
        if (selectedKind === 'route') {
          routeFilter = selectedKey;
          const rs = document.getElementById('rxRoute');
          if (rs) { let ok = false; for (let i = 0; i < rs.options.length; i++) if (rs.options[i].value === selectedKey) ok = true; if (!ok) { const o = document.createElement('option'); o.value = selectedKey; o.textContent = selectedKey; rs.appendChild(o); } rs.value = selectedKey; }
        } else if (selectedKind === 'region') {
          regionFilter = selectedKey;
          const rs = document.getElementById('rxRegion'); if (rs) rs.value = selectedKey;
        } else if (selectedKind === 'trucker') {
          truckerFilter = selectedKey;
          const ts = document.getElementById('rxTrucker');
          if (ts) {
            let ok = false;
            for (let i = 0; i < ts.options.length; i++) if (ts.options[i].value === selectedKey) ok = true;
            if (!ok) { const o = document.createElement('option'); o.value = selectedKey; o.textContent = selectedKey; ts.appendChild(o); }
            ts.value = selectedKey;
          }
        }
        // plate / task / dc: keep selection via selectedKey only (pack built from match.rows)
        run();
      });
    });
  }
  function renderHero(pack) {
    const el = document.getElementById('rxHero'); if (!el || !pack) { if (el) el.innerHTML = ''; return; }
    const t = pack.target;
    const kindLabel = pack.kind === 'region' ? 'Region' : (pack.kind === 'scope' ? 'Scope' : (pack.kind === 'trucker' ? 'Trucker' : (pack.kind === 'dc' ? 'DC' : (pack.kind === 'plate' ? 'Plate' : (pack.kind === 'task' ? 'Task' : 'Route')))));
    el.innerHTML = '<div class="rx-hero-head"><div><h2 class="rx-route-title">' + escapeHtml(pack.label) + '</h2><div class="rx-hero-meta"><span class="rx-pill">' + kindLabel + '</span>' + (pack.region ? '<span class="rx-pill">' + escapeHtml(pack.region) + '</span>' : '') + '<span class="rx-pill rx-pill-' + String(pack.type).toLowerCase() + '">' + escapeHtml(pack.type) + '</span><span class="rx-pill">Target ' + pct(t, 0) + '</span><span class="rx-pill">Period: ' + periodFocus + '</span><span class="rx-pill">Mode: ' + dateMode + '</span></div></div></div><div class="rx-metric-grid">' +
      metricCard('Trips', pack.allSt.total, 'in current filters', 'neutral') +
      metricCard('On time', pack.allSt.yes, pct(pack.allSt.rate), 'ok') +
      metricCard('Not on time', pack.allSt.no, pack.allSt.total ? pct(pack.allSt.no / pack.allSt.total) : '', 'bad') +
      metricCard('Day rate', pct(pack.stA.rate), pack.focus ? pack.focus + ' · ' + (pack.stA.total || 0) + ' trips' : '—', pack.stA.rate == null ? 'neutral' : (pack.stA.rate >= t ? 'ok' : 'bad')) +
      metricCard('Week rate', pct(pack.wkSt.rate), (pack.wkFocus || '—') + ' · ' + (pack.wkSt.total || 0) + ' trips', pack.wkSt.rate == null ? 'neutral' : (pack.wkSt.rate >= t ? 'ok' : 'bad')) +
      metricCard('Month rate', pct(pack.moSt.rate), (pack.mkFocus || '—') + ' · ' + (pack.moSt.total || 0) + ' trips', pack.moSt.rate == null ? 'neutral' : (pack.moSt.rate >= t ? 'ok' : 'bad')) +
      metricCard('Avg plan TT', fmtHms(pack.avgPlan), 'vs actual ' + fmtHms(pack.avgActual), 'neutral') +
      metricCard('Late share', pack.allSt.total ? pct(pack.allSt.no / pack.allSt.total) : '—', pack.allSt.no + ' late trips', pack.allSt.no ? 'bad' : 'ok') + '</div>';
  }
  function renderCompareStrip(pack) {
    const el = document.getElementById('rxCompareStrip'); if (!el || !pack) return;
    const t = pack.target;
    function cell(title, st, rate) {
      return '<div class="rx-cmp-card"><div class="rx-cmp-title">' + title + '</div><div class="rx-cmp-rate ' + rateCls(rate, t) + '">' + pct(rate) + '</div><div class="rx-cmp-sub">' + (st.total || 0) + ' trips · ' + (st.yes || 0) + ' on time · <span class="rx-bad">' + (st.no || 0) + ' late</span></div></div>';
    }
    let h = '<div class="rx-cmp-grid">';
    if (periodFocus === 'day' || periodFocus === 'overall') { h += cell(pack.focus || 'Focus day', pack.stA, pack.stA.rate); if (pack.compare && dateMode === 'compare') h += cell(pack.compare, pack.stB, pack.stB.rate); }
    if (periodFocus === 'week' || periodFocus === 'overall') { h += cell(pack.wkFocus || 'Week A', pack.wkSt, pack.wkSt.rate); if (weekB && dateMode === 'compare') h += cell(weekB, pack.wkPrevSt, pack.wkPrevSt.rate); }
    if (periodFocus === 'month' || periodFocus === 'overall') { h += cell(pack.mkFocus || 'Month A', pack.moSt, pack.moSt.rate); if (monthB && dateMode === 'compare') h += cell(monthB, pack.moPrevSt, pack.moPrevSt.rate); }
    h += '</div>';
    if (pack.dailyDiff != null || pack.wkDiff != null || pack.moDiff != null) {
      h += '<div class="rx-diff-row">';
      if (pack.dailyDiff != null) h += '<span class="' + (pack.dailyDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">Day diff ' + (pack.dailyDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(pack.dailyDiff * 100).toFixed(2) + 'pp</span>';
      if (pack.wkDiff != null) h += '<span class="' + (pack.wkDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">Week diff ' + (pack.wkDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(pack.wkDiff * 100).toFixed(2) + 'pp</span>';
      if (pack.moDiff != null) h += '<span class="' + (pack.moDiff >= 0 ? 'rx-ok' : 'rx-bad') + '">Month diff ' + (pack.moDiff >= 0 ? '↑' : '↓') + ' ' + Math.abs(pack.moDiff * 100).toFixed(2) + 'pp</span>';
      h += '</div>';
    }
    el.innerHTML = h;
  }
  function renderSeriesTable(bodyId, series, target, focusKey) {
    const el = document.getElementById(bodyId); if (!el) return;
    if (!series || !series.length) { el.innerHTML = '<tr><td colspan="5">—</td></tr>'; return; }
    el.innerHTML = series.slice().reverse().map(h => {
      const key = h.date || h.key || h.label;
      return '<tr' + (focusKey && key === focusKey ? ' class="rx-row-focus"' : '') + '><td>' + escapeHtml(h.date || h.label || key) + '</td><td>' + (h.total || 0) + '</td><td>' + (h.yes || 0) + '</td><td class="' + (h.no ? 'rx-bad' : '') + '">' + (h.no || 0) + '</td><td class="' + rateCls(h.rate, target) + '"><strong>' + pct(h.rate) + '</strong></td></tr>';
    }).join('');
  }
  function renderBreakdown(pack) {
    const body = document.getElementById('rxBreakdownBody'); if (!body) return;
    const isRegionView = pack.kind === 'region' || pack.kind === 'scope' || effectiveGroupMode() === 'REGION';
    const title = document.getElementById('rxBreakdownTitle'); if (title) title.textContent = isRegionView ? 'By route' : 'By region';
    const note = document.getElementById('rxBreakdownNote'); if (note) note.textContent = isRegionView ? 'Routes inside selected region/scope (period window).' : 'Regions for selected route';
    const head = document.getElementById('rxBreakdownHead'); if (head) head.innerHTML = isRegionView ? '<tr><th>Route</th><th>Trips</th><th>On time</th><th>Late</th><th>Rate</th></tr>' : '<tr><th>Region</th><th>Trips</th><th>On time</th><th>Late</th><th>Rate</th></tr>';
    if (!pack.breakdown.length) { body.innerHTML = '<tr><td colspan="5">—</td></tr>'; return; }
    body.innerHTML = pack.breakdown.map(r => '<tr><td>' + escapeHtml(r.name) + '</td><td>' + r.total + '</td><td>' + r.yes + '</td><td class="' + (r.no ? 'rx-bad' : '') + '">' + r.no + '</td><td class="' + rateCls(r.rate, pack.target) + '"><strong>' + pct(r.rate) + '</strong></td></tr>').join('');
  }
  function renderTruckers(pack) {
    const el = document.getElementById('rxTruckerBody'); if (!el || !pack) return;
    if (!pack.truckers.length) { el.innerHTML = '<tr><td colspan="5">—</td></tr>'; return; }
    el.innerHTML = pack.truckers.map(t => '<tr><td>' + escapeHtml(t.name) + '</td><td>' + t.total + '</td><td>' + t.yes + '</td><td class="' + (t.no ? 'rx-bad' : '') + '">' + t.no + '</td><td class="' + rateCls(t.rate, pack.target) + '"><strong>' + pct(t.rate) + '</strong></td></tr>').join('');
  }
  function findDelayReason(trip) {
    if (typeof MttDelayReason === 'undefined' || !MttDelayReason.getState) return null;
    const delayRows = (MttDelayReason.getState().delayRows || []);
    if (!delayRows.length || !trip) return null;
    const taskId = String(trip.taskId || '').trim();
    const plate = String(trip.plate || '').trim().toUpperCase();
    const dateKey = trip.dateKey;
    let hit = null;
    if (taskId) {
      hit = delayRows.find(d => String(d.taskId || '').trim() === taskId && (!dateKey || d.dateKey === dateKey));
      if (!hit) hit = delayRows.find(d => String(d.taskId || '').trim() === taskId);
    }
    if (!hit && plate && dateKey) {
      hit = delayRows.find(d => String(d.plate || '').trim().toUpperCase() === plate && d.dateKey === dateKey);
    }
    if (!hit && plate) {
      hit = delayRows.find(d => String(d.plate || '').trim().toUpperCase() === plate);
    }
    return hit || null;
  }

  function showLateReason(trip) {
    const panel = document.getElementById('rxLateReasonPanel');
    const body = document.getElementById('rxLateReasonBody');
    if (!panel || !body) return;
    const d = findDelayReason(trip);
    if (!d) {
      body.innerHTML = '<div class="rx-late-empty">No matching delay reason found for this trip.' +
        ' Upload a workbook that includes a <strong>Delay Reason</strong> sheet, or the task may not have an IR.</div>' +
        '<div class="rx-late-reason-grid" style="margin-top:10px;">' +
        '<div class="rx-late-kv"><span>Task ID</span><strong>' + escapeHtml(trip.taskId || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Plate</span><strong>' + escapeHtml(trip.plate || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Date</span><strong>' + escapeHtml(trip.dateKey || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Route</span><strong>' + escapeHtml(trip.route || '—') + '</strong></div>' +
        '</div>';
      panel.classList.remove('hidden');
      return;
    }
    const problem = d.problem || d.category || 'Delay recorded';
    body.innerHTML =
      '<div class="rx-late-problem">' + escapeHtml(problem) +
        (d.category && d.problem ? ' <span class="rx-pill">' + escapeHtml(d.category) + '</span>' : '') +
      '</div>' +
      '<div class="rx-late-reason-grid">' +
        '<div class="rx-late-kv"><span>Task ID</span><strong>' + escapeHtml(d.taskId || trip.taskId || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Plate</span><strong>' + escapeHtml(d.plate || trip.plate || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Date</span><strong>' + escapeHtml(d.dateKey || trip.dateKey || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Trucker</span><strong>' + escapeHtml(d.trucker || trip.trucker || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Location</span><strong>' + escapeHtml(d.location || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Region</span><strong>' + escapeHtml(d.region || trip.region || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Route</span><strong>' + escapeHtml(d.route || trip.route || '—') + '</strong></div>' +
        '<div class="rx-late-kv"><span>Route group</span><strong>' + escapeHtml(d.routeGroup || '—') + '</strong></div>' +
      '</div>' +
      (d.remarks
        ? '<div class="rx-late-remarks">' + escapeHtml(d.remarks) + '</div>'
        : '<div class="rx-late-empty">No remarks text on the Delay Reason row.</div>');
    panel.classList.remove('hidden');
  }

  function renderLate(pack) {
    const el = document.getElementById('rxLateBody');
    const note = document.getElementById('rxLateNote');
    if (!el) return;
    const list = pack.lateFocus || [];
    if (note) {
      note.textContent = list.length
        ? (list.length + ' late trip(s) · click a row to view delay reason')
        : 'No late trips for the current selection.';
    }
    const panel = document.getElementById('rxLateReasonPanel');
    if (panel) panel.classList.add('hidden');

    if (!list.length) {
      el.innerHTML = '<tr><td colspan="10">—</td></tr>';
      return;
    }
    el.innerHTML = list.slice(0, 250).map((r, idx) => {
      const overrun = (Number(r.actualTT) || 0) - (Number(r.planTT) || 0);
      return '<tr class="rx-late-row" data-rx-late-idx="' + idx + '">' +
        '<td>' + escapeHtml(r.dateKey || '') + '</td>' +
        '<td>' + escapeHtml(r.taskId || '') + '</td>' +
        '<td>' + escapeHtml(r.plate || '') + '</td>' +
        '<td>' + escapeHtml(r.trucker || '') + '</td>' +
        '<td>' + escapeHtml(r.route || '') + '</td>' +
        '<td>' + escapeHtml(r.region || '') + '</td>' +
        '<td>' + escapeHtml(r.dcIntended || '') + '</td>' +
        '<td>' + fmtHms(r.planTT) + '</td>' +
        '<td>' + fmtHms(r.actualTT) + '</td>' +
        '<td class="rx-bad">' + fmtHms(Math.max(0, overrun)) + '</td></tr>';
    }).join('');

    el.querySelectorAll('[data-rx-late-idx]').forEach(tr => {
      tr.addEventListener('click', () => {
        el.querySelectorAll('tr').forEach(x => x.classList.remove('rx-late-selected'));
        tr.classList.add('rx-late-selected');
        const idx = parseInt(tr.getAttribute('data-rx-late-idx'), 10);
        const trip = list[idx];
        if (trip) showLateReason(trip);
      });
    });
  }

  function makeLineChart(canvasId, key, labels, rates, targetPct, title, color) {
    const el = document.getElementById(canvasId); if (!el || typeof Chart === 'undefined') return;
    if (charts[key]) { try { charts[key].destroy(); } catch (e) {} charts[key] = null; }
    charts[key] = new Chart(el, {
      type: 'line',
      data: { labels, datasets: [
        { label: title, data: rates.map(r => r == null ? null : +(r * 100).toFixed(2)), borderColor: color || '#E60012', backgroundColor: color || '#E60012', borderWidth: 2.5, tension: 0.25, spanGaps: true, fill: false, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: color || '#E60012', pointBorderWidth: 2 },
        { label: 'Target ' + targetPct + '%', data: labels.map(() => targetPct), borderColor: '#9E9E9E', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 1 ? ('Target: ' + targetPct + '%') : ('Rate: ' + (ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) + '%' : '—')) } } },
        scales: { y: { min: 40, max: 110, title: { display: true, text: 'Rate %' } }, x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 16, font: { size: 10 } } } } }
    });
  }
  function renderCharts(pack) {
    if (!pack) { destroyCharts(); return; }
    const tPct = Math.round(pack.target * 100);
    if (periodFocus === 'day' || periodFocus === 'overall') makeLineChart('rxChartHist', 'hist', pack.dailySeries.map(h => String(h.date).slice(5)), pack.dailySeries.map(h => h.rate), tPct, 'Daily rate', '#E60012');
    if (periodFocus === 'week' || periodFocus === 'overall') makeLineChart('rxChartWeek', 'week', pack.weekSeries.map(w => w.label), pack.weekSeries.map(w => w.rate), tPct, 'Weekly rate', '#1565C0');
    if (periodFocus === 'month' || periodFocus === 'overall') makeLineChart('rxChartMonth', 'month', pack.monthSeries.map(w => w.label), pack.monthSeries.map(w => w.rate), tPct, 'Monthly rate', '#6A1B9A');
  }
  function renderDetail(pack) {
    const wrap = document.getElementById('rxDetailWrap'); if (!wrap) return;
    if (!pack) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    renderHero(pack); renderCompareStrip(pack);
    renderSeriesTable('rxHistBody', pack.dailySeries, pack.target, pack.focus);
    renderSeriesTable('rxWeekBody', pack.weekSeries, pack.target, pack.wkFocus);
    renderSeriesTable('rxMonthBody', pack.monthSeries, pack.target, pack.mkFocus);
    renderBreakdown(pack); renderTruckers(pack); renderLate(pack); renderCharts(pack);
  }
  function updateInfo(matches) {
    const el = document.getElementById('rxInfo'); if (!el) return;
    el.innerHTML = 'Scope <span class="badge">' + scope + '</span> · Group <span class="badge">' + effectiveGroupMode() + '</span> · Period <span class="badge">' + periodFocus + '</span> · Mode <span class="badge">' + dateMode + '</span> · Matches <span class="badge">' + matches.length + '</span>' + (exactMode ? ' · <span class="badge" style="background:#6A1B9A">Exact</span>' : '');
  }
  function run() {
    const rows0 = allRows();
    if (!rows0.length) { const list = document.getElementById('rxMatchList'); if (list) list.innerHTML = '<div class="rx-empty">Upload a Mainline workbook first.</div>'; renderDetail(null); return; }
    populateSelectors(); syncPeriodUI();
    const intent = parseSearchIntent(searchQ);
    if (intent.type === 'scope' && intent.scope) {
      scope = intent.scope;
      const sc = document.getElementById('rxScope');
      if (sc) sc.value = scope;
      // Luzon / VisMin → always show region cards (like reports)
      if (intent.scope === 'LUZON' || intent.scope === 'VISMIN') {
        regionFilter = 'ALL';
        routeFilter = 'ALL';
        selectedKey = null;
        if (groupBy === 'AUTO') { /* keep AUTO; effectiveGroupMode becomes REGION */ }
      }
    }
    const matches = matchEntities(baseFilter(rows0));
    lastMatches = matches; updateInfo(matches); renderMatchList(matches);

    // Luzon / VisMin → multi-region report (Mainline style) when not drilled into one region
    const scopedRows = baseFilter(rows0);
    const dates = allDates();
    const focus = dateA || (dates.length ? dates[dates.length - 1] : null);
    const showScopeReport = (scope === 'LUZON' || scope === 'VISMIN')
      && (!regionFilter || regionFilter === 'ALL')
      && (!routeFilter || routeFilter === 'ALL')
      && !selectedKey;
    if (showScopeReport) {
      renderScopeReport(scope, scopedRows, focus, dates);
    } else {
      hideScopeReport();
    }

    let pack = null;
    if (selectedKey) {
      const m = matches.find(x => x.key === selectedKey);
      if (m) pack = buildPack(m);
      else selectedKey = null;
    }
    // Do not auto-pick a single region when showing the multi-region report
    if (!pack && matches.length === 1 && !showScopeReport) {
      selectedKey = matches[0].key;
      selectedKind = matches[0].kind;
      pack = buildPack(matches[0]);
    }
    renderDetail(pack);
  }
  function onSearchKey(e) {
    const input = document.getElementById('rxSearch'); if (!input) return;
    searchQ = input.value || '';
    if (e && e.key === 'Enter') { e.preventDefault(); exactMode = true; selectedKey = null; run(); if (lastMatches.length === 1) { selectedKey = lastMatches[0].key; selectedKind = lastMatches[0].kind; run(); } return; }
    exactMode = false; selectedKey = null; run();
  }
  function onDataReady() { selectedKey = null; exactMode = false; searchQ = ''; const input = document.getElementById('rxSearch'); if (input) input.value = ''; run(); }
  function init() {
    const input = document.getElementById('rxSearch');
    if (input) { let t; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => onSearchKey(null), 180); }); input.addEventListener('keydown', onSearchKey); }
    const btnSearch = document.getElementById('btnRxSearch');
    if (btnSearch) btnSearch.addEventListener('click', () => { exactMode = true; selectedKey = null; const i2 = document.getElementById('rxSearch'); searchQ = (i2 && i2.value) || ''; run(); });
    const dateModeSel = document.getElementById('rxDateMode');
    if (dateModeSel) dateModeSel.addEventListener('change', () => { dateMode = dateModeSel.value || 'compare'; syncPeriodUI(); run(); });
    const groupSel = document.getElementById('rxGroupBy');
    if (groupSel) groupSel.addEventListener('change', () => { groupBy = groupSel.value || 'AUTO'; selectedKey = null; run(); });
    ['rxScope','rxRegion','rxRoute','rxTrucker','rxLegType','rxDateA','rxDateB','rxWeek','rxWeekB','rxMonth','rxMonthB'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener('change', () => {
        if (id === 'rxScope') { scope = el.value || 'ALL'; regionFilter = 'ALL'; routeFilter = 'ALL'; truckerFilter = 'ALL'; selectedKey = null; }
        if (id === 'rxRegion') { regionFilter = el.value || 'ALL'; selectedKey = regionFilter !== 'ALL' ? regionFilter : null; selectedKind = 'region'; }
        if (id === 'rxRoute') { routeFilter = el.value || 'ALL'; selectedKey = routeFilter !== 'ALL' ? routeFilter : null; selectedKind = 'route'; if (selectedKey) { searchQ = selectedKey; const s = document.getElementById('rxSearch'); if (s) s.value = selectedKey; exactMode = true; } }
        if (id === 'rxTrucker') { truckerFilter = el.value || 'ALL'; selectedKey = null; }
        if (id === 'rxLegType') { legType = el.value || 'ALL'; selectedKey = null; }
        if (id === 'rxDateA') dateA = el.value; if (id === 'rxDateB') dateB = el.value;
        if (id === 'rxWeek') weekA = el.value; if (id === 'rxWeekB') weekB = el.value;
        if (id === 'rxMonth') monthA = el.value; if (id === 'rxMonthB') monthB = el.value;
        run();
      });
    });
    document.querySelectorAll('[data-rx-period]').forEach(b => b.addEventListener('click', () => { periodFocus = b.getAttribute('data-rx-period') || 'day'; syncPeriodUI(); run(); }));
    const clear = document.getElementById('rxClear');
    if (clear) clear.addEventListener('click', () => {
      searchQ = ''; exactMode = false; scope = 'ALL'; groupBy = 'AUTO'; regionFilter = 'ALL'; routeFilter = 'ALL'; truckerFilter = 'ALL'; legType = 'ALL'; periodFocus = 'day'; dateMode = 'compare'; selectedKey = null; selectedKind = 'route';
      const s = document.getElementById('rxSearch'); if (s) s.value = '';
      ['rxScope','rxRegion','rxRoute','rxTrucker','rxLegType','rxGroupBy','rxDateMode'].forEach(id => { const el = document.getElementById(id); if (!el) return; if (id === 'rxGroupBy') el.value = 'AUTO'; else if (id === 'rxDateMode') el.value = 'compare'; else el.value = 'ALL'; });
      syncPeriodUI(); run();
    });
    syncPeriodUI();
  }
  return { init, onDataReady, run };
})();

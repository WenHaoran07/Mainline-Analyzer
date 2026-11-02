/* ==========================================================================
   MODULE: MTT TRAVEL TIME REPORT
   Content aligned with Excel:
     OVERALL sheet → Mainline / Luzon / VisMin blocks + monthly achieve charts
     SLU TRAVEL TIME → By DC, By Trucker, Luzon by Region+Route, VisMin by Region+Route
   Data: SLU rows only (FileProcessor).
   ========================================================================== */
const MttTravelReport = (() => {
  const TARGET = { ALL: 0.96, LUZON: 0.97, VISMIN: 0.85 };

  const DC_NAME_MAP = {
    '490': 'LagunaDC1', '492': 'LagunaDC2', '430': 'BatangasDC1',
    '460': 'Cavite DC1', '9071': 'DW-Taytay 888', '907': 'DW-Taytay 888', '470': 'Lucena'
  };

  let activeView = 'overall';
  let focusDate = null;
  const charts = { luzonMonth: null, visminMonth: null };

  function pad2(n) { return String(n).padStart(2, '0'); }
  function pct(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(d == null ? 2 : d) + '%';
  }
  function weekKey(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.weekKey) ? MttUtils.weekKey(dateKey) : null;
  }
  function weekNum(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.excelWeekNum) ? MttUtils.excelWeekNum(dateKey) : null;
  }
  function monthKey(d) { return d ? String(d).slice(0, 7) : null; }

  function resolveDc(codeOrName) {
    const raw = String(codeOrName || '').trim();
    const digits = raw.replace(/\.0+$/, '').replace(/[^0-9]/g, '') || raw;
    if (DC_NAME_MAP[digits]) return { name: DC_NAME_MAP[digits], code: digits };
    if (DC_NAME_MAP[raw]) return { name: DC_NAME_MAP[raw], code: raw };
    return { name: raw || '(blank)', code: digits || '' };
  }

  function allRows() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return MttFileProcessor.getState().storedRows || [];
  }
  function allDates() {
    if (typeof MttFileProcessor === 'undefined') return [];
    return (MttFileProcessor.getState().storedDates || []).slice().sort();
  }
  function getFocusDate() {
    const sel = document.getElementById('selectLatest');
    if (sel && sel.value) return sel.value;
    const dates = allDates();
    return dates.length ? dates[dates.length - 1] : null;
  }

  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => String(r.onTime || '').toUpperCase() === 'YES').length;
    const total = list.length;
    return { total, yes, no: total - yes, rate: total ? yes / total : null };
  }
  function filterScope(list, scope) {
    if (scope === 'LUZON') return list.filter(r => r.routeType === 'LUZON');
    if (scope === 'VISMIN') return list.filter(r => r.routeType === 'VISMIN');
    return list;
  }
  function last7Dates(focus, dates) {
    const sorted = (dates || []).slice().sort();
    if (!focus || !sorted.length) return [];
    const idx = sorted.indexOf(focus);
    const end = idx >= 0 ? idx : sorted.length - 1;
    return sorted.slice(Math.max(0, end - 6), end + 1);
  }
  function prevDate(focus, dates) {
    const sorted = (dates || []).slice().sort();
    const idx = sorted.indexOf(focus);
    return idx > 0 ? sorted[idx - 1] : null;
  }
  function histHeaders(hist7) {
    return hist7.map(d => {
      const p = String(d).split('-');
      return p.length === 3 ? (parseInt(p[1], 10) + '/' + parseInt(p[2], 10)) : d;
    });
  }
  function formatLongDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[m - 1] + ' ' + day + ', ' + y;
  }
  function arrow(diff) {
    if (diff == null || isNaN(diff)) return '—';
    if (Math.abs(diff) < 0.0005) return '➡';
    return diff > 0 ? '⬆' : '⬇';
  }
  function mood(diff) {
    if (diff == null || isNaN(diff)) return '';
    if (diff >= 0.01) return '😊';
    if (diff <= -0.01) return '😫';
    return '😐';
  }

  function buildEntityRow(name, code, rows, focus, dates, scopeTarget) {
    const day = rows.filter(r => r.dateKey === focus);
    const st = stats(day);
    const prev = prevDate(focus, dates);
    const prevSt = prev ? stats(rows.filter(r => r.dateKey === prev)) : { rate: null };
    const dailyDiff = (st.rate != null && prevSt.rate != null) ? st.rate - prevSt.rate : null;

    const hist7 = last7Dates(focus, dates);
    const histRates = hist7.map(d => {
      const s = stats(rows.filter(r => r.dateKey === d));
      return { date: d, rate: s.rate, total: s.total };
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
    const wkCurrSt = stats(rows.filter(r => weekKey(r.dateKey) === wkCurrKey));
    const wkPrevSt = wkPrevKey ? stats(rows.filter(r => weekKey(r.dateKey) === wkPrevKey)) : { rate: null };
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
      name, code,
      total: st.total, followed: st.yes, notFollowed: st.no,
      target: scopeTarget, rate: st.rate,
      hist7, histRates,
      dailyDiff, mood: mood(dailyDiff), arrow: arrow(dailyDiff),
      wkPrev: wkPrevSt.rate, wkCurr: wkCurrSt.rate, weeklyDiff,
      wkPrevLabel, wkCurrLabel,
      monthLate: monthSt.no, monthOnTime: monthSt.yes,
      monthTotal: monthSt.total, monthRate: monthSt.rate
    };
  }

  function assignRanks(entities) {
    const ranked = entities
      .filter(r => r.monthRate != null && r.monthTotal > 0)
      .slice()
      .sort((a, b) => b.monthRate - a.monthRate || b.monthTotal - a.monthTotal);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    entities.forEach(r => { if (r.rank == null) r.rank = '—'; });
  }

  function rateCell(rate, target, opts) {
    opts = opts || {};
    if (rate == null) return '<td class="tr-muted">—</td>';
    const hit = target != null && rate >= target;
    const cls = [hit ? 'tr-ok' : 'tr-bad'];
    if (opts.yellow) cls.push('tr-rate-yellow');
    return '<td class="' + cls.join(' ') + '">' + pct(rate) + '</td>';
  }

  function destroyChart(key) {
    if (charts[key]) {
      try { charts[key].destroy(); } catch (e) {}
      charts[key] = null;
    }
  }

  /** Monthly day 1–31 achieve series for a route scope (SLU only) */
  function monthDaySeries(scope, focus) {
    const mk = monthKey(focus);
    if (!mk) return { labels: [], rates: [], target: TARGET[scope] || 0.96 };
    const [y, m] = mk.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const rows = filterScope(allRows(), scope);
    const labels = [];
    const rates = [];
    for (let d = 1; d <= lastDay; d++) {
      const key = y + '-' + pad2(m) + '-' + pad2(d);
      labels.push(String(d));
      const dayRows = rows.filter(r => r.dateKey === key);
      const s = stats(dayRows);
      rates.push(s.total ? +(s.rate * 100).toFixed(2) : null);
    }
    return { labels, rates, target: (TARGET[scope] || 0.96) * 100 };
  }

  /** Rate labels ABOVE point if >= target, BELOW if under */
  function rateLabelPlugin(targetPct) {
    return {
      id: 'trRateLabels_' + String(targetPct),
      afterDatasetsDraw: function (chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 10px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        meta.data.forEach(function (pt, i) {
          const v = chart.data.datasets[0].data[i];
          if (v == null || isNaN(v)) return;
          const hit = v >= targetPct;
          ctx.fillStyle = hit ? '#1B5E20' : '#B71C1C';
          ctx.textBaseline = hit ? 'bottom' : 'top';
          const y = hit ? (pt.y - 5) : (pt.y + 5);
          ctx.fillText(Number(v).toFixed(1) + '%', pt.x, y);
        });
        ctx.restore();
      }
    };
  }

  function renderMonthChart(canvasId, chartKey, scope, focus, title) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    destroyChart(chartKey);
    const series = monthDaySeries(scope, focus);
    const targetPct = series.target;
    charts[chartKey] = new Chart(el, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Achieve',
            data: series.rates,
            borderColor: '#E60012',
            backgroundColor: '#E60012',
            borderWidth: 2,
            tension: 0.25,
            spanGaps: true,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#E60012',
            pointBorderWidth: 2
          },
          {
            label: 'Target',
            data: series.labels.map(() => targetPct),
            borderColor: '#1565C0',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 16, bottom: 14 } },
        plugins: {
          title: { display: true, text: title, color: '#1565C0', font: { size: 15, weight: '700' } },
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.parsed.y;
                return ctx.dataset.label + ': ' + (v != null ? v.toFixed(2) + '%' : '—');
              }
            }
          }
        },
        scales: {
          y: {
            min: Math.max(0, targetPct - 40),
            max: 105,
            title: { display: true, text: 'Rate %' }
          },
          x: {
            title: { display: true, text: 'Day of month' },
            ticks: { autoSkip: true, maxTicksLimit: 31 }
          }
        }
      },
      plugins: [rateLabelPlugin(targetPct)]
    });
  }

  /** Shared multi-section table */
  function renderReportTable(opts) {
    const {
      title, leftHeaders, rows, hist7, target, totalRow, groupLeft
    } = opts;
    const hLabels = histHeaders(hist7 || []);
    const nHist = Math.max((hist7 || []).length, 1);
    const nLeft = leftHeaders.length;

    // Rank non-total rows
    const body = (rows || []).slice();
    assignRanks(body);

    let h = '<div class="tr-block">';
    h += '<div class="tr-block-title">' + title + '</div>';
    h += '<div class="table-scroll tr-scroll"><table class="tr-table tr-excel"><thead>';
    h += '<tr class="tr-h1">';
    leftHeaders.forEach((lh, i) => {
      h += '<th rowspan="2" class="' + (i === 0 ? 'tr-sticky ' : '') + 'tr-g-id">' + lh + '</th>';
    });
    h += '<th colspan="5" class="tr-g-daily">DAILY SUMMARY (' + formatLongDate(focusDate) + ')</th>';
    h += '<th colspan="' + nHist + '" class="tr-g-hist">7 DAYS RATE HISTORY</th>';
    h += '<th colspan="2" class="tr-g-daily-cmp">DAILY COMPARISON</th>';
    h += '<th colspan="3" class="tr-g-week">WEEKLY RATE</th>';
    h += '<th colspan="5" class="tr-g-month">MONTHLY RATE</th>';
    h += '</tr><tr class="tr-h2">';
    h += '<th class="tr-g-daily">Total Arrival Times</th>';
    h += '<th class="tr-g-daily">Followed Plan travel time</th>';
    h += '<th class="tr-g-daily">Not followed Plan travel time</th>';
    h += '<th class="tr-g-daily">TARGET</th>';
    h += '<th class="tr-g-daily">RATE</th>';
    h += (hist7 && hist7.length)
      ? hLabels.map(l => '<th class="tr-g-hist">' + l + '</th>').join('')
      : '<th class="tr-g-hist">—</th>';
    const sample = totalRow || body[0] || {};
    h += '<th class="tr-g-daily-cmp">DAILY DIFF</th><th class="tr-g-daily-cmp"></th>';
    h += '<th class="tr-g-week">' + (sample.wkPrevLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">' + (sample.wkCurrLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">WEEKLY DIFF</th>';
    h += '<th class="tr-g-month">MONTHLY DELAY</th>';
    h += '<th class="tr-g-month">MONTHLY ONTIME</th>';
    h += '<th class="tr-g-month">TOTAL</th>';
    h += '<th class="tr-g-month">RATE</th>';
    h += '<th class="tr-g-month">RANK</th>';
    h += '</tr></thead><tbody>';

    function paintRow(r, bold, leftVals) {
      let html = '<tr class="' + (bold ? 'tr-slu' : '') + '">';
      leftVals.forEach((v, i) => {
        html += '<td class="' + (i === 0 ? 'tr-sticky' : '') + '">' +
          (i === 0 ? '<strong>' + (v || '') + '</strong>' : (v || '')) + '</td>';
      });
      // pad left cells if group spans
      while (leftVals.length < nLeft) {
        html += '<td></td>';
        leftVals.push('');
      }
      html += '<td>' + (r.total || 0) + '</td>';
      html += '<td>' + (r.followed || 0) + '</td>';
      html += '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0) + '</td>';
      html += '<td>' + pct(r.target != null ? r.target : target, 0) + '</td>';
      html += rateCell(r.rate, r.target != null ? r.target : target, { yellow: true });
      (r.histRates || []).forEach(hr => { html += rateCell(hr.rate, r.target != null ? r.target : target); });
      if (!(r.histRates || []).length) html += '<td class="tr-muted">—</td>';
      const diffCls = r.dailyDiff == null ? '' : (r.dailyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + diffCls + '">' + (r.dailyDiff == null ? '—' : (r.dailyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td class="tr-arrow">' + (r.mood || r.arrow || '') + '</td>';
      html += rateCell(r.wkPrev, r.target != null ? r.target : target);
      html += rateCell(r.wkCurr, r.target != null ? r.target : target);
      const wCls = r.weeklyDiff == null ? '' : (r.weeklyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + wCls + '">' + (r.weeklyDiff == null ? '—' : (r.weeklyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td>' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
      html += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
      html += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
      html += rateCell(r.monthRate, r.target != null ? r.target : target, { yellow: true });
      html += '<td class="tr-rank">' + (bold ? '—' : (r.rank != null ? r.rank : '—')) + '</td>';
      html += '</tr>';
      return html;
    }

    if (groupLeft) {
      // rows already ordered with region group labels in leftVals via custom list
      body.forEach(item => {
        h += paintRow(item.row, !!item.bold, item.left);
      });
    } else {
      body.forEach(r => {
        const left = leftHeaders.length === 2
          ? [r.name, r.code || '']
          : [r.name];
        h += paintRow(r, false, left);
      });
      if (totalRow) {
        const left = leftHeaders.length === 2
          ? [totalRow.name, totalRow.code || '']
          : [totalRow.name];
        h += paintRow(totalRow, true, left);
      }
    }

    h += '</tbody></table></div></div>';
    return h;
  }

  function buildScopeBlock(title, scope, target, focus, dates) {
    const rows = filterScope(allRows(), scope);
    const slu = buildEntityRow('SLU', '', rows, focus, dates, target);
    const regionNames = [...new Set(rows.map(r => r.region || '(blank)'))].sort();
    const regionRows = regionNames.map(reg =>
      buildEntityRow(reg, '', rows.filter(r => (r.region || '(blank)') === reg), focus, dates, target)
    ).filter(r => r.monthTotal > 0 || r.total > 0 || (r.histRates || []).some(h => h.total > 0));
    return { title, target, slu, regionRows, hist7: last7Dates(focus, dates) };
  }

  function buildRouteRegionPack(scope, target, focus, dates) {
    const rows = filterScope(allRows(), scope);
    const hist7 = last7Dates(focus, dates);
    // Group by region, then routes under each
    const byReg = new Map();
    rows.forEach(r => {
      const reg = r.region || '(blank)';
      if (!byReg.has(reg)) byReg.set(reg, []);
      byReg.get(reg).push(r);
    });
    const items = [];
    [...byReg.keys()].sort().forEach(reg => {
      const regList = byReg.get(reg);
      const regRow = buildEntityRow(reg, '', regList, focus, dates, target);
      items.push({ left: [reg, ''], row: regRow, bold: false, isGroup: true });

      const byRoute = new Map();
      regList.forEach(r => {
        const rt = r.route || '(blank)';
        if (!byRoute.has(rt)) byRoute.set(rt, []);
        byRoute.get(rt).push(r);
      });
      [...byRoute.keys()].sort().forEach(rt => {
        const routeRow = buildEntityRow(rt, '', byRoute.get(rt), focus, dates, target);
        // only keep routes with some activity
        if (routeRow.total > 0 || routeRow.monthTotal > 0 || (routeRow.histRates || []).some(h => h.total > 0)) {
          items.push({ left: ['', rt], row: routeRow, bold: false, isGroup: false });
        }
      });
    });

    const totalName = scope === 'LUZON' ? 'LUZON ROUTE' : (scope === 'VISMIN' ? 'VISMIN ROUTE' : 'SLU');
    const totalRow = buildEntityRow(totalName, '', rows, focus, dates, target);
    items.push({ left: [totalName, ''], row: totalRow, bold: true, isGroup: true });
    return { hist7, items, target, title: scope === 'LUZON'
      ? 'SLU LUZON Route Mainline Travel Time Report'
      : 'SLU VisMin Route Mainline Travel Time Report' };
  }

  function renderOverallView(focus, dates) {
    let html = '';
    const scopes = [
      { title: 'Mainline Travel Time Report', scope: 'ALL', target: TARGET.ALL },
      { title: 'LUZON Route Mainline Travel Time Report', scope: 'LUZON', target: TARGET.LUZON },
      { title: 'VisMin Route Mainline Travel Time Report', scope: 'VISMIN', target: TARGET.VISMIN }
    ];

    function overallBlock(block) {
      // SLU first (like Excel), then other regions, no duplicate total footer
      const rows = [block.slu].concat(block.regionRows.filter(r => r.name !== 'SLU'));
      return renderReportTable({
        title: block.title,
        leftHeaders: ['REGION'],
        rows: rows,
        hist7: block.hist7,
        target: block.target,
        totalRow: null
      });
    }

    const main = buildScopeBlock(scopes[0].title, 'ALL', TARGET.ALL, focus, dates);
    html += overallBlock(main);

    const luz = buildScopeBlock(scopes[1].title, 'LUZON', TARGET.LUZON, focus, dates);
    html += overallBlock(luz);
    html += '<div class="tr-chart-card"><canvas id="trChartLuzonMonth"></canvas></div>';

    const vis = buildScopeBlock(scopes[2].title, 'VISMIN', TARGET.VISMIN, focus, dates);
    html += overallBlock(vis);
    html += '<div class="tr-chart-card"><canvas id="trChartVisminMonth"></canvas></div>';

    return html;
  }

  function renderDcView(focus, dates) {
    const rows = allRows();
    const hist7 = last7Dates(focus, dates);
    const byCode = new Map();
    rows.forEach(r => {
      const dc = resolveDc(r.dcIntended);
      const key = dc.code || dc.name;
      if (!byCode.has(key)) byCode.set(key, { name: dc.name, code: dc.code, list: [] });
      byCode.get(key).list.push(r);
    });
    const entities = [...byCode.values()]
      .map(e => buildEntityRow(e.name, e.code, e.list, focus, dates, TARGET.ALL))
      .filter(r => r.monthTotal > 0 || r.total > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
    return renderReportTable({
      title: 'SLU Mainline Travel Time Report',
      leftHeaders: ['DC NAME', 'DC CODE'],
      rows: entities,
      hist7,
      target: TARGET.ALL,
      totalRow: slu
    });
  }

  function renderTruckerView(focus, dates) {
    const rows = allRows();
    const hist7 = last7Dates(focus, dates);
    const byT = new Map();
    rows.forEach(r => {
      const t = r.trucker || '(blank)';
      if (!byT.has(t)) byT.set(t, []);
      byT.get(t).push(r);
    });
    const entities = [...byT.entries()]
      .map(([name, list]) => buildEntityRow(name, '', list, focus, dates, TARGET.ALL))
      .filter(r => r.monthTotal > 0 || r.total > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
    return renderReportTable({
      title: 'SLU Mainline Travel Time per Trucker Report',
      leftHeaders: ['TRUCKERS'],
      rows: entities,
      hist7,
      target: TARGET.ALL,
      totalRow: slu
    });
  }

  function renderRouteView(scope, focus, dates) {
    const pack = buildRouteRegionPack(scope, scope === 'LUZON' ? TARGET.LUZON : TARGET.VISMIN, focus, dates);
    return renderReportTable({
      title: pack.title,
      leftHeaders: ['REGION INTENDED', 'ROUTE'],
      rows: null,
      hist7: pack.hist7,
      target: pack.target,
      totalRow: null,
      groupLeft: true,
      // custom: inject items via monkey — handle below
      _items: pack.items
    }).replace('<!--ITEMS-->', '') // placeholder unused
      // Actually renderReportTable with groupLeft needs items - fix by dedicated path
    ;
  }

  // Specialized renderer for region+route grouped tables
  function renderGroupedRouteTable(scope, focus, dates) {
    const target = scope === 'LUZON' ? TARGET.LUZON : TARGET.VISMIN;
    const pack = buildRouteRegionPack(scope, target, focus, dates);
    const hist7 = pack.hist7;
    const hLabels = histHeaders(hist7);
    const nHist = Math.max(hist7.length, 1);
    const sample = pack.items.length ? pack.items[pack.items.length - 1].row : {};

    // rank only route-level (non-group, non-total) rows
    const routeRows = pack.items.filter(i => !i.isGroup && !i.bold).map(i => i.row);
    assignRanks(routeRows);

    let h = '<div class="tr-block">';
    h += '<div class="tr-block-title">' + pack.title + '</div>';
    h += '<div class="table-scroll tr-scroll"><table class="tr-table tr-excel"><thead>';
    h += '<tr class="tr-h1">';
    h += '<th rowspan="2" class="tr-sticky tr-g-id">REGION INTENDED</th>';
    h += '<th rowspan="2" class="tr-g-id">ROUTE</th>';
    h += '<th colspan="5" class="tr-g-daily">DAILY SUMMARY (' + formatLongDate(focusDate) + ')</th>';
    h += '<th colspan="' + nHist + '" class="tr-g-hist">7 DAYS RATE HISTORY</th>';
    h += '<th colspan="2" class="tr-g-daily-cmp">DAILY COMPARISON</th>';
    h += '<th colspan="3" class="tr-g-week">WEEKLY RATE</th>';
    h += '<th colspan="5" class="tr-g-month">MONTHLY RATE</th>';
    h += '</tr><tr class="tr-h2">';
    h += '<th class="tr-g-daily">Total Arrival Times</th>';
    h += '<th class="tr-g-daily">Followed Plan travel time</th>';
    h += '<th class="tr-g-daily">Not followed Plan travel time</th>';
    h += '<th class="tr-g-daily">TARGET</th>';
    h += '<th class="tr-g-daily">RATE</th>';
    h += hist7.length ? hLabels.map(l => '<th class="tr-g-hist">' + l + '</th>').join('') : '<th class="tr-g-hist">—</th>';
    h += '<th class="tr-g-daily-cmp">DAILY DIFF</th><th class="tr-g-daily-cmp"></th>';
    h += '<th class="tr-g-week">' + (sample.wkPrevLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">' + (sample.wkCurrLabel || 'WK —') + '</th>';
    h += '<th class="tr-g-week">WEEKLY DIFF</th>';
    h += '<th class="tr-g-month">MONTHLY DELAY</th>';
    h += '<th class="tr-g-month">MONTHLY ONTIME</th>';
    h += '<th class="tr-g-month">TOTAL</th>';
    h += '<th class="tr-g-month">RATE</th>';
    h += '<th class="tr-g-month">RANK</th>';
    h += '</tr></thead><tbody>';

    pack.items.forEach(item => {
      const r = item.row;
      const bold = item.bold;
      const isGroup = item.isGroup && !bold;
      let html = '<tr class="' + (bold ? 'tr-slu' : (isGroup ? 'tr-group' : '')) + '">';
      html += '<td class="tr-sticky">' + (item.left[0] ? '<strong>' + item.left[0] + '</strong>' : '') + '</td>';
      html += '<td>' + (item.left[1] || '') + '</td>';
      html += '<td>' + (r.total || 0) + '</td>';
      html += '<td>' + (r.followed || 0) + '</td>';
      html += '<td class="' + (r.notFollowed ? 'neg' : '') + '">' + (r.notFollowed || 0) + '</td>';
      html += '<td>' + pct(target, 0) + '</td>';
      html += rateCell(r.rate, target, { yellow: true });
      (r.histRates || []).forEach(hr => { html += rateCell(hr.rate, target); });
      if (!(r.histRates || []).length) html += '<td class="tr-muted">—</td>';
      const diffCls = r.dailyDiff == null ? '' : (r.dailyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + diffCls + '">' + (r.dailyDiff == null ? '—' : (r.dailyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td class="tr-arrow">' + (r.mood || r.arrow || '') + '</td>';
      html += rateCell(r.wkPrev, target);
      html += rateCell(r.wkCurr, target);
      const wCls = r.weeklyDiff == null ? '' : (r.weeklyDiff >= 0 ? 'tr-ok' : 'tr-bad');
      html += '<td class="' + wCls + '">' + (r.weeklyDiff == null ? '—' : (r.weeklyDiff * 100).toFixed(2) + '%') + '</td>';
      html += '<td>' + (r.monthLate != null ? r.monthLate : '—') + '</td>';
      html += '<td>' + (r.monthOnTime != null ? r.monthOnTime : '—') + '</td>';
      html += '<td>' + (r.monthTotal != null ? r.monthTotal : '—') + '</td>';
      html += rateCell(r.monthRate, target, { yellow: true });
      html += '<td class="tr-rank">' + (bold || isGroup ? '—' : (r.rank != null ? r.rank : '—')) + '</td>';
      html += '</tr>';
      h += html;
    });

    h += '</tbody></table></div></div>';
    return h;
  }

  function render() {
    const host = document.getElementById('mttTravelReportView');
    if (!host) return;
    focusDate = getFocusDate();
    const dates = allDates();
    const note = document.getElementById('mttTravelReportNote');
    if (note) {
      note.textContent = focusDate
        ? ('Focus arrival date: ' + focusDate + ' · SLU truck owner · content matches OVERALL + SLU TRAVEL TIME structure')
        : 'Upload data and run Compare to set the focus arrival date.';
    }
    destroyChart('luzonMonth');
    destroyChart('visminMonth');

    if (!focusDate || !allRows().length) {
      host.innerHTML = '<p class="section-note">No SLU data loaded yet.</p>';
      return;
    }

    let html = '';
    if (activeView === 'overall') {
      html = renderOverallView(focusDate, dates);
    } else if (activeView === 'byDc') {
      html = renderDcView(focusDate, dates);
    } else if (activeView === 'byTrucker') {
      html = renderTruckerView(focusDate, dates);
    } else if (activeView === 'luzonRoutes') {
      html = renderGroupedRouteTable('LUZON', focusDate, dates);
    } else if (activeView === 'visminRoutes') {
      html = renderGroupedRouteTable('VISMIN', focusDate, dates);
    } else {
      // full: everything stacked (complete report)
      html = renderOverallView(focusDate, dates);
      html += renderDcView(focusDate, dates);
      html += renderTruckerView(focusDate, dates);
      html += renderGroupedRouteTable('LUZON', focusDate, dates);
      html += renderGroupedRouteTable('VISMIN', focusDate, dates);
    }

    host.innerHTML = html;

    if (activeView === 'overall' || activeView === 'full') {
      setTimeout(function () {
        renderMonthChart('trChartLuzonMonth', 'luzonMonth', 'LUZON', focusDate, 'SLU LUZON Travel Time Achieving Rate');
        renderMonthChart('trChartVisminMonth', 'visminMonth', 'VISMIN', focusDate, 'VISMIN Travel Time Achieving Rate');
      }, 40);
    }
  }

  function setView(v) {
    activeView = v || 'overall';
    document.querySelectorAll('.tr-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.trView === activeView);
    });
    render();
  }

  function onDataReady() { render(); }


  function init() {
    document.querySelectorAll('.tr-subtab').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.trView));
    });
    const exp = document.getElementById('btnTrExport');
    if (exp) exp.addEventListener('click', function () { exportExcel(); });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureExcelJS() {
    if (typeof ExcelJS !== 'undefined') return;
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
  }

  const XLS = {
    thin: function (argb) {
      const s = { style: 'thin', color: { argb: argb || 'FF9E9E9E' } };
      return { top: s, left: s, bottom: s, right: s };
    },
    fill: function (argb) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
    },
    font: function (opts) {
      return Object.assign({ name: 'Calibri', size: 10 }, opts || {});
    }
  };

  function rateFill(rate, target) {
    if (rate == null) return XLS.fill('FFFFFFFF');
    if (target != null && rate >= target) return XLS.fill('FFC6EFCE');
    if (target != null && rate < target) return XLS.fill('FFFFC7CE');
    return XLS.fill('FFFFFFFF');
  }

  function rateFont(rate, target) {
    if (rate == null) return XLS.font({ color: { argb: 'FF9E9E9E' } });
    if (target != null && rate >= target) return XLS.font({ bold: true, color: { argb: 'FF006100' } });
    if (target != null && rate < target) return XLS.font({ bold: true, color: { argb: 'FF9C0006' } });
    return XLS.font({ bold: true });
  }

  function writeTitle(ws, row, colCount, text) {
    ws.mergeCells(row, 1, row, colCount);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = XLS.font({ bold: true, size: 13, color: { argb: 'FFFFFFFF' } });
    cell.fill = XLS.fill('FFC00000');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 24;
  }

  function setCell(ws, r, c, value, opts) {
    opts = opts || {};
    const cell = ws.getCell(r, c);
    cell.value = value;
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    cell.font = opts.font || XLS.font();
    cell.fill = opts.fill || XLS.fill('FFFFFFFF');
    cell.border = XLS.thin('FFBDBDBD');
    cell.alignment = opts.align || { horizontal: 'center', vertical: 'middle', wrapText: true };
    return cell;
  }

  function writeEntityExcelRow(ws, rowIdx, leftVals, r, target, hist7, bold) {
    let c = 1;
    leftVals.forEach(function (v, i) {
      setCell(ws, rowIdx, c++, v, {
        font: XLS.font({ bold: true }),
        fill: bold ? XLS.fill('FFFFCDD2') : XLS.fill('FFF5F5F5'),
        align: { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
      });
    });
    // Daily summary
    setCell(ws, rowIdx, c++, r.total || 0, { fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF') });
    setCell(ws, rowIdx, c++, r.followed || 0, { fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF') });
    setCell(ws, rowIdx, c++, r.notFollowed || 0, {
      font: XLS.font({ bold: !!(r.notFollowed), color: { argb: r.notFollowed ? 'FFC62828' : 'FF000000' } }),
      fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF')
    });
    setCell(ws, rowIdx, c++, target != null ? target : r.target, {
      numFmt: '0%',
      fill: bold ? XLS.fill('FFFFEBEE') : XLS.fill('FFFFFFFF')
    });
    {
      const rate = r.rate;
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    }
    // 7-day history
    const hist = r.histRates || [];
    for (let i = 0; i < Math.max(hist7.length, 1); i++) {
      const hr = hist[i];
      const rate = hr ? hr.rate : null;
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    }
    // Daily diff + mood
    {
      const d = r.dailyDiff;
      setCell(ws, rowIdx, c++, d == null ? '—' : d, {
        numFmt: d == null ? undefined : '0.00%',
        fill: d == null ? XLS.fill('FFFFFFFF') : (d >= 0 ? XLS.fill('FFC6EFCE') : XLS.fill('FFFFC7CE')),
        font: d == null ? XLS.font({ color: { argb: 'FF9E9E9E' } })
          : XLS.font({ bold: true, color: { argb: d >= 0 ? 'FF006100' : 'FF9C0006' } })
      });
    }
    setCell(ws, rowIdx, c++, r.mood || r.arrow || '', { align: { horizontal: 'center' } });
    // Weekly
    [r.wkPrev, r.wkCurr].forEach(function (rate) {
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    });
    {
      const d = r.weeklyDiff;
      setCell(ws, rowIdx, c++, d == null ? '—' : d, {
        numFmt: d == null ? undefined : '0.00%',
        fill: d == null ? XLS.fill('FFFFFFFF') : (d >= 0 ? XLS.fill('FFC6EFCE') : XLS.fill('FFFFC7CE')),
        font: d == null ? XLS.font({ color: { argb: 'FF9E9E9E' } })
          : XLS.font({ bold: true, color: { argb: d >= 0 ? 'FF006100' : 'FF9C0006' } })
      });
    }
    // Monthly
    setCell(ws, rowIdx, c++, r.monthLate != null ? r.monthLate : '—');
    setCell(ws, rowIdx, c++, r.monthOnTime != null ? r.monthOnTime : '—');
    setCell(ws, rowIdx, c++, r.monthTotal != null ? r.monthTotal : '—');
    {
      const rate = r.monthRate;
      setCell(ws, rowIdx, c++, rate == null ? '—' : rate, {
        numFmt: rate == null ? undefined : '0.00%',
        fill: rateFill(rate, target),
        font: rateFont(rate, target)
      });
    }
    setCell(ws, rowIdx, c++, bold ? '—' : (r.rank != null ? r.rank : '—'), {
      font: XLS.font({ bold: true })
    });
  }

  function appendTravelTable(ws, startRow, pack) {
    // pack: title, leftHeaders, bodyItems[{left,row,bold}], hist7, target, sample
    const leftN = pack.leftHeaders.length;
    const hist7 = pack.hist7 || [];
    const nHist = Math.max(hist7.length, 1);
    const colCount = leftN + 5 + nHist + 2 + 3 + 5;
    let r = startRow;

    writeTitle(ws, r, colCount, pack.title);
    r++;

    // Header row 1 — group labels
    let c = 1;
    pack.leftHeaders.forEach(function (lh) {
      setCell(ws, r, c++, lh, {
        font: XLS.font({ bold: true, size: 9 }),
        fill: XLS.fill('FFD9D9D9')
      });
    });
    const groups = [
      { label: 'DAILY SUMMARY', span: 5, color: 'FFFFE699' },
      { label: '7 DAYS RATE HISTORY', span: nHist, color: 'FFBDD7EE' },
      { label: 'DAILY COMPARISON', span: 2, color: 'FFDDEBF7' },
      { label: 'WEEKLY RATE', span: 3, color: 'FFC6E0B4' },
      { label: 'MONTHLY RATE', span: 5, color: 'FFA9D08E' }
    ];
    groups.forEach(function (g) {
      const start = c;
      const end = c + g.span - 1;
      if (g.span > 1) {
        try { ws.mergeCells(r, start, r, end); } catch (e) {}
      }
      setCell(ws, r, start, g.label, {
        font: XLS.font({ bold: true, size: 10 }),
        fill: XLS.fill(g.color)
      });
      for (let i = start + 1; i <= end; i++) {
        setCell(ws, r, i, '', { fill: XLS.fill(g.color) });
      }
      c = end + 1;
    });
    ws.getRow(r).height = 22;
    r++;

    // Header row 2
    c = 1;
    pack.leftHeaders.forEach(function () {
      setCell(ws, r, c++, '', { fill: XLS.fill('FFD9D9D9') });
    });
    const h2 = [
      { t: 'Total Arrival Times', f: 'FFFFE699' },
      { t: 'Followed Plan travel time', f: 'FFFFE699' },
      { t: 'Not followed Plan travel time', f: 'FFFFE699' },
      { t: 'TARGET', f: 'FFFFE699' },
      { t: 'RATE', f: 'FFFFE699' }
    ];
    const hLabels = histHeaders(hist7);
    if (hist7.length) {
      hLabels.forEach(function (l) { h2.push({ t: l, f: 'FFBDD7EE' }); });
    } else {
      h2.push({ t: '—', f: 'FFBDD7EE' });
    }
    h2.push({ t: 'DAILY DIFF', f: 'FFDDEBF7' });
    h2.push({ t: '', f: 'FFDDEBF7' });
    const sample = pack.sample || {};
    h2.push({ t: sample.wkPrevLabel || 'WK —', f: 'FFC6E0B4' });
    h2.push({ t: sample.wkCurrLabel || 'WK —', f: 'FFC6E0B4' });
    h2.push({ t: 'WEEKLY DIFF', f: 'FFC6E0B4' });
    h2.push({ t: 'MONTHLY DELAY', f: 'FFA9D08E' });
    h2.push({ t: 'MONTHLY ONTIME', f: 'FFA9D08E' });
    h2.push({ t: 'TOTAL', f: 'FFA9D08E' });
    h2.push({ t: 'RATE', f: 'FFA9D08E' });
    h2.push({ t: 'RANK', f: 'FFA9D08E' });
    h2.forEach(function (x) {
      setCell(ws, r, c++, x.t, {
        font: XLS.font({ bold: true, size: 8 }),
        fill: XLS.fill(x.f)
      });
    });
    ws.getRow(r).height = 32;
    r++;

    (pack.bodyItems || []).forEach(function (item) {
      const left = item.left.slice();
      while (left.length < leftN) left.push('');
      writeEntityExcelRow(ws, r, left, item.row, pack.target, hist7, !!item.bold);
      r++;
    });

    for (let i = 1; i <= colCount; i++) {
      ws.getColumn(i).width = i <= leftN ? 16 : 11;
    }
    r++;
    return r;
  }

  function collectTravelPacks(focus, dates) {
    const rows = allRows();
    const packs = [];

    function overallPack(title, scope, target) {
      const block = buildScopeBlock(title, scope, target, focus, dates);
      const regionRows = (block.regionRows || []).filter(function (x) { return x.name !== 'SLU'; });
      assignRanks(regionRows);
      const bodyItems = [{ left: ['SLU'], row: block.slu, bold: true }]
        .concat(regionRows.map(function (x) { return { left: [x.name], row: x }; }));
      packs.push({
        sheetHint: 'Summary',
        title: title,
        leftHeaders: ['REGION'],
        bodyItems: bodyItems,
        hist7: block.hist7,
        target: target,
        sample: block.slu
      });
    }

    overallPack('Mainline Travel Time Report', 'ALL', TARGET.ALL);
    overallPack('LUZON Route Mainline Travel Time Report', 'LUZON', TARGET.LUZON);
    overallPack('VisMin Route Mainline Travel Time Report', 'VISMIN', TARGET.VISMIN);

    // By DC
    (function () {
      const hist7 = last7Dates(focus, dates);
      const by = new Map();
      rows.forEach(function (r) {
        const dc = resolveDc(r.dcIntended);
        const key = dc.code || dc.name;
        if (!by.has(key)) by.set(key, { name: dc.name, code: dc.code, list: [] });
        by.get(key).list.push(r);
      });
      const entities = [...by.values()]
        .map(function (e) { return buildEntityRow(e.name, e.code, e.list, focus, dates, TARGET.ALL); })
        .filter(function (r) { return r.monthTotal > 0 || r.total > 0; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      assignRanks(entities);
      const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
      packs.push({
        sheetHint: 'By DC',
        title: 'SLU Mainline Travel Time Report',
        leftHeaders: ['DC NAME', 'DC CODE'],
        bodyItems: entities.map(function (e) {
          return { left: [e.name, e.code || ''], row: e };
        }).concat([{ left: ['SLU', ''], row: slu, bold: true }]),
        hist7: hist7,
        target: TARGET.ALL,
        sample: slu
      });
    })();

    // By Trucker
    (function () {
      const hist7 = last7Dates(focus, dates);
      const by = new Map();
      rows.forEach(function (r) {
        const t = r.trucker || '(blank)';
        if (!by.has(t)) by.set(t, []);
        by.get(t).push(r);
      });
      const entities = [...by.entries()]
        .map(function (ent) { return buildEntityRow(ent[0], '', ent[1], focus, dates, TARGET.ALL); })
        .filter(function (r) { return r.monthTotal > 0 || r.total > 0; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      assignRanks(entities);
      const slu = buildEntityRow('SLU', '', rows, focus, dates, TARGET.ALL);
      packs.push({
        sheetHint: 'By Trucker',
        title: 'SLU Mainline Travel Time per Trucker Report',
        leftHeaders: ['TRUCKERS'],
        bodyItems: entities.map(function (e) {
          return { left: [e.name], row: e };
        }).concat([{ left: ['SLU'], row: slu, bold: true }]),
        hist7: hist7,
        target: TARGET.ALL,
        sample: slu
      });
    })();

    // Luzon / VisMin routes
    ['LUZON', 'VISMIN'].forEach(function (scope) {
      const target = scope === 'LUZON' ? TARGET.LUZON : TARGET.VISMIN;
      const pack = buildRouteRegionPack(scope, target, focus, dates);
      const bodyItems = (pack.items || []).map(function (item) {
        return {
          left: item.left,
          row: item.row,
          bold: !!item.bold
        };
      });
      // ranks for route rows only
      const routeOnly = bodyItems.filter(function (i) { return !i.bold && i.left[1]; }).map(function (i) { return i.row; });
      assignRanks(routeOnly);
      packs.push({
        sheetHint: scope === 'LUZON' ? 'Luzon Routes' : 'VisMin Routes',
        title: pack.title,
        leftHeaders: ['REGION INTENDED', 'ROUTE'],
        bodyItems: bodyItems,
        hist7: pack.hist7,
        target: target,
        sample: bodyItems.length ? bodyItems[bodyItems.length - 1].row : {}
      });
    });

    return packs;
  }

  async function exportExcel() {
    const focus = getFocusDate();
    const dates = allDates();
    if (!focus || !allRows().length) {
      alert('No SLU data to export. Upload a workbook and run Compare first.');
      return;
    }
    const btn = document.getElementById('btnTrExport');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }
    try {
      await ensureExcelJS();
      const packs = collectTravelPacks(focus, dates);
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Mainline Travel Time Analyzer';
      wb.created = new Date();

      const sheetMap = {};
      packs.forEach(function (p) {
        const name = p.sheetHint || 'Report';
        if (!sheetMap[name]) sheetMap[name] = [];
        sheetMap[name].push(p);
      });

      Object.keys(sheetMap).forEach(function (name) {
        const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
        let row = 1;
        sheetMap[name].forEach(function (pack) {
          row = appendTravelTable(ws, row, pack);
          row += 1;
        });
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'SLU_Mainline_Travel_Time_Report_' + focus + '.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⬇ Export Excel';
      }
    }
  }

  return { init, render, onDataReady, setView, exportExcel };
})();

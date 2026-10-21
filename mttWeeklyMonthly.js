/* ==========================================================================
   MODULE: MTT WEEKLY / MONTHLY COMPARISON
   Uses MttFileProcessor stored rows · does not change day-compare logic
   ========================================================================== */
const MttWeeklyMonthly = (() => {
  const TARGET = { ALL: 0.96, LUZON: 0.97, VISMIN: 0.85 };

  let weekDetail = 'region';
  let monthDetail = 'region';
  const charts = {
    weekTrend: null, weekCompare: null, weekDetail: null, weekSide: null,
    monthTrend: null, monthCompare: null, monthDetail: null, monthSide: null
  };
  const BAR_MAX = 120; // % scale so 100% does not hit the ceiling


  function pad2(n) { return String(n).padStart(2, '0'); }

  function weekKey(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return dt.getUTCFullYear() + '-W' + pad2(weekNo);
  }

  function monthKey(dateKey) {
    return dateKey.slice(0, 7);
  }

  function enrich(rows) {
    return (rows || []).map(r => Object.assign({}, r, {
      week: r.dateKey ? weekKey(r.dateKey) : null,
      month: r.dateKey ? monthKey(r.dateKey) : null
    }));
  }

  function getRows() {
    const state = MttFileProcessor.getState();
    return enrich(state.storedRows || []);
  }

  function stats(list) {
    if (!list || !list.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = list.filter(r => r.onTime === 'YES').length;
    const no = list.filter(r => r.onTime === 'NO').length;
    return { total: list.length, yes, no, rate: yes / list.length };
  }

  function fmtPct(v) {
    return v == null || isNaN(v) ? '—' : (v * 100).toFixed(1) + '%';
  }
  function fmtPp(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pp';
  }

  function filterScope(list, scope) {
    if (scope === 'LUZON') return list.filter(r => r.routeType === 'LUZON');
    if (scope === 'VISMIN') return list.filter(r => r.routeType === 'VISMIN');
    return list;
  }

  function destroy(c) {
    if (c) try { c.destroy(); } catch (e) {}
    return null;
  }

  function periodKeys(rows, mode) {
    const set = new Set(rows.map(r => mode === 'weekly' ? r.week : r.month).filter(Boolean));
    return [...set].sort();
  }

  function rowsInPeriod(rows, mode, key) {
    return rows.filter(r => (mode === 'weekly' ? r.week : r.month) === key);
  }

  function fillSelects() {
    const rows = getRows();
    if (!rows.length) return;
    const weeks = periodKeys(rows, 'weekly');
    const months = periodKeys(rows, 'monthly');
    const fill = (idPrev, idCurr, keys) => {
      const a = document.getElementById(idPrev);
      const b = document.getElementById(idCurr);
      if (!a || !b) return;
      const opts = keys.map(k => '<option value="' + k + '">' + k + '</option>').join('');
      a.innerHTML = opts;
      b.innerHTML = opts;
      if (keys.length >= 2) {
        a.value = keys[keys.length - 2];
        b.value = keys[keys.length - 1];
      } else if (keys.length === 1) {
        a.value = keys[0];
        b.value = keys[0];
      }
    };
    fill('wmWeekPrev', 'wmWeekCurr', weeks);
    fill('wmMonthPrev', 'wmMonthCurr', months);
  }

  function metricHtml(lbl, val, sub, extraCls) {
    return '<div class="metric ' + (extraCls || '') + '"><div class="label">' + lbl +
      '</div><div class="value">' + val + '</div><div class="diff">' +
      (sub || '') + '</div></div>';
  }

  function renderMetrics(boxId, st, stP, target, scopeLabel) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const delta = (st.rate != null && stP.rate != null) ? st.rate - stP.rate : null;
    const rateCls = st.rate == null ? '' : (st.rate >= target ? 'highlight-up' : 'highlight-down');
    const deltaCls = delta == null ? '' : (delta >= 0 ? 'highlight-up' : 'highlight-down');
    box.innerHTML = [
      metricHtml('Current rate', fmtPct(st.rate), st.total + ' trips', rateCls),
      metricHtml('Previous rate', fmtPct(stP.rate), stP.total + ' trips', ''),
      metricHtml('Change', fmtPp(delta), 'vs previous', deltaCls),
      metricHtml('On time', String(st.yes), 'current period', 'highlight-up'),
      metricHtml('Late', String(st.no), 'current period', st.no ? 'highlight-down' : ''),
      metricHtml('Target', Math.round(target * 100) + '%', scopeLabel, '')
    ].join('');
  }

  function buildGroupRows(prevList, currList, keyFn) {
    const pMap = {}, cMap = {};
    prevList.forEach(r => {
      const k = keyFn(r) || '(blank)';
      (pMap[k] = pMap[k] || []).push(r);
    });
    currList.forEach(r => {
      const k = keyFn(r) || '(blank)';
      (cMap[k] = cMap[k] || []).push(r);
    });
    const keys = new Set([...Object.keys(pMap), ...Object.keys(cMap)]);
    return [...keys].map(key => {
      const st = stats(cMap[key] || []);
      const stP = stats(pMap[key] || []);
      return {
        key,
        total: st.total,
        yes: st.yes,
        no: st.no,
        rate: st.rate,
        prevTotal: stP.total,
        prevRate: stP.rate,
        delta: (st.rate != null && stP.rate != null) ? st.rate - stP.rate : null
      };
    }).filter(r => r.total > 0 || r.prevTotal > 0)
      .sort((a, b) => (b.no - a.no) || ((a.rate ?? 1) - (b.rate ?? 1)));
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }


  function topEntities(rows, mode, scope, keyFn, limit) {
    const scoped = filterScope(rows, scope);
    const counts = {};
    scoped.forEach(r => {
      const k = keyFn(r) || '(blank)';
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([k]) => k);
  }

  /** Matrix: entity -> periodKey -> stats */
  function buildPeriodMatrix(rows, mode, scope, keyFn) {
    const periods = periodKeys(rows, mode);
    const scoped = filterScope(rows, scope);
    const map = {}; // entity -> period -> rows[]
    scoped.forEach(r => {
      const ent = keyFn(r) || '(blank)';
      const pk = mode === 'weekly' ? r.week : r.month;
      if (!pk) return;
      if (!map[ent]) map[ent] = {};
      if (!map[ent][pk]) map[ent][pk] = [];
      map[ent][pk].push(r);
    });
    const entities = Object.keys(map).sort((a, b) => {
      const ta = periods.reduce((s, p) => s + (map[a][p] ? map[a][p].length : 0), 0);
      const tb = periods.reduce((s, p) => s + (map[b][p] ? map[b][p].length : 0), 0);
      return tb - ta;
    });
    return { periods, map, entities };
  }

  function renderAllPeriodsMatrix(head, body, rows, mode, scope, keyFn, label, target) {
    const { periods, map, entities } = buildPeriodMatrix(rows, mode, scope, keyFn);
    // Cap columns if huge
    const showPeriods = periods.length > 16 ? periods.slice(-16) : periods;
    head.innerHTML = '<tr><th>' + label + '</th><th>All trips</th><th>All rate</th>' +
      showPeriods.map(p => '<th>' + p + '</th>').join('') + '</tr>';

    body.innerHTML = entities.map(ent => {
      let allRows = [];
      showPeriods.forEach(p => { if (map[ent][p]) allRows = allRows.concat(map[ent][p]); });
      // full all-period rate across ALL periods not just shown
      let full = [];
      periods.forEach(p => { if (map[ent][p]) full = full.concat(map[ent][p]); });
      const allSt = stats(full);
      const allCls = allSt.rate == null ? '' : (allSt.rate >= target ? 'rate-ok' : 'rate-bad');
      const cells = showPeriods.map(p => {
        const st = stats(map[ent][p] || []);
        if (!st.total) return '<td class="wm-muted">—</td>';
        const cls = st.rate >= target ? 'rate-ok' : 'rate-bad';
        return '<td class="' + cls + '" title="' + st.yes + '/' + st.total + '">' + fmtPct(st.rate) + '</td>';
      }).join('');
      return '<tr><td>' + escapeHtml(ent) + '</td><td>' + allSt.total +
        '</td><td class="' + allCls + '">' + fmtPct(allSt.rate) + '</td>' + cells + '</tr>';
    }).join('') || '<tr><td colspan="' + (3 + showPeriods.length) + '">No data.</td></tr>';

    return { periods: showPeriods, map, entities };
  }

  function renderSplitAllPeriods(head, body, rows, mode) {
    const periods = periodKeys(rows, mode);
    const showPeriods = periods.length > 16 ? periods.slice(-16) : periods;
    const types = [
      { key: 'Overall', fn: r => true, t: TARGET.ALL },
      { key: 'Luzon', fn: r => r.routeType === 'LUZON', t: TARGET.LUZON },
      { key: 'VisMin', fn: r => r.routeType === 'VISMIN', t: TARGET.VISMIN }
    ];
    head.innerHTML = '<tr><th>Type</th><th>All trips</th><th>All rate</th>' +
      showPeriods.map(p => '<th>' + p + '</th>').join('') + '</tr>';
    body.innerHTML = types.map(tp => {
      const full = rows.filter(tp.fn);
      const allSt = stats(full);
      const allCls = allSt.rate == null ? '' : (allSt.rate >= tp.t ? 'rate-ok' : 'rate-bad');
      const cells = showPeriods.map(p => {
        const list = rowsInPeriod(rows, mode, p).filter(tp.fn);
        const st = stats(list);
        if (!st.total) return '<td class="wm-muted">—</td>';
        const cls = st.rate >= tp.t ? 'rate-ok' : 'rate-bad';
        return '<td class="' + cls + '" title="' + st.yes + '/' + st.total + '">' + fmtPct(st.rate) + '</td>';
      }).join('');
      return '<tr><td><strong>' + tp.key + '</strong> <span class="wm-target">(' +
        Math.round(tp.t * 100) + '%)</span></td><td>' + allSt.total +
        '</td><td class="' + allCls + '">' + fmtPct(allSt.rate) + '</td>' + cells + '</tr>';
    }).join('');
    return { periods: showPeriods, types };
  }

  const COLORS = [
    '#E60012', '#1565C0', '#2E7D32', '#FF8F00', '#6A1B9A',
    '#00838F', '#C62828', '#4527A0', '#558B2F', '#EF6C00',
    '#AD1457', '#0277BD'
  ];



  function renderSideCompare(canvasId, chartKey, labels, prevRates, currRates, pKey, cKey, unitLabel) {
    charts[chartKey] = destroy(charts[chartKey]);
    const el = document.getElementById(canvasId);
    if (!el) return;
    charts[chartKey] = new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: pKey || ('Previous ' + unitLabel),
            data: prevRates,
            backgroundColor: '#90CAF9',
            borderRadius: 6,
            maxBarThickness: 28
          },
          {
            label: cKey || ('Current ' + unitLabel),
            data: currRates,
            backgroundColor: '#E60012',
            borderRadius: 6,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        indexAxis: labels.length > 6 ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.parsed.x != null && ctx.chart.options.indexAxis === 'y'
                  ? ctx.parsed.x : ctx.parsed.y;
                return ctx.dataset.label + ': ' + (v == null ? '—' : v.toFixed(1) + '%');
              }
            }
          }
        },
        scales: labels.length > 6
          ? { x: { min: 0, max: BAR_MAX, ticks: { callback: v => v + '%' } } }
          : { y: { min: 0, max: BAR_MAX, ticks: { callback: v => v + '%' } } }
      }
    });
  }

  function run(mode) {
    const rows = getRows();
    if (!rows.length) {
      alert('Please upload an Excel file first.');
      return;
    }
    const isWeek = mode === 'weekly';
    const pKey = document.getElementById(isWeek ? 'wmWeekPrev' : 'wmMonthPrev').value;
    const cKey = document.getElementById(isWeek ? 'wmWeekCurr' : 'wmMonthCurr').value;
    const scope = document.getElementById(isWeek ? 'wmWeekScope' : 'wmMonthScope').value;
    const detail = isWeek ? weekDetail : monthDetail;
    const target = TARGET[scope] || TARGET.ALL;
    const scopeLabel = scope === 'LUZON' ? 'Luzon Route' : scope === 'VISMIN' ? 'VisMin Route' : 'Overall';

    const prevRaw = rowsInPeriod(rows, mode, pKey);
    const currRaw = rowsInPeriod(rows, mode, cKey);
    const prev = filterScope(prevRaw, scope);
    const curr = filterScope(currRaw, scope);
    const st = stats(curr);
    const stP = stats(prev);
    const delta = (st.rate != null && stP.rate != null) ? st.rate - stP.rate : null;

    renderMetrics(isWeek ? 'wmWeekMetrics' : 'wmMonthMetrics', st, stP, target, scopeLabel);

    const sumEl = document.getElementById(isWeek ? 'wmWeekSummary' : 'wmMonthSummary');
    if (sumEl) {
      let t = 'In <strong>' + cKey + '</strong>, ' + scopeLabel + ' on-time was <strong>' +
        fmtPct(st.rate) + '</strong> (' + st.yes + '/' + st.total + ').';
      if (delta != null) {
        t += ' Change vs <strong>' + pKey + '</strong>: <strong>' + fmtPp(delta) + '</strong>.';
        t += st.rate >= target
          ? ' Meeting the ' + Math.round(target * 100) + '% target.'
          : ' Below the ' + Math.round(target * 100) + '% target.';
      }
      sumEl.innerHTML = t;
    }

    // Trend chart
    const keys = periodKeys(rows, mode);
    const rates = keys.map(k => {
      const s = stats(filterScope(rowsInPeriod(rows, mode, k), scope));
      return s.rate == null ? null : +(s.rate * 100).toFixed(2);
    });
    const trendId = isWeek ? 'chartWmWeekTrend' : 'chartWmMonthTrend';
    const trendKey = isWeek ? 'weekTrend' : 'monthTrend';
    charts[trendKey] = destroy(charts[trendKey]);
    charts[trendKey] = new Chart(document.getElementById(trendId), {
      type: 'line',
      data: {
        labels: keys,
        datasets: [
          {
            label: 'On-time %',
            data: rates,
            borderColor: '#E60012',
            backgroundColor: 'rgba(230,0,18,0.1)',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: '#E60012'
          },
          {
            label: 'Target',
            data: keys.map(() => target * 100),
            borderColor: '#2E7D32',
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { callback: v => v + '%' }
          }
        }
      }
    });

    // Compare bars
    const cmpId = isWeek ? 'chartWmWeekCompare' : 'chartWmMonthCompare';
    const cmpKey = isWeek ? 'weekCompare' : 'monthCompare';
    charts[cmpKey] = destroy(charts[cmpKey]);
    charts[cmpKey] = new Chart(document.getElementById(cmpId), {
      type: 'bar',
      data: {
        labels: [pKey, cKey],
        datasets: [
          {
            label: 'On-time %',
            data: [
              stP.rate == null ? null : +(stP.rate * 100).toFixed(2),
              st.rate == null ? null : +(st.rate * 100).toFixed(2)
            ],
            backgroundColor: ['#90CAF9', '#E60012'],
            borderRadius: 8
          },
          {
            label: 'Target',
            data: [target * 100, target * 100],
            type: 'line',
            borderColor: '#2E7D32',
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { min: 0, max: BAR_MAX, ticks: { callback: v => v + '%' } } }
      }
    });

    // Detail — all periods matrix / multi-line chart / snapshot + side compare bars
    const head = document.getElementById(isWeek ? 'wmWeekHead' : 'wmMonthHead');
    const body = document.getElementById(isWeek ? 'wmWeekBody' : 'wmMonthBody');
    const title = document.getElementById(isWeek ? 'wmWeekDetailTitle' : 'wmMonthDetailTitle');
    const note = document.getElementById(isWeek ? 'wmWeekDetailNote' : 'wmMonthDetailNote');
    const sideTitle = document.getElementById(isWeek ? 'wmWeekCompareTitle' : 'wmMonthCompareTitle');
    const sideNote = document.getElementById(isWeek ? 'wmWeekCompareNote' : 'wmMonthCompareNote');
    const unit = isWeek ? 'weeks' : 'months';
    const unitOne = isWeek ? 'week' : 'month';

    const detId = isWeek ? 'chartWmWeekDetail' : 'chartWmMonthDetail';
    const detKey = isWeek ? 'weekDetail' : 'monthDetail';
    const sideId = isWeek ? 'chartWmWeekSide' : 'chartWmMonthSide';
    const sideKey = isWeek ? 'weekSide' : 'monthSide';
    charts[detKey] = destroy(charts[detKey]);
    charts[sideKey] = destroy(charts[sideKey]);

    if (sideTitle) sideTitle.textContent = 'Current vs previous ' + unitOne;
    if (sideNote) sideNote.textContent = 'Comparison for selected periods';

    if (detail === 'snapshot') {
      if (note) note.textContent = '(current vs previous).';
      if (title) title.textContent = 'Region Rates';
      const groupRows = buildGroupRows(prev, curr, r => r.region);
      const truckerRows = buildGroupRows(prev, curr, r => r.trucker);
      const top = groupRows.slice(0, 12);
      const topT = truckerRows.slice(0, 10);
      head.innerHTML = '<tr><th>Region</th><th>Curr trips</th><th>On time</th><th>Late</th><th>Curr rate</th><th>Prev rate</th><th>Difference</th></tr>';
      body.innerHTML = groupRows.map(r => {
        const rc = r.rate == null ? '' : (r.rate >= target ? 'rate-ok' : 'rate-bad');
        const dc = r.delta == null ? '' : (r.delta >= 0 ? 'delta-up' : 'delta-down');
        return '<tr><td>' + escapeHtml(r.key) + '</td><td>' + r.total + '</td><td>' + r.yes +
          '</td><td>' + r.no + '</td><td class="' + rc + '">' + fmtPct(r.rate) +
          '</td><td>' + fmtPct(r.prevRate) + '</td><td class="' + dc + '">' + fmtPp(r.delta) + '</td></tr>';
      }).join('') || '<tr><td colspan="7">No data.</td></tr>';

      // Left: current region rates
      charts[detKey] = new Chart(document.getElementById(detId), {
        type: 'bar',
        data: {
          labels: top.map(r => r.key.length > 16 ? r.key.slice(0, 14) + '…' : r.key),
          datasets: [{
            label: 'Current period %',
            data: top.map(r => r.rate == null ? 0 : +(r.rate * 100).toFixed(2)),
            backgroundColor: top.map(r => (r.rate != null && r.rate >= target) ? '#66BB6A' : '#EF5350'),
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { min: 0, max: BAR_MAX, ticks: { callback: v => v + '%' } } }
        }
      });

      // Right: region prev vs curr grouped bars
      if (sideTitle) sideTitle.textContent = 'Regions';
      renderSideCompare(
        sideId, sideKey,
        top.map(r => r.key.length > 14 ? r.key.slice(0, 12) + '…' : r.key),
        top.map(r => r.prevRate == null ? null : +(r.prevRate * 100).toFixed(2)),
        top.map(r => r.rate == null ? null : +(r.rate * 100).toFixed(2)),
        pKey, cKey, unitOne
      );

    } else if (detail === 'split') {
      if (note) note.textContent = 'Overall, Luzon, and VisMin rates for every ' + unitOne;
      if (title) title.textContent = 'Overall / Luzon / VisMin over all ' + unit;
      const splitInfo = renderSplitAllPeriods(head, body, rows, mode);
      charts[detKey] = new Chart(document.getElementById(detId), {
        type: 'line',
        data: {
          labels: splitInfo.periods,
          datasets: [
            {
              label: 'Overall',
              data: splitInfo.periods.map(p => {
                const s = stats(rowsInPeriod(rows, mode, p));
                return s.rate == null ? null : +(s.rate * 100).toFixed(2);
              }),
              borderColor: COLORS[0], tension: 0.25, pointRadius: 3, fill: false
            },
            {
              label: 'Luzon',
              data: splitInfo.periods.map(p => {
                const s = stats(rowsInPeriod(rows, mode, p).filter(r => r.routeType === 'LUZON'));
                return s.rate == null ? null : +(s.rate * 100).toFixed(2);
              }),
              borderColor: COLORS[1], tension: 0.25, pointRadius: 3, fill: false
            },
            {
              label: 'VisMin',
              data: splitInfo.periods.map(p => {
                const s = stats(rowsInPeriod(rows, mode, p).filter(r => r.routeType === 'VISMIN'));
                return s.rate == null ? null : +(s.rate * 100).toFixed(2);
              }),
              borderColor: COLORS[2], tension: 0.25, pointRadius: 3, fill: false
            },
            {
              label: 'Target Overall 96%',
              data: splitInfo.periods.map(() => 96),
              borderColor: '#9E9E9E', borderDash: [6, 4], pointRadius: 0, fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { min: 0, max: BAR_MAX, ticks: { callback: v => v + '%' } } }
        }
      });

      // Side: Overall / Luzon / VisMin current vs previous
      if (sideTitle) sideTitle.textContent = 'Route type';
      const splitBlocks = [
        { key: 'Overall', p: prevRaw, c: currRaw },
        { key: 'Luzon', p: prevRaw.filter(r => r.routeType === 'LUZON'), c: currRaw.filter(r => r.routeType === 'LUZON') },
        { key: 'VisMin', p: prevRaw.filter(r => r.routeType === 'VISMIN'), c: currRaw.filter(r => r.routeType === 'VISMIN') }
      ];
      renderSideCompare(
        sideId, sideKey,
        splitBlocks.map(b => b.key),
        splitBlocks.map(b => { const s = stats(b.p); return s.rate == null ? null : +(s.rate * 100).toFixed(2); }),
        splitBlocks.map(b => { const s = stats(b.c); return s.rate == null ? null : +(s.rate * 100).toFixed(2); }),
        pKey, cKey, unitOne
      );

    } else {
      // region or trucker — ALL periods matrix + multi-line + side prev/curr bars
      const isRegion = detail === 'region';
      const keyFn = isRegion ? (r => r.region) : (r => r.trucker);
      const label = isRegion ? 'Region' : 'Trucker';
      if (note) {
        note.textContent = label + ' on-time % for every ' + unitOne +
           '.';
      }
      if (title) title.textContent = label + ' rates over all ' + unit;
      const matrix = renderAllPeriodsMatrix(head, body, rows, mode, scope, keyFn, label, target);
      const topNames = matrix.entities.slice(0, 8);
      charts[detKey] = new Chart(document.getElementById(detId), {
        type: 'line',
        data: {
          labels: matrix.periods,
          datasets: topNames.map((name, i) => ({
            label: name.length > 20 ? name.slice(0, 18) + '…' : name,
            data: matrix.periods.map(p => {
              const st = stats((matrix.map[name] && matrix.map[name][p]) || []);
              return st.rate == null ? null : +(st.rate * 100).toFixed(2);
            }),
            borderColor: COLORS[i % COLORS.length],
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 3,
            fill: false
          })).concat([{
            label: 'Target',
            data: matrix.periods.map(() => target * 100),
            borderColor: '#9E9E9E',
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          }])
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { min: 0, max: BAR_MAX, ticks: { callback: v => v + '%' } } }
        }
      });

      // Side: top entities current vs previous period grouped bars
      if (sideTitle) sideTitle.textContent = label + 's';
      const groupRows = buildGroupRows(prev, curr, keyFn).slice(0, 10);
      renderSideCompare(
        sideId, sideKey,
        groupRows.map(r => r.key.length > 14 ? r.key.slice(0, 12) + '…' : r.key),
        groupRows.map(r => r.prevRate == null ? null : +(r.prevRate * 100).toFixed(2)),
        groupRows.map(r => r.rate == null ? null : +(r.rate * 100).toFixed(2)),
        pKey, cKey, unitOne
      );
    }
  }

  function onDataReady() {
    fillSelects();
    const rows = getRows();
    if (!rows.length) return;
    // Auto-run once data is available
    if (document.getElementById('wmWeekCurr') && document.getElementById('wmWeekCurr').options.length) {
      run('weekly');
    }
    if (document.getElementById('wmMonthCurr') && document.getElementById('wmMonthCurr').options.length) {
      run('monthly');
    }
  }

  function init() {
    const btnW = document.getElementById('btnWmWeek');
    const btnM = document.getElementById('btnWmMonth');
    if (btnW) btnW.addEventListener('click', () => run('weekly'));
    if (btnM) btnM.addEventListener('click', () => run('monthly'));

    document.querySelectorAll('.wm-subtabs').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.wm-subtab');
        if (!btn) return;
        group.querySelectorAll('.wm-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = group.dataset.wmMode;
        if (mode === 'weekly') {
          weekDetail = btn.dataset.wmDetail;
          run('weekly');
        } else {
          monthDetail = btn.dataset.wmDetail;
          run('monthly');
        }
      });
    });

    // Refresh when opening tab (in case charts need resize)
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'tabWeekly') setTimeout(() => run('weekly'), 50);
        if (tab.dataset.tab === 'tabMonthly') setTimeout(() => run('monthly'), 50);
      });
    });
  }

  return { init, onDataReady, run };
})();

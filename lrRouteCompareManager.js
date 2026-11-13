/* ==========================================================================
   MODULE: LOADING RATE — ROUTE COMPARISON
   Day / Week / Month · sort by avg load · search route · filter DC
   ========================================================================== */
const LrRouteCompareManager = (() => {
  let periodMode = 'day'; // day | week | month
  let sortMode = 'avg-desc'; // avg-desc | avg-asc | trips-desc | qty-desc
  let searchRoute = '';
  let filterDc = 'ALL';
  let allAgg = []; // cached aggregations for current period selection

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Keep bars off the chart ceiling
  function yMaxPad(values) {
    const nums = (values || []).map(Number).filter(v => !isNaN(v));
    if (!nums.length) return 1;
    const m = Math.max(...nums, 0);
    if (m <= 0) return 1;
    return m * 1.15 + 1;
  }

  function toYmd(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 100000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      const d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 20000 && n < 100000) {
        const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
        const d = new Date(ms);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
      }
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    return s.length >= 10 ? s.substring(0, 10) : null;
  }

  function weekKey(dateKey) {
    if (!dateKey) return null;
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return dt.getUTCFullYear() + '-W' + pad2(weekNo);
  }

  function monthKey(dateKey) {
    return dateKey ? dateKey.slice(0, 7) : null;
  }

  function periodKey(dateKey) {
    if (periodMode === 'week') return weekKey(dateKey);
    if (periodMode === 'month') return monthKey(dateKey);
    return dateKey;
  }

  function ymdToDisplay(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd || '—';
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function periodLabel(key) {
    if (!key) return '—';
    if (periodMode === 'day') {
      const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const names = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
        return names[+m[2] - 1] + ' ' + String(+m[3]).padStart(2, '0');
      }
      return ymdToDisplay(key);
    }
    if (periodMode === 'month') {
      const m = String(key).match(/^(\d{4})-(\d{2})$/);
      if (m) {
        const names = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
        return names[+m[2] - 1];
      }
    }
    // week: 2026-W45 → W45
    const w = String(key).match(/^\d{4}-(W\d{2})$/i);
    if (w) return w[1].toUpperCase();
    return key;
  }

  function periodLabelFull(key) {
    // slightly longer when needed in titles
    return periodLabel(key);
  }

  function normalizeRows(slu, colMap) {
    return (slu || []).map(r => {
      const dateKey = toYmd(r[colMap.date]);
      return {
        dateKey,
        period: periodKey(dateKey),
        route: String(r[colMap.route] || '').trim() || '(blank)',
        branch: String(r[colMap.branch] || '').trim() || '(blank)',
        lt: parseFloat(r[colMap.lt]) || 0,
        pkgs: parseFloat(r[colMap.pkgs]) || 0,
        actualSize: colMap.actualSize ? String(r[colMap.actualSize] || '').trim() : '',
        wheels: colMap.wheels ? String(r[colMap.wheels] || '').trim() : ''
      };
    }).filter(r => r.dateKey && r.period);
  }

  function populatePeriodSelectors(rows) {
    const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort();
    const selA = document.getElementById('rcPeriodA');
    const selB = document.getElementById('rcPeriodB');
    if (!selA || !selB) return periods;

    const prevA = selA.value;
    const prevB = selB.value;
    const opts = periods.map(p => `<option value="${p}">${periodLabel(p)}</option>`).join('');
    selA.innerHTML = opts;
    selB.innerHTML = opts;

    if (prevA && periods.includes(prevA)) selA.value = prevA;
    else if (periods.length >= 2) selA.value = periods[periods.length - 2];
    else if (periods.length === 1) selA.value = periods[0];

    if (prevB && periods.includes(prevB)) selB.value = prevB;
    else if (periods.length >= 1) selB.value = periods[periods.length - 1];
    return periods;
  }

  function populateDcFilter(rows) {
    const sel = document.getElementById('rcFilterDc');
    if (!sel) return;
    const dcs = [...new Set(rows.map(r => r.branch).filter(Boolean))].sort();
    const prev = filterDc;
    sel.innerHTML = `<option value="ALL">All Departure DCs</option>` +
      dcs.map(d => `<option value="${d.replace(/"/g, '&quot;')}">${d}</option>`).join('');
    if (prev && (prev === 'ALL' || dcs.includes(prev))) {
      sel.value = prev;
      filterDc = prev;
    } else {
      sel.value = 'ALL';
      filterDc = 'ALL';
    }
  }

  function aggregateByRoute(list) {
    const map = {};
    list.forEach(r => {
      if (!map[r.route]) {
        map[r.route] = {
          route: r.route,
          branch: r.branch,
          trips: 0,
          totalLt: 0,
          pkgs: 0,
          branches: new Set()
        };
      }
      const a = map[r.route];
      a.trips += 1;
      a.totalLt += r.lt;
      a.pkgs += r.pkgs;
      a.branches.add(r.branch);
      // keep primary branch as most common would need more work; use first / join later
      if (!a.branch || a.branch === '(blank)') a.branch = r.branch;
    });
    return Object.values(map).map(a => ({
      route: a.route,
      branch: a.branches.size === 1 ? [...a.branches][0] : ([...a.branches].slice(0, 2).join(', ') + (a.branches.size > 2 ? '…' : '')),
      trips: a.trips,
      totalLt: a.totalLt,
      pkgs: a.pkgs,
      avgLt: a.trips ? a.totalLt / a.trips : 0,
      avgPkgs: a.trips ? a.pkgs / a.trips : 0
    }));
  }

  function buildComparison(rows) {
    const selA = document.getElementById('rcPeriodA');
    const selB = document.getElementById('rcPeriodB');
    const periodA = selA ? selA.value : null;
    const periodB = selB ? selB.value : null;

    let list = rows;
    if (filterDc && filterDc !== 'ALL') {
      list = list.filter(r => r.branch === filterDc);
    }

    const listA = list.filter(r => r.period === periodA);
    const listB = list.filter(r => r.period === periodB);
    const aggA = aggregateByRoute(listA);
    const aggB = aggregateByRoute(listB);
    const mapA = Object.fromEntries(aggA.map(x => [x.route, x]));
    const mapB = Object.fromEntries(aggB.map(x => [x.route, x]));
    const routes = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);

    let rowsOut = [...routes].map(route => {
      const a = mapA[route] || { trips: 0, totalLt: 0, pkgs: 0, avgLt: 0, avgPkgs: 0, branch: '—' };
      const b = mapB[route] || { trips: 0, totalLt: 0, pkgs: 0, avgLt: 0, avgPkgs: 0, branch: '—' };
      return {
        route,
        branch: b.branch !== '—' ? b.branch : a.branch,
        prevTrips: a.trips,
        latestTrips: b.trips,
        prevAvg: a.avgLt,
        latestAvg: b.avgLt,
        avgDiff: b.avgLt - a.avgLt,
        prevQty: a.totalLt,
        latestQty: b.totalLt,
        qtyDiff: b.totalLt - a.totalLt,
        prevPkgs: a.pkgs,
        latestPkgs: b.pkgs,
        pkgsDiff: b.pkgs - a.pkgs,
        // for single-period view prefer latest
        trips: b.trips || a.trips,
        avgLt: b.trips ? b.avgLt : a.avgLt,
        totalLt: b.trips ? b.totalLt : a.totalLt
      };
    });

    const q = String(searchRoute || '').trim().toLowerCase();
    if (q) {
      rowsOut = rowsOut.filter(r =>
        String(r.route).toLowerCase().includes(q) ||
        String(r.branch).toLowerCase().includes(q)
      );
    }

    rowsOut = sortRows(rowsOut);
    return { periodA, periodB, rows: rowsOut, listA, listB };
  }

  function sortRows(rows) {
    const arr = [...rows];
    switch (sortMode) {
      case 'avg-asc':
        arr.sort((a, b) => a.latestAvg - b.latestAvg || a.avgLt - b.avgLt);
        break;
      case 'trips-desc':
        arr.sort((a, b) => b.latestTrips - a.latestTrips || b.trips - a.trips);
        break;
      case 'qty-desc':
        arr.sort((a, b) => b.latestQty - a.latestQty || b.totalLt - a.totalLt);
        break;
      case 'avg-desc':
      default:
        arr.sort((a, b) => b.latestAvg - a.latestAvg || b.avgLt - a.avgLt);
        break;
    }
    return arr;
  }

  function renderMetrics(comp) {
    const el = document.getElementById('rcMetrics');
    if (!el) return;
    const { rows, listA, listB, periodA, periodB } = comp;
    const sum = (list, fn) => list.reduce((s, r) => s + fn(r), 0);
    const tripsA = listA.length;
    const tripsB = listB.length;
    const qtyA = sum(listA, r => r.lt);
    const qtyB = sum(listB, r => r.lt);
    const avgA = tripsA ? qtyA / tripsA : 0;
    const avgB = tripsB ? qtyB / tripsB : 0;
    const pkgsA = sum(listA, r => r.pkgs);
    const pkgsB = sum(listB, r => r.pkgs);
    const fmt = n => Math.round(n).toLocaleString();
    const diffCls = v => Math.abs(v) < 0.5 ? 'neutral' : (v > 0 ? 'up' : 'down');
    const d = (v) => (Math.round(v) > 0 ? '+' : '') + Math.round(v).toLocaleString();
    const labA = periodLabel(periodA);
    const labB = periodLabel(periodB);

    function box(cls, lab, val, deltaHtml) {
      return `<div class="rc-metric-box ${cls}">
        <div class="lab">${lab}</div>
        <div class="val">${val}</div>
        ${deltaHtml || ''}
      </div>`;
    }

    el.innerHTML = `
      <div class="rc-compare-metrics">
        <div class="rc-compare-col">
          <h3>Previous</h3>
          <div class="rc-date-sub">${labA}</div>
          <div class="rc-metric-grid">
            ${box('rc-box-trips', 'Trips', fmt(tripsA))}
            ${box('rc-box-avg', 'Avg Loading Qty', fmt(avgA))}
            ${box('rc-box-qty', 'Total Loading Qty', fmt(qtyA))}
            ${box('rc-box-pkgs', 'Packages', fmt(pkgsA))}
          </div>
        </div>
        <div class="rc-compare-col latest">
          <h3>Latest</h3>
          <div class="rc-date-sub">${labB}</div>
          <div class="rc-metric-grid">
            ${box('rc-box-trips', 'Trips', fmt(tripsB), `<div class="delta ${diffCls(tripsB - tripsA)}">${d(tripsB - tripsA)} vs Previous</div>`)}
            ${box('rc-box-avg', 'Avg Loading Qty', fmt(avgB), `<div class="delta ${diffCls(avgB - avgA)}">${d(avgB - avgA)} vs Previous</div>`)}
            ${box('rc-box-qty', 'Total Loading Qty', fmt(qtyB), `<div class="delta ${diffCls(qtyB - qtyA)}">${d(qtyB - qtyA)} vs Previous</div>`)}
            ${box('rc-box-pkgs', 'Packages', fmt(pkgsB), `<div class="delta ${diffCls(pkgsB - pkgsA)}">${d(pkgsB - pkgsA)} vs Previous</div>`)}
          </div>
        </div>
      </div>
      <p class="section-note" style="margin-top:10px;">${rows.length} route(s) · Previous <strong>${labA}</strong> vs Latest <strong>${labB}</strong></p>`;
  }

  function renderTable(comp) {
    const body = document.getElementById('rcTableBody');
    const count = document.getElementById('rcTableCount');
    if (!body) return;
    const { rows, periodA, periodB } = comp;
    const labA = periodLabel(periodA);
    const labB = periodLabel(periodB);

    const setTh = (id, main, sub) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = main + '<span>' + sub + '</span>';
    };
    // main table
    setTh('rcThTripsA', 'Prev Trips', labA);
    setTh('rcThTripsB', 'Latest Trips', labB);
    setTh('rcThAvgA', 'Prev Avg LT', labA);
    setTh('rcThAvgB', 'Latest Avg LT', labB);
    setTh('rcThQtyA', 'Prev Total Qty', labA);
    setTh('rcThQtyB', 'Latest Total Qty', labB);
    // focus table headers
    setTh('rcFThTripsA', 'Prev Trips', labA);
    setTh('rcFThTripsB', 'Latest Trips', labB);
    setTh('rcFThAvgA', 'Prev Avg LT', labA);
    setTh('rcFThAvgB', 'Latest Avg LT', labB);
    setTh('rcFThQtyA', 'Prev Total Qty', labA);
    setTh('rcFThQtyB', 'Latest Total Qty', labB);

    const note = document.getElementById('rcTableNote');
    if (note) note.textContent = 'Previous (' + labA + ') vs Latest (' + labB + ')';
    const focusSub = document.getElementById('rcTableFocusSub');
    if (focusSub) focusSub.textContent = 'Previous (' + labA + ') vs Latest (' + labB + ')';

    lastTableRowsHtml = '';
    if (!rows.length) {
      const empty = '<tr><td colspan="10">No routes match the current filters.</td></tr>';
      body.innerHTML = empty;
      const fb = document.getElementById('rcFocusTableBody');
      if (fb) fb.innerHTML = empty;
      if (count) count.textContent = '0 routes';
      return;
    }

    const rowsHtml = rows.map((r, i) => {
      const avgCls = r.avgDiff < 0 ? 'neg' : (r.avgDiff > 0 ? 'pos' : '');
      const topLow = sortMode === 'avg-asc' && i < 3 ? 'top-culprit' : '';
      const topHigh = sortMode === 'avg-desc' && i < 3 ? 'top-booster' : '';
      return `<tr class="${topLow || topHigh}">
        <td><strong>${escapeHtml(r.route)}</strong></td>
        <td>${escapeHtml(r.branch)}</td>
        <td>${r.prevTrips}</td>
        <td>${r.latestTrips}</td>
        <td>${Math.round(r.prevAvg).toLocaleString()}</td>
        <td>${Math.round(r.latestAvg).toLocaleString()}</td>
        <td class="${avgCls}">${r.avgDiff > 0 ? '+' : ''}${Math.round(r.avgDiff)}</td>
        <td>${Math.round(r.prevQty).toLocaleString()}</td>
        <td>${Math.round(r.latestQty).toLocaleString()}</td>
        <td class="${r.qtyDiff < 0 ? 'neg' : (r.qtyDiff > 0 ? 'pos' : '')}">${r.qtyDiff > 0 ? '+' : ''}${Math.round(r.qtyDiff).toLocaleString()}</td>
      </tr>`;
    }).join('');

    body.innerHTML = rowsHtml;
    lastTableRowsHtml = rowsHtml;
    const fb = document.getElementById('rcFocusTableBody');
    if (fb) fb.innerHTML = rowsHtml;

    if (count) {
      const sortLabel = {
        'avg-desc': 'Highest avg first',
        'avg-asc': 'Lowest avg first',
        'trips-desc': 'Most trips first',
        'qty-desc': 'Highest total qty first'
      }[sortMode] || sortMode;
      count.textContent = `${rows.length.toLocaleString()} routes · Previous ${labA} vs Latest ${labB} · ${sortLabel}`;
    }

  }

  let chartTrips = null;
  let chartQty = null;
  let chartAvg = null;
  let chartTop = null;

  function destroyChart(c) {
    if (c) try { c.destroy(); } catch (e) {}
    return null;
  }

  function valueLabelPlugin(id) {
    return {
      id: id,
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 10px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((pt, i) => {
            const raw = ds.data[i];
            if (raw == null || isNaN(raw)) return;
            const pos = pt.tooltipPosition ? pt.tooltipPosition() : { x: pt.x, y: pt.y };
            const label = Number(raw).toLocaleString();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.strokeText(label, pos.x + 4, pos.y);
            ctx.fillStyle = '#212121';
            ctx.fillText(label, pos.x + 4, pos.y);
          });
        });
        ctx.restore();
      }
    };
  }

  function makeGroupedBar(canvasId, label, labels, dataA, dataB, labA, labB, colorB) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    const maxBars = 18;
    const L = labels.slice(0, maxBars);
    const A = dataA.slice(0, maxBars);
    const B = dataB.slice(0, maxBars);
    return new Chart(el, {
      type: 'bar',
      data: {
        labels: L,
        datasets: [
          {
            label: 'Previous (' + labA + ')',
            data: A,
            backgroundColor: '#90A4AE',
            borderRadius: 4,
            maxBarThickness: 16
          },
          {
            label: 'Latest (' + labB + ')',
            data: B,
            backgroundColor: colorB,
            borderRadius: 4,
            maxBarThickness: 16
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 11, weight: '600' } }
          },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString()
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: yMaxPad(A.concat(B)),
            grid: { color: '#F0F0F0' },
            ticks: { callback: v => Number(v).toLocaleString() }
          },
          y: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } }
        }
      },
      plugins: [valueLabelPlugin(canvasId + 'Labels')]
    });
  }

  function makeSingleBar(canvasId, label, a, b, labA, labB, colorB) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    const labels = ['Previous (' + labA + ')', 'Latest (' + labB + ')'];
    const valuePlugin = {
      id: canvasId + 'SingleLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 11px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          meta.data.forEach((pt, i) => {
            const raw = ds.data[i];
            if (raw == null || isNaN(raw)) return;
            const pos = pt.tooltipPosition ? pt.tooltipPosition() : { x: pt.x, y: pt.y };
            const t = Number(raw).toLocaleString();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeText(t, pos.x, pos.y - 4);
            ctx.fillStyle = '#212121';
            ctx.fillText(t, pos.x, pos.y - 4);
          });
        });
        ctx.restore();
      }
    };
    return new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data: [Math.round(a), Math.round(b)],
          backgroundColor: ['#90A4AE', colorB],
          borderRadius: 8,
          maxBarThickness: 64
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + label + ': ' + Number(ctx.raw).toLocaleString() } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
          y: {
            beginAtZero: true,
            suggestedMax: yMaxPad([a, b]),
            grid: { color: '#F0F0F0' },
            ticks: { callback: v => Number(v).toLocaleString() }
          }
        }
      },
      plugins: [valuePlugin]
    });
  }

  function setChartLayout(isSingle) {
    const multi = document.querySelector('.rc-multi-charts');
    if (multi) {
      multi.classList.toggle('rc-single-layout', !!isSingle);
    }
    const title = document.getElementById('rcSingleRouteTitle');
    const panel = document.getElementById('rcSingleRoutePanel');
    if (panel) panel.classList.toggle('hidden', !isSingle);
    // title lives inside panel in restored markup; also update note
  }

  function renderChartsAll(comp) {
    chartTrips = destroyChart(chartTrips);
    chartQty = destroyChart(chartQty);
    chartAvg = destroyChart(chartAvg);
    chartTop = destroyChart(chartTop);

    const labA = periodLabel(comp.periodA);
    const labB = periodLabel(comp.periodB);
    const note = document.getElementById('rcChartNote');
    const rows = comp.rows || [];

    if (!rows.length) {
      setChartLayout(false);
      if (note) note.textContent = 'No routes match the current filters.';
      return;
    }

    // Single route → original vertical Previous vs Latest bars
    if (rows.length === 1) {
      setChartLayout(true);
      const row = rows[0];
      const title = document.getElementById('rcSingleRouteTitle');
      if (title) title.textContent = 'Route focus: ' + row.route;
      if (note) {
        note.textContent = 'Route focus · ' + row.route + ' — Previous (' + labA + ') vs Latest (' + labB + ')';
      }
      chartTrips = makeSingleBar('rcChartTrips', 'Trips', row.prevTrips, row.latestTrips, labA, labB, '#1565C0');
      chartQty = makeSingleBar('rcChartQty', 'Total Loading Qty', row.prevQty, row.latestQty, labA, labB, '#E60012');
      chartAvg = makeSingleBar('rcChartAvg', 'Avg Loading Qty', row.prevAvg, row.latestAvg, labA, labB, '#2E7D32');
      return;
    }

    // Multiple routes → horizontal grouped bars
    setChartLayout(false);
    if (note) {
      note.textContent = 'Previous (' + labA + ') vs Latest (' + labB + ') — all routes in current filter (top 18 by sort)';
    }

    const top = [...rows].slice(0, 18);
    const labels = top.map(r => r.route.length > 18 ? r.route.slice(0, 16) + '…' : r.route);
    const tripsA = top.map(r => Math.round(r.prevTrips || 0));
    const tripsB = top.map(r => Math.round(r.latestTrips || 0));
    const qtyA = top.map(r => Math.round(r.prevQty || 0));
    const qtyB = top.map(r => Math.round(r.latestQty || 0));
    const avgA = top.map(r => Math.round(r.prevAvg || 0));
    const avgB = top.map(r => Math.round(r.latestAvg || 0));

    chartTrips = makeGroupedBar('rcChartTrips', 'Trips', labels, tripsA, tripsB, labA, labB, '#1565C0');
    chartQty = makeGroupedBar('rcChartQty', 'Total Loading Qty', labels, qtyA, qtyB, labA, labB, '#E60012');
    chartAvg = makeGroupedBar('rcChartAvg', 'Avg Loading Qty', labels, avgA, avgB, labA, labB, '#2E7D32');
  }

  function renderSingleRouteCharts() { /* handled inside renderChartsAll */ }
  function renderChart(comp) { renderChartsAll(comp); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getRows() {
    const { storedSlu, storedColMap } = FileProcessor.getState();
    if (!storedSlu || !storedColMap) return [];
    return normalizeRows(storedSlu, storedColMap);
  }

  function run() {
    const rows = getRows();
    if (!rows.length) {
      const body = document.getElementById('rcTableBody');
      if (body) body.innerHTML = '<tr><td colspan="10">Upload a Mainline file first.</td></tr>';
      return;
    }

    // re-normalize with current period mode
    const fresh = getRows();
    populatePeriodSelectors(fresh);
    populateDcFilter(fresh);

    // re-read selectors after populate may reset - preserve if possible
    const selA = document.getElementById('rcPeriodA');
    const selB = document.getElementById('rcPeriodB');
    // populate already sets defaults; user values are applied on change handlers

    const comp = buildComparison(fresh);
    const info = document.getElementById('rcInfo');
    if (info) {
      info.innerHTML = `Comparing <span class="badge">${periodLabel(comp.periodA)}</span> vs <span class="badge">${periodLabel(comp.periodB)}</span> · Mode: <strong>${periodMode.toUpperCase()}</strong>`;
    }
    renderMetrics(comp);
    renderTable(comp);
    renderChart(comp);
    allAgg = comp.rows;
  }

  function onFileReady() {
    const rows = getRows();
    if (!rows.length) return;
    populatePeriodSelectors(rows);
    populateDcFilter(rows);
  }

  function setPeriodMode(mode) {
    periodMode = mode;
    document.querySelectorAll('[data-rc-period]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-rc-period') === mode);
    });
    const rows = getRows();
    populatePeriodSelectors(rows);
    run();
  }

  function switchToRouteTab() {
    const dayPanel = document.getElementById('lrDayPanel');
    const weekPanel = document.getElementById('lrWeeklyPanel');
    const routePanel = document.getElementById('lrRoutePanel');
    const dragPanel = document.getElementById('lrTopDragPanel');
    const btnDay = document.getElementById('tabLrDay');
    const btnWeek = document.getElementById('tabLrWeek');
    const btnRoute = document.getElementById('tabLrRoute');
    const btnDrag = document.getElementById('tabLrTopDrag');
    if (dayPanel) dayPanel.classList.add('hidden');
    if (weekPanel) weekPanel.classList.add('hidden');
    if (dragPanel) dragPanel.classList.add('hidden');
    if (routePanel) routePanel.classList.remove('hidden');
    if (btnDay) btnDay.classList.remove('active');
    if (btnWeek) btnWeek.classList.remove('active');
    if (btnDrag) btnDrag.classList.remove('active');
    if (btnRoute) btnRoute.classList.add('active');
    onFileReady();
    run();
  }

  function init() {
    const btnRoute = document.getElementById('tabLrRoute');
    if (btnRoute) btnRoute.addEventListener('click', switchToRouteTab);

    document.querySelectorAll('[data-rc-period]').forEach(b => {
      b.addEventListener('click', () => setPeriodMode(b.getAttribute('data-rc-period') || 'day'));
    });

    const btn = document.getElementById('btnRcCompare');
    if (btn) btn.addEventListener('click', run);

    const sortSel = document.getElementById('rcSort');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        sortMode = sortSel.value || 'avg-desc';
        run();
      });
    }

    const search = document.getElementById('rcSearchRoute');
    if (search) {
      search.addEventListener('input', () => {
        searchRoute = search.value || '';
        run();
      });
    }

    const dc = document.getElementById('rcFilterDc');
    if (dc) {
      dc.addEventListener('change', () => {
        filterDc = dc.value || 'ALL';
        run();
      });
    }

    const clear = document.getElementById('rcClearFilters');
    if (clear) {
      clear.addEventListener('click', () => {
        searchRoute = '';
        filterDc = 'ALL';
        sortMode = 'avg-desc';
        if (search) search.value = '';
        if (dc) dc.value = 'ALL';
        if (sortSel) sortSel.value = 'avg-desc';
        run();
      });
    }

    // Table focus (enlarge route breakdown)
    const focusBtn = document.getElementById('rcTableFocusBtn');
    if (focusBtn) focusBtn.addEventListener('click', openTableFocus);
    const closeBtn = document.getElementById('rcTableFocusClose');
    if (closeBtn) closeBtn.addEventListener('click', closeTableFocus);
    const overlay = document.getElementById('rcTableFocusOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeTableFocus();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeTableFocus();
    });
  }

  function openTableFocus() {
    const overlay = document.getElementById('rcTableFocusOverlay');
    const fb = document.getElementById('rcFocusTableBody');
    if (fb && lastTableRowsHtml) fb.innerHTML = lastTableRowsHtml;
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeTableFocus() {
    const overlay = document.getElementById('rcTableFocusOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  return { init, onFileReady, run, switchToRouteTab };
})();

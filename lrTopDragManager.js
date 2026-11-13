/* ==========================================================================
   MODULE: LOADING RATE — TOP DRAGGING ROUTES
   Routes that pulled Avg Loading Qty and/or Total Qty down
   Grouped by Departure DC · Day / Week / Month · Luzon / VisMin
   ========================================================================== */
const LrTopDragManager = (() => {
  let periodMode = 'day';   // day | week | month
  let metricMode = 'both';   // avg | qty | both
  let routeType = 'ALL';     // ALL | LUZON | VISMIN
  let topN = 20;
  let searchRoute = '';
  let groupMode = 'by-dc'; // by-dc | by-rank
  let lastRowsHtml = '';
  let chartDrag = null;
  let chartDragAvg = null;
  let chartDragTrips = null;
  let chartN = 10;
  let lastComp = null;

  function pad2(n) { return String(n).padStart(2, '0'); }

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

  function periodLabel(key) {
    if (!key) return '—';
    if (periodMode === 'day') {
      const m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const names = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
        return names[+m[2] - 1] + ' ' + String(+m[3]).padStart(2, '0');
      }
    }
    if (periodMode === 'month') {
      const m = String(key).match(/^(\d{4})-(\d{2})$/);
      if (m) {
        const names = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
        return names[+m[2] - 1];
      }
    }
    const w = String(key).match(/^\d{4}-(W\d{2})$/i);
    if (w) return w[1].toUpperCase();
    return key;
  }

  function routeGroupOf(routeCode) {
    const parts = String(routeCode || '').split('-');
    if (parts.length < 2) return 'LUZON';
    const destCode = parseInt(parts[parts.length - 1], 10);
    if (isNaN(destCode)) return 'LUZON';
    const isVisMin =
      (destCode >= 300 && destCode <= 399) ||
      (destCode >= 500 && destCode <= 599) ||
      (destCode >= 600 && destCode <= 699) ||
      (destCode >= 800 && destCode <= 899);
    return isVisMin ? 'VISMIN' : 'LUZON';
  }

  function normalizeRows(slu, colMap) {
    return (slu || []).map(r => {
      const dateKey = toYmd(r[colMap.date]);
      const route = String(r[colMap.route] || '').trim() || '(blank)';
      return {
        dateKey,
        period: periodKey(dateKey),
        route,
        branch: String(r[colMap.branch] || '').trim() || '(blank)',
        lt: parseFloat(r[colMap.lt]) || 0,
        pkgs: parseFloat(r[colMap.pkgs]) || 0,
        routeGroup: routeGroupOf(route)
      };
    }).filter(r => r.dateKey && r.period);
  }

  function populatePeriodSelectors(rows) {
    const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort();
    const selA = document.getElementById('tdPeriodA');
    const selB = document.getElementById('tdPeriodB');
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

  function aggregateByRoute(list) {
    const map = {};
    list.forEach(r => {
      if (!map[r.route]) {
        map[r.route] = {
          route: r.route,
          branch: r.branch,
          routeGroup: r.routeGroup,
          trips: 0,
          totalLt: 0,
          pkgs: 0
        };
      }
      const a = map[r.route];
      a.trips += 1;
      a.totalLt += r.lt;
      a.pkgs += r.pkgs;
      if (!a.branch || a.branch === '(blank)') a.branch = r.branch;
    });
    return Object.values(map).map(a => ({
      route: a.route,
      branch: a.branch,
      routeGroup: a.routeGroup,
      trips: a.trips,
      totalLt: a.totalLt,
      pkgs: a.pkgs,
      avgLt: a.trips ? a.totalLt / a.trips : 0
    }));
  }

  function buildDragging(rows) {
    const selA = document.getElementById('tdPeriodA');
    const selB = document.getElementById('tdPeriodB');
    const periodA = selA ? selA.value : null;
    const periodB = selB ? selB.value : null;

    let list = rows;
    if (routeType === 'LUZON') list = list.filter(r => r.routeGroup === 'LUZON');
    if (routeType === 'VISMIN') list = list.filter(r => r.routeGroup === 'VISMIN');

    const listA = list.filter(r => r.period === periodA);
    const listB = list.filter(r => r.period === periodB);
    const mapA = Object.fromEntries(aggregateByRoute(listA).map(x => [x.route, x]));
    const mapB = Object.fromEntries(aggregateByRoute(listB).map(x => [x.route, x]));
    const routes = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);

    let out = [...routes].map(route => {
      const a = mapA[route] || { trips: 0, totalLt: 0, pkgs: 0, avgLt: 0, branch: '—', routeGroup: routeGroupOf(route) };
      const b = mapB[route] || { trips: 0, totalLt: 0, pkgs: 0, avgLt: 0, branch: '—', routeGroup: a.routeGroup };
      const avgDiff = b.avgLt - a.avgLt;
      const qtyDiff = b.totalLt - a.totalLt;
      // Impact-style score: how much this route dragged the overall average
      // Rough weighted contribution of avg change
      const dragScoreAvg = avgDiff < 0 ? avgDiff * Math.max(b.trips, a.trips, 1) : 0;
      const dragScoreQty = qtyDiff < 0 ? qtyDiff : 0;
      return {
        route,
        branch: b.branch !== '—' ? b.branch : a.branch,
        routeGroup: b.routeGroup || a.routeGroup,
        prevTrips: a.trips,
        latestTrips: b.trips,
        prevAvg: a.avgLt,
        latestAvg: b.avgLt,
        avgDiff,
        prevQty: a.totalLt,
        latestQty: b.totalLt,
        qtyDiff,
        dragScoreAvg,
        dragScoreQty
      };
    });

    // Keep only routes that dragged down on selected metric
    out = out.filter(r => {
      if (metricMode === 'avg') return r.avgDiff < -0.5;
      if (metricMode === 'qty') return r.qtyDiff < -0.5;
      return r.avgDiff < -0.5 || r.qtyDiff < -0.5;
    });

    const q = String(searchRoute || '').trim().toLowerCase();
    if (q) {
      out = out.filter(r =>
        String(r.route).toLowerCase().includes(q) ||
        String(r.branch).toLowerCase().includes(q)
      );
    }

    // Sort by strongest drag
    out.sort((a, b) => {
      if (metricMode === 'avg') return a.avgDiff - b.avgDiff || a.dragScoreAvg - b.dragScoreAvg;
      if (metricMode === 'qty') return a.qtyDiff - b.qtyDiff;
      // both: prioritize avg drag then qty
      const sa = (a.avgDiff < 0 ? a.avgDiff : 0) * 1000 + (a.qtyDiff < 0 ? a.qtyDiff / 10000 : 0);
      const sb = (b.avgDiff < 0 ? b.avgDiff : 0) * 1000 + (b.qtyDiff < 0 ? b.qtyDiff / 10000 : 0);
      return sa - sb;
    });

    const n = Math.max(1, Math.min(20, parseInt(topN, 10) || 20));
    out = out.slice(0, n);

    return { periodA, periodB, rows: out, listA, listB };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMetrics(comp) {
    const el = document.getElementById('tdMetrics');
    if (!el) return;
    const { rows, periodA, periodB } = comp;
    const labA = periodLabel(periodA);
    const labB = periodLabel(periodB);
    const avgDrag = rows.filter(r => r.avgDiff < 0).length;
    const qtyDrag = rows.filter(r => r.qtyDiff < 0).length;
    const worstAvg = rows.length ? rows.reduce((m, r) => r.avgDiff < m.avgDiff ? r : m, rows[0]) : null;
    const worstQty = rows.length ? rows.reduce((m, r) => r.qtyDiff < m.qtyDiff ? r : m, rows[0]) : null;

    el.innerHTML = `
      <div class="metrics">
        <div class="metric highlight-down">
          <div class="label">Top dragging routes</div>
          <div class="value">${rows.length}</div>
          <div class="diff neutral">Previous ${labA} → Latest ${labB}</div>
        </div>
        <div class="metric">
          <div class="label">Dragging on Avg</div>
          <div class="value">${avgDrag}</div>
          <div class="diff down">avg ↓</div>
        </div>
        <div class="metric">
          <div class="label">Dragging on Qty</div>
          <div class="value">${qtyDrag}</div>
          <div class="diff down">qty ↓</div>
        </div>
        <div class="metric">
          <div class="label">Worst Avg drop</div>
          <div class="value" style="font-size:1rem">${worstAvg ? escapeHtml(worstAvg.route) : '—'}</div>
          <div class="diff down">${worstAvg ? Math.round(worstAvg.avgDiff).toLocaleString() : ''}</div>
        </div>
        <div class="metric">
          <div class="label">Worst Qty drop</div>
          <div class="value" style="font-size:1rem">${worstQty ? escapeHtml(worstQty.route) : '—'}</div>
          <div class="diff down">${worstQty ? Math.round(worstQty.qtyDiff).toLocaleString() : ''}</div>
        </div>
      </div>`;
  }

  function groupByDc(rows) {
    const map = {};
    rows.forEach(r => {
      const k = r.branch || '(blank)';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return Object.keys(map).sort((a, b) => {
      const sa = map[a].reduce((s, r) => s + Math.min(r.avgDiff, 0), 0);
      const sb = map[b].reduce((s, r) => s + Math.min(r.avgDiff, 0), 0);
      return sa - sb;
    }).map(dc => ({ dc, routes: map[dc] }));
  }

  function applyMetricCols() {
    const hideAvg = metricMode === 'qty';
    const hideQty = metricMode === 'avg';
    document.querySelectorAll('.td-col-avg').forEach(el => {
      el.classList.toggle('td-hide', hideAvg);
    });
    document.querySelectorAll('.td-col-qty').forEach(el => {
      el.classList.toggle('td-hide', hideQty);
    });
  }

  function rankMap(rows) {
    // Global rank 1..n based on current sort order in buildDragging
    const map = {};
    rows.forEach((r, i) => { map[r.route] = i + 1; });
    return map;
  }

  function rowHtml(r, rank) {
    const rgBadge = r.routeGroup === 'VISMIN'
      ? '<span class="td-badge td-badge-vismin">VisMin</span>'
      : '<span class="td-badge td-badge-luzon">Luzon</span>';
    const avgCls = r.avgDiff < 0 ? 'neg' : (r.avgDiff > 0 ? 'pos' : '');
    const qtyCls = r.qtyDiff < 0 ? 'neg' : (r.qtyDiff > 0 ? 'pos' : '');
    return `<tr>
      <td class="td-rank">${rank}</td>
      <td><strong>${escapeHtml(r.route)}</strong> ${rgBadge}</td>
      <td>${escapeHtml(r.branch)}</td>
      <td>${r.routeGroup}</td>
      <td style="text-align:right">${r.prevTrips}</td>
      <td style="text-align:right">${r.latestTrips}</td>
      <td class="td-col-avg" style="text-align:right">${Math.round(r.prevAvg).toLocaleString()}</td>
      <td class="td-col-avg" style="text-align:right">${Math.round(r.latestAvg).toLocaleString()}</td>
      <td class="td-col-avg ${avgCls}" style="text-align:right">${r.avgDiff > 0 ? '+' : ''}${Math.round(r.avgDiff)}</td>
      <td class="td-col-qty" style="text-align:right">${Math.round(r.prevQty).toLocaleString()}</td>
      <td class="td-col-qty" style="text-align:right">${Math.round(r.latestQty).toLocaleString()}</td>
      <td class="td-col-qty ${qtyCls}" style="text-align:right">${r.qtyDiff > 0 ? '+' : ''}${Math.round(r.qtyDiff).toLocaleString()}</td>
    </tr>`;
  }

  function renderTable(comp) {
    const body = document.getElementById('tdTableBody');
    const count = document.getElementById('tdTableCount');
    if (!body) return;
    const { rows, periodA, periodB } = comp;
    const labA = periodLabel(periodA);
    const labB = periodLabel(periodB);
    const ranks = rankMap(rows);

    const setTh = (id, main, sub) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = main + (sub ? '<span>' + sub + '</span>' : '');
    };
    setTh('tdThTripsA', 'Prev Trips', labA);
    setTh('tdThTripsB', 'Latest Trips', labB);
    setTh('tdThAvgA', 'Prev Avg LT', labA);
    setTh('tdThAvgB', 'Latest Avg LT', labB);
    setTh('tdThQtyA', 'Prev Total Qty', labA);
    setTh('tdThQtyB', 'Latest Total Qty', labB);

    const note = document.getElementById('tdTableNote');
    if (note) {
      /*const metricLabel = metricMode === 'avg' ? 'Avg Loading Qty' : (metricMode === 'qty' ? 'Total Loading Qty' : 'Avg + Total Qty');
      const viewLabel = groupMode === 'by-rank' ? 'Sorted by rank' : 'Grouped by Departure DC';
      note.textContent = 'Top ' + rows.length + ' routes dragging ' + metricLabel + ' down · Previous (' + labA + ') vs Latest (' + labB + ') · ' + viewLabel; */
    }
    const focusSub = document.getElementById('tdTableFocusSub');
    if (focusSub) focusSub.textContent = 'Previous (' + labA + ') vs Latest (' + labB + ') · Top ' + rows.length;

    if (!rows.length) {
      const empty = '<tr><td colspan="12">No dragging routes match the current filters.</td></tr>';
      body.innerHTML = empty;
      lastRowsHtml = empty;
      if (count) count.textContent = '0 routes';
      applyMetricCols();
      return;
    }

    let html = '';
    if (groupMode === 'by-rank') {
      rows.forEach((r, i) => {
        html += rowHtml(r, ranks[r.route] || (i + 1));
      });
    } else {
      const groups = groupByDc(rows);
      groups.forEach(g => {
        html += `<tr class="td-dc-header">
          <td colspan="12"><strong>Departure DC: ${escapeHtml(g.dc)}</strong>
            <span style="font-weight:500;color:rgba(255,255,255,0.85);margin-left:8px;">${g.routes.length} route(s)</span>
          </td>
        </tr>`;
        // Within DC, keep global rank order
        const sorted = [...g.routes].sort((a, b) => (ranks[a.route] || 99) - (ranks[b.route] || 99));
        sorted.forEach(r => {
          html += rowHtml(r, ranks[r.route] || '—');
        });
      });
    }

    body.innerHTML = html;
    lastRowsHtml = html;
    const fb = document.getElementById('tdFocusTableBody');
    if (fb) fb.innerHTML = html;

    if (count) {
      const gLabel = groupMode === 'by-rank' ? 'by rank' : 'by Departure DC';
      count.textContent = `${rows.length} route(s) · ${gLabel} · ${metricMode.toUpperCase()} · ${routeType}`;
    }
    applyMetricCols();
  }

  function yMaxPad(values) {
    const nums = (values || []).map(Number).filter(v => !isNaN(v));
    if (!nums.length) return 1;
    const m = Math.max(...nums.map(Math.abs), 0);
    if (m <= 0) return 1;
    return m * 1.2 + 1;
  }

  function renderChart(comp) {
    lastComp = comp;
    if (chartDrag) try { chartDrag.destroy(); } catch (e) {}
    if (chartDragAvg) try { chartDragAvg.destroy(); } catch (e) {}
    if (chartDragTrips) try { chartDragTrips.destroy(); } catch (e) {}
    chartDrag = chartDragAvg = chartDragTrips = null;

    const note = document.getElementById('tdChartNote');
    const routeSel = document.getElementById('tdChartRoute');
    const routeLabel = document.getElementById('tdChartRouteLabel');
    const rowsAll = comp.rows || [];
    const labA = periodLabel(comp.periodA);
    const labB = periodLabel(comp.periodB);

    // Chart N control
    const nSel = document.getElementById('tdChartN');
    if (nSel) chartN = parseInt(nSel.value, 10) || 10;

    // Populate individual route list
    if (routeSel) {
      const prevVal = routeSel.value;
      routeSel.innerHTML = rowsAll.map(r =>
        `<option value="${escapeHtml(r.route)}">${escapeHtml(r.route)}</option>`
      ).join('');
      if (prevVal && rowsAll.some(r => r.route === prevVal)) routeSel.value = prevVal;
    }

    const isIndividual = chartN === 1;
    if (routeSel) routeSel.style.display = isIndividual ? '' : 'none';
    if (routeLabel) routeLabel.style.display = isIndividual ? '' : 'none';

    let rows = [];
    if (!rowsAll.length) {
      if (note) note.textContent = 'No dragging routes to chart.';
      return;
    }

    if (isIndividual) {
      const pick = routeSel && routeSel.value
        ? rowsAll.find(r => r.route === routeSel.value) || rowsAll[0]
        : rowsAll[0];
      rows = pick ? [pick] : [];
    } else {
      const n = Math.min(10, Math.max(5, chartN === 5 ? 5 : 10));
      rows = rowsAll.slice(0, n);
    }

    if (note) {
      if (isIndividual && rows[0]) {
        note.textContent = rows[0].route + ' — Previous (' + labA + ') vs Latest (' + labB + ')';
      } else {
        note.textContent = 'Top ' + rows.length + ' — Previous (' + labA + ') vs Latest (' + labB + ')';
      }
    }

    function makeCompareBar(canvasId, label, getPrev, getLatest, colorLatest) {
      const el = document.getElementById(canvasId);
      if (!el) return null;
      const labels = rows.map(r => {
        if (isIndividual) return r.route;
        const name = r.route.length > 14 ? r.route.slice(0, 12) + '…' : r.route;
        const rank = (comp.rows || []).findIndex(x => x.route === r.route) + 1;
        return '#' + rank + ' ' + name;
      });
      const dataA = rows.map(r => Math.round(getPrev(r)));
      const dataB = rows.map(r => Math.round(getLatest(r)));
      const valuePlugin = {
        id: canvasId + 'Vals',
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
              const t = Number(raw).toLocaleString();
              ctx.lineWidth = 2;
              ctx.strokeStyle = 'rgba(255,255,255,0.9)';
              ctx.strokeText(t, pos.x + 4, pos.y);
              ctx.fillStyle = '#212121';
              ctx.fillText(t, pos.x + 4, pos.y);
            });
          });
          ctx.restore();
        }
      };
      const all = dataA.concat(dataB);
      const maxV = Math.max(...all.map(Math.abs), 1);
      return new Chart(el, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Previous (' + labA + ')',
              data: dataA,
              backgroundColor: '#90A4AE',
              borderRadius: 4,
              maxBarThickness: isIndividual ? 56 : 18
            },
            {
              label: 'Latest (' + labB + ')',
              data: dataB,
              backgroundColor: colorLatest,
              borderRadius: 4,
              maxBarThickness: isIndividual ? 56 : 18
            }
          ]
        },
        options: {
          indexAxis: isIndividual ? 'x' : 'y',
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
          scales: isIndividual ? {
            x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
            y: {
              beginAtZero: true,
              suggestedMax: maxV * 1.15 + 1,
              grid: { color: '#F0F0F0' },
              ticks: { callback: v => Number(v).toLocaleString() }
            }
          } : {
            x: {
              beginAtZero: true,
              suggestedMax: maxV * 1.15 + 1,
              grid: { color: '#F0F0F0' },
              ticks: { callback: v => Number(v).toLocaleString() }
            },
            y: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } }
          }
        },
        plugins: [valuePlugin]
      });
    }

    chartDragAvg = makeCompareBar(
      'tdChartAvg', 'Avg Loading Qty',
      r => r.prevAvg, r => r.latestAvg, '#2E7D32'
    );
    chartDragTrips = makeCompareBar(
      'tdChartTrips', 'Trips',
      r => r.prevTrips, r => r.latestTrips, '#1565C0'
    );
  }

  function getRows() {
    const state = FileProcessor.getState();
    if (!state.storedSlu || !state.storedColMap) return [];
    return normalizeRows(state.storedSlu, state.storedColMap);
  }

  function run() {
    const rows = getRows();
    if (!rows.length) {
      const body = document.getElementById('tdTableBody');
      if (body) body.innerHTML = '<tr><td colspan="11">Upload a Mainline file first.</td></tr>';
      return;
    }
    const fresh = getRows();
    populatePeriodSelectors(fresh);

    const topSel = document.getElementById('tdTopN');
    if (topSel) topN = Math.max(1, Math.min(20, parseInt(topSel.value, 10) || 20));

    const comp = buildDragging(fresh);
    const info = document.getElementById('tdInfo');
    if (info) {
      /*info.innerHTML = `Comparing <span class="badge">${periodLabel(comp.periodA)}</span> vs <span class="badge">${periodLabel(comp.periodB)}</span>
        · Mode: <strong>${periodMode.toUpperCase()}</strong>
        · Filter: <strong>${routeType}</strong>
        · Metric: <strong>${metricMode.toUpperCase()}</strong>`; */
    }
    renderMetrics(comp);
    renderTable(comp);
    renderChart(comp);
  }

  function onFileReady() {
    const rows = getRows();
    if (!rows.length) return;
    populatePeriodSelectors(rows);
  }

  function setPeriodMode(mode) {
    periodMode = mode;
    document.querySelectorAll('[data-td-period]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-td-period') === mode);
    });
    populatePeriodSelectors(getRows());
    run();
  }

  function switchToTab() {
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
    if (routePanel) routePanel.classList.add('hidden');
    if (dragPanel) dragPanel.classList.remove('hidden');
    if (btnDay) btnDay.classList.remove('active');
    if (btnWeek) btnWeek.classList.remove('active');
    if (btnRoute) btnRoute.classList.remove('active');
    if (btnDrag) btnDrag.classList.add('active');
    onFileReady();
    run();
  }

  function openTableFocus() {
    const overlay = document.getElementById('tdTableFocusOverlay');
    const fb = document.getElementById('tdFocusTableBody');
    if (fb && lastRowsHtml) fb.innerHTML = lastRowsHtml;
    applyMetricCols();
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeTableFocus() {
    const overlay = document.getElementById('tdTableFocusOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function init() {
    const btn = document.getElementById('tabLrTopDrag');
    if (btn) btn.addEventListener('click', switchToTab);

    document.querySelectorAll('[data-td-period]').forEach(b => {
      b.addEventListener('click', () => setPeriodMode(b.getAttribute('data-td-period') || 'day'));
    });

    const btnCompare = document.getElementById('btnTdCompare');
    if (btnCompare) btnCompare.addEventListener('click', run);

    const typeSel = document.getElementById('tdRouteType');
    if (typeSel) {
      typeSel.addEventListener('change', () => {
        routeType = typeSel.value || 'ALL';
        run();
      });
    }

    const metricSel = document.getElementById('tdMetricMode');
    if (metricSel) {
      metricSel.addEventListener('change', () => {
        metricMode = metricSel.value || 'both';
        run();
      });
    }

    const groupSel = document.getElementById('tdGroupMode');
    if (groupSel) {
      groupSel.addEventListener('change', () => {
        groupMode = groupSel.value || 'by-dc';
        run();
      });
    }

    const topSel = document.getElementById('tdTopN');
    if (topSel) {
      topSel.addEventListener('change', () => {
        topN = Math.max(1, Math.min(20, parseInt(topSel.value, 10) || 20));
        run();
      });
    }

    const search = document.getElementById('tdSearchRoute');
    if (search) {
      search.addEventListener('input', () => {
        searchRoute = search.value || '';
        run();
      });
    }

    const clear = document.getElementById('tdClearFilters');
    if (clear) {
      clear.addEventListener('click', () => {
        searchRoute = '';
        routeType = 'ALL';
        metricMode = 'both';
        groupMode = 'by-dc';
        topN = 20;
        if (search) search.value = '';
        if (typeSel) typeSel.value = 'ALL';
        if (metricSel) metricSel.value = 'both';
        if (groupSel) groupSel.value = 'by-dc';
        if (topSel) topSel.value = '20';
        run();
      });
    }

    const chartNSel = document.getElementById('tdChartN');
    if (chartNSel) {
      chartNSel.addEventListener('change', () => {
        chartN = parseInt(chartNSel.value, 10) || 10;
        if (lastComp) renderChart(lastComp);
      });
    }
    const chartRouteSel = document.getElementById('tdChartRoute');
    if (chartRouteSel) {
      chartRouteSel.addEventListener('change', () => {
        if (lastComp) renderChart(lastComp);
      });
    }

    const focusBtn = document.getElementById('tdTableFocusBtn');
    if (focusBtn) focusBtn.addEventListener('click', openTableFocus);
    const closeBtn = document.getElementById('tdTableFocusClose');
    if (closeBtn) closeBtn.addEventListener('click', closeTableFocus);
    const overlay = document.getElementById('tdTableFocusOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeTableFocus();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeTableFocus();
    });
  }

  return { init, onFileReady, run, switchToTab };
})();

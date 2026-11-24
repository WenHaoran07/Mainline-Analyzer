/* ==========================================================================
   MODULE: LOADING RATE — PERIOD SUMMARY
   Day / Week / Month range · target 10,800 · top drag · charts
   ========================================================================== */
const LrSummaryManager = (() => {
  const TARGET_AVG = 10800;

  let periodMode = 'day'; // day | week | month
  let routeType = 'ALL';  // ALL | LUZON | VISMIN
  let chartLine = null;
  let chartPie = null;
  let chartTrips = null;
  let chartFocus = null;
  let lastSummary = null;
  let focusMode = null; // 'avg' | 'trips'
  const planeAnim = { raf: null, running: false };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        return names[+m[2] - 1] + ' ' + m[1];
      }
    }
    const w = String(key).match(/^\d{4}-(W\d{2})$/i);
    if (w) return w[1].toUpperCase();
    return key;
  }

  function routeGroupOf(routeCode) {
    const parts = String(routeCode || '').split('-').filter(Boolean);
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
        routeGroup: routeGroupOf(route),
        taskId: colMap.shipmentNo != null && r[colMap.shipmentNo] != null
          ? String(r[colMap.shipmentNo])
          : '—',
        plate: colMap.plateNo != null && r[colMap.plateNo] != null
          ? String(r[colMap.plateNo])
          : '—',
        actualSize: colMap.actualSize != null && r[colMap.actualSize] != null
          ? String(r[colMap.actualSize])
          : '—',
        planningSize: colMap.planningSize != null && r[colMap.planningSize] != null
          ? String(r[colMap.planningSize])
          : '—'
      };
    }).filter(r => r.dateKey && r.period);
  }

  function stats(list) {
    if (!list || !list.length) return { trips: 0, pkgs: 0, totalLt: 0, avgLt: 0 };
    const trips = list.length;
    const pkgs = list.reduce((s, r) => s + r.pkgs, 0);
    const totalLt = list.reduce((s, r) => s + r.lt, 0);
    return { trips, pkgs, totalLt, avgLt: totalLt / trips };
  }

  function aggregateByRoute(list) {
    const map = {};
    list.forEach(r => {
      if (!map[r.route]) {
        map[r.route] = {
          route: r.route,
          routeGroup: r.routeGroup,
          trips: 0,
          totalLt: 0,
          rows: []
        };
      }
      map[r.route].trips += 1;
      map[r.route].totalLt += r.lt;
      map[r.route].rows.push(r);
    });
    return Object.values(map).map(a => ({
      route: a.route,
      routeGroup: a.routeGroup,
      trips: a.trips,
      totalLt: a.totalLt,
      avgLt: a.trips ? a.totalLt / a.trips : 0,
      rows: a.rows
    }));
  }

  function topDragRoute(prevList, currList) {
    const mapA = Object.fromEntries(aggregateByRoute(prevList).map(x => [x.route, x]));
    const mapB = Object.fromEntries(aggregateByRoute(currList).map(x => [x.route, x]));
    // Only routes that ran in the current period (avoids 0 avg / 0 qty)
    const routes = Object.keys(mapB);
    let worst = null;
    routes.forEach(route => {
      const a = mapA[route] || { trips: 0, avgLt: 0, totalLt: 0, rows: [] };
      const b = mapB[route];
      if (!b || !b.trips) return;
      const avgDiff = b.avgLt - (a.trips ? a.avgLt : b.avgLt);
      // Prefer routes that dropped vs previous; if no previous, skip ranking by drop
      if (a.trips && avgDiff >= -0.5) return;
      if (!a.trips) return; // need previous baseline to be a "drag"
      if (!worst || avgDiff < worst.avgDiff) {
        const sorted = (b.rows || []).slice().sort((x, y) => x.lt - y.lt);
        worst = {
          route,
          routeGroup: b.routeGroup || routeGroupOf(route),
          avgDiff,
          prevAvg: a.avgLt,
          latestAvg: b.avgLt,
          prevTrips: a.trips,
          latestTrips: b.trips,
          routeTotalLt: b.totalLt,
          trips: sorted,
          // lowest trip for quick ref
          taskId: sorted[0] ? sorted[0].taskId : '—',
          plate: sorted[0] ? sorted[0].plate : '—',
          tripLt: sorted[0] ? sorted[0].lt : 0
        };
      }
    });
    return worst;
  }

  function populateSelectors(rows) {
    const periods = [...new Set(rows.map(r => r.period).filter(Boolean))].sort();
    const selFrom = document.getElementById('smPeriodFrom');
    const selTo = document.getElementById('smPeriodTo');
    if (!selFrom || !selTo) return periods;
    const prevFrom = selFrom.value;
    const prevTo = selTo.value;
    const opts = periods.map(p => '<option value="' + p + '">' + periodLabel(p) + '</option>').join('');
    selFrom.innerHTML = opts;
    selTo.innerHTML = opts;
    if (prevFrom && periods.includes(prevFrom)) selFrom.value = prevFrom;
    else if (periods.length) selFrom.value = periods[0];
    if (prevTo && periods.includes(prevTo)) selTo.value = prevTo;
    else if (periods.length) selTo.value = periods[periods.length - 1];
    return periods;
  }

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
        ctx.textBaseline = 'bottom';
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          if (ds.label === 'Target') return;
          meta.data.forEach((pt, i) => {
            const raw = ds.data[i];
            if (raw == null || isNaN(raw)) return;
            const pos = pt.tooltipPosition ? pt.tooltipPosition() : { x: pt.x, y: pt.y };
            const label = Number(raw).toLocaleString();
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.strokeText(label, pos.x, pos.y - 4);
            ctx.fillStyle = '#212121';
            ctx.fillText(label, pos.x, pos.y - 4);
          });
        });
        ctx.restore();
      }
    };
  }

  function buildSummary(rows) {
    const selFrom = document.getElementById('smPeriodFrom');
    const selTo = document.getElementById('smPeriodTo');
    const from = selFrom ? selFrom.value : null;
    const to = selTo ? selTo.value : null;

    let list = rows;
    if (routeType === 'LUZON') list = list.filter(r => r.routeGroup === 'LUZON');
    if (routeType === 'VISMIN') list = list.filter(r => r.routeGroup === 'VISMIN');

    const allPeriods = [...new Set(list.map(r => r.period).filter(Boolean))].sort();
    const inRange = allPeriods.filter(p => {
      if (from && p < from) return false;
      if (to && p > to) return false;
      return true;
    });

    const byPeriod = {};
    allPeriods.forEach(p => {
      byPeriod[p] = list.filter(r => r.period === p);
    });

    const series = [];
    const contribMap = {};
    const perDateContrib = [];

    inRange.forEach(p => {
      const curRows = byPeriod[p] || [];
      const cur = stats(curRows);

      // Previous period = period immediately before this one in full data
      // e.g. range Nov 8–14 → Nov 8 vs Nov 7
      const globalIdx = allPeriods.indexOf(p);
      const prevKey = globalIdx > 0 ? allPeriods[globalIdx - 1] : null;
      const prevRows = prevKey ? (byPeriod[prevKey] || []) : [];
      const prevS = stats(prevRows);

      const drag = topDragRoute(prevRows, curRows);
      const vsPrev = prevKey ? cur.avgLt - prevS.avgLt : null;
      const vsTarget = cur.avgLt - TARGET_AVG;
      const hit = cur.avgLt + 0.5 >= TARGET_AVG;

      if (drag) {
        if (!contribMap[drag.route]) {
          contribMap[drag.route] = {
            route: drag.route,
            routeGroup: drag.routeGroup,
            times: 0,
            sumDiff: 0,
            worstPeriod: p,
            worstDiff: drag.avgDiff
          };
        }
        const c = contribMap[drag.route];
        c.times += 1;
        c.sumDiff += drag.avgDiff;
        if (drag.avgDiff < c.worstDiff) {
          c.worstDiff = drag.avgDiff;
          c.worstPeriod = p;
        }

        perDateContrib.push({
          period: p,
          label: periodLabel(p),
          route: drag.route,
          routeGroup: drag.routeGroup,
          taskId: drag.taskId,
          plate: drag.plate,
          tripLt: drag.tripLt,
          routeTotalLt: drag.routeTotalLt,
          routeTrips: drag.latestTrips,
          routeAvg: drag.latestAvg,
          avgDiff: drag.avgDiff,
          trips: drag.trips || []
        });
      } else {
        perDateContrib.push({
          period: p,
          label: periodLabel(p),
          route: '—',
          routeGroup: '',
          taskId: '—',
          plate: '—',
          tripLt: null,
          routeAvg: null,
          avgDiff: null
        });
      }

      series.push({
        period: p,
        label: periodLabel(p),
        prevLabel: prevKey ? periodLabel(prevKey) : null,
        trips: cur.trips,
        pkgs: cur.pkgs,
        totalLt: cur.totalLt,
        avgLt: cur.avgLt,
        vsPrev,
        vsTarget,
        hit,
        topDrag: drag
      });
    });

    const contributors = Object.values(contribMap)
      .sort((a, b) => b.times - a.times || a.sumDiff - b.sumDiff)
      .slice(0, 15);

    return { series, contributors, perDateContrib, from, to, target: TARGET_AVG };
  }

  function renderMetrics(summary) {
    const el = document.getElementById('smMetrics');
    if (!el) return;
    const { series, target } = summary;
    const hitN = series.filter(s => s.hit).length;
    const missN = series.length - hitN;
    const avgAll = series.length
      ? series.reduce((s, r) => s + r.avgLt, 0) / series.length
      : 0;
    const worst = series.length
      ? series.reduce((m, r) => (!m || r.avgLt < m.avgLt ? r : m), null)
      : null;
    const fmt = n => Math.round(n).toLocaleString();

    el.innerHTML =
      '<div class="metric">' +
        '<div class="label">Periods</div>' +
        '<div class="value">' + series.length + '</div>' +
        '<div class="diff neutral">' + periodMode.toUpperCase() + '</div>' +
      '</div>' +
      '<div class="metric">' +
        '<div class="label">Hit target</div>' +
        '<div class="value" style="color:#2E7D32">' + hitN + '</div>' +
        '<div class="diff up">Hit ' + 'Target'+ '</div>' +
      '</div>' +
      '<div class="metric highlight-down">' +
        '<div class="label">Missed target</div>' +
        '<div class="value">' + missN + '</div>' +
        '<div class="diff down">Below ' + 'Target'+ '</div>' +
      '</div>' +
      '<div class="metric">' +
        '<div class="label">Range avg LT</div>' +
        '<div class="value">' + fmt(avgAll) + '</div>' +
        '<div class="diff neutral">target ' + fmt(target) + '</div>' +
      '</div>' +
      '<div class="metric">' +
        '<div class="label">Lowest period</div>' +
        '<div class="value" style="font-size:1rem">' + (worst ? escapeHtml(worst.label) : '—') + '</div>' +
        '<div class="diff down">' + (worst ? fmt(worst.avgLt) : '') + '</div>' +
      '</div>';
  }

  function renderWhy(summary) {
    const el = document.getElementById('smWhyBox');
    if (!el) return;
    const { series, contributors, from, to, target } = summary;
    if (!series.length) {
      el.innerHTML = '';
      return;
    }
    const miss = series.filter(s => !s.hit);
    const rangeLab = periodLabel(from) + ' to ' + periodLabel(to);

    if (!miss.length) {
      el.className = 'sm-why-box sm-why-ok';
      el.innerHTML = '<strong>Target ' + Math.round(target).toLocaleString() +
        ':</strong> All ' + series.length + ' period(s) in <strong>' +
        escapeHtml(rangeLab) + '</strong> met or exceeded target.';
      return;
    }

    const top = contributors.slice(0, 3);
    const missLabels = miss.slice(0, 6).map(s => s.label).join(', ') +
      (miss.length > 6 ? '…' : '');
    let why = '<strong>Target ' + Math.round(target).toLocaleString() + ':</strong> ';
    why += miss.length + ' of ' + series.length + ' period(s) in <strong>' +
      escapeHtml(rangeLab) + '</strong> were below target. ';
    why += 'Missed: <strong>' + escapeHtml(missLabels) + '</strong>.';
    if (top.length) {
      why += ' Top drag routes: ';
      why += top.map(c =>
        '<strong>' + escapeHtml(c.route) + '</strong> (' + c.times +
        'x, sum ' + Math.round(c.sumDiff).toLocaleString() + ')'
      ).join('; ') + '.';
    }
    el.className = 'sm-why-box';
    el.innerHTML = why;
  }

  function renderTable(summary) {
    const body = document.getElementById('smTableBody');
    const count = document.getElementById('smTableCount');
    if (!body) return;
    const { series } = summary;
    if (!series.length) {
      body.innerHTML = '<tr><td colspan="11">No periods in the selected range.</td></tr>';
      if (count) count.textContent = '0 periods';
      return;
    }
    body.innerHTML = series.map((s, i) => {
      const status = s.hit
        ? '<span class="sm-status-hit">HIT</span>'
        : '<span class="sm-status-miss">MISS</span>';
      const vsPrev = s.vsPrev == null ? '—'
        : ((s.vsPrev > 0 ? '+' : '') + Math.round(s.vsPrev).toLocaleString());
      const vsPrevCls = s.vsPrev == null ? '' : (s.vsPrev < 0 ? 'neg' : (s.vsPrev > 0 ? 'pos' : ''));
      const vsTarget = s.vsTarget == null ? '—'
        : ((s.vsTarget > 0 ? '+' : '') + Math.round(s.vsTarget).toLocaleString());
      const vsTargetCls = s.vsTarget == null ? '' : (s.vsTarget < 0 ? 'neg' : (s.vsTarget > 0 ? 'pos' : ''));
      const dragRoute = s.topDrag ? escapeHtml(s.topDrag.route) : '—';
      const dragDiff = s.topDrag
        ? ((s.topDrag.avgDiff > 0 ? '+' : '') + Math.round(s.topDrag.avgDiff).toLocaleString())
        : '—';
      const dragCls = s.topDrag && s.topDrag.avgDiff < 0 ? 'neg' : '';
      const rowCls = s.hit ? '' : 'top-culprit';
      return '<tr class="' + rowCls + '">' +
        '<td class="td-rank">' + (i + 1) + '</td>' +
        '<td><strong>' + escapeHtml(s.label) + '</strong></td>' +
        '<td>' + status + '</td>' +
        '<td style="text-align:right">' + s.trips + '</td>' +
        '<td style="text-align:right">' + Math.round(s.pkgs).toLocaleString() + '</td>' +
        '<td style="text-align:right">' + Math.round(s.avgLt).toLocaleString() + '</td>' +
        '<td style="text-align:right" class="' + vsPrevCls + '">' + vsPrev + '</td>' +
        '<td style="text-align:right" class="' + vsTargetCls + '">' + vsTarget + '</td>' +
        '<td style="text-align:right">' + Math.round(s.totalLt).toLocaleString() + '</td>' +
        '<td>' + dragRoute + '</td>' +
        '<td style="text-align:right" class="' + dragCls + '">' + dragDiff + '</td>' +
        '</tr>';
    }).join('');
    if (count) count.textContent = series.length + ' period(s)';
  }

  function renderContrib(summary) {
    const body = document.getElementById('smContribBody');
    if (!body) return;
    const list = summary.contributors || [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7">No dragging routes in this range.</td></tr>';
      return;
    }
    body.innerHTML = list.map((c, i) => {
      const badge = c.routeGroup === 'VISMIN'
        ? '<span class="td-badge td-badge-vismin">VisMin</span>'
        : '<span class="td-badge td-badge-luzon">Luzon</span>';
      return '<tr class="' + (i === 0 ? 'top-culprit' : '') + '">' +
        '<td class="td-rank">' + (i + 1) + '</td>' +
        '<td><strong>' + escapeHtml(c.route) + '</strong> ' + badge + '</td>' +
        '<td>' + escapeHtml(c.routeGroup) + '</td>' +
        '<td style="text-align:right">' + c.times + '</td>' +
        '<td style="text-align:right" class="neg">' + Math.round(c.sumDiff).toLocaleString() + '</td>' +
        '<td>' + escapeHtml(periodLabel(c.worstPeriod)) + '</td>' +
        '<td style="text-align:right" class="neg">' + Math.round(c.worstDiff).toLocaleString() + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderPerDateContrib(summary) {
    const body = document.getElementById('smPerDateContribBody');
    const detail = document.getElementById('smPerDateDetail');
    if (detail) detail.innerHTML = '';
    if (!body) return;
    const list = summary.perDateContrib || [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7">No data.</td></tr>';
      return;
    }
    body.innerHTML = list.map((c, i) => {
      if (!c.route || c.route === '—') {
        return '<tr>' +
          '<td class="td-rank">' + (i + 1) + '</td>' +
          '<td><strong>' + escapeHtml(c.label) + '</strong></td>' +
          '<td colspan="5">No drag route</td>' +
          '</tr>';
      }
      const badge = c.routeGroup === 'VISMIN'
        ? '<span class="td-badge td-badge-vismin">VisMin</span>'
        : '<span class="td-badge td-badge-luzon">Luzon</span>';
      const ch = c.avgDiff == null ? '—'
        : ((c.avgDiff > 0 ? '+' : '') + Math.round(c.avgDiff).toLocaleString());
      const totalQty = c.routeTotalLt != null ? c.routeTotalLt : c.tripLt;
      return '<tr class="sm-period-row top-culprit" data-sm-idx="' + i + '" style="cursor:pointer;" title="Click for trip details">' +
        '<td class="td-rank">' + (i + 1) + '</td>' +
        '<td><strong>' + escapeHtml(c.label) + '</strong></td>' +
        '<td><strong>' + escapeHtml(c.route) + '</strong> ' + badge + '</td>' +
        '<td style="text-align:right">' + (c.routeTrips != null ? c.routeTrips : '—') + '</td>' +
        '<td style="text-align:right;font-weight:700">' +
          (totalQty != null ? Math.round(totalQty).toLocaleString() : '—') + '</td>' +
        '<td style="text-align:right">' +
          (c.routeAvg != null ? Math.round(c.routeAvg).toLocaleString() : '—') + '</td>' +
        '<td style="text-align:right" class="neg">' + ch + '</td>' +
        '</tr>';
    }).join('');

    body.querySelectorAll('.sm-period-row').forEach(tr => {
      tr.addEventListener('click', function () {
        const idx = parseInt(tr.getAttribute('data-sm-idx'), 10);
        const c = list[idx];
        if (!c || !detail) return;
        body.querySelectorAll('.sm-period-row').forEach(r => r.style.outline = '');
        tr.style.outline = '2px solid #E60012';
        const trips = c.trips || [];
        if (!trips.length) {
          detail.innerHTML = '<p class="section-note">No trip rows for ' + escapeHtml(c.label) + ' · ' + escapeHtml(c.route) + '</p>';
          return;
        }
        const rows = trips.slice().sort((a, b) => a.lt - b.lt).map(t =>
          '<tr>' +
          '<td>' + escapeHtml(t.taskId) + '</td>' +
          '<td>' + escapeHtml(t.plate) + '</td>' +
          '<td>' + escapeHtml(t.branch) + '</td>' +
          '<td>' + escapeHtml(t.actualSize || '—') + '</td>' +
          '<td style="text-align:right;font-weight:700">' + Math.round(t.lt).toLocaleString() + '</td>' +
          '</tr>'
        ).join('');
        detail.innerHTML =
          '<div style="background:#FAFAFA;border:1px solid #E0E0E0;border-radius:10px;padding:12px 14px;">' +
          '<div style="font-weight:700;margin-bottom:8px;">' +
          escapeHtml(c.label) + ' · ' + escapeHtml(c.route) +
          ' · ' + trips.length + ' trip(s)</div>' +
          '<div class="table-scroll" style="max-height:240px;overflow:auto;">' +
          '<table class="rc-focus-table"><thead><tr>' +
          '<th>Task ID</th><th>Plate No.</th><th>Departure DC</th><th>Truck Size</th><th>Loading Qty</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      });
    });
  }

  function renderCharts(summary) {
    chartLine = destroyChart(chartLine);
    chartPie = destroyChart(chartPie);
    chartTrips = destroyChart(chartTrips);

    const { series, target } = summary;
    const labels = series.map(s => s.label);
    const avgData = series.map(s => Math.round(s.avgLt));
    const tripData = series.map(s => s.trips);
    const qtyData = series.map(s => Math.round(s.totalLt));
    const hitN = series.filter(s => s.hit).length;
    const missN = series.length - hitN;

    const lineNote = document.getElementById('smLineNote');
    if (lineNote) lineNote.textContent = 'Target ' + Math.round(target).toLocaleString();
    const pieNote = document.getElementById('smPieNote');
    if (pieNote) {
      pieNote.textContent = hitN + ' hit · ' + missN + ' miss '
    }

    const elLine = document.getElementById('smChartLine');
    if (elLine && series.length) {
      const targetLine = labels.map(() => target);
      chartLine = new Chart(elLine, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Avg LT',
              data: avgData,
              borderColor: '#E60012',
              backgroundColor: 'rgba(230,0,18,0.12)',
              fill: true,
              tension: 0.25,
              pointRadius: 5,
              pointBackgroundColor: series.map(s => s.hit ? '#2E7D32' : '#E60012')
            },
            {
              label: 'Target',
              data: targetLine,
              borderColor: '#1565C0',
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString()
              }
            }
          },
          scales: {
            y: {
              beginAtZero: false,
              suggestedMax: Math.max.apply(null, avgData.concat([target])) * 1.08 + 1,
              grid: { color: '#F0F0F0' },
              ticks: { callback: v => Number(v).toLocaleString() }
            },
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }
          }
        },
        plugins: [valueLabelPlugin('smLineVals')]
      });
    }

    const elPie = document.getElementById('smChartPie');
    if (elPie && series.length) {
      const pieLabelPlugin = {
        id: 'smPieLabels',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data) return;
          ctx.save();
          ctx.font = '700 12px Segoe UI, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          meta.data.forEach((pt, i) => {
            const raw = chart.data.datasets[0].data[i];
            if (!raw) return;
            const pos = pt.tooltipPosition ? pt.tooltipPosition() : { x: pt.x, y: pt.y };
            const pct = series.length ? Math.round(raw * 100 / series.length) : 0;
            const t = raw + ' (' + pct + '%)';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeText(t, pos.x, pos.y);
            ctx.fillStyle = '#212121';
            ctx.fillText(t, pos.x, pos.y);
          });
          ctx.restore();
        }
      };
      chartPie = new Chart(elPie, {
        type: 'doughnut',
        data: {
          labels: ['Hit target', 'Missed target'],
          datasets: [{
            data: [hitN, missN],
            backgroundColor: ['#2E7D32', '#E60012'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const v = ctx.raw || 0;
                  const pct = series.length ? Math.round(v * 100 / series.length) : 0;
                  return ' ' + ctx.label + ': ' + v + ' (' + pct + '%)';
                }
              }
            }
          }
        },
        plugins: [pieLabelPlugin]
      });
    }

    const elTrips = document.getElementById('smChartTrips');
    if (elTrips && series.length) {
      chartTrips = new Chart(elTrips, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: 'Trips',
              data: tripData,
              backgroundColor: '#90A4AE',
              borderRadius: 4,
              yAxisID: 'yTrips',
              order: 3,
              maxBarThickness: 36
            },
            {
              type: 'line',
              label: 'Total Loading Qty',
              data: qtyData,
              borderColor: '#E60012',
              backgroundColor: 'rgba(230,0,18,0.12)',
              tension: 0.25,
              pointRadius: 4,
              yAxisID: 'yQty',
              order: 2,
              fill: false
            },
            {
              type: 'line',
              label: 'Avg Loading Qty',
              data: avgData,
              borderColor: '#2E7D32',
              backgroundColor: 'rgba(46,125,50,0.08)',
              tension: 0.25,
              pointRadius: 4,
              yAxisID: 'yAvg',
              order: 1,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString()
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
            yTrips: {
              type: 'linear', position: 'left', beginAtZero: true,
              title: { display: true, text: 'Trips', font: { size: 10 } },
              grid: { color: '#F0F0F0' },
              ticks: { callback: v => Number(v).toLocaleString() }
            },
            yQty: {
              type: 'linear', position: 'right', beginAtZero: true,
              title: { display: true, text: 'Total LT', font: { size: 10 } },
              grid: { drawOnChartArea: false },
              ticks: { callback: v => Number(v).toLocaleString() }
            },
            yAvg: {
              type: 'linear', position: 'right', beginAtZero: false,
              title: { display: true, text: 'Avg LT', font: { size: 10 } },
              grid: { drawOnChartArea: false },
              ticks: { callback: v => Number(v).toLocaleString() },
              // offset so it does not overlap yQty legend area visually
              offset: true
            }
          }
        },
        plugins: [valueLabelPlugin('smTripsVals')]
      });
    }
  }


  /* ---- Expand + sleigh path animation (like Mainline Travel Time) ---- */
  const SM_THRESH = {
    avg: 10000,      // avg loading qty
    qty: 1000000,    // total loading qty
    trips: 100       // trips
  };

  function stopSmPlane() {
    if (planeAnim.raf) cancelAnimationFrame(planeAnim.raf);
    planeAnim.raf = null;
    planeAnim.running = false;
    const plane = document.getElementById('smPlane');
    if (plane) {
      plane.classList.remove('is-flying', 'is-crash');
      plane.style.opacity = '0';
    }
    const val = document.getElementById('smPlaneValue');
    if (val) val.classList.add('hidden');
    const fx = document.getElementById('smCrashFx');
    if (fx) {
      fx.classList.add('hidden');
      fx.classList.remove('is-fading');
    }
    const btn = document.getElementById('smFocusPlay');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '▶ Play';
    }
  }

  function closeSmFocus() {
    stopSmPlane();
    const overlay = document.getElementById('smFocusOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (chartFocus) {
      try { chartFocus.destroy(); } catch (e) {}
      chartFocus = null;
    }
    focusMode = null;
  }

  function buildFocusSeries(metric) {
    const series = (lastSummary && lastSummary.series) || [];
    return series.map(s => {
      if (metric === 'trips') return { label: s.label, value: s.trips };
      if (metric === 'qty') return { label: s.label, value: Math.round(s.totalLt) };
      return { label: s.label, value: Math.round(s.avgLt) };
    });
  }

  function openSmFocus(mode) {
    if (!lastSummary || !lastSummary.series || !lastSummary.series.length) {
      alert('Run summary first.');
      return;
    }
    focusMode = mode;
    stopSmPlane();
    const overlay = document.getElementById('smFocusOverlay');
    const title = document.getElementById('smFocusTitle');
    const sub = document.getElementById('smFocusSub');
    const metricSel = document.getElementById('smFocusMetric');
    const metricLab = document.getElementById('smFocusMetricLabel');
    const host = document.getElementById('smPlaneHost');
    const scroll = document.getElementById('smFocusScroll');
    if (!overlay) return;

    if (mode === 'avg') {
      if (title) title.textContent = 'Avg Loading Qty over range';
      if (sub) sub.textContent = 'Sleigh follows avg path · crash if below 10,000';
      if (metricSel) {
        metricSel.style.display = 'none';
        metricSel.value = 'avg';
      }
      if (metricLab) metricLab.style.display = 'none';
    } else {
      if (title) title.textContent = 'Trips & Loading Qty';
      if (sub) sub.textContent = 'Pick path · Avg < 10,000 · Total LT < 1,000,000 · Trips < 100';
      if (metricSel) metricSel.style.display = '';
      if (metricLab) metricLab.style.display = '';
    }

    const n = lastSummary.series.length;
    if (host) host.style.minWidth = Math.max(900, n * 56) + 'px';
    if (scroll) scroll.scrollLeft = 0;

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    setTimeout(function () {
      renderFocusChart();
      const playBtn = document.getElementById('smFocusPlay');
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.textContent = '▶ Play';
      }
    }, 40);
  }

  function renderFocusChart() {
    const el = document.getElementById('smFocusCanvas');
    if (!el) return;
    if (chartFocus) {
      try { chartFocus.destroy(); } catch (e) {}
      chartFocus = null;
    }
    const metricSel = document.getElementById('smFocusMetric');
    const metric = focusMode === 'avg' ? 'avg' : (metricSel ? metricSel.value : 'avg');
    const data = buildFocusSeries(metric);
    const labels = data.map(d => d.label);
    const values = data.map(d => d.value);
    const threshold = SM_THRESH[metric] || SM_THRESH.avg;
    const color = metric === 'trips' ? '#546E7A' : (metric === 'qty' ? '#E60012' : '#2E7D32');

    const targetLine = labels.map(() => threshold);
    chartFocus = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: metric === 'trips' ? 'Trips' : (metric === 'qty' ? 'Total Loading Qty' : 'Avg Loading Qty'),
            data: values,
            borderColor: color,
            backgroundColor: color + '22',
            fill: true,
            tension: 0.25,
            pointRadius: 5,
            pointBackgroundColor: values.map(v => v < threshold ? '#E60012' : color)
          },
          {
            label: 'Crash line',
            data: targetLine,
            borderColor: '#B71C1C',
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString()
            }
          }
        },
        scales: {
          y: {
            beginAtZero: metric === 'trips' || metric === 'qty',
            suggestedMax: Math.max.apply(null, values.concat([threshold])) * 1.08 + 1,
            grid: { color: '#F0F0F0' },
            ticks: { callback: v => Number(v).toLocaleString() }
          },
          x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }
        }
      },
      plugins: [valueLabelPlugin('smFocusVals')]
    });
  }

  function playSmPlane() {
    const overlay = document.getElementById('smFocusOverlay');
    if (!overlay || overlay.classList.contains('hidden')) {
      alert('Expand the chart first, then press Play.');
      return;
    }
    if (!chartFocus) {
      renderFocusChart();
    }
    const chart = chartFocus;
    const plane = document.getElementById('smPlane');
    const host = document.getElementById('smPlaneHost');
    const scroll = document.getElementById('smFocusScroll');
    const valuePop = document.getElementById('smPlaneValue');
    const btn = document.getElementById('smFocusPlay');
    const metricSel = document.getElementById('smFocusMetric');
    const metric = focusMode === 'avg' ? 'avg' : (metricSel ? metricSel.value : 'avg');
    const threshold = SM_THRESH[metric] || SM_THRESH.avg;
    if (!chart || !plane || !host) return;

    stopSmPlane();
    planeAnim.running = true;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) {
      stopSmPlane();
      return;
    }
    const rates = chart.data.datasets[0].data || [];
    const labels = chart.data.labels || [];
    const points = [];
    meta.data.forEach(function (pt, i) {
      if (!pt || pt.skip) return;
      const v = rates[i];
      if (v == null || isNaN(v)) return;
      points.push({
        x: pt.x,
        y: pt.y,
        rate: Number(v),
        i: i,
        label: labels[i] != null ? String(labels[i]) : ''
      });
    });
    if (points.length < 2) {
      stopSmPlane();
      return;
    }

    plane.classList.remove('is-crash');
    plane.classList.add('is-flying');
    plane.style.opacity = '1';
    const planeImg = plane.querySelector('.sm-plane-img');
    if (planeImg) {
      const src = planeImg.getAttribute('data-src') || planeImg.getAttribute('src') || 'Sleigh.gif';
      planeImg.setAttribute('data-src', src.split('?')[0]);
      planeImg.setAttribute('src', src.split('?')[0] + '?t=' + Date.now());
    }
    if (valuePop) valuePop.classList.add('hidden');

    const SPEED_DOWN = 0.18;
    const SPEED_UP = 0.08;
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const climbing = b.y < a.y - 0.5;
      segs.push({ a: a, b: b, dist: dist, dur: dist / (climbing ? SPEED_UP : SPEED_DOWN), climbing: climbing });
    }

    function place(x, y, rot) {
      plane.style.transform = 'translate(' + x + 'px, ' + y + 'px) rotate(' + rot + 'deg)';
      // keep sleigh in view when chart is wide
      if (scroll && host) {
        const left = scroll.scrollLeft;
        const viewW = scroll.clientWidth;
        const margin = 80;
        if (x - margin < left) scroll.scrollLeft = Math.max(0, x - margin);
        else if (x + margin > left + viewW) scroll.scrollLeft = x + margin - viewW;
      }
    }

    function showValueAt(pt) {
      if (!valuePop || !pt) return;
      const unit = metric === 'trips' ? '' : '';
      valuePop.textContent = (pt.label ? pt.label + ' · ' : '') + Number(pt.rate).toLocaleString() + unit;
      valuePop.style.left = pt.x + 'px';
      valuePop.style.top = pt.y + 'px';
      valuePop.classList.remove('hidden');
    }

    function showCrash(x, y, rate) {
      const fx = document.getElementById('smCrashFx');
      const img = document.getElementById('smCrashImg');
      const cap = document.getElementById('smCrashCaption');
      if (img) {
        const src = (img.getAttribute('src') || 'SleighCrash.gif').split('?')[0];
        img.setAttribute('src', src + '?t=' + Date.now());
      }
      if (cap) {
        const name = metric === 'trips' ? 'Trips' : (metric === 'qty' ? 'Total Loading Qty' : 'Avg Loading Qty');
        cap.textContent = name + ' ' + Number(rate).toLocaleString() + ' · below ' + Number(threshold).toLocaleString();
      }
      if (fx) {
        fx.classList.remove('hidden', 'is-fading');
        fx.setAttribute('aria-hidden', 'false');
      }
    }

    function hideCrash(callback) {
      const fx = document.getElementById('smCrashFx');
      if (!fx) {
        if (callback) callback();
        return;
      }
      fx.classList.add('is-fading');
      setTimeout(function () {
        fx.classList.add('hidden');
        fx.classList.remove('is-fading');
        fx.setAttribute('aria-hidden', 'true');
        if (callback) callback();
      }, 600);
    }

    function finish() {
      plane.classList.remove('is-flying', 'is-crash');
      place(points[points.length - 1].x - 22, points[points.length - 1].y - 22, 0);
      plane.style.opacity = '1';
      hideCrash();
      showValueAt(points[points.length - 1]);
      if (btn) { btn.disabled = false; btn.textContent = '▶ Replay'; }
      planeAnim.running = false;
    }

    showValueAt(points[0]);
    place(points[0].x - 22, points[0].y - 22, -12);

    let segIdx = 0;
    let segElapsed = 0;
    let lastTs = null;
    let lastAnnouncedIdx = points[0].i;
    const crashedPoints = {}; // one full crash per data point below threshold

    // Also crash at start if first point is already below threshold
    if (points[0].rate < threshold) {
      crashedPoints[points[0].i] = true;
    }

    function runCrashHold(x, y, angle, resumeSeg, resumeLocal, rate) {
      // Pause path completely until crash GIF finishes
      plane.classList.remove('is-flying');
      plane.classList.add('is-crash');
      place(x - 22, y - 22, angle + 25);
      showCrash(x, y, rate);
      const holdStart = performance.now();
      // Hold long enough for full crash GIF, then fade, then continue
      const GIF_DURATION_MS = 4100;
      function hold(ts) {
        if (!planeAnim.running) return;
        const ht = ts - holdStart;
        const wobble = Math.sin(ht / 120) * 4;
        place(x - 22 + wobble, y - 22 + Math.min(10, ht / 250), angle + 25 + wobble);
        if (ht < GIF_DURATION_MS) {
          planeAnim.raf = requestAnimationFrame(hold);
          return;
        }
        // GIF finished — only then hide and continue path
        hideCrash(function () {
          if (!planeAnim.running) return;
          plane.classList.remove('is-crash');
          plane.classList.add('is-flying');
          plane.style.opacity = '1';
          // Advance past this point so we don't re-trigger on same spot
          if (resumeLocal >= 0.98) {
            segIdx = resumeSeg + 1;
            segElapsed = 0;
          } else {
            segIdx = resumeSeg;
            segElapsed = resumeLocal * (segs[resumeSeg] ? segs[resumeSeg].dur : 0);
          }
          lastTs = null;
          planeAnim.raf = requestAnimationFrame(frame);
        });
      }
      planeAnim.raf = requestAnimationFrame(hold);
    }

    function frame(ts) {
      if (!planeAnim.running) return;
      if (lastTs == null) lastTs = ts;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;
      if (segIdx >= segs.length) {
        finish();
        return;
      }
      const seg = segs[segIdx];
      segElapsed += dt;
      const local = Math.min(1, segElapsed / seg.dur);
      const x = seg.a.x + (seg.b.x - seg.a.x) * local;
      const y = seg.a.y + (seg.b.y - seg.a.y) * local;
      const rate = seg.a.rate + (seg.b.rate - seg.a.rate) * local;
      const angle = Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180 / Math.PI;

      if (local >= 0.98 && seg.b.i !== lastAnnouncedIdx) {
        lastAnnouncedIdx = seg.b.i;
        showValueAt(seg.b);
      }

      // Crash at each point that falls below threshold (again if another low point ahead)
      if (local >= 0.98 && seg.b.rate < threshold && !crashedPoints[seg.b.i]) {
        crashedPoints[seg.b.i] = true;
        runCrashHold(x, y, angle, segIdx, local, seg.b.rate);
        return;
      }

      place(x - 22, y - 22, angle);

      if (segElapsed >= seg.dur) {
        segIdx += 1;
        segElapsed = 0;
      }
      planeAnim.raf = requestAnimationFrame(frame);
    }

    // If first point is below threshold, play crash before moving
    if (points[0].rate < threshold) {
      runCrashHold(points[0].x, points[0].y, -12, 0, 0, points[0].rate);
      // frame will start after crash hold finishes
      // but we need to not double-start frame below
    } else {
      planeAnim.raf = requestAnimationFrame(frame);
    }
    return; // prevent double rAF at end

  }


  function getRows() {
    const state = FileProcessor.getState();
    if (!state.storedSlu || !state.storedColMap) return [];
    return normalizeRows(state.storedSlu, state.storedColMap);
  }

  function run() {
    const rows = getRows();
    if (!rows.length) {
      const body = document.getElementById('smTableBody');
      if (body) body.innerHTML = '<tr><td colspan="11">Upload a Mainline file first.</td></tr>';
      return;
    }
    const typeSel = document.getElementById('smRouteType');
    if (typeSel) routeType = typeSel.value || 'ALL';

    const fresh = getRows();
    populateSelectors(fresh);
    const summary = buildSummary(fresh);

    const info = document.getElementById('smInfo');
    if (info) {
      info.innerHTML = '<span class="badge">' + periodLabel(summary.from) +
        '</span> to <span class="badge">' + periodLabel(summary.to) +
        '</span> · Target <strong>' + Math.round(summary.target).toLocaleString() +
        '</strong> · ' + routeType;
    }

    lastSummary = summary;
    renderMetrics(summary);
    renderWhy(summary);
    renderTable(summary);
    renderContrib(summary);
    renderPerDateContrib(summary);
    renderCharts(summary);
  }

  function onFileReady() {
    const rows = getRows();
    if (!rows.length) return;
    populateSelectors(rows);
  }

  function setPeriodMode(mode) {
    periodMode = mode;
    document.querySelectorAll('[data-sm-period]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-sm-period') === mode);
    });
    populateSelectors(getRows());
    run();
  }

  function switchToTab() {
    closeSmFocus();
    ['lrDayPanel', 'lrWeeklyPanel', 'lrRoutePanel', 'lrTopDragPanel', 'lrMissTargetPanel'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const panel = document.getElementById('lrSummaryPanel');
    if (panel) panel.classList.remove('hidden');
    document.querySelectorAll('.lr-main-tab').forEach(function (b) { b.classList.remove('active'); });
    const btn = document.getElementById('tabLrSummary');
    if (btn) btn.classList.add('active');
    onFileReady();
    setTimeout(function () { run(); }, 0);
  }

  function init() {
    const btn = document.getElementById('tabLrSummary');
    if (btn) btn.addEventListener('click', switchToTab);

    document.querySelectorAll('[data-sm-period]').forEach(b => {
      b.addEventListener('click', () => setPeriodMode(b.getAttribute('data-sm-period') || 'day'));
    });

    const runBtn = document.getElementById('btnSmRun');
    if (runBtn) runBtn.addEventListener('click', run);

    const typeSel = document.getElementById('smRouteType');
    if (typeSel) {
      typeSel.addEventListener('change', () => {
        routeType = typeSel.value || 'ALL';
        run();
      });
    }

    const expAvg = document.getElementById('smExpandAvg');
    if (expAvg && !expAvg._smBound) {
      expAvg._smBound = true;
      expAvg.addEventListener('click', function () { openSmFocus('avg'); });
    }
    const expTrips = document.getElementById('smExpandTrips');
    if (expTrips && !expTrips._smBound) {
      expTrips._smBound = true;
      expTrips.addEventListener('click', function () { openSmFocus('trips'); });
    }
    const playBtn = document.getElementById('smFocusPlay');
    if (playBtn && !playBtn._smBound) {
      playBtn._smBound = true;
      playBtn.addEventListener('click', function () {
        if (planeAnim.running) {
          stopSmPlane();
          playBtn.textContent = '▶ Play';
          return;
        }
        playSmPlane();
      });
    }
    const closeBtn = document.getElementById('smFocusClose');
    if (closeBtn && !closeBtn._smBound) {
      closeBtn._smBound = true;
      closeBtn.addEventListener('click', closeSmFocus);
    }
    const overlay = document.getElementById('smFocusOverlay');
    if (overlay && !overlay._smBound) {
      overlay._smBound = true;
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeSmFocus();
      });
    }
    const metricSel = document.getElementById('smFocusMetric');
    if (metricSel && !metricSel._smBound) {
      metricSel._smBound = true;
      metricSel.addEventListener('change', function () {
        stopSmPlane();
        renderFocusChart();
      });
    }
  }

  return { init: init, onFileReady: onFileReady, run: run, switchToTab: switchToTab };
})();

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
  }

  return { init: init, onFileReady: onFileReady, run: run, switchToTab: switchToTab };
})();

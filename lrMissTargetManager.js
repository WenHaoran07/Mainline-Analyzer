/* ==========================================================================
   MODULE: LOADING RATE — UNDER TARGET / LOWEST DROP ROUTES
   Based on PER ROUTE SUMMARY sheet · click row for trip detail
   ========================================================================== */
const LrMissTargetManager = (() => {
  let sortMode = 'ach-asc';
  let sectionFilter = 'ALL';
  let searchRoute = '';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(Number(n)).toLocaleString();
  }

  function pct(n) {
    if (n == null || isNaN(n)) return '—';
    const v = Number(n);
    return ((v <= 1.5 ? v * 100 : v)).toFixed(0) + '%';
  }

  function getSummary() {
    try {
      const st = FileProcessor.getState() || {};
      return Array.isArray(st.storedRouteSummary) ? st.storedRouteSummary : [];
    } catch (e) {
      console.error('[LR MissTarget] getState failed', e);
      return [];
    }
  }

  function buildList() {
    const all = getSummary();
    let list = all.filter(r => r && (r.underTarget === true || (r.achievement != null && Number(r.achievement) < 1)));
    if (!list.length && all.length) {
      list = all.filter(r => r && (r.target != null || r.latestMonth != null));
    }
    if (sectionFilter === 'VISMIN') {
      list = list.filter(r => String(r.section || '').toUpperCase() === 'VISMIN');
    } else if (sectionFilter === 'LUZON') {
      list = list.filter(r => String(r.section || '').toUpperCase() === 'LUZON');
    }
    const q = String(searchRoute || '').trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        String(r.route || '').toLowerCase().includes(q) ||
        String(r.group || '').toLowerCase().includes(q)
      );
    }
    list = list.slice();
    if (sortMode === 'drop-asc') {
      list.sort((a, b) => (a.dailyDrop == null ? 999999 : a.dailyDrop) - (b.dailyDrop == null ? 999999 : b.dailyDrop));
    } else if (sortMode === 'month-drop') {
      list.sort((a, b) => (a.monthDiff == null ? 999999 : a.monthDiff) - (b.monthDiff == null ? 999999 : b.monthDiff));
    } else {
      list.sort((a, b) => (a.achievement == null ? 9 : a.achievement) - (b.achievement == null ? 9 : b.achievement));
    }
    return { list: list, totalParsed: all.length };
  }

  function render() {
    const body = document.getElementById('mtTableBody');
    const count = document.getElementById('mtTableCount');
    if (!body) {
      console.warn('[LR MissTarget] mtTableBody not found in DOM');
      return;
    }
    const built = buildList();
    const list = built.list;
    console.log('[LR MissTarget] render', list.length, 'of', built.totalParsed, 'filter', sectionFilter, sortMode);

    if (!list.length) {
      const msg = built.totalParsed === 0
        ? 'PER ROUTE SUMMARY was not found or could not be parsed. Re-upload the file.'
        : 'No routes match the current filters.';
      body.innerHTML = '<tr><td colspan="10">' + msg + '</td></tr>';
      if (count) count.textContent = '0 routes (parsed: ' + built.totalParsed + ')';
      return;
    }

    // Group rows: Section then Group (WVA, BSL, 460-Luzon, ...)
    const sectionOrder = ['VISMIN', 'LUZON', 'UNKNOWN'];
    const bySec = {};
    list.forEach(function (r) {
      const s = String(r.section || 'UNKNOWN').toUpperCase();
      if (!bySec[s]) bySec[s] = {};
      const g = r.group || '—';
      if (!bySec[s][g]) bySec[s][g] = [];
      bySec[s][g].push(r);
    });

    let html = '';
    let rank = 0;
    sectionOrder.forEach(function (sec) {
      if (!bySec[sec]) return;
      const groups = Object.keys(bySec[sec]);
      html += '<tr class="mt-group-header"><td colspan="10">' +
        (sec === 'VISMIN' ? 'VISMIN Average Loading Qty' : (sec === 'LUZON' ? 'LUZON Average Loading Qty' : sec)) +
        ' — ' + groups.reduce(function (n, g) { return n + bySec[sec][g].length; }, 0) + ' under-target route(s)</td></tr>';
      groups.forEach(function (g) {
        html += '<tr class="td-dc-header"><td colspan="10">Group: ' + escapeHtml(g) + '</td></tr>';
        bySec[sec][g].forEach(function (r) {
          rank += 1;
          const achCls = r.achievement != null && r.achievement < 0.9 ? 'neg' : '';
          const dropCls = r.dailyDrop != null && r.dailyDrop < 0 ? 'neg' : (r.dailyDrop > 0 ? 'pos' : '');
          const monthCls = r.monthDiff != null && r.monthDiff < 0 ? 'neg' : '';
          const secBadge = sec === 'VISMIN'
            ? '<span class="td-badge td-badge-vismin">VisMin</span>'
            : (sec === 'LUZON' ? '<span class="td-badge td-badge-luzon">Luzon</span>' : '');
          const monthCh = r.monthDiff == null ? '—' : ((r.monthDiff > 0 ? '+' : '') + fmt(r.monthDiff));
          const dayCh = r.dailyDrop == null ? '—' : ((r.dailyDrop > 0 ? '+' : '') + fmt(r.dailyDrop));
          html += '<tr class="mt-route-row" data-route="' + escapeHtml(r.route) + '" style="cursor:pointer;" title="Click for trip details">' +
            '<td class="td-rank">' + rank + '</td>' +
            '<td><strong>' + escapeHtml(r.route) + '</strong> ' + secBadge + '</td>' +
            '<td>' + escapeHtml(r.group || '—') + '</td>' +
            '<td>' + escapeHtml(r.section || '—') + '</td>' +
            '<td style="text-align:right">' + fmt(r.prevMonth) + '</td>' +
            '<td style="text-align:right">' + fmt(r.latestMonth) + '</td>' +
            '<td style="text-align:right">' + fmt(r.target) + '</td>' +
            '<td style="text-align:right" class="' + achCls + '">' + pct(r.achievement) + '</td>' +
            '<td style="text-align:right" class="' + monthCls + '">' + monthCh + '</td>' +
            '<td style="text-align:right" class="' + dropCls + '">' + dayCh + '</td>' +
            '</tr>';
        });
      });
    });

    body.innerHTML = html;
    if (count) count.textContent = list.length + ' route(s) · sheet parsed: ' + built.totalParsed;

    body.querySelectorAll('.mt-route-row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        const route = tr.getAttribute('data-route');
        if (typeof LrRouteDetail !== 'undefined') {
          LrRouteDetail.open(route, null, null, 'Under-target route detail');
        }
      });
    });
  }

  function run() {
    const sortSel = document.getElementById('mtSort');
    if (sortSel) sortMode = sortSel.value || 'ach-asc';
    const secSel = document.getElementById('mtSection');
    if (secSel) sectionFilter = secSel.value || 'ALL';
    const search = document.getElementById('mtSearchRoute');
    if (search) searchRoute = search.value || '';
    render();
  }

  function onFileReady() {
    run();
  }

  function switchToTab() {
    ['lrDayPanel', 'lrWeeklyPanel', 'lrRoutePanel', 'lrTopDragPanel'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const panel = document.getElementById('lrMissTargetPanel');
    if (panel) panel.classList.remove('hidden');
    document.querySelectorAll('.lr-main-tab').forEach(function (b) { b.classList.remove('active'); });
    const btn = document.getElementById('tabLrMissTarget');
    if (btn) btn.classList.add('active');
    // Defer render so panel is visible in layout first
    setTimeout(function () { run(); }, 0);
  }

  function init() {
    const btn = document.getElementById('tabLrMissTarget');
    if (btn) btn.addEventListener('click', switchToTab);
    const sortSel = document.getElementById('mtSort');
    if (sortSel) sortSel.addEventListener('change', run);
    const secSel = document.getElementById('mtSection');
    if (secSel) secSel.addEventListener('change', run);
    const search = document.getElementById('mtSearchRoute');
    if (search) search.addEventListener('input', run);
    const clear = document.getElementById('mtClearFilters');
    if (clear) {
      clear.addEventListener('click', function () {
        searchRoute = '';
        sectionFilter = 'ALL';
        sortMode = 'ach-asc';
        if (search) search.value = '';
        if (secSel) secSel.value = 'ALL';
        if (sortSel) sortSel.value = 'ach-asc';
        run();
      });
    }
  }

  return { init: init, onFileReady: onFileReady, run: run, switchToTab: switchToTab };
})();

/* Shared route trip detail overlay (Top Drag + Under Target) */
const LrRouteDetail = (() => {
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toYmd(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 100000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      const d = new Date(ms);
      const p = function (n) { return String(n).padStart(2, '0'); };
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    }
    const s = String(v).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  function open(route, periodA, periodB, title) {
    const overlay = document.getElementById('lrRouteDetailOverlay');
    const titleEl = document.getElementById('lrRouteDetailTitle');
    const subEl = document.getElementById('lrRouteDetailSub');
    const body = document.getElementById('lrRouteDetailBody');
    if (!overlay || !body) return;

    let pA = periodA;
    let pB = periodB;
    if (!pA || !pB) {
      const a = document.getElementById('tdPeriodA');
      const b = document.getElementById('tdPeriodB');
      pA = pA || (a ? a.value : null);
      pB = pB || (b ? b.value : null);
    }

    const state = FileProcessor.getState();
    const col = state.storedColMap;
    const storedSlu = state.storedSlu || [];
    let prevTrips = [];
    let latestTrips = [];

    function inPeriod(dateKey, period) {
      if (!dateKey || !period) return false;
      if (period.length === 10) return dateKey === period;
      if (/^\d{4}-W\d{2}$/i.test(period)) {
        const parts = dateKey.split('-').map(Number);
        const y = parts[0], m = parts[1], d = parts[2];
        const dt = new Date(Date.UTC(y, m - 1, d));
        const day = dt.getUTCDay() || 7;
        dt.setUTCDate(dt.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
        const wk = dt.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
        return wk.toUpperCase() === period.toUpperCase();
      }
      if (/^\d{4}-\d{2}$/.test(period)) return dateKey.slice(0, 7) === period;
      return false;
    }

    function mapTrip(r, side) {
      return {
        side: side,
        taskId: r[col.shipmentNo] != null ? r[col.shipmentNo] : '—',
        date: toYmd(r[col.date]) || '—',
        routeOwner: r[col.routeOwner] != null ? r[col.routeOwner] : '—',
        plate: r[col.plateNo] != null ? r[col.plateNo] : '—',
        carrier: r[col.vehicleCarrier] != null ? r[col.vehicleCarrier] : (r[col.carrier] != null ? r[col.carrier] : '—'),
        actualSize: (col.actualSize && r[col.actualSize] != null) ? r[col.actualSize] : '—',
        lt: parseFloat(r[col.lt]) || 0,
        branch: r[col.branch] != null ? r[col.branch] : '—'
      };
    }

    if (pA && pB && col) {
      const all = storedSlu.filter(function (r) { return String(r[col.route] || '').trim() === route; });
      prevTrips = all.filter(function (r) { return inPeriod(toYmd(r[col.date]), pA); }).map(function (r) { return mapTrip(r, 'Previous'); });
      latestTrips = all.filter(function (r) { return inPeriod(toYmd(r[col.date]), pB); }).map(function (r) { return mapTrip(r, 'Latest'); });
    } else if (col) {
      latestTrips = storedSlu.filter(function (r) { return String(r[col.route] || '').trim() === route; })
        .slice(0, 80).map(function (r) { return mapTrip(r, 'All'); });
    }

    const rows = latestTrips.concat(prevTrips);
    rows.sort(function (a, b) {
      if (a.side !== b.side) return a.side === 'Latest' ? -1 : 1;
      return b.lt - a.lt;
    });

    function sumLt(list) { return list.reduce(function (s, t) { return s + (t.lt || 0); }, 0); }
    const prevTripsN = prevTrips.length;
    const latestTripsN = latestTrips.length;
    const prevTotal = sumLt(prevTrips);
    const latestTotal = sumLt(latestTrips);
    const prevAvg = prevTripsN ? prevTotal / prevTripsN : 0;
    const latestAvg = latestTripsN ? latestTotal / latestTripsN : 0;
    const summary = (state.storedRouteSummary || []).find(function (r) { return r.route === route; });
    const targetAvg = summary && summary.target != null ? summary.target : null;
    const achRate = summary && summary.achievement != null ? summary.achievement : (targetAvg && latestAvg ? latestAvg / targetAvg : null);

    if (titleEl) titleEl.textContent = (title || 'Route detail') + ': ' + route;
    if (subEl) {
      subEl.textContent = 'Previous trips: ' + prevTripsN + ' · Latest trips: ' + latestTripsN +
        (targetAvg != null ? (' · Target avg LT: ' + Math.round(targetAvg).toLocaleString()) : '');
    }

    const summaryEl = document.getElementById('lrRouteDetailSummary');
    if (summaryEl) {
      const dTrips = latestTripsN - prevTripsN;
      const dAvg = latestAvg - prevAvg;
      const dTotal = latestTotal - prevTotal;
      const cls = function (v) { return v > 0 ? 'pos' : (v < 0 ? 'neg' : ''); };
      const sign = function (v) { return (v > 0 ? '+' : '') + Math.round(v).toLocaleString(); };
      const vsTarget = targetAvg != null && latestAvg
        ? (latestAvg >= targetAvg
            ? '<span class="pos">At/above target</span>'
            : '<span class="neg">' + Math.round(targetAvg - latestAvg).toLocaleString() + ' below target</span>')
        : '—';
      summaryEl.innerHTML =
        '<div class="rc-compare-metrics" style="margin:0 0 10px;">' +
        '<div class="rc-compare-col"><h3>Previous</h3><div class="rc-date-sub">' + escapeHtml(pA || '—') + '</div>' +
        '<div class="rc-metric-grid">' +
        '<div class="rc-metric-box rc-box-trips"><div class="lab">Trips</div><div class="val">' + prevTripsN + '</div></div>' +
        '<div class="rc-metric-box rc-box-avg"><div class="lab">Avg LT</div><div class="val">' + Math.round(prevAvg).toLocaleString() + '</div></div>' +
        '<div class="rc-metric-box rc-box-qty"><div class="lab">Total LT</div><div class="val">' + Math.round(prevTotal).toLocaleString() + '</div></div>' +
        '<div class="rc-metric-box rc-box-pkgs"><div class="lab">Target Avg</div><div class="val">' + (targetAvg != null ? Math.round(targetAvg).toLocaleString() : '—') + '</div></div>' +
        '</div></div>' +
        '<div class="rc-compare-col latest"><h3>Latest</h3><div class="rc-date-sub">' + escapeHtml(pB || '—') + '</div>' +
        '<div class="rc-metric-grid">' +
        '<div class="rc-metric-box rc-box-trips"><div class="lab">Trips</div><div class="val">' + latestTripsN + '</div><div class="delta ' + cls(dTrips) + '">' + sign(dTrips) + '</div></div>' +
        '<div class="rc-metric-box rc-box-avg"><div class="lab">Avg LT</div><div class="val">' + Math.round(latestAvg).toLocaleString() + '</div><div class="delta ' + cls(dAvg) + '">' + sign(dAvg) + '</div></div>' +
        '<div class="rc-metric-box rc-box-qty"><div class="lab">Total LT</div><div class="val">' + Math.round(latestTotal).toLocaleString() + '</div><div class="delta ' + cls(dTotal) + '">' + sign(dTotal) + '</div></div>' +
        '<div class="rc-metric-box rc-box-pkgs"><div class="lab">vs Target</div><div class="val" style="font-size:0.95rem">' + (achRate != null ? Math.round((achRate <= 1.5 ? achRate * 100 : achRate)) + '%' : '—') + '</div><div class="delta">' + vsTarget + '</div></div>' +
        '</div></div></div>';
    }

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9">No trip-level rows found for this route in the selected periods.</td></tr>';
    } else {
      body.innerHTML = rows.map(function (t) {
        return '<tr>' +
          '<td>' + escapeHtml(t.side) + '</td>' +
          '<td>' + escapeHtml(t.date) + '</td>' +
          '<td>' + escapeHtml(t.taskId) + '</td>' +
          '<td>' + escapeHtml(t.plate) + '</td>' +
          '<td>' + escapeHtml(t.routeOwner) + '</td>' +
          '<td>' + escapeHtml(t.carrier) + '</td>' +
          '<td>' + escapeHtml(t.actualSize) + '</td>' +
          '<td>' + escapeHtml(t.branch) + '</td>' +
          '<td style="text-align:right;font-weight:700">' + Math.round(t.lt).toLocaleString() + '</td>' +
          '</tr>';
      }).join('');
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function close() {
    const overlay = document.getElementById('lrRouteDetailOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function init() {
    const closeBtn = document.getElementById('lrRouteDetailClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    const overlay = document.getElementById('lrRouteDetailOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  return { init: init, open: open, close: close };
})();

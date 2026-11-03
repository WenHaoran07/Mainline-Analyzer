/* ==========================================================================
   MODULE: MTT DELAY PERIOD SUMMARY (Overall Monthly / Weekly Summary)
   Under Delay Reason → Overall Monthly Summary · Overall Weekly Summary
   Luzon / VisMin separated · region (BSL, NCR, SLU, CDO…) → problem → task detail
   ========================================================================== */
const MttDelayMonthlySummary = (() => {
  /** active panel: null | 'monthly' | 'weekSummary' */
  let activePanel = null;
  let monthKey = '';
  let weekKeySel = ''; // MttUtils weekKey e.g. 2026-W44
  let selectedSide = null;
  let selectedRegion = null;
  let selectedProblem = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function monthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[m - 1] + ' ' + y;
  }

  function weekKeyOf(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.weekKey)
      ? MttUtils.weekKey(dateKey)
      : null;
  }
  function weekNumOf(dateKey) {
    return (typeof MttUtils !== 'undefined' && MttUtils.excelWeekNum)
      ? MttUtils.excelWeekNum(dateKey)
      : null;
  }

  function weekLabel(wk) {
    if (!wk) return '';
    // prefer date range from data
    const rows = getRows().filter(r => weekKeyOf(r.dateKey) === wk);
    const dates = [...new Set(rows.map(r => r.dateKey).filter(Boolean))].sort();
    const wn = dates.length ? weekNumOf(dates[0]) : null;
    const range = dates.length
      ? (dates[0] + (dates.length > 1 ? ' → ' + dates[dates.length - 1] : ''))
      : '';
    return (wn != null ? ('WK ' + wn) : wk) + (range ? (' · ' + range) : '');
  }

  function getRows() {
    if (typeof MttDelayReason === 'undefined') return [];
    const st = MttDelayReason.getState() || {};
    return st.delayRows || [];
  }

  function availableMonths() {
    const set = new Set();
    getRows().forEach(r => {
      if (r.dateKey) set.add(String(r.dateKey).slice(0, 7));
    });
    return [...set].sort();
  }

  function availableWeeks() {
    const map = new Map(); // weekKey → sample date
    getRows().forEach(r => {
      if (!r.dateKey) return;
      const wk = weekKeyOf(r.dateKey);
      if (!wk) return;
      if (!map.has(wk) || r.dateKey < map.get(wk)) map.set(wk, r.dateKey);
    });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(e => ({ key: e[0], sample: e[1], label: weekLabel(e[0]) }));
  }

  function buildRouteRegionMap() {
    const map = new Map();
    const byTask = new Map();
    if (typeof MttFileProcessor === 'undefined') return { map, byTask };
    const rows = (MttFileProcessor.getState().storedRows || []);
    rows.forEach(function (tr) {
      const reg = String(tr.region || '').trim();
      if (!reg || reg === '(blank)') return;
      const route = String(tr.route || '').trim();
      if (route && !map.has(route)) map.set(route, reg);
      if (route) {
        const compact = route.replace(/\s+/g, '');
        if (!map.has(compact)) map.set(compact, reg);
      }
      const tid = String(tr.taskId || '').trim();
      if (tid && !byTask.has(tid)) byTask.set(tid, reg);
    });
    return { map, byTask };
  }

  function regionKey(r, routeMap, taskMap) {
    const explicit = String(r.region || '').trim();
    if (explicit && explicit !== '(blank)') return explicit.toUpperCase();

    const tid = String(r.taskId || '').trim();
    if (tid && taskMap && taskMap.has(tid)) return String(taskMap.get(tid)).toUpperCase();

    const route = String(r.route || '').trim();
    if (route && routeMap) {
      if (routeMap.has(route)) return String(routeMap.get(route)).toUpperCase();
      const compact = route.replace(/\s+/g, '');
      if (routeMap.has(compact)) return String(routeMap.get(compact)).toUpperCase();
    }

    const probe = (route || String(r.taskName || '') || '').toUpperCase();
    const known = ['NCR', 'NEL', 'NELU', 'NWL', 'BSL', 'SLU', 'CDO', 'DVO', 'WVA', 'CLB', 'VSA'];
    for (let i = 0; i < known.length; i++) {
      const k = known[i];
      if (probe === k || probe.indexOf(k + '-') === 0 || probe.indexOf(k + ' ') === 0) {
        return k === 'NELU' ? 'NEL' : k;
      }
    }
    return '(blank)';
  }

  function periodLabel() {
    if (activePanel === 'weekSummary') return weekLabel(weekKeySel) || weekKeySel || '—';
    return monthLabel(monthKey) || monthKey || '—';
  }

  function rowsForPeriod() {
    const all = getRows().filter(r => r.hasIssue && r.dateKey);
    if (activePanel === 'weekSummary') {
      if (!weekKeySel) return [];
      return all.filter(r => weekKeyOf(r.dateKey) === weekKeySel);
    }
    if (!monthKey) return [];
    return all.filter(r => String(r.dateKey).slice(0, 7) === monthKey);
  }

  function sideRows(side) {
    return rowsForPeriod().filter(r => r.side === side);
  }

  function regionStats(list, routeMap, taskMap) {
    const map = new Map();
    list.forEach(r => {
      const k = regionKey(r, routeMap, taskMap);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()]
      .map(([region, rows]) => ({
        region,
        count: rows.length,
        routes: new Set(rows.map(x => x.route || '')).size,
        rows
      }))
      .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
  }

  function problemStats(list) {
    const map = new Map();
    list.forEach(r => {
      const title = (r.problem || r.category || 'Unspecified delay').trim() || 'Unspecified delay';
      if (!map.has(title)) map.set(title, []);
      map.get(title).push(r);
    });
    return [...map.entries()]
      .map(([problem, rows]) => ({
        problem,
        count: rows.length,
        category: rows[0] && rows[0].category ? rows[0].category : '',
        rows
      }))
      .sort((a, b) => b.count - a.count || a.problem.localeCompare(b.problem));
  }

  function ensurePeriod() {
    if (activePanel === 'weekSummary') {
      const weeks = availableWeeks();
      if (!weeks.length) { weekKeySel = ''; return; }
      if (!weekKeySel || !weeks.some(w => w.key === weekKeySel)) {
        weekKeySel = weeks[weeks.length - 1].key;
      }
    } else {
      const months = availableMonths();
      if (!months.length) { monthKey = ''; return; }
      if (!monthKey || months.indexOf(monthKey) < 0) {
        monthKey = months[months.length - 1];
      }
    }
  }

  function syncPeriodSelects() {
    const monthSel = document.getElementById('selectDelayMonth');
    if (monthSel) {
      const months = availableMonths();
      monthSel.innerHTML = months.length
        ? months.map(m => '<option value="' + m + '">' + monthLabel(m) + '</option>').join('')
        : '<option value="">No delay months</option>';
      if (monthKey) monthSel.value = monthKey;
    }
    const weekSel = document.getElementById('selectDelayWeekSummary');
    if (weekSel) {
      const weeks = availableWeeks();
      weekSel.innerHTML = weeks.length
        ? weeks.map(w => '<option value="' + w.key + '">' + esc(w.label) + '</option>').join('')
        : '<option value="">No delay weeks</option>';
      if (weekKeySel) weekSel.value = weekKeySel;
    }
  }

  function renderSideColumn(side, label, routeMap, taskMap) {
    const list = sideRows(side);
    const regions = regionStats(list, routeMap, taskMap);
    const total = list.length;
    let h = '<div class="dms-side-card dms-side-' + side.toLowerCase() + '">';
    h += '<div class="dms-side-head">';
    h += '<h3>' + esc(label) + '</h3>';
    h += '<span class="dms-side-count">' + total + ' delay' + (total === 1 ? '' : 's') + '</span>';
    h += '</div>';
    if (!regions.length) {
      h += '<p class="section-note">No delay reasons for this side in ' + esc(periodLabel()) + '.</p>';
      h += '</div>';
      return h;
    }
    h += '<p class="section-note"></p>';
    h += '<div class="table-scroll dms-region-scroll"><table class="dms-table">';
    h += '<thead><tr><th>Region</th><th>Delays</th><th>Share</th><th>Routes</th></tr></thead><tbody>';
    regions.forEach(function (reg) {
      const share = total ? ((reg.count / total) * 100).toFixed(1) + '%' : '—';
      const active = selectedSide === side && selectedRegion === reg.region ? ' is-active' : '';
      h += '<tr class="dms-region-row' + active + '" data-dms-side="' + side + '" data-dms-region="' + esc(reg.region) + '">';
      h += '<td class="dms-region-name"><strong>' + esc(reg.region) + '</strong></td>';
      h += '<td class="dms-num">' + reg.count + '</td>';
      h += '<td>' + share + '</td>';
      h += '<td class="dms-num">' + reg.routes + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function renderDrill(routeMap, taskMap) {
    if (!selectedSide || !selectedRegion) {
      return '<div class="dms-drill dms-drill-empty">' +
        '<p class="section-note"></p></div>';
    }
    const list = sideRows(selectedSide).filter(function (r) {
      return regionKey(r, routeMap, taskMap) === selectedRegion;
    });
    const problems = problemStats(list);
    let h = '<div class="dms-drill">';
    h += '<div class="dms-drill-head">';
    h += '<div><span class="dms-crumb">' + esc(selectedSide) + '</span>';
    h += '<h3>' + esc(selectedRegion) + '</h3>';
    h += '<p class="section-note">' + list.length + ' delay' + (list.length === 1 ? '' : 's') +
      ' · ' + problems.length + ' distinct reason' + (problems.length === 1 ? '' : 's') +
      ' · ' + esc(periodLabel()) + '</p></div>';
    h += '<button type="button" class="wm-mini-btn" id="dmsClearRegion">Clear</button>';
    h += '</div>';

    if (!problems.length) {
      h += '<p class="section-note">No grouped problems.</p></div>';
      return h;
    }

    h += '<div class="dms-problem-list">';
    problems.forEach(function (p) {
      const open = selectedProblem === p.problem;
      h += '<div class="dms-problem-card' + (open ? ' is-open' : '') + '">';
      h += '<button type="button" class="dms-problem-toggle" data-dms-problem="' + esc(p.problem) + '">';
      h += '<span class="dms-problem-title">' + esc(p.problem) + '</span>';
      if (p.category) h += '<span class="dms-problem-cat">' + esc(p.category) + '</span>';
      h += '<span class="dms-problem-count">' + p.count + ' delay' + (p.count === 1 ? '' : 's') + '</span>';
      h += '<span class="dms-problem-chev">' + (open ? '▾' : '▸') + '</span>';
      h += '</button>';

      if (open) {
        h += '<div class="dms-problem-detail">';
        h += '<div class="table-scroll"><table class="dms-table dms-detail-table"><thead><tr>';
        h += '<th>Date</th><th>Task ID</th><th>Plate</th><th>Route</th><th>Trucker</th>';
        h += '<th>Category</th><th>Problem Encountered</th><th>Remarks</th>';
        h += '</tr></thead><tbody>';
        p.rows.slice().sort(function (a, b) {
          return String(a.dateKey).localeCompare(String(b.dateKey)) ||
            String(a.taskId).localeCompare(String(b.taskId));
        }).forEach(function (r) {
          h += '<tr>';
          h += '<td>' + esc(r.dateKey) + '</td>';
          h += '<td><code>' + esc(r.taskId || '—') + '</code></td>';
          h += '<td>' + esc(r.plate || '—') + '</td>';
          h += '<td>' + esc(r.route || '—') + '</td>';
          h += '<td>' + esc(r.trucker || '—') + '</td>';
          h += '<td>' + esc(r.category || '—') + '</td>';
          h += '<td class="dms-problem-cell">' + esc(r.problem || '—') + '</td>';
          h += '<td class="dms-remarks">' + esc(r.remarks || '—') + '</td>';
          h += '</tr>';
        });
        h += '</tbody></table></div></div>';
      }
      h += '</div>';
    });
    h += '</div></div>';
    return h;
  }

  function hostId() {
    return activePanel === 'weekSummary' ? 'peWeekSummaryView' : 'peMonthlyView';
  }

  function render() {
    const host = document.getElementById(hostId());
    if (!host || !activePanel) return;
    ensurePeriod();
    syncPeriodSelects();

    if (!getRows().length) {
      host.innerHTML = '<p class="section-note">No Delay Reason data loaded.</p>';
      return;
    }
    const hasPeriod = activePanel === 'weekSummary' ? !!weekKeySel : !!monthKey;
    if (!hasPeriod) {
      host.innerHTML = '<p class="section-note">No ' +
        (activePanel === 'weekSummary' ? 'weeks' : 'months') +
        ' with delay issues found.</p>';
      return;
    }

    const all = rowsForPeriod();
    const title = activePanel === 'weekSummary' ? 'Overall Weekly Summary' : 'Overall Monthly Summary';
    let h = '<div class="dms-wrap">';
    h += '<div class="dms-intro">';
    h += '<strong>' + esc(title) + ' · ' + esc(periodLabel()) + '</strong> · ';
    h += all.length + ' total delay issue' + (all.length === 1 ? '' : 's') ;
    h += '</div>';
    h += '<div class="dms-columns">';
    const maps = buildRouteRegionMap();
    h += renderSideColumn('LUZON', 'Luzon Route', maps.map, maps.byTask);
    h += renderSideColumn('VISMIN', 'VisMin Route', maps.map, maps.byTask);
    h += '</div>';
    h += renderDrill(maps.map, maps.byTask);
    h += '</div>';
    host.innerHTML = h;
    bindDrill();
  }

  function bindDrill() {
    document.querySelectorAll('.dms-region-row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        const side = tr.getAttribute('data-dms-side');
        const region = tr.getAttribute('data-dms-region');
        if (selectedSide === side && selectedRegion === region) {
          selectedSide = null;
          selectedRegion = null;
          selectedProblem = null;
        } else {
          selectedSide = side;
          selectedRegion = region;
          selectedProblem = null;
        }
        render();
        const drill = document.querySelector('.dms-drill');
        if (drill) drill.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    document.querySelectorAll('.dms-problem-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const prob = btn.getAttribute('data-dms-problem');
        selectedProblem = (selectedProblem === prob) ? null : prob;
        render();
      });
    });
    const clear = document.getElementById('dmsClearRegion');
    if (clear) {
      clear.addEventListener('click', function () {
        selectedSide = null;
        selectedRegion = null;
        selectedProblem = null;
        render();
      });
    }
  }

  function setFilterVisibility(panel) {
    const dateWrap = document.getElementById('peDateFilterWrap');
    const weekWrap = document.getElementById('peWeekFilterWrap');
    const monthWrap = document.getElementById('peMonthFilterWrap');
    const weekSumWrap = document.getElementById('peWeekSummaryFilterWrap');
    if (dateWrap) dateWrap.style.display = (panel === 'monthly' || panel === 'weekSummary' || panel === 'weekly') ? 'none' : '';
    if (weekWrap) weekWrap.style.display = panel === 'weekly' ? '' : 'none';
    if (monthWrap) monthWrap.style.display = panel === 'monthly' ? '' : 'none';
    if (weekSumWrap) weekSumWrap.style.display = panel === 'weekSummary' ? '' : 'none';
  }

  function showView(panel) {
    // panel: 'monthly' | 'weekSummary' | null/false
    activePanel = panel || null;
    selectedSide = null;
    selectedRegion = null;
    selectedProblem = null;

    const monthly = document.getElementById('peMonthlyView');
    const weekSum = document.getElementById('peWeekSummaryView');
    if (monthly) monthly.classList.toggle('hidden', activePanel !== 'monthly');
    if (weekSum) weekSum.classList.toggle('hidden', activePanel !== 'weekSummary');

    if (activePanel === 'monthly' || activePanel === 'weekSummary') {
      setFilterVisibility(activePanel);
      render();
    }
  }

  function onDataReady() {
    monthKey = '';
    weekKeySel = '';
    selectedSide = null;
    selectedRegion = null;
    selectedProblem = null;
    ensurePeriod();
    syncPeriodSelects();
    if (activePanel === 'monthly' || activePanel === 'weekSummary') render();
  }

  function init() {
    const monthSel = document.getElementById('selectDelayMonth');
    if (monthSel) {
      monthSel.addEventListener('change', function () {
        monthKey = monthSel.value || '';
        selectedSide = null;
        selectedRegion = null;
        selectedProblem = null;
        if (activePanel === 'monthly') render();
      });
    }
    const weekSel = document.getElementById('selectDelayWeekSummary');
    if (weekSel) {
      weekSel.addEventListener('change', function () {
        weekKeySel = weekSel.value || '';
        selectedSide = null;
        selectedRegion = null;
        selectedProblem = null;
        if (activePanel === 'weekSummary') render();
      });
    }
  }

  return { init, render, onDataReady, showView };
})();
